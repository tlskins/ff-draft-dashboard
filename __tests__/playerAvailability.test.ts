import { getPlayerMetrics } from "../behavior/draft"
import { isPlayerAutomaticallyRecommendable } from "../behavior/playerAvailability"
import {
  BoardSettings,
  FantasyPosition,
  NFLTeam,
  Player,
  ThirdPartyADPRanker,
  ThirdPartyRanker,
} from "../types"

const boardSettings: BoardSettings = {
  ranker: ThirdPartyRanker.CUSTOM,
  adpRanker: ThirdPartyADPRanker.ESPN,
}

const player = (state?: Player["availability"]): Player => ({
  id: "101",
  firstName: "Alpha",
  lastName: "Runner",
  fullName: "Alpha Runner",
  team: NFLTeam.FA,
  position: FantasyPosition.RUNNING_BACK,
  ranks: {
    [ThirdPartyRanker.CUSTOM]: {
      playerId: "101",
      ranker: ThirdPartyRanker.CUSTOM,
      position: FantasyPosition.RUNNING_BACK,
      standardPositionRank: 1,
      pprPositionRank: 1,
    },
  },
  availability: state,
})

describe("stable player availability", () => {
  it("keeps legacy snapshots recommendation-compatible", () => {
    expect(isPlayerAutomaticallyRecommendable(
      player(undefined),
      boardSettings,
    )).toBe(true)
  })

  it.each(["active_unranked", "reserve", "free_agent", "unknown"] as const)(
    "allows a nonterminal %s player through an explicit custom positional rank",
    state => {
      const customPlayer = player({
        state,
        automaticRecommendationEligible: false,
        source: "nflverse_players",
        reason: "suppressed_by_normalized_availability",
      })
      const withoutCustomRank = { ...customPlayer, ranks: {} }

      expect(isPlayerAutomaticallyRecommendable(
        withoutCustomRank,
        boardSettings,
      )).toBe(false)
      expect(isPlayerAutomaticallyRecommendable(
        customPlayer,
        boardSettings,
      )).toBe(true)
    },
  )

  it("requires a positional value, not just a Custom rank object", () => {
    const candidate = player({
      state: "reserve",
      automaticRecommendationEligible: false,
      source: "nflverse_players",
      reason: "nflverse_status_pup",
    })
    candidate.ranks[ThirdPartyRanker.CUSTOM] = {
      playerId: candidate.id,
      ranker: ThirdPartyRanker.CUSTOM,
      position: candidate.position,
    } as Player["ranks"][ThirdPartyRanker.CUSTOM]

    expect(isPlayerAutomaticallyRecommendable(candidate, boardSettings))
      .toBe(false)
  })

  it("never recommends confirmed inactive players, even with Custom rank", () => {
    const inactive = player({
      state: "inactive_confirmed",
      automaticRecommendationEligible: false,
      source: "nflverse_players",
      reason: "nflverse_status_ret",
    })
    expect(isPlayerAutomaticallyRecommendable(inactive, boardSettings))
      .toBe(false)
  })

  it("suppresses an ESPN-present released player despite current rank data", () => {
    const released = player({
      state: "free_agent",
      automaticRecommendationEligible: false,
      source: "nflverse_players",
      reason: "nflverse_status_rls",
    })
    released.ranks[ThirdPartyRanker.ESPN] = {
      playerId: released.id,
      ranker: ThirdPartyRanker.ESPN,
      position: released.position,
      adp: 8,
      standardPositionRank: 4,
      pprPositionRank: 4,
    }

    expect(isPlayerAutomaticallyRecommendable(released, {
      ...boardSettings,
      ranker: ThirdPartyRanker.ESPN,
    })).toBe(false)
  })

  it("uses Custom positional rank without reviving stale ESPN ADP", () => {
    const candidate = player({
      state: "active_unranked",
      automaticRecommendationEligible: false,
      source: "nflverse_players",
      reason: "nflverse_status_active",
    })
    candidate.sourcePresence = {
      espn: {
        presentInCurrentResponse: false,
        lastSeenAt: "2026-07-01T00:00:00Z",
        reason: "not_present_in_current_response",
        lastKnownRank: {
          playerId: candidate.id,
          ranker: ThirdPartyRanker.ESPN,
          position: candidate.position,
          adp: 1,
          standardPositionRank: 1,
          pprPositionRank: 1,
        },
      },
    }

    expect(getPlayerMetrics(candidate, {
      ppr: true,
      numTeams: 10,
      numStartingQbs: 1,
      numStartingRbs: 2,
      numStartingWrs: 2,
      numStartingTes: 1,
      numFlex: 1,
      numBenchPlayers: 5,
    }, boardSettings)).toMatchObject({
      posRank: 1,
      adp: undefined,
    })
  })
})
