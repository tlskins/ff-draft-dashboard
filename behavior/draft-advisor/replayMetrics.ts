import { FantasyPosition } from "../../types"
import {
  createRecordedDraftAdvisorContextAtBoundary,
} from "./completedDraftReplay"
import { createOpponentForecast } from "./opponentModel"
import type {
  RecordedCompletedDraftReplay,
  ReplayForecastObservation,
} from "./completedDraftReplay"
import {
  createReplayForecastObservationFingerprint,
  MAX_REPLAY_FORECAST_OBSERVATIONS,
  REPLAY_FORECAST_EVIDENCE_VERSION,
  REPLAY_FORECAST_MODEL_IDENTITY,
} from "./replayForecastEvidence"
import type {
  DraftAdvisorContext,
  OpponentForecast,
  OpponentModelKind,
} from "./types"

export interface ActualOpponentPick {
  overallPick: number
  playerId: string
  position: FantasyPosition
}

export interface OpponentReplayCase {
  id: string
  context: DraftAdvisorContext
  targetRosterIndex: number
  actualPicks: ActualOpponentPick[]
}

export interface OpponentForecastMetrics {
  evaluatedPicks: number
  positionBrierScore: number
  topPositionAccuracy: number
  playerTopThreeAccuracy: number
  runPrecision: number
  runRecall: number
  tierCrossingBrierScore: number
}

export interface OpponentReplayMetrics extends OpponentForecastMetrics {
  model: OpponentModelKind
  replayCount: number
  latencyP95Ms: number
}

export interface RecordedOpponentModelFixtureResult {
  available: true
  fixtureId: string
  leagueFormat: string
  labeledWindowCount: number
  labeledPickCount: number
  metrics: OpponentForecastMetrics
}

export type RecordedOpponentModelReplayResult =
  | {
      available: true
      model: OpponentModelKind
      labeledFixtureCount: number
      labeledWindowCount: number
      labeledPickCount: number
      metrics: OpponentForecastMetrics
      byFixture: RecordedOpponentModelFixtureResult[]
      byLeagueFormat: Array<{
        leagueFormat: string
        labeledFixtureCount: number
        labeledWindowCount: number
        labeledPickCount: number
        metrics: OpponentForecastMetrics
      }>
    }
  | {
      available: false
      model: OpponentModelKind
      reason: string
    }

export interface OpponentForecastMetricDeltas {
  positionBrierScore: number
  topPositionAccuracy: number
  playerTopThreeAccuracy: number
  runPrecision: number
  runRecall: number
  tierCrossingBrierScore: number
}

export type RecordedOpponentModelComparison =
  | {
      available: true
      v1: Extract<RecordedOpponentModelReplayResult, { available: true }>
      v2: Extract<RecordedOpponentModelReplayResult, { available: true }>
      /** Stored live v1 scores, retained only to audit replay fidelity. */
      storedV1: {
        labeledFixtureCount: number
        labeledWindowCount: number
        labeledPickCount: number
        metrics: OpponentForecastMetrics
      }
      /** Reconstructed-v1 minus stored-v1; zero means exact scoring fidelity. */
      v1ReconstructionDeltas: OpponentForecastMetricDeltas
      deltas: OpponentForecastMetricDeltas
      byFixture: Array<{
        fixtureId: string
        leagueFormat: string
        v1: OpponentForecastMetrics
        v2: OpponentForecastMetrics
        deltas: OpponentForecastMetricDeltas
      }>
      byLeagueFormat: Array<{
        leagueFormat: string
        v1: OpponentForecastMetrics
        v2: OpponentForecastMetrics
        deltas: OpponentForecastMetricDeltas
      }>
    }
  | {
      available: false
      reason: string
    }

export type RecordedOpponentEvidenceResult =
  | {
      available: true
      labeledWindowCount: number
      labeledPickCount: number
      metrics: OpponentForecastMetrics
    }
  | {
      available: false
      reason: string
    }

const mean = (values: number[]): number =>
  values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0

const topPosition = (
  forecast: OpponentForecast["picks"][number],
): FantasyPosition | null => [...forecast.positionProbabilities]
  .sort((left, right) =>
    right.probability - left.probability
    || left.position.localeCompare(right.position))[0]?.position || null

export const scoreOpponentForecast = (
  forecast: OpponentForecast,
  actualPicks: ActualOpponentPick[],
  alertThreshold = 0.5,
): OpponentForecastMetrics => {
  const actualByPick = new Map(
    actualPicks.map(pick => [pick.overallPick, pick]),
  )
  const evaluated = forecast.picks.flatMap(pick => {
    const actual = actualByPick.get(pick.overallPick)
    return actual ? [{ forecast: pick, actual }] : []
  })
  const brierScores = evaluated.map(({ forecast: pick, actual }) =>
    pick.positionProbabilities.reduce((score, candidate) =>
      score + (
        candidate.probability
        - (candidate.position === actual.position ? 1 : 0)
      ) ** 2, 0))
  const positionHits = evaluated.map(({ forecast: pick, actual }) =>
    topPosition(pick) === actual.position ? 1 : 0)
  const playerHits = evaluated.map(({ forecast: pick, actual }) =>
    [...pick.playerProbabilities]
      .sort((left, right) =>
        right.overallProbability - left.overallProbability)
      .slice(0, 3)
      .some(player => player.playerId === actual.playerId) ? 1 : 0)

  let runTruePositives = 0
  let runPredictedPositives = 0
  let runActualPositives = 0
  forecast.runProbabilities.forEach(run => {
    const predicted = run.probability >= alertThreshold
    const actual = actualPicks.filter(pick =>
      pick.position === run.position).length >= run.minimumPicks
    if (predicted) runPredictedPositives += 1
    if (actual) runActualPositives += 1
    if (predicted && actual) runTruePositives += 1
  })

  const actualPlayerIds = new Set(actualPicks.map(pick => pick.playerId))
  const tierBrierScores = forecast.tierBoundaryProbabilities.map(boundary => {
    const crossed = boundary.playerIds.every(playerId =>
      actualPlayerIds.has(playerId))
    return (boundary.probability - (crossed ? 1 : 0)) ** 2
  })

  return {
    evaluatedPicks: evaluated.length,
    positionBrierScore: mean(brierScores),
    topPositionAccuracy: mean(positionHits),
    playerTopThreeAccuracy: mean(playerHits),
    runPrecision: runPredictedPositives > 0
      ? runTruePositives / runPredictedPositives
      : runActualPositives === 0 ? 1 : 0,
    runRecall: runActualPositives > 0
      ? runTruePositives / runActualPositives
      : 1,
    tierCrossingBrierScore: mean(tierBrierScores),
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value)

const isProbability = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1

const isForecastPosition = (value: unknown): value is FantasyPosition =>
  value === FantasyPosition.QUARTERBACK
  || value === FantasyPosition.RUNNING_BACK
  || value === FantasyPosition.WIDE_RECEIVER
  || value === FantasyPosition.TIGHT_END

const expectedForecastPicks = (
  fixture: RecordedCompletedDraftReplay,
  observation: ReplayForecastObservation,
): Array<{ overallPick: number; rosterIndex: number }> => {
  const expected: Array<{ overallPick: number; rosterIndex: number }> = []
  for (let overallPick = observation.observedThroughOverallPick + 1;
    overallPick <= fixture.actualPicks.length;
    overallPick += 1) {
    const rosterIndex = fixture.actualPicks[overallPick - 1]?.rosterIndex
    if (rosterIndex === observation.targetRosterIndex) {
      if (expected.length > 0) break
      continue
    }
    expected.push({ overallPick, rosterIndex })
  }
  return expected
}

const forecastShapeErrors = (
  value: unknown,
  observation: ReplayForecastObservation,
  fixture: RecordedCompletedDraftReplay,
): string[] => {
  if (!isRecord(value) || value.schemaVersion !== 1
    || value.model !== observation.model
    || value.targetRosterIndex !== observation.targetRosterIndex
    || !Array.isArray(value.picks)
    || !Array.isArray(value.runProbabilities)
    || !Array.isArray(value.tierBoundaryProbabilities)) {
    return ["forecast shape is invalid"]
  }
  const picks = value.picks as Array<Record<string, unknown>>
  const pickIds = new Set<number>()
  if (picks.length === 0 || picks.some(pick => !isRecord(pick)
    || !Number.isInteger(pick.overallPick)
    || (pick.overallPick as number) <= observation.observedThroughOverallPick
    || (pick.overallPick as number) > fixture.actualPicks.length
    || pickIds.has(pick.overallPick as number)
    || (pickIds.add(pick.overallPick as number), false)
    || pick.rosterIndex !== fixture.actualPicks[(pick.overallPick as number) - 1]?.rosterIndex
    || pick.rosterIndex === observation.targetRosterIndex
    || !Array.isArray(pick.positionProbabilities)
    || !Array.isArray(pick.playerProbabilities)
    || pick.positionProbabilities.some(candidate => !isRecord(candidate)
      || !isForecastPosition(candidate.position)
      || !isProbability(candidate.probability))
    || pick.playerProbabilities.some(candidate => !isRecord(candidate)
      || typeof candidate.playerId !== "string"
      || typeof candidate.name !== "string"
      || !isForecastPosition(candidate.position)
      || !isProbability(candidate.conditionalProbability)
      || !isProbability(candidate.overallProbability)))) {
    return ["forecast picks are invalid or look ahead"]
  }
  const expected = expectedForecastPicks(fixture, observation)
  if (picks.length !== expected.length || picks.some((pick, index) =>
    (pick.overallPick as number) !== expected[index].overallPick
    || pick.rosterIndex !== expected[index].rosterIndex)) {
    return ["forecast picks do not match the observed opponent window"]
  }
  const epsilon = 0.000001
  if (picks.some(pick => {
    const positions = new Set((pick.positionProbabilities as Array<Record<string, unknown>>)
      .map(candidate => candidate.position))
    const positionTotal = (pick.positionProbabilities as Array<Record<string, number>>)
      .reduce((sum, candidate) => sum + candidate.probability, 0)
    const playerIds = new Set<string>()
    const duplicatePlayer = (pick.playerProbabilities as Array<Record<string, unknown>>)
      .some(candidate => {
        const playerId = candidate.playerId as string
        if (playerIds.has(playerId)) return true
        playerIds.add(playerId)
        return false
      })
    const playerConsistency = Array.from(positions).every(position => {
      const players = (pick.playerProbabilities as Array<Record<string, unknown>>)
        .filter(candidate => candidate.position === position)
      if (players.length === 0) return true
      const conditionalTotal = players.reduce((sum, candidate) =>
        sum + (candidate.conditionalProbability as number), 0)
      const positionProbability = (pick.positionProbabilities as Array<Record<string, unknown>>)
        .find(candidate => candidate.position === position)?.probability as number
      return Math.abs(conditionalTotal - 1) <= epsilon
        && players.every(candidate => Math.abs(
          (candidate.overallProbability as number)
          - (candidate.conditionalProbability as number) * positionProbability,
        ) <= epsilon)
    })
    return positions.size !== 4
      || (pick.positionProbabilities as unknown[]).length !== 4
      || Math.abs(positionTotal - 1) > epsilon
      || duplicatePlayer || !playerConsistency
  })) {
    return ["forecast probability vectors are invalid"]
  }
  const runPositions = new Set<unknown>()
  const tierKeys = new Set<string>()
  if ((value.runProbabilities as unknown[]).length !== 4
    || (value.runProbabilities as unknown[]).some(run => !isRecord(run)
    || !isForecastPosition(run.position)
    || runPositions.has(run.position)
    || (runPositions.add(run.position), false)
    || !Number.isInteger(run.minimumPicks) || (run.minimumPicks as number) < 1
    || !isProbability(run.probability))
    || (value.tierBoundaryProbabilities as unknown[]).some(boundary => !isRecord(boundary)
      || !isForecastPosition(boundary.position)
      || !Number.isInteger(boundary.userTier) || (boundary.userTier as number) < 1
      || !Array.isArray(boundary.playerIds)
      || boundary.playerIds.length === 0
      || new Set(boundary.playerIds).size !== boundary.playerIds.length
      || boundary.playerIds.some(playerId => typeof playerId !== "string")
      || tierKeys.has(`${boundary.position}:${boundary.userTier}`)
      || (tierKeys.add(`${boundary.position}:${boundary.userTier}`), false)
      || !isProbability(boundary.probability))) {
    return ["forecast probabilities are invalid"]
  }
  return []
}

/**
 * Optional evidence is validated separately from fixture validity. A corrupt
 * label therefore cannot inflate opponent metrics or erase valid roster proof.
 */
export const validateRecordedOpponentForecastEvidence = (
  fixture: RecordedCompletedDraftReplay,
): string[] => {
  const evidence = fixture.forecastEvidence
  if (!evidence) return []
  const errors: string[] = []
  if (!isRecord(evidence) || evidence.schemaVersion !== REPLAY_FORECAST_EVIDENCE_VERSION
    || evidence.sessionId !== fixture.id || !Array.isArray(evidence.observations)) {
    return ["forecast evidence envelope is invalid"]
  }
  if (evidence.observations.length === 0
    || evidence.observations.length > MAX_REPLAY_FORECAST_OBSERVATIONS) {
    errors.push("forecast evidence observation count is invalid")
  }
  const boundaries = new Set<number>()
  evidence.observations.forEach((candidate, index) => {
    if (!isRecord(candidate)
      || !Number.isInteger(candidate.observedThroughOverallPick)
      || candidate.observedThroughOverallPick < 0
      || candidate.observedThroughOverallPick >= fixture.actualPicks.length
      || boundaries.has(candidate.observedThroughOverallPick)
      || (boundaries.add(candidate.observedThroughOverallPick), false)
      || typeof candidate.inputFingerprint !== "string"
      || !/^[a-f0-9]{8}$/.test(candidate.inputFingerprint)
      || typeof candidate.observationFingerprint !== "string"
      || !/^[a-f0-9]{8}$/.test(candidate.observationFingerprint)
      || candidate.modelIdentity !== REPLAY_FORECAST_MODEL_IDENTITY
      || !["adp_only", "need_only", "combined"].includes(candidate.model as string)
      || candidate.targetRosterIndex !== fixture.targetRosterIndex) {
      errors.push(`forecast observation ${index + 1} is invalid`)
      return
    }
    const observation = candidate as unknown as ReplayForecastObservation
    const shapeErrors = forecastShapeErrors(observation.forecast, observation, fixture)
    if (shapeErrors.length > 0) {
      errors.push(`forecast observation ${index + 1} ${shapeErrors[0]}`)
      return
    }
    const expectedFingerprint = createReplayForecastObservationFingerprint({
      observedThroughOverallPick: observation.observedThroughOverallPick,
      modelIdentity: observation.modelIdentity,
      model: observation.model,
      targetRosterIndex: observation.targetRosterIndex,
      forecast: observation.forecast,
    })
    if (observation.observationFingerprint !== expectedFingerprint) {
      errors.push(`forecast observation ${index + 1} observation fingerprint is invalid`)
    }
  })
  return errors
}

const aggregateEvidenceMetrics = (
  scored: OpponentForecastMetrics[],
): OpponentForecastMetrics => {
  const totalPicks = scored.reduce((sum, metric) => sum + metric.evaluatedPicks, 0)
  const pickWeighted = (
    key: "positionBrierScore" | "topPositionAccuracy" | "playerTopThreeAccuracy",
  ) => totalPicks === 0 ? 0 : scored.reduce((sum, metric) =>
    sum + metric[key] * metric.evaluatedPicks, 0) / totalPicks
  return {
    evaluatedPicks: totalPicks,
    positionBrierScore: pickWeighted("positionBrierScore"),
    topPositionAccuracy: pickWeighted("topPositionAccuracy"),
    playerTopThreeAccuracy: pickWeighted("playerTopThreeAccuracy"),
    runPrecision: mean(scored.map(metric => metric.runPrecision)),
    runRecall: mean(scored.map(metric => metric.runRecall)),
    tierCrossingBrierScore: mean(scored.map(metric => metric.tierCrossingBrierScore)),
  }
}

/**
 * Pick labels use the latest forecast boundary strictly before that pick. Run
 * and tier labels instead use one widest (earliest) observation per identical
 * terminal forecast horizon, scored against that observation's full window.
 * Keeping these denominator rules separate avoids double-counting overlaps or
 * evaluating a wide run forecast against a later, partial set of labels.
 */
export const scoreRecordedOpponentForecastEvidence = (
  fixture: RecordedCompletedDraftReplay,
): RecordedOpponentEvidenceResult => {
  if (!fixture.forecastEvidence) {
    return {
      available: false,
      reason: "completed replay fixtures do not yet preserve forecast labels",
    }
  }
  const errors = validateRecordedOpponentForecastEvidence(fixture)
  if (errors.length > 0) {
    return {
      available: false,
      reason: `forecast evidence is invalid: ${errors.join("; ")}`,
    }
  }
  const observations = fixture.forecastEvidence.observations
  const actualOpponentPicks: ActualOpponentPick[] = []
  const validPositions = new Set<FantasyPosition>([
    FantasyPosition.QUARTERBACK,
    FantasyPosition.RUNNING_BACK,
    FantasyPosition.WIDE_RECEIVER,
    FantasyPosition.TIGHT_END,
  ])
  fixture.actualPicks.forEach(actual => {
    if (!actual.playerId || actual.rosterIndex === fixture.targetRosterIndex) return
    const player = fixture.players.find(candidate => candidate.id === actual.playerId)
    if (!player || !validPositions.has(player.position)) return
    actualOpponentPicks.push({
      overallPick: actual.overallPick,
      playerId: actual.playerId,
      position: player.position,
    })
  })
  const pickScores = actualOpponentPicks.flatMap(actual => {
    const owner = observations
      .filter(observation => observation.observedThroughOverallPick < actual.overallPick
        && observation.forecast.picks.some(pick => pick.overallPick === actual.overallPick))
      .sort((left, right) =>
        right.observedThroughOverallPick - left.observedThroughOverallPick)[0]
    return owner ? [scoreOpponentForecast(owner.forecast, [actual])] : []
  })
  if (pickScores.length === 0) {
    return {
      available: false,
      reason: "forecast evidence has no labeled opponent picks",
    }
  }
  const representativeWindows = new Map<number, ReplayForecastObservation>()
  observations.forEach(observation => {
    const terminalPick = Math.max(...observation.forecast.picks.map(pick => pick.overallPick))
    const existing = representativeWindows.get(terminalPick)
    if (!existing || observation.observedThroughOverallPick
      < existing.observedThroughOverallPick) {
      representativeWindows.set(terminalPick, observation)
    }
  })
  const windowScores = Array.from(representativeWindows.values()).map(observation => {
    const forecastPickIds = new Set(observation.forecast.picks.map(pick => pick.overallPick))
    return scoreOpponentForecast(
      observation.forecast,
      actualOpponentPicks.filter(actual => forecastPickIds.has(actual.overallPick)),
    )
  })
  const pickMetrics = aggregateEvidenceMetrics(pickScores)
  const metrics: OpponentForecastMetrics = {
    ...pickMetrics,
    runPrecision: mean(windowScores.map(metric => metric.runPrecision)),
    runRecall: mean(windowScores.map(metric => metric.runRecall)),
    tierCrossingBrierScore: mean(
      windowScores.map(metric => metric.tierCrossingBrierScore),
    ),
  }
  return {
    available: true,
    labeledWindowCount: windowScores.length,
    labeledPickCount: metrics.evaluatedPicks,
    metrics,
  }
}

const opponentActualPicks = (
  fixture: RecordedCompletedDraftReplay,
): ActualOpponentPick[] => {
  const validPositions = new Set<FantasyPosition>([
    FantasyPosition.QUARTERBACK,
    FantasyPosition.RUNNING_BACK,
    FantasyPosition.WIDE_RECEIVER,
    FantasyPosition.TIGHT_END,
  ])
  return fixture.actualPicks.flatMap(actual => {
    if (!actual.playerId || actual.rosterIndex === fixture.targetRosterIndex) {
      return []
    }
    const player = fixture.players.find(candidate => candidate.id === actual.playerId)
    return player && validPositions.has(player.position)
      ? [{
          overallPick: actual.overallPick,
          playerId: actual.playerId,
          position: player.position,
        }]
      : []
  })
}

export const leagueFormatFor = (fixture: RecordedCompletedDraftReplay): string =>
  `${fixture.settings.numTeams}-team-${fixture.settings.ppr ? "PPR" : "STANDARD"}`
  + `-QB${fixture.settings.numStartingQbs}`
  + `-RB${fixture.settings.numStartingRbs}`
  + `-WR${fixture.settings.numStartingWrs}`
  + `-TE${fixture.settings.numStartingTes}`
  + `-flex-${fixture.settings.numFlex}`
  + `-bench-${fixture.settings.numBenchPlayers}`

const terminalPickForObservation = (
  observation: ReplayForecastObservation,
): number => Math.max(...observation.forecast.picks.map(pick => pick.overallPick))

/**
 * Pick classifiers have one label per opponent pick; run/tier classifiers have
 * one label per representative terminal window. Keep those denominators
 * separate so a 15-window fixture is not treated like a 6-window fixture.
 */
const aggregateRecordedMetrics = (
  results: Array<{
    labeledPickCount: number
    labeledWindowCount: number
    metrics: OpponentForecastMetrics
  }>,
): OpponentForecastMetrics => {
  const totalPicks = results.reduce((total, result) =>
    total + result.labeledPickCount, 0)
  const totalWindows = results.reduce((total, result) =>
    total + result.labeledWindowCount, 0)
  const pickWeighted = (
    key: "positionBrierScore" | "topPositionAccuracy" | "playerTopThreeAccuracy",
  ) => totalPicks === 0 ? 0 : results.reduce((total, result) =>
    total + result.metrics[key] * result.labeledPickCount, 0) / totalPicks
  const windowWeighted = (
    key: "runPrecision" | "runRecall" | "tierCrossingBrierScore",
  ) => totalWindows === 0 ? 0 : results.reduce((total, result) =>
    total + result.metrics[key] * result.labeledWindowCount, 0) / totalWindows
  return {
    evaluatedPicks: totalPicks,
    positionBrierScore: pickWeighted("positionBrierScore"),
    topPositionAccuracy: pickWeighted("topPositionAccuracy"),
    playerTopThreeAccuracy: pickWeighted("playerTopThreeAccuracy"),
    runPrecision: windowWeighted("runPrecision"),
    runRecall: windowWeighted("runRecall"),
    tierCrossingBrierScore: windowWeighted("tierCrossingBrierScore"),
  }
}

/**
 * Replays a challenger against the old live observation boundaries. Stored
 * forecasts contribute only their boundary and terminal horizon; neither their
 * probabilities nor candidate ordering is supplied to the challenger.
 */
export const replayRecordedOpponentModel = (
  fixture: RecordedCompletedDraftReplay,
  model: OpponentModelKind,
): RecordedOpponentModelFixtureResult | { available: false; reason: string } => {
  if (!fixture.forecastEvidence) {
    return { available: false, reason: "fixture has no live forecast boundaries" }
  }
  const errors = validateRecordedOpponentForecastEvidence(fixture)
  if (errors.length > 0) {
    return { available: false, reason: `forecast evidence is invalid: ${errors.join("; ")}` }
  }
  const forecasts = fixture.forecastEvidence.observations.map(observation => {
    const terminalPick = terminalPickForObservation(observation)
    const expected = expectedForecastPicks(fixture, observation)
      .filter(pick => pick.overallPick <= terminalPick)
    const currentPick = expected[0]?.overallPick
    if (!currentPick) {
      throw new Error(
        `Recorded opponent window has no opponent pick at ${observation.observedThroughOverallPick}`,
      )
    }
    const context = createRecordedDraftAdvisorContextAtBoundary(
      fixture,
      observation.observedThroughOverallPick,
      terminalPick - currentPick + 2,
      currentPick,
    )
    const forecast = createOpponentForecast(context, {
      model,
      targetRosterIndex: fixture.targetRosterIndex,
    })
    if (forecast.picks.length !== expected.length || forecast.picks.some((pick, index) =>
      pick.overallPick !== expected[index].overallPick
      || pick.rosterIndex !== expected[index].rosterIndex)) {
      throw new Error(
        `Recorded opponent window cannot be reconstructed at ${observation.observedThroughOverallPick}`,
      )
    }
    return { observation, terminalPick, forecast }
  })
  const actualPicks = opponentActualPicks(fixture)
  const pickScores = actualPicks.flatMap(actual => {
    const owner = forecasts
      .filter(candidate =>
        candidate.observation.observedThroughOverallPick < actual.overallPick
        && candidate.terminalPick >= actual.overallPick)
      .sort((left, right) => right.observation.observedThroughOverallPick
        - left.observation.observedThroughOverallPick)[0]
    return owner ? [scoreOpponentForecast(owner.forecast, [actual])] : []
  })
  if (pickScores.length === 0) {
    return { available: false, reason: "forecast evidence has no labeled opponent picks" }
  }
  const representativeWindows = new Map<number, typeof forecasts[number]>()
  forecasts.forEach(candidate => {
    const existing = representativeWindows.get(candidate.terminalPick)
    if (!existing || candidate.observation.observedThroughOverallPick
      < existing.observation.observedThroughOverallPick) {
      representativeWindows.set(candidate.terminalPick, candidate)
    }
  })
  const windowScores = Array.from(representativeWindows.values()).map(candidate =>
    scoreOpponentForecast(candidate.forecast, actualPicks.filter(actual =>
      actual.overallPick > candidate.observation.observedThroughOverallPick
      && actual.overallPick <= candidate.terminalPick)))
  const pickMetrics = aggregateEvidenceMetrics(pickScores)
  const metrics: OpponentForecastMetrics = {
    ...pickMetrics,
    runPrecision: mean(windowScores.map(metric => metric.runPrecision)),
    runRecall: mean(windowScores.map(metric => metric.runRecall)),
    tierCrossingBrierScore: mean(
      windowScores.map(metric => metric.tierCrossingBrierScore),
    ),
  }
  return {
    available: true,
    fixtureId: fixture.id,
    leagueFormat: leagueFormatFor(fixture),
    labeledWindowCount: windowScores.length,
    labeledPickCount: metrics.evaluatedPicks,
    metrics,
  }
}

export const runRecordedOpponentModelReplay = (
  fixtures: RecordedCompletedDraftReplay[],
  model: OpponentModelKind,
): RecordedOpponentModelReplayResult => {
  const labeledFixtures = fixtures.filter(fixture => fixture.forecastEvidence)
  if (labeledFixtures.length === 0) {
    return { available: false, model, reason: "no fixtures have live forecast boundaries" }
  }
  const results = labeledFixtures.flatMap(fixture => {
    const result = replayRecordedOpponentModel(fixture, model)
    return result.available ? [] : [result]
  })
  if (results.length > 0) {
    return { available: false, model, reason: results.map(result => result.reason).join("; ") }
  }
  const byFixture = labeledFixtures.map(fixture => replayRecordedOpponentModel(fixture, model))
    .filter((result): result is RecordedOpponentModelFixtureResult => result.available)
  if (byFixture.length === 0) {
    return { available: false, model, reason: "no fixtures supplied" }
  }
  const formatGroups = new Map<string, RecordedOpponentModelFixtureResult[]>()
  byFixture.forEach(result => {
    const group = formatGroups.get(result.leagueFormat) || []
    group.push(result)
    formatGroups.set(result.leagueFormat, group)
  })
  return {
    available: true,
    model,
    labeledFixtureCount: byFixture.length,
    labeledWindowCount: byFixture.reduce((total, result) =>
      total + result.labeledWindowCount, 0),
    labeledPickCount: byFixture.reduce((total, result) =>
      total + result.labeledPickCount, 0),
    metrics: aggregateRecordedMetrics(byFixture),
    byFixture,
    byLeagueFormat: Array.from(formatGroups.entries()).map(([leagueFormat, group]) => ({
      leagueFormat,
      labeledFixtureCount: group.length,
      labeledWindowCount: group.reduce((total, result) =>
        total + result.labeledWindowCount, 0),
      labeledPickCount: group.reduce((total, result) =>
        total + result.labeledPickCount, 0),
      metrics: aggregateRecordedMetrics(group),
    })),
  }
}

const metricDeltas = (
  v1: OpponentForecastMetrics,
  v2: OpponentForecastMetrics,
): OpponentForecastMetricDeltas => ({
  positionBrierScore: v2.positionBrierScore - v1.positionBrierScore,
  topPositionAccuracy: v2.topPositionAccuracy - v1.topPositionAccuracy,
  playerTopThreeAccuracy: v2.playerTopThreeAccuracy - v1.playerTopThreeAccuracy,
  runPrecision: v2.runPrecision - v1.runPrecision,
  runRecall: v2.runRecall - v1.runRecall,
  tierCrossingBrierScore: v2.tierCrossingBrierScore - v1.tierCrossingBrierScore,
})

/** Compare rebuilt v1 and v2 forecasts without changing the live v1 model. */
export const compareRecordedOpponentModels = (
  fixtures: RecordedCompletedDraftReplay[],
): RecordedOpponentModelComparison => {
  const v1 = runRecordedOpponentModelReplay(fixtures, "combined")
  const v2 = runRecordedOpponentModelReplay(fixtures, "combined_v2")
  if (!v1.available) return { available: false, reason: `v1 unavailable: ${v1.reason}` }
  if (!v2.available) return { available: false, reason: `v2 unavailable: ${v2.reason}` }
  const storedV1Results = fixtures.filter(fixture => fixture.forecastEvidence)
    .map(fixture => scoreRecordedOpponentForecastEvidence(fixture))
  const unavailableStoredV1 = storedV1Results.find(result => !result.available)
  if (unavailableStoredV1 && !unavailableStoredV1.available) {
    return { available: false, reason: `stored v1 unavailable: ${unavailableStoredV1.reason}` }
  }
  const storedV1Available = storedV1Results.filter(
    (result): result is Extract<RecordedOpponentEvidenceResult, { available: true }> =>
      result.available,
  )
  const storedV1 = {
    labeledFixtureCount: storedV1Available.length,
    labeledWindowCount: storedV1Available.reduce((total, result) =>
      total + result.labeledWindowCount, 0),
    labeledPickCount: storedV1Available.reduce((total, result) =>
      total + result.labeledPickCount, 0),
    metrics: aggregateRecordedMetrics(storedV1Available),
  }
  const v2Fixtures = new Map(v2.byFixture.map(result => [result.fixtureId, result]))
  const v2Formats = new Map(v2.byLeagueFormat.map(result => [result.leagueFormat, result]))
  return {
    available: true,
    v1,
    v2,
    storedV1,
    v1ReconstructionDeltas: metricDeltas(storedV1.metrics, v1.metrics),
    deltas: metricDeltas(v1.metrics, v2.metrics),
    byFixture: v1.byFixture.flatMap(result => {
      const challenger = v2Fixtures.get(result.fixtureId)
      return challenger ? [{
        fixtureId: result.fixtureId,
        leagueFormat: result.leagueFormat,
        v1: result.metrics,
        v2: challenger.metrics,
        deltas: metricDeltas(result.metrics, challenger.metrics),
      }] : []
    }),
    byLeagueFormat: v1.byLeagueFormat.flatMap(result => {
      const challenger = v2Formats.get(result.leagueFormat)
      return challenger ? [{
        leagueFormat: result.leagueFormat,
        v1: result.metrics,
        v2: challenger.metrics,
        deltas: metricDeltas(result.metrics, challenger.metrics),
      }] : []
    }),
  }
}

const percentile95 = (durations: number[]): number => {
  if (durations.length === 0) return 0
  const sorted = [...durations].sort((left, right) => left - right)
  return sorted[Math.ceil(sorted.length * 0.95) - 1]
}

export const runOpponentModelReplay = (
  cases: OpponentReplayCase[],
  model: OpponentModelKind,
): OpponentReplayMetrics => {
  const durations: number[] = []
  const scored = cases.map(replay => {
    const startedAt = performance.now()
    const forecast = createOpponentForecast(replay.context, {
      model,
      targetRosterIndex: replay.targetRosterIndex,
    })
    durations.push(performance.now() - startedAt)
    return scoreOpponentForecast(forecast, replay.actualPicks)
  })
  const totalPicks = scored.reduce(
    (sum, metrics) => sum + metrics.evaluatedPicks,
    0,
  )
  const pickWeighted = (
    metric: keyof Pick<
      OpponentForecastMetrics,
      | "positionBrierScore"
      | "topPositionAccuracy"
      | "playerTopThreeAccuracy"
    >,
  ) => totalPicks > 0
    ? scored.reduce(
      (sum, metrics) =>
        sum + metrics[metric] * metrics.evaluatedPicks,
      0,
    ) / totalPicks
    : 0

  return {
    model,
    replayCount: cases.length,
    evaluatedPicks: totalPicks,
    positionBrierScore: pickWeighted("positionBrierScore"),
    topPositionAccuracy: pickWeighted("topPositionAccuracy"),
    playerTopThreeAccuracy: pickWeighted("playerTopThreeAccuracy"),
    runPrecision: mean(scored.map(metrics => metrics.runPrecision)),
    runRecall: mean(scored.map(metrics => metrics.runRecall)),
    tierCrossingBrierScore: mean(
      scored.map(metrics => metrics.tierCrossingBrierScore),
    ),
    latencyP95Ms: percentile95(durations),
  }
}
