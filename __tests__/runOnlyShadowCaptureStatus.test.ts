import { FantasyPosition } from "../types"
import { deriveRunOnlyShadowCaptureStatus } from "../behavior/draft-advisor/runOnlyShadowCaptureStatus"

const frozen = { targetRosterIndex: 0, picks: [{ overallPick: 2, rosterIndex: 1 }], runProbabilities: [] } as any
const shadow = { targetRosterIndex: 0, phaseProvenance: { kind: "known_total", totalDraftPicks: 120 },
  horizon: [{ overallPick: 2, rosterIndex: 1 }] } as any
const status = (overrides = {}) => deriveRunOnlyShadowCaptureStatus({
  sessionId: "draft", draftStarted: true, complete: false, historyAhead: false,
  frozenEvidence: undefined, shadowEvidence: undefined, frozenForecast: frozen, shadowForecast: shadow,
  frozenRecording: true, ...overrides,
})

describe("run-only shadow capture status", () => {
  it("reports waiting, fallback-paused, recording, and completed-unusable states", () => {
    expect(status({ sessionId: null }).reasonCode).toBe("no_session")
    expect(status({ draftStarted: false }).reasonCode).toBe("not_started")
    expect(status({ shadowForecast: { ...shadow, phaseProvenance: { kind: "fallback_context_horizon", totalDraftPicks: 20 } } }).reasonCode).toBe("fallback_phase")
    expect(status({ frozenRecording: false }).reasonCode).toBe("frozen_capture_paused")
    expect(status({ complete: true }).state).toBe("completed_unusable")
  })

  it("reports matching known-total evidence as comparable", () => {
    const forecast = { ...shadow, frozenRunProbabilities: positions(), challengerRunProbabilities: positions() }
    const frozenEvidence = { sessionId: "draft", observations: [{ observedThroughOverallPick: 1, forecast: frozen }] } as any
    const shadowEvidence = { sessionId: "draft", observations: [{ observedThroughOverallPick: 1, phaseProvenance: shadow.phaseProvenance, forecast }] } as any
    expect(status({ frozenEvidence, shadowEvidence, shadowForecast: forecast, complete: true })).toMatchObject({
      state: "completed_usable", comparableObservationCount: 1,
    })
  })
})

const positions = () => [FantasyPosition.QUARTERBACK, FantasyPosition.RUNNING_BACK, FantasyPosition.WIDE_RECEIVER, FantasyPosition.TIGHT_END]
  .map(position => ({ position, probability: 0.25 }))
