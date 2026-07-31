import type {
  DraftRecommendationSet,
} from "../behavior/draft-advisor/recommendations"
import type {
  DraftAdvisorContext,
} from "../behavior/draft-advisor/types"
import {
  createRealtimeAdvisorState,
} from "../behavior/realtime/proposals"
import {
  executeRealtimeToolCall,
  RealtimeToolContext,
} from "../behavior/realtime/toolDispatcher"
import {
  FantasyPosition,
  NFLTeam,
} from "../types"

const now = "2026-07-30T21:00:00Z"

const advisorContext: DraftAdvisorContext = {
  schemaVersion: 1,
  league: {
    numTeams: 12,
    ppr: true,
  },
  currentPick: 20,
  upcomingSlots: [
    { overallPick: 20, rosterIndex: 7 },
    { overallPick: 21, rosterIndex: 8 },
  ],
  teams: [{
    rosterIndex: 0,
    draftedPlayerIds: ["wr-old"],
    needs: [{
      position: FantasyPosition.RUNNING_BACK,
      openStarterSpots: 2,
    }],
  }],
  availablePlayers: [
    {
      id: "rb-1",
      name: "Running Back One",
      position: FantasyPosition.RUNNING_BACK,
      team: NFLTeam.BUF,
      adp: 21,
      positionRank: 8,
      userTier: 2,
    },
    {
      id: "wr-1",
      name: "Wide Receiver One",
      position: FantasyPosition.WIDE_RECEIVER,
      team: NFLTeam.CIN,
      adp: 22,
      positionRank: 10,
      userTier: 3,
    },
  ],
  recentPicks: [],
}

const recommendations: DraftRecommendationSet = {
  schemaVersion: 1,
  currentPick: 20,
  nextUserPick: 24,
  preferredView: "cross_position",
  viewExplanation: "Compare the leading options across positions.",
  candidates: [{
    player: {
      id: "rb-1",
      firstName: "Running",
      lastName: "Back One",
      fullName: "Running Back One",
      team: NFLTeam.BUF,
      position: FantasyPosition.RUNNING_BACK,
      ranks: {},
    },
    positionRank: 8,
    score: 12.5,
    evidence: {
      projectedFloor: 11,
      projectedMedian: 14,
      projectedCeiling: 17,
      replacementLevel: 8,
      pointsAboveReplacement: 6,
      marginalLineupPoints: 5,
      benchUtility: 0,
      tierLossIfDeferred: 3,
      survivalProbability: 0.24,
      positionalRunProbability: 0.51,
      tierBoundaryProbability: 0.63,
      userTier: 2,
      projectionTier: 2,
      rosterRole: "open_starter",
      flags: [],
    },
  }],
}

const context: RealtimeToolContext = {
  draftSessionId: "espn-session",
  sourceEventCount: 19,
  advisorContext,
  recommendations,
  plan: createRealtimeAdvisorState(
    "espn-session",
    19,
    now,
  ).plan,
}

describe("Realtime advisor tool dispatcher", () => {
  it("returns bounded deterministic draft state and recommendations", async () => {
    const state = await executeRealtimeToolCall({
      callId: "call-state",
      name: "get_draft_state",
      arguments: "{}",
    }, context)
    const recommendation = await executeRealtimeToolCall({
      callId: "call-recommendation",
      name: "get_recommendations",
      arguments: "{}",
    }, context)

    expect(state.proposal).toBeNull()
    expect(state.output).toMatchObject({
      ok: true,
      draft_session_id: "espn-session",
      source_event_count: 19,
      current_pick: 20,
    })
    expect(recommendation.output).toMatchObject({
      ok: true,
      next_user_pick: 24,
      preferred_view: "cross_position",
    })
  })

  it("compares only known available players using local evidence", async () => {
    const result = await executeRealtimeToolCall({
      callId: "call-compare",
      name: "compare_players",
      arguments: JSON.stringify({
        player_ids: ["rb-1", "wr-1"],
      }),
    }, context)

    expect(result.proposal).toBeNull()
    expect(result.output).toMatchObject({
      ok: true,
      source_event_count: 19,
      players: [
        expect.objectContaining({
          player_id: "rb-1",
          recommendation_rank: 1,
          evidence: expect.objectContaining({
            points_above_replacement: 6,
          }),
        }),
        expect.objectContaining({
          player_id: "wr-1",
          recommendation_rank: null,
          evidence: null,
        }),
      ],
    })
  })

  it("creates an unconfirmed proposal without changing the plan", async () => {
    const result = await executeRealtimeToolCall({
      callId: "call-plan",
      name: "propose_draft_plan",
      arguments: JSON.stringify({
        text: "Prioritize running back before the next tier cliff.",
        explanation: "The current tier has a low survival probability.",
      }),
    }, context, {
      now: () => now,
      createId: () => "proposal-model-1",
    })

    expect(result.output).toEqual({
      ok: true,
      status: "confirmation_required",
      proposal_id: "proposal-model-1",
      source_event_count: 19,
      message: "The user must explicitly accept or reject this proposal.",
    })
    expect(result.proposal).toMatchObject({
      id: "proposal-model-1",
      kind: "draft_plan",
      status: "pending",
      payload: {
        operation: "append",
        text: "Prioritize running back before the next tier cliff.",
      },
    })
    expect(context.plan.entries).toEqual([])
  })

  it("fails closed on malformed, unknown, or extra arguments", async () => {
    const malformed = await executeRealtimeToolCall({
      callId: "call-bad-json",
      name: "get_draft_state",
      arguments: "{",
    }, context)
    const unknown = await executeRealtimeToolCall({
      callId: "call-unknown",
      name: "draft_player",
      arguments: "{}",
    }, context)
    const extra = await executeRealtimeToolCall({
      callId: "call-extra",
      name: "propose_analysis_view",
      arguments: JSON.stringify({
        view: "tier_landscape",
        explanation: "A tier is thinning.",
        auto_apply: true,
      }),
    }, context)

    for (const result of [malformed, unknown, extra]) {
      expect(result.proposal).toBeNull()
      expect(result.output.ok).toBe(false)
    }
  })
})
