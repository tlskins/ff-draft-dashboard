import {
  createRecordedDraftAdvisorContextAtBoundary,
} from "./completedDraftReplay"
import {
  EMPIRICAL_BASE_SHADOW_ARTIFACT,
} from "./empiricalBaseShadow"
import {
  createEmpiricalOpponentFeatureSurface,
  EMPIRICAL_OPPONENT_POSITIONS,
  fitEmpiricalBalancedOpponentResidual,
  fitEmpiricalOpponentSoftmax,
  predictEmpiricalBalancedResidualProbabilities,
  predictEmpiricalOpponentProbabilities,
  prepareEmpiricalOpponentCorpus,
} from "./opponentEmpiricalV2"
import {
  createOpponentForecast,
  opponentPlayerProbabilities,
} from "./opponentModel"
import { leagueFormatFor } from "./replayMetrics"
import {
  NESTED_RUN_CANDIDATES,
  blendRunProbabilities,
  evaluateNestedRunGate,
  frozenRunGroupsByPosition,
  nestedRunGroup,
  nestedRunGroupsBy,
  offlinePromotionReason,
  runAtHalf,
  runProbabilityFromSlotProbabilities,
  scoreNestedRunCandidate,
  scoreNestedRunEvents,
  selectNestedRunCandidate,
  summarizeRunEvents,
} from "./staticWindowRunTuning"
import type {
  EmpiricalBalancedResidualModel,
  EmpiricalBalancedResidualFitConfig,
  EmpiricalOpponentExample,
  EmpiricalSoftmaxModel,
} from "./opponentEmpiricalV2"
import type { RecordedCompletedDraftReplay } from "./completedDraftReplay"
import type { DraftAdvisorContext, ForecastPlayerProbability, PositionProbability } from "./types"
import type {
  NestedRunCandidate,
  NestedRunCandidateScore,
  NestedRunSelection,
  RunEvaluationSample,
  RunEvent,
  RunPosition,
  StaticWindowNestedRunGate,
  StaticWindowRunMetrics,
  StaticWindowRunOnlyGroup,
} from "./staticWindowRunTuning"

export {
  NESTED_RUN_CANDIDATES,
  STATIC_WINDOW_RUN_THRESHOLDS,
  blendRunProbabilities,
  evaluateNestedRunGate,
  offlinePromotionReason,
  runAtHalf,
  runProbabilityFromSlotProbabilities,
  scoreNestedRunCandidate,
  selectNestedRunCandidate,
} from "./staticWindowRunTuning"
export type {
  NestedRunCandidateScore,
  NestedRunSelection,
  StaticWindowNestedRunGate,
  StaticWindowRunMetrics,
  StaticWindowRunOnlyGroup,
} from "./staticWindowRunTuning"

type ForecastPosition = RunPosition
type ModelName = "frozenV1" | "learnedBaseLodo" | "learnedResidualLodo" | "nestedTunedResidualLodo" | "fullDataArtifactDescriptive"

const POSITIONS = EMPIRICAL_OPPONENT_POSITIONS
const EPSILON = 1e-12

export const STATIC_WINDOW_CALIBRATION_EDGES = [0, 0.25, 0.5, 0.75, 1] as const

/**
 * Fixed before nested scoring.  Identity is an exact frozen-v1 fallback; the
 * three residuals only vary correction strength and class-balance softness.
 */
export const NESTED_RESIDUAL_CANDIDATES = [
  { id: "frozen_v1_identity", kind: "identity" as const },
  { id: "residual_half_unweighted", kind: "residual" as const,
    config: { correctionStrength: 0.5, classBalanceExponent: 0 } },
  { id: "residual_half_sqrt_balance", kind: "residual" as const,
    config: { correctionStrength: 0.5, classBalanceExponent: 0.5 } },
  { id: "residual_full_balanced_reference", kind: "residual" as const,
    config: { correctionStrength: 1, classBalanceExponent: 1 } },
] as const

type NestedResidualCandidate = typeof NESTED_RESIDUAL_CANDIDATES[number]

export interface NestedResidualCandidateScore {
  candidateId: string
  positionBrierScore: number
  logLoss: number
  topPositionAccuracy: number
  macroRecall: number
  perPositionRecall: Record<ForecastPosition, number>
  eligible: boolean
  failures: string[]
}

export interface NestedResidualSelection {
  outerHoldoutFixtureId: string
  selectedCandidateId: string
  usedFrozenV1Fallback: boolean
  outerTrainingFixtureIds: string[]
  outerRefitFixtureIds: string[]
  innerFolds: Array<{
    validationFixtureId: string
    trainingFixtureIds: string[]
    canonicalWindowCount: number
    forecastSlotCount: number
    scoredPickCount: number
  }>
  candidateScores: NestedResidualCandidateScore[]
}

/**
 * A terminal horizon is the target manager's next actual pick. For every
 * horizon with an intervening opponent slot we keep exactly its earliest
 * possible post-target boundary: draft start for the first target pick, then
 * the preceding target pick. Thus every forecastable opponent slot belongs to
 * one and only one run window; we never use stored forecast/shadow evidence
 * to choose boundaries.
 */
export const STATIC_WINDOW_BOUNDARY_POLICY = {
  id: "earliest_post_target_boundary_per_next_target_pick_v1",
  description: "For each non-empty target-pick horizon, use boundary 0 before the target's first pick, then each preceding target pick; terminal horizon is the next target pick.",
  labels: "Only recorded QB/RB/WR/TE opponent selections are scored as pick labels; every opponent slot remains in the forecast/run horizon.",
} as const

export interface CanonicalStaticWindow {
  observedThroughOverallPick: number
  terminalTargetPick: number
}

export interface StaticWindowPickMetrics {
  evaluatedPicks: number
  positionBrierScore: number
  topPositionAccuracy: number
  logLoss: number
  playerEvaluatedPicks: number
  playerTopOneAccuracy: number
  playerTopThreeAccuracy: number
}

export interface StaticWindowCalibrationBin {
  lowerInclusive: number
  /** The bin is [lowerInclusive, upperExclusive), except the final bin includes 1. */
  upperExclusive: number
  includesUpperBound: boolean
  count: number
  meanConfidence: number
  empiricalAccuracy: number
}

export interface StaticWindowCalibration {
  evaluatedPicks: number
  expectedCalibrationError: number
  bins: StaticWindowCalibrationBin[]
}

export interface StaticWindowPositionDiagnostics {
  /** The top-position confusion matrix: actual row → predicted column. */
  topPositionConfusion: Record<ForecastPosition, Record<ForecastPosition, number>>
  actualCounts: Record<ForecastPosition, number>
  predictedCounts: Record<ForecastPosition, number>
  /** The observed WR base rate, i.e. a deliberately simple always-WR reference. */
  alwaysWideReceiverAccuracy: number
}

export interface StaticWindowModelSummary {
  pickMetrics: StaticWindowPickMetrics
  calibration: StaticWindowCalibration
  runMetrics: StaticWindowRunMetrics
  positionDiagnostics: StaticWindowPositionDiagnostics
}

export interface StaticWindowModelComparison {
  frozenV1: StaticWindowModelSummary
  /** Primary leakage-safe learned-base estimate: the scored fixture was excluded from its fit. */
  learnedBaseLodo: StaticWindowModelSummary
  /**
   * Leakage-safe, class-balanced correction bounded around frozen v1. This is
   * the position-only challenger; its player probabilities remain the frozen
   * conditional player surface and are not a promotion target.
   */
  learnedResidualLodo: StaticWindowModelSummary
  /** Nested-LODO-selected offline residual; frozen v1 is an exact fallback. */
  nestedTunedResidualLodo: StaticWindowModelSummary
  /** In-sample only; the immutable shipped artifact was fit on this five-fixture corpus. */
  fullDataArtifactDescriptive: StaticWindowModelSummary
}

export interface StaticWindowResidualGate {
  /** Passing only means eligible for prospective shadow capture, never live promotion. */
  eligibleForShadow: boolean
  aggregate: {
    brierDelta: number
    logLossDelta: number
    topPositionAccuracyDelta: number
    runBrierDelta: number
    runF1AtHalfDelta: number
  }
  perPositionRecallDeltas: Array<{ position: ForecastPosition, frozenV1: number, residual: number, delta: number }>
  failures: string[]
}

export interface StaticWindowGroup extends StaticWindowModelComparison {
  key: string
  fixtureCount: number
  canonicalWindowCount: number
  forecastSlotCount: number
  labelCount: number
}

export interface StaticWindowFixtureReport extends StaticWindowModelComparison {
  fixtureId: string
  leagueFormat: string
  targetRosterIndex: number
  canonicalWindows: CanonicalStaticWindow[]
  forecastSlotCount: number
  labelCount: number
  lodoTrainingFixtureIds: string[]
  lodoTrainingExampleCount: number
  nestedTunedSelection: NestedResidualSelection
  nestedRunSelection: NestedRunSelection
}

export interface StaticWindowBacktestReport {
  available: boolean
  policy: typeof STATIC_WINDOW_BOUNDARY_POLICY
  promotion: { promoted: false, reason: string }
  primary: StaticWindowGroup
  byFixture: StaticWindowFixtureReport[]
  byLeagueFormat: StaticWindowGroup[]
  byDraftPhase: StaticWindowGroup[]
  byActualPosition: StaticWindowGroup[]
  residualGate: StaticWindowResidualGate
  nestedTunedResidualGate: StaticWindowResidualGate
  nestedTuning: {
    candidates: typeof NESTED_RESIDUAL_CANDIDATES
    selections: NestedResidualSelection[]
    selectionCounts: Array<{ candidateId: string, count: number }>
    frozenV1FallbackCount: number
  }
  nestedRunTuning: {
    candidates: typeof NESTED_RUN_CANDIDATES
    primary: StaticWindowRunOnlyGroup
    byLeagueFormat: StaticWindowRunOnlyGroup[]
    byDraftPhase: StaticWindowRunOnlyGroup[]
    byRunPosition: StaticWindowRunOnlyGroup[]
    selections: NestedRunSelection[]
    selectionCounts: Array<{ candidateId: string, count: number }>
    frozenV1FallbackCount: number
    gate: StaticWindowNestedRunGate
  }
  skippedFixtures: Array<{ fixtureId: string, reason: string }>
  coverage: {
    suppliedFixtureCount: number
    usableFixtureCount: number
    canonicalWindowCount: number
    forecastSlotCount: number
    labeledPickCount: number
    repeatedPickLabels: 0
    independentRepresentativeRunWindows: number
    limitations: string[]
  }
}

interface PickSample {
  fixtureId: string
  leagueFormat: string
  phase: string
  actual: ForecastPosition
  playerId: string
  predictions: Record<ModelName, {
    probabilities: PositionProbability[]
    playerProbabilities: ForecastPlayerProbability[]
  }>
}

interface RunSample extends RunEvaluationSample {
  predictions: Record<ModelName, Array<{
    position: RunPosition
    probability: number
    actual: boolean
  }>>
}

interface FixtureSamples {
  report: StaticWindowFixtureReport
  picks: PickSample[]
  runs: RunSample[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value)

const phaseFor = (overallPick: number, totalPicks: number): string => {
  const progress = (overallPick - 1) / Math.max(1, totalPicks - 1)
  if (progress < 1 / 3) return "early (0-33%)"
  if (progress < 2 / 3) return "middle (33-67%)"
  return "late (67-100%)"
}

const probabilityFor = (probabilities: PositionProbability[], position: ForecastPosition): number =>
  probabilities.find(candidate => candidate.position === position)?.probability || 0

const normalized = (probabilities: number[]): number[] => {
  const total = probabilities.reduce((sum, probability) => sum + probability, 0)
  return total > 0 ? probabilities.map(probability => probability / total)
    : probabilities.map(() => 1 / probabilities.length)
}

const topPosition = (probabilities: PositionProbability[]): ForecastPosition =>
  [...probabilities].sort((left, right) => right.probability - left.probability
    || left.position.localeCompare(right.position))[0].position as ForecastPosition

const topPlayers = (probabilities: ForecastPlayerProbability[], limit: number): string[] =>
  [...probabilities].sort((left, right) => right.overallProbability - left.overallProbability
    || left.playerId.localeCompare(right.playerId)).slice(0, limit).map(player => player.playerId)

const modelForArtifact = (): EmpiricalSoftmaxModel => ({
  featureSet: "base",
  featureNames: [...EMPIRICAL_BASE_SHADOW_ARTIFACT.featureNames],
  coefficients: EMPIRICAL_BASE_SHADOW_ARTIFACT.coefficients.map(row => [...row]),
  diagnostics: { examples: 656, initialLoss: 0, finalLoss: 0, iterations: 350, runtimeMs: 0 },
})

/** Returns only policy-derived boundaries and is deliberately independent of evidence envelopes. */
export const canonicalStaticWindowBoundaries = (
  fixture: RecordedCompletedDraftReplay,
): CanonicalStaticWindow[] => {
  const targets = [...fixture.actualPicks].filter(pick =>
    pick.rosterIndex === fixture.targetRosterIndex)
    .sort((left, right) => left.overallPick - right.overallPick)
  return targets.map((target, index) => ({
    observedThroughOverallPick: index === 0 ? 0 : targets[index - 1].overallPick,
    terminalTargetPick: target.overallPick,
  })).filter(window => window.terminalTargetPick > window.observedThroughOverallPick + 1)
}

const fixtureError = (value: unknown): string | null => {
  if (!isRecord(value)) return "fixture is absent or not an object"
  if (typeof value.id !== "string" || !value.id) return "fixture id is absent"
  if (!isRecord(value.settings) || !Number.isInteger(value.settings.numTeams)
    || (value.settings.numTeams as number) < 2 || typeof value.settings.ppr !== "boolean") {
    return "fixture settings are malformed"
  }
  if (!Number.isInteger(value.targetRosterIndex)
    || (value.targetRosterIndex as number) < 0
    || (value.targetRosterIndex as number) >= (value.settings.numTeams as number)) {
    return "fixture target roster is malformed"
  }
  if (!Array.isArray(value.players) || !Array.isArray(value.actualPicks) || !value.actualPicks.length) {
    return "fixture players or picks are absent"
  }
  if (value.actualPicks.some(pick => !isRecord(pick) || !Number.isInteger(pick.overallPick)
    || !Number.isInteger(pick.rosterIndex))) return "fixture pick is malformed"
  return null
}

const emptyPickMetrics = (): StaticWindowPickMetrics => ({
  evaluatedPicks: 0, positionBrierScore: 0, topPositionAccuracy: 0, logLoss: 0,
  playerEvaluatedPicks: 0, playerTopOneAccuracy: 0, playerTopThreeAccuracy: 0,
})

const emptyPositionDiagnostics = (): StaticWindowPositionDiagnostics => {
  const counts = (): Record<ForecastPosition, number> => ({ QB: 0, RB: 0, WR: 0, TE: 0 })
  const confusion = {} as Record<ForecastPosition, Record<ForecastPosition, number>>
  POSITIONS.forEach(position => { confusion[position] = counts() })
  return {
    topPositionConfusion: confusion,
    actualCounts: counts(),
    predictedCounts: counts(),
    alwaysWideReceiverAccuracy: 0,
  }
}

const summarizePicks = (samples: PickSample[], model: ModelName): {
  metrics: StaticWindowPickMetrics
  calibration: StaticWindowCalibration
  positionDiagnostics: StaticWindowPositionDiagnostics
} => {
  if (!samples.length) {
    return {
      metrics: emptyPickMetrics(),
      calibration: { evaluatedPicks: 0, expectedCalibrationError: 0,
        bins: STATIC_WINDOW_CALIBRATION_EDGES.slice(0, -1).map((lowerInclusive, index) => ({
          lowerInclusive, upperExclusive: STATIC_WINDOW_CALIBRATION_EDGES[index + 1],
          includesUpperBound: index === STATIC_WINDOW_CALIBRATION_EDGES.length - 2, count: 0,
          meanConfidence: 0, empiricalAccuracy: 0,
        })) },
      positionDiagnostics: emptyPositionDiagnostics(),
    }
  }
  let brier = 0
  let hits = 0
  let loss = 0
  let playerOne = 0
  let playerThree = 0
  const positionDiagnostics = emptyPositionDiagnostics()
  const bins = STATIC_WINDOW_CALIBRATION_EDGES.slice(0, -1).map((lowerInclusive, index) => ({
    lowerInclusive, upperExclusive: STATIC_WINDOW_CALIBRATION_EDGES[index + 1],
    includesUpperBound: index === STATIC_WINDOW_CALIBRATION_EDGES.length - 2, values: [] as Array<{
      confidence: number, hit: number
    }>,
  }))
  samples.forEach(sample => {
    const prediction = sample.predictions[model]
    const probabilities = POSITIONS.map(position => probabilityFor(prediction.probabilities, position))
    const labelIndex = POSITIONS.indexOf(sample.actual)
    brier += probabilities.reduce((sum, probability, index) =>
      sum + (probability - (index === labelIndex ? 1 : 0)) ** 2, 0)
    const selected = topPosition(prediction.probabilities)
    positionDiagnostics.actualCounts[sample.actual] += 1
    positionDiagnostics.predictedCounts[selected] += 1
    positionDiagnostics.topPositionConfusion[sample.actual][selected] += 1
    const hit = selected === sample.actual ? 1 : 0
    hits += hit
    loss -= Math.log(Math.max(EPSILON, probabilities[labelIndex]))
    const confidence = probabilityFor(prediction.probabilities, selected)
    const binIndex = Math.min(bins.length - 1, Math.floor(confidence * bins.length))
    bins[binIndex].values.push({ confidence, hit })
    const top = topPlayers(prediction.playerProbabilities, 3)
    playerOne += top[0] === sample.playerId ? 1 : 0
    playerThree += top.includes(sample.playerId) ? 1 : 0
  })
  const calibrationBins = bins.map(bin => ({
    lowerInclusive: bin.lowerInclusive,
    upperExclusive: bin.upperExclusive,
    includesUpperBound: bin.includesUpperBound,
    count: bin.values.length,
    meanConfidence: bin.values.length
      ? bin.values.reduce((sum, value) => sum + value.confidence, 0) / bin.values.length : 0,
    empiricalAccuracy: bin.values.length
      ? bin.values.reduce((sum, value) => sum + value.hit, 0) / bin.values.length : 0,
  }))
  const ece = calibrationBins.reduce((sum, bin) => sum + bin.count / samples.length
    * Math.abs(bin.meanConfidence - bin.empiricalAccuracy), 0)
  return {
    metrics: {
      evaluatedPicks: samples.length,
      positionBrierScore: brier / samples.length,
      topPositionAccuracy: hits / samples.length,
      logLoss: loss / samples.length,
      playerEvaluatedPicks: samples.length,
      playerTopOneAccuracy: playerOne / samples.length,
      playerTopThreeAccuracy: playerThree / samples.length,
    },
    calibration: { evaluatedPicks: samples.length, expectedCalibrationError: ece, bins: calibrationBins },
    positionDiagnostics: {
      ...positionDiagnostics,
      alwaysWideReceiverAccuracy: positionDiagnostics.actualCounts.WR / samples.length,
    },
  }
}

const summary = (picks: PickSample[], runs: RunSample[]): StaticWindowModelComparison => {
  const forModel = (model: ModelName): StaticWindowModelSummary => {
    const pick = summarizePicks(picks, model)
    return {
      pickMetrics: pick.metrics,
      calibration: pick.calibration,
      runMetrics: summarizeRunEvents(runs.flatMap(run => run.predictions[model])),
      positionDiagnostics: pick.positionDiagnostics,
    }
  }
  return {
    frozenV1: forModel("frozenV1"),
    learnedBaseLodo: forModel("learnedBaseLodo"),
    learnedResidualLodo: forModel("learnedResidualLodo"),
    nestedTunedResidualLodo: forModel("nestedTunedResidualLodo"),
    fullDataArtifactDescriptive: forModel("fullDataArtifactDescriptive"),
  }
}

const allForecastSlotsMatch = (
  context: DraftAdvisorContext,
  forecastPicks: Array<{ overallPick: number, rosterIndex: number }>,
  fixture: RecordedCompletedDraftReplay,
  window: CanonicalStaticWindow,
): boolean => {
  const expected = fixture.actualPicks.filter(pick => pick.overallPick > window.observedThroughOverallPick
    && pick.overallPick < window.terminalTargetPick
    && pick.rosterIndex !== fixture.targetRosterIndex)
    .map(pick => ({ overallPick: pick.overallPick, rosterIndex: pick.rosterIndex }))
  return context.recentPicks.every(pick => pick.overallPick <= window.observedThroughOverallPick)
    && expected.length === forecastPicks.length
    && expected.every((pick, index) => pick.overallPick === forecastPicks[index].overallPick
      && pick.rosterIndex === forecastPicks[index].rosterIndex)
}

/** A pre-pick forecast slot, retained even when its eventual label is K/DST. */
interface CanonicalForecastSlot {
  frozenProbabilities: number[]
  surface: ReturnType<typeof createEmpiricalOpponentFeatureSurface>
}

/** Labeled QB/RB/WR/TE subset, used only by the nested pick scorer. */
interface CanonicalValidationSlot extends CanonicalForecastSlot {
  actual: ForecastPosition
}

/** Cached canonical slots: pick scoring is labeled; run horizons are complete. */
interface CanonicalValidationFixture {
  canonicalWindowCount: number
  forecastSlotCount: number
  slots: CanonicalValidationSlot[]
  windows: Array<{
    forecastSlots: CanonicalForecastSlot[]
    labeledSlots: CanonicalValidationSlot[]
    frozenRunProbabilities: Record<ForecastPosition, number>
    actualRuns: Record<ForecastPosition, boolean>
  }>
}

const canonicalValidationFixture = (
  fixture: RecordedCompletedDraftReplay,
): CanonicalValidationFixture => {
  const windows = canonicalStaticWindowBoundaries(fixture)
  const playerById = new Map(fixture.players.map(player => [player.id, player]))
  const actualByPick = new Map(fixture.actualPicks.map(pick => [pick.overallPick, pick]))
  const slots: CanonicalValidationSlot[] = []
  const validationWindows: CanonicalValidationFixture["windows"] = []
  let forecastSlotCount = 0
  windows.forEach(window => {
    const context = createRecordedDraftAdvisorContextAtBoundary(
      fixture,
      window.observedThroughOverallPick,
    )
    const frozen = createOpponentForecast(context, {
      model: "combined",
      targetRosterIndex: fixture.targetRosterIndex,
    })
    if (!allForecastSlotsMatch(context, frozen.picks, fixture, window)) {
      throw new Error(`canonical horizon mismatch at boundary ${window.observedThroughOverallPick}`)
    }
    forecastSlotCount += frozen.picks.length
    const forecastSlots: CanonicalForecastSlot[] = []
    const labeledSlots: CanonicalValidationSlot[] = []
    frozen.picks.forEach(pick => {
      const forecastSlot = {
        frozenProbabilities: POSITIONS.map(position => probabilityFor(pick.positionProbabilities, position)),
        surface: createEmpiricalOpponentFeatureSurface(
          context,
          pick.overallPick,
          pick.rosterIndex,
          context.totalDraftPicks,
        ),
      }
      forecastSlots.push(forecastSlot)
      const actual = actualByPick.get(pick.overallPick)
      const player = actual?.playerId ? playerById.get(actual.playerId) : undefined
      if (!player || !POSITIONS.includes(player.position as ForecastPosition)) return
      const slot = {
        ...forecastSlot,
        actual: player.position as ForecastPosition,
      }
      slots.push(slot)
      labeledSlots.push(slot)
    })
    const frozenRun = new Map(frozen.runProbabilities.map(run => [run.position, run.probability]))
    validationWindows.push({
      forecastSlots,
      labeledSlots,
      frozenRunProbabilities: POSITIONS.reduce((result, position) => ({
        ...result, [position]: frozenRun.get(position) || 0,
      }), {} as Record<ForecastPosition, number>),
      actualRuns: POSITIONS.reduce((result, position) => ({
        ...result,
        [position]: labeledSlots.filter(slot => slot.actual === position).length >= 3,
      }), {} as Record<ForecastPosition, boolean>),
    })
  })
  return { canonicalWindowCount: windows.length, forecastSlotCount, slots, windows: validationWindows }
}

interface NestedScoredExample {
  actual: ForecastPosition
  probabilities: number[]
}

const scoreNestedExamples = (samples: NestedScoredExample[]): Omit<NestedResidualCandidateScore,
  "candidateId" | "eligible" | "failures"> => {
  const counts = (): Record<ForecastPosition, number> => ({ QB: 0, RB: 0, WR: 0, TE: 0 })
  const actualCounts = counts()
  const hits = counts()
  let brier = 0
  let logLoss = 0
  let accuracy = 0
  samples.forEach(sample => {
    const label = POSITIONS.indexOf(sample.actual)
    const probabilities = normalized(sample.probabilities)
    const selected = probabilities.reduce((best, value, index) => value > probabilities[best]
      ? index : best, 0)
    actualCounts[sample.actual] += 1
    hits[POSITIONS[selected]] += selected === label ? 1 : 0
    accuracy += selected === label ? 1 : 0
    brier += probabilities.reduce((sum, probability, index) => sum
      + (probability - (index === label ? 1 : 0)) ** 2, 0)
    logLoss -= Math.log(Math.max(EPSILON, probabilities[label]))
  })
  const perPositionRecall = POSITIONS.reduce((result, position) => ({
    ...result,
    [position]: actualCounts[position] ? hits[position] / actualCounts[position] : 0,
  }), counts())
  return {
    positionBrierScore: samples.length ? brier / samples.length : 0,
    logLoss: samples.length ? logLoss / samples.length : 0,
    topPositionAccuracy: samples.length ? accuracy / samples.length : 0,
    macroRecall: POSITIONS.reduce((sum, position) => sum + perPositionRecall[position], 0)
      / POSITIONS.length,
    perPositionRecall,
  }
}

/**
 * The inner rule is deliberately defined separately from fitting so tests can
 * prove stable tie and identity-fallback behavior without replaying drafts.
 */
export const selectNestedResidualCandidate = (
  scores: NestedResidualCandidateScore[],
): string => {
  const eligibleResiduals = scores.filter(score => score.eligible
    && score.candidateId !== "frozen_v1_identity")
  if (!eligibleResiduals.length) return "frozen_v1_identity"
  return [...eligibleResiduals].sort((left, right) =>
    left.positionBrierScore - right.positionBrierScore
    || left.logLoss - right.logLoss
    || right.topPositionAccuracy - left.topPositionAccuracy
    || right.macroRecall - left.macroRecall
    || left.candidateId.localeCompare(right.candidateId))[0].candidateId
}

const candidateScore = (
  candidateId: string,
  scored: NestedScoredExample[],
  identity: Omit<NestedResidualCandidateScore, "candidateId" | "eligible" | "failures">,
): NestedResidualCandidateScore => {
  const metrics = scoreNestedExamples(scored)
  if (candidateId === "frozen_v1_identity") {
    return { candidateId, ...metrics, eligible: true, failures: [] }
  }
  const failures: string[] = []
  if (metrics.positionBrierScore > identity.positionBrierScore + 0.005) {
    failures.push("inner aggregate Brier regressed by more than 0.005")
  }
  if (metrics.logLoss > identity.logLoss + 0.01) {
    failures.push("inner aggregate log loss regressed by more than 0.01")
  }
  if (metrics.topPositionAccuracy < identity.topPositionAccuracy - 0.02) {
    failures.push("inner aggregate accuracy regressed by more than 0.02")
  }
  if (metrics.macroRecall < identity.macroRecall - 0.03) {
    failures.push("inner macro recall regressed by more than 0.03")
  }
  POSITIONS.forEach(position => {
    if (metrics.perPositionRecall[position] < identity.perPositionRecall[position] - 0.05) {
      failures.push(`inner ${position} recall regressed by more than 0.05`)
    }
  })
  if (metrics.positionBrierScore > identity.positionBrierScore - 0.001
    && metrics.logLoss > identity.logLoss - 0.001) {
    failures.push("no material inner probabilistic improvement over frozen v1")
  }
  return { candidateId, ...metrics, eligible: failures.length === 0, failures }
}

interface NestedTunedModel {
  candidate: NestedResidualCandidate
  model?: EmpiricalBalancedResidualModel
}

const residualModelForCandidate = (
  candidate: NestedResidualCandidate,
  examples: EmpiricalOpponentExample[],
  fixtureIds: string[],
  cache: Map<string, EmpiricalBalancedResidualModel>,
): EmpiricalBalancedResidualModel | undefined => {
  if (candidate.kind === "identity") return undefined
  const key = `${candidate.id}:${[...fixtureIds].sort().join("|")}`
  const cached = cache.get(key)
  if (cached) return cached
  const model = fitEmpiricalBalancedOpponentResidual(
    examples,
    candidate.config as EmpiricalBalancedResidualFitConfig,
  )
  cache.set(key, model)
  return model
}

const tuneNestedResidualForOuterFold = (
  outerHoldoutFixtureId: string,
  allFixtureIds: string[],
  examples: EmpiricalOpponentExample[],
  cache: Map<string, EmpiricalBalancedResidualModel>,
  validationFixtures: Map<string, RecordedCompletedDraftReplay>,
  validationCache: Map<string, CanonicalValidationFixture>,
): { selection: NestedResidualSelection, tuned: NestedTunedModel } => {
  const outerTrainingFixtureIds = allFixtureIds.filter(id => id !== outerHoldoutFixtureId).sort()
  if (outerTrainingFixtureIds.length < 2) {
    const candidate = NESTED_RESIDUAL_CANDIDATES[0]
    return {
      selection: {
        outerHoldoutFixtureId,
        selectedCandidateId: candidate.id,
        usedFrozenV1Fallback: true,
        outerTrainingFixtureIds,
        outerRefitFixtureIds: [],
        innerFolds: [],
        candidateScores: [],
      },
      tuned: { candidate },
    }
  }
  const innerFolds = outerTrainingFixtureIds.map(validationFixtureId => {
    const cached = validationCache.get(validationFixtureId)
      || canonicalValidationFixture(validationFixtures.get(validationFixtureId)!)
    validationCache.set(validationFixtureId, cached)
    return {
      validationFixtureId,
      trainingFixtureIds: outerTrainingFixtureIds.filter(id => id !== validationFixtureId),
      canonicalWindowCount: cached.canonicalWindowCount,
      forecastSlotCount: cached.forecastSlotCount,
      scoredPickCount: cached.slots.length,
    }
  })
  const innerSamples = new Map(NESTED_RESIDUAL_CANDIDATES.map(candidate => [candidate.id,
    [] as NestedScoredExample[]]))
  innerFolds.forEach(inner => {
    const trainingExamples = examples.filter(example => inner.trainingFixtureIds.includes(example.fixtureId))
    const validation = validationCache.get(inner.validationFixtureId)!
    NESTED_RESIDUAL_CANDIDATES.forEach(candidate => {
      const model = residualModelForCandidate(candidate, trainingExamples, inner.trainingFixtureIds, cache)
      const destination = innerSamples.get(candidate.id)!
      validation.slots.forEach(slot => {
        const probabilities = model
          ? predictEmpiricalBalancedResidualProbabilities(
            model,
            slot.frozenProbabilities,
            slot.surface,
          )
          : slot.frozenProbabilities
        destination.push({ actual: slot.actual, probabilities })
      })
    })
  })
  const identity = scoreNestedExamples(innerSamples.get("frozen_v1_identity")!)
  const candidateScores = NESTED_RESIDUAL_CANDIDATES.map(candidate =>
    candidateScore(candidate.id, innerSamples.get(candidate.id)!, identity))
  const selectedCandidateId = selectNestedResidualCandidate(candidateScores)
  const candidate = NESTED_RESIDUAL_CANDIDATES.find(item => item.id === selectedCandidateId)!
  const outerTrainingExamples = examples.filter(example => outerTrainingFixtureIds.includes(example.fixtureId))
  const model = residualModelForCandidate(candidate, outerTrainingExamples, outerTrainingFixtureIds, cache)
  return {
    selection: {
      outerHoldoutFixtureId,
      selectedCandidateId,
      usedFrozenV1Fallback: candidate.kind === "identity",
      outerTrainingFixtureIds,
      outerRefitFixtureIds: [...outerTrainingFixtureIds],
      innerFolds,
      candidateScores,
    },
    tuned: { candidate, model },
  }
}

const runEventsForCandidate = (
  validation: CanonicalValidationFixture,
  candidate: NestedRunCandidate,
  baseModel?: EmpiricalSoftmaxModel,
  residualModel?: EmpiricalBalancedResidualModel,
): RunEvent[] => validation.windows.flatMap(window => POSITIONS.map(position => {
  const frozen = blendRunProbabilities(window.frozenRunProbabilities[position], window.frozenRunProbabilities[position])
  const learned = () => runProbabilityFromSlotProbabilities(window.forecastSlots.map(slot =>
    predictEmpiricalOpponentProbabilities(baseModel!, slot.surface)[POSITIONS.indexOf(position)]), 3)
  const residual = () => runProbabilityFromSlotProbabilities(window.forecastSlots.map(slot =>
    predictEmpiricalBalancedResidualProbabilities(
      residualModel!,
      slot.frozenProbabilities,
      slot.surface,
    )[POSITIONS.indexOf(position)]), 3)
  const probability = candidate.kind === "identity" ? frozen
    : candidate.kind === "learned_base" ? learned()
      : candidate.kind === "bounded_residual" ? residual()
        : candidate.kind === "v1_learned_base_half_blend" ? blendRunProbabilities(frozen, learned())
          : blendRunProbabilities(frozen, residual())
  return { position, probability, actual: window.actualRuns[position] }
}))

const baseModelForRunCandidate = (
  examples: EmpiricalOpponentExample[],
  fixtureIds: string[],
  cache: Map<string, EmpiricalSoftmaxModel>,
): EmpiricalSoftmaxModel => {
  const key = [...fixtureIds].sort().join("|")
  const cached = cache.get(key)
  if (cached) return cached
  const model = fitEmpiricalOpponentSoftmax(examples, "base")
  cache.set(key, model)
  return model
}

const tuneNestedRunForOuterFold = (
  outerHoldoutFixtureId: string,
  allFixtureIds: string[],
  examples: EmpiricalOpponentExample[],
  baseCache: Map<string, EmpiricalSoftmaxModel>,
  residualCache: Map<string, EmpiricalBalancedResidualModel>,
  validationFixtures: Map<string, RecordedCompletedDraftReplay>,
  validationCache: Map<string, CanonicalValidationFixture>,
): NestedRunSelection => {
  const outerTrainingFixtureIds = allFixtureIds.filter(id => id !== outerHoldoutFixtureId).sort()
  if (outerTrainingFixtureIds.length < 2) return {
    outerHoldoutFixtureId, selectedCandidateId: "frozen_v1_run_identity",
    usedFrozenV1Fallback: true, outerTrainingFixtureIds, outerRefitFixtureIds: [],
    innerFolds: [], candidateScores: [],
  }
  const innerFolds = outerTrainingFixtureIds.map(validationFixtureId => {
    const cached = validationCache.get(validationFixtureId)
      || canonicalValidationFixture(validationFixtures.get(validationFixtureId)!)
    validationCache.set(validationFixtureId, cached)
    return {
      validationFixtureId,
      trainingFixtureIds: outerTrainingFixtureIds.filter(id => id !== validationFixtureId),
      canonicalWindowCount: cached.canonicalWindowCount,
      forecastSlotCount: cached.forecastSlotCount,
      runForecastSlotCount: cached.windows.reduce((sum, window) => sum + window.forecastSlots.length, 0),
      scoredRunEvents: cached.windows.length * POSITIONS.length,
    }
  })
  const events = new Map(NESTED_RUN_CANDIDATES.map(candidate => [candidate.id,
    [] as RunEvent[]]))
  innerFolds.forEach(inner => {
    const training = examples.filter(example => inner.trainingFixtureIds.includes(example.fixtureId))
    const validation = validationCache.get(inner.validationFixtureId)!
    const base = baseModelForRunCandidate(training, inner.trainingFixtureIds, baseCache)
    const residual = residualModelForCandidate(
      NESTED_RESIDUAL_CANDIDATES.find(candidate => candidate.id === "residual_full_balanced_reference")!,
      training,
      inner.trainingFixtureIds,
      residualCache,
    )!
    NESTED_RUN_CANDIDATES.forEach(candidate => {
      events.get(candidate.id)!.push(...runEventsForCandidate(validation, candidate, base, residual))
    })
  })
  const identity = scoreNestedRunEvents(events.get("frozen_v1_run_identity")!)
  const candidateScores = NESTED_RUN_CANDIDATES.map(candidate => scoreNestedRunCandidate(
    candidate.id,
    events.get(candidate.id)!,
    identity,
  ))
  const selectedCandidateId = selectNestedRunCandidate(candidateScores)
  return {
    outerHoldoutFixtureId,
    selectedCandidateId,
    usedFrozenV1Fallback: selectedCandidateId === "frozen_v1_run_identity",
    outerTrainingFixtureIds,
    outerRefitFixtureIds: [...outerTrainingFixtureIds],
    innerFolds,
    candidateScores,
  }
}

const createPredictions = (
  context: DraftAdvisorContext,
  overallPick: number,
  rosterIndex: number,
  model: EmpiricalSoftmaxModel,
): { probabilities: PositionProbability[], playerProbabilities: ForecastPlayerProbability[] } => {
  const values = normalized(predictEmpiricalOpponentProbabilities(model,
    createEmpiricalOpponentFeatureSurface(context, overallPick, rosterIndex, context.totalDraftPicks)))
  const probabilities = POSITIONS.map((position, index) => ({ position, probability: values[index] }))
  return {
    probabilities,
    playerProbabilities: opponentPlayerProbabilities(context, overallPick, probabilities, 5),
  }
}

const createResidualPredictions = (
  context: DraftAdvisorContext,
  overallPick: number,
  rosterIndex: number,
  frozenProbabilities: PositionProbability[],
  model: EmpiricalBalancedResidualModel,
): { probabilities: PositionProbability[], playerProbabilities: ForecastPlayerProbability[] } => {
  const surface = createEmpiricalOpponentFeatureSurface(
    context, overallPick, rosterIndex, context.totalDraftPicks,
  )
  const values = predictEmpiricalBalancedResidualProbabilities(
    model,
    POSITIONS.map(position => probabilityFor(frozenProbabilities, position)),
    surface,
  )
  const probabilities = POSITIONS.map((position, index) => ({ position, probability: values[index] }))
  return {
    probabilities,
    playerProbabilities: opponentPlayerProbabilities(context, overallPick, probabilities, 5),
  }
}

const buildFixtureSamples = (
  fixture: RecordedCompletedDraftReplay,
  learnedModel: EmpiricalSoftmaxModel,
  residualModel: EmpiricalBalancedResidualModel,
  nestedTuned: NestedTunedModel,
  lodoTrainingFixtureIds: string[],
  lodoTrainingExampleCount: number,
  nestedTunedSelection: NestedResidualSelection,
  nestedRunSelection: NestedRunSelection,
): FixtureSamples => {
  const windows = canonicalStaticWindowBoundaries(fixture)
  const artifact = modelForArtifact()
  const picks: PickSample[] = []
  const runs: RunSample[] = []
  let forecastSlotCount = 0
  const playerById = new Map(fixture.players.map(player => [player.id, player]))
  windows.forEach(window => {
    const context = createRecordedDraftAdvisorContextAtBoundary(
      fixture, window.observedThroughOverallPick,
    )
    const frozen = createOpponentForecast(context, {
      model: "combined", targetRosterIndex: fixture.targetRosterIndex,
    })
    if (!allForecastSlotsMatch(context, frozen.picks, fixture, window)) {
      throw new Error(`canonical horizon mismatch at boundary ${window.observedThroughOverallPick}`)
    }
    forecastSlotCount += frozen.picks.length
    const actualByPick = new Map(fixture.actualPicks.map(pick => [pick.overallPick, pick]))
    const learnedPicks = new Map(frozen.picks.map(pick => [pick.overallPick,
      createPredictions(context, pick.overallPick, pick.rosterIndex, learnedModel)]))
    const residualPicks = new Map(frozen.picks.map(pick => [pick.overallPick,
      createResidualPredictions(
        context,
        pick.overallPick,
        pick.rosterIndex,
        pick.positionProbabilities,
        residualModel,
      )]))
    const nestedTunedPicks = new Map(frozen.picks.map(pick => [pick.overallPick,
      nestedTuned.model
        ? createResidualPredictions(
          context,
          pick.overallPick,
          pick.rosterIndex,
          pick.positionProbabilities,
          nestedTuned.model,
        )
        : {
          probabilities: pick.positionProbabilities,
          playerProbabilities: pick.playerProbabilities,
        }]))
    const artifactPicks = new Map(frozen.picks.map(pick => [pick.overallPick,
      createPredictions(context, pick.overallPick, pick.rosterIndex, artifact)]))
    frozen.picks.forEach(frozenPick => {
      const actual = actualByPick.get(frozenPick.overallPick)
      const player = actual?.playerId ? playerById.get(actual.playerId) : undefined
      if (!actual || !player || !POSITIONS.includes(player.position as ForecastPosition)) return
      const frozenPrediction = {
        probabilities: frozenPick.positionProbabilities,
        playerProbabilities: frozenPick.playerProbabilities,
      }
      const learned = learnedPicks.get(frozenPick.overallPick)!
      const residual = residualPicks.get(frozenPick.overallPick)!
      const nestedTunedPrediction = nestedTunedPicks.get(frozenPick.overallPick)!
      const descriptive = artifactPicks.get(frozenPick.overallPick)!
      picks.push({
        fixtureId: fixture.id, leagueFormat: leagueFormatFor(fixture),
        phase: phaseFor(actual.overallPick, fixture.actualPicks.length),
        actual: player.position as ForecastPosition, playerId: player.id,
        predictions: {
          frozenV1: frozenPrediction,
          learnedBaseLodo: learned,
          learnedResidualLodo: residual,
          nestedTunedResidualLodo: nestedTunedPrediction,
          fullDataArtifactDescriptive: descriptive,
        },
      })
    })
    const labelled = frozen.picks.flatMap(forecastPick => {
      const actual = actualByPick.get(forecastPick.overallPick)
      const player = actual?.playerId ? playerById.get(actual.playerId) : undefined
      return player && POSITIONS.includes(player.position as ForecastPosition)
        ? [{ position: player.position as ForecastPosition }] : []
    })
    const toRunEvents = (probabilities: PositionProbability[]) => POSITIONS.map(position => ({
      position,
      probability: probabilityFor(probabilities, position),
      actual: labelled.filter(label => label.position === position).length >= 3,
    }))
    const forecastRuns = new Map(frozen.runProbabilities.map(run => [run.position, run.probability]))
    const frozenRunEvents = POSITIONS.map(position => ({ position,
      probability: forecastRuns.get(position) || 0,
      actual: labelled.filter(label => label.position === position).length >= 3,
    }))
    const learnedRunEvents = toRunEvents(POSITIONS.map(position => ({ position,
      probability: (() => {
        const probabilities = frozen.picks.map(pick => learnedPicks.get(pick.overallPick)!.probabilities)
        return runProbabilityFromSlotProbabilities(probabilities.map(value =>
          probabilityFor(value, position)), 3)
      })(),
    })))
    const residualRunEvents = toRunEvents(POSITIONS.map(position => ({ position,
      probability: (() => {
        const probabilities = frozen.picks.map(pick => residualPicks.get(pick.overallPick)!.probabilities)
        return runProbabilityFromSlotProbabilities(probabilities.map(value =>
          probabilityFor(value, position)), 3)
      })(),
    })))
    const blendRunEvents = (challenger: typeof learnedRunEvents) => frozenRunEvents.map((frozenRun, index) => ({
      ...frozenRun,
      probability: blendRunProbabilities(frozenRun.probability, challenger[index].probability),
    }))
    const nestedRunEvents = new Map<string, typeof frozenRunEvents>([
      ["frozen_v1_run_identity", frozenRunEvents],
      ["learned_base_run", learnedRunEvents],
      ["bounded_residual_run", residualRunEvents],
      ["v1_learned_base_half_blend", blendRunEvents(learnedRunEvents)],
      ["v1_bounded_residual_half_blend", blendRunEvents(residualRunEvents)],
    ])
    runs.push({
      fixtureId: fixture.id,
      leagueFormat: leagueFormatFor(fixture),
      phase: phaseFor(window.terminalTargetPick, fixture.actualPicks.length),
      predictions: {
        frozenV1: frozenRunEvents,
        learnedBaseLodo: learnedRunEvents,
        learnedResidualLodo: residualRunEvents,
        nestedTunedResidualLodo: toRunEvents(POSITIONS.map(position => ({ position,
          probability: (() => {
            const probabilities = frozen.picks.map(pick =>
              nestedTunedPicks.get(pick.overallPick)!.probabilities)
            return runProbabilityFromSlotProbabilities(probabilities.map(value =>
              probabilityFor(value, position)), 3)
          })(),
        }))),
        fullDataArtifactDescriptive: toRunEvents(POSITIONS.map(position => ({ position,
          probability: (() => {
            const probabilities = frozen.picks.map(pick => artifactPicks.get(pick.overallPick)!.probabilities)
            return runProbabilityFromSlotProbabilities(probabilities.map(value =>
              probabilityFor(value, position)), 3)
          })(),
        }))),
      },
      frozenRunPredictions: frozenRunEvents,
      nestedRunPredictions: nestedRunEvents.get(nestedRunSelection.selectedCandidateId) || frozenRunEvents,
    })
  })
  const base = summary(picks, runs)
  return {
    report: {
      fixtureId: fixture.id, leagueFormat: leagueFormatFor(fixture), targetRosterIndex: fixture.targetRosterIndex,
      canonicalWindows: windows, forecastSlotCount, labelCount: picks.length,
      lodoTrainingFixtureIds, lodoTrainingExampleCount,
      nestedTunedSelection, nestedRunSelection, ...base,
    }, picks, runs,
  }
}

const group = (key: string, fixtures: FixtureSamples[]): StaticWindowGroup => {
  const picks = fixtures.flatMap(fixture => fixture.picks)
  const runs = fixtures.flatMap(fixture => fixture.runs)
  return {
    key, fixtureCount: fixtures.length,
    canonicalWindowCount: fixtures.reduce((sum, fixture) => sum + fixture.report.canonicalWindows.length, 0),
    forecastSlotCount: fixtures.reduce((sum, fixture) => sum + fixture.report.forecastSlotCount, 0),
    labelCount: picks.length, ...summary(picks, runs),
  }
}

const groupsBy = (
  fixtures: FixtureSamples[],
  keyForPick: (sample: PickSample) => string,
  keyForRun?: (sample: RunSample) => string,
): StaticWindowGroup[] => {
  const keys = Array.from(new Set(fixtures.flatMap(fixture => fixture.picks.map(keyForPick)))).sort()
  return keys.map(key => {
    const matching = fixtures.map(fixture => ({
      ...fixture,
      picks: fixture.picks.filter(sample => keyForPick(sample) === key),
      runs: keyForRun ? fixture.runs.filter(sample => keyForRun(sample) === key) : [],
    }))
    const picks = matching.flatMap(fixture => fixture.picks)
    const runs = matching.flatMap(fixture => fixture.runs)
    return {
      key, fixtureCount: matching.filter(fixture => fixture.picks.length > 0).length,
      canonicalWindowCount: runs.length,
      forecastSlotCount: 0,
      labelCount: picks.length,
      ...summary(picks, runs),
    }
  })
}

/**
 * Fixed, conservative offline guardrails.  They prevent an aggregate gain
 * driven by sacrificing a minority position from being called a viable
 * challenger.  Passing is only eligibility for new prospective shadow data.
 */
export const evaluateStaticWindowResidualGate = (
  primary: StaticWindowGroup,
  byActualPosition: StaticWindowGroup[],
  challenger: "learnedResidualLodo" | "nestedTunedResidualLodo" = "learnedResidualLodo",
): StaticWindowResidualGate => {
  const frozen = primary.frozenV1
  const residual = primary[challenger]
  const aggregate = {
    brierDelta: residual.pickMetrics.positionBrierScore - frozen.pickMetrics.positionBrierScore,
    logLossDelta: residual.pickMetrics.logLoss - frozen.pickMetrics.logLoss,
    topPositionAccuracyDelta: residual.pickMetrics.topPositionAccuracy - frozen.pickMetrics.topPositionAccuracy,
    runBrierDelta: residual.runMetrics.brierScore - frozen.runMetrics.brierScore,
    runF1AtHalfDelta: runAtHalf(residual).f1 - runAtHalf(frozen).f1,
  }
  const perPositionRecallDeltas = POSITIONS.map(position => {
    const group = byActualPosition.find(candidate => candidate.key === position)
    const baseline = group?.frozenV1.pickMetrics.topPositionAccuracy || 0
    const challengerRecall = group?.[challenger].pickMetrics.topPositionAccuracy || 0
    return { position, frozenV1: baseline, residual: challengerRecall, delta: challengerRecall - baseline }
  })
  const failures: string[] = []
  if (aggregate.brierDelta > 0.005) failures.push("aggregate Brier regressed by more than 0.005")
  if (aggregate.logLossDelta > 0.01) failures.push("aggregate log loss regressed by more than 0.01")
  if (aggregate.topPositionAccuracyDelta < -0.02) failures.push("aggregate top-position accuracy regressed by more than 0.02")
  if (aggregate.runBrierDelta > 0.01) failures.push("run Brier regressed by more than 0.01")
  if (aggregate.runF1AtHalfDelta < -0.05) failures.push("run F1 at 0.50 regressed by more than 0.05")
  perPositionRecallDeltas.forEach(item => {
    if (item.delta < -0.05) failures.push(`${item.position} recall regressed by more than 0.05`)
  })
  // A challenger must offer a small probabilistic benefit in addition to not
  // harming a class. This keeps numerical parity from consuming shadow time.
  if (aggregate.brierDelta > -0.002 && aggregate.logLossDelta > -0.002) {
    failures.push("no material aggregate probabilistic improvement over frozen v1")
  }
  return { eligibleForShadow: failures.length === 0, aggregate, perPositionRecallDeltas, failures }
}

/**
 * Offline-only static-window replay.  The learned-base primary result always
 * uses a model trained on other complete fixtures; no evidence envelope is
 * read and no promotion/live state can be changed by this function.
 */
export const runStaticWindowBacktest = (fixtures: unknown[]): StaticWindowBacktestReport => {
  const skippedFixtures: Array<{ fixtureId: string, reason: string }> = []
  const valid: RecordedCompletedDraftReplay[] = []
  const ids = new Set<string>()
  fixtures.forEach((value, index) => {
    const error = fixtureError(value)
    const fixtureId = isRecord(value) && typeof value.id === "string" ? value.id : `fixture-${index + 1}`
    if (error) { skippedFixtures.push({ fixtureId, reason: error }); return }
    if (ids.has(fixtureId)) { skippedFixtures.push({ fixtureId, reason: "duplicate fixture id" }); return }
    ids.add(fixtureId)
    valid.push(value as RecordedCompletedDraftReplay)
  })
  // Materialize each candidate independently: one malformed nested replay must
  // never prevent a valid fixture from participating in another fold.
  const corpusParts = valid.flatMap(fixture => {
    try {
      const part = prepareEmpiricalOpponentCorpus([fixture])
      part.skippedFixtures.forEach(skipped => skippedFixtures.push(skipped))
      return part.fixtures.length ? [part] : []
    } catch (error) {
      skippedFixtures.push({ fixtureId: fixture.id, reason: `corpus preparation failed: ${String(error)}` })
      return []
    }
  })
  const corpus = {
    examples: corpusParts.flatMap(part => part.examples),
    fixtures: corpusParts.flatMap(part => part.fixtures),
  }
  const usable = valid.filter(fixture => corpus.fixtures.some(summary => summary.fixtureId === fixture.id))
  if (usable.length < 2) return unavailable(fixtures.length, skippedFixtures)
  const fixtureSamples: FixtureSamples[] = []
  const residualFitCache = new Map<string, EmpiricalBalancedResidualModel>()
  const baseFitCache = new Map<string, EmpiricalSoftmaxModel>()
  const usableFixtureIds = corpus.fixtures.map(summary => summary.fixtureId).sort()
  const usableFixturesById = new Map(usable.map(fixture => [fixture.id, fixture]))
  const validationCache = new Map<string, CanonicalValidationFixture>()
  usable.forEach(fixture => {
    try {
      const training = corpus.examples.filter(example => example.fixtureId !== fixture.id)
      const trainingIds = corpus.fixtures.filter(summary => summary.fixtureId !== fixture.id)
        .map(summary => summary.fixtureId).sort()
      if (trainingIds.includes(fixture.id)) throw new Error("LODO training includes held-out fixture")
      const model = fitEmpiricalOpponentSoftmax(training, "base")
      baseFitCache.set(trainingIds.join("|"), model)
      const residual = fitEmpiricalBalancedOpponentResidual(training)
      // The fixed residual reference is also one nested candidate. Reuse the
      // already-required outer LODO fit if inner selection chooses it.
      residualFitCache.set(
        `residual_full_balanced_reference:${trainingIds.join("|")}`,
        residual,
      )
      const nested = tuneNestedResidualForOuterFold(
        fixture.id,
        usableFixtureIds,
        corpus.examples,
        residualFitCache,
        usableFixturesById,
        validationCache,
      )
      const nestedRun = tuneNestedRunForOuterFold(
        fixture.id,
        usableFixtureIds,
        corpus.examples,
        baseFitCache,
        residualFitCache,
        usableFixturesById,
        validationCache,
      )
      fixtureSamples.push(buildFixtureSamples(
        fixture,
        model,
        residual,
        nested.tuned,
        trainingIds,
        training.length,
        nested.selection,
        nestedRun,
      ))
    } catch (error) {
      skippedFixtures.push({ fixtureId: fixture.id, reason: String(error) })
    }
  })
  if (fixtureSamples.length < 2) return unavailable(fixtures.length, skippedFixtures)
  const primary = group("pick-weighted aggregate", fixtureSamples)
  const byActualPosition = groupsBy(fixtureSamples, sample => sample.actual)
  const residualGate = evaluateStaticWindowResidualGate(primary, byActualPosition)
  const nestedTunedResidualGate = evaluateStaticWindowResidualGate(
    primary,
    byActualPosition,
    "nestedTunedResidualLodo",
  )
  const selections = fixtureSamples.map(sample => sample.report.nestedTunedSelection)
    .sort((left, right) => left.outerHoldoutFixtureId.localeCompare(right.outerHoldoutFixtureId))
  const selectionCounts = NESTED_RESIDUAL_CANDIDATES.map(candidate => ({
    candidateId: candidate.id,
    count: selections.filter(selection => selection.selectedCandidateId === candidate.id).length,
  }))
  const nestedRunSelections = fixtureSamples.map(sample => sample.report.nestedRunSelection)
    .sort((left, right) => left.outerHoldoutFixtureId.localeCompare(right.outerHoldoutFixtureId))
  const runSamples = fixtureSamples.flatMap(sample => sample.runs)
  const nestedRunPrimary = nestedRunGroup("canonical-window aggregate", runSamples)
  const nestedRunByPosition = nestedRunGroupsBy(runSamples, (_run, event) => event.position)
  const frozenRunByPosition = frozenRunGroupsByPosition(runSamples)
  const nestedRunGate = evaluateNestedRunGate(
    primary.frozenV1,
    nestedRunPrimary,
    nestedRunByPosition,
    frozenRunByPosition,
  )
  return {
    available: true,
    policy: STATIC_WINDOW_BOUNDARY_POLICY,
    promotion: {
      promoted: false,
      reason: offlinePromotionReason(
        nestedTunedResidualGate.eligibleForShadow,
        nestedRunGate.eligibleForShadow,
      ),
    },
    primary,
    byFixture: fixtureSamples.map(sample => sample.report)
      .sort((left, right) => left.fixtureId.localeCompare(right.fixtureId)),
    byLeagueFormat: groupsBy(fixtureSamples, sample => sample.leagueFormat,
      sample => sample.leagueFormat),
    byDraftPhase: groupsBy(fixtureSamples, sample => sample.phase,
      sample => sample.phase),
    byActualPosition,
    residualGate,
    nestedTunedResidualGate,
    nestedTuning: {
      candidates: NESTED_RESIDUAL_CANDIDATES,
      selections,
      selectionCounts,
      frozenV1FallbackCount: selections.filter(selection => selection.usedFrozenV1Fallback).length,
    },
    nestedRunTuning: {
      candidates: NESTED_RUN_CANDIDATES,
      primary: nestedRunPrimary,
      byLeagueFormat: nestedRunGroupsBy(runSamples, (run, _event) => run.leagueFormat),
      byDraftPhase: nestedRunGroupsBy(runSamples, (run, _event) => run.phase),
      byRunPosition: nestedRunByPosition,
      selections: nestedRunSelections,
      selectionCounts: NESTED_RUN_CANDIDATES.map(candidate => ({
        candidateId: candidate.id,
        count: nestedRunSelections.filter(selection => selection.selectedCandidateId === candidate.id).length,
      })),
      frozenV1FallbackCount: nestedRunSelections.filter(selection => selection.usedFrozenV1Fallback).length,
      gate: nestedRunGate,
    },
    skippedFixtures,
    coverage: {
      suppliedFixtureCount: fixtures.length, usableFixtureCount: fixtureSamples.length,
      canonicalWindowCount: fixtureSamples.reduce((sum, fixture) => sum + fixture.report.canonicalWindows.length, 0),
      forecastSlotCount: fixtureSamples.reduce((sum, fixture) => sum + fixture.report.forecastSlotCount, 0),
      labeledPickCount: primary.labelCount,
      repeatedPickLabels: 0,
      independentRepresentativeRunWindows: fixtureSamples.reduce((sum, fixture) => sum + fixture.runs.length, 0),
      limitations: [
        "Learned-base LODO fits exclude the scored draft but share a small five-mock corpus.",
        "Full-data artifact numbers are in-sample descriptive parity only and are not promotion evidence.",
        "Static windows exclude the trailing opponent slots after a target manager's final pick.",
        "Run probabilities retain the current independent-pick assumption and fixed minimum run length of three.",
        "Nested residual fitting uses teacher-forced training examples; inner validation and outer scoring use identical canonical static windows.",
      ],
    },
  }
}

const unavailable = (
  suppliedFixtureCount: number,
  skippedFixtures: Array<{ fixtureId: string, reason: string }>,
): StaticWindowBacktestReport => ({
  available: false,
  policy: STATIC_WINDOW_BOUNDARY_POLICY,
  promotion: { promoted: false, reason: "Offline historical backtest only; prospective shadow validation remains required" },
  primary: group("pick-weighted aggregate", []),
  byFixture: [], byLeagueFormat: [], byDraftPhase: [], byActualPosition: [], skippedFixtures,
  residualGate: {
    eligibleForShadow: false,
    aggregate: { brierDelta: 0, logLossDelta: 0, topPositionAccuracyDelta: 0, runBrierDelta: 0, runF1AtHalfDelta: 0 },
    perPositionRecallDeltas: [],
    failures: ["At least two usable complete fixtures are required for LODO evaluation."],
  },
  nestedTunedResidualGate: {
    eligibleForShadow: false,
    aggregate: { brierDelta: 0, logLossDelta: 0, topPositionAccuracyDelta: 0, runBrierDelta: 0, runF1AtHalfDelta: 0 },
    perPositionRecallDeltas: [],
    failures: ["At least two usable complete fixtures are required for nested LODO evaluation."],
  },
  nestedTuning: {
    candidates: NESTED_RESIDUAL_CANDIDATES,
    selections: [],
    selectionCounts: NESTED_RESIDUAL_CANDIDATES.map(candidate => ({ candidateId: candidate.id, count: 0 })),
    frozenV1FallbackCount: 0,
  },
  nestedRunTuning: {
    candidates: NESTED_RUN_CANDIDATES,
    primary: { key: "canonical-window aggregate", fixtureCount: 0, canonicalWindowCount: 0,
      runMetrics: summarizeRunEvents([]) },
    byLeagueFormat: [], byDraftPhase: [], byRunPosition: [], selections: [],
    selectionCounts: NESTED_RUN_CANDIDATES.map(candidate => ({ candidateId: candidate.id, count: 0 })),
    frozenV1FallbackCount: 0,
    gate: {
      eligibleForShadow: false, brierDelta: 0, logLossDelta: 0, precisionAtHalfDelta: 0,
      recallAtHalfDelta: 0, f1AtHalfDelta: 0,
      perPosition: [],
      failures: ["At least two usable complete fixtures are required for nested run evaluation."],
    },
  },
  coverage: {
    suppliedFixtureCount, usableFixtureCount: 0, canonicalWindowCount: 0, forecastSlotCount: 0,
    labeledPickCount: 0, repeatedPickLabels: 0, independentRepresentativeRunWindows: 0,
    limitations: ["At least two usable complete fixtures are required for LODO evaluation."],
  },
})
