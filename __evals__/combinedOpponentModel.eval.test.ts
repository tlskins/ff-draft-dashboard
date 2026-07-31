import fixture from "../__tests__/fixtures/opponent-model-replay.json"
import {
  OpponentReplayCase,
  runOpponentModelReplay,
} from "../behavior/draft-advisor/replayMetrics"

const cases = fixture.cases as unknown as OpponentReplayCase[]

describe("combined opponent-model replay", () => {
  it("beats at least one simple baseline and meets deterministic latency", () => {
    const adpOnly = runOpponentModelReplay(cases, "adp_only")
    const needOnly = runOpponentModelReplay(cases, "need_only")
    const combined = runOpponentModelReplay(cases, "combined")

    expect(combined.evaluatedPicks).toBe(7)
    expect(combined.positionBrierScore)
      .toBeLessThan(adpOnly.positionBrierScore)
    expect(combined.positionBrierScore)
      .toBeLessThan(needOnly.positionBrierScore)
    expect(combined.topPositionAccuracy)
      .toBeGreaterThan(adpOnly.topPositionAccuracy)
    expect(combined.topPositionAccuracy)
      .toBeGreaterThan(needOnly.topPositionAccuracy)
    expect(combined.runPrecision).toBeGreaterThanOrEqual(
      Math.max(adpOnly.runPrecision, needOnly.runPrecision),
    )
    expect(combined.runRecall).toBeGreaterThanOrEqual(
      Math.max(adpOnly.runRecall, needOnly.runRecall),
    )
    expect(combined.latencyP95Ms).toBeLessThan(150)
  })
})
