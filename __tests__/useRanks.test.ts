import { act, renderHook, waitFor } from "@testing-library/react"
import { useRanks } from "../behavior/hooks/useRanks"
import {PLAYER_TARGETS_STORAGE_KEY} from "../behavior/playerTargetStorage"
import {
  FantasyPosition,
  FantasySettings,
  NFLTeam,
  Player,
} from "../types"

const settings: FantasySettings = {
  ppr: true,
  numTeams: 10,
  numStartingQbs: 1,
  numStartingRbs: 2,
  numStartingWrs: 2,
  numStartingTes: 1,
  numFlex: 1,
  numBenchPlayers: 5,
}

describe("useRanks live-draft fallbacks", () => {
  beforeEach(() => localStorage.clear())

  it("adds an unranked live player to the library, history, and roster", () => {
    const fallbackPlayer: Player = {
      id: "4870808",
      firstName: "Jeremiyah",
      lastName: "Love",
      fullName: "Jeremiyah Love",
      team: NFLTeam.ARI,
      position: FantasyPosition.RUNNING_BACK,
      ranks: {},
    }
    const { result } = renderHook(() =>
      useRanks({
        settings,
        myPickNum: 2,
      }),
    )

    act(() => {
      result.current.onDraftPlayer(
        fallbackPlayer.id,
        12,
        fallbackPlayer,
      )
    })

    expect(result.current.playerLib[fallbackPlayer.id]).toEqual(
      fallbackPlayer,
    )
    expect(result.current.draftHistory[11]).toBe(fallbackPlayer.id)
    expect(result.current.rosters[8].picks).toContain(fallbackPlayer.id)
    expect(
      result.current.rosters[8][FantasyPosition.RUNNING_BACK],
    ).toContain(fallbackPlayer.id)
  })

  it("hydrates targets without mounting an ADP view and persists target edits", async () => {
    localStorage.setItem(PLAYER_TARGETS_STORAGE_KEY, JSON.stringify([
      {playerId: "saved-player", targetAsEarlyAsRound: 4},
    ]))
    const first = renderHook(() => useRanks({settings, myPickNum: 2}))

    await waitFor(() => expect(first.result.current.playerTargets).toEqual([
      {playerId: "saved-player", targetAsEarlyAsRound: 4},
    ]))

    const nextPlayer = {
      id: "new-player",
      firstName: "New",
      lastName: "Target",
      fullName: "New Target",
      team: NFLTeam.ARI,
      position: FantasyPosition.WIDE_RECEIVER,
      ranks: {},
    } satisfies Player
    act(() => first.result.current.addPlayerTarget(nextPlayer, 6))

    await waitFor(() => expect(JSON.parse(
      localStorage.getItem(PLAYER_TARGETS_STORAGE_KEY) || "[]",
    )).toEqual([
      {playerId: "saved-player", targetAsEarlyAsRound: 4},
      {playerId: "new-player", targetAsEarlyAsRound: 6},
    ]))

    first.unmount()
    const restarted = renderHook(() => useRanks({settings, myPickNum: 2}))
    await waitFor(() => expect(restarted.result.current.playerTargets).toHaveLength(2))
  })

  it("does not overwrite malformed stored targets until the user makes a valid edit", async () => {
    localStorage.setItem(PLAYER_TARGETS_STORAGE_KEY, '{"unexpected":true}')
    const {result} = renderHook(() => useRanks({settings, myPickNum: 2}))

    await waitFor(() => expect(result.current.playerTargets).toEqual([]))
    expect(localStorage.getItem(PLAYER_TARGETS_STORAGE_KEY)).toBe('{"unexpected":true}')

    const player = {
      id: "recovery-player",
      firstName: "Recovery",
      lastName: "Target",
      fullName: "Recovery Target",
      team: NFLTeam.ARI,
      position: FantasyPosition.RUNNING_BACK,
      ranks: {},
    } satisfies Player
    act(() => result.current.addPlayerTarget(player, 3))

    await waitFor(() => expect(JSON.parse(
      localStorage.getItem(PLAYER_TARGETS_STORAGE_KEY) || "[]",
    )).toEqual([{playerId: "recovery-player", targetAsEarlyAsRound: 3}]))
  })
})
