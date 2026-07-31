import {
  actionablePlayerStatus,
  currentPlayerStatus,
  loadPlayerStatus,
  PlayerStatusEvent,
  recommendationPlayerStatusEvidence,
} from "../behavior/api/playerStatus"
import {
  PlayerStatusCache,
} from "../behavior/api/playerStatusCache"


const event = (
  overrides: Partial<PlayerStatusEvent> = {},
): PlayerStatusEvent => ({
  schema_version: 1,
  id: "status_1",
  player_id: "espn/123",
  type: "injury",
  status: "questionable",
  short_summary: "Limited by a hamstring injury.",
  source: "league_injury_report",
  source_url: "https://example.test/injuries/123",
  source_published_at: "2026-08-01T08:00:00Z",
  fetched_at: "2026-08-01T09:00:00Z",
  confidence: 0.95,
  recommendation_impact: "review",
  stale: false,
  ...overrides,
})

const statusResponse = (playerId: string) => ({
  schema_version: 1 as const,
  player_id: playerId,
  last_updated_at: null,
  events: [],
})

describe("player status API", () => {
  it("loads a bounded player status response", async () => {
    const response = {
      schema_version: 1 as const,
      player_id: "espn/123",
      last_updated_at: "2026-08-01T09:00:00Z",
      events: [event()],
    }
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => response,
    })

    await expect(loadPlayerStatus("espn/123", {
      apiHost: "http://127.0.0.1:5000/",
      fetcher: fetcher as unknown as typeof fetch,
      limit: 10,
    })).resolves.toEqual(response)
    expect(fetcher).toHaveBeenCalledWith(
      "http://127.0.0.1:5000/v1/players/espn%2F123/status?limit=10",
    )
  })

  it("fails closed for invalid bounds and unavailable APIs", async () => {
    await expect(loadPlayerStatus("player", {
      apiHost: "",
    })).rejects.toThrow("not configured")
    await expect(loadPlayerStatus("player", {
      apiHost: "http://127.0.0.1:5000",
      limit: 51,
    })).rejects.toThrow("between 1 and 50")
    await expect(loadPlayerStatus(" ", {
      apiHost: "http://127.0.0.1:5000",
    })).rejects.toThrow("requires a player ID")
  })

  it("keeps stale and no-impact events out of recommendation flags", () => {
    expect(actionablePlayerStatus([
      event(),
      event({
        id: "status_stale",
        stale: true,
        recommendation_impact: "material",
      }),
      event({
        id: "status_none",
        recommendation_impact: "none",
      }),
    ])).toEqual([event()])
  })

  it("uses the newest state per provider channel", () => {
    const oldInjury = event({
      id: "status_old",
      fetched_at: "2026-08-01T09:00:00Z",
    })
    const cleared = event({
      id: "status_cleared",
      status: "active",
      short_summary: "Cleared from the injury report.",
      fetched_at: "2026-08-01T12:00:00Z",
      recommendation_impact: "none",
    })

    expect(actionablePlayerStatus([
      oldInjury,
      cleared,
    ])).toEqual([])
    expect(currentPlayerStatus([
      oldInjury,
      cleared,
    ])).toEqual([cleared])
  })

  it("bounds recommendation evidence and prioritizes material status", () => {
    const review = event({
      id: "status_review",
      type: "transaction",
      source: "transactions",
    })
    const material = event({
      id: "status_material",
      type: "suspension",
      source: "rosters",
      recommendation_impact: "material",
      fetched_at: "2026-08-01T08:00:00Z",
    })
    const secondMaterial = event({
      id: "status_material_2",
      recommendation_impact: "material",
      fetched_at: "2026-08-01T10:00:00Z",
    })

    expect(recommendationPlayerStatusEvidence([
      review,
      material,
      secondMaterial,
      event({
        id: "status_stale",
        stale: true,
        recommendation_impact: "material",
      }),
    ]).map(item => item.id)).toEqual([
      "status_material_2",
      "status_material",
    ])
  })

  it("deduplicates concurrent and fresh player status loads", async () => {
    let now = 1000
    let resolveLoad:
      ((response: ReturnType<typeof statusResponse>) => void) | undefined
    const loader = jest.fn().mockImplementation(() =>
      new Promise(resolve => {
        resolveLoad = resolve
      }))
    const cache = new PlayerStatusCache({
      loader,
      ttlMs: 100,
      now: () => now,
    })

    const first = cache.load("123")
    const second = cache.load("123")
    expect(loader).toHaveBeenCalledTimes(1)
    expect(cache.peek("123")?.state).toBe("loading")
    resolveLoad?.(statusResponse("123"))
    await expect(first).resolves.toMatchObject({ state: "ready" })
    await expect(second).resolves.toMatchObject({ state: "ready" })

    await cache.load("123")
    expect(loader).toHaveBeenCalledTimes(1)
    now += 101
    loader.mockResolvedValueOnce(statusResponse("123"))
    await cache.load("123")
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it("caches provider failure as unavailable without throwing", async () => {
    const cache = new PlayerStatusCache({
      loader: jest.fn().mockRejectedValue(new Error("offline")),
      ttlMs: 100,
    })

    await expect(cache.load("123")).resolves.toMatchObject({
      playerId: "123",
      state: "unavailable",
      response: null,
    })
  })
})
