import fixtureJson from "./fixtures/recorded-espn-2026-07-31-league-1788370838-slot-1.json"
import slotThreeJson from "./fixtures/recorded-espn-2026-slot-3-12-team-standard.json"
import slotSixJson from "./fixtures/recorded-espn-2026-slot-6-10-team-standard.json"
import slotEightJson from "./fixtures/recorded-espn-2026-07-31-league-510719609-slot-8.json"
import slotNineJson from "./fixtures/recorded-espn-2026-slot-9.json"
import {
  BOUNDED_RESIDUAL_RUN_SHADOW_ARTIFACT,
  createBoundedResidualRunShadowArtifactFingerprint,
  createBoundedResidualRunShadowForecast,
} from "../behavior/draft-advisor/boundedResidualRunShadow"
import { createRecordedDraftAdvisorContextAtBoundary } from "../behavior/draft-advisor/completedDraftReplay"
import { createOpponentForecast } from "../behavior/draft-advisor/opponentModel"
import { ReplayForecastEvidenceRecorder, ReplayRunOnlyShadowEvidenceRecorder } from "../behavior/draft-advisor/replayForecastEvidence"
import { compareRunOnlyShadowEvidence, validateRunOnlyShadowEvidence } from "../behavior/draft-advisor/runOnlyShadowMetrics"
import {
  fitEmpiricalBalancedOpponentResidual,
  prepareEmpiricalOpponentCorpus,
} from "../behavior/draft-advisor/opponentEmpiricalV2"
import type { RecordedCompletedDraftReplay } from "../behavior/draft-advisor/completedDraftReplay"

const fixture = fixtureJson as unknown as RecordedCompletedDraftReplay
const corpusFixtures = [fixtureJson, slotThreeJson, slotSixJson, slotEightJson, slotNineJson] as unknown as RecordedCompletedDraftReplay[]

const capturedEvidence = () => {
  const context = createRecordedDraftAdvisorContextAtBoundary(fixture, 1)
  const frozen = createOpponentForecast(context, { model: "combined", targetRosterIndex: fixture.targetRosterIndex })
  const shadow = createBoundedResidualRunShadowForecast(context, frozen, fixture.actualPicks.length)
  const frozenEvidence = new ReplayForecastEvidenceRecorder().record({ sessionId: fixture.id,
    observedThroughOverallPick: 1, forecast: frozen, targetRosterIndex: fixture.targetRosterIndex,
    inputFingerprint: "deadbeef" })!
  const runOnlyShadowEvidence = new ReplayRunOnlyShadowEvidenceRecorder().record({ sessionId: fixture.id,
    observedThroughOverallPick: 1, forecast: shadow, targetRosterIndex: fixture.targetRosterIndex,
    inputFingerprint: "deadbeef" })!
  return { ...fixture, forecastEvidence: frozenEvidence, runOnlyShadowEvidence }
}

describe("bounded residual run-only shadow", () => {
  it("matches a fresh full-data fit and preserves the frozen horizon", () => {
    const corpus = prepareEmpiricalOpponentCorpus(corpusFixtures)
    expect(createBoundedResidualRunShadowArtifactFingerprint())
      .toBe(BOUNDED_RESIDUAL_RUN_SHADOW_ARTIFACT.artifactFingerprint)
    const fresh = fitEmpiricalBalancedOpponentResidual(corpus.examples)
    expect(fresh.coefficients).toEqual(BOUNDED_RESIDUAL_RUN_SHADOW_ARTIFACT.coefficients)
    expect(fresh.classWeights).toEqual(BOUNDED_RESIDUAL_RUN_SHADOW_ARTIFACT.classWeights)
    const context = createRecordedDraftAdvisorContextAtBoundary(fixture, 1)
    const frozen = createOpponentForecast(context, { model: "combined", targetRosterIndex: fixture.targetRosterIndex })
    const shadow = createBoundedResidualRunShadowForecast(context, frozen, fixture.actualPicks.length)
    expect(shadow.horizon).toEqual(frozen.picks.map(pick => ({ overallPick: pick.overallPick, rosterIndex: pick.rosterIndex })))
    expect([...shadow.frozenRunProbabilities, ...shadow.challengerRunProbabilities]
      .every(value => value.probability >= 0 && value.probability <= 1)).toBe(true)
  })

  it("is deterministic, round-trips as optional evidence, and fails closed when tampered", () => {
    const context = createRecordedDraftAdvisorContextAtBoundary(fixture, 1)
    const frozen = createOpponentForecast(context, { model: "combined", targetRosterIndex: fixture.targetRosterIndex })
    const forecast = createBoundedResidualRunShadowForecast(context, frozen, fixture.actualPicks.length)
    const recorder = new ReplayRunOnlyShadowEvidenceRecorder()
    const evidence = recorder.record({ sessionId: fixture.id, observedThroughOverallPick: 1, forecast,
      targetRosterIndex: fixture.targetRosterIndex, inputFingerprint: "deadbeef" })!
    const captured = { ...fixture, runOnlyShadowEvidence: evidence }
    expect(validateRunOnlyShadowEvidence(captured)).toEqual([])
    const tampered = JSON.parse(JSON.stringify(captured)) as typeof captured
    tampered.runOnlyShadowEvidence!.observations[0].forecast.horizon[0].overallPick = 1
    expect(validateRunOnlyShadowEvidence(tampered)).not.toEqual([])
  })

  it("keeps legacy fixtures unavailable and never throws on malformed arbitrary evidence", () => {
    expect(validateRunOnlyShadowEvidence(fixture)).toEqual([])
    expect(compareRunOnlyShadowEvidence(fixture)).toMatchObject({ available: false })
    const malformed = { ...fixture, runOnlyShadowEvidence: { observations: [{ forecast: null }] } } as unknown as RecordedCompletedDraftReplay
    expect(() => validateRunOnlyShadowEvidence(malformed)).not.toThrow()
    expect(validateRunOnlyShadowEvidence(malformed)).not.toEqual([])
  })

  it("rejects target, position, minimum, phase, and horizon tampering", () => {
    const checks: Array<(value: any) => void> = [
      value => { value.runOnlyShadowEvidence.observations[0].targetRosterIndex = 99 },
      value => { value.runOnlyShadowEvidence.observations[0].forecast.challengerRunProbabilities[1].position = "QB" },
      value => { value.runOnlyShadowEvidence.observations[0].forecast.minimumPicks = 2 },
      value => { value.runOnlyShadowEvidence.observations[0].phaseProvenance.totalDraftPicks = 3 },
      value => { value.runOnlyShadowEvidence.observations[0].forecast.horizon[0].rosterIndex = 99 },
      value => { value.runOnlyShadowEvidence.observations[0].forecast.horizon.push({ overallPick: 999, rosterIndex: 1 }) },
    ]
    checks.forEach(mutate => {
      const value = JSON.parse(JSON.stringify(capturedEvidence()))
      mutate(value)
      expect(validateRunOnlyShadowEvidence(value)).not.toEqual([])
    })
  })

  it("requires matching frozen boundaries and frozen run probabilities", () => {
    const missingBoundary = JSON.parse(JSON.stringify(capturedEvidence()))
    missingBoundary.forecastEvidence.observations = []
    expect(compareRunOnlyShadowEvidence(missingBoundary)).toMatchObject({ available: false })
    const mismatch = JSON.parse(JSON.stringify(capturedEvidence()))
    mismatch.runOnlyShadowEvidence.observations[0].forecast.frozenRunProbabilities[0].probability = 0
    // Fingerprint validation fails first; either way comparison is unavailable.
    expect(compareRunOnlyShadowEvidence(mismatch)).toMatchObject({ available: false })
  })

  it("replaces boundaries, bounds storage, and resets by session", () => {
    const { runOnlyShadowEvidence } = capturedEvidence()
    const forecast = runOnlyShadowEvidence!.observations[0].forecast
    const recorder = new ReplayRunOnlyShadowEvidenceRecorder()
    recorder.record({ sessionId: fixture.id, observedThroughOverallPick: 1, forecast, targetRosterIndex: fixture.targetRosterIndex, inputFingerprint: "deadbeef" })
    recorder.record({ sessionId: fixture.id, observedThroughOverallPick: 1, forecast, targetRosterIndex: fixture.targetRosterIndex, inputFingerprint: "feedface" })
    expect(recorder.snapshot()!.observations).toHaveLength(1)
    recorder.record({ sessionId: "new-session", observedThroughOverallPick: 1, forecast, targetRosterIndex: fixture.targetRosterIndex, inputFingerprint: "deadbeef" })
    expect(recorder.snapshot()!.sessionId).toBe("new-session")
    expect(recorder.snapshot(fixture.id)).toBeUndefined()
  })

  it("does not mutate the live frozen forecast when generating shadow output", () => {
    const context = createRecordedDraftAdvisorContextAtBoundary(fixture, 1)
    const frozen = createOpponentForecast(context, { model: "combined", targetRosterIndex: fixture.targetRosterIndex })
    const before = JSON.stringify(frozen)
    createBoundedResidualRunShadowForecast(context, frozen, fixture.actualPicks.length)
    expect(JSON.stringify(frozen)).toBe(before)
  })
})
