import React from "react"

import type {InsightDeckController} from "../../behavior/hooks/useInsightDeckController"
import {
  INSIGHT_DECK_SLOTS,
  INSIGHT_VIEW_REGISTRY,
  InsightDeckSelection,
  InsightDeckSlotId,
  InsightViewId,
} from "../../behavior/insights/insightDeck"
import styles from "./InsightDeck.module.css"

const SLOT_LABELS: Record<InsightDeckSlotId, string> = {
  primary_decision: "Primary decision",
  market_watch: "Market watch",
  plan_constraints: "Plan & constraints",
}

const evidenceLabel = (state: InsightDeckSelection["evidence"]["state"]): string => (
  state.charAt(0).toUpperCase() + state.slice(1)
)

const blockedLabel = (blockedBy: string): string => ({
  pinned: "Pinned view preserved",
  margin: "Below significance margin",
  dwell: "Waiting for material-event dwell",
  duplicate: "Already shown in another slot",
  evidence: "Evidence is not ready for Auto",
}[blockedBy] || "Not selected")

const registrationLabel = (viewId: InsightViewId): string => (
  INSIGHT_VIEW_REGISTRY.find(view => view.id === viewId)?.label || viewId
)

export interface InsightDeckRenderContext {
  slot: InsightDeckSlotId
  selection: InsightDeckSelection
}

export interface InsightDeckProps {
  controller: InsightDeckController
  /**
   * Deliberately bounded to registered IDs. Returning null/undefined makes the
   * slot visibly unavailable rather than silently rendering arbitrary content.
   */
  renderView: (
    viewId: InsightViewId,
    context: InsightDeckRenderContext,
  ) => React.ReactNode | null | undefined
}

const InsightDeck: React.FC<InsightDeckProps> = ({controller, renderView}) => (
  <section aria-label="Draft insight deck" className={styles.deck}>
    <header className={styles.deckHeader}>
      <div>
        <p className={styles.kicker}>Decision view</p>
        <h2>Insight deck</h2>
      </div>
      <p className={styles.sessionNote}>Pins stay in this draft session only.</p>
    </header>

    <div className={styles.slotList}>
      {(() => {
        const renderedViewIds = new Set<InsightViewId>()
        return INSIGHT_DECK_SLOTS.map(slot => {
        const slotState = controller.state.slots[slot]
        const selection = slotState.selection
        const auto = !selection?.pinned
        const duplicate = Boolean(selection && renderedViewIds.has(selection.viewId))
        if (selection && !duplicate) renderedViewIds.add(selection.viewId)
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
            className={styles.slot}
            key={slot}
          >
            <header className={styles.slotHeader}>
              <div>
                <p className={styles.slotLabel}>{SLOT_LABELS[slot]}</p>
                <h3 id={`insight-deck-${slot}-title`}>
                  {selection ? registrationLabel(selection.viewId) : "No view selected"}
                </h3>
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
              </div>
            </header>

            <div className={styles.slotBody}>
              {selection ? (
                <>
                  <p className={styles.modeNote}>
                    {selection.pinned ? "Pinned for this session" : "Automatic for this session"}
                  </p>
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
              {slotState.queuedAlternatives.length > 0 && (
                <details className={styles.queued}>
                  <summary>
                    Alternatives ({slotState.queuedAlternatives.length})
                  </summary>
                  <ul>
                    {slotState.queuedAlternatives.map(alternative => (
                      <li key={`${alternative.viewId}:${alternative.evidence.fingerprint}`}>
                        <strong>{registrationLabel(alternative.viewId)}</strong>
                        <span>{blockedLabel(alternative.blockedBy)}</span>
                        <small>{alternative.explanation}</small>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          </section>
        )
        })
      })()}
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
)

export default InsightDeck
