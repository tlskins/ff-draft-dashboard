import {
  buildHistoricalInsightModel,
  buildPlayerStatusInsightModel,
  buildRankTierDisagreementModel,
  buildSourceReadinessInsightModel,
} from "../behavior/insights/apiInsightModels"
import type {HistoricalComparisonResponse} from "../behavior/api/historical"
import type {ReadApiResourceSnapshot} from "../behavior/api/readApiCache"
import {
  FantasyPosition,
  NFLTeam,
  ThirdPartyRanker,
  type FantasySettings,
  type Player,
} from "../types"


const settings: FantasySettings = {
  ppr: true,
  numTeams: 12,
  numStartingQbs: 1,
  numStartingRbs: 2,
  numStartingWrs: 2,
  numStartingTes: 1,
  numFlex: 1,
  numBenchPlayers: 6,
}

const distribution = (mean: number, deviation = 5) => ({
  games: 17,
  mean,
  median: mean,
  std_dev: deviation,
  minimum: 1,
  p10: mean - 7,
  p25: mean - 3,
  p50: mean,
  p75: mean + 3,
  p90: mean + 8,
  maximum: mean + 14,
})

const player = (id: string): Player => ({
  id,
  firstName: id,
  lastName: "Player",
  fullName: `${id} Player`,
  team: NFLTeam.BUF,
  position: FantasyPosition.RUNNING_BACK,
  ranks: {
    [ThirdPartyRanker.ESPN]: {
      playerId: id,
      ranker: ThirdPartyRanker.ESPN,
      position: FantasyPosition.RUNNING_BACK,
      standardPositionRank: 4,
      pprPositionRank: 3,
      pprPositionTier: {
        tierNumber: 1,
        upperLimitPlayerIdx: 0,
        lowerLimitPlayerIdx: 4,
        upperLimitValue: 20,
        lowerLimitValue: 16,
      },
    },
    [ThirdPartyRanker.HARRIS]: {
      playerId: id,
      ranker: ThirdPartyRanker.HARRIS,
      position: FantasyPosition.RUNNING_BACK,
      standardPositionRank: 10,
      pprPositionRank: 12,
      pprPositionTier: {
        tierNumber: 3,
        upperLimitPlayerIdx: 9,
        lowerLimitPlayerIdx: 14,
        upperLimitValue: 15,
        lowerLimitValue: 12,
      },
    },
  },
})

describe("API-backed insight presentation models", () => {
  it("derives risk and season-movement signals without changing player order", () => {
    const response = {
      season: 2025,
      seasons: [2024, 2025],
      scoring_profile: {id: "ppr", weights: {}},
      source: {id: "weekly", provider: "nflverse", dataset: "stats_player_week", sha256: "a", retrieved_at: "2026-08-20T00:00:00Z", schema_version: 1},
      sources: [{id: "weekly", provider: "nflverse", dataset: "stats_player_week", sha256: "a", retrieved_at: "2026-08-20T00:00:00Z", schema_version: 1}],
      identity_miss_count: 0,
      players: [
        {player_id: "b", player_name: "B", position: "RB", distribution: distribution(18, 8), season_distributions: [{season: 2024, distribution: distribution(13)}, {season: 2025, distribution: distribution(18)}], weeks: []},
        {player_id: "a", player_name: "A", position: "RB", distribution: distribution(16, 4), season_distributions: [{season: 2024, distribution: distribution(16)}, {season: 2025, distribution: distribution(15)}], weeks: []},
      ],
    } satisfies HistoricalComparisonResponse
    const resource: ReadApiResourceSnapshot<HistoricalComparisonResponse> = {
      key: "history",
      state: "ready",
      data: response,
      error: null,
      updatedAt: 1,
      expiresAt: 2,
      fingerprint: "history:fingerprint",
    }
    const model = buildHistoricalInsightModel(resource)

    expect(model.players.map(item => item.player_id)).toEqual(["b", "a"])
    expect(model.riskScore).toBe(8)
    expect(model.trendScore).toBe(5)
  })

  it("limits rank disagreement to published board rankers", () => {
    const model = buildRankTierDisagreementModel([player("one")], settings)
    expect(model.state).toBe("ready")
    expect(model.maximumSpread).toBe(9)
    expect(model.players[0].ranks.map(rank => rank.source)).toEqual([
      ThirdPartyRanker.ESPN,
      ThirdPartyRanker.HARRIS,
    ])
  })

  it("surfaces only fresh actionable player status", () => {
    const currentPlayer = player("one")
    const model = buildPlayerStatusInsightModel([currentPlayer], {
      one: {
        playerId: "one",
        state: "ready",
        resourceState: "ready",
        loadedAt: 1,
        response: {
          schema_version: 1,
          player_id: "one",
          last_updated_at: "2026-08-20T00:00:00Z",
          events: [{
            schema_version: 1,
            id: "injury-one",
            player_id: "one",
            type: "injury",
            status: "questionable",
            short_summary: "Limited in practice.",
            source: "nflverse_injuries",
            source_url: null,
            source_published_at: "2026-08-20T00:00:00Z",
            fetched_at: "2026-08-20T01:00:00Z",
            confidence: .9,
            recommendation_impact: "material",
            stale: false,
          }],
        },
      },
    })
    expect(model.state).toBe("ready")
    expect(model.maximumImpact).toBe("material")
    expect(model.items[0].events).toHaveLength(1)
  })

  it("keeps unavailable ranking-source metadata explicit beside readiness", () => {
    const ranking = {
      key: "sources",
      state: "unavailable" as const,
      data: {sources: []},
      error: null,
      updatedAt: 1,
      expiresAt: 2,
      fingerprint: "sources:none",
      unavailableReason: "No ranking metadata.",
    }
    const model = buildSourceReadinessInsightModel(ranking, {
      data: null,
      error: null,
      loading: false,
      resourceState: "unavailable",
    })
    expect(model.state).toBe("unavailable")
    expect(model.unavailableReason).toBe("No ranking metadata.")
    expect(model.rankingsCachedAt).toBeNull()
  })
})
