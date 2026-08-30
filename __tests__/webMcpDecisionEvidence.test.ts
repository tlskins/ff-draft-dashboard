import {
  buildDraftyDecisionContext,
  buildDraftyPlayerEvidence,
} from "../behavior/webmcp/draftyDecisionEvidence"
import {
  FantasyPosition,
  NFLTeam,
  ThirdPartyADPRanker,
  ThirdPartyRanker,
  type Player,
} from "../types"

const tier = {
  tierNumber: 2,
  upperLimitPlayerIdx: 0,
  lowerLimitPlayerIdx: 3,
  upperLimitValue: 15,
  lowerLimitValue: 12,
}
const player: Player = {
  id: "kraft",
  firstName: "Tucker",
  lastName: "Kraft",
  fullName: "Tucker Kraft",
  team: NFLTeam.GB,
  position: FantasyPosition.TIGHT_END,
  ranks: {
    [ThirdPartyRanker.HARRIS]: {
      playerId: "kraft", ranker: ThirdPartyRanker.HARRIS,
      position: FantasyPosition.TIGHT_END, standardOverallRank: 72,
      standardPositionRank: 7, standardPositionTier: tier,
    },
    [ThirdPartyADPRanker.ESPN]: {
      playerId: "kraft", ranker: ThirdPartyADPRanker.ESPN,
      position: FantasyPosition.TIGHT_END, adp: 96.5,
    },
  },
  historicalStats: {
    "2025": {
      rk: 1, player: "Tucker Kraft", name: "Tucker Kraft", tm: NFLTeam.GB,
      team: "GB", fantPos: FantasyPosition.TIGHT_END, position: "TE",
      playerId: "kraft", year: 2025, g: 8,
      fantasyPointsPerGame: 8, pprPointsPerGame: 12,
    },
  },
  outlook: {text: "A bounded outlook.", source: "espn", season: 2026, observedAt: null},
}
const evidence = {
  projectedFloor: 10, projectedMedian: 12, projectedCeiling: 14,
  replacementLevel: 8, pointsAboveReplacement: 4,
  marginalLineupPoints: 2, benchUtility: 0, tierLossIfDeferred: 2,
  survivalProbability: .35, positionalRunProbability: .4,
  tierBoundaryProbability: .5, userTier: 2, projectionTier: 2,
  rosterRole: "open_starter" as const, flags: ["tier_cliff"],
}

describe("Phase 20A bounded WebMCP evidence", () => {
  it("exposes current pick distance, roster, needs, and deterministic candidates", () => {
    const result = buildDraftyDecisionContext({
      context: {
        schemaVersion: 1,
        league: {numTeams: 12, ppr: false},
        currentPick: 6,
        upcomingSlots: [
          {overallPick: 6, rosterIndex: 2},
          {overallPick: 7, rosterIndex: 3},
          {overallPick: 8, rosterIndex: 5},
        ],
        teams: [
          {rosterIndex: 5, draftedPlayerIds: ["kraft"], needs: []},
          {rosterIndex: 2, draftedPlayerIds: [], needs: [{position: FantasyPosition.RUNNING_BACK, openStarterSpots: 2}]},
        ],
        availablePlayers: [],
        recentPicks: [],
      },
      recommendations: {
        schemaVersion: 1, currentPick: 6, nextUserPick: 8,
        preferredView: "cross_position", viewExplanation: "Tier pressure is rising.",
        candidates: [{player, positionRank: 7, score: 9.25, evidence}],
        positionCandidates: [{player, positionRank: 7, score: 9.25, evidence}],
      },
      opponentForecast: null,
      roundMarket: null,
      playerLib: {kraft: player},
      targetRosterIndex: 5,
      sourceEventCount: 5,
    })
    expect(result).toMatchObject({
      schema_version: 1,
      status: "ready",
      current_pick: 6,
      next_user_pick: 8,
      picks_until_user: 2,
      user_roster: [{player_id: "kraft", name: "Tucker Kraft"}],
      recommendation: {shortlist: [{player_id: "kraft"}]},
    })
  })

  it("returns scoring-specific history and bounded player evidence", () => {
    const result = buildDraftyPlayerEvidence({
      player,
      settings: {
        ppr: true, scoringFormat: "half_ppr", numTeams: 12,
        numStartingQbs: 1, numStartingRbs: 2, numStartingWrs: 2,
        numStartingTes: 1, numFlex: 1, numBenchPlayers: 6,
      },
      boardSettings: {ranker: ThirdPartyRanker.HARRIS, adpRanker: ThirdPartyADPRanker.ESPN},
      playerTargets: [{playerId: "kraft", targetAsEarlyAsRound: 7}],
      availablePlayerIds: new Set(["kraft"]),
      recommendations: null,
      status: undefined,
      peers: [player],
    })
    expect(result).toMatchObject({
      schema_version: 1,
      player: {player_id: "kraft", target_round: 7, available: true},
      board: {position_rank: 7, tier: 2, adp: 96.5},
      historical_production: {
        scoring_format: "half_ppr",
        seasons: [{season: 2025, points_per_game: 10}],
      },
    })
    expect(Buffer.byteLength(JSON.stringify(result), "utf8")).toBeLessThan(12000)
  })
})
