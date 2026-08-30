import { act, renderHook, waitFor } from "@testing-library/react"
import { useRanks } from "../behavior/hooks/useRanks"
import {PLAYER_TARGETS_STORAGE_KEY} from "../behavior/playerTargetStorage"
import {seasonStorageKey} from "../behavior/seasonScopedStorage"
import {
  FantasyPosition,
  FantasySettings,
  NFLTeam,
  Player,
  Rankings,
  ThirdPartyADPRanker,
  ThirdPartyRanker,
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
  const scopedTargetsKey = seasonStorageKey(PLAYER_TARGETS_STORAGE_KEY, 2026)

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
      localStorage.getItem(scopedTargetsKey) || "[]",
    )).toEqual([
      {playerId: "saved-player", targetAsEarlyAsRound: 4},
      {playerId: "new-player", targetAsEarlyAsRound: 6},
    ]))

    first.unmount()
    const restarted = renderHook(() => useRanks({settings, myPickNum: 2}))
    await waitFor(() => expect(restarted.result.current.playerTargets).toHaveLength(2))
  })

  it("persists bounded target updates and removals through the canonical replacement path", async () => {
    localStorage.setItem(PLAYER_TARGETS_STORAGE_KEY, JSON.stringify([
      {playerId: "saved-player", targetAsEarlyAsRound: 4},
    ]))
    const first = renderHook(() => useRanks({settings, myPickNum: 2}))
    await waitFor(() => expect(first.result.current.playerTargets).toHaveLength(1))

    act(() => first.result.current.replacePlayerTargets([
      {playerId: "saved-player", targetAsEarlyAsRound: 2},
    ]))
    await waitFor(() => expect(JSON.parse(
      localStorage.getItem(scopedTargetsKey) || "[]",
    )).toEqual([{playerId: "saved-player", targetAsEarlyAsRound: 2}]))

    act(() => first.result.current.replacePlayerTargets([]))
    await waitFor(() => expect(JSON.parse(
      localStorage.getItem(scopedTargetsKey) || "[]",
    )).toEqual([]))

    first.unmount()
    const restarted = renderHook(() => useRanks({settings, myPickNum: 2}))
    await waitFor(() => expect(restarted.result.current.playerTargets).toEqual([]))
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
      localStorage.getItem(scopedTargetsKey) || "[]",
    )).toEqual([{playerId: "recovery-player", targetAsEarlyAsRound: 3}]))
    expect(localStorage.getItem(PLAYER_TARGETS_STORAGE_KEY)).toBe('{"unexpected":true}')
  })

  it("resumes an existing custom board without recopying its provider order", async () => {
    const rankedPlayer = (id: string, name: string, positionRank: number): Player => ({
      id,
      firstName: name,
      lastName: "Runner",
      fullName: `${name} Runner`,
      team: NFLTeam.BUF,
      position: FantasyPosition.RUNNING_BACK,
      ranks: {
        [ThirdPartyRanker.HARRIS]: {
          playerId: id,
          ranker: ThirdPartyRanker.HARRIS,
          position: FantasyPosition.RUNNING_BACK,
          pprOverallRank: positionRank,
          pprPositionRank: positionRank,
        },
        [ThirdPartyRanker.CUSTOM]: {
          playerId: id,
          copiedRanker: ThirdPartyRanker.HARRIS,
          ranker: ThirdPartyRanker.CUSTOM,
          position: FantasyPosition.RUNNING_BACK,
          pprOverallRank: positionRank,
          pprPositionRank: positionRank,
        },
        [ThirdPartyADPRanker.ESPN]: {
          playerId: id,
          ranker: ThirdPartyADPRanker.ESPN,
          position: FantasyPosition.RUNNING_BACK,
          adp: positionRank,
        },
      },
    })
    const alpha = rankedPlayer("alpha", "Alpha", 1)
    const beta = rankedPlayer("beta", "Beta", 2)
    const customRankings: Rankings = {
      players: [alpha, beta],
      rankingsSummaries: [],
      cachedAt: "2026-08-29T00:00:00Z",
      editedAt: "2026-08-29T00:00:00Z",
      copiedRanker: ThirdPartyRanker.HARRIS,
      settings,
    }
    const {result} = renderHook(() => useRanks({settings, myPickNum: 2}))

    act(() => result.current.applyImportedRankings(
      customRankings,
      settings,
      {ranker: ThirdPartyRanker.CUSTOM, adpRanker: ThirdPartyADPRanker.ESPN},
    ))
    await waitFor(() => expect(result.current.playerRanks.RB.map(player => player.id))
      .toEqual(["alpha", "beta"]))

    act(() => {
      expect(result.current.onStartCustomRanking(ThirdPartyRanker.CUSTOM)).toBe(true)
    })
    act(() => result.current.onReorderPlayerInPosition(
      "alpha",
      FantasyPosition.RUNNING_BACK,
      1,
    ))
    expect(result.current.playerRanks.RB.map(player => player.id))
      .toEqual(["beta", "alpha"])

    act(() => result.current.onFinishCustomRanking())
    act(() => {
      expect(result.current.onStartCustomRanking(ThirdPartyRanker.CUSTOM)).toBe(true)
    })

    expect(result.current.isEditingCustomRanking).toBe(true)
    expect(result.current.playerRanks.RB.map(player => player.id))
      .toEqual(["beta", "alpha"])
  })
})
