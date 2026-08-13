export type AnalysisViewId =
  | "tier_landscape"
  | "positional_bests"
  | "cross_position"
  | "intra_position"

export type AnalysisViewSource = "manual" | "agent"

export interface AdvisorViewRecommendation {
  view: AnalysisViewId
  explanation: string
  revision: number
}

export interface AutomaticAnalysisViewEvent extends AdvisorViewRecommendation {
  kind: "automatic"
  streamId: string
}

export interface ConfirmedManualAnalysisViewEvent {
  kind: "confirmed_manual"
  streamId: string
  eventId: string
  sequence: number
  view: AnalysisViewId
  explanation: string
  supersedesAutomaticRevision: number
}

export type AnalysisViewNavigationEvent =
  | AutomaticAnalysisViewEvent
  | ConfirmedManualAnalysisViewEvent

export interface AnalysisViewState {
  view: AnalysisViewId
  pinned: boolean
  source: AnalysisViewSource
  explanation: string
  lastProcessedEventStreamId: string | null
  lastProcessedAdvisorRevision: number | null
  lastProcessedConfirmedManualSequence: number | null
  pendingAdvisorRecommendation: AdvisorViewRecommendation | null
}

export interface AnalysisViewTransition {
  view: AnalysisViewId
  source: AnalysisViewSource
  explanation: string
}

export type AnalysisViewAction =
  | {
      type: "manual_select"
      view: AnalysisViewId
      explanation: string
    }
  | {
      type: "advisor_recommendation"
      recommendation: AutomaticAnalysisViewEvent
    }
  | {
      type: "confirmed_manual_select"
      event: ConfirmedManualAnalysisViewEvent
    }
  | {
      type: "set_pinned"
      pinned: boolean
    }
  | {
      type: "adopt_pending_recommendation"
    }

export interface AnalysisViewTransitionResult {
  state: AnalysisViewState
  changed: boolean
  viewChanged: boolean
  blockedReason?: string
  advisorAction?: "applied" | "pending" | "adopted"
  advisorRecommendation?: AdvisorViewRecommendation
  confirmedManualAction?: "applied"
}

export interface AnalysisViewDefinition {
  id: AnalysisViewId
  label: string
  shortLabel: string
  description: string
  explanation: string
}

export const ANALYSIS_VIEW_DEFINITIONS: AnalysisViewDefinition[] = [
  {
    id: "tier_landscape",
    label: "Position tiers",
    shortLabel: "Position tiers",
    description: "See every available player, tier cliffs, and run risk.",
    explanation: "Reviewing player supply and tier cliffs by position.",
  },
  {
    id: "positional_bests",
    label: "Position tiers",
    shortLabel: "Position tiers",
    description: "See every available player, tier cliffs, and run risk.",
    explanation: "Reviewing player supply and tier cliffs by position.",
  },
  {
    id: "cross_position",
    label: "Decision cockpit",
    shortLabel: "Decision cockpit",
    description: "Compare the best QB, RB, WR, and TE now and next turn.",
    explanation: "Comparing the best option at each position now and next turn.",
  },
  {
    id: "intra_position",
    label: "Player lab",
    shortLabel: "Player lab",
    description: "Compare weekly range and season trends for 3–5 players.",
    explanation: "Comparing weekly outcomes for players at one position.",
  },
]

const USER_FACING_VIEW_IDS: Record<AnalysisViewId, AnalysisViewId> = {
  tier_landscape: "tier_landscape",
  positional_bests: "tier_landscape",
  cross_position: "cross_position",
  intra_position: "intra_position",
}

const USER_FACING_VIEW_LABELS: Record<AnalysisViewId, string> = {
  tier_landscape: "Position Tiers",
  positional_bests: "Position Tiers",
  cross_position: "Decision Cockpit",
  intra_position: "Player Lab",
}

/** Preserve the four internal IDs while consolidating their visible routes. */
export const userFacingAnalysisViewId = (
  view: AnalysisViewId,
): AnalysisViewId => USER_FACING_VIEW_IDS[view]

export const userFacingAnalysisViewLabel = (
  view: AnalysisViewId,
): string => USER_FACING_VIEW_LABELS[view]

export const userFacingAnalysisViewDefinition = (
  view: AnalysisViewId,
): AnalysisViewDefinition => ANALYSIS_VIEW_DEFINITIONS.find(definition => (
  definition.id === userFacingAnalysisViewId(view)
)) || ANALYSIS_VIEW_DEFINITIONS[0]

export const DEFAULT_ANALYSIS_VIEW_STATE: AnalysisViewState = {
  view: "cross_position",
  pinned: false,
  source: "manual",
  explanation: "Compare the best option at each position now and next turn.",
  lastProcessedEventStreamId: null,
  lastProcessedAdvisorRevision: null,
  lastProcessedConfirmedManualSequence: null,
  pendingAdvisorRecommendation: null,
}

const VIEW_IDS: AnalysisViewId[] = [
  "tier_landscape",
  "positional_bests",
  "cross_position",
  "intra_position",
]

const isValidRevision = (value: unknown): value is number => (
  typeof value === "number"
  && Number.isSafeInteger(value)
  && value >= 0
)

export const isAnalysisViewState = (
  value: unknown,
): value is AnalysisViewState => {
  if (!value || typeof value !== "object") return false
  const candidate = value as Partial<AnalysisViewState>
  const pending = candidate.pendingAdvisorRecommendation
  return (
    VIEW_IDS.includes(candidate.view as AnalysisViewId) &&
    typeof candidate.pinned === "boolean" &&
    ["manual", "agent"].includes(candidate.source || "") &&
    typeof candidate.explanation === "string" &&
    (
      candidate.lastProcessedEventStreamId === null
      || typeof candidate.lastProcessedEventStreamId === "string"
    ) &&
    (
      candidate.lastProcessedAdvisorRevision === null
      || isValidRevision(candidate.lastProcessedAdvisorRevision)
    ) &&
    (
      candidate.lastProcessedConfirmedManualSequence === null
      || isValidRevision(candidate.lastProcessedConfirmedManualSequence)
    ) &&
    (
      pending === null
      || (
        !!pending &&
        VIEW_IDS.includes(pending.view) &&
        typeof pending.explanation === "string" &&
        isValidRevision(pending.revision)
      )
    )
  )
}

const cloneDefaultState = (): AnalysisViewState => ({
  ...DEFAULT_ANALYSIS_VIEW_STATE,
})

const isAnalysisViewBase = (
  value: unknown,
): value is Pick<AnalysisViewState, "view" | "pinned" | "source" | "explanation"> => {
  if (!value || typeof value !== "object") return false
  const candidate = value as Partial<AnalysisViewState>
  return (
    VIEW_IDS.includes(candidate.view as AnalysisViewId) &&
    typeof candidate.pinned === "boolean" &&
    ["manual", "agent"].includes(candidate.source || "") &&
    typeof candidate.explanation === "string"
  )
}

const restoreAnalysisViewBase = (
  value: Pick<AnalysisViewState, "view" | "pinned" | "source" | "explanation">,
): AnalysisViewState => ({
  view: value.view,
  pinned: value.pinned,
  source: value.source,
  explanation: value.explanation,
  lastProcessedEventStreamId: null,
  lastProcessedAdvisorRevision: null,
  lastProcessedConfirmedManualSequence: null,
  pendingAdvisorRecommendation: null,
})

/**
 * Restore only validated navigation state from the existing local-storage
 * boundary. Advisor revisions and pending advice are intentionally runtime
 * state so a new draft cannot replay an old draft's recommendation.
 */
export const restoreAnalysisViewState = (value: unknown): AnalysisViewState => {
  if (!value || typeof value !== "object") return cloneDefaultState()
  const candidate = value as Record<string, unknown>
  const hasSchemaVersion = Object.prototype.hasOwnProperty.call(
    candidate,
    "schemaVersion",
  )
  if (hasSchemaVersion && candidate.schemaVersion !== 1) {
    return cloneDefaultState()
  }
  const hasRuntimeFields = [
    "lastProcessedEventStreamId",
    "lastProcessedAdvisorRevision",
    "lastProcessedConfirmedManualSequence",
    "pendingAdvisorRecommendation",
  ].some(field => Object.prototype.hasOwnProperty.call(candidate, field))
  if (hasRuntimeFields && !isAnalysisViewState(value)) {
    return cloneDefaultState()
  }
  if (isAnalysisViewState(value)) {
    return restoreAnalysisViewBase(value)
  }
  if (isAnalysisViewBase(value)) {
    return restoreAnalysisViewBase(value)
  }
  return cloneDefaultState()
}

export const serializeAnalysisViewState = (
  state: AnalysisViewState,
): Record<string, unknown> => ({
  schemaVersion: 1,
  view: state.view,
  pinned: state.pinned,
  source: state.source,
  explanation: state.explanation,
})

const unchanged = (
  current: AnalysisViewState,
  blockedReason?: string,
): AnalysisViewTransitionResult => ({
  state: current,
  changed: false,
  viewChanged: false,
  blockedReason,
})

const transitionResult = (
  current: AnalysisViewState,
  state: AnalysisViewState,
  metadata: Pick<AnalysisViewTransitionResult, "blockedReason" | "advisorAction" | "advisorRecommendation" | "confirmedManualAction"> = {},
): AnalysisViewTransitionResult => ({
  ...metadata,
  state,
  changed: (
    state.view !== current.view
    || state.pinned !== current.pinned
    || state.source !== current.source
    || state.explanation !== current.explanation
    || state.lastProcessedEventStreamId !== current.lastProcessedEventStreamId
    || state.lastProcessedAdvisorRevision !== current.lastProcessedAdvisorRevision
    || state.lastProcessedConfirmedManualSequence
      !== current.lastProcessedConfirmedManualSequence
    || state.pendingAdvisorRecommendation !== current.pendingAdvisorRecommendation
  ),
  viewChanged: state.view !== current.view,
})

/**
 * Pure controller for the decision-workspace navigation contract.
 * Revisions are consumed monotonically; a pinned workspace queues only the
 * newest recommendation and never changes its active view automatically.
 */
export const transitionAnalysisViewState = (
  current: AnalysisViewState,
  action: AnalysisViewAction,
): AnalysisViewTransitionResult => {
  if (action.type === "manual_select") {
    return transitionResult(current, {
      ...current,
      view: action.view,
      source: "manual",
      explanation: action.explanation,
    })
  }

  if (action.type === "confirmed_manual_select") {
    const event = action.event
    if (
      !event.eventId
      || !isValidRevision(event.sequence)
      || !isValidRevision(event.supersedesAutomaticRevision)
    ) return unchanged(current)
    const sameStream = current.lastProcessedEventStreamId === event.streamId
    const lastSequence = sameStream
      ? current.lastProcessedConfirmedManualSequence
      : null
    if (lastSequence !== null && event.sequence <= lastSequence) {
      return unchanged(current)
    }
    return transitionResult(current, {
      ...current,
      view: event.view,
      source: "manual",
      explanation: event.explanation,
      lastProcessedEventStreamId: event.streamId,
      lastProcessedAdvisorRevision: Math.max(
        sameStream ? current.lastProcessedAdvisorRevision ?? -1 : -1,
        event.supersedesAutomaticRevision,
      ),
      lastProcessedConfirmedManualSequence: event.sequence,
      pendingAdvisorRecommendation: null,
    }, {
      confirmedManualAction: "applied",
    })
  }

  if (action.type === "advisor_recommendation") {
    const recommendation = action.recommendation
    const advisorRecommendation: AdvisorViewRecommendation = {
      view: recommendation.view,
      explanation: recommendation.explanation,
      revision: recommendation.revision,
    }
    const sameStream = current.lastProcessedEventStreamId
      === recommendation.streamId
    const lastRevision = sameStream
      ? current.lastProcessedAdvisorRevision
      : null
    if (
      !isValidRevision(recommendation.revision)
      || (
        lastRevision !== null
        && recommendation.revision <= lastRevision
      )
    ) {
      return unchanged(current)
    }

    const withRevision = {
      ...current,
      lastProcessedEventStreamId: recommendation.streamId,
      lastProcessedAdvisorRevision: recommendation.revision,
      lastProcessedConfirmedManualSequence: sameStream
        ? current.lastProcessedConfirmedManualSequence
        : null,
      pendingAdvisorRecommendation: sameStream
        ? current.pendingAdvisorRecommendation
        : null,
    }
    if (current.pinned) {
      return transitionResult(current, {
        ...withRevision,
        pendingAdvisorRecommendation: advisorRecommendation,
      }, {
        advisorAction: "pending",
        advisorRecommendation,
        blockedReason: "The current analysis view is pinned",
      })
    }
    return transitionResult(current, {
      ...withRevision,
      view: recommendation.view,
      source: "agent",
      explanation: recommendation.explanation,
      pendingAdvisorRecommendation: null,
    }, {
      advisorAction: "applied",
      advisorRecommendation,
    })
  }

  if (action.type === "set_pinned") {
    if (action.pinned === current.pinned) return unchanged(current)
    if (action.pinned || !current.pendingAdvisorRecommendation) {
      return transitionResult(current, {
        ...current,
        pinned: action.pinned,
      })
    }
    const recommendation = current.pendingAdvisorRecommendation
    return transitionResult(current, {
      ...current,
      pinned: false,
      view: recommendation.view,
      source: "agent",
      explanation: recommendation.explanation,
      pendingAdvisorRecommendation: null,
    }, {
      advisorAction: "applied",
      advisorRecommendation: recommendation,
    })
  }

  const recommendation = current.pendingAdvisorRecommendation
  if (!recommendation) return unchanged(current)
  return transitionResult(current, {
    ...current,
    view: recommendation.view,
    source: "manual",
    explanation: recommendation.explanation,
    pendingAdvisorRecommendation: null,
  }, {
    advisorAction: "adopted",
    advisorRecommendation: recommendation,
  })
}

export const transitionAnalysisView = (
  current: AnalysisViewState,
  transition: AnalysisViewTransition,
): AnalysisViewTransitionResult => {
  if (
    current.pinned &&
    transition.source === "agent" &&
    transition.view !== current.view
  ) {
    return {
      state: current,
      changed: false,
      viewChanged: false,
      blockedReason: "The current analysis view is pinned",
    }
  }
  const state = {
    ...current,
    view: transition.view,
    source: transition.source,
    explanation: transition.explanation,
  }
  return {
    state,
    changed: (
      state.view !== current.view ||
      state.source !== current.source ||
      state.explanation !== current.explanation
    ),
    viewChanged: state.view !== current.view,
  }
}

export const setAnalysisViewPinned = (
  state: AnalysisViewState,
  pinned: boolean,
): AnalysisViewState => transitionAnalysisViewState(state, {
  type: "set_pinned",
  pinned,
}).state
