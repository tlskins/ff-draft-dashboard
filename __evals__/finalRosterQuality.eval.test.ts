import fixture from "../__tests__/fixtures/completed-draft-replay.json"
import {
  RecordedCompletedDraftReplay,
  runCompletedDraftReplay,
} from "../behavior/draft-advisor/completedDraftReplay"

const replay = fixture as unknown as RecordedCompletedDraftReplay

describe("completed-draft final-roster quality", () => {
  it("keeps the combined advisor legal, complete, and competitive", () => {
    const combined = runCompletedDraftReplay(replay, "combined")
    const adpOnly = runCompletedDraftReplay(replay, "adp_only")
    const needOnly = runCompletedDraftReplay(replay, "need_only")
    const rankOnly = runCompletedDraftReplay(replay, "rank_only")
    const strongestSimpleStarterValue = Math.max(
      adpOnly.quality.projectedStarterPoints,
      needOnly.quality.projectedStarterPoints,
      rankOnly.quality.projectedStarterPoints,
    )

    expect(combined.quality.legal).toBe(true)
    expect(combined.quality.starterCompleteness).toBe(1)
    expect(combined.positionalRankViolations).toBe(0)
    expect(combined.quality.projectedStarterPoints).toBeGreaterThanOrEqual(
      adpOnly.quality.projectedStarterPoints,
    )
    expect(combined.quality.projectedStarterPoints).toBeGreaterThanOrEqual(
      strongestSimpleStarterValue * 0.9,
    )
    expect(combined.quality.benchCeiling).toBeGreaterThanOrEqual(
      Math.max(
        adpOnly.quality.benchCeiling,
        needOnly.quality.benchCeiling,
        rankOnly.quality.benchCeiling,
      ),
    )
    expect(combined.decisionLatencyP95Ms).toBeLessThan(150)
  })
})
