export type AnalysisViewId =
  | "tier_landscape"
  | "positional_bests"
  | "cross_position"
  | "intra_position"

export type AnalysisViewSource = "manual" | "agent"

export interface AnalysisViewState {
  view: AnalysisViewId
  pinned: boolean
  source: AnalysisViewSource
  explanation: string
}

export interface AnalysisViewTransition {
  view: AnalysisViewId
  source: AnalysisViewSource
  explanation: string
}

export interface AnalysisViewTransitionResult {
  state: AnalysisViewState
  changed: boolean
  blockedReason?: string
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
  return (
    VIEW_IDS.includes(candidate.view as AnalysisViewId) &&
    typeof candidate.pinned === "boolean" &&
    ["manual", "agent"].includes(candidate.source || "") &&
    typeof candidate.explanation === "string"
  )
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
  }
}

export const setAnalysisViewPinned = (
  state: AnalysisViewState,
  pinned: boolean,
): AnalysisViewState => ({
  ...state,
  pinned,
})
