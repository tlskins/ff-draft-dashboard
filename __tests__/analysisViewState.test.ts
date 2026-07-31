import {
  buildAnalysisViewQuery,
} from "../behavior/analysis/presets"
import {
  DEFAULT_ANALYSIS_VIEW_STATE,
  setAnalysisViewPinned,
  transitionAnalysisView,
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
