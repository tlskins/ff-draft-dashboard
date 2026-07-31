import fixtureJson from "./fixtures/recorded-espn-2026-slot-6-10-team-standard.json"
import {
  EMPIRICAL_BASE_SHADOW_ARTIFACT,
  createEmpiricalBaseShadowForecast,
} from "../behavior/draft-advisor/empiricalBaseShadow"
import {
  compareEmpiricalBaseShadowEvidence,
  validateEmpiricalBaseShadowEvidence,
} from "../behavior/draft-advisor/empiricalBaseShadowMetrics"
import {
  createRecordedDraftAdvisorContextAtBoundary,
} from "../behavior/draft-advisor/completedDraftReplay"
import type { RecordedCompletedDraftReplay } from "../behavior/draft-advisor/completedDraftReplay"
import { createOpponentForecast } from "../behavior/draft-advisor/opponentModel"
import {
  ReplayEmpiricalBaseShadowEvidenceRecorder,
  createEmpiricalBaseShadowObservationFingerprint,
  createReplayForecastInputFingerprint,
} from "../behavior/draft-advisor/replayForecastEvidence"
import { validateCompletedDraftReplay } from "../behavior/draft-advisor/replayFixtures"

const fixture = fixtureJson as unknown as RecordedCompletedDraftReplay

const contextAtFirstBoundary = () => {
  const observation = fixture.forecastEvidence!.observations[0]
  const currentPick = observation.forecast.picks[0].overallPick
  return {
    observation,
    context: createRecordedDraftAdvisorContextAtBoundary(
      fixture,
      observation.observedThroughOverallPick,
      fixture.settings.numTeams * 2 + 1,
      currentPick,
    ),
  }
}

describe("empirical learned-base shadow", () => {
  it("keeps frozen v1 forecasts bit-for-bit unchanged while producing finite normalized shadow positions", () => {
    const { context, observation } = contextAtFirstBoundary()
    const before = createOpponentForecast(context, {
      model: "combined", targetRosterIndex: fixture.targetRosterIndex,
    })
    const shadow = createEmpiricalBaseShadowForecast(
      context, before, fixture.actualPicks.length,
    )
    const after = createOpponentForecast(context, {
      model: "combined", targetRosterIndex: fixture.targetRosterIndex,
    })

    expect(after).toEqual(before)
    expect(shadow.artifactId).toBe(EMPIRICAL_BASE_SHADOW_ARTIFACT.id)
    expect(shadow.phaseProvenance).toEqual({
      kind: "known_total", totalDraftPicks: fixture.actualPicks.length,
    })
    expect(shadow.picks.map(pick => pick.overallPick))
      .toEqual(before.picks.map(pick => pick.overallPick))
    shadow.picks.forEach(pick => {
      expect(pick.positionProbabilities.every(candidate =>
        Number.isFinite(candidate.probability))).toBe(true)
      expect(pick.positionProbabilities.reduce((sum, candidate) =>
        sum + candidate.probability, 0)).toBeCloseTo(1)
    })
    expect(shadow.picks[0].overallPick).toBeGreaterThan(observation.observedThroughOverallPick)
  })

  it("is deterministic at a recorded pre-pick boundary and cannot see later picks", () => {
    const { context, observation } = contextAtFirstBoundary()
    const frozen = createOpponentForecast(context, {
      model: "combined", targetRosterIndex: fixture.targetRosterIndex,
    })
    const first = createEmpiricalBaseShadowForecast(context, frozen, fixture.actualPicks.length)
    const mutated = {
      ...fixture,
      actualPicks: fixture.actualPicks.map(pick => ({ ...pick })),
    }
    const future = mutated.actualPicks.find(pick =>
      pick.overallPick > observation.observedThroughOverallPick && pick.playerId)
    if (!future) throw new Error("fixture lacks a future mapped pick")
    future.playerId = null
    future.advisorEligible = false
    const rebuilt = createRecordedDraftAdvisorContextAtBoundary(
      mutated,
      observation.observedThroughOverallPick,
      fixture.settings.numTeams * 2 + 1,
      frozen.picks[0].overallPick,
    )
    expect(createEmpiricalBaseShadowForecast(rebuilt, frozen, fixture.actualPicks.length))
      .toEqual(first)
  })

  it("keeps legacy fixtures valid and fails closed without real captured parallel evidence", () => {
    expect(fixture.empiricalBaseShadowEvidence).toBeUndefined()
    expect(validateEmpiricalBaseShadowEvidence(fixture)).toEqual([])
    const report = compareEmpiricalBaseShadowEvidence(fixture)
    expect(report.available).toBe(false)
    expect(report.promotion.promoted).toBe(false)
  })

  it("records matching live boundaries in a separate envelope and compares only that evidence", () => {
    const recorder = new ReplayEmpiricalBaseShadowEvidenceRecorder()
    const shadowEvidence = fixture.forecastEvidence!.observations.reduce((latest, observation) => {
      const currentPick = observation.forecast.picks[0].overallPick
      const context = createRecordedDraftAdvisorContextAtBoundary(
        fixture,
        observation.observedThroughOverallPick,
        fixture.settings.numTeams * 2 + 1,
        currentPick,
      )
      const shadow = createEmpiricalBaseShadowForecast(
        context, observation.forecast, fixture.actualPicks.length,
      )
      return recorder.record({
        sessionId: fixture.id,
        observedThroughOverallPick: observation.observedThroughOverallPick,
        forecast: shadow,
        targetRosterIndex: fixture.targetRosterIndex,
        inputFingerprint: createReplayForecastInputFingerprint({
          fixtureId: fixture.id,
          boundary: observation.observedThroughOverallPick,
          artifact: EMPIRICAL_BASE_SHADOW_ARTIFACT.id,
        }),
      }) || latest
    }, undefined as ReturnType<ReplayEmpiricalBaseShadowEvidenceRecorder["snapshot"]>)
    const captured = { ...fixture, empiricalBaseShadowEvidence: shadowEvidence }
    expect(validateEmpiricalBaseShadowEvidence(captured)).toEqual([])
    const report = compareEmpiricalBaseShadowEvidence(captured)
    expect(report.available).toBe(true)
    if (report.available) {
      expect(report.learnedBase.evaluatedPicks).toBeGreaterThan(0)
      // 120 render boundaries collapse to the same 15 terminal run windows.
      expect(report.labeledWindowCount).toBe(15)
      expect(report.promotion.promoted).toBe(false)
    }
    const mismatchedKnownTotal = JSON.parse(JSON.stringify(captured)) as RecordedCompletedDraftReplay
    const mismatchedObservation = mismatchedKnownTotal.empiricalBaseShadowEvidence!.observations[0]
    const mismatchedPhase = {
      kind: "known_total" as const,
      totalDraftPicks: fixture.actualPicks.length - 1,
    }
    mismatchedObservation.phaseProvenance = mismatchedPhase
    mismatchedObservation.forecast.phaseProvenance = mismatchedPhase
    mismatchedObservation.observationFingerprint =
      createEmpiricalBaseShadowObservationFingerprint({
        observedThroughOverallPick: mismatchedObservation.observedThroughOverallPick,
        modelIdentity: mismatchedObservation.modelIdentity,
        artifactId: mismatchedObservation.artifactId,
        trainingCorpusFingerprint: mismatchedObservation.trainingCorpusFingerprint,
        targetRosterIndex: mismatchedObservation.targetRosterIndex,
        phaseProvenance: mismatchedObservation.phaseProvenance,
        forecast: mismatchedObservation.forecast,
      })
    expect(validateEmpiricalBaseShadowEvidence(mismatchedKnownTotal)).toContain(
      "shadow observation 1 is invalid",
    )
    const nullPick = JSON.parse(JSON.stringify(captured)) as RecordedCompletedDraftReplay
    nullPick.empiricalBaseShadowEvidence!.observations[0].forecast.picks[0] = null as never
    expect(() => validateEmpiricalBaseShadowEvidence(nullPick)).not.toThrow()
    expect(validateEmpiricalBaseShadowEvidence(nullPick)).toContain(
      "shadow observation 1 forecast is invalid or looks ahead",
    )
  })

  it("fails closed for a fallback draft-phase even when its envelope is otherwise valid", () => {
    const { context, observation } = contextAtFirstBoundary()
    const frozen = createOpponentForecast(context, {
      model: "combined", targetRosterIndex: fixture.targetRosterIndex,
    })
    const fallbackContext = { ...context, totalDraftPicks: undefined }
    const fallbackForecast = createEmpiricalBaseShadowForecast(fallbackContext, frozen)
    expect(fallbackForecast.phaseProvenance.kind).toBe("fallback_context_horizon")
    const base = {
      observedThroughOverallPick: observation.observedThroughOverallPick,
      modelIdentity: fallbackForecast.modelIdentity,
      artifactId: fallbackForecast.artifactId,
      trainingCorpusFingerprint: fallbackForecast.trainingCorpusFingerprint,
      targetRosterIndex: fixture.targetRosterIndex,
      phaseProvenance: fallbackForecast.phaseProvenance,
      forecast: fallbackForecast,
    } as const
    const captured = {
      ...fixture,
      empiricalBaseShadowEvidence: {
        schemaVersion: 1 as const,
        sessionId: fixture.id,
        observations: [{
          ...base,
          inputFingerprint: "00000000",
          observationFingerprint: createEmpiricalBaseShadowObservationFingerprint(base),
        }],
      },
    }
    const report = compareEmpiricalBaseShadowEvidence(captured)
    expect(report.available).toBe(false)
    expect(report.promotion.promoted).toBe(false)
    const malformed = JSON.parse(JSON.stringify(captured)) as RecordedCompletedDraftReplay
    malformed.empiricalBaseShadowEvidence!.observations[0]
      .forecast.picks[0].positionProbabilities[0].probability = 2
    expect(validateCompletedDraftReplay(malformed)).toContain(
      "shadow observation 1 forecast is invalid or looks ahead",
    )
  })

  it("returns validation errors—not throws—for arbitrary nested JSON shapes", () => {
    const malformed = {
      ...fixture,
      empiricalBaseShadowEvidence: {
        schemaVersion: 1,
        sessionId: fixture.id,
        observations: [{
          observedThroughOverallPick: 0,
          inputFingerprint: "00000000",
          observationFingerprint: "00000000",
          modelIdentity: "empirical_opponent_base_shadow_v1",
          artifactId: "empirical_opponent_base_shadow_v1",
          trainingCorpusFingerprint: EMPIRICAL_BASE_SHADOW_ARTIFACT.trainingCorpusFingerprint,
          targetRosterIndex: fixture.targetRosterIndex,
          phaseProvenance: null,
          forecast: { picks: null, runProbabilities: null },
        }],
      },
    } as unknown as RecordedCompletedDraftReplay
    expect(() => validateEmpiricalBaseShadowEvidence(malformed)).not.toThrow()
    expect(validateEmpiricalBaseShadowEvidence(malformed)).toContain(
      "shadow observation 1 is invalid",
    )
  })
})
