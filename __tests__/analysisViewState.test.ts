import {
  buildAnalysisViewQuery,
} from "../behavior/analysis/presets"
import {
  DEFAULT_ANALYSIS_VIEW_STATE,
  restoreAnalysisViewState,
  serializeAnalysisViewState,
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
      view: "tier_landscape",
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
          kind: "automatic",
          streamId: "draft-one",
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
          kind: "automatic",
          streamId: "draft-one",
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
        kind: "automatic",
        streamId: "draft-one",
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
        kind: "automatic",
        streamId: "draft-one",
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
          kind: "automatic",
          streamId: "draft-one",
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
          kind: "automatic",
          streamId: "draft-one",
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
        kind: "automatic",
        streamId: "draft-one",
        view: "cross_position",
        explanation: "Compare positions before the pick.",
        revision: 20,
      },
    })
    const newest = transitionAnalysisViewState(first.state, {
      type: "advisor_recommendation",
      recommendation: {
        kind: "automatic",
        streamId: "draft-one",
        view: "positional_bests",
        explanation: "Review the best available options.",
        revision: 21,
      },
    })
    expect(newest.state.view).toBe("cross_position")
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
        kind: "automatic",
        streamId: "draft-one",
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
        kind: "automatic",
        streamId: "draft-one",
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

  it("applies confirmed proposals manually, clears stale advice, and preserves pinning", () => {
    const pinned = setAnalysisViewPinned(
      DEFAULT_ANALYSIS_VIEW_STATE,
      true,
    )
    const pending = transitionAnalysisViewState(pinned, {
      type: "advisor_recommendation",
      recommendation: {
        kind: "automatic",
        streamId: "draft-one",
        view: "cross_position",
        explanation: "Older pending advice.",
        revision: 40,
      },
    })
    const confirmedEvent = {
      kind: "confirmed_manual" as const,
      streamId: "draft-one",
      eventId: "proposal-view-1",
      sequence: 1,
      view: "intra_position" as const,
      explanation: "The user confirmed a player comparison.",
      supersedesAutomaticRevision: 40,
    }
    const confirmed = transitionAnalysisViewState(pending.state, {
      type: "confirmed_manual_select",
      event: confirmedEvent,
    })

    expect(confirmed.confirmedManualAction).toBe("applied")
    expect(confirmed.state).toMatchObject({
      view: "intra_position",
      pinned: true,
      source: "manual",
      lastProcessedAdvisorRevision: 40,
      lastProcessedConfirmedManualSequence: 1,
      pendingAdvisorRecommendation: null,
    })

    const repeated = transitionAnalysisViewState(confirmed.state, {
      type: "confirmed_manual_select",
      event: confirmedEvent,
    })
    expect(repeated.changed).toBe(false)

    const supersededAutomatic = transitionAnalysisViewState(
      confirmed.state,
      {
        type: "advisor_recommendation",
        recommendation: {
          kind: "automatic",
          streamId: "draft-one",
          view: "tier_landscape",
          explanation: "Revision 40 cannot undo the confirmation.",
          revision: 40,
        },
      },
    )
    expect(supersededAutomatic.changed).toBe(false)

    const newerPinned = transitionAnalysisViewState(confirmed.state, {
      type: "advisor_recommendation",
      recommendation: {
        kind: "automatic",
        streamId: "draft-one",
        view: "positional_bests",
        explanation: "Newer advice remains pending while pinned.",
        revision: 41,
      },
    })
    expect(newerPinned.advisorAction).toBe("pending")
    expect(newerPinned.state.view).toBe("intra_position")
    expect(newerPinned.state.pendingAdvisorRecommendation?.revision).toBe(41)
  })

  it("lets a newer automatic revision resume after a confirmed manual event", () => {
    const confirmed = transitionAnalysisViewState(
      DEFAULT_ANALYSIS_VIEW_STATE,
      {
        type: "confirmed_manual_select",
        event: {
          kind: "confirmed_manual",
          streamId: "draft-one",
          eventId: "proposal-view-2",
          sequence: 1,
          view: "cross_position",
          explanation: "The user confirmed cross-position analysis.",
          supersedesAutomaticRevision: 8,
        },
      },
    )
    const newer = transitionAnalysisViewState(confirmed.state, {
      type: "advisor_recommendation",
      recommendation: {
        kind: "automatic",
        streamId: "draft-one",
        view: "positional_bests",
        explanation: "Revision 9 is live advice.",
        revision: 9,
      },
    })

    expect(newer.advisorAction).toBe("applied")
    expect(newer.state).toMatchObject({
      view: "positional_bests",
      source: "agent",
      lastProcessedAdvisorRevision: 9,
    })
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

  it("enforces the persisted schema while retaining schema-one and legacy bases", () => {
    const base = {
      view: "cross_position",
      pinned: true,
      source: "manual",
      explanation: "A saved view.",
    } as const

    expect(restoreAnalysisViewState({
      schemaVersion: 1,
      ...base,
    })).toMatchObject(base)
    expect(restoreAnalysisViewState(base)).toMatchObject(base)

    for (const schemaVersion of [
      2,
      999,
      "1",
      null,
      undefined,
      true,
      NaN,
      {},
      [],
      -1,
    ]) {
      expect(restoreAnalysisViewState({
        schemaVersion,
        ...base,
      })).toEqual(DEFAULT_ANALYSIS_VIEW_STATE)
    }
  })

  it("never restores runtime event identities or pending advice", () => {
    const persisted = {
      schemaVersion: 1,
      view: "cross_position" as const,
      pinned: true,
      source: "agent" as const,
      explanation: "Saved after automatic navigation.",
      lastProcessedEventStreamId: "draft-one",
      lastProcessedAdvisorRevision: 20,
      lastProcessedConfirmedManualSequence: 3,
      pendingAdvisorRecommendation: {
        view: "positional_bests" as const,
        explanation: "Runtime-only pending advice.",
        revision: 21,
      },
    }

    expect(restoreAnalysisViewState(persisted)).toEqual({
      view: "cross_position",
      pinned: true,
      source: "agent",
      explanation: "Saved after automatic navigation.",
      lastProcessedEventStreamId: null,
      lastProcessedAdvisorRevision: null,
      lastProcessedConfirmedManualSequence: null,
      pendingAdvisorRecommendation: null,
    })
    expect(serializeAnalysisViewState(persisted)).toEqual({
      schemaVersion: 1,
      view: "cross_position",
      pinned: true,
      source: "agent",
      explanation: "Saved after automatic navigation.",
    })
  })

  it.each([NaN, Infinity, -1, 1.5])(
    "rejects malformed runtime revision %p",
    invalidRevision => {
      expect(restoreAnalysisViewState({
        schemaVersion: 1,
        view: "cross_position",
        pinned: true,
        source: "agent",
        explanation: "Invalid runtime revision.",
        lastProcessedEventStreamId: "draft-one",
        lastProcessedAdvisorRevision: invalidRevision,
        lastProcessedConfirmedManualSequence: null,
        pendingAdvisorRecommendation: null,
      })).toEqual(DEFAULT_ANALYSIS_VIEW_STATE)
    },
  )
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
