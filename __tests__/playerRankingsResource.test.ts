import {ReadApiCache} from "../behavior/api/readApiCache"
import {
  loadPlayerRankingsResource,
} from "../behavior/api/playerRankingsResource"


describe("published rankings shared resource", () => {
  it("deduplicates a current published ranking request", async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        cached_at: new Date().toISOString(),
        season: 2026,
        settings: {
          ppr: true,
          num_teams: 12,
          num_starting_qbs: 1,
          num_starting_rbs: 2,
          num_starting_wrs: 2,
          num_starting_tes: 1,
          num_flex_positions: 1,
          num_bench_players: 6,
        },
        players: [],
        rankings_summaries: [],
        all_data_rankers: [],
        all_third_party_rankers: [],
      }),
    })
    const cache = new ReadApiCache()
    const options = {
      apiHost: "https://api.example.test",
      fetcher: fetcher as unknown as typeof fetch,
    }
    const first = loadPlayerRankingsResource(cache, options)
    const second = loadPlayerRankingsResource(cache, options)
    expect(first).toBe(second)
    await expect(first).resolves.toMatchObject({state: "ready"})
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it("retains an explicitly unavailable embedded fallback", async () => {
    const cache = new ReadApiCache()
    const resource = await loadPlayerRankingsResource(cache, {
      apiHost: "https://api.example.test",
      fetcher: jest.fn().mockRejectedValue(new Error("offline")) as unknown as typeof fetch,
    })
    expect(resource.state).toBe("unavailable")
    expect(resource.data?.players.length).toBeGreaterThan(0)
    expect(resource.unavailableReason).toContain("Using the embedded rankings snapshot")
  })
})

