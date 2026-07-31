import {
  ANALYSIS_VIEW_DEFINITIONS,
  AnalysisViewId,
} from "../analysis/viewState"
import type {
  DraftRecommendationSet,
} from "../draft-advisor/recommendations"
import type {
  DraftAdvisorContext,
} from "../draft-advisor/types"
import type {
  AdvisorProposal,
  DraftPlanDocument,
  RealtimeAdvisorToolName,
} from "./contracts"
import {
  REALTIME_ADVISOR_TOOL_NAMES,
} from "./contracts"
import {
  createAnalysisViewProposal,
  createDraftPlanProposal,
} from "./proposals"

export interface RealtimeToolContext {
  draftSessionId: string
  sourceEventCount: number
  advisorContext: DraftAdvisorContext
  recommendations: DraftRecommendationSet
  plan: DraftPlanDocument
}

export interface RealtimeToolCall {
  callId: string
  name: string
  arguments: string
}

export interface RealtimeToolResult {
  output: Record<string, unknown>
  proposal: AdvisorProposal | null
}

interface RealtimeToolDispatcherOptions {
  now?: () => string
  createId?: () => string
}

const VIEW_IDS = new Set(
  ANALYSIS_VIEW_DEFINITIONS.map(definition => definition.id),
)

const defaultId = (): string => {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID()
  }
  return `proposal-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

const parseArguments = (serialized: string): Record<string, unknown> => {
  let value: unknown
  try {
    value = serialized ? JSON.parse(serialized) : {}
  } catch {
    throw new Error("Tool arguments must be valid JSON")
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Tool arguments must be an object")
  }
  return value as Record<string, unknown>
}

const requireNoArguments = (
  value: Record<string, unknown>,
): void => {
  if (Object.keys(value).length > 0) {
    throw new Error("This tool does not accept arguments")
  }
}

const requireText = (
  value: unknown,
  name: string,
  maxLength = 500,
): string => {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} must be a non-empty string`)
  }
  const text = value.trim()
  if (text.length > maxLength) {
    throw new Error(`${name} must be at most ${maxLength} characters`)
  }
  return text
}

const isToolName = (name: string): name is RealtimeAdvisorToolName =>
  REALTIME_ADVISOR_TOOL_NAMES.includes(
    name as RealtimeAdvisorToolName,
  )

const recommendationCandidateOutput = (
  candidate: DraftRecommendationSet["candidates"][number],
  recommendationRank: number,
): Record<string, unknown> => ({
    recommendation_rank: recommendationRank,
    player_id: candidate.player.id,
    name: candidate.player.fullName,
    position: candidate.player.position,
    team: candidate.player.team,
    position_rank: candidate.positionRank,
    score: candidate.score,
    evidence: {
      projected_floor: candidate.evidence.projectedFloor,
      projected_median: candidate.evidence.projectedMedian,
      projected_ceiling: candidate.evidence.projectedCeiling,
      points_above_replacement:
        candidate.evidence.pointsAboveReplacement,
      marginal_lineup_points:
        candidate.evidence.marginalLineupPoints,
      tier_loss_if_deferred:
        candidate.evidence.tierLossIfDeferred,
      survival_probability:
        candidate.evidence.survivalProbability,
      positional_run_probability:
        candidate.evidence.positionalRunProbability,
      tier_boundary_probability:
        candidate.evidence.tierBoundaryProbability,
      roster_role: candidate.evidence.rosterRole,
      flags: candidate.evidence.flags,
    },
  })

const recommendationOutput = (
  recommendations: DraftRecommendationSet,
): Record<string, unknown> => ({
  schema_version: recommendations.schemaVersion,
  current_pick: recommendations.currentPick,
  next_user_pick: recommendations.nextUserPick,
  preferred_view: recommendations.preferredView,
  view_explanation: recommendations.viewExplanation,
  candidates: recommendations.candidates.map((candidate, index) =>
    recommendationCandidateOutput(candidate, index + 1)),
})

const comparePlayers = (
  args: Record<string, unknown>,
  context: RealtimeToolContext,
): Record<string, unknown> => {
  if (
    !Array.isArray(args.player_ids)
    || args.player_ids.some(playerId =>
      typeof playerId !== "string" || !playerId.trim())
  ) {
    throw new Error("player_ids must be an array of player IDs")
  }
  const playerIds = args.player_ids.map(playerId =>
    (playerId as string).trim())
  if (
    playerIds.length < 2
    || playerIds.length > 4
    || new Set(playerIds).size !== playerIds.length
  ) {
    throw new Error("player_ids must contain two to four unique IDs")
  }
  if (Object.keys(args).some(key => key !== "player_ids")) {
    throw new Error("compare_players received an unknown argument")
  }

  const recommendations = new Map(
    context.recommendations.candidates.map((candidate, index) => [
      candidate.player.id,
      { candidate, recommendationRank: index + 1 },
    ]),
  )
  const available = new Map(
    context.advisorContext.availablePlayers.map(player => [
      player.id,
      player,
    ]),
  )
  const missing = playerIds.filter(playerId => !available.has(playerId))
  if (missing.length > 0) {
    throw new Error(
      `Unknown or unavailable player IDs: ${missing.join(", ")}`,
    )
  }

  return {
    source_event_count: context.sourceEventCount,
    players: playerIds.map(playerId => {
      const player = available.get(playerId)!
      const recommendation = recommendations.get(playerId)
      return {
        player_id: player.id,
        name: player.name,
        position: player.position,
        team: player.team,
        adp: player.adp,
        position_rank: player.positionRank,
        user_tier: player.userTier,
        recommendation_rank:
          recommendation?.recommendationRank || null,
        recommendation_score:
          recommendation?.candidate.score || null,
        evidence: recommendation
          ? recommendationCandidateOutput(
              recommendation.candidate,
              recommendation.recommendationRank,
            ).evidence
          : null,
      }
    }),
  }
}

const executeKnownTool = (
  name: RealtimeAdvisorToolName,
  args: Record<string, unknown>,
  context: RealtimeToolContext,
  now: () => string,
  createId: () => string,
): RealtimeToolResult => {
  if (name === "get_draft_state") {
    requireNoArguments(args)
    return {
      proposal: null,
      output: {
        ok: true,
        source_event_count: context.sourceEventCount,
        draft_session_id: context.draftSessionId,
        league: context.advisorContext.league,
        current_pick: context.advisorContext.currentPick,
        upcoming_slots: context.advisorContext.upcomingSlots.slice(0, 12),
        teams: context.advisorContext.teams,
        recent_picks: context.advisorContext.recentPicks.slice(-12),
        available_players:
          context.advisorContext.availablePlayers.slice(0, 30),
        confirmed_plan: context.plan,
      },
    }
  }
  if (name === "get_recommendations") {
    requireNoArguments(args)
    return {
      proposal: null,
      output: {
        ok: true,
        source_event_count: context.sourceEventCount,
        ...recommendationOutput(context.recommendations),
      },
    }
  }
  if (name === "compare_players") {
    return {
      proposal: null,
      output: {
        ok: true,
        ...comparePlayers(args, context),
      },
    }
  }
  if (name === "propose_analysis_view") {
    if (Object.keys(args).some(key =>
      !["view", "explanation"].includes(key))) {
      throw new Error("propose_analysis_view received an unknown argument")
    }
    const view = requireText(args.view, "view") as AnalysisViewId
    if (!VIEW_IDS.has(view)) {
      throw new Error("view is not a supported analysis view")
    }
    const proposal = createAnalysisViewProposal({
      id: createId(),
      draftSessionId: context.draftSessionId,
      sourceEventCount: context.sourceEventCount,
      createdAt: now(),
      view,
      explanation: requireText(args.explanation, "explanation"),
    })
    return {
      proposal,
      output: {
        ok: true,
        status: "confirmation_required",
        proposal_id: proposal.id,
        source_event_count: context.sourceEventCount,
        message: "The user must explicitly accept or reject this proposal.",
      },
    }
  }

  if (Object.keys(args).some(key =>
    !["text", "explanation"].includes(key))) {
    throw new Error("propose_draft_plan received an unknown argument")
  }
  const proposal = createDraftPlanProposal({
    id: createId(),
    draftSessionId: context.draftSessionId,
    sourceEventCount: context.sourceEventCount,
    createdAt: now(),
    text: requireText(args.text, "text"),
    explanation: requireText(args.explanation, "explanation"),
  })
  return {
    proposal,
    output: {
      ok: true,
      status: "confirmation_required",
      proposal_id: proposal.id,
      source_event_count: context.sourceEventCount,
      message: "The user must explicitly accept or reject this proposal.",
    },
  }
}

export const executeRealtimeToolCall = async (
  call: RealtimeToolCall,
  context: RealtimeToolContext,
  {
    now = () => new Date().toISOString(),
    createId = defaultId,
  }: RealtimeToolDispatcherOptions = {},
): Promise<RealtimeToolResult> => {
  try {
    if (!isToolName(call.name)) {
      throw new Error(`Unknown Realtime tool: ${call.name}`)
    }
    const args = parseArguments(call.arguments)
    return executeKnownTool(
      call.name,
      args,
      context,
      now,
      createId,
    )
  } catch (error) {
    return {
      proposal: null,
      output: {
        ok: false,
        error: error instanceof Error
          ? error.message
          : "Realtime tool execution failed",
        source_event_count: context.sourceEventCount,
      },
    }
  }
}
