import {
  getSnapshotObservedThroughOverallPick,
  isDraftCaptureComplete,
} from "../behavior/draft-feed/snapshots"
import type { DraftSnapshot } from "../behavior/draft-feed/types"

const snapshot = (overrides: Partial<DraftSnapshot>): DraftSnapshot => ({
  id: "draft",
  title: "Draft",
  platform: "ESPN",
  capturedAt: 1,
  picks: [],
  ...overrides,
})

describe("raw provider draft boundary", () => {
  it("counts ESPN coordinates including an excluded K/DST board pick", () => {
    expect(getSnapshotObservedThroughOverallPick(snapshot({
      numTeams: 10,
      picks: [{ imgUrl: "", name: "Kicker", team: "", position: "K", pick: "R1, P5" }],
    }), 12)).toBe(5)
  })

  it("uses NFL overall picks and ignores malformed or empty provider rows", () => {
    expect(getSnapshotObservedThroughOverallPick(snapshot({
      platform: "NFL",
      picks: [{ name: "Player", team: "", position: "RB", pick: 17 }],
    }), 12)).toBe(17)
    expect(getSnapshotObservedThroughOverallPick(snapshot({
      picks: [{ imgUrl: "", name: "Unknown", team: "", position: "", pick: "not a coordinate" }],
    }), 12)).toBeUndefined()
    expect(getSnapshotObservedThroughOverallPick(snapshot({ picks: [] }), 12)).toBeUndefined()
  })

  it.each([10, 12])("does not infer completion at a completed round boundary for a %i-team source", (numTeams) => {
    const incompleteBoard = snapshot({
      numTeams,
      completion: {
        complete: false,
        totalPicks: numTeams * 16,
        numRounds: 16,
        numTeams,
        platformRosterSize: 16,
        targetRosterIndex: 2,
        excludedPositions: ["K", "D/ST"],
        scoringFormat: "PPR",
      },
    })

    expect(isDraftCaptureComplete(
      incompleteBoard,
      numTeams * 12,
      numTeams * 12,
    )).toBe(false)
  })

  it("uses a source completion flag, while preserving the no-source legacy fallback", () => {
    expect(isDraftCaptureComplete(
      snapshot({ completion: {
        complete: true,
        totalPicks: 192,
        numRounds: 16,
        numTeams: 12,
        platformRosterSize: 16,
        targetRosterIndex: 2,
        excludedPositions: ["K", "D/ST"],
        scoringFormat: "PPR",
      } }),
      0,
      144,
    )).toBe(true)
    expect(isDraftCaptureComplete(null, 144, 144)).toBe(true)
  })
})
