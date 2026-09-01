import {
  observedDraftAvailability,
  reviewCompletedMock,
  scoreMockRoster,
  type HandcuffRelationship,
} from "../behavior/mockDraft/review"
import type {
  RecordedCompletedDraftReplay,
  RecordedReplayPlayer,
} from "../behavior/draft-advisor/completedDraftReplay"
import {FantasyPosition} from "../types"
import recordedDraft from "./fixtures/recorded-espn-2026-slot-6-10-team-standard.json"


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
    expect(result.positionMetrics.WR).toMatchObject({
      rosterCount: 1,
      starterCount: 1,
      tierCounts: {T3: 1},
      starterTierCounts: {T3: 1},
      projectedMedian: 9,
      projectedPointsAboveReplacement: 4,
    })
    expect(result.totals).toMatchObject({
      rosterCount: 2,
      starterCount: 2,
      requiredStarterSlots: 2,
      starterProjectedMedian: 16,
      starterProjectedPointsAboveReplacement: 6,
      benchProjectedPointsAboveReplacement: 0,
    })
    expect(result.playerMetrics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        playerId: "wr-actual",
        lineupRole: FantasyPosition.WIDE_RECEIVER,
        replacementPoints: 5,
        projectedPointsAboveReplacement: 4,
      }),
    ]))
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
    expect(result.alternatives[0].replayFidelity).toMatchObject({
      collisionCount: 1,
      opponentPickCount: 2,
      collisionRate: 50,
      changedUserPickCount: 2,
      level: "low",
    })
    expect(result.alternatives[0].decisionLedger[0]).toMatchObject({
      userPickNumber: 1,
      overallPick: 1,
      changed: true,
      directOpponentCollisionAt: 2,
      actual: {playerId: "wr-actual", tier: 3},
      alternate: {playerId: "rb-branch", tier: 1},
    })
    expect(result.alternatives[0].categoryDeltas.map(delta => delta.key))
      .toEqual(["tier_capital", "starter_quality", "bench_upside", "target_conversion", "handcuff_value"])
  })

  it("keeps positional representatives in the unconstrained Auto beam", () => {
    const autoFixture = fixture()
    autoFixture.players.push(
      player("rb-decoy-1", FantasyPosition.RUNNING_BACK, 5, 1, "GGG"),
      player("rb-decoy-2", FantasyPosition.RUNNING_BACK, 6, 1, "HHH"),
      player("rb-decoy-3", FantasyPosition.RUNNING_BACK, 7, 1, "III"),
      player("rb-decoy-4", FantasyPosition.RUNNING_BACK, 9, 1, "JJJ"),
    )
    autoFixture.players
      .filter(candidate => candidate.position === FantasyPosition.WIDE_RECEIVER)
      .forEach(candidate => { candidate.userTier = 9 })

    const result = reviewCompletedMock({
      fixture: autoFixture,
      request: {maxAlternatives: 3},
    })

    expect(result.alternatives).not.toHaveLength(0)
    expect(result.alternatives.every(alternative =>
      alternative.scorecard.starterPlayerIds.some(id =>
        autoFixture.players.find(candidate => candidate.id === id)?.position
          === FantasyPosition.WIDE_RECEIVER),
    )).toBe(true)
  })

  it("uses the observed selection deadline and is repeatable", () => {
    const request = {
      exactPlayerOverrides: {1: "rb-branch", 2: "wr-opponent"},
      maxAlternatives: 3,
    }
    const first = reviewCompletedMock({fixture: fixture(), request})
    const second = reviewCompletedMock({fixture: fixture(), request})
    expect(first).toEqual(second)
    // wr-opponent was selected at #3, before the user's second pick at #4.
    expect(first.alternatives).toEqual([])
  })

  it("retains a recorded late pick through its observed deadline even when ADP is earlier", () => {
    const lateRoundFixture = fixture()
    lateRoundFixture.players = lateRoundFixture.players.filter(player =>
      ["wr-actual", "rb-branch", "wr-opponent", "rb-actual"].includes(player.id))
    lateRoundFixture.players.find(player => player.id === "rb-actual")!.adp = 3

    const result = reviewCompletedMock({
      fixture: lateRoundFixture,
      request: {maxAlternatives: 1},
    })

    expect(result.alternatives).toHaveLength(1)
    expect(result.alternatives[0].picks[1]).toEqual(expect.objectContaining({
      overallPick: 4,
      playerId: "rb-actual",
      latestSafeOverallPick: 4,
      latestSafeUserPickNumber: 2,
      turnsEarly: 0,
    }))
    expect(observedDraftAvailability(lateRoundFixture)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        playerId: "rb-actual",
        observedOverallPick: 4,
        latestSafeOverallPick: 4,
        latestSafeUserPickNumber: 2,
        observedSelection: "user",
      }),
    ]))
  })

  it("orders alternate rosters by starter PAR before the legacy composite", () => {
    const parFixture = fixture()
    const lowParTierOne = parFixture.players.find(candidate => candidate.id === "rb-branch")!
    lowParTierOne.userTier = 1
    lowParTierOne.projectedMedian = 6
    const highParTierFive = parFixture.players.find(candidate => candidate.id === "rb-replacement")!
    highParTierFive.userTier = 5
    highParTierFive.projectedMedian = 16
    parFixture.actualPicks.push({overallPick: 5, rosterIndex: 1, playerId: "rb-replacement"})

    const result = reviewCompletedMock({fixture: parFixture, request: {maxAlternatives: 5}})

    expect(result.alternatives[0].selectedPlayerIds).toContain("rb-replacement")
    expect(result.alternatives[0].objective).toMatchObject({
      name: "starter_par_then_total_par_v1",
      starterProjectedPointsAboveReplacement: expect.any(Number),
      totalProjectedPointsAboveReplacement: expect.any(Number),
    })
    expect(result.alternatives[0].scorecard.playerMetrics.find(metric =>
      metric.playerId === "rb-replacement"),
    ).toMatchObject({replacementPoints: 5, projectedPointsAboveReplacement: 11})
  })

  it("can preserve early recorded picks while optimizing the remaining roster", () => {
    const result = reviewCompletedMock({
      fixture: fixture(),
      request: {preservePicksThrough: 1, maxAlternatives: 3},
    })

    expect(result.alternatives.length).toBeGreaterThan(0)
    expect(result.alternatives.every(alternative =>
      alternative.selectedPlayerIds[0] === "wr-actual"),
    ).toBe(true)
  })

  it("honors a bounded changed-pick request", () => {
    const result = reviewCompletedMock({
      fixture: fixture(),
      request: {maxChangedPicks: 1, maxAlternatives: 3},
    })

    expect(result.alternatives.length).toBeGreaterThan(0)
    expect(result.alternatives.every(alternative =>
      alternative.replayFidelity.changedUserPickCount <= 1),
    ).toBe(true)
  })

  it("waits on a late observed quarterback instead of spending an earlier pick", () => {
    const timingFixture = fixture()
    timingFixture.settings = {
      ...timingFixture.settings,
      numTeams: 3,
      numStartingQbs: 1,
      numStartingRbs: 1,
      numStartingWrs: 1,
    }
    timingFixture.source!.totalPicks = 7
    timingFixture.source!.numRounds = 3
    timingFixture.source!.platformRosterSize = 3
    timingFixture.players = [
      player("actual-rb", FantasyPosition.RUNNING_BACK, 1, 5, "A"),
      player("top-rb", FantasyPosition.RUNNING_BACK, 2, 1, "B"),
      player("dummy-rb", FantasyPosition.RUNNING_BACK, 3, 8, "C"),
      player("actual-wr", FantasyPosition.WIDE_RECEIVER, 4, 5, "D"),
      player("top-wr", FantasyPosition.WIDE_RECEIVER, 5, 1, "E"),
      player("dummy-wr", FantasyPosition.WIDE_RECEIVER, 6, 8, "F"),
      player("late-qb", FantasyPosition.QUARTERBACK, 100, 2, "G"),
      player("other-qb", FantasyPosition.QUARTERBACK, 7, 9, "H"),
    ]
    timingFixture.players.find(candidate => candidate.id === "top-rb")!.projectedMedian = 18
    timingFixture.players.find(candidate => candidate.id === "top-wr")!.projectedMedian = 18
    timingFixture.players.find(candidate => candidate.id === "late-qb")!.projectedMedian = 16
    timingFixture.actualPicks = [
      {overallPick: 1, rosterIndex: 0, playerId: "actual-rb"},
      {overallPick: 2, rosterIndex: 1, playerId: "top-rb"},
      {overallPick: 3, rosterIndex: 2, playerId: "dummy-rb"},
      {overallPick: 4, rosterIndex: 0, playerId: "actual-wr"},
      {overallPick: 5, rosterIndex: 1, playerId: "top-wr"},
      {overallPick: 6, rosterIndex: 2, playerId: "dummy-wr"},
      {overallPick: 7, rosterIndex: 0, playerId: "late-qb"},
    ]

    const result = reviewCompletedMock({fixture: timingFixture, request: {maxAlternatives: 1}})

    expect(result.alternatives[0].selectedPlayerIds).toEqual(["top-rb", "top-wr", "late-qb"])
    expect(result.alternatives[0].picks.find(pick => pick.playerId === "late-qb"))
      .toMatchObject({overallPick: 7, latestSafeOverallPick: 7, turnsEarly: 0})
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

  it("produces bounded PAR alternatives for a full recorded draft", () => {
    const result = reviewCompletedMock({
      fixture: recordedDraft as unknown as RecordedCompletedDraftReplay,
      request: {maxAlternatives: 5, preservePicksThrough: 8, maxChangedPicks: 8},
    })

    expect(result.alternatives.length).toBeGreaterThan(0)
    expect(result.alternatives.length).toBeLessThanOrEqual(5)
    expect(result.alternatives.every(alternative =>
      alternative.scorecard.totals.starterCount
        === alternative.scorecard.totals.requiredStarterSlots),
    ).toBe(true)
    expect(result.alternatives.map(alternative =>
      alternative.objective.starterProjectedPointsAboveReplacement),
    ).toEqual([...result.alternatives].map(alternative =>
      alternative.objective.starterProjectedPointsAboveReplacement).sort((left, right) => right - left))
  })
})
