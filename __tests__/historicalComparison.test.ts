import {
  loadHistoricalComparison,
} from "../behavior/api/historical"


describe("historical comparison API", () => {
  it("uses canonical player IDs and the selected scoring profile", async () => {
    const response = {
      season: 2025,
      seasons: [2024, 2025],
      source: {
        id: "source",
        provider: "nflverse" as const,
        dataset: "stats_player_week" as const,
        sha256: "abc",
        retrieved_at: "2026-07-30T00:00:00Z",
        schema_version: 1 as const,
      },
      sources: [],
      scoring_profile: {
        id: "half_ppr" as const,
        weights: {},
      },
      identity_miss_count: 0,
      players: [],
    }
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => response,
    })

    const result = await loadHistoricalComparison({
      playerIds: ["espn-one", "espn-two"],
      seasons: [2024, 2025],
      scoringProfile: "half_ppr",
      apiHost: "http://127.0.0.1:5000/",
      fetcher: fetcher as unknown as typeof fetch,
    })

    const requestedUrl = new URL(fetcher.mock.calls[0][0])
    expect(requestedUrl.pathname).toBe(
      "/v1/historical/comparison",
    )
    expect(requestedUrl.searchParams.get("player_ids")).toBe(
      "espn-one,espn-two",
    )
    expect(requestedUrl.searchParams.get("scoring_profile")).toBe(
      "half_ppr",
    )
    expect(requestedUrl.searchParams.get("seasons")).toBe(
      "2024,2025",
    )
    expect(result).toEqual(response)
  })
})
