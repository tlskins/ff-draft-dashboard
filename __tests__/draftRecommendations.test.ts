import {
  createDraftRecommendations,
} from "../behavior/draft-advisor/recommendations"
import { createPlayerRanks, createRosters, PlayerRanks } from "../behavior/draft"
import {getEmbeddedPlayerData} from "../behavior/playerData"
import {
  BoardSettings,
  DataRanker,
  FantasyPosition,
  FantasySettings,
  NFLTeam,
  Player,
  RankingSummary,
  ThirdPartyADPRanker,
  ThirdPartyRanker,
  Tier,
} from "../types"

const settings: FantasySettings = {
  ppr: true,
  numTeams: 4,
  numStartingQbs: 1,
  numStartingRbs: 1,
  numStartingWrs: 1,
  numStartingTes: 1,
  numFlex: 1,
  numBenchPlayers: 5,
}

const boardSettings: BoardSettings = {
  ranker: ThirdPartyRanker.CUSTOM,
  adpRanker: ThirdPartyADPRanker.ESPN,
}

const tier = (
  tierNumber: number,
  rank: number,
  value: number,
): Tier => ({
  tierNumber,
  upperLimitPlayerIdx: rank - 1,
  lowerLimitPlayerIdx: rank - 1,
  upperLimitValue: value + 2,
  lowerLimitValue: value - 2,
})

const player = (
  id: string,
  position: FantasyPosition,
  positionRank: number,
  adp: number,
  userTier = positionRank,
): Player => ({
  id,
  firstName: id,
  lastName: "",
  fullName: id,
  team: NFLTeam.FA,
  position,
  ranks: {
    [ThirdPartyRanker.CUSTOM]: {
      playerId: id,
      ranker: ThirdPartyRanker.CUSTOM,
      position,
      pprPositionRank: positionRank,
      standardPositionRank: positionRank,
      pprPositionTier: tier(userTier, positionRank, 0),
      standardPositionTier: tier(userTier, positionRank, 0),
    },
    [ThirdPartyRanker.ESPN]: {
      playerId: id,
      ranker: ThirdPartyRanker.ESPN,
      position,
      adp,
      pprPositionRank: positionRank,
      standardPositionRank: positionRank,
    },
  },
})

const positionalTiers = (
  first: number,
  second: number,
  later = 10,
): Tier[] => [
  tier(1, 1, first),
  tier(2, 2, second),
  {
    tierNumber: 3,
    upperLimitPlayerIdx: 2,
    lowerLimitPlayerIdx: 20,
    upperLimitValue: later + 2,
    lowerLimitValue: later - 2,
  },
]

const rankingSummary = (
  overrides: Partial<Record<FantasyPosition, Tier[]>> = {},
): RankingSummary => ({
  ranker: DataRanker.LAST_SSN_PPG,
  ppr: true,
  replacementLevels: {
    QB: [8, 10],
    RB: [12, 8],
    WR: [12, 8],
    TE: [8, 6],
    DST: [1, 0],
    K: [1, 0],
    "": [1, 0],
  },
  stdDevs: {
    QB: 2,
    RB: 2,
    WR: 2,
    TE: 2,
    DST: 0,
    K: 0,
    "": 0,
  },
  tiers: {
    QB: positionalTiers(22, 18),
    RB: positionalTiers(25, 14),
    WR: positionalTiers(20, 17),
    TE: positionalTiers(16, 15),
    DST: [],
    K: [],
    "": [],
    ...overrides,
  },
})

const ranksFor = (players: Player[]): PlayerRanks => ({
  QB: players.filter(candidate =>
    candidate.position === FantasyPosition.QUARTERBACK),
  RB: players.filter(candidate =>
    candidate.position === FantasyPosition.RUNNING_BACK),
  WR: players.filter(candidate =>
    candidate.position === FantasyPosition.WIDE_RECEIVER),
  TE: players.filter(candidate =>
    candidate.position === FantasyPosition.TIGHT_END),
  Purge: [],
  availPlayersByOverallRank: [...players],
  availPlayersByAdp: [...players],
})

describe("deterministic draft recommendations", () => {
  it("uses the visible configured positional leader for each current-board option", () => {
    const embedded = getEmbeddedPlayerData()
    const liveSettings: FantasySettings = {
      ppr: false,
      numTeams: 12,
      numStartingQbs: 1,
      numStartingRbs: 2,
      numStartingWrs: 2,
      numStartingTes: 1,
      numFlex: 1,
      numBenchPlayers: 5,
    }
    const liveBoardSettings: BoardSettings = {
      ranker: ThirdPartyRanker.HARRIS,
      adpRanker: ThirdPartyADPRanker.ESPN,
    }
    const liveRanks = createPlayerRanks(
      embedded.players,
      liveSettings,
      liveBoardSettings,
    )
    const result = createDraftRecommendations({
      settings: liveSettings,
      boardSettings: liveBoardSettings,
      rankingSummaries: embedded.rankingsSummaries,
      playerRanks: liveRanks,
      playerLib: Object.fromEntries(embedded.players.map(candidate => (
        [candidate.id, candidate]
      ))),
      roster: createRosters(liveSettings.numTeams)[0],
      currentPick: 1,
      myPickNum: 6,
    })

    for (const position of ["QB", "RB", "WR", "TE"] as const) {
      expect(result.positionCandidates?.find(candidate => (
        candidate.player.position === position
      ))?.player.id).toBe(liveRanks[position][0].id)
    }
  })

  it("suppresses stale ESPN lineage from automatic recommendations", () => {
    const stale = player("rb-stale", FantasyPosition.RUNNING_BACK, 1, 1)
    stale.ranks = {}
    stale.availability = {
      state: "unknown",
      automaticRecommendationEligible: false,
      source: "stable_player_universe",
      reason: "no_current_nflverse_catalog_match",
    }
    stale.sourcePresence = {
      espn: {
        presentInCurrentResponse: false,
        lastSeenAt: "2026-07-01T00:00:00Z",
        reason: "not_present_in_current_response",
        lastKnownRank: {
          playerId: stale.id,
          ranker: ThirdPartyRanker.ESPN,
          position: stale.position,
          adp: 1,
          standardPositionRank: 1,
          pprPositionRank: 1,
        },
      },
    }
    const current = player("rb-current", FantasyPosition.RUNNING_BACK, 2, 20)
    current.availability = {
      state: "ranked_current",
      automaticRecommendationEligible: true,
      source: "nflverse_players",
      reason: "nflverse_status_active",
    }
    const candidates = [stale, current]

    const result = createDraftRecommendations({
      settings,
      boardSettings,
      rankingSummaries: [rankingSummary()],
      playerRanks: ranksFor(candidates),
      playerLib: Object.fromEntries(
        candidates.map(candidate => [candidate.id, candidate]),
      ),
      roster: createRosters(settings.numTeams)[0],
      currentPick: 1,
      myPickNum: 1,
    })

    expect(result.candidates.map(candidate => candidate.player.id))
      .toContain("rb-current")
    expect(result.candidates.map(candidate => candidate.player.id))
      .not.toContain("rb-stale")
  })

  it("honors Custom positional authority for a nonterminal suppressed player", () => {
    const custom = player("rb-custom", FantasyPosition.RUNNING_BACK, 1, 1)
    delete custom.ranks[ThirdPartyRanker.ESPN]
    custom.availability = {
      state: "free_agent",
      automaticRecommendationEligible: false,
      source: "nflverse_players",
      reason: "nflverse_status_cut",
    }
    const current = player("rb-current", FantasyPosition.RUNNING_BACK, 2, 20)
    current.availability = {
      state: "ranked_current",
      automaticRecommendationEligible: true,
      source: "nflverse_players",
      reason: "nflverse_status_active",
    }
    const candidates = [current, custom]

    const result = createDraftRecommendations({
      settings,
      boardSettings,
      rankingSummaries: [rankingSummary()],
      playerRanks: ranksFor(candidates),
      playerLib: Object.fromEntries(
        candidates.map(candidate => [candidate.id, candidate]),
      ),
      roster: createRosters(settings.numTeams)[0],
      currentPick: 1,
      myPickNum: 1,
    })

    expect(result.candidates.map(candidate => candidate.player.id))
      .toContain("rb-custom")
  })

  it("preserves positional rank order and returns three candidates", () => {
    const candidates = [
      player("qb-1", FantasyPosition.QUARTERBACK, 1, 8),
      player("qb-2", FantasyPosition.QUARTERBACK, 2, 40),
      player("rb-1", FantasyPosition.RUNNING_BACK, 1, 9, 1),
      player("rb-2", FantasyPosition.RUNNING_BACK, 2, 30, 3),
      player("wr-1", FantasyPosition.WIDE_RECEIVER, 1, 10),
      player("wr-2", FantasyPosition.WIDE_RECEIVER, 2, 31),
      player("te-1", FantasyPosition.TIGHT_END, 1, 11),
      player("te-2", FantasyPosition.TIGHT_END, 2, 32),
    ]
    const result = createDraftRecommendations({
      settings,
      boardSettings,
      rankingSummaries: [rankingSummary()],
      playerRanks: ranksFor(candidates),
      playerLib: Object.fromEntries(
        candidates.map(candidate => [candidate.id, candidate]),
      ),
      roster: createRosters(settings.numTeams)[0],
      currentPick: 4,
      myPickNum: 1,
      predictedPicks: { "rb-1": 1 },
    })

    expect(result.candidates).toHaveLength(3)
    expect(result.candidates.map(candidate => candidate.player.id))
      .not.toContain("rb-2")
    expect(result.candidates.find(candidate =>
      candidate.player.id === "rb-1")?.evidence).toMatchObject({
        userTier: 1,
        projectionTier: 1,
        survivalProbability: 0.05,
        rosterRole: "open_starter",
      })
  })

  it("optimizes starters and flex before discounting bench upside", () => {
    const candidates = [
      player("rb-1", FantasyPosition.RUNNING_BACK, 1, 20),
      player("rb-2", FantasyPosition.RUNNING_BACK, 2, 40),
      player("wr-1", FantasyPosition.WIDE_RECEIVER, 1, 20),
      player("wr-2", FantasyPosition.WIDE_RECEIVER, 2, 40),
    ]
    const drafted = [
      player("qb-old", FantasyPosition.QUARTERBACK, 5, 1),
      player("rb-old", FantasyPosition.RUNNING_BACK, 5, 2),
      player("wr-old", FantasyPosition.WIDE_RECEIVER, 5, 3),
      player("wr-flex", FantasyPosition.WIDE_RECEIVER, 6, 4),
      player("te-old", FantasyPosition.TIGHT_END, 5, 5),
    ]
    const roster = createRosters(settings.numTeams)[0]
    drafted.forEach(draftedPlayer => {
      roster.picks.push(draftedPlayer.id)
      roster[draftedPlayer.position as keyof typeof roster]!.push(
        draftedPlayer.id,
      )
    })
    const allPlayers = [...candidates, ...drafted]
    const result = createDraftRecommendations({
      settings,
      boardSettings,
      rankingSummaries: [rankingSummary({
        QB: positionalTiers(9, 8, 10),
        RB: positionalTiers(25, 14, 10),
        WR: positionalTiers(8, 7, 10),
        TE: positionalTiers(16, 15, 10),
      })],
      playerRanks: ranksFor(candidates),
      playerLib: Object.fromEntries(
        allPlayers.map(candidate => [candidate.id, candidate]),
      ),
      roster,
      currentPick: 6,
      myPickNum: 1,
    })

    const rb = result.candidates.find(candidate =>
      candidate.player.id === "rb-1")
    const wr = result.candidates.find(candidate =>
      candidate.player.id === "wr-1")
    expect(rb?.evidence.rosterRole).toBe("flex_upgrade")
    expect(rb?.evidence.marginalLineupPoints).toBeGreaterThan(0)
    expect(wr?.evidence.rosterRole).toBe("bench")
    expect(wr?.evidence.marginalLineupPoints).toBe(0)
    expect(wr?.evidence.benchUtility).toBeGreaterThan(0)
  })

  it("fails closed when the user's roster is full", () => {
    const candidate = player(
      "rb-1",
      FantasyPosition.RUNNING_BACK,
      1,
      20,
    )
    const roster = createRosters(settings.numTeams)[0]
    roster.picks = Array.from(
      { length: 10 },
      (_, index) => `drafted-${index}`,
    )

    const result = createDraftRecommendations({
      settings,
      boardSettings,
      rankingSummaries: [rankingSummary()],
      playerRanks: ranksFor([candidate]),
      playerLib: { [candidate.id]: candidate },
      roster,
      currentPick: 8,
      myPickNum: 1,
    })

    expect(result.candidates).toEqual([])
  })

  it("uses combined opponent evidence for survival and urgent views", () => {
    const candidates = [
      player("rb-1", FantasyPosition.RUNNING_BACK, 1, 20),
      player("rb-2", FantasyPosition.RUNNING_BACK, 2, 30, 2),
    ]
    const result = createDraftRecommendations({
      settings,
      boardSettings,
      rankingSummaries: [rankingSummary()],
      playerRanks: ranksFor(candidates),
      playerLib: Object.fromEntries(
        candidates.map(candidate => [candidate.id, candidate]),
      ),
      roster: createRosters(settings.numTeams)[0],
      currentPick: 2,
      myPickNum: 1,
      opponentForecast: {
        schemaVersion: 1,
        model: "combined",
        targetRosterIndex: 0,
        picks: [{
          overallPick: 2,
          rosterIndex: 1,
          positionProbabilities: [{
            position: FantasyPosition.RUNNING_BACK,
            probability: 0.8,
          }],
          playerProbabilities: [{
            playerId: "rb-1",
            name: "rb-1",
            position: FantasyPosition.RUNNING_BACK,
            conditionalProbability: 1,
            overallProbability: 0.8,
          }],
        }],
        runProbabilities: [{
          position: FantasyPosition.RUNNING_BACK,
          minimumPicks: 3,
          probability: 0.6,
        }],
        tierBoundaryProbabilities: [{
          position: FantasyPosition.RUNNING_BACK,
          userTier: 1,
          playerIds: ["rb-1"],
          probability: 0.8,
        }],
      },
    })
    const rb = result.candidates[0]

    expect(result.preferredView).toBe("tier_landscape")
    expect(rb.evidence.survivalProbability).toBeCloseTo(0.2)
    expect(rb.evidence.positionalRunProbability).toBe(0.6)
    expect(rb.evidence.tierBoundaryProbability).toBe(0.8)
    expect(rb.evidence.flags).toEqual(expect.arrayContaining([
      "Modeled positional run",
      "User tier may be exhausted",
    ]))
  })

  it("selects the view from distance to the next snake-draft pick", () => {
    const candidate = player(
      "rb-1",
      FantasyPosition.RUNNING_BACK,
      1,
      20,
    )
    const common = {
      settings,
      boardSettings,
      rankingSummaries: [rankingSummary()],
      playerRanks: ranksFor([candidate]),
      playerLib: { [candidate.id]: candidate },
      roster: createRosters(settings.numTeams)[0],
      myPickNum: 1,
    }

    expect(createDraftRecommendations({
      ...common,
      currentPick: 1,
    }).preferredView).toBe("cross_position")
    expect(createDraftRecommendations({
      ...common,
      currentPick: 8,
    }).nextUserPick).toBe(9)
    expect(createDraftRecommendations({
      ...common,
      currentPick: 6,
    }).preferredView).toBe("cross_position")
    expect(createDraftRecommendations({
      ...common,
      currentPick: 3,
    }).preferredView).toBe("positional_bests")
    expect(createDraftRecommendations({
      ...common,
      currentPick: 2,
    }).preferredView).toBe("tier_landscape")
  })
})
