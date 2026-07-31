import type { OpponentForecast } from "../behavior/draft-advisor/types"
import {
  MAX_REPLAY_FORECAST_OBSERVATIONS,
  createReplayForecastInputFingerprint,
  ReplayForecastEvidenceRecorder,
} from "../behavior/draft-advisor/replayForecastEvidence"

const forecastFor = (overallPick: number): OpponentForecast => ({
  schemaVersion: 1,
  model: "combined",
  targetRosterIndex: 0,
  picks: [{
    overallPick,
    rosterIndex: 1,
    positionProbabilities: [],
    playerProbabilities: [],
  }],
  runProbabilities: [],
  tierBoundaryProbabilities: [],
})

describe("live replay forecast evidence recorder", () => {
  const record = (
    recorder: ReplayForecastEvidenceRecorder,
    sessionId: string,
    boundary: number,
  ) => recorder.record({
    sessionId,
    observedThroughOverallPick: boundary,
    forecast: forecastFor(boundary + 1),
    targetRosterIndex: 0,
    inputFingerprint: createReplayForecastInputFingerprint({ sessionId, boundary }),
  })

  it("deduplicates renders by boundary, bounds memory, and resets sessions", () => {
    const recorder = new ReplayForecastEvidenceRecorder()
    record(recorder, "draft-a", 0)
    record(recorder, "draft-a", 0)
    expect(recorder.snapshot("draft-a")?.observations).toHaveLength(1)

    Array.from({ length: MAX_REPLAY_FORECAST_OBSERVATIONS + 3 }, (_, index) =>
      record(recorder, "draft-a", index + 1))
    expect(recorder.snapshot("draft-a")?.observations).toHaveLength(
      MAX_REPLAY_FORECAST_OBSERVATIONS,
    )
    expect(record(recorder, "draft-b", 0)?.sessionId).toBe("draft-b")
    expect(recorder.snapshot("draft-a")).toBeUndefined()
    expect(recorder.snapshot("draft-b")?.observations).toHaveLength(1)
  })

  it("does not retain a prior session when a new session's first render is invalid", () => {
    const recorder = new ReplayForecastEvidenceRecorder()
    record(recorder, "draft-a", 0)
    recorder.record({
      sessionId: "draft-b",
      observedThroughOverallPick: 0,
      forecast: { ...forecastFor(0), picks: [] },
      targetRosterIndex: 0,
      inputFingerprint: "00000000",
    })
    expect(recorder.snapshot()).toBeUndefined()
  })

  it("rejects a forecast at or before a raw excluded-pick boundary", () => {
    const recorder = new ReplayForecastEvidenceRecorder()
    // The advisor's eligible-player state can still say currPick 5 while the
    // provider board has already shown an excluded K/DST pick at overall 5.
    const rawObservedThroughOverallPick = 5
    expect(recorder.record({
      sessionId: "draft-excluded-pick",
      observedThroughOverallPick: rawObservedThroughOverallPick,
      forecast: forecastFor(5),
      targetRosterIndex: 0,
      inputFingerprint: "00000000",
    })).toBeUndefined()
    expect(record(recorder, "draft-excluded-pick", rawObservedThroughOverallPick)
      ?.observations[0].forecast.picks[0].overallPick).toBe(6)
  })
})
