import {
  createDraftAdvisorContext,
} from "../behavior/draft-advisor/createDraftAdvisorContext"
import {
  createRosters,
  PlayerRanks,
} from "../behavior/draft"
import {
  FantasyPosition,
  ThirdPartyADPRanker,
  ThirdPartyRanker,
} from "../types"

describe("createDraftAdvisorContext", () => {
  it("models snake-draft ownership and team needs", () => {
    const rosters = createRosters(4)
    const emptyRanks = {
      [FantasyPosition.QUARTERBACK]: [],
      [FantasyPosition.RUNNING_BACK]: [],
      [FantasyPosition.WIDE_RECEIVER]: [],
      [FantasyPosition.TIGHT_END]: [],
      Purge: [],
      availPlayersByOverallRank: [],
      availPlayersByAdp: [],
    } as PlayerRanks

    const context = createDraftAdvisorContext({
      settings: {
        ppr: true,
        numTeams: 4,
        numStartingQbs: 1,
        numStartingRbs: 2,
        numStartingWrs: 2,
        numStartingTes: 1,
        numFlex: 1,
        numBenchPlayers: 5,
      },
      boardSettings: {
        ranker: ThirdPartyRanker.HARRIS,
        adpRanker: ThirdPartyADPRanker.ESPN,
      },
      currentPick: 4,
      rosters,
      draftHistory: [],
      playerLib: {},
      playerRanks: emptyRanks,
      upcomingPickCount: 4,
    })

    expect(context.upcomingSlots).toEqual([
      { overallPick: 4, rosterIndex: 3 },
      { overallPick: 5, rosterIndex: 3 },
      { overallPick: 6, rosterIndex: 2 },
      { overallPick: 7, rosterIndex: 1 },
    ])
    expect(context.teams[0].needs).toContainEqual({
      position: FantasyPosition.RUNNING_BACK,
      openStarterSpots: 2,
    })
  })
})
