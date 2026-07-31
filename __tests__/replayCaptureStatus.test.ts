import fixtureJson from "./fixtures/recorded-espn-2026-slot-9.json"
import manualFixtureJson from "./fixtures/completed-draft-replay.json"
import {
  deriveReplayCaptureStatus,
  preflightReplayExport,
  validateReplayExportAtConfirmation,
} from "../behavior/draft-advisor/replayCaptureStatus"
import type { RecordedCompletedDraftReplay } from "../behavior/draft-advisor/completedDraftReplay"
import type { OpponentForecast } from "../behavior/draft-advisor/types"
import { FantasyPosition } from "../types"
import {
  createReplayForecastInputFingerprint,
  createReplayForecastObservationFingerprint,
} from "../behavior/draft-advisor/replayForecastEvidence"

const fixture = fixtureJson as unknown as RecordedCompletedDraftReplay
const manualFixture = manualFixtureJson as unknown as RecordedCompletedDraftReplay
const forecast: OpponentForecast = {
  schemaVersion: 1,
  model: "combined",
  targetRosterIndex: 0,
  picks: [{
    overallPick: 2,
    rosterIndex: 1,
    positionProbabilities: [],
    playerProbabilities: [],
  }],
  runProbabilities: [],
  tierBoundaryProbabilities: [],
}

const labeledFixture = (
  base: RecordedCompletedDraftReplay = fixture,
): RecordedCompletedDraftReplay => {
  const result = JSON.parse(JSON.stringify(base)) as RecordedCompletedDraftReplay
  const positions = [
    FantasyPosition.QUARTERBACK,
    FantasyPosition.RUNNING_BACK,
    FantasyPosition.WIDE_RECEIVER,
    FantasyPosition.TIGHT_END,
  ]
  const windowActuals = [] as typeof result.actualPicks
  for (const actual of result.actualPicks) {
    if (actual.rosterIndex === result.targetRosterIndex) {
      if (windowActuals.length > 0) break
      continue
    }
    windowActuals.push(actual)
  }
  const picks = windowActuals.map(actual => ({
    overallPick: actual.overallPick,
    rosterIndex: actual.rosterIndex,
    positionProbabilities: positions.map(position => ({
      position,
      probability: .25,
    })),
    playerProbabilities: positions.map(position => ({
      playerId: `${position}-test`,
      name: position,
      position,
      conditionalProbability: 1,
      overallProbability: .25,
    })),
  }))
  const observedThroughOverallPick = 0
  const forecast: OpponentForecast = {
    schemaVersion: 1,
    model: "combined",
    targetRosterIndex: result.targetRosterIndex,
    picks,
    runProbabilities: positions.map(position => ({
      position,
      minimumPicks: 3,
      probability: .25,
    })),
    tierBoundaryProbabilities: [],
  }
  const observation = {
    observedThroughOverallPick,
    modelIdentity: "deterministic_opponent_v1" as const,
    model: "combined" as const,
    targetRosterIndex: result.targetRosterIndex,
    forecast,
  }
  result.forecastEvidence = {
    schemaVersion: 1,
    sessionId: result.id,
    observations: [{
      ...observation,
      inputFingerprint: createReplayForecastInputFingerprint({
        observedThroughOverallPick,
      }),
      observationFingerprint:
        createReplayForecastObservationFingerprint(observation),
    }],
  }
  return result
}

describe("replay capture status and export preflight", () => {
  it("uses stable waiting, recording, pause, and completion states", () => {
    const common = {
      rawBoundary: 1,
      evidence: undefined,
      forecast,
      targetRosterIndex: 0,
      inputFingerprint: "12345678",
    }
    expect(deriveReplayCaptureStatus({
      ...common,
      sessionId: null,
      draftStarted: false,
      complete: false,
    }).reasonCode).toBe("no_session")
    expect(deriveReplayCaptureStatus({
      ...common,
      sessionId: "draft",
      draftStarted: true,
      complete: false,
    }).state).toBe("recording")
    expect(deriveReplayCaptureStatus({
      ...common,
      rawBoundary: 2,
      sessionId: "draft",
      draftStarted: true,
      complete: false,
    }).reasonCode).toBe("provider_boundary_ahead")
    expect(deriveReplayCaptureStatus({
      ...common,
      sessionId: "draft",
      draftStarted: true,
      complete: true,
    }).state).toBe("completed_without_labels")
  })

  it("covers every capture reason and ignores stale-session counts", () => {
    const base = {
      sessionId: "draft",
      draftStarted: true,
      complete: false,
      rawBoundary: 1,
      evidence: undefined,
      forecast,
      targetRosterIndex: 0,
      inputFingerprint: "12345678",
    }
    expect(deriveReplayCaptureStatus({
      ...base,
      draftStarted: false,
    }).reasonCode).toBe("not_started")
    expect(deriveReplayCaptureStatus({
      ...base,
      forecast: { ...forecast, picks: [] },
    }).reasonCode).toBe("no_future_opponent_picks")
    expect(deriveReplayCaptureStatus({
      ...base,
      historyAhead: true,
    }).reasonCode).toBe("history_ahead")
    expect(deriveReplayCaptureStatus({
      ...base,
      forecast: { ...forecast, model: "adp_only" },
    }).reasonCode).toBe("invalid_target_or_model")
    expect(deriveReplayCaptureStatus({
      ...base,
      inputFingerprint: "bad",
    }).reasonCode).toBe("invalid_input")
    const evidence = {
      schemaVersion: 1 as const,
      sessionId: "draft",
      observations: [{ observedThroughOverallPick: 1 }] as any[],
    }
    expect(deriveReplayCaptureStatus({
      ...base,
      complete: true,
      evidence,
    }).state).toBe("completed_preserved")
    expect(deriveReplayCaptureStatus({
      ...base,
      evidence: { ...evidence, sessionId: "old" },
    }).observationCount).toBe(0)
  })

  it("warns for valid legacy roster replay and blocks malformed optional evidence", () => {
    expect(preflightReplayExport(fixture)).toMatchObject({
      state: "warning",
      opponentMetricsAvailable: false,
      totalPlatformPicks: 160,
    })
    const invalid = JSON.parse(JSON.stringify(fixture)) as RecordedCompletedDraftReplay
    invalid.forecastEvidence = { schemaVersion: 1, sessionId: "wrong", observations: [] }
    expect(preflightReplayExport(invalid)).toMatchObject({ state: "blocked", evidenceValid: false })
  })

  it("revalidates a rebuilt fixture at confirmation and permits roster-only recovery", () => {
    let stale = false
    const build = (rosterOnly: boolean) => {
      const next = JSON.parse(JSON.stringify(fixture)) as RecordedCompletedDraftReplay
      if (!rosterOnly && stale) next.actualPicks.pop()
      return next
    }
    expect(validateReplayExportAtConfirmation(build).preflight.state)
      .toBe("warning")
    stale = true
    expect(() => validateReplayExportAtConfirmation(build)).toThrow("Replay is incomplete")
    expect(validateReplayExportAtConfirmation(build, true).preflight.state)
      .toBe("warning")
  })

  it("keeps valid local labels measurable when source metadata is absent", () => {
    const authoritative = labeledFixture()
    expect(preflightReplayExport(authoritative)).toMatchObject({
      state: "ready",
      campaignEvidenceReady: true,
      opponentMetricsAvailable: true,
      labeledPickCount: 8,
      labeledWindowCount: 1,
    })
    const sourceLess = labeledFixture(manualFixture)
    delete sourceLess.source
    expect(preflightReplayExport(sourceLess)).toMatchObject({
      state: "warning",
      campaignEvidenceReady: false,
      opponentMetricsAvailable: true,
      labeledPickCount: 6,
      labeledWindowCount: 1,
    })
  })

  it("blocks incomplete bases and exposes invalid evidence match failures", () => {
    const incomplete = labeledFixture()
    incomplete.actualPicks.pop()
    expect(preflightReplayExport(incomplete)).toMatchObject({
      state: "blocked",
      canExportRosterOnly: false,
    })
    const invalid = labeledFixture()
    invalid.forecastEvidence!.sessionId = "wrong"
    invalid.forecastEvidence!.observations[0].targetRosterIndex = 0
    expect(preflightReplayExport(invalid)).toMatchObject({
      state: "blocked", canExportRosterOnly: true,
      sessionMatch: false,
      targetRosterMatch: false,
    })
  })
})
