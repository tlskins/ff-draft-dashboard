import {useCallback, useEffect, useMemo, useState} from "react"

import {
  createInsightDeckState,
  InsightCandidate,
  InsightDeckPolicy,
  InsightDeckInitialViews,
  InsightDeckSlotId,
  InsightDeckState,
  InsightViewId,
  MaterialInsightEvent,
  reconcileInsightDeck,
  restoreInsightDeckSlotAuto,
  selectInsightDeckView,
  setInsightDeckSlotPinned,
} from "../insights/insightDeck"

export interface InsightDeckController {
  state: InsightDeckState
  pinSlot: (slot: InsightDeckSlotId) => void
  restoreSlotAuto: (slot: InsightDeckSlotId) => void
  /** Inspect pure reducer results for synchronous rejection details. */
  selectView: (slot: InsightDeckSlotId, viewId: InsightViewId) => void
}

/**
 * Session-scoped UI wrapper for the pure C1 deck reducer. The effect may see
 * fresh evidence on ordinary renders, but identical material identities are a
 * reducer no-op, so evidence churn cannot select or announce a different view.
 * Deck pins intentionally remain in-memory for the active session; they are
 * not persisted across drafts or reused by the legacy analysis-view storage.
 */
export const useInsightDeckController = ({
  materialEvent,
  candidates,
  policy,
  initialViews,
}: {
  materialEvent: MaterialInsightEvent
  candidates: InsightCandidate[]
  policy?: Partial<InsightDeckPolicy>
  initialViews?: InsightDeckInitialViews
}): InsightDeckController => {
  const [state, setState] = useState<InsightDeckState>(() => (
    createInsightDeckState(materialEvent.streamId)
  ))

  useEffect(() => {
    setState(current => reconcileInsightDeck(
      current,
      materialEvent,
      candidates,
      policy,
      initialViews,
    ).state)
  }, [candidates, initialViews, materialEvent, policy])

  const pinSlot = useCallback((slot: InsightDeckSlotId) => {
    setState(current => setInsightDeckSlotPinned(current, slot, true).state)
  }, [])

  const restoreSlotAuto = useCallback((slot: InsightDeckSlotId) => {
    setState(current => restoreInsightDeckSlotAuto(
      current,
      slot,
      candidates,
    ).state)
  }, [candidates])

  const selectView = useCallback((slot: InsightDeckSlotId, viewId: InsightViewId) => {
    // Functional state is essential here: two clicks in one React batch must
    // compose against the newest deck state, not a captured render snapshot.
    setState(current => selectInsightDeckView(
      current,
      slot,
      viewId,
      candidates,
    ).state)
  }, [candidates])

  return useMemo(() => ({
    state,
    pinSlot,
    restoreSlotAuto,
    selectView,
  }), [pinSlot, restoreSlotAuto, selectView, state])
}
