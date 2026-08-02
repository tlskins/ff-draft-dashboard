import {
  buildAnalysisViewQuery,
} from "../behavior/analysis/presets"
import {
  DEFAULT_ANALYSIS_VIEW_STATE,
  restoreAnalysisViewState,
  setAnalysisViewPinned,
  transitionAnalysisView,
  transitionAnalysisViewState,
} from "../behavior/analysis/viewState"


describe("analysis view state", () => {
  it("blocks advisor switching while preserving manual navigation", () => {
    const pinned = setAnalysisViewPinned(
      DEFAULT_ANALYSIS_VIEW_STATE,
      true,
    )
    const advisor = transitionAnalysisView(pinned, {
      view: "cross_position",
      source: "agent",
      explanation: "The preferred position changed.",
    })

    expect(advisor.changed).toBe(false)
    expect(advisor.state).toBe(pinned)
    expect(advisor.blockedReason).toBe(
      "The current analysis view is pinned",
    )

    const manual = transitionAnalysisView(pinned, {
      view: "intra_position",
      source: "manual",
      explanation: "Compare the two selected running backs.",
    })
    expect(manual.changed).toBe(true)
    expect(manual.state.view).toBe("intra_position")
    expect(manual.state.pinned).toBe(true)
  })

  it("applies each automatic advisor revision once and ignores stale advice", () => {
    const first = transitionAnalysisViewState(
      DEFAULT_ANALYSIS_VIEW_STATE,
      {
        type: "advisor_recommendation",
        recommendation: {
          view: "cross_position",
          explanation: "Compare roster-adjusted value now.",
          revision: 10,
        },
      },
    )
    expect(first.advisorAction).toBe("applied")
    expect(first.state.view).toBe("cross_position")
    expect(first.state.lastProcessedAdvisorRevision).toBe(10)

    const repeated = transitionAnalysisViewState(
      first.state,
      {
        type: "advisor_recommendation",
        recommendation: {
          view: "tier_landscape",
          explanation: "This stale revision must not replace the view.",
          revision: 10,
        },
      },
    )
    expect(repeated.changed).toBe(false)
    expect(repeated.state).toBe(first.state)

    const manual = transitionAnalysisViewState(first.state, {
      type: "manual_select",
      view: "intra_position",
      explanation: "Compare these two players.",
    })
    const staleAfterManual = transitionAnalysisViewState(manual.state, {
      type: "advisor_recommendation",
      recommendation: {
        view: "tier_landscape",
        explanation: "The old recommendation is no longer current.",
        revision: 10,
      },
    })
    expect(staleAfterManual.changed).toBe(false)
    expect(staleAfterManual.state.view).toBe("intra_position")

    const newer = transitionAnalysisViewState(manual.state, {
      type: "advisor_recommendation",
      recommendation: {
        view: "positional_bests",
        explanation: "Review the best available player at each position.",
        revision: 11,
      },
    })
    expect(newer.advisorAction).toBe("applied")
    expect(newer.state.view).toBe("positional_bests")
    expect(newer.state.explanation).toContain("best available")
  })

  it("keeps explanation-only advisor revisions from invalidating the view", () => {
    const initial = transitionAnalysisViewState(
      DEFAULT_ANALYSIS_VIEW_STATE,
      {
        type: "advisor_recommendation",
        recommendation: {
          view: "tier_landscape",
          explanation: "Monitor the tier landscape.",
          revision: 1,
        },
      },
    )
    const explanationOnly = transitionAnalysisViewState(
      initial.state,
      {
        type: "advisor_recommendation",
        recommendation: {
          view: "tier_landscape",
          explanation: "The tier landscape remains the useful context.",
          revision: 2,
        },
      },
    )
    expect(explanationOnly.changed).toBe(true)
    expect(explanationOnly.viewChanged).toBe(false)
    expect(explanationOnly.state.view).toBe("tier_landscape")
    expect(explanationOnly.state.explanation).toContain("remains")
  })

  it("queues only the newest pinned recommendation and adopts it manually", () => {
    const pinned = setAnalysisViewPinned(
      DEFAULT_ANALYSIS_VIEW_STATE,
      true,
    )
    const first = transitionAnalysisViewState(pinned, {
      type: "advisor_recommendation",
      recommendation: {
        view: "cross_position",
        explanation: "Compare positions before the pick.",
        revision: 20,
      },
    })
    const newest = transitionAnalysisViewState(first.state, {
      type: "advisor_recommendation",
      recommendation: {
        view: "positional_bests",
        explanation: "Review the best available options.",
        revision: 21,
      },
    })
    expect(newest.state.view).toBe("tier_landscape")
    expect(newest.state.pendingAdvisorRecommendation).toEqual({
      view: "positional_bests",
      explanation: "Review the best available options.",
      revision: 21,
    })

    const adopted = transitionAnalysisViewState(newest.state, {
      type: "adopt_pending_recommendation",
    })
    expect(adopted.advisorAction).toBe("adopted")
    expect(adopted.state.view).toBe("positional_bests")
    expect(adopted.state.pinned).toBe(true)
    expect(adopted.state.pendingAdvisorRecommendation).toBeNull()

    const repeated = transitionAnalysisViewState(adopted.state, {
      type: "advisor_recommendation",
      recommendation: {
        view: "positional_bests",
        explanation: "Review the best available options.",
        revision: 21,
      },
    })
    expect(repeated.changed).toBe(false)
  })

  it("applies the newest pending recommendation exactly once on return to automatic", () => {
    const pinned = setAnalysisViewPinned(
      DEFAULT_ANALYSIS_VIEW_STATE,
      true,
    )
    const pending = transitionAnalysisViewState(pinned, {
      type: "advisor_recommendation",
      recommendation: {
        view: "cross_position",
        explanation: "Compare roster-adjusted value.",
        revision: 30,
      },
    })
    const automatic = transitionAnalysisViewState(pending.state, {
      type: "set_pinned",
      pinned: false,
    })
    expect(automatic.advisorAction).toBe("applied")
    expect(automatic.state.view).toBe("cross_position")
    expect(automatic.state.pinned).toBe(false)
    expect(automatic.state.pendingAdvisorRecommendation).toBeNull()

    const repeated = transitionAnalysisViewState(automatic.state, {
      type: "set_pinned",
      pinned: false,
    })
    expect(repeated.changed).toBe(false)
  })

  it("falls back safely for invalid or legacy persisted state", () => {
    expect(restoreAnalysisViewState({
      view: "not-a-view",
      pinned: "yes",
    })).toEqual(DEFAULT_ANALYSIS_VIEW_STATE)
    expect(restoreAnalysisViewState({
      view: "cross_position",
      pinned: true,
      source: "manual",
      explanation: "A legacy saved view.",
    })).toMatchObject({
      view: "cross_position",
      pinned: true,
      lastProcessedAdvisorRevision: null,
      pendingAdvisorRecommendation: null,
    })
  })
})

describe("formal view query mappings", () => {
  const shared = {
    playerIds: ["rb-one", "rb-two"],
    crossPositionPlayerIds: ["qb-one", "rb-one", "wr-one", "te-one"],
    position: "RB" as const,
    seasonWindow: 3 as const,
    scoringProfile: "ppr" as const,
  }

  it("maps the four views to bounded deterministic queries", () => {
    const landscape = buildAnalysisViewQuery({
      ...shared,
      view: "tier_landscape",
    })
    const bests = buildAnalysisViewQuery({
      ...shared,
      view: "positional_bests",
    })
    const cross = buildAnalysisViewQuery({
      ...shared,
      view: "cross_position",
    })
    const intra = buildAnalysisViewQuery({
      ...shared,
      view: "intra_position",
    })

    expect(landscape.positions).toEqual(["RB"])
    expect(landscape.visualization.type).toBe("scatter")
    expect(bests.positions).toEqual(["RB"])
    expect(bests.visualization.type).toBe("bar")
    expect(cross.player_ids).toEqual(
      shared.crossPositionPlayerIds,
    )
    expect(cross.positions).toEqual([])
    expect(intra.player_ids).toEqual(shared.playerIds)
    expect(intra.group_by).toBe("season")
  })
})
