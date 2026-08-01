import { FantasyPosition } from "../../types"

export type RunPosition =
  | FantasyPosition.QUARTERBACK
  | FantasyPosition.RUNNING_BACK
  | FantasyPosition.WIDE_RECEIVER
  | FantasyPosition.TIGHT_END

export const RUN_POSITIONS: RunPosition[] = [
  FantasyPosition.QUARTERBACK,
  FantasyPosition.RUNNING_BACK,
  FantasyPosition.WIDE_RECEIVER,
  FantasyPosition.TIGHT_END,
]

export const STATIC_WINDOW_RUN_THRESHOLDS = [0.25, 0.5, 0.75] as const
const EPSILON = 1e-12

/** Run-only candidates; these never replace a displayed pick-position forecast. */
export const NESTED_RUN_CANDIDATES = [
  { id: "frozen_v1_run_identity", kind: "identity" as const },
  { id: "learned_base_run", kind: "learned_base" as const },
  { id: "bounded_residual_run", kind: "bounded_residual" as const },
  { id: "v1_learned_base_half_blend", kind: "v1_learned_base_half_blend" as const },
  { id: "v1_bounded_residual_half_blend", kind: "v1_bounded_residual_half_blend" as const },
] as const

export type NestedRunCandidate = typeof NESTED_RUN_CANDIDATES[number]

export interface RunEvent {
  position: RunPosition
  probability: number
  actual: boolean
}

export interface StaticWindowRunMetrics {
  evaluatedEvents: number
  brierScore: number
  logLoss: number
  thresholds: Array<{
    threshold: number
    truePositives: number
    falsePositives: number
    falseNegatives: number
    predictedPositives: number
    actualPositives: number
    precision: number
    recall: number
    f1: number
  }>
}

export interface NestedRunCandidateScore {
  candidateId: string
  brierScore: number
  logLoss: number
  precisionAtHalf: number
  recallAtHalf: number
  f1AtHalf: number
  evaluatedEvents: number
  positiveEvents: number
  perPosition: Array<{
    position: RunPosition
    evaluatedEvents: number
    positiveEvents: number
    brierScore: number
    recallAtHalf: number | null
  }>
  eligible: boolean
  failures: string[]
}

export interface NestedRunSelection {
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
    runForecastSlotCount: number
    scoredRunEvents: number
  }>
  candidateScores: NestedRunCandidateScore[]
}

export interface StaticWindowRunOnlyGroup {
  key: string
  fixtureCount: number
  canonicalWindowCount: number
  runMetrics: StaticWindowRunMetrics
}

export interface StaticWindowNestedRunGate {
  eligibleForShadow: boolean
  brierDelta: number
  logLossDelta: number
  precisionAtHalfDelta: number
  recallAtHalfDelta: number
  f1AtHalfDelta: number
  perPosition: Array<{
    position: RunPosition
    support: number
    positiveEvents: number
    frozenV1BrierScore: number
    challengerBrierScore: number
    brierDelta: number
    frozenV1RecallAtHalf: number | null
    challengerRecallAtHalf: number | null
    recallAtHalfDelta: number | null
  }>
  failures: string[]
}

/**
 * A probability for at least `minimumPickCount` independent successes. The
 * evaluator owns this calculation so run-only tuning has no forecast-model
 * dependency.
 */
export const runProbabilityFromSlotProbabilities = (
  probabilities: number[],
  minimumPickCount = 3,
): number => {
  if (minimumPickCount <= 0) return 1
  if (probabilities.length < minimumPickCount) return 0
  const bounded = probabilities.map(probability => Number.isFinite(probability)
    ? Math.min(1, Math.max(0, probability))
    : 0)
  let distribution = Array(bounded.length + 1).fill(0) as number[]
  distribution[0] = 1
  bounded.forEach(probability => {
    const next = Array(bounded.length + 1).fill(0) as number[]
    distribution.forEach((current, count) => {
      if (current === 0) return
      next[count] += current * (1 - probability)
      next[count + 1] += current * probability
    })
    distribution = next
  })
  return Math.min(1, Math.max(0, distribution.slice(minimumPickCount)
    .reduce((sum, probability) => sum + probability, 0)))
}

/** A run-output blend only; it cannot alter per-pick position probabilities. */
export const blendRunProbabilities = (frozenV1: number, challenger: number): number => {
  const bounded = (probability: number) => Number.isFinite(probability)
    ? Math.min(1, Math.max(0, probability))
    : 0
  return (bounded(frozenV1) + bounded(challenger)) / 2
}

export const summarizeRunEvents = (events: RunEvent[]): StaticWindowRunMetrics => ({
  evaluatedEvents: events.length,
  brierScore: events.length ? events.reduce((sum, event) =>
    sum + (event.probability - (event.actual ? 1 : 0)) ** 2, 0) / events.length : 0,
  logLoss: events.length ? events.reduce((sum, event) => sum - Math.log(Math.max(
    EPSILON,
    event.actual ? event.probability : 1 - event.probability,
  )), 0) / events.length : 0,
  thresholds: STATIC_WINDOW_RUN_THRESHOLDS.map(threshold => {
    const counts = events.reduce((result, event) => {
      const predicted = event.probability >= threshold
      if (predicted && event.actual) result.truePositives += 1
      else if (predicted) result.falsePositives += 1
      else if (event.actual) result.falseNegatives += 1
      return result
    }, { truePositives: 0, falsePositives: 0, falseNegatives: 0 })
    const predictedPositives = counts.truePositives + counts.falsePositives
    const actualPositives = counts.truePositives + counts.falseNegatives
    const precision = predictedPositives ? counts.truePositives / predictedPositives : 0
    const recall = actualPositives ? counts.truePositives / actualPositives : 0
    return {
      threshold, ...counts, predictedPositives, actualPositives, precision, recall,
      f1: precision + recall ? 2 * precision * recall / (precision + recall) : 0,
    }
  }),
})

const atHalf = (items: RunEvent[]) => items.reduce((counts, event) => {
  const predicted = event.probability >= 0.5
  if (predicted && event.actual) counts.truePositives += 1
  else if (predicted) counts.falsePositives += 1
  else if (event.actual) counts.falseNegatives += 1
  return counts
}, { truePositives: 0, falsePositives: 0, falseNegatives: 0 })

export const scoreNestedRunEvents = (events: RunEvent[]): Omit<NestedRunCandidateScore,
  "candidateId" | "eligible" | "failures"> => {
  const counts = atHalf(events)
  const predicted = counts.truePositives + counts.falsePositives
  const positives = counts.truePositives + counts.falseNegatives
  const precision = predicted ? counts.truePositives / predicted : 0
  const recall = positives ? counts.truePositives / positives : 0
  const perPosition = RUN_POSITIONS.map(position => {
    const subset = events.filter(event => event.position === position)
    const support = subset.filter(event => event.actual).length
    const positionCounts = atHalf(subset)
    return {
      position,
      evaluatedEvents: subset.length,
      positiveEvents: support,
      brierScore: subset.length ? subset.reduce((sum, event) => sum
        + (event.probability - (event.actual ? 1 : 0)) ** 2, 0) / subset.length : 0,
      recallAtHalf: support ? positionCounts.truePositives / support : null,
    }
  })
  const metrics = summarizeRunEvents(events)
  return {
    brierScore: metrics.brierScore,
    logLoss: metrics.logLoss,
    precisionAtHalf: precision,
    recallAtHalf: recall,
    f1AtHalf: precision + recall ? 2 * precision * recall / (precision + recall) : 0,
    evaluatedEvents: events.length,
    positiveEvents: positives,
    perPosition,
  }
}

export const selectNestedRunCandidate = (scores: NestedRunCandidateScore[]): string => {
  const eligible = scores.filter(score => score.eligible
    && score.candidateId !== "frozen_v1_run_identity")
  if (!eligible.length) return "frozen_v1_run_identity"
  return [...eligible].sort((left, right) => left.brierScore - right.brierScore
    || left.logLoss - right.logLoss
    || right.f1AtHalf - left.f1AtHalf
    || right.precisionAtHalf - left.precisionAtHalf
    || right.recallAtHalf - left.recallAtHalf
    || left.candidateId.localeCompare(right.candidateId))[0].candidateId
}

export const scoreNestedRunCandidate = (
  candidateId: string,
  events: RunEvent[],
  identity: Omit<NestedRunCandidateScore, "candidateId" | "eligible" | "failures">,
): NestedRunCandidateScore => {
  const metrics = scoreNestedRunEvents(events)
  if (candidateId === "frozen_v1_run_identity") {
    return { candidateId, ...metrics, eligible: true, failures: [] }
  }
  const failures: string[] = []
  if (metrics.brierScore > identity.brierScore - 0.002
    && metrics.logLoss > identity.logLoss - 0.002) {
    failures.push("no material inner run probabilistic improvement over frozen v1")
  }
  if (metrics.precisionAtHalf < identity.precisionAtHalf - 0.05) {
    failures.push("inner run precision at 0.50 regressed by more than 0.05")
  }
  if (metrics.recallAtHalf < identity.recallAtHalf - 0.05) {
    failures.push("inner run recall at 0.50 regressed by more than 0.05")
  }
  if (metrics.f1AtHalf < identity.f1AtHalf - 0.04) {
    failures.push("inner run F1 at 0.50 regressed by more than 0.04")
  }
  metrics.perPosition.forEach(position => {
    const frozen = identity.perPosition.find(item => item.position === position.position)!
    if (position.positiveEvents > 0 && frozen.positiveEvents > 0
      && position.recallAtHalf !== null && frozen.recallAtHalf !== null
      && position.recallAtHalf < frozen.recallAtHalf - 0.1) {
      failures.push(`inner ${position.position} run recall regressed by more than 0.10`)
    }
    if (position.brierScore > frozen.brierScore + 0.02) {
      failures.push(`inner ${position.position} run Brier regressed by more than 0.02`)
    }
  })
  return { candidateId, ...metrics, eligible: failures.length === 0, failures }
}

export interface RunEvaluationSample {
  fixtureId: string
  leagueFormat: string
  phase: string
  frozenRunPredictions: RunEvent[]
  nestedRunPredictions: RunEvent[]
}

export const nestedRunGroup = (
  key: string,
  samples: RunEvaluationSample[],
  predicate?: (sample: RunEvaluationSample, event: RunEvent) => boolean,
): StaticWindowRunOnlyGroup => {
  const filtered = samples.map(sample => ({
    ...sample,
    nestedRunPredictions: predicate
      ? sample.nestedRunPredictions.filter(event => predicate(sample, event))
      : sample.nestedRunPredictions,
  })).filter(sample => sample.nestedRunPredictions.length > 0)
  return {
    key,
    fixtureCount: new Set(filtered.map(sample => sample.fixtureId)).size,
    canonicalWindowCount: filtered.length,
    runMetrics: summarizeRunEvents(filtered.flatMap(sample => sample.nestedRunPredictions)),
  }
}

export const nestedRunGroupsBy = (
  samples: RunEvaluationSample[],
  keyFor: (sample: RunEvaluationSample, event: RunEvent) => string,
): StaticWindowRunOnlyGroup[] => {
  const keys = Array.from(new Set(samples.flatMap(sample => sample.nestedRunPredictions
    .map(event => keyFor(sample, event))))).sort()
  return keys.map(key => nestedRunGroup(key, samples, (sample, event) => keyFor(sample, event) === key))
}

export const frozenRunGroupsByPosition = (samples: RunEvaluationSample[]): StaticWindowRunOnlyGroup[] =>
  RUN_POSITIONS.map(position => {
    const events = samples.flatMap(sample => sample.frozenRunPredictions
      .filter(event => event.position === position))
    return {
      key: position,
      fixtureCount: new Set(samples.filter(sample => sample.frozenRunPredictions
        .some(event => event.position === position)).map(sample => sample.fixtureId)).size,
      canonicalWindowCount: events.length,
      runMetrics: summarizeRunEvents(events),
    }
  })

export const runAtHalf = (summary: { runMetrics: StaticWindowRunMetrics }) =>
  summary.runMetrics.thresholds.find(metric => metric.threshold === 0.5)!

export const evaluateNestedRunGate = (
  frozen: { runMetrics: StaticWindowRunMetrics },
  nested: StaticWindowRunOnlyGroup,
  byPosition: StaticWindowRunOnlyGroup[],
  frozenByPosition: StaticWindowRunOnlyGroup[],
): StaticWindowNestedRunGate => {
  const baselineAtHalf = runAtHalf(frozen)
  const challengerAtHalf = runAtHalf(nested)
  const brierDelta = nested.runMetrics.brierScore - frozen.runMetrics.brierScore
  const logLossDelta = nested.runMetrics.logLoss - frozen.runMetrics.logLoss
  const precisionAtHalfDelta = challengerAtHalf.precision - baselineAtHalf.precision
  const recallAtHalfDelta = challengerAtHalf.recall - baselineAtHalf.recall
  const f1AtHalfDelta = challengerAtHalf.f1 - baselineAtHalf.f1
  const failures: string[] = []
  if (brierDelta > -0.002 && logLossDelta > -0.002) {
    failures.push("no material nested run probabilistic improvement over frozen v1")
  }
  if (precisionAtHalfDelta < -0.05) failures.push("nested run precision at 0.50 regressed by more than 0.05")
  if (recallAtHalfDelta < -0.05) failures.push("nested run recall at 0.50 regressed by more than 0.05")
  if (f1AtHalfDelta < -0.04) failures.push("nested run F1 at 0.50 regressed by more than 0.04")
  const perPosition = RUN_POSITIONS.map(position => {
    const challenger = byPosition.find(group => group.key === position)!
    const baseline = frozenByPosition.find(group => group.key === position)!
    const challengerThreshold = runAtHalf(challenger)
    const frozenThreshold = runAtHalf(baseline)
    const positiveEvents = frozenThreshold.actualPositives
    const frozenRecallAtHalf = positiveEvents ? frozenThreshold.recall : null
    const challengerRecallAtHalf = positiveEvents ? challengerThreshold.recall : null
    return {
      position,
      support: baseline.runMetrics.evaluatedEvents,
      positiveEvents,
      frozenV1BrierScore: baseline.runMetrics.brierScore,
      challengerBrierScore: challenger.runMetrics.brierScore,
      brierDelta: challenger.runMetrics.brierScore - baseline.runMetrics.brierScore,
      frozenV1RecallAtHalf: frozenRecallAtHalf,
      challengerRecallAtHalf,
      recallAtHalfDelta: frozenRecallAtHalf === null || challengerRecallAtHalf === null
        ? null : challengerRecallAtHalf - frozenRecallAtHalf,
    }
  })
  perPosition.forEach(position => {
    if (position.brierDelta > 0.02) {
      failures.push(`${position.position} nested run Brier regressed by more than 0.02`)
    }
    if (position.recallAtHalfDelta !== null && position.recallAtHalfDelta < -0.1) {
      failures.push(`${position.position} nested run recall regressed by more than 0.10`)
    }
  })
  return {
    eligibleForShadow: failures.length === 0,
    brierDelta,
    logLossDelta,
    precisionAtHalfDelta,
    recallAtHalfDelta,
    f1AtHalfDelta,
    perPosition,
    failures,
  }
}

export const offlinePromotionReason = (
  pickPositionEligibleForShadow: boolean,
  runOnlyEligibleForShadow: boolean,
): string => {
  if (runOnlyEligibleForShadow && !pickPositionEligibleForShadow) {
    return "Run-only offline gates passed; pick-position prediction remains frozen v1. Prospective shadow validation is still required; no live promotion has occurred."
  }
  if (pickPositionEligibleForShadow && runOnlyEligibleForShadow) {
    return "Offline run-only and pick-position gates passed. Prospective shadow validation is still required; no live promotion has occurred."
  }
  if (pickPositionEligibleForShadow) {
    return "Pick-position offline gates passed, but run-only gates did not. Prospective shadow validation is still required; no live promotion has occurred."
  }
  return "Offline gates did not pass; pick-position prediction remains frozen v1 and prospective shadow validation is still required."
}
