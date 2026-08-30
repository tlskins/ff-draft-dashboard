import React, {useCallback, useEffect, useRef, useState} from "react"

import type {InsightDeckController} from "../../behavior/hooks/useInsightDeckController"
import {
  INSIGHT_VIEW_REGISTRY,
  InsightDeckSelection,
  InsightDeckSlotId,
  InsightViewId,
  VISIBLE_INSIGHT_DECK_SLOTS,
} from "../../behavior/insights/insightDeck"
import styles from "./InsightDeck.module.css"

const SLOT_LABELS: Record<InsightDeckSlotId, string> = {
  primary_decision: "Decision view",
  market_watch: "Supporting view",
  plan_constraints: "Plan & constraints",
}

const evidenceLabel = (state: InsightDeckSelection["evidence"]["state"]): string => (
  state.charAt(0).toUpperCase() + state.slice(1)
)

const registrationLabel = (viewId: InsightViewId): string => (
  INSIGHT_VIEW_REGISTRY.find(view => view.id === viewId)?.label || viewId
)

const defaultSpan = (viewId: InsightViewId | undefined): 1 | 2 => (
  INSIGHT_VIEW_REGISTRY.find(view => view.id === viewId)?.defaultSpan || 1
)

export interface InsightDeckRenderContext {
  slot: InsightDeckSlotId
  selection: InsightDeckSelection
}

export interface InsightDeckProps {
  controller: InsightDeckController
  defaultExpandedViewId?: InsightViewId
  /**
   * Deliberately bounded to registered IDs. Returning null/undefined makes the
   * slot visibly unavailable rather than silently rendering arbitrary content.
   */
  renderView: (
    viewId: InsightViewId,
    context: InsightDeckRenderContext,
  ) => React.ReactNode | null | undefined
  expandedSlot?: typeof VISIBLE_INSIGHT_DECK_SLOTS[number] | null
  onExpandedSlotChange?: (
    slot: typeof VISIBLE_INSIGHT_DECK_SLOTS[number] | null,
  ) => void
}

const InsightDeck: React.FC<InsightDeckProps> = ({
  controller,
  defaultExpandedViewId,
  renderView,
  expandedSlot: controlledExpandedSlot,
  onExpandedSlotChange,
}) => {
  const selectionSignature = VISIBLE_INSIGHT_DECK_SLOTS.map(slot => (
    controller.state.slots[slot].selection?.viewId || "none"
  )).join("|")
  const previousSelectionSignature = useRef("")
  const pendingManualLayout = useRef<{
    slot: typeof VISIBLE_INSIGHT_DECK_SLOTS[number]
    viewId: InsightViewId
  } | null>(null)
  const defaultExpansionApplied = useRef(false)
  const [internalExpandedSlot, setInternalExpandedSlot] = useState<
    typeof VISIBLE_INSIGHT_DECK_SLOTS[number] | null
  >(null)
  const expandedSlot = controlledExpandedSlot !== undefined
    ? controlledExpandedSlot
    : internalExpandedSlot
  const setExpandedSlot = useCallback<React.Dispatch<React.SetStateAction<
    typeof VISIBLE_INSIGHT_DECK_SLOTS[number] | null
  >>>((nextValue) => {
    const resolved = typeof nextValue === "function"
      ? nextValue(expandedSlot)
      : nextValue
    if (controlledExpandedSlot === undefined) setInternalExpandedSlot(resolved)
    onExpandedSlotChange?.(resolved)
  }, [controlledExpandedSlot, expandedSlot, onExpandedSlotChange])
  useEffect(() => {
    if (previousSelectionSignature.current === selectionSignature) return
    previousSelectionSignature.current = selectionSignature
    const requested = pendingManualLayout.current
    if (
      requested
      && controller.state.slots[requested.slot].selection?.viewId === requested.viewId
    ) {
      pendingManualLayout.current = null
      setExpandedSlot(defaultSpan(requested.viewId) === 2 ? requested.slot : null)
      return
    }
    if (!defaultExpansionApplied.current && defaultExpandedViewId) {
      const defaultSlot = VISIBLE_INSIGHT_DECK_SLOTS.find(slot => (
        controller.state.slots[slot].selection?.viewId === defaultExpandedViewId
      ))
      if (defaultSlot) {
        defaultExpansionApplied.current = true
        setExpandedSlot(defaultSlot)
        return
      }
    }
    const wideSlot = VISIBLE_INSIGHT_DECK_SLOTS.find(slot => defaultSpan(
      controller.state.slots[slot].selection?.viewId,
    ) === 2)
    setExpandedSlot(wideSlot || null)
  }, [controller.state.slots, defaultExpandedViewId, selectionSignature, setExpandedSlot])
  const renderedViewIds = new Set<InsightViewId>()

  return <section aria-label="Draft insight deck" className={styles.deck}>
    <div className={`${styles.slotList} ${
      expandedSlot === "primary_decision"
        ? styles.slotListPrimaryExpanded
        : expandedSlot === "market_watch"
          ? styles.slotListMarketExpanded
          : ""
    }`}>
      {VISIBLE_INSIGHT_DECK_SLOTS.map(slot => {
        const slotState = controller.state.slots[slot]
        const selection = slotState.selection
        const auto = !selection?.pinned
        const duplicate = Boolean(selection && renderedViewIds.has(selection.viewId))
        if (selection && !duplicate) renderedViewIds.add(selection.viewId)
        const collapsed = Boolean(expandedSlot && expandedSlot !== slot)
        let rendered: React.ReactNode | null | undefined = null
        if (selection && !duplicate) {
          try {
            rendered = renderView(selection.viewId, {slot, selection})
          } catch {
            rendered = null
          }
        }
        return (
          <section
            aria-labelledby={`insight-deck-${slot}-title`}
            className={`${styles.slot} ${collapsed ? styles.slotCollapsed : ""}`}
            key={slot}
            onClick={event => {
              if (!collapsed) return
              const target = event.target as HTMLElement
              if (target.closest("button, select, option")) return
              setExpandedSlot(slot)
            }}
          >
            <header className={styles.slotHeader}>
              <div>
                <p className={styles.slotLabel}>{SLOT_LABELS[slot]}</p>
                <label className={styles.viewSelectLabel} htmlFor={`insight-deck-${slot}-view`}>
                  <span className={styles.liveRegion} id={`insight-deck-${slot}-title`}>
                    {SLOT_LABELS[slot]}
                  </span>
                  <select
                    aria-label={`${SLOT_LABELS[slot]} view`}
                    className={styles.viewSelect}
                    id={`insight-deck-${slot}-view`}
                    onChange={event => {
                      const viewId = event.target.value as InsightViewId
                      pendingManualLayout.current = {slot, viewId}
                      setExpandedSlot(defaultSpan(viewId) === 2 ? slot : null)
                      controller.selectView(slot, viewId)
                    }}
                    value={selection?.viewId || ""}
                  >
                    {!selection && <option value="">No view selected</option>}
                    {INSIGHT_VIEW_REGISTRY.filter(view =>
                      view.permittedSlots.includes(slot)).map(view => (
                      <option key={view.id} value={view.id}>{view.label}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div aria-label={`${SLOT_LABELS[slot]} mode`} className={styles.modeControls} role="group">
                <button
                  aria-pressed={auto}
                  onClick={() => controller.restoreSlotAuto(slot)}
                  type="button"
                >Auto</button>
                <button
                  aria-pressed={Boolean(selection?.pinned)}
                  disabled={!selection}
                  onClick={() => controller.pinSlot(slot)}
                  type="button"
                >Pin</button>
                <button
                  aria-label={expandedSlot === slot
                    ? `Restore two insight views from ${registrationLabel(selection?.viewId || "candidate_comparison")}`
                    : `Expand ${selection ? registrationLabel(selection.viewId) : SLOT_LABELS[slot]}`}
                  aria-pressed={expandedSlot === slot}
                  disabled={!selection}
                  onClick={() => setExpandedSlot(current => current === slot ? null : slot)}
                  type="button"
                >{expandedSlot === slot ? "Split" : "Expand"}</button>
              </div>
            </header>

            {!collapsed && <div className={styles.slotBody}>
              {selection ? (
                <>
                  <p className={styles.explanation}>{selection.explanation}</p>
                  <p className={`${styles.evidence} ${styles[`evidence${evidenceLabel(selection.evidence.state)}`]}`}>
                    Evidence: {evidenceLabel(selection.evidence.state)}
                  </p>
                  {selection.evidence.staleReason && (
                    <p className={styles.evidenceDetail}>{selection.evidence.staleReason}</p>
                  )}
                  {selection.evidence.unavailableReason && (
                    <p className={styles.evidenceDetail}>{selection.evidence.unavailableReason}</p>
                  )}
                  <div className={styles.viewBody}>
                    {duplicate ? (
                      <p className={styles.unavailable} role="note">
                        Duplicate registered view suppressed; choose Auto to reconcile this slot.
                      </p>
                    ) : rendered || (
                      <p className={styles.unavailable} role="note">
                        Registered view renderer is unavailable for this slot.
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <p className={styles.unavailable} role="note">
                  No registered view is available for this slot.
                </p>
              )}
            </div>}
          </section>
        )
      })}
    </div>
    <div
      aria-atomic="true"
      aria-live="polite"
      className={styles.liveRegion}
      key={controller.state.announcement?.id || "insight-deck-initial"}
      role="status"
    >
      {controller.state.announcement?.text || ""}
    </div>
  </section>
}

export default InsightDeck
