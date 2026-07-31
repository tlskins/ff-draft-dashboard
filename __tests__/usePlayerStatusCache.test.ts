import {
  renderHook,
  waitFor,
} from "@testing-library/react"

import {
  usePlayerStatusCache,
} from "../behavior/hooks/usePlayerStatusCache"


describe("shared player status cache hook", () => {
  it("loads each unique player once and reuses entries across consumers", async () => {
    const loader = jest.fn().mockImplementation(async (playerId: string) => ({
      schema_version: 1 as const,
      player_id: playerId,
      last_updated_at: null,
      events: [],
    }))
    const { result, rerender } = renderHook(
      ({ playerIds }) => usePlayerStatusCache(playerIds, {
        loader,
        ttlMs: 60_000,
      }),
      { initialProps: { playerIds: ["101", "101", "202"] } },
    )

    await waitFor(() => {
      expect(result.current["101"]?.state).toBe("ready")
      expect(result.current["202"]?.state).toBe("ready")
    })
    expect(loader).toHaveBeenCalledTimes(2)

    rerender({ playerIds: ["101", "202", "101"] })
    await waitFor(() => {
      expect(result.current["101"]?.state).toBe("ready")
    })
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it("isolates an unavailable player from other cached players", async () => {
    const loader = jest.fn().mockImplementation(async (playerId: string) => {
      if (playerId === "offline") throw new Error("offline")
      return {
        schema_version: 1 as const,
        player_id: playerId,
        last_updated_at: null,
        events: [],
      }
    })
    const { result } = renderHook(() => usePlayerStatusCache(
      ["offline", "ready"],
      { loader, ttlMs: 60_000 },
    ))

    await waitFor(() => {
      expect(result.current.offline?.state).toBe("unavailable")
      expect(result.current.ready?.state).toBe("ready")
    })
  })
})
