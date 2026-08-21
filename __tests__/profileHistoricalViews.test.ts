import type {AnalysisQueryResponse} from "../behavior/api/historicalAnalysis"
import {
  buildProfileHistoricalQuery,
  presentProfileHistoricalView,
  selectProfileHistoricalView,
} from "../behavior/profile/profileHistoricalViews"


const response = (counts: number[]): AnalysisQueryResponse => {
  const seasons = counts.map((_, index) => 2024 + index)
  const query = buildProfileHistoricalQuery({
    playerId: "player-one",
    scoringProfile: "ppr",
    seasons,
  })
  const rows = counts.flatMap((count, seasonIndex) => Array.from(
    {length: count},
    (_, weekIndex) => ({
      dimensions: {
        player_id: "player-one",
        player_name: "Player One",
        position: "RB",
        season: seasons[seasonIndex],
        week: weekIndex + 1,
      },
      metrics: {games: 1, fantasy_points_mean: 10 + weekIndex},
    }),
  ))
  return {
    query,
    scoring_profile: {id: "ppr", weights: {}},
    sources: [],
    columns: {
      dimensions: ["player_id", "player_name", "position", "season", "week"],
      metrics: ["games", "fantasy_points_mean"],
    },
    visualization: query.visualization,
    row_count: rows.length,
    truncated: false,
    rows,
  }
}

describe("profile historical-view registry", () => {
  it("builds one bounded weekly query for every presentation", () => {
    expect(buildProfileHistoricalQuery({
      playerId: "player-one",
      scoringProfile: "half_ppr",
      seasons: [2023, 2024, 2025],
    })).toMatchObject({
      player_ids: ["player-one"],
      seasons: [2023, 2024, 2025],
      scoring_profile_id: "half_ppr",
      group_by: "week",
      limit: 100,
      visualization: {
        type: "heatmap",
        x: "week",
        y: "fantasy_points_mean",
        color: "player_name",
        facet: "season",
      },
    })
  })

  it("selects playing-time gaps, stable distributions, and small samples deterministically", () => {
    expect(selectProfileHistoricalView(response([17, 10])).id).toBe("weekly_heatmap")
    expect(selectProfileHistoricalView(response([17, 17])).id).toBe("scoring_density")
    expect(selectProfileHistoricalView(response([5])).id).toBe("weekly_trend")
  })

  it("changes only presentation metadata when switching the validated response", () => {
    const source = response([17, 17])
    const density = presentProfileHistoricalView(source, "scoring_density")
    expect(density.rows).toBe(source.rows)
    expect(density.visualization).toEqual({
      type: "density",
      x: "fantasy_points_mean",
      y: "fantasy_points_mean",
      color: "season",
    })
    expect(source.visualization.type).toBe("heatmap")
  })
})
