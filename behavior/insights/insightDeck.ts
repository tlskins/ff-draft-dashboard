/**
 * Phase 14C1 owns presentation selection only.  It consumes already-computed
 * evidence and never calls recommendation, ranking, or opponent-model code.
 */

export const INSIGHT_DECK_SLOTS = [
  "primary_decision",
  "market_watch",
  "plan_constraints",
] as const

export type InsightDeckSlotId = typeof INSIGHT_DECK_SLOTS[number]

export const INSIGHT_VIEW_IDS = [
  "candidate_comparison",
  "intra_position_comparison",
  "historical_risk_reward",
  "historical_production",
  "current_tier_market",
  "plan_constraints",
  "two_round_run_matrix",
  "player_status",
  "rank_tier_disagreement",
  "data_source_status",
] as const

export type InsightViewId = typeof INSIGHT_VIEW_IDS[number]

export type InsightEvidenceState =
  | "ready"
  | "loading"
  | "stale"
  | "unavailable"

export interface InsightEvidence {
  state: InsightEvidenceState
  /** Stable caller-owned identity for the evidence currently being displayed. */
  fingerprint: string
  unavailableReason?: string
  staleReason?: string
}

export interface InsightViewRegistration {
  id: InsightViewId
  label: string
  permittedSlots: readonly InsightDeckSlotId[]
  /** Final deterministic tie-break after the supplied score. */
  priority: number
  /** Manual-only context views remain selectable but cannot displace Auto. */
  autoEligible: boolean
}

/**
 * The registry is intentionally closed. New insight renderers must register a
 * bounded ID and permitted slots rather than allowing arbitrary component IDs.
 */
export const INSIGHT_VIEW_REGISTRY: readonly InsightViewRegistration[] = [
  {
    id: "candidate_comparison",
    label: "Candidate comparison",
    permittedSlots: ["primary_decision"],
    priority: 10,
    autoEligible: true,
  },
  {
    id: "intra_position_comparison",
    label: "Intra-position comparison",
    permittedSlots: ["primary_decision"],
    priority: 20,
    autoEligible: true,
  },
  {
    id: "historical_risk_reward",
    label: "Historical risk & reward",
    permittedSlots: ["primary_decision"],
    priority: 30,
    autoEligible: true,
  },
  {
    id: "historical_production",
    label: "Historical production",
    permittedSlots: ["primary_decision"],
    priority: 40,
    autoEligible: true,
  },
  {
    id: "current_tier_market",
    label: "Current tier market",
    permittedSlots: ["primary_decision", "market_watch"],
    priority: 50,
    autoEligible: true,
  },
  {
    id: "plan_constraints",
    label: "Plan constraints",
    permittedSlots: ["plan_constraints"],
    priority: 80,
    autoEligible: true,
  },
  {
    id: "two_round_run_matrix",
    label: "Two-round run matrix",
    permittedSlots: ["market_watch"],
    priority: 60,
    autoEligible: true,
  },
  {
    id: "player_status",
    label: "Player status alerts",
    permittedSlots: ["plan_constraints"],
    priority: 70,
    autoEligible: true,
  },
  {
    id: "rank_tier_disagreement",
    label: "Rank & tier disagreement",
    permittedSlots: ["market_watch"],
    priority: 70,
    autoEligible: true,
  },
  {
    id: "data_source_status",
    label: "Published data sources",
    permittedSlots: ["plan_constraints"],
    priority: 90,
    autoEligible: false,
  },
]

export interface InsightCandidate {
  viewId: InsightViewId
  slot: InsightDeckSlotId
  /** A supplied presentation score, not a player recommendation score. */
  score: number
  reasonCode: string
  explanation: string
  evidence: InsightEvidence
}

export interface MaterialInsightEvent {
  streamId: string
  draftKey: string
}

export interface InsightDeckPolicy {
  /** Required lead over the incumbent before automatic replacement. */
  significanceMargin: number
  /** Required number of later material draft events before replacement. */
  minimumMaterialEventDwell: number
  maxQueuedAlternatives: number
}

export const DEFAULT_INSIGHT_DECK_POLICY: InsightDeckPolicy = {
  significanceMargin: 1,
  minimumMaterialEventDwell: 1,
  maxQueuedAlternatives: 3,
}

export interface InsightDeckSelection extends InsightCandidate {
  source: "auto" | "manual"
  pinned: boolean
  selectedAtMaterialEvent: number
}

export interface QueuedInsightAlternative extends InsightCandidate {
  blockedBy: "pinned" | "margin" | "dwell" | "duplicate" | "evidence" | "manual_only"
}

export interface InsightDeckSlotState {
  selection: InsightDeckSelection | null
  queuedAlternatives: QueuedInsightAlternative[]
}

export interface InsightDeckAnnouncement {
  id: string
  slot: InsightDeckSlotId
  kind: "auto_selected" | "evidence_updated" | "pinned" | "auto_restored" | "manual_selected"
  text: string
}

export interface InsightDeckState {
  streamId: string
  lastMaterialEventId: string | null
  materialEventCount: number
  slots: Record<InsightDeckSlotId, InsightDeckSlotState>
  announcement: InsightDeckAnnouncement | null
}

export interface InsightDeckTransitionResult {
  state: InsightDeckState
  changed: boolean
  selectionChanged: boolean
  blockedReason?: string
  announcement?: InsightDeckAnnouncement
}

const emptySlots = (): Record<InsightDeckSlotId, InsightDeckSlotState> => ({
  primary_decision: {selection: null, queuedAlternatives: []},
  market_watch: {selection: null, queuedAlternatives: []},
  plan_constraints: {selection: null, queuedAlternatives: []},
})

export const createInsightDeckState = (streamId: string): InsightDeckState => ({
  streamId,
  lastMaterialEventId: null,
  materialEventCount: 0,
  slots: emptySlots(),
  announcement: null,
})

export const materialInsightEventId = (
  event: MaterialInsightEvent,
): string => JSON.stringify([event.streamId, event.draftKey])

const registrationFor = (viewId: InsightViewId): InsightViewRegistration | null => (
  INSIGHT_VIEW_REGISTRY.find(registration => registration.id === viewId) || null
)

const finiteScore = (value: unknown): value is number => (
  typeof value === "number" && Number.isFinite(value)
)

const validEvidence = (evidence: InsightEvidence): boolean => (
  typeof evidence.fingerprint === "string"
  && ["ready", "loading", "stale", "unavailable"].includes(evidence.state)
)

/** Only ready evidence may drive an automatic displacement decision. */
export const isInsightAutoEvidenceEligible = (
  candidate: Pick<InsightCandidate, "viewId" | "evidence">,
): boolean => Boolean(
  registrationFor(candidate.viewId)?.autoEligible
  && candidate.evidence.state === "ready",
)

const isInsightViewAutoEligible = (
  candidate: Pick<InsightCandidate, "viewId">,
): boolean => Boolean(registrationFor(candidate.viewId)?.autoEligible)

const validCandidate = (candidate: InsightCandidate): boolean => {
  const registration = registrationFor(candidate.viewId)
  return Boolean(
    registration
    && registration.permittedSlots.includes(candidate.slot)
    && finiteScore(candidate.score)
    && candidate.reasonCode
    && candidate.explanation
    && validEvidence(candidate.evidence),
  )
}

const policyFor = (
  policy: Partial<InsightDeckPolicy> | undefined,
): InsightDeckPolicy => ({
  significanceMargin: Math.max(
    0,
    finiteScore(policy?.significanceMargin)
      ? policy!.significanceMargin
      : DEFAULT_INSIGHT_DECK_POLICY.significanceMargin,
  ),
  minimumMaterialEventDwell: Math.max(
    0,
    Math.floor(finiteScore(policy?.minimumMaterialEventDwell)
      ? policy!.minimumMaterialEventDwell
      : DEFAULT_INSIGHT_DECK_POLICY.minimumMaterialEventDwell),
  ),
  maxQueuedAlternatives: Math.max(
    0,
    Math.floor(finiteScore(policy?.maxQueuedAlternatives)
      ? policy!.maxQueuedAlternatives
      : DEFAULT_INSIGHT_DECK_POLICY.maxQueuedAlternatives),
  ),
})

/** One valid candidate per view/slot; ties remain deterministic. */
export const normalizeInsightCandidates = (
  candidates: InsightCandidate[],
): InsightCandidate[] => {
  const unique = new Map<string, InsightCandidate>()
  candidates.filter(validCandidate).forEach(candidate => {
    const key = `${candidate.slot}:${candidate.viewId}`
    const current = unique.get(key)
    if (!current || compareCandidates(candidate, current) < 0) {
      unique.set(key, candidate)
    }
  })
  return Array.from(unique.values()).sort(compareCandidates)
}

export const compareCandidates = (
  left: InsightCandidate,
  right: InsightCandidate,
): number => (
  right.score - left.score
  || (registrationFor(left.viewId)?.priority ?? Number.MAX_SAFE_INTEGER)
    - (registrationFor(right.viewId)?.priority ?? Number.MAX_SAFE_INTEGER)
  || left.viewId.localeCompare(right.viewId)
)

const unavailableSelection = (
  selection: InsightDeckSelection,
): InsightDeckSelection => ({
  ...selection,
  score: Number.NEGATIVE_INFINITY,
  evidence: {
    state: "unavailable",
    fingerprint: `${selection.viewId}:unavailable`,
    unavailableReason: "This registered view has no current evidence.",
  },
})

const selectionFrom = (
  candidate: InsightCandidate,
  source: InsightDeckSelection["source"],
  pinned: boolean,
  selectedAtMaterialEvent: number,
): InsightDeckSelection => ({
  ...candidate,
  source,
  pinned,
  selectedAtMaterialEvent,
})

const announcementFor = (
  state: InsightDeckState,
  slot: InsightDeckSlotId,
  kind: InsightDeckAnnouncement["kind"],
  selection: InsightDeckSelection,
): InsightDeckAnnouncement => ({
  id: `${state.streamId}:${state.materialEventCount}:${slot}:${kind}:${selection.viewId}:${selection.evidence.fingerprint}`,
  slot,
  kind,
  text: kind === "evidence_updated"
    ? `${INSIGHT_VIEW_REGISTRY.find(item => item.id === selection.viewId)?.label
      || selection.viewId} evidence updated for ${slot.replace("_", " ")}. ${selection.explanation}`
    : `${INSIGHT_VIEW_REGISTRY.find(item => item.id === selection.viewId)?.label
      || selection.viewId} ${kind.replace("_", " ")} for ${slot.replace("_", " ")}. ${selection.explanation}`,
})

const result = (
  previous: InsightDeckState,
  state: InsightDeckState,
  selectionChanged = false,
  blockedReason?: string,
): InsightDeckTransitionResult => ({
  state,
  changed: state !== previous,
  selectionChanged,
  blockedReason,
  ...(state.announcement ? {announcement: state.announcement} : {}),
})

const unchanged = (
  state: InsightDeckState,
  blockedReason?: string,
): InsightDeckTransitionResult => ({
  state,
  changed: false,
  selectionChanged: false,
  blockedReason,
})

const candidatesForSlot = (
  candidates: InsightCandidate[],
  slot: InsightDeckSlotId,
): InsightCandidate[] => candidates.filter(candidate => candidate.slot === slot)

const queued = (
  candidates: InsightCandidate[],
  selection: InsightDeckSelection | null,
  usedViewIds: Set<InsightViewId>,
  state: InsightDeckState,
  policy: InsightDeckPolicy,
): QueuedInsightAlternative[] => candidates
  .filter(candidate => candidate.viewId !== selection?.viewId)
  .map(candidate => {
    const blockedBy: QueuedInsightAlternative["blockedBy"] = selection?.pinned
      ? "pinned"
      : usedViewIds.has(candidate.viewId)
        ? "duplicate"
        : !registrationFor(candidate.viewId)?.autoEligible
          ? "manual_only"
        : !isInsightAutoEvidenceEligible(candidate)
          ? "evidence"
        : selection && candidate.score < (
          isInsightAutoEvidenceEligible(selection)
            ? selection.score
            : Number.NEGATIVE_INFINITY
        ) + policy.significanceMargin
          ? "margin"
          : selection && state.materialEventCount - selection.selectedAtMaterialEvent
            < policy.minimumMaterialEventDwell
            ? "dwell"
            : "margin"
    return {...candidate, blockedBy}
  })
  .slice(0, policy.maxQueuedAlternatives)

/**
 * API reads may settle between draft picks. Refresh the evidence and manual
 * queue immediately, but never let same-event I/O churn change Auto identity.
 */
const refreshSameMaterialEvent = (
  current: InsightDeckState,
  suppliedCandidates: InsightCandidate[],
  policy: InsightDeckPolicy,
): InsightDeckTransitionResult => {
  const candidates = normalizeInsightCandidates(suppliedCandidates)
  const usedViewIds = new Set<InsightViewId>(INSIGHT_DECK_SLOTS.flatMap(slot => {
    const selection = current.slots[slot].selection
    return selection ? [selection.viewId] : []
  }))
  const slots = emptySlots()
  let evidenceAnnouncement: InsightDeckAnnouncement | null = null

  INSIGHT_DECK_SLOTS.forEach(slot => {
    const previous = current.slots[slot]
    const slotCandidates = candidatesForSlot(candidates, slot)
    const refreshedCandidate = previous.selection
      ? slotCandidates.find(candidate => candidate.viewId === previous.selection!.viewId)
      : null
    const selection = previous.selection
      ? refreshedCandidate
        ? selectionFrom(
            refreshedCandidate,
            previous.selection.source,
            previous.selection.pinned,
            previous.selection.selectedAtMaterialEvent,
          )
        : unavailableSelection(previous.selection)
      : null
    slots[slot] = {
      selection,
      queuedAlternatives: queued(
        slotCandidates,
        selection,
        usedViewIds,
        current,
        policy,
      ),
    }
    if (
      !evidenceAnnouncement
      && previous.selection
      && selection
      && previous.selection.viewId === selection.viewId
      && (
        previous.selection.evidence.fingerprint !== selection.evidence.fingerprint
        || previous.selection.evidence.state !== selection.evidence.state
        || previous.selection.explanation !== selection.explanation
      )
    ) {
      evidenceAnnouncement = announcementFor(
        current,
        slot,
        "evidence_updated",
        selection,
      )
    }
  })

  const next = {...current, slots, announcement: evidenceAnnouncement}
  if (JSON.stringify({slots: current.slots, announcement: current.announcement})
    === JSON.stringify({slots, announcement: evidenceAnnouncement})) {
    return unchanged(current)
  }
  return result(current, next, false)
}

/**
 * Auto selection reconciles only at a material draft boundary. Identical event
 * identities may refresh displayed API evidence and manual alternatives, but
 * cannot replace the selected view.
 */
export const reconcileInsightDeck = (
  current: InsightDeckState,
  event: MaterialInsightEvent,
  suppliedCandidates: InsightCandidate[],
  suppliedPolicy?: Partial<InsightDeckPolicy>,
): InsightDeckTransitionResult => {
  const eventId = materialInsightEventId(event)
  const policy = policyFor(suppliedPolicy)
  if (current.streamId === event.streamId && current.lastMaterialEventId === eventId) {
    return refreshSameMaterialEvent(current, suppliedCandidates, policy)
  }
  const initial = current.streamId === event.streamId
    ? current
    : createInsightDeckState(event.streamId)
  const materialEventCount = initial.materialEventCount + 1
  const candidates = normalizeInsightCandidates(suppliedCandidates)
  // Reserve pins before slot-order evaluation. A later pinned market view is
  // just as authoritative as an earlier primary slot, including when its
  // evidence is currently unavailable.
  const usedViewIds = new Set<InsightViewId>(INSIGHT_DECK_SLOTS.flatMap(slot => {
    const selection = initial.slots[slot].selection
    return selection?.pinned ? [selection.viewId] : []
  }))
  const slots = emptySlots()
  let selectionChanged = false
  let announcement: InsightDeckAnnouncement | null = null

  INSIGHT_DECK_SLOTS.forEach(slot => {
    const previous = initial.slots[slot]
    const slotCandidates = candidatesForSlot(candidates, slot)
    const currentSelection = previous.selection
    const refreshed = currentSelection
      ? slotCandidates.find(candidate => candidate.viewId === currentSelection.viewId)
        ? selectionFrom(
            slotCandidates.find(candidate => candidate.viewId === currentSelection.viewId)!,
            currentSelection.source,
            currentSelection.pinned,
            currentSelection.selectedAtMaterialEvent,
          )
        : unavailableSelection(currentSelection)
      : null

    if (refreshed?.pinned) {
      usedViewIds.add(refreshed.viewId)
      slots[slot] = {
        selection: refreshed,
        queuedAlternatives: queued(slotCandidates, refreshed, usedViewIds, {
          ...initial, materialEventCount,
        }, policy),
      }
      return
    }

    // An older state could contain two unpinned selections for the same view
    // after a newly higher-priority slot legitimately takes it. Never retain
    // that incumbent: choose a distinct alternative or clear the slot.
    const incumbentConflicts = Boolean(
      refreshed && usedViewIds.has(refreshed.viewId),
    )
    const bestReady = slotCandidates.find(candidate => (
      isInsightAutoEvidenceEligible(candidate)
      && !usedViewIds.has(candidate.viewId)
    )) || null
    // An empty slot may show a non-ready registered fallback, but only when no
    // ready view exists. That preserves explicit loading/stale/unavailable UI.
    const bestFallback = slotCandidates.find(candidate => (
      isInsightViewAutoEligible(candidate)
      && !usedViewIds.has(candidate.viewId)
    ))
      || null
    const readyChallenger = bestReady?.viewId === refreshed?.viewId
      ? null
      : bestReady
    let next = incumbentConflicts ? null : refreshed
    const currentEvidenceMissing = Boolean(currentSelection && !slotCandidates.some(
      candidate => candidate.viewId === currentSelection.viewId,
    ))
    const replacement = !currentSelection || currentEvidenceMissing
      ? bestReady || bestFallback
      : bestFallback
    if (!next && replacement) {
      next = selectionFrom(replacement!, "auto", false, materialEventCount)
      selectionChanged = true
    } else if (!next && refreshed) {
      selectionChanged = true
    } else if (next && readyChallenger) {
      const incumbentScore = isInsightAutoEvidenceEligible(next)
        ? next.score
        : Number.NEGATIVE_INFINITY
      const marginMet = readyChallenger.score >= incumbentScore
        + policy.significanceMargin
      const dwellMet = materialEventCount - next.selectedAtMaterialEvent
        >= policy.minimumMaterialEventDwell
      if (currentEvidenceMissing || (marginMet && dwellMet)) {
        next = selectionFrom(readyChallenger, "auto", false, materialEventCount)
        selectionChanged = true
      }
    }
    if (next) usedViewIds.add(next.viewId)
    slots[slot] = {
      selection: next,
      queuedAlternatives: queued(slotCandidates, next, usedViewIds, {
        ...initial, materialEventCount,
      }, policy),
    }
  })

  const nextState: InsightDeckState = {
    ...initial,
    lastMaterialEventId: eventId,
    materialEventCount,
    slots,
    announcement: null,
  }
  // Initial fill is deliberately silent. Later material switches and explicit
  // user actions own the one announced transition boundary.
  if (selectionChanged && initial.lastMaterialEventId !== null) {
    const changedSlot = INSIGHT_DECK_SLOTS.find(slot => (
      initial.slots[slot].selection?.viewId !== slots[slot].selection?.viewId
      && slots[slot].selection
    ))
    const selection = changedSlot ? slots[changedSlot].selection : null
    if (changedSlot && selection) {
      announcement = announcementFor(nextState, changedSlot, "auto_selected", selection)
    }
  } else if (initial.lastMaterialEventId !== null) {
    const refreshedSlot = INSIGHT_DECK_SLOTS.find(slot => {
      const previous = initial.slots[slot].selection
      const refreshed = slots[slot].selection
      return Boolean(
        previous
        && refreshed
        && previous.viewId === refreshed.viewId
        && (
          previous.evidence.fingerprint !== refreshed.evidence.fingerprint
          || previous.evidence.state !== refreshed.evidence.state
          || previous.explanation !== refreshed.explanation
        )
      )
    })
    if (refreshedSlot && slots[refreshedSlot].selection) {
      announcement = announcementFor(
        nextState,
        refreshedSlot,
        "evidence_updated",
        slots[refreshedSlot].selection!,
      )
    }
  }
  return result(current, {...nextState, announcement}, selectionChanged)
}

const candidateForExplicitSelection = (
  candidates: InsightCandidate[],
  slot: InsightDeckSlotId,
  viewId: InsightViewId,
): InsightCandidate | null => normalizeInsightCandidates(candidates).find(candidate => (
  candidate.slot === slot && candidate.viewId === viewId
)) || null

const usedOutsideSlot = (
  state: InsightDeckState,
  slot: InsightDeckSlotId,
): Set<InsightViewId> => new Set(INSIGHT_DECK_SLOTS.flatMap(otherSlot => (
  otherSlot === slot || !state.slots[otherSlot].selection
    ? []
    : [state.slots[otherSlot].selection!.viewId]
)))

export const setInsightDeckSlotPinned = (
  current: InsightDeckState,
  slot: InsightDeckSlotId,
  pinned: boolean,
): InsightDeckTransitionResult => {
  const selection = current.slots[slot].selection
  if (!selection) return unchanged(current, "No registered view is selected for this slot")
  if (selection.pinned === pinned) return unchanged(current)
  const nextSelection = {...selection, pinned, source: "manual" as const}
  const announcement = announcementFor(current, slot, pinned ? "pinned" : "auto_restored", nextSelection)
  return result(current, {
    ...current,
    slots: {...current.slots, [slot]: {...current.slots[slot], selection: nextSelection}},
    announcement,
  }, false)
}

/** Explicit user action: immediately choose the best distinct automatic view. */
export const restoreInsightDeckSlotAuto = (
  current: InsightDeckState,
  slot: InsightDeckSlotId,
  suppliedCandidates: InsightCandidate[],
): InsightDeckTransitionResult => {
  const candidates = candidatesForSlot(normalizeInsightCandidates(suppliedCandidates), slot)
  const selected = current.slots[slot].selection
  if (!selected) return unchanged(current, "No registered view is selected for this slot")
  const used = usedOutsideSlot(current, slot)
  const nextCandidate = candidates.find(candidate => (
    isInsightAutoEvidenceEligible(candidate)
    && !used.has(candidate.viewId)
  )) || candidates.find(candidate => (
    isInsightViewAutoEligible(candidate)
    && !used.has(candidate.viewId)
  ))
  if (!nextCandidate) return unchanged(current, "No distinct automatic view is available")
  const nextSelection = selectionFrom(
    nextCandidate,
    "auto",
    false,
    current.materialEventCount,
  )
  const changed = selected.viewId !== nextSelection.viewId || selected.pinned
  if (!changed) return unchanged(current)
  const announcement = announcementFor(current, slot, "auto_restored", nextSelection)
  return result(current, {
    ...current,
    slots: {
      ...current.slots,
      [slot]: {
        selection: nextSelection,
        queuedAlternatives: [],
      },
    },
    announcement,
  }, selected.viewId !== nextSelection.viewId)
}

/** Explicit manual selection pins the requested registered view for that slot. */
export const selectInsightDeckView = (
  current: InsightDeckState,
  slot: InsightDeckSlotId,
  viewId: InsightViewId,
  suppliedCandidates: InsightCandidate[],
): InsightDeckTransitionResult => {
  const candidate = candidateForExplicitSelection(suppliedCandidates, slot, viewId)
  if (!candidate) return unchanged(current, "That view is not registered for this slot")
  if (usedOutsideSlot(current, slot).has(viewId)) {
    return unchanged(current, "That registered view is already shown in another slot")
  }
  const previous = current.slots[slot].selection
  const nextSelection = selectionFrom(
    candidate,
    "manual",
    true,
    current.materialEventCount,
  )
  if (previous?.viewId === nextSelection.viewId && previous.pinned) {
    return unchanged(current)
  }
  const announcement = announcementFor(current, slot, "manual_selected", nextSelection)
  return result(current, {
    ...current,
    slots: {
      ...current.slots,
      [slot]: {selection: nextSelection, queuedAlternatives: []},
    },
    announcement,
  }, previous?.viewId !== nextSelection.viewId)
}
