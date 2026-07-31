import {
  AnalysisQuery,
  executeHistoricalAnalysis,
} from "../behavior/api/historicalAnalysis"


const query: AnalysisQuery = {
  player_ids: ["espn-alpha", "espn-beta"],
  positions: [],
  seasons: {start: 2023, end: 2025},
  weeks: [1, 2, 3],
  scoring_profile_id: "ppr",
  metrics: [
    "fantasy_points_mean",
    "fantasy_points_p10",
    "fantasy_points_p90",
  ],
  group_by: "season",
  filters: [{
    field: "fantasy_points",
    operator: "gte",
    value: 5,
  }],
  sort: {
    field: "season",
    direction: "asc",
  },
  limit: 100,
  visualization: {
    type: "line",
    x: "season",
    y: "fantasy_points_mean",
    color: "player_id",
  },
}

describe("historical analysis API", () => {
  it("posts the bounded typed query and returns its chart dataset", async () => {
    const result = {
      query,
      scoring_profile: {id: "ppr", weights: {}},
      sources: [],
      columns: {
        dimensions: ["player_id", "player_name", "position", "season"],
        metrics: query.metrics,
      },
      visualization: query.visualization,
      row_count: 0,
      truncated: false,
      rows: [],
    }
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => result,
    })

    const response = await executeHistoricalAnalysis(query, {
      apiHost: "http://127.0.0.1:5000/",
      fetcher: fetcher as unknown as typeof fetch,
    })

    expect(fetcher).toHaveBeenCalledWith(
      "http://127.0.0.1:5000/v1/historical/query",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(query),
      }),
    )
    expect(response).toEqual(result)
  })

  it("surfaces the API validation message", async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({error: "visualization.x is not available"}),
    })

    await expect(executeHistoricalAnalysis(query, {
      apiHost: "http://127.0.0.1:5000",
      fetcher: fetcher as unknown as typeof fetch,
    })).rejects.toThrow("visualization.x is not available")
  })
})
