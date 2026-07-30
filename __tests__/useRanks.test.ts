import { act, renderHook } from "@testing-library/react"
import { useRanks } from "../behavior/hooks/useRanks"
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
})
