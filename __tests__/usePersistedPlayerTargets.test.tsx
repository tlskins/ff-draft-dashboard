import {act, renderHook, waitFor} from "@testing-library/react"

import {usePersistedPlayerTargets} from "../behavior/hooks/usePersistedPlayerTargets"
import {PLAYER_TARGETS_STORAGE_KEY, serializePlayerTargets} from "../behavior/playerTargetStorage"
import {seasonStorageKey} from "../behavior/seasonScopedStorage"


describe("season-scoped player targets", () => {
  beforeEach(() => localStorage.clear())

  it("adopts the unscoped legacy targets only for 2026", async () => {
    const targets = [{playerId: "rb-one", targetAsEarlyAsRound: 3}]
    localStorage.setItem(PLAYER_TARGETS_STORAGE_KEY, serializePlayerTargets(targets))
    const {result, rerender} = renderHook(({season}) => usePersistedPlayerTargets(season), {
      initialProps: {season: 2026},
    })
    await waitFor(() => expect(result.current[2]).toBe(true))
    expect(result.current[0]).toEqual(targets)

    rerender({season: 2027})
    await waitFor(() => expect(result.current[2]).toBe(true))
    expect(result.current[0]).toEqual([])
  })

  it("persists independent target sets per season", async () => {
    const {result, rerender} = renderHook(({season}) => usePersistedPlayerTargets(season), {
      initialProps: {season: 2026},
    })
    await waitFor(() => expect(result.current[2]).toBe(true))
    act(() => result.current[1]([{playerId: "rb-one", targetAsEarlyAsRound: 2}]))
    await waitFor(() => expect(localStorage.getItem(
      seasonStorageKey(PLAYER_TARGETS_STORAGE_KEY, 2026),
    )).not.toBeNull())

    rerender({season: 2027})
    await waitFor(() => expect(result.current[2]).toBe(true))
    act(() => result.current[1]([{playerId: "wr-one", targetAsEarlyAsRound: 4}]))
    await waitFor(() => expect(localStorage.getItem(
      seasonStorageKey(PLAYER_TARGETS_STORAGE_KEY, 2027),
    )).not.toBeNull())
    expect(localStorage.getItem(seasonStorageKey(PLAYER_TARGETS_STORAGE_KEY, 2026)))
      .toContain("rb-one")
    expect(localStorage.getItem(seasonStorageKey(PLAYER_TARGETS_STORAGE_KEY, 2027)))
      .toContain("wr-one")
  })
})
