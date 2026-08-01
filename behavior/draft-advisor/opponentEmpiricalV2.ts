import { FantasyPosition } from "../../types"
import {
  walkRecordedDraftAdvisorContexts,
} from "./completedDraftReplay"
import type { RecordedCompletedDraftReplay } from "./completedDraftReplay"
import {
  marginalScarcityPositionResiduals,
  opponentPositionProbabilities,
  opponentPositionSources,
} from "./opponentModel"
import { leagueFormatFor } from "./replayMetrics"
import type { PositionProbability } from "./types"

type ForecastPosition =
  | FantasyPosition.QUARTERBACK
  | FantasyPosition.RUNNING_BACK
  | FantasyPosition.WIDE_RECEIVER
  | FantasyPosition.TIGHT_END

export const EMPIRICAL_OPPONENT_POSITIONS: ForecastPosition[] = [
  FantasyPosition.QUARTERBACK,
  FantasyPosition.RUNNING_BACK,
  FantasyPosition.WIDE_RECEIVER,
  FantasyPosition.TIGHT_END,
]

const BASE_FEATURE_NAMES = [
  "intercept",
  "adp_log_probability",
  "direct_need_log_probability",
  "recent_run_log_probability",
  "draft_phase",
] as const

const FORMAT_FEATURE_NAMES = [
  ...BASE_FEATURE_NAMES,
  "marginal_scarcity_residual",
] as const

export const EMPIRICAL_OPPONENT_CONFIG = {
  iterations: 350,
  learningRate: 0.06,
  l2: 0.03,
  probabilitySmoothing: 0.01,
  logitClamp: 30,
} as const

/**
 * Offline-only challenger settings.  This model deliberately starts at the
 * frozen-v1 distribution and can only apply a small, class-balanced logit
 * correction.  These values are fixed design constraints, not selected from
 * the static-window holdouts.
 */
export const EMPIRICAL_BALANCED_RESIDUAL_CONFIG = {
  iterations: 250,
  learningRate: 0.035,
  l2: 0.05,
  /** Each class's learned correction is restricted to this logit interval. */
  residualLogitBound: 0.55,
  /** Fixed offline correction strength; retained explicitly for auditability. */
  correctionStrength: 1,
  probabilityFloor: 1e-6,
} as const

export interface EmpiricalOpponentExample {
  fixtureId: string
  leagueFormat: string
  ppr: boolean
  overallPick: number
  rosterIndex: number
  label: ForecastPosition
  baselineProbabilities: number[]
  adpLogProbabilities: number[]
  directNeedLogProbabilities: number[]
  recentRunLogProbabilities: number[]
  marginalScarcityResiduals: number[]
  draftPhase: number
}

/**
 * The deterministic feature surface shared by offline corpus construction and
 * the immutable learned-base shadow.  It intentionally contains no label or
 * fixture identity, so producing it at a live boundary cannot train or leak.
 */
export interface EmpiricalOpponentFeatureSurface {
  adpLogProbabilities: number[]
  directNeedLogProbabilities: number[]
  recentRunLogProbabilities: number[]
  marginalScarcityResiduals: number[]
  draftPhase: number
}

export type EmpiricalDraftPhaseProvenance =
  | { kind: "known_total"; totalDraftPicks: number }
  | { kind: "fallback_context_horizon"; totalDraftPicks: number }

export interface EmpiricalCorpusFixture {
  fixtureId: string
  leagueFormat: string
  ppr: boolean
  exampleCount: number
}

export interface SkippedEmpiricalCorpusFixture {
  fixtureId: string
  reason: string
}

export interface EmpiricalOpponentCorpus {
  examples: EmpiricalOpponentExample[]
  fixtures: EmpiricalCorpusFixture[]
  skippedFixtures: SkippedEmpiricalCorpusFixture[]
  preparationMs: number
}

const positionIndex = (position: FantasyPosition): number => {
  const index = EMPIRICAL_OPPONENT_POSITIONS.indexOf(position as ForecastPosition)
  if (index < 0) throw new Error(`Unsupported empirical opponent position ${position}`)
  return index
}

const probabilityFor = (
  probabilities: PositionProbability[],
  position: ForecastPosition,
): number => probabilities.find(item => item.position === position)?.probability || 0

const finiteProbability = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0

const smoothedLogProbability = (value: number): number =>
  Math.log(finiteProbability(value) + EMPIRICAL_OPPONENT_CONFIG.probabilitySmoothing)

const normalized = (values: number[]): number[] => {
  const total = values.reduce((sum, value) => sum + finiteProbability(value), 0)
  return total > 0
    ? values.map(value => finiteProbability(value) / total)
    : values.map(() => 1 / values.length)
}

export const empiricalDraftPhaseProvenance = (
  context: Parameters<typeof opponentPositionSources>[0],
  totalDraftPicks = context.totalDraftPicks,
): EmpiricalDraftPhaseProvenance => {
  if (Number.isInteger(totalDraftPicks) && (totalDraftPicks || 0) > 1) {
    return { kind: "known_total", totalDraftPicks: totalDraftPicks! }
  }
  return {
    kind: "fallback_context_horizon",
    totalDraftPicks: Math.max(context.currentPick,
      ...context.upcomingSlots.map(slot => slot.overallPick)),
  }
}

export const createEmpiricalOpponentFeatureSurface = (
  context: Parameters<typeof opponentPositionSources>[0],
  overallPick: number,
  rosterIndex: number,
  totalDraftPicks = context.totalDraftPicks,
): EmpiricalOpponentFeatureSurface => {
  const sources = opponentPositionSources(context, overallPick, rosterIndex)
  const scarcity = new Map(marginalScarcityPositionResiduals(context)
    .map(item => [item.position, item.residual]))
  const phase = empiricalDraftPhaseProvenance(context, totalDraftPicks)
  const phaseDenominator = Math.max(1, phase.totalDraftPicks - 1)
  return {
    adpLogProbabilities: EMPIRICAL_OPPONENT_POSITIONS.map(position =>
      smoothedLogProbability(probabilityFor(sources.adp, position))),
    directNeedLogProbabilities: EMPIRICAL_OPPONENT_POSITIONS.map(position =>
      smoothedLogProbability(probabilityFor(sources.directNeed, position))),
    recentRunLogProbabilities: EMPIRICAL_OPPONENT_POSITIONS.map(position =>
      smoothedLogProbability(probabilityFor(sources.recentRun, position))),
    marginalScarcityResiduals: EMPIRICAL_OPPONENT_POSITIONS.map(position => {
      const value = scarcity.get(position) || 0
      return Number.isFinite(value) ? Math.max(-0.75, Math.min(0.75, value)) : 0
    }),
    draftPhase: Math.max(0, Math.min(1, (overallPick - 1) / phaseDenominator)),
  }
}

/**
 * One single-pass canonical corpus per completed fixture. Every feature is
 * derived before the labelled selection is applied by the replay walker.
 */
export const prepareEmpiricalOpponentCorpus = (
  fixtures: RecordedCompletedDraftReplay[],
): EmpiricalOpponentCorpus => {
  const startedAt = performance.now()
  const examples: EmpiricalOpponentExample[] = []
  const summaries: EmpiricalCorpusFixture[] = []
  const skippedFixtures: SkippedEmpiricalCorpusFixture[] = []
  const fixtureIds = new Set<string>()

  fixtures.forEach(fixture => {
    if (fixtureIds.has(fixture.id)) throw new Error(`Duplicate empirical fixture ${fixture.id}`)
    fixtureIds.add(fixture.id)
    const beforeCount = examples.length
    const playerById = new Map(fixture.players.map(player => [player.id, player]))

    walkRecordedDraftAdvisorContexts(fixture, ({ recordedPick, context }) => {
      if (recordedPick.rosterIndex === fixture.targetRosterIndex
        || !recordedPick.playerId
        || recordedPick.advisorEligible === false) return
      const player = playerById.get(recordedPick.playerId)
      if (!player || EMPIRICAL_OPPONENT_POSITIONS.indexOf(player.position) < 0) return

      const baseline = opponentPositionProbabilities(
        context,
        recordedPick.overallPick,
        recordedPick.rosterIndex,
        "combined",
      )
      examples.push({
        fixtureId: fixture.id,
        leagueFormat: leagueFormatFor(fixture),
        ppr: fixture.settings.ppr,
        overallPick: recordedPick.overallPick,
        rosterIndex: recordedPick.rosterIndex,
        label: player.position,
        baselineProbabilities: normalized(EMPIRICAL_OPPONENT_POSITIONS.map(position =>
          probabilityFor(baseline, position))),
        ...createEmpiricalOpponentFeatureSurface(
          context,
          recordedPick.overallPick,
          recordedPick.rosterIndex,
          fixture.actualPicks.length,
        ),
      })
    })

    const exampleCount = examples.length - beforeCount
    if (exampleCount === 0) {
      skippedFixtures.push({
        fixtureId: fixture.id,
        reason: "no mapped eligible QB/RB/WR/TE opponent picks",
      })
      return
    }
    summaries.push({
      fixtureId: fixture.id,
      leagueFormat: leagueFormatFor(fixture),
      ppr: fixture.settings.ppr,
      exampleCount,
    })
  })

  return {
    examples,
    fixtures: summaries.sort((left, right) => left.fixtureId.localeCompare(right.fixtureId)),
    skippedFixtures,
    preparationMs: performance.now() - startedAt,
  }
}

type FeatureSet = "base" | "format"

export interface EmpiricalSoftmaxModel {
  featureSet: FeatureSet
  featureNames: string[]
  coefficients: number[][]
  diagnostics: {
    examples: number
    initialLoss: number
    finalLoss: number
    iterations: number
    runtimeMs: number
  }
}

const featureNamesFor = (featureSet: FeatureSet): string[] =>
  [...(featureSet === "format" ? FORMAT_FEATURE_NAMES : BASE_FEATURE_NAMES)]

const featureValues = (
  example: EmpiricalOpponentFeatureSurface,
  position: number,
  featureSet: FeatureSet,
): number[] => [
  1,
  example.adpLogProbabilities[position],
  example.directNeedLogProbabilities[position],
  example.recentRunLogProbabilities[position],
  example.draftPhase,
  ...(featureSet === "format" ? [example.marginalScarcityResiduals[position]] : []),
].map(value => Number.isFinite(value) ? value : 0)

const stableSoftmax = (logits: number[]): number[] => {
  const safe = logits.map(value => Number.isFinite(value)
    ? Math.max(-EMPIRICAL_OPPONENT_CONFIG.logitClamp,
      Math.min(EMPIRICAL_OPPONENT_CONFIG.logitClamp, value)) : 0)
  const maximum = Math.max(...safe)
  const exponents = safe.map(value => Math.exp(value - maximum))
  const total = exponents.reduce((sum, value) => sum + value, 0)
  return total > 0 && Number.isFinite(total)
    ? exponents.map(value => value / total)
    : exponents.map(() => 1 / exponents.length)
}

export const predictEmpiricalOpponentProbabilities = (
  model: EmpiricalSoftmaxModel,
  example: EmpiricalOpponentFeatureSurface,
): number[] => stableSoftmax(EMPIRICAL_OPPONENT_POSITIONS.map((_, position) =>
  model.coefficients[position].reduce((sum, coefficient, featureIndex) =>
    sum + coefficient * featureValues(example, position, model.featureSet)[featureIndex], 0)))

export interface EmpiricalBalancedResidualModel {
  featureNames: string[]
  coefficients: number[][]
  classWeights: number[]
  correctionStrength?: number
  classBalanceExponent?: number
  diagnostics: {
    examples: number
    initialLoss: number
    finalLoss: number
    iterations: number
    runtimeMs: number
  }
}

/** Fixed-family candidate parameters for offline nested validation only. */
export interface EmpiricalBalancedResidualFitConfig {
  correctionStrength: number
  /** 0 is unweighted, 0.5 is square-root balance, 1 is inverse-frequency. */
  classBalanceExponent: number
}

const residualFeatureValues = (
  example: EmpiricalOpponentFeatureSurface,
  position: number,
): number[] => featureValues(example, position, "base")

const boundedResidual = (value: number): number => Number.isFinite(value)
  ? Math.max(-EMPIRICAL_BALANCED_RESIDUAL_CONFIG.residualLogitBound,
    Math.min(EMPIRICAL_BALANCED_RESIDUAL_CONFIG.residualLogitBound, value))
  : 0

/**
 * Applies a bounded residual in log-probability space.  A zero residual is
 * exactly the supplied frozen distribution; the bound limits the relative
 * odds between any two positions to exp(2 * residualLogitBound).
 */
export const applyBoundedOpponentResidual = (
  baselineProbabilities: number[],
  residualLogits: number[],
  correctionStrength: number = EMPIRICAL_BALANCED_RESIDUAL_CONFIG.correctionStrength,
): number[] => {
  if (baselineProbabilities.length !== EMPIRICAL_OPPONENT_POSITIONS.length
    || residualLogits.length !== EMPIRICAL_OPPONENT_POSITIONS.length) {
    throw new Error("Bounded opponent residual requires one value per position")
  }
  if (!Number.isFinite(correctionStrength) || correctionStrength < 0 || correctionStrength > 1) {
    throw new Error("Bounded opponent residual has invalid correction strength")
  }
  const baseline = normalized(baselineProbabilities)
  return stableSoftmax(baseline.map((probability, position) =>
    Math.log(Math.max(EMPIRICAL_BALANCED_RESIDUAL_CONFIG.probabilityFloor, probability))
      + correctionStrength * boundedResidual(residualLogits[position])))
}

const residualLogitsFor = (
  model: Pick<EmpiricalBalancedResidualModel, "coefficients">,
  example: EmpiricalOpponentFeatureSurface,
): number[] => EMPIRICAL_OPPONENT_POSITIONS.map((_, position) => boundedResidual(
  model.coefficients[position].reduce((sum, coefficient, featureIndex) => sum
    + coefficient * residualFeatureValues(example, position)[featureIndex], 0)))

export const predictEmpiricalBalancedResidualProbabilities = (
  model: EmpiricalBalancedResidualModel,
  baselineProbabilities: number[],
  example: EmpiricalOpponentFeatureSurface,
): number[] => applyBoundedOpponentResidual(
  baselineProbabilities,
  residualLogitsFor(model, example),
  model.correctionStrength,
)

const classBalancedWeights = (
  examples: EmpiricalOpponentExample[],
  classBalanceExponent: number,
): number[] => {
  const counts = EMPIRICAL_OPPONENT_POSITIONS.map(position => examples.filter(example =>
    example.label === position).length)
  const raw = counts.map(count => count > 0
    ? examples.length / (EMPIRICAL_OPPONENT_POSITIONS.length * count) : 0)
  if (raw.some(weight => weight === 0)) return raw
  const powered = raw.map(weight => weight ** classBalanceExponent)
  const meanWeight = examples.reduce((sum, example) => sum + powered[positionIndex(example.label)], 0)
    / examples.length
  return powered.map(weight => weight / meanWeight)
}

const residualLoss = (
  examples: EmpiricalOpponentExample[],
  coefficients: number[][],
  classWeights: number[],
  correctionStrength: number,
): number => {
  if (!examples.length) return 0
  const dataLoss = examples.reduce((sum, example) => {
    const label = positionIndex(example.label)
    const probabilities = applyBoundedOpponentResidual(
      example.baselineProbabilities,
      EMPIRICAL_OPPONENT_POSITIONS.map((_, position) => coefficients[position]
        .reduce((score, coefficient, featureIndex) => score
          + coefficient * residualFeatureValues(example, position)[featureIndex], 0)),
      correctionStrength,
    )
    return sum - classWeights[label] * Math.log(Math.max(1e-12, probabilities[label]))
  }, 0) / examples.length
  const penalty = coefficients.reduce((sum, row) => sum + row.slice(1)
    .reduce((rowSum, value) => rowSum + value * value, 0), 0)
  return dataLoss + EMPIRICAL_BALANCED_RESIDUAL_CONFIG.l2 * penalty / 2
}

/**
 * Fixed-order, class-balanced residual fit.  Unlike the free softmax model,
 * its zero point is frozen v1 and output odds remain explicitly bounded.
 */
export const fitEmpiricalBalancedOpponentResidual = (
  examples: EmpiricalOpponentExample[],
  config: Partial<EmpiricalBalancedResidualFitConfig> = {},
): EmpiricalBalancedResidualModel => {
  if (!examples.length) throw new Error("Cannot fit balanced opponent residual without examples")
  const startedAt = performance.now()
  const candidate = {
    correctionStrength: config.correctionStrength
      ?? EMPIRICAL_BALANCED_RESIDUAL_CONFIG.correctionStrength,
    classBalanceExponent: config.classBalanceExponent ?? 1,
  }
  if (!Number.isFinite(candidate.correctionStrength) || candidate.correctionStrength <= 0
    || candidate.correctionStrength > 1 || !Number.isFinite(candidate.classBalanceExponent)
    || candidate.classBalanceExponent < 0 || candidate.classBalanceExponent > 1) {
    throw new Error("Balanced opponent residual has invalid fit config")
  }
  const names = featureNamesFor("base")
  const weights = classBalancedWeights(examples, candidate.classBalanceExponent)
  if (weights.some(weight => weight === 0)) {
    throw new Error("Balanced opponent residual requires every forecast position in training")
  }
  const coefficients = EMPIRICAL_OPPONENT_POSITIONS.map(() => names.map(() => 0))
  const initialLoss = residualLoss(examples, coefficients, weights, candidate.correctionStrength)
  const trainingFeatures = examples.map(example => EMPIRICAL_OPPONENT_POSITIONS.map((_, position) =>
    residualFeatureValues(example, position)))

  for (let iteration = 0; iteration < EMPIRICAL_BALANCED_RESIDUAL_CONFIG.iterations; iteration += 1) {
    const gradients = EMPIRICAL_OPPONENT_POSITIONS.map(() => names.map(() => 0))
    examples.forEach((example, exampleIndex) => {
      const label = positionIndex(example.label)
      const rawResiduals = EMPIRICAL_OPPONENT_POSITIONS.map((_, position) => coefficients[position]
        .reduce((sum, coefficient, featureIndex) => sum
          + coefficient * trainingFeatures[exampleIndex][position][featureIndex], 0))
      const probabilities = applyBoundedOpponentResidual(
        example.baselineProbabilities, rawResiduals, candidate.correctionStrength,
      )
      EMPIRICAL_OPPONENT_POSITIONS.forEach((_, position) => {
        // A hard clamp has zero derivative outside its safe range.  This is
        // intentional: fitting cannot escape the published correction bound.
        if (Math.abs(rawResiduals[position]) >= EMPIRICAL_BALANCED_RESIDUAL_CONFIG.residualLogitBound) return
        const error = candidate.correctionStrength * weights[label]
          * (probabilities[position] - (position === label ? 1 : 0))
        trainingFeatures[exampleIndex][position].forEach((value, featureIndex) => {
          gradients[position][featureIndex] += error * value
        })
      })
    })
    coefficients.forEach((row, position) => row.forEach((coefficient, featureIndex) => {
      const regularization = featureIndex === 0 ? 0
        : EMPIRICAL_BALANCED_RESIDUAL_CONFIG.l2 * coefficient
      const gradient = gradients[position][featureIndex] / examples.length + regularization
      const updated = coefficient - EMPIRICAL_BALANCED_RESIDUAL_CONFIG.learningRate * gradient
      coefficients[position][featureIndex] = Number.isFinite(updated) ? updated : 0
    }))
  }
  return {
    featureNames: names,
    coefficients,
    classWeights: weights,
    correctionStrength: candidate.correctionStrength,
    classBalanceExponent: candidate.classBalanceExponent,
    diagnostics: {
      examples: examples.length,
      initialLoss,
      finalLoss: residualLoss(examples, coefficients, weights, candidate.correctionStrength),
      iterations: EMPIRICAL_BALANCED_RESIDUAL_CONFIG.iterations,
      runtimeMs: performance.now() - startedAt,
    },
  }
}

const regularizedLoss = (
  examples: EmpiricalOpponentExample[],
  coefficients: number[][],
  featureSet: FeatureSet,
): number => {
  if (examples.length === 0) return 0
  const dataLoss = examples.reduce((sum, example) => {
    const probabilities = stableSoftmax(EMPIRICAL_OPPONENT_POSITIONS.map((_, position) =>
      coefficients[position].reduce((score, coefficient, featureIndex) => score
        + coefficient * featureValues(example, position, featureSet)[featureIndex], 0)))
    return sum - Math.log(Math.max(1e-12, probabilities[positionIndex(example.label)]))
  }, 0) / examples.length
  const penalty = coefficients.reduce((sum, row) => sum + row.slice(1)
    .reduce((rowSum, value) => rowSum + value * value, 0), 0)
  return dataLoss + EMPIRICAL_OPPONENT_CONFIG.l2 * penalty / 2
}

/** Fixed-order full-batch gradient descent; no data-dependent hyperparameter search. */
export const fitEmpiricalOpponentSoftmax = (
  examples: EmpiricalOpponentExample[],
  featureSet: FeatureSet,
): EmpiricalSoftmaxModel => {
  if (examples.length === 0) throw new Error("Cannot fit empirical opponent model without examples")
  const startedAt = performance.now()
  const names = featureNamesFor(featureSet)
  const coefficients = EMPIRICAL_OPPONENT_POSITIONS.map(() => names.map(() => 0))
  const initialLoss = regularizedLoss(examples, coefficients, featureSet)
  // Precompute the fixed feature surface once per fit. This avoids allocating
  // several short vectors per class/example/iteration while retaining the
  // exact deterministic row and position order.
  const trainingFeatures = examples.map(example =>
    EMPIRICAL_OPPONENT_POSITIONS.map((_, position) =>
      featureValues(example, position, featureSet)))

  for (let iteration = 0; iteration < EMPIRICAL_OPPONENT_CONFIG.iterations; iteration += 1) {
    const gradients = EMPIRICAL_OPPONENT_POSITIONS.map(() => names.map(() => 0))
    examples.forEach((example, exampleIndex) => {
      const probabilities = stableSoftmax(EMPIRICAL_OPPONENT_POSITIONS.map((_, position) =>
        coefficients[position].reduce((sum, coefficient, featureIndex) =>
          sum + coefficient * trainingFeatures[exampleIndex][position][featureIndex], 0)))
      EMPIRICAL_OPPONENT_POSITIONS.forEach((_, position) => {
        const error = probabilities[position] - (position === positionIndex(example.label) ? 1 : 0)
        trainingFeatures[exampleIndex][position].forEach((value, featureIndex) => {
          gradients[position][featureIndex] += error * value
        })
      })
    })
    coefficients.forEach((row, position) => row.forEach((coefficient, featureIndex) => {
      const regularization = featureIndex === 0 ? 0
        : EMPIRICAL_OPPONENT_CONFIG.l2 * coefficient
      const gradient = gradients[position][featureIndex] / examples.length + regularization
      const updated = coefficient - EMPIRICAL_OPPONENT_CONFIG.learningRate * gradient
      coefficients[position][featureIndex] = Number.isFinite(updated) ? updated : 0
    }))
  }
  return {
    featureSet,
    featureNames: names,
    coefficients,
    diagnostics: {
      examples: examples.length,
      initialLoss,
      finalLoss: regularizedLoss(examples, coefficients, featureSet),
      iterations: EMPIRICAL_OPPONENT_CONFIG.iterations,
      runtimeMs: performance.now() - startedAt,
    },
  }
}

export interface EmpiricalPositionMetrics {
  evaluatedPicks: number
  positionBrierScore: number
  topPositionAccuracy: number
  logLoss: number
}

const emptyMetrics = (): EmpiricalPositionMetrics => ({
  evaluatedPicks: 0,
  positionBrierScore: 0,
  topPositionAccuracy: 0,
  logLoss: 0,
})

export const scoreEmpiricalPositionProbabilities = (
  examples: EmpiricalOpponentExample[],
  probabilitiesFor: (example: EmpiricalOpponentExample) => number[],
): EmpiricalPositionMetrics => {
  if (!examples.length) return emptyMetrics()
  const totals = examples.reduce((result, example) => {
    const probabilities = normalized(probabilitiesFor(example))
    const labelIndex = positionIndex(example.label)
    const topIndex = probabilities.reduce((best, value, index) =>
      value > probabilities[best] ? index : best, 0)
    return {
      brier: result.brier + probabilities.reduce((sum, probability, index) => sum
        + (probability - (index === labelIndex ? 1 : 0)) ** 2, 0),
      accuracy: result.accuracy + (topIndex === labelIndex ? 1 : 0),
      loss: result.loss - Math.log(Math.max(1e-12, probabilities[labelIndex])),
    }
  }, { brier: 0, accuracy: 0, loss: 0 })
  return {
    evaluatedPicks: examples.length,
    positionBrierScore: totals.brier / examples.length,
    topPositionAccuracy: totals.accuracy / examples.length,
    logLoss: totals.loss / examples.length,
  }
}

export interface EmpiricalMetricDeltas {
  positionBrierScore: number
  topPositionAccuracy: number
  logLoss: number
}

export const empiricalMetricDeltas = (
  baseline: EmpiricalPositionMetrics,
  challenger: EmpiricalPositionMetrics,
): EmpiricalMetricDeltas => ({
  positionBrierScore: challenger.positionBrierScore - baseline.positionBrierScore,
  topPositionAccuracy: challenger.topPositionAccuracy - baseline.topPositionAccuracy,
  logLoss: challenger.logLoss - baseline.logLoss,
})

export interface EmpiricalModelMetrics {
  frozenV1: EmpiricalPositionMetrics
  learnedBase: EmpiricalPositionMetrics
  learnedFormat: EmpiricalPositionMetrics
}

export interface EmpiricalOpponentFold {
  holdoutFixtureId: string
  holdoutLeagueFormat: string
  trainingFixtureIds: string[]
  trainingExampleCount: number
  holdoutExampleCount: number
  baseModel: EmpiricalSoftmaxModel
  formatModel: EmpiricalSoftmaxModel
  holdout: EmpiricalModelMetrics
  baseVsFrozen: EmpiricalMetricDeltas
  formatVsFrozen: EmpiricalMetricDeltas
  formatVsBase: EmpiricalMetricDeltas
  inferenceEvaluationMs: number
}

export interface EmpiricalGroupMetrics {
  fixtureId?: string
  leagueFormat: string
  exampleCount: number
  metrics: EmpiricalModelMetrics
}

export interface EmpiricalShadowDecision {
  eligibleForShadowValidation: boolean
  thresholds: {
    brierRegression: number
    accuracyRegression: number
    logLossRegression: number
    minimumMaterialBrierOrLogLossImprovement: number
    minimumMaterialAccuracyImprovement: number
  }
  failedGates: string[]
}

export interface EmpiricalOpponentPromotion {
  promoted: false
  shadowValidationRequired: true
  learnedBase: EmpiricalShadowDecision
  learnedFormat: EmpiricalShadowDecision & {
    incrementalFoldWins: {
      brier: number
      logLoss: number
      required: number
      total: number
    }
  }
}

export interface EmpiricalOpponentEvaluation {
  corpus: EmpiricalOpponentCorpus
  folds: EmpiricalOpponentFold[]
  aggregateHoldout: EmpiricalModelMetrics
  aggregateDeltas: {
    baseVsFrozen: EmpiricalMetricDeltas
    formatVsFrozen: EmpiricalMetricDeltas
    formatVsBase: EmpiricalMetricDeltas
  }
  byFixture: EmpiricalGroupMetrics[]
  byLeagueFormat: EmpiricalGroupMetrics[]
  fullDataModels: {
    baseModel: EmpiricalSoftmaxModel
    formatModel: EmpiricalSoftmaxModel
  }
  runtimes: {
    corpusPreparationMs: number
    foldFitMs: number
    foldInferenceEvaluationMs: number
    fullDataFitMs: number
    totalMs: number
  }
  runWindowEvaluation: {
    evaluated: false
    reason: string
  }
  promotion: EmpiricalOpponentPromotion
}

const metricsFor = (
  examples: EmpiricalOpponentExample[],
  baseModel: EmpiricalSoftmaxModel,
  formatModel: EmpiricalSoftmaxModel,
): EmpiricalModelMetrics => ({
  frozenV1: scoreEmpiricalPositionProbabilities(examples, example => example.baselineProbabilities),
  learnedBase: scoreEmpiricalPositionProbabilities(examples, example =>
    predictEmpiricalOpponentProbabilities(baseModel, example)),
  learnedFormat: scoreEmpiricalPositionProbabilities(examples, example =>
    predictEmpiricalOpponentProbabilities(formatModel, example)),
})

const byGroup = (
  folds: EmpiricalOpponentFold[],
  grouping: (fold: EmpiricalOpponentFold) => string,
): EmpiricalGroupMetrics[] => {
  const groups = new Map<string, EmpiricalOpponentFold[]>()
  folds.forEach(fold => {
    const key = grouping(fold)
    const current = groups.get(key) || []
    current.push(fold)
    groups.set(key, current)
  })
  return Array.from(groups.entries()).map(([leagueFormat, group]) => {
    const examples = group.reduce((sum, fold) => sum + fold.holdoutExampleCount, 0)
    const weighted = (model: keyof EmpiricalModelMetrics, metric: keyof EmpiricalPositionMetrics): number =>
      examples ? group.reduce((sum, fold) => sum
        + fold.holdout[model][metric] * fold.holdoutExampleCount, 0) / examples : 0
    const aggregate = (model: keyof EmpiricalModelMetrics): EmpiricalPositionMetrics => ({
      evaluatedPicks: examples,
      positionBrierScore: weighted(model, "positionBrierScore"),
      topPositionAccuracy: weighted(model, "topPositionAccuracy"),
      logLoss: weighted(model, "logLoss"),
    })
    return {
      leagueFormat,
      exampleCount: examples,
      metrics: {
        frozenV1: aggregate("frozenV1"),
        learnedBase: aggregate("learnedBase"),
        learnedFormat: aggregate("learnedFormat"),
      },
    }
  }).sort((left, right) => left.leagueFormat.localeCompare(right.leagueFormat))
}

const aggregateFolds = (folds: EmpiricalOpponentFold[]): EmpiricalModelMetrics => {
  const grouped = byGroup(folds, () => "aggregate")[0]
  return grouped?.metrics || {
    frozenV1: emptyMetrics(), learnedBase: emptyMetrics(), learnedFormat: emptyMetrics(),
  }
}

export const empiricalShadowDecisions = (
  aggregate: EmpiricalModelMetrics,
  formats: EmpiricalGroupMetrics[],
  folds: EmpiricalOpponentFold[],
): EmpiricalOpponentPromotion => {
  const tolerances = {
    brierRegression: 0.001,
    accuracyRegression: 0.005,
    logLossRegression: 0.001,
    minimumMaterialBrierOrLogLossImprovement: 0.0001,
    minimumMaterialAccuracyImprovement: 0.005,
  }
  const baseFailedGates: string[] = []
  const formatFailedGates: string[] = []
  const noMaterialRegression = (
    baseline: EmpiricalPositionMetrics,
    challenger: EmpiricalPositionMetrics,
    scope: string,
    failures: string[],
  ) => {
    if (challenger.positionBrierScore > baseline.positionBrierScore + tolerances.brierRegression) {
      failures.push(`${scope}: Brier regression exceeds ${tolerances.brierRegression}`)
    }
    if (challenger.topPositionAccuracy < baseline.topPositionAccuracy - tolerances.accuracyRegression) {
      failures.push(`${scope}: accuracy regression exceeds ${tolerances.accuracyRegression}`)
    }
    if (challenger.logLoss > baseline.logLoss + tolerances.logLossRegression) {
      failures.push(`${scope}: log-loss regression exceeds ${tolerances.logLossRegression}`)
    }
  }
  const materiallyImproves = (
    baseline: EmpiricalPositionMetrics,
    challenger: EmpiricalPositionMetrics,
  ): boolean => {
    const delta = empiricalMetricDeltas(baseline, challenger)
    return delta.positionBrierScore <= -tolerances.minimumMaterialBrierOrLogLossImprovement
      || delta.topPositionAccuracy >= tolerances.minimumMaterialAccuracyImprovement
      || delta.logLoss <= -tolerances.minimumMaterialBrierOrLogLossImprovement
  }

  noMaterialRegression(
    aggregate.frozenV1, aggregate.learnedBase, "aggregate learned base vs frozen v1", baseFailedGates,
  )
  formats.forEach(group => noMaterialRegression(
    group.metrics.frozenV1,
    group.metrics.learnedBase,
    `${group.leagueFormat} learned base vs frozen v1`,
    baseFailedGates,
  ))
  if (!materiallyImproves(aggregate.frozenV1, aggregate.learnedBase)) {
    baseFailedGates.push("learned base has no material aggregate improvement versus frozen v1")
  }

  noMaterialRegression(
    aggregate.frozenV1, aggregate.learnedFormat, "aggregate learned format vs frozen v1", formatFailedGates,
  )
  noMaterialRegression(
    aggregate.learnedBase, aggregate.learnedFormat, "aggregate learned format vs learned base", formatFailedGates,
  )
  formats.forEach(group => noMaterialRegression(
    group.metrics.frozenV1,
    group.metrics.learnedFormat,
    `${group.leagueFormat} format vs frozen v1`,
    formatFailedGates,
  ))
  formats.forEach(group => noMaterialRegression(
    group.metrics.learnedBase,
    group.metrics.learnedFormat,
    `${group.leagueFormat} format vs learned base`,
    formatFailedGates,
  ))
  if (!materiallyImproves(aggregate.learnedBase, aggregate.learnedFormat)) {
    formatFailedGates.push("format feature has no material aggregate improvement versus learned base")
  }
  const foldWins = {
    brier: folds.filter(fold => fold.formatVsBase.positionBrierScore < 0).length,
    logLoss: folds.filter(fold => fold.formatVsBase.logLoss < 0).length,
    required: 3,
    total: folds.length,
  }
  if (foldWins.brier < foldWins.required && foldWins.logLoss < foldWins.required) {
    formatFailedGates.push(
      `format feature lacks directional Brier or log-loss wins in ${foldWins.required}/${foldWins.total} whole-draft folds`,
    )
  }
  return {
    promoted: false,
    shadowValidationRequired: true,
    learnedBase: {
      eligibleForShadowValidation: baseFailedGates.length === 0,
      thresholds: tolerances,
      failedGates: baseFailedGates,
    },
    learnedFormat: {
      eligibleForShadowValidation: baseFailedGates.length === 0 && formatFailedGates.length === 0,
      thresholds: tolerances,
      failedGates: formatFailedGates,
      incrementalFoldWins: foldWins,
    },
  }
}

/** Leave-one-entire-draft-out evaluation of a fixed empirical training procedure. */
export const runEmpiricalOpponentV2Evaluation = (
  fixtures: RecordedCompletedDraftReplay[],
): EmpiricalOpponentEvaluation => {
  const startedAt = performance.now()
  const corpus = prepareEmpiricalOpponentCorpus(fixtures)
  if (corpus.fixtures.length < 2) throw new Error("Empirical LODO requires at least two usable fixtures")
  const folds: EmpiricalOpponentFold[] = []
  let foldFitMs = 0
  let foldInferenceEvaluationMs = 0

  corpus.fixtures.forEach(summary => {
    const holdout = corpus.examples.filter(example => example.fixtureId === summary.fixtureId)
    const training = corpus.examples.filter(example => example.fixtureId !== summary.fixtureId)
    const baseModel = fitEmpiricalOpponentSoftmax(training, "base")
    const formatModel = fitEmpiricalOpponentSoftmax(training, "format")
    foldFitMs += baseModel.diagnostics.runtimeMs + formatModel.diagnostics.runtimeMs
    const evaluatedAt = performance.now()
    const holdoutMetrics = metricsFor(holdout, baseModel, formatModel)
    const inferenceEvaluationMs = performance.now() - evaluatedAt
    foldInferenceEvaluationMs += inferenceEvaluationMs
    folds.push({
      holdoutFixtureId: summary.fixtureId,
      holdoutLeagueFormat: summary.leagueFormat,
      trainingFixtureIds: corpus.fixtures.filter(candidate => candidate.fixtureId !== summary.fixtureId)
        .map(candidate => candidate.fixtureId),
      trainingExampleCount: training.length,
      holdoutExampleCount: holdout.length,
      baseModel,
      formatModel,
      holdout: holdoutMetrics,
      baseVsFrozen: empiricalMetricDeltas(holdoutMetrics.frozenV1, holdoutMetrics.learnedBase),
      formatVsFrozen: empiricalMetricDeltas(holdoutMetrics.frozenV1, holdoutMetrics.learnedFormat),
      formatVsBase: empiricalMetricDeltas(holdoutMetrics.learnedBase, holdoutMetrics.learnedFormat),
      inferenceEvaluationMs,
    })
  })

  const aggregateHoldout = aggregateFolds(folds)
  const byFixture = folds.map(fold => ({
    fixtureId: fold.holdoutFixtureId,
    leagueFormat: fold.holdoutLeagueFormat,
    exampleCount: fold.holdoutExampleCount,
    metrics: fold.holdout,
  }))
  const byLeagueFormat = byGroup(folds, fold => fold.holdoutLeagueFormat)
  const fullDataBase = fitEmpiricalOpponentSoftmax(corpus.examples, "base")
  const fullDataFormat = fitEmpiricalOpponentSoftmax(corpus.examples, "format")
  const promotion = empiricalShadowDecisions(aggregateHoldout, byLeagueFormat, folds)
  return {
    corpus,
    folds,
    aggregateHoldout,
    aggregateDeltas: {
      baseVsFrozen: empiricalMetricDeltas(aggregateHoldout.frozenV1, aggregateHoldout.learnedBase),
      formatVsFrozen: empiricalMetricDeltas(aggregateHoldout.frozenV1, aggregateHoldout.learnedFormat),
      formatVsBase: empiricalMetricDeltas(aggregateHoldout.learnedBase, aggregateHoldout.learnedFormat),
    },
    byFixture,
    byLeagueFormat,
    fullDataModels: { baseModel: fullDataBase, formatModel: fullDataFormat },
    runtimes: {
      corpusPreparationMs: corpus.preparationMs,
      foldFitMs,
      foldInferenceEvaluationMs,
      fullDataFitMs: fullDataBase.diagnostics.runtimeMs + fullDataFormat.diagnostics.runtimeMs,
      totalMs: performance.now() - startedAt,
    },
    runWindowEvaluation: {
      evaluated: false,
      reason: "Run promotion remains unevaluated: pick predictions are teacher-forced canonical pre-pick states, not static window forecasts.",
    },
    promotion,
  }
}
