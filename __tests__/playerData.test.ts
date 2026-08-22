import {
  getEmbeddedPlayerData,
  loadPlayerData,
  rankingsAgeInDays,
  rankingsAreStale,
} from "../behavior/playerData"
import { Rankings } from "../types"

const rankings = {
  cachedAt: "2026-07-01T00:00:00Z",
} as Rankings

describe("rankings freshness", () => {
  it("embeds the corrected stable player universe and release evidence", () => {
    const embeddedRankings = getEmbeddedPlayerData()
    const absentFromEspn = embeddedRankings.players.filter(player =>
      player.sourcePresence?.espn.presentInCurrentResponse === false)
    const aiyuk = embeddedRankings.players.find(player =>
      player.fullName === "Brandon Aiyuk")

    expect(embeddedRankings.players).toHaveLength(455)
    expect(new Set(embeddedRankings.players.map(player => player.id)).size)
      .toBe(455)
    expect(absentFromEspn).toHaveLength(19)
    expect(absentFromEspn.every(player =>
      player.ranks["ESPN"] == null)).toBe(true)
    expect(aiyuk).toMatchObject({
      sourcePresence: {espn: {presentInCurrentResponse: true}},
      availability: {
        state: "free_agent",
        sourceStatus: "RLS",
        automaticRecommendationEligible: false,
      },
    })
    expect(aiyuk?.ranks["ESPN"]).toBeDefined()
  })

  it("reports the age of the rankings snapshot", () => {
    expect(
      rankingsAgeInDays(
        rankings,
        Date.parse("2026-07-30T00:00:00Z"),
      ),
    ).toBe(29)
  })

  it("flags rankings older than the allowed age", () => {
    expect(
      rankingsAreStale(
        rankings,
        14,
        Date.parse("2026-07-30T00:00:00Z"),
      ),
    ).toBe(true)
  })

  it("presents API source and availability evidence in dashboard casing", async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        cached_at: "2026-08-13T03:43:50Z",
        season: 2026,
        settings: {},
        rankings_summaries: [],
        all_data_rankers: [],
        all_third_party_rankers: ["Matt Harmon"],
        ranking_sources: {
          schema_version: 1,
          sources: [{
            id: "matt-harmon",
            provider_id: "import-matt-harmon",
            provider_name: "Yahoo Sports / Reception Perception",
            ranker: "Matt Harmon",
            publisher: "Yahoo Sports / Reception Perception",
            ingestion_mode: "user_import",
            scoring_formats: ["half_ppr", "ppr"],
            source_url: "https://sports.yahoo.com/fantasy/topic/rankings/",
            season: 2026,
            retrieved_at: "2026-08-22T12:00:00Z",
            source_updated_at: "2026-08-21T16:00:00Z",
            fingerprint: "a".repeat(64),
            raw_source_fingerprint: "b".repeat(64),
            record_count: 1,
            tier_method: "last_season_ppg_rank_band_v1",
            source_native_tier_count: 1,
          }],
        },
        players: [{
          id: "101",
          first_name: "Alpha",
          last_name: "Runner",
          full_name: "Alpha Runner",
          team: "BUF",
          position: "RB",
          ranks: {"Matt Harmon": {
            player_id: "101",
            ranker: "Matt Harmon",
            position: "RB",
            metric_value_ppr: null,
            metric_value_std: null,
            metric_value_half_ppr: null,
            adp: null,
            standard_overall_rank: null,
            half_ppr_overall_rank: 7,
            ppr_overall_rank: 8,
            standard_position_rank: null,
            standard_position_tier: null,
            half_ppr_position_rank: 3,
            half_ppr_position_tier: null,
            ppr_position_rank: 4,
            ppr_position_tier: null,
            source_position_tiers: {half_ppr: 2},
          }},
          historical_stats: {},
          source_presence: {espn: {
            present_in_current_response: false,
            last_seen_at: "2026-07-01T00:00:00Z",
            source_url: null,
            source_fingerprint: null,
            reason: "not_present_in_current_response",
            last_known_rank: null,
          }},
          availability: {
            state: "active_unranked",
            automatic_recommendation_eligible: false,
            source: "nflverse_players",
            source_url: null,
            observed_at: "2026-08-13T03:43:50Z",
            reason: "nflverse_status_active",
            source_status: "ACT",
          },
          injury_status: {
            status: "QUESTIONABLE",
            injured: false,
            source: "espn",
            observed_at: "2026-08-20T20:00:00Z",
          },
        }],
      }),
    }) as unknown as typeof fetch

    const loaded = await loadPlayerData({
      apiHost: "http://api.test",
      fetcher,
    })

    expect(loaded.players[0]).toMatchObject({
      sourcePresence: {espn: {presentInCurrentResponse: false}},
      availability: {
        state: "active_unranked",
        automaticRecommendationEligible: false,
        sourceStatus: "ACT",
      },
      injuryStatus: {
        status: "QUESTIONABLE",
        injured: false,
        source: "espn",
        observedAt: "2026-08-20T20:00:00Z",
      },
      ranks: {"Matt Harmon": {
        halfPprOverallRank: 7,
        halfPprPositionRank: 3,
        pprPositionRank: 4,
        sourcePositionTiers: {halfPpr: 2},
      }},
    })
    expect(loaded.allThirdPartyRankers).toEqual(["Matt Harmon"])
    expect(loaded.rankingSources?.sources[0]).toMatchObject({
      id: "matt-harmon",
      ranker: "Matt Harmon",
      scoringFormats: ["half_ppr", "ppr"],
      ingestionMode: "user_import",
    })
  })
})
