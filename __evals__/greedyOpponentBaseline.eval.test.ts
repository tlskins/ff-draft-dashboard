import fixture from "../__tests__/fixtures/espn-cumulative-draft.json"
import {
  predictUpcomingPicksGreedy,
} from "../behavior/draft-advisor/greedyOpponentPredictor"
import {
  createDraftSessionReducerState,
  reduceDraftSnapshot,
} from "../behavior/draft-feed/session"
import { DraftSnapshot } from "../behavior/draft-feed/types"
import { PlayerRanks, Roster } from "../behavior/draft"
import {
  BoardSettings,
  FantasyPosition,
  FantasySettings,
  NFLTeam,
  Player,
  ThirdPartyADPRanker,
  ThirdPartyRanker,
} from "../types"


const settings: FantasySettings = {
  ppr: true,
  numTeams: fixture.metadata.numTeams,
  numStartingQbs: 1,
  numStartingRbs: 2,
  numStartingWrs: 2,
  numStartingTes: 1,
  numFlex: 1,
  numBenchPlayers: 5,
}

const boardSettings: BoardSettings = {
  ranker: ThirdPartyRanker.ESPN,
  adpRanker: ThirdPartyADPRanker.ESPN,
}

const candidate = (
  id: string,
  position: FantasyPosition,
  adp: number,
): Player => ({
  id,
  firstName: id,
  lastName: "",
  fullName: id,
  team: NFLTeam.FA,
  position,
  ranks: {
    [ThirdPartyRanker.ESPN]: {
      playerId: id,
      ranker: ThirdPartyRanker.ESPN,
      position,
      adp,
      standardOverallRank: adp,
      pprOverallRank: adp,
      standardPositionRank: adp,
      pprPositionRank: adp,
    },
  },
})

const emptyRoster = (): Roster => ({
  picks: [],
  QB: [],
  RB: [],
  WR: [],
  TE: [],
})

describe("greedy opponent-model baseline", () => {
  it("freezes predictions after the cumulative ESPN replay", () => {
    let state = createDraftSessionReducerState()
    const rosters = Array.from(
      { length: settings.numTeams },
      emptyRoster,
    )

    ;(fixture.snapshots as DraftSnapshot[]).forEach((snapshot) => {
      const reduction = reduceDraftSnapshot(state, snapshot, {
        numTeams: settings.numTeams,
        playersByPositionAndTeam: {},
      })
      state = reduction.state
      reduction.events.forEach((event) => {
        const roster = rosters[event.pick.rosterIndex]
        roster.picks.push(event.pick.playerId)
        const position = event.pick.position as keyof Roster
        const positionPicks = roster[position]
        if (Array.isArray(positionPicks)) {
          positionPicks.push(event.pick.playerId)
        }
      })
    })

    const candidates = [
      candidate("te-1", FantasyPosition.TIGHT_END, 14),
      candidate("rb-1", FantasyPosition.RUNNING_BACK, 15),
      candidate("wr-1", FantasyPosition.WIDE_RECEIVER, 16),
      candidate("rb-2", FantasyPosition.RUNNING_BACK, 17),
      candidate("wr-2", FantasyPosition.WIDE_RECEIVER, 18),
      candidate("rb-3", FantasyPosition.RUNNING_BACK, 19),
      candidate("qb-1", FantasyPosition.QUARTERBACK, 20),
    ]
    const byPosition = (position: FantasyPosition) =>
      candidates.filter((player) => player.position === position)
    const playerRanks: PlayerRanks = {
      QB: byPosition(FantasyPosition.QUARTERBACK),
      RB: byPosition(FantasyPosition.RUNNING_BACK),
      WR: byPosition(FantasyPosition.WIDE_RECEIVER),
      TE: byPosition(FantasyPosition.TIGHT_END),
      Purge: [],
      availPlayersByOverallRank: [...candidates],
      availPlayersByAdp: [...candidates],
    }

    const result = predictUpcomingPicksGreedy({
      rosters,
      playerRanks,
      settings,
      boardSettings,
      currPick: fixture.expected.currentPick,
      myPickNum: 5,
      predictUpToPick: 20,
    })

    expect(result.predictedPicks).toEqual({
      "te-1": 1,
      "rb-1": 1,
      "wr-1": 1,
      "rb-2": 1,
      "wr-2": 1,
      "rb-3": 1,
    })
    expect(result.finalPositionCounts).toMatchObject({
      QB: 1,
      RB: 4,
      WR: 3,
      TE: 1,
    })
  })
})
