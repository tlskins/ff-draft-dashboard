import type {
  DataReadinessResponse,
  DataReadinessState,
} from "../behavior/api/dataReadiness"


export const completedDataReadiness: DataReadinessResponse = {
  schema_version: 1,
  generated_at: "2026-08-12T12:00:00Z",
  current_fantasy_season: 2026,
  completed_season_through: 2025,
  rankings: {
    availability: "available",
    season: 2026,
    cached_at: "2026-07-30T14:18:40Z",
    source: "file",
    player_count: 455,
    fingerprint: "rankings-fingerprint",
  },
  identity_catalog: {
    availability: "available",
    source: "nflverse",
    dataset: "players",
    source_url: "https://example.test/players.csv",
    retrieved_at: "2026-07-30T14:18:40Z",
    fingerprint: "catalog-fingerprint",
    player_count: 8364,
  },
  imported_weekly_seasons: [2021, 2022, 2023, 2024, 2025].map(
    season => ({
      season,
      classification: "completed" as const,
      source_url: `https://example.test/weekly-${season}.csv`,
      fingerprint: `weekly-${season}`,
      retrieved_at: "2026-07-30T14:18:40Z",
      row_count: 100,
      identity_miss_count: 0,
    }),
  ),
  completed_seasons: [2021, 2022, 2023, 2024, 2025],
  current_partial_seasons: [],
  historical_identity_miss_count: 0,
  status_sources: ["weekly_rosters", "transactions", "injuries"].map(
    dataset => ({
      provider: "nflverse",
      dataset,
      season: null,
      availability: "never_imported" as const,
      freshness: "unknown" as const,
      evidence: "none" as const,
      source_url: null,
      fingerprint: null,
      retrieved_at: null,
      record_count: 0,
      reason: "No import run or stored status event exists.",
    }),
  ),
}

export const completedDataReadinessState: DataReadinessState = {
  data: completedDataReadiness,
  error: null,
  loading: false,
}
