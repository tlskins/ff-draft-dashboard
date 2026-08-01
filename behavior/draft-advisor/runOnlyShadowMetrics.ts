import { FantasyPosition } from "../../types"
import { BOUNDED_RESIDUAL_RUN_SHADOW_ARTIFACT } from "./boundedResidualRunShadow"
import {
  MAX_REPLAY_FORECAST_OBSERVATIONS,
  createRunOnlyShadowObservationFingerprint,
} from "./replayForecastEvidence"
import { validateRecordedOpponentForecastEvidence } from "./replayMetrics"
import type { RecordedCompletedDraftReplay } from "./completedDraftReplay"

const positions = [FantasyPosition.QUARTERBACK, FantasyPosition.RUNNING_BACK,
  FantasyPosition.WIDE_RECEIVER, FantasyPosition.TIGHT_END]
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value)
const isProbability = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1
const expectedOpponentPicks = (fixture: RecordedCompletedDraftReplay, boundary: number) => {
  const expected: Array<{ overallPick: number, rosterIndex: number }> = []
  for (let pick = boundary + 1; pick <= fixture.actualPicks.length; pick += 1) {
    const rosterIndex = fixture.actualPicks[pick - 1]?.rosterIndex
    if (rosterIndex === fixture.targetRosterIndex) { if (expected.length) break; continue }
    expected.push({ overallPick: pick, rosterIndex })
  }
  return expected
}

/** Defensive validator for arbitrary exported JSON; no malformed envelope throws. */
export const validateRunOnlyShadowEvidence = (fixture: RecordedCompletedDraftReplay): string[] => {
  const evidence = fixture.runOnlyShadowEvidence as unknown
  if (evidence === undefined) return []
  if (!isRecord(evidence) || evidence.schemaVersion !== 1 || evidence.sessionId !== fixture.id || !Array.isArray(evidence.observations)) return ["run-only shadow evidence envelope is invalid"]
  if (!evidence.observations.length || evidence.observations.length > MAX_REPLAY_FORECAST_OBSERVATIONS) return ["run-only shadow evidence observation count is invalid"]
  const seen = new Set<number>(); const errors: string[] = []
  evidence.observations.forEach((value, index) => {
    const prefix = `run-only shadow observation ${index + 1}`
    if (!isRecord(value) || !Number.isInteger(value.observedThroughOverallPick)
      || (value.observedThroughOverallPick as number) < 0 || (value.observedThroughOverallPick as number) >= fixture.actualPicks.length
      || seen.has(value.observedThroughOverallPick as number) || typeof value.inputFingerprint !== "string" || !/^[a-f0-9]{8}$/.test(value.inputFingerprint)
      || typeof value.observationFingerprint !== "string" || !/^[a-f0-9]{8}$/.test(value.observationFingerprint)
      || value.modelIdentity !== BOUNDED_RESIDUAL_RUN_SHADOW_ARTIFACT.id || value.artifactId !== BOUNDED_RESIDUAL_RUN_SHADOW_ARTIFACT.id
      || value.artifactFingerprint !== BOUNDED_RESIDUAL_RUN_SHADOW_ARTIFACT.artifactFingerprint || value.trainingCorpusFingerprint !== BOUNDED_RESIDUAL_RUN_SHADOW_ARTIFACT.trainingCorpusFingerprint
      || value.targetRosterIndex !== fixture.targetRosterIndex || !isRecord(value.phaseProvenance)
      || !["known_total", "fallback_context_horizon"].includes(value.phaseProvenance.kind as string)
      || !Number.isInteger(value.phaseProvenance.totalDraftPicks) || (value.phaseProvenance.totalDraftPicks as number) <= 1
      || (value.phaseProvenance.kind === "known_total" && value.phaseProvenance.totalDraftPicks !== fixture.actualPicks.length)) { errors.push(`${prefix} is invalid`); return }
    seen.add(value.observedThroughOverallPick as number)
    const forecast = value.forecast
    if (!isRecord(forecast) || forecast.schemaVersion !== 1 || forecast.modelIdentity !== value.modelIdentity || forecast.artifactId !== value.artifactId
      || forecast.artifactFingerprint !== value.artifactFingerprint || forecast.trainingCorpusFingerprint !== value.trainingCorpusFingerprint
      || forecast.targetRosterIndex !== value.targetRosterIndex || forecast.minimumPicks !== 3 || !isRecord(forecast.phaseProvenance)
      || forecast.phaseProvenance.kind !== value.phaseProvenance.kind || forecast.phaseProvenance.totalDraftPicks !== value.phaseProvenance.totalDraftPicks
      || !Array.isArray(forecast.horizon) || !Array.isArray(forecast.frozenRunProbabilities) || !Array.isArray(forecast.challengerRunProbabilities)) { errors.push(`${prefix} forecast is invalid`); return }
    const expected = expectedOpponentPicks(fixture, value.observedThroughOverallPick as number)
    const horizonValid = forecast.horizon.length === expected.length && forecast.horizon.every((slot, slotIndex) => isRecord(slot)
      && slot.overallPick === expected[slotIndex].overallPick && slot.rosterIndex === expected[slotIndex].rosterIndex)
    const runsValid = [forecast.frozenRunProbabilities, forecast.challengerRunProbabilities].every(runs => runs.length === 4
      && new Set(runs.map(run => isRecord(run) ? run.position : null)).size === 4
      && runs.every(run => isRecord(run) && positions.includes(run.position as FantasyPosition) && isProbability(run.probability)))
    const base = { observedThroughOverallPick: value.observedThroughOverallPick, modelIdentity: value.modelIdentity, artifactId: value.artifactId,
      artifactFingerprint: value.artifactFingerprint, trainingCorpusFingerprint: value.trainingCorpusFingerprint, targetRosterIndex: value.targetRosterIndex,
      phaseProvenance: value.phaseProvenance, forecast }
    if (!horizonValid || !runsValid || value.observationFingerprint !== createRunOnlyShadowObservationFingerprint(base as never)) errors.push(`${prefix} horizon, probabilities, or fingerprint is invalid`)
  })
  return errors
}

export type RunOnlyShadowComparison = { available: false, fixtureId: string, reason: string, promotion: { promoted: false, reason: string } }
  | { available: true, fixtureId: string, comparableObservationCount: number, promotion: { promoted: false, reason: string } }

export const compareRunOnlyShadowEvidence = (fixture: RecordedCompletedDraftReplay): RunOnlyShadowComparison => {
  const unavailable = (reason: string): RunOnlyShadowComparison => ({ available: false, fixtureId: fixture.id, reason, promotion: { promoted: false, reason: "Run-only shadow evidence is observational only" } })
  if (!fixture.forecastEvidence || !fixture.runOnlyShadowEvidence) return unavailable("both frozen-v1 and run-only shadow evidence are required")
  const frozenErrors = validateRecordedOpponentForecastEvidence(fixture)
  if (frozenErrors.length) return unavailable(`frozen v1 evidence is invalid: ${frozenErrors.join("; ")}`)
  const errors = validateRunOnlyShadowEvidence(fixture); if (errors.length) return unavailable(errors.join("; "))
  if (fixture.runOnlyShadowEvidence.observations.some(observation => observation.phaseProvenance.kind !== "known_total")) return unavailable("run-only shadow evidence uses fallback draft-phase provenance")
  const frozen = new Map(fixture.forecastEvidence.observations.map(observation => [observation.observedThroughOverallPick, observation.forecast.picks]))
  if (frozen.size !== fixture.runOnlyShadowEvidence.observations.length || fixture.runOnlyShadowEvidence.observations.some(observation => {
    const picks = frozen.get(observation.observedThroughOverallPick)
    return !picks || picks.length !== observation.forecast.horizon.length || picks.some((pick, index) => pick.overallPick !== observation.forecast.horizon[index]?.overallPick || pick.rosterIndex !== observation.forecast.horizon[index]?.rosterIndex)
  })) return unavailable("run-only shadow and frozen-v1 evidence do not share identical boundaries and horizons")
  const frozenObservations = new Map(fixture.forecastEvidence.observations.map(observation => [observation.observedThroughOverallPick, observation]))
  const frozenRunsMatch = fixture.runOnlyShadowEvidence.observations.every(observation => {
    const frozenObservation = frozenObservations.get(observation.observedThroughOverallPick)
    if (!frozenObservation) return false
    return observation.forecast.frozenRunProbabilities.every(run => {
      const baseline = frozenObservation.forecast.runProbabilities.find(candidate => candidate.position === run.position)
      return baseline?.minimumPicks === 3 && Math.abs(baseline.probability - run.probability) <= 0.000001
    })
  })
  if (!frozenRunsMatch) return unavailable("run-only shadow frozen probabilities do not match frozen-v1 evidence")
  const playerPositions = new Map(fixture.players.map(player => [player.id, player.position]))
  const hasLabels = fixture.runOnlyShadowEvidence.observations.some(observation =>
    expectedOpponentPicks(fixture, observation.observedThroughOverallPick).some(slot => {
      const playerId = fixture.actualPicks[slot.overallPick - 1]?.playerId
      return Boolean(playerId && positions.includes(playerPositions.get(playerId) as FantasyPosition))
    }))
  if (!hasLabels) return unavailable("run-only shadow evidence has no labeled opponent picks")
  return { available: true, fixtureId: fixture.id, comparableObservationCount: fixture.runOnlyShadowEvidence.observations.length, promotion: { promoted: false, reason: "Run-only shadow evidence is observational only" } }
}
