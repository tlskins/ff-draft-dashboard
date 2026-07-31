import type { AnalysisViewId } from "../analysis/viewState"
import type {
  AdvisorProposal,
  AnalysisViewProposal,
  DraftPlanDocument,
  DraftPlanEntry,
  DraftPlanProposal,
} from "./contracts"

export type ConfirmationIntent = "accept" | "reject" | "ambiguous"

export interface RealtimeAdvisorState {
  schemaVersion: 1
  draftSessionId: string
  sourceEventCount: number
  proposals: AdvisorProposal[]
  plan: DraftPlanDocument
}

export type AcceptedProposalEffect =
  | {
      type: "analysis_view"
      view: AnalysisViewId
    }
  | {
      type: "draft_plan_appended"
      entry: DraftPlanEntry
    }

export interface ResolveProposalResult {
  state: RealtimeAdvisorState
  effect: AcceptedProposalEffect | null
  reason:
    | "accepted"
    | "rejected"
    | "ambiguous"
    | "stale"
    | "not_pending"
    | "not_found"
}

const ACCEPT_PHRASES = new Set([
  "accept",
  "accepted",
  "approve",
  "approved",
  "confirm",
  "confirmed",
  "yes",
])

const REJECT_PHRASES = new Set([
  "cancel",
  "decline",
  "declined",
  "no",
  "reject",
  "rejected",
])

export const interpretConfirmation = (
  value: string,
): ConfirmationIntent => {
  const normalized = value.trim().toLowerCase().replace(/[.!?]+$/g, "")
  if (ACCEPT_PHRASES.has(normalized)) return "accept"
  if (REJECT_PHRASES.has(normalized)) return "reject"
  return "ambiguous"
}

export const createRealtimeAdvisorState = (
  draftSessionId: string,
  sourceEventCount: number,
  now: string,
  plan?: DraftPlanDocument,
): RealtimeAdvisorState => ({
  schemaVersion: 1,
  draftSessionId,
  sourceEventCount,
  proposals: [],
  plan: plan || {
    schema_version: 1,
    draft_session_id: draftSessionId,
    revision: 0,
    updated_at: now,
    entries: [],
  },
})

interface CreateProposalBase {
  id: string
  draftSessionId: string
  sourceEventCount: number
  createdAt: string
  explanation: string
}

export const createAnalysisViewProposal = ({
  id,
  draftSessionId,
  sourceEventCount,
  createdAt,
  explanation,
  view,
}: CreateProposalBase & {
  view: AnalysisViewId
}): AnalysisViewProposal => ({
  schema_version: 1,
  id,
  draft_session_id: draftSessionId,
  source_event_count: sourceEventCount,
  created_at: createdAt,
  kind: "analysis_view",
  status: "pending",
  title: `Switch analysis to ${view.replace(/_/g, " ")}`,
  explanation,
  payload: { view },
})

export const createDraftPlanProposal = ({
  id,
  draftSessionId,
  sourceEventCount,
  createdAt,
  explanation,
  text,
}: CreateProposalBase & {
  text: string
}): DraftPlanProposal => ({
  schema_version: 1,
  id,
  draft_session_id: draftSessionId,
  source_event_count: sourceEventCount,
  created_at: createdAt,
  kind: "draft_plan",
  status: "pending",
  title: "Add to live draft plan",
  explanation,
  payload: {
    operation: "append",
    text,
  },
})

export const queueProposal = (
  state: RealtimeAdvisorState,
  proposal: AdvisorProposal,
): RealtimeAdvisorState => {
  if (proposal.draft_session_id !== state.draftSessionId) {
    return state
  }
  const nextProposal = proposal.source_event_count === state.sourceEventCount
    ? proposal
    : { ...proposal, status: "stale" as const }
  return {
    ...state,
    proposals: [
      nextProposal,
      ...state.proposals.filter(item => item.id !== proposal.id),
    ].slice(0, 50),
  }
}

export const advanceDraftRevision = (
  state: RealtimeAdvisorState,
  sourceEventCount: number,
): RealtimeAdvisorState => ({
  ...state,
  sourceEventCount,
  proposals: state.proposals.map(proposal =>
    proposal.status === "pending"
    && proposal.source_event_count !== sourceEventCount
      ? { ...proposal, status: "stale" as const }
      : proposal),
})

export const resolveProposal = (
  state: RealtimeAdvisorState,
  proposalId: string,
  confirmation: ConfirmationIntent,
  currentEventCount: number,
  now: string,
): ResolveProposalResult => {
  const proposal = state.proposals.find(item => item.id === proposalId)
  if (!proposal) {
    return { state, effect: null, reason: "not_found" }
  }
  if (proposal.status !== "pending") {
    return { state, effect: null, reason: "not_pending" }
  }
  if (
    proposal.source_event_count !== currentEventCount
    || state.sourceEventCount !== currentEventCount
  ) {
    return {
      state: {
        ...state,
        proposals: state.proposals.map(item =>
          item.id === proposalId
            ? { ...item, status: "stale" as const }
            : item),
      },
      effect: null,
      reason: "stale",
    }
  }
  if (confirmation === "ambiguous") {
    return { state, effect: null, reason: "ambiguous" }
  }

  const nextStatus = confirmation === "accept" ? "accepted" : "rejected"
  let plan = state.plan
  let effect: AcceptedProposalEffect | null = null
  if (confirmation === "accept" && proposal.kind === "analysis_view") {
    effect = {
      type: "analysis_view",
      view: proposal.payload.view,
    }
  }
  if (confirmation === "accept" && proposal.kind === "draft_plan") {
    const entry: DraftPlanEntry = {
      id: `${proposal.id}:entry`,
      proposal_id: proposal.id,
      text: proposal.payload.text,
      source_event_count: currentEventCount,
      created_at: now,
    }
    plan = {
      ...plan,
      revision: plan.revision + 1,
      updated_at: now,
      entries: [...plan.entries, entry].slice(-100),
    }
    effect = {
      type: "draft_plan_appended",
      entry,
    }
  }

  return {
    state: {
      ...state,
      proposals: state.proposals.map(item =>
        item.id === proposalId
          ? { ...item, status: nextStatus }
          : item),
      plan,
    },
    effect,
    reason: confirmation === "accept" ? "accepted" : "rejected",
  }
}
