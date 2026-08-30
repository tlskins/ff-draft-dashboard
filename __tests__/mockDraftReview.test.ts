import {
  reviewCompletedMock,
  scoreMockRoster,
  type HandcuffRelationship,
} from "../behavior/mockDraft/review"
import type {
  RecordedCompletedDraftReplay,
  RecordedReplayPlayer,
} from "../behavior/draft-advisor/completedDraftReplay"
import {FantasyPosition} from "../types"


const player = (
  id: string,
  position: RecordedReplayPlayer["position"],
  adp: number,
  userTier: number,
  team: string,
): RecordedReplayPlayer => ({
  id,
  name: id,
  position,
  team,
  adp,
  positionRank: adp,
  userTier,
  projectedFloor: 8,
  projectedMedian: 12 - userTier,
  projectedCeiling: 18 - userTier,
})

const fixture = (): RecordedCompletedDraftReplay => ({
  fixtureVersion: 1,
  id: "mock-one",
  provenance: "recorded",
  source: {
    platform: "ESPN",
    title: "Mock one",
    capturedAt: Date.parse("2026-08-30T18:00:00Z"),
    totalPicks: 4,
    numRounds: 2,
    platformRosterSize: 2,
    excludedPositions: [],
  },
  settings: {
    ppr: true,
    scoringFormat: "ppr",
    numTeams: 2,
    numStartingQbs: 0,
    numStartingRbs: 1,
    numStartingWrs: 1,
    numStartingTes: 0,
    numFlex: 0,
    numBenchPlayers: 0,
  },
  targetRosterIndex: 0,
  replacementPoints: {QB: 5, RB: 5, WR: 5, TE: 5},
  players: [
    player("wr-actual", FantasyPosition.WIDE_RECEIVER, 1, 3, "AAA"),
    player("rb-branch", FantasyPosition.RUNNING_BACK, 2, 1, "BBB"),
    player("wr-opponent", FantasyPosition.WIDE_RECEIVER, 3, 1, "CCC"),
    player("wr-branch", FantasyPosition.WIDE_RECEIVER, 4, 1, "DDD"),
    player("rb-replacement", FantasyPosition.RUNNING_BACK, 5, 2, "EEE"),
    player("rb-actual", FantasyPosition.RUNNING_BACK, 8, 5, "FFF"),
    player("rb-backup", FantasyPosition.RUNNING_BACK, 18, 4, "FFF"),
  ],
  actualPicks: [
    {overallPick: 1, rosterIndex: 0, playerId: "wr-actual"},
    {overallPick: 2, rosterIndex: 1, playerId: "rb-branch"},
    {overallPick: 3, rosterIndex: 1, playerId: "wr-opponent"},
    {overallPick: 4, rosterIndex: 0, playerId: "rb-actual"},
  ],
})

describe("mock draft scorecard", () => {
  it("reports transparent tiers, attainable targets, and a weighted composite", () => {
    const result = scoreMockRoster({
      fixture: fixture(),
      selectedPlayerIds: ["wr-actual", "rb-actual"],
      targetPlayerIds: ["wr-actual", "rb-branch"],
      handcuffs: [],
    })
    expect(result.compositeScore).toBeGreaterThanOrEqual(0)
    expect(result.compositeScore).toBeLessThanOrEqual(100)
    expect(result.tierCounts.WR.T3).toBe(1)
    expect(result.categories.find(category => category.key === "target_conversion")?.evidence)
      .toEqual(["1/2 total targets", "1/2 attainable targets"])
    expect(result.categories.find(category => category.key === "handcuff_value")?.score)
      .toBeNull()
  })

  it("scores only explicit top-ten-round backup relationships", () => {
    const relationships: HandcuffRelationship[] = [{
      starterPlayerId: "rb-actual",
      backupPlayerId: "rb-backup",
      source: "depth-chart",
    }]
    const secured = scoreMockRoster({
      fixture: fixture(),
      selectedPlayerIds: ["rb-actual", "rb-backup"],
      handcuffs: relationships,
    })
    expect(secured.categories.find(category => category.key === "handcuff_value")?.score)
      .toBe(100)
    expect(secured.categories.find(category => category.key === "handcuff_value")?.evidence)
      .toContain("ADP cutoff 20")
  })

  it("labels the frozen configured-ADP backfield proxy when no source map is supplied", () => {
    const result = scoreMockRoster({
      fixture: fixture(),
      selectedPlayerIds: ["rb-actual", "rb-backup"],
    })
    expect(result.categories.find(category => category.key === "handcuff_value")?.score)
      .toBe(100)
  })
})

describe("deterministic completed mock counterfactual", () => {
  it("replays an RB-WR branch and replaces a collided opponent pick by ADP", () => {
    const result = reviewCompletedMock({
      fixture: fixture(),
      request: {positionSequence: [FantasyPosition.RUNNING_BACK, FantasyPosition.WIDE_RECEIVER], maxAlternatives: 1},
    })
    expect(result.alternatives).toHaveLength(1)
    expect(result.alternatives[0].selectedPlayerIds).toEqual(["rb-branch", "wr-branch"])
    expect(result.alternatives[0].opponentReplacements).toEqual([{
      overallPick: 2,
      recordedPlayerId: "rb-branch",
      replacementPlayerId: "wr-actual",
    }])
  })

  it("uses the strict ADP future-availability boundary and is repeatable", () => {
    const request = {
      exactPlayerOverrides: {1: "rb-branch", 2: "wr-opponent"},
      maxAlternatives: 3,
    }
    const first = reviewCompletedMock({fixture: fixture(), request})
    const second = reviewCompletedMock({fixture: fixture(), request})
    expect(first).toEqual(second)
    // wr-opponent has ADP 3 and therefore is not forecast available at pick 4.
    expect(first.alternatives).toEqual([])
  })

  it("does not return a final branch that leaves a required starter position empty", () => {
    const result = reviewCompletedMock({
      fixture: fixture(),
      request: {
        positionSequence: [
          FantasyPosition.RUNNING_BACK,
          FantasyPosition.RUNNING_BACK,
        ],
      },
    })
    expect(result.alternatives).toEqual([])
  })
})
