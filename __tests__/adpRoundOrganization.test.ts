import {
  getLastRankedADPRound,
  organizePlayersByADPRound,
} from "../behavior/hooks/useADPRoundView"
import {
  FantasyPosition,
  NFLTeam,
  ThirdPartyADPRanker,
  ThirdPartyRanker,
} from "../types"
import type {FantasySettings, Player} from "../types"

const settings: FantasySettings = {
  ppr: true,
  numTeams: 12,
  numStartingQbs: 1,
  numStartingRbs: 2,
  numStartingWrs: 2,
  numStartingTes: 1,
  numFlex: 1,
  numBenchPlayers: 5,
}

const boardSettings = {
  ranker: ThirdPartyRanker.HARRIS,
  adpRanker: ThirdPartyADPRanker.ESPN,
}

const rankedPlayer = (rank: number, adp: number): Player => ({
  id: `ranked-${rank}`,
  firstName: "Ranked",
  lastName: String(rank),
  fullName: `Ranked ${rank}`,
  position: FantasyPosition.RUNNING_BACK,
  team: NFLTeam.BUF,
  ranks: {
    [ThirdPartyRanker.HARRIS]: {
      playerId: `ranked-${rank}`,
      ranker: ThirdPartyRanker.HARRIS,
      position: FantasyPosition.RUNNING_BACK,
      pprOverallRank: rank,
      pprPositionRank: rank,
    },
    [ThirdPartyADPRanker.ESPN]: {
      playerId: `ranked-${rank}`,
      ranker: ThirdPartyADPRanker.ESPN,
      position: FantasyPosition.RUNNING_BACK,
      adp,
    },
  },
})

describe("ADP-round organization", () => {
  it("assigns every ranked top-24 player exactly once and excludes unranked players", () => {
    const top24 = Array.from({length: 24}, (_, index) => rankedPlayer(
      index + 1,
      index === 11 ? 12.97 : index + 1,
    ))
    const unranked: Player = {
      ...rankedPlayer(25, 25),
      id: "unranked",
      fullName: "Unranked Player",
      ranks: {
        [ThirdPartyADPRanker.ESPN]: rankedPlayer(25, 25).ranks![ThirdPartyADPRanker.ESPN],
      },
    }
    const rounds = organizePlayersByADPRound({
      availablePlayers: [...top24, unranked],
      fantasySettings: settings,
      boardSettings,
      positionFilter: "All",
      roundsToShow: Array.from({length: 14}, (_, index) => index + 1),
    })
    const renderedIds = Object.values(rounds).flat().map(player => player.id)

    expect(renderedIds).toHaveLength(24)
    expect(new Set(renderedIds)).toEqual(new Set(top24.map(player => player.id)))
    expect(renderedIds).not.toContain("unranked")
  })

  it("uses the same nearest-pick boundary as the displayed round/pick label", () => {
    const boundaryPlayer = rankedPlayer(1, 12.97)
    const rounds = organizePlayersByADPRound({
      availablePlayers: [boundaryPlayer],
      fantasySettings: settings,
      boardSettings,
      positionFilter: "All",
      roundsToShow: [1, 2],
    })

    expect(rounds[1]).toEqual([])
    expect(rounds[2]).toEqual([boundaryPlayer])
  })

  it("extends navigation through the last occupied ranked ADP round", () => {
    expect(getLastRankedADPRound(
      [rankedPlayer(160, 169.48)],
      settings,
      boardSettings,
    )).toBe(15)
  })
})
