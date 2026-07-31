import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"

import type { AnalysisViewId } from "../analysis/viewState"
import type { AdvisorProposal } from "../realtime/contracts"
import {
  advanceDraftRevision,
  createRealtimeAdvisorState,
  queueProposal,
  resolveProposal,
  RealtimeAdvisorState,
} from "../realtime/proposals"
import {
  loadDraftPlan,
  saveDraftPlan,
} from "../realtime/storage"
import type { DraftPlanDocument } from "../realtime/contracts"

interface UseRealtimeAdvisorProps {
  draftSessionId: string | null
  sourceEventCount: number
  onApplyView?: (
    view: AnalysisViewId,
    proposal: AdvisorProposal,
  ) => void
}

export const useRealtimeAdvisor = ({
  draftSessionId,
  sourceEventCount,
  onApplyView,
}: UseRealtimeAdvisorProps) => {
  const [state, setState] = useState<RealtimeAdvisorState | null>(null)
  const stateRef = useRef<RealtimeAdvisorState | null>(null)

  const commit = useCallback((next: RealtimeAdvisorState | null) => {
    stateRef.current = next
    setState(next)
    if (next && typeof localStorage !== "undefined") {
      saveDraftPlan(next.plan, localStorage)
    }
  }, [])

  useEffect(() => {
    if (!draftSessionId) {
      commit(null)
      return
    }
    const now = new Date().toISOString()
    const plan = typeof localStorage === "undefined"
      ? null
      : loadDraftPlan(draftSessionId, localStorage)
    commit(createRealtimeAdvisorState(
      draftSessionId,
      sourceEventCount,
      now,
      plan || undefined,
    ))
  }, [commit, draftSessionId])

  useEffect(() => {
    const current = stateRef.current
    if (!current || current.sourceEventCount === sourceEventCount) return
    commit(advanceDraftRevision(current, sourceEventCount))
  }, [commit, sourceEventCount])

  const enqueueProposal = useCallback((proposal: AdvisorProposal) => {
    const current = stateRef.current
    if (!current) return
    commit(queueProposal(current, proposal))
  }, [commit])

  const decideProposal = useCallback((
    proposalId: string,
    decision: "accept" | "reject",
  ) => {
    const current = stateRef.current
    if (!current) return
    const proposal = current.proposals.find(item =>
      item.id === proposalId)
    const result = resolveProposal(
      current,
      proposalId,
      decision,
      sourceEventCount,
      new Date().toISOString(),
    )
    commit(result.state)
    if (
      proposal
      && result.effect?.type === "analysis_view"
    ) {
      onApplyView?.(result.effect.view, proposal)
    }
  }, [commit, onApplyView, sourceEventCount])

  // Portable-data import has already committed the exact document to
  // localStorage transactionally. Reflect it in the live hook without a
  // second write that could make the import only partially visible.
  const replacePlanFromImport = useCallback((plan: DraftPlanDocument) => {
    const current = stateRef.current
    if (!draftSessionId || draftSessionId !== plan.draft_session_id) return false
    const next = current
      ? { ...current, plan, proposals: [] }
      : createRealtimeAdvisorState(
          draftSessionId,
          sourceEventCount,
          plan.updated_at,
          plan,
        )
    stateRef.current = next
    setState(next)
    return true
  }, [draftSessionId, sourceEventCount])

  return {
    state,
    plan: state?.plan || null,
    proposals: state?.proposals || [],
    enqueueProposal,
    acceptProposal: (proposalId: string) =>
      decideProposal(proposalId, "accept"),
    rejectProposal: (proposalId: string) =>
      decideProposal(proposalId, "reject"),
    replacePlanFromImport,
  }
}
