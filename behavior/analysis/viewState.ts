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

export interface AnalysisViewState {
  view: AnalysisViewId
  pinned: boolean
  source: AnalysisViewSource
  explanation: string
  lastProcessedAdvisorRevision: number | null
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
      recommendation: AdvisorViewRecommendation
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
    label: "Positional tier landscape",
    shortLabel: "Landscape",
    description: "See scoring density, downside, and tier-cliff shape.",
    explanation: "Exploring positional density and scoring ranges.",
  },
  {
    id: "positional_bests",
    label: "Realtime positional bests",
    shortLabel: "Positional bests",
    description: "Rank the strongest historical options at one position.",
    explanation: "Reviewing the best options at the selected position.",
  },
  {
    id: "cross_position",
    label: "Cross-position comparison",
    shortLabel: "Cross-position",
    description: "Compare the top custom-ranked option at each position.",
    explanation: "Comparing the leading option across positions.",
  },
  {
    id: "intra_position",
    label: "Intra-position comparison",
    shortLabel: "Intra-position",
    description: "Compare two players at the same position over time.",
    explanation: "Comparing selected players within one position.",
  },
]

export const DEFAULT_ANALYSIS_VIEW_STATE: AnalysisViewState = {
  view: "tier_landscape",
  pinned: false,
  source: "manual",
  explanation: "Explore positional density and scoring ranges.",
  lastProcessedAdvisorRevision: null,
  pendingAdvisorRecommendation: null,
}

const VIEW_IDS: AnalysisViewId[] = [
  "tier_landscape",
  "positional_bests",
  "cross_position",
  "intra_position",
]

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
      candidate.lastProcessedAdvisorRevision === null
      || (
        typeof candidate.lastProcessedAdvisorRevision === "number"
        && Number.isFinite(candidate.lastProcessedAdvisorRevision)
      )
    ) &&
    (
      pending === null
      || (
        !!pending &&
        VIEW_IDS.includes(pending.view) &&
        typeof pending.explanation === "string" &&
        typeof pending.revision === "number" &&
        Number.isFinite(pending.revision)
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

/**
 * Restore only validated navigation state from the existing local-storage
 * boundary. Advisor revisions and pending advice are intentionally runtime
 * state so a new draft cannot replay an old draft's recommendation.
 */
export const restoreAnalysisViewState = (value: unknown): AnalysisViewState => {
  if (isAnalysisViewState(value)) {
    return {
      ...value,
      lastProcessedAdvisorRevision: null,
      pendingAdvisorRecommendation: null,
    }
  }
  if (isAnalysisViewBase(value)) {
    return {
      ...value,
      lastProcessedAdvisorRevision: null,
      pendingAdvisorRecommendation: null,
    }
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
  metadata: Pick<AnalysisViewTransitionResult, "blockedReason" | "advisorAction" | "advisorRecommendation"> = {},
): AnalysisViewTransitionResult => ({
  ...metadata,
  state,
  changed: (
    state.view !== current.view
    || state.pinned !== current.pinned
    || state.source !== current.source
    || state.explanation !== current.explanation
    || state.lastProcessedAdvisorRevision !== current.lastProcessedAdvisorRevision
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

  if (action.type === "advisor_recommendation") {
    const recommendation = action.recommendation
    const lastRevision = current.lastProcessedAdvisorRevision
    if (
      !Number.isFinite(recommendation.revision)
      || (
        lastRevision !== null
        && recommendation.revision <= lastRevision
      )
    ) {
      return unchanged(current)
    }

    const withRevision = {
      ...current,
      lastProcessedAdvisorRevision: recommendation.revision,
    }
    if (current.pinned) {
      return transitionResult(current, {
        ...withRevision,
        pendingAdvisorRecommendation: recommendation,
      }, {
        advisorAction: "pending",
        advisorRecommendation: recommendation,
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
      advisorRecommendation: recommendation,
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
