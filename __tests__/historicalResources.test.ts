import {ReadApiCache} from "../behavior/api/readApiCache"
import {
  loadHistoricalComparisonResource,
} from "../behavior/api/historicalResources"


describe("shared historical read resources", () => {
  it("deduplicates and bounds automatic comparison requests to three players and five seasons", async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        season: 2025,
        seasons: [2021, 2022, 2023, 2024, 2025],
        source: {id: "weekly", provider: "nflverse", dataset: "stats_player_week", sha256: "a", retrieved_at: "2026-08-20T00:00:00Z", schema_version: 1},
        sources: [{id: "weekly", provider: "nflverse", dataset: "stats_player_week", sha256: "a", retrieved_at: "2026-08-20T00:00:00Z", schema_version: 1}],
        scoring_profile: {id: "ppr", weights: {}},
        identity_miss_count: 0,
        players: [],
      }),
    })
    const cache = new ReadApiCache()
    const options = {
      playerIds: ["one", "two", "three", "four"],
      seasons: [2019, 2020, 2021, 2022, 2023, 2024, 2025],
      scoringProfile: "ppr" as const,
      apiHost: "https://api.example.test",
      fetcher: fetcher as unknown as typeof fetch,
    }
    const first = loadHistoricalComparisonResource(cache, options)
    const second = loadHistoricalComparisonResource(cache, options)
    expect(first).toBe(second)
    await first

    expect(fetcher).toHaveBeenCalledTimes(1)
    const url = new URL(fetcher.mock.calls[0][0])
    expect(url.searchParams.get("player_ids")).toBe("one,two,three")
    expect(url.searchParams.get("seasons")).toBe("2021,2022,2023,2024,2025")
  })
})

