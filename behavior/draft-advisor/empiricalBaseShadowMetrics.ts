import { FantasyPosition } from "../../types"
import {
  EMPIRICAL_BASE_SHADOW_ARTIFACT,
} from "./empiricalBaseShadow"
import {
  MAX_REPLAY_FORECAST_OBSERVATIONS,
  createEmpiricalBaseShadowObservationFingerprint,
} from "./replayForecastEvidence"
import {
  scoreRecordedOpponentForecastEvidence,
} from "./replayMetrics"
import { probabilityOfAtLeast } from "./opponentModel"
import type {
  RecordedCompletedDraftReplay,
  ReplayEmpiricalBaseShadowObservation,
} from "./completedDraftReplay"

export interface EmpiricalBaseShadowMetrics {
  evaluatedPicks: number
  positionBrierScore: number
  topPositionAccuracy: number
  runPrecision: number
  runRecall: number
}

export type EmpiricalBaseShadowComparison =
  | {
      available: true
      fixtureId: string
      labeledWindowCount: number
      learnedBase: EmpiricalBaseShadowMetrics
      frozenV1: EmpiricalBaseShadowMetrics
      deltas: EmpiricalBaseShadowMetrics
      promotion: { promoted: false, reason: string }
    }
  | {
      available: false
      fixtureId: string
      reason: string
      promotion: { promoted: false, reason: string }
    }

export type EmpiricalBaseShadowCampaignEvaluation =
  | {
      available: true
      comparableFixtureCount: number
      labeledWindowCount: number
      learnedBase: EmpiricalBaseShadowMetrics
      frozenV1: EmpiricalBaseShadowMetrics
      deltas: EmpiricalBaseShadowMetrics
      byFixture: Extract<EmpiricalBaseShadowComparison, { available: true }>[]
      promotion: { promoted: false, reason: string }
    }
  | {
      available: false
      reason: string
      unavailableFixtures: Array<{ fixtureId: string, reason: string }>
      promotion: { promoted: false, reason: string }
    }

const positions = [
  FantasyPosition.QUARTERBACK,
  FantasyPosition.RUNNING_BACK,
  FantasyPosition.WIDE_RECEIVER,
  FantasyPosition.TIGHT_END,
]

const mean = (values: number[]): number => values.length
  ? values.reduce((sum, value) => sum + value, 0) / values.length
  : 0

const isProbability = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value)

const expectedOpponentPicks = (
  fixture: RecordedCompletedDraftReplay,
  observedThroughOverallPick: number,
  targetRosterIndex: number,
) => {
  const expected: Array<{ overallPick: number, rosterIndex: number }> = []
  for (let overallPick = observedThroughOverallPick + 1;
    overallPick <= fixture.actualPicks.length;
    overallPick += 1) {
    const rosterIndex = fixture.actualPicks[overallPick - 1]?.rosterIndex
    if (rosterIndex === targetRosterIndex) {
      if (expected.length) break
      continue
    }
    expected.push({ overallPick, rosterIndex })
  }
  return expected
}

export const validateEmpiricalBaseShadowEvidence = (
  fixture: RecordedCompletedDraftReplay,
): string[] => {
  const evidence = fixture.empiricalBaseShadowEvidence as unknown
  if (evidence === undefined) return []
  if (!isRecord(evidence) || evidence.schemaVersion !== 1 || evidence.sessionId !== fixture.id
    || !Array.isArray(evidence.observations)) return ["shadow evidence envelope is invalid"]
  const observations = evidence.observations
  if (!observations.length || observations.length > MAX_REPLAY_FORECAST_OBSERVATIONS) {
    return ["shadow evidence observation count is invalid"]
  }
  const boundaries = new Set<number>()
  const errors: string[] = []
  observations.forEach((candidate, index) => {
    const prefix = `shadow observation ${index + 1}`
    if (!isRecord(candidate)
      || !Number.isInteger(candidate.observedThroughOverallPick)
      || (candidate.observedThroughOverallPick as number) < 0
      || (candidate.observedThroughOverallPick as number) >= fixture.actualPicks.length
      || boundaries.has(candidate.observedThroughOverallPick as number)
      || typeof candidate.inputFingerprint !== "string"
      || !/^[a-f0-9]{8}$/.test(candidate.inputFingerprint)
      || typeof candidate.observationFingerprint !== "string"
      || !/^[a-f0-9]{8}$/.test(candidate.observationFingerprint)
      || candidate.modelIdentity !== EMPIRICAL_BASE_SHADOW_ARTIFACT.id
      || candidate.artifactId !== EMPIRICAL_BASE_SHADOW_ARTIFACT.id
      || candidate.trainingCorpusFingerprint
        !== EMPIRICAL_BASE_SHADOW_ARTIFACT.trainingCorpusFingerprint
      || candidate.targetRosterIndex !== fixture.targetRosterIndex
      || !isRecord(candidate.phaseProvenance)
      || (candidate.phaseProvenance.kind !== "known_total"
        && candidate.phaseProvenance.kind !== "fallback_context_horizon")
      || !Number.isInteger(candidate.phaseProvenance.totalDraftPicks)
      || (candidate.phaseProvenance.totalDraftPicks as number) <= 1
      || (candidate.phaseProvenance.kind === "known_total"
        && candidate.phaseProvenance.totalDraftPicks !== fixture.actualPicks.length)) {
      errors.push(`${prefix} is invalid`)
      return
    }
    boundaries.add(candidate.observedThroughOverallPick as number)
    const forecast = candidate.forecast
    const phase = candidate.phaseProvenance
    if (!isRecord(forecast) || forecast.schemaVersion !== 1
      || forecast.modelIdentity !== candidate.modelIdentity
      || forecast.artifactId !== candidate.artifactId
      || forecast.trainingCorpusFingerprint !== candidate.trainingCorpusFingerprint
      || forecast.targetRosterIndex !== candidate.targetRosterIndex
      || !isRecord(forecast.phaseProvenance)
      || forecast.phaseProvenance.kind !== phase.kind
      || forecast.phaseProvenance.totalDraftPicks !== phase.totalDraftPicks
      || !Array.isArray(forecast.picks)
      || !Array.isArray(forecast.runProbabilities)) {
      errors.push(`${prefix} forecast is invalid or looks ahead`)
      return
    }
    const expected = expectedOpponentPicks(
      fixture, candidate.observedThroughOverallPick as number, candidate.targetRosterIndex as number,
    )
    const picks = forecast.picks
    const picksValid = picks.length === expected.length && picks.every((pick, pickIndex) => {
      if (!isRecord(pick) || !Array.isArray(pick.positionProbabilities)) return false
      const probabilities = pick.positionProbabilities
      const probabilityTotal = probabilities.reduce((sum, item) =>
        sum + (isRecord(item) && isProbability(item.probability) ? item.probability : 0), 0)
      return pick.overallPick === expected[pickIndex].overallPick
        && pick.rosterIndex === expected[pickIndex].rosterIndex
        && probabilities.length === positions.length
        && new Set(probabilities.map(item => isRecord(item) ? item.position : null)).size === positions.length
        && probabilities.every(item => isRecord(item)
          && positions.includes(item.position as FantasyPosition)
          && isProbability(item.probability))
        && Math.abs(probabilityTotal - 1) <= 0.000001
    })
    const runs = forecast.runProbabilities
    const runPositions = new Set<unknown>()
    const runMinimums = new Set<number>()
    const runsValid = picksValid && runs.length === positions.length && runs.every(run => {
      if (!isRecord(run) || !positions.includes(run.position as FantasyPosition)
        || runPositions.has(run.position) || !Number.isInteger(run.minimumPicks)
        || (run.minimumPicks as number) < 1 || !isProbability(run.probability)) return false
      runPositions.add(run.position)
      runMinimums.add(run.minimumPicks as number)
      const expectedProbability = probabilityOfAtLeast(picks.map(pick => {
        const probabilities = (pick as Record<string, unknown>).positionProbabilities as unknown[]
        const position = probabilities.find(item => isRecord(item) && item.position === run.position)
        return isRecord(position) && isProbability(position.probability) ? position.probability : 0
      }), run.minimumPicks as number)
      return Math.abs((run.probability as number) - expectedProbability) <= 0.000001
    }) && runPositions.size === positions.length && runMinimums.size === 1
    if (!picksValid || !runsValid) {
      errors.push(`${prefix} forecast is invalid or looks ahead`)
      return
    }
    const observation = candidate as unknown as ReplayEmpiricalBaseShadowObservation
    const expectedFingerprint = createEmpiricalBaseShadowObservationFingerprint({
      observedThroughOverallPick: observation.observedThroughOverallPick,
      modelIdentity: observation.modelIdentity,
      artifactId: observation.artifactId,
      trainingCorpusFingerprint: observation.trainingCorpusFingerprint,
      targetRosterIndex: observation.targetRosterIndex,
      phaseProvenance: observation.phaseProvenance,
      forecast: forecast as unknown as ReplayEmpiricalBaseShadowObservation["forecast"],
    })
    if (observation.observationFingerprint !== expectedFingerprint) {
      errors.push(`${prefix} fingerprint is invalid`)
    }
  })
  return errors
}

const actualOpponentPicks = (fixture: RecordedCompletedDraftReplay) => fixture.actualPicks.flatMap(pick => {
  if (!pick.playerId || pick.rosterIndex === fixture.targetRosterIndex) return []
  const player = fixture.players.find(candidate => candidate.id === pick.playerId)
  return player && positions.includes(player.position)
    ? [{ overallPick: pick.overallPick, position: player.position }]
    : []
})

const topPosition = (probabilities: Array<{ position: FantasyPosition, probability: number }>) =>
  [...probabilities].sort((left, right) => right.probability - left.probability
    || left.position.localeCompare(right.position))[0]?.position

const scoreShadow = (
  fixture: RecordedCompletedDraftReplay,
): { metrics: EmpiricalBaseShadowMetrics, labeledWindowCount: number } | null => {
  const observations = fixture.empiricalBaseShadowEvidence?.observations || []
  const actual = actualOpponentPicks(fixture)
  const pickScores = actual.flatMap(label => {
    const owner = observations.filter(observation =>
      observation.observedThroughOverallPick < label.overallPick
      && observation.forecast.picks.some(pick => pick.overallPick === label.overallPick))
      .sort((left, right) => right.observedThroughOverallPick - left.observedThroughOverallPick)[0]
    const prediction = owner?.forecast.picks.find(pick => pick.overallPick === label.overallPick)
    return prediction ? [{ prediction, label }] : []
  })
  if (!pickScores.length) return null
  const representative = new Map<number, ReplayEmpiricalBaseShadowObservation>()
  observations.forEach(observation => {
    const terminal = Math.max(...observation.forecast.picks.map(pick => pick.overallPick))
    const previous = representative.get(terminal)
    if (!previous || observation.observedThroughOverallPick < previous.observedThroughOverallPick) {
      representative.set(terminal, observation)
    }
  })
  const brier = mean(pickScores.map(({ prediction, label }) => prediction.positionProbabilities
    .reduce((sum, candidate) => sum + (candidate.probability
      - (candidate.position === label.position ? 1 : 0)) ** 2, 0)))
  const accuracy = mean(pickScores.map(({ prediction, label }) =>
    topPosition(prediction.positionProbabilities) === label.position ? 1 : 0))
  const runWindows = Array.from(representative.values())
  const runPrecision = mean(runWindows.map(observation => {
    const terminal = Math.max(...observation.forecast.picks.map(pick => pick.overallPick))
    const labels = actual.filter(pick => pick.overallPick > observation.observedThroughOverallPick
      && pick.overallPick <= terminal)
    const predicted = observation.forecast.runProbabilities.filter(run => run.probability >= 0.5)
    if (!predicted.length) return 1
    return predicted.filter(run => labels.filter(label => label.position === run.position).length
      >= run.minimumPicks).length / predicted.length
  }))
  const runRecall = mean(runWindows.map(observation => {
    const terminal = Math.max(...observation.forecast.picks.map(pick => pick.overallPick))
    const labels = actual.filter(pick => pick.overallPick > observation.observedThroughOverallPick
      && pick.overallPick <= terminal)
    const actualRuns = observation.forecast.runProbabilities.filter(run =>
      labels.filter(label => label.position === run.position).length >= run.minimumPicks)
    if (!actualRuns.length) return 1
    return actualRuns.filter(run => run.probability >= 0.5).length / actualRuns.length
  }))
  return {
    labeledWindowCount: runWindows.length,
    metrics: {
      evaluatedPicks: pickScores.length,
      positionBrierScore: brier,
      topPositionAccuracy: accuracy,
      runPrecision,
      runRecall,
    },
  }
}

/**
 * Strictly offline reporting. It deliberately cannot promote the challenger;
 * an absent/mismatched parallel envelope is an unavailable evaluation.
 */
export const compareEmpiricalBaseShadowEvidence = (
  fixture: RecordedCompletedDraftReplay,
): EmpiricalBaseShadowComparison => {
  const unavailable = (reason: string): EmpiricalBaseShadowComparison => ({
    available: false, fixtureId: fixture.id, reason,
    promotion: { promoted: false, reason: "Shadow evidence is observational only" },
  })
  if (!fixture.forecastEvidence || !fixture.empiricalBaseShadowEvidence) {
    return unavailable("both frozen-v1 and learned-base shadow evidence are required")
  }
  const errors = validateEmpiricalBaseShadowEvidence(fixture)
  if (errors.length) return unavailable(errors.join("; "))
  if (fixture.empiricalBaseShadowEvidence.observations.some(observation =>
    observation.phaseProvenance.kind !== "known_total")) {
    return unavailable("shadow evidence uses fallback draft-phase provenance")
  }
  const frozenByBoundary = new Map(fixture.forecastEvidence.observations.map(observation => [
    observation.observedThroughOverallPick,
    observation.forecast.picks.map(pick => pick.overallPick),
  ]))
  const shadowBoundariesMatch = fixture.empiricalBaseShadowEvidence.observations.length
    === frozenByBoundary.size
    && fixture.empiricalBaseShadowEvidence.observations.every(observation => {
      const frozenPicks = frozenByBoundary.get(observation.observedThroughOverallPick)
      return frozenPicks !== undefined
        && frozenPicks.length === observation.forecast.picks.length
        && frozenPicks.every((overallPick, index) =>
          overallPick === observation.forecast.picks[index].overallPick)
    })
  if (!shadowBoundariesMatch) {
    return unavailable("shadow and frozen-v1 evidence do not share identical forecast boundaries")
  }
  const v1 = scoreRecordedOpponentForecastEvidence(fixture)
  if (!v1.available) return unavailable(`frozen v1 evidence unavailable: ${v1.reason}`)
  const shadow = scoreShadow(fixture)
  if (!shadow) return unavailable("shadow evidence has no labeled opponent picks")
  const frozenV1: EmpiricalBaseShadowMetrics = {
    evaluatedPicks: v1.metrics.evaluatedPicks,
    positionBrierScore: v1.metrics.positionBrierScore,
    topPositionAccuracy: v1.metrics.topPositionAccuracy,
    runPrecision: v1.metrics.runPrecision,
    runRecall: v1.metrics.runRecall,
  }
  if (shadow.metrics.evaluatedPicks !== frozenV1.evaluatedPicks) {
    return unavailable("shadow and frozen-v1 evidence do not label the same pick count")
  }
  if (shadow.labeledWindowCount !== v1.labeledWindowCount) {
    return unavailable("shadow and frozen-v1 evidence do not share representative run windows")
  }
  return {
    available: true,
    fixtureId: fixture.id,
    labeledWindowCount: shadow.labeledWindowCount,
    learnedBase: shadow.metrics,
    frozenV1,
    deltas: {
      evaluatedPicks: 0,
      positionBrierScore: shadow.metrics.positionBrierScore - frozenV1.positionBrierScore,
      topPositionAccuracy: shadow.metrics.topPositionAccuracy - frozenV1.topPositionAccuracy,
      runPrecision: shadow.metrics.runPrecision - frozenV1.runPrecision,
      runRecall: shadow.metrics.runRecall - frozenV1.runRecall,
    },
    promotion: { promoted: false, reason: "Shadow evidence is observational only" },
  }
}

/** Aggregate only truly comparable static windows; unavailable data is never zero-filled. */
export const runEmpiricalBaseShadowEvaluation = (
  fixtures: RecordedCompletedDraftReplay[],
): EmpiricalBaseShadowCampaignEvaluation => {
  const comparisons = fixtures.map(compareEmpiricalBaseShadowEvidence)
  const available = comparisons.filter(
    (comparison): comparison is Extract<EmpiricalBaseShadowComparison, { available: true }> =>
      comparison.available,
  )
  if (!available.length) {
    return {
      available: false,
      reason: "no fixtures have matching known-total learned-base shadow evidence",
      unavailableFixtures: comparisons.filter(
        (comparison): comparison is Extract<EmpiricalBaseShadowComparison, { available: false }> =>
          !comparison.available,
      ).map(comparison => ({ fixtureId: comparison.fixtureId, reason: comparison.reason })),
      promotion: { promoted: false, reason: "Shadow evidence is observational only" },
    }
  }
  const totalPicks = available.reduce((sum, comparison) =>
    sum + comparison.learnedBase.evaluatedPicks, 0)
  const totalWindows = available.reduce((sum, comparison) =>
    sum + comparison.labeledWindowCount, 0)
  const aggregate = (key: "learnedBase" | "frozenV1"): EmpiricalBaseShadowMetrics => ({
    evaluatedPicks: totalPicks,
    positionBrierScore: totalPicks ? available.reduce((sum, comparison) => sum
      + comparison[key].positionBrierScore * comparison[key].evaluatedPicks, 0) / totalPicks : 0,
    topPositionAccuracy: totalPicks ? available.reduce((sum, comparison) => sum
      + comparison[key].topPositionAccuracy * comparison[key].evaluatedPicks, 0) / totalPicks : 0,
    runPrecision: totalWindows ? available.reduce((sum, comparison) => sum
      + comparison[key].runPrecision * comparison.labeledWindowCount, 0) / totalWindows : 0,
    runRecall: totalWindows ? available.reduce((sum, comparison) => sum
      + comparison[key].runRecall * comparison.labeledWindowCount, 0) / totalWindows : 0,
  })
  const learnedBase = aggregate("learnedBase")
  const frozenV1 = aggregate("frozenV1")
  return {
    available: true,
    comparableFixtureCount: available.length,
    labeledWindowCount: totalWindows,
    learnedBase,
    frozenV1,
    deltas: {
      evaluatedPicks: 0,
      positionBrierScore: learnedBase.positionBrierScore - frozenV1.positionBrierScore,
      topPositionAccuracy: learnedBase.topPositionAccuracy - frozenV1.topPositionAccuracy,
      runPrecision: learnedBase.runPrecision - frozenV1.runPrecision,
      runRecall: learnedBase.runRecall - frozenV1.runRecall,
    },
    byFixture: available,
    promotion: { promoted: false, reason: "Shadow evidence is observational only" },
  }
}
