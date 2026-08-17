import { createHash } from "node:crypto"
import React from "react"
import {
  act,
  fireEvent,
  render,
  within,
  waitFor,
} from "@testing-library/react"

import campaignJson from "../prospective-campaign/phase9-prospective-run-shadow.json"
import {
  executeHistoricalAnalysis,
} from "../behavior/api/historicalAnalysis"
import type {
  AnalysisQueryResponse,
} from "../behavior/api/historicalAnalysis"
import {
  loadHistoricalComparison,
} from "../behavior/api/historical"
import type {
  HistoricalComparisonResponse,
} from "../behavior/api/historical"
import {useDataReadiness} from "../behavior/api/dataReadiness"
import {completedDataReadinessState} from "../test-support/dataReadiness"
import {
  buildCrossPositionPresentationModel,
} from "../behavior/analysis/crossPosition"
import {
  buildIntraPositionPresentationModel,
} from "../behavior/analysis/intraPosition"
import {
  buildPositionalBestsPresentationModel,
} from "../behavior/analysis/positionalBests"
import {
  buildTierLandscapePresentationModel,
} from "../behavior/analysis/tierLandscape"
import {
  acknowledgeAnalysisViewEvent,
  arbitrateAnalysisViewEventsByLayout,
  createAnalysisViewEventArbitrationState,
  queueConfirmedAnalysisViewEvent,
} from "../behavior/analysis/viewEventArbitration"
import {
  DEFAULT_ANALYSIS_VIEW_STATE,
  transitionAnalysisViewState,
} from "../behavior/analysis/viewState"
import type {
  AnalysisViewId,
  AutomaticAnalysisViewEvent,
} from "../behavior/analysis/viewState"
import {
  PHASE9_POLICY_FINGERPRINT,
  runProspectiveRunShadowCampaign,
} from "../behavior/draft-advisor/prospectiveRunShadow"
import type {
  ProspectiveCampaignManifest,
} from "../behavior/draft-advisor/prospectiveRunShadow"
import type {
  DraftRecommendationCandidate,
  DraftRecommendationSet,
} from "../behavior/draft-advisor/recommendations"
import AnalysisWorkspace from "../test-support/TestAnalysisWorkspace"
import CrossPositionLiveSurface from "../components/analysis/CrossPositionLiveSurface"
import IntraPositionLiveSurface from "../components/analysis/IntraPositionLiveSurface"
import PositionalBestsLiveSurface from "../components/analysis/PositionalBestsLiveSurface"
import TierLandscapeLiveSurface from "../components/analysis/TierLandscapeLiveSurface"
import {
  BoardSettings,
  DataRanker,
  FantasyPosition,
  FantasySettings,
  NFLTeam,
  Player,
  PlayerRanking,
  RankingSummary,
  ThirdPartyADPRanker,
  ThirdPartyRanker,
  Tier,
} from "../types"

jest.mock("../behavior/api/historicalAnalysis", () => ({
  ...jest.requireActual("../behavior/api/historicalAnalysis"),
  executeHistoricalAnalysis: jest.fn(),
}))
jest.mock("../behavior/api/dataReadiness", () => ({
  ...jest.requireActual("../behavior/api/dataReadiness"),
  useDataReadiness: jest.fn(),
}))

jest.mocked(useDataReadiness).mockReturnValue(completedDataReadinessState)
jest.mock("../behavior/api/historical", () => ({
  ...jest.requireActual("../behavior/api/historical"),
  loadHistoricalComparison: jest.fn(),
}))

const mockedExecute = jest.mocked(executeHistoricalAnalysis)
const mockedLoadHistoricalComparison = jest.mocked(loadHistoricalComparison)

const settings: FantasySettings = {
  ppr: true,
  numTeams: 12,
  numStartingQbs: 1,
  numStartingRbs: 2,
  numStartingWrs: 2,
  numStartingTes: 1,
  numFlex: 1,
  numBenchPlayers: 6,
}

const boardSettings: BoardSettings = {
  ranker: ThirdPartyRanker.HARRIS,
  adpRanker: ThirdPartyADPRanker.ESPN,
}

const tier = (
  tierNumber: number,
  rank: number,
  upper = 22 - rank,
  lower = 12 - rank,
): Tier => ({
  tierNumber,
  upperLimitPlayerIdx: rank - 1,
  lowerLimitPlayerIdx: rank - 1,
  upperLimitValue: upper,
  lowerLimitValue: lower,
})

const ranking = (
  id: string,
  ranker: ThirdPartyRanker,
  position: FantasyPosition,
  rank: number,
  tierNumber: number,
): PlayerRanking => ({
  playerId: id,
  ranker,
  position,
  pprPositionRank: rank,
  standardPositionRank: rank,
  pprPositionTier: tier(tierNumber, rank),
  standardPositionTier: tier(tierNumber, rank),
})

const player = (
  id: string,
  fullName: string,
  position: FantasyPosition,
  activeRank: number,
  customRank = activeRank,
  customTier = Math.ceil(customRank / 2),
): Player => ({
  id,
  firstName: fullName.split(" ")[0],
  lastName: fullName.split(" ").slice(1).join(" "),
  fullName,
  position,
  team: NFLTeam.BUF,
  ranks: {
    [ThirdPartyRanker.HARRIS]: ranking(
      id,
      ThirdPartyRanker.HARRIS,
      position,
      activeRank,
      Math.ceil(activeRank / 2),
    ),
    [ThirdPartyRanker.CUSTOM]: ranking(
      id,
      ThirdPartyRanker.CUSTOM,
      position,
      customRank,
      customTier,
    ),
  },
})

const players = [
  player("qb-one", "Quinn Quarterback", FantasyPosition.QUARTERBACK, 1),
  player("qb-two", "Casey Quarterback", FantasyPosition.QUARTERBACK, 2),
  player("rb-one", "Alpha Runner", FantasyPosition.RUNNING_BACK, 1, 2, 1),
  player("rb-two", "Bravo Runner", FantasyPosition.RUNNING_BACK, 2, 1, 1),
  player("rb-three", "Charlie Runner", FantasyPosition.RUNNING_BACK, 3),
  player("rb-four", "Delta Runner", FantasyPosition.RUNNING_BACK, 4),
  player("wr-one", "Will Receiver", FantasyPosition.WIDE_RECEIVER, 1),
  player("wr-two", "Riley Receiver", FantasyPosition.WIDE_RECEIVER, 2),
  player("te-one", "Taylor End", FantasyPosition.TIGHT_END, 1),
  player("te-two", "Morgan End", FantasyPosition.TIGHT_END, 2),
]

const projectionSummary: RankingSummary = {
  ranker: DataRanker.LAST_SSN_PPG,
  ppr: true,
  replacementLevels: {
    QB: [12, 8],
    RB: [24, 8],
    WR: [24, 8],
    TE: [12, 6],
    DST: [1, 0],
    K: [1, 0],
    "": [1, 0],
  },
  stdDevs: {QB: 2, RB: 2, WR: 2, TE: 2, DST: 0, K: 0, "": 0},
  tiers: {
    QB: Array.from({length: 12}, (_, index) => tier(1, index + 1)),
    RB: Array.from({length: 24}, (_, index) => tier(1, index + 1)),
    WR: Array.from({length: 24}, (_, index) => tier(1, index + 1)),
    TE: Array.from({length: 12}, (_, index) => tier(1, index + 1)),
    DST: [],
    K: [],
    "": [],
  },
}

const candidate = (
  selectedPlayer: Player,
  score: number,
  overrides: Partial<DraftRecommendationCandidate["evidence"]> = {},
): DraftRecommendationCandidate => ({
  player: selectedPlayer,
  positionRank: selectedPlayer.ranks[ThirdPartyRanker.HARRIS]
    ?.pprPositionRank || 1,
  score,
  evidence: {
    projectedFloor: 10,
    projectedMedian: 15,
    projectedCeiling: 20,
    replacementLevel: 8,
    pointsAboveReplacement: 7,
    marginalLineupPoints: 4,
    benchUtility: 0,
    tierLossIfDeferred: 2.5,
    survivalProbability: 0.4,
    positionalRunProbability: 0.2,
    tierBoundaryProbability: 0.3,
    userTier: 1,
    projectionTier: 2,
    rosterRole: "open_starter",
    flags: [],
    ...overrides,
  },
})

const recommendationCandidates = [
  candidate(players[6], 12),
  candidate(players[2], 11),
  candidate(players[0], 10),
]

const recommendations = (
  supplied = recommendationCandidates,
): DraftRecommendationSet => ({
  schemaVersion: 1,
  currentPick: 6,
  nextUserPick: 8,
  preferredView: "cross_position",
  viewExplanation: "Compare the supplied roster-adjusted candidates.",
  candidates: supplied,
})

const historicalResponse: AnalysisQueryResponse = {
  query: {
    player_ids: ["rb-one", "rb-two"],
    positions: [],
    seasons: {start: 2023, end: 2025},
    scoring_profile_id: "ppr",
    metrics: [
      "games",
      "fantasy_points_mean",
      "fantasy_points_p10",
      "fantasy_points_p50",
      "fantasy_points_p90",
      "fantasy_points_std_dev",
    ],
    group_by: "season",
    filters: [],
    sort: {field: "season", direction: "asc"},
    limit: 100,
    visualization: {
      type: "line",
      x: "season",
      y: "fantasy_points_mean",
      color: "player_name",
    },
  },
  scoring_profile: {id: "ppr", weights: {}},
  sources: [{
    id: "source",
    provider: "nflverse",
    dataset: "stats_player_week",
    sha256: "abc",
    retrieved_at: "2026-08-10T00:00:00Z",
    schema_version: 1,
  }],
  columns: {
    dimensions: ["player_id", "player_name", "position", "season"],
    metrics: [
      "games",
      "fantasy_points_mean",
      "fantasy_points_p10",
      "fantasy_points_p50",
      "fantasy_points_p90",
      "fantasy_points_std_dev",
    ],
  },
  visualization: {
    type: "line",
    x: "season",
    y: "fantasy_points_mean",
    color: "player_name",
  },
  row_count: 2,
  truncated: false,
  rows: [
    {
      dimensions: {
        player_id: "rb-one",
        player_name: "Alpha Runner",
        position: "RB",
        season: 2025,
      },
      metrics: {
        games: 17,
        fantasy_points_mean: 18,
        fantasy_points_p10: 8,
        fantasy_points_p50: 17,
        fantasy_points_p90: 27,
        fantasy_points_std_dev: 5,
      },
    },
    {
      dimensions: {
        player_id: "rb-two",
        player_name: "Bravo Runner",
        position: "RB",
        season: 2025,
      },
      metrics: {
        games: 17,
        fantasy_points_mean: 16,
        fantasy_points_p10: 7,
        fantasy_points_p50: 15,
        fantasy_points_p90: 25,
        fantasy_points_std_dev: 4,
      },
    },
  ],
}

const playerLabResponse: HistoricalComparisonResponse = {
  season: 2025,
  seasons: [2025],
  source: historicalResponse.sources[0],
  sources: historicalResponse.sources,
  scoring_profile: {id: "ppr", weights: {}},
  identity_miss_count: 0,
  players: players.slice(2, 5).map((selectedPlayer, index) => ({
    player_id: selectedPlayer.id,
    player_name: selectedPlayer.fullName,
    position: "RB",
    distribution: {
      games: 17,
      mean: 15 + index,
      median: 15 + index,
      std_dev: 4,
      minimum: 3,
      p10: 6,
      p25: 10,
      p50: 15,
      p75: 19,
      p90: 24,
      maximum: 30,
    },
    season_distributions: [],
    weeks: [1, 2, 3].map(week => ({
      season: 2025,
      week,
      team: "BUF",
      opponent: "MIA",
      points: 10 + week + index,
      contributions: {},
    })),
  })),
}

const availablePlayers = [...players]
const workspaceProps = {
  activePlayer: players[2],
  availablePlayers,
  boardSettings,
  players,
  rankingSummaries: [projectionSummary],
  recommendations: recommendations(),
  settings,
}

const viewCases: Array<{
  id: AnalysisViewId
  button: string
  heading: string
  source: RegExp
  historical: string
}> = [
  {
    id: "tier_landscape",
    button: "Position tiers",
    heading: "Where will each tier run out?",
    source: /Choose a position to see every available player/,
    historical: "Historical positional tier drilldown",
  },
  {
    id: "cross_position",
    button: "Decision cockpit",
    heading: "Decision cockpit",
    source: /Compare the best available QB, RB, WR, and TE now/,
    historical: "Historical cross-position drilldown",
  },
  {
    id: "intra_position",
    button: "Player lab",
    heading: "How different are their weekly outcomes?",
    source: /Use the shared maximum-three comparison set, then/,
    historical: "Current-board projection context",
  },
]

describe("Phase 10F cross-view acceptance gate", () => {
  beforeEach(() => {
    localStorage.clear()
    mockedExecute.mockReset()
    mockedExecute.mockResolvedValue(historicalResponse)
    mockedLoadHistoricalComparison.mockReset()
    mockedLoadHistoricalComparison.mockResolvedValue(playerLabResponse)
  })

  it("lands the approved cockpit, position-tier, and player-lab interaction model", () => {
    const view = render(<AnalysisWorkspace {...workspaceProps} />)

    expect(view.getByRole("button", {name: "Decision cockpit"})
      .getAttribute("aria-pressed")).toBe("true")
    expect(view.getByText("Why now"))
      .toBeTruthy()
    const comparisonTable = view.getByRole("table", {
      name: "Cross-position decision matrix",
    })
    expect(within(comparisonTable).getAllByRole("row")).toHaveLength(5)
    expect(within(comparisonTable).getAllByRole("columnheader")).toHaveLength(5)
    expect(within(comparisonTable).getAllByRole("rowheader")).toHaveLength(4)
    expect(within(comparisonTable).getAllByRole("cell")).toHaveLength(16)
    expect(within(comparisonTable).getByRole("rowheader", {
      name: /Alpha Runner/,
    })).toBeTruthy()

    fireEvent.click(view.getByRole("button", {name: "Position tiers"}))
    fireEvent.click(view.getByRole("button", {name: /RB 4 tiered/}))
    expect(view.getAllByRole("button", {name: /Inspect .* Runner$/}))
      .toHaveLength(4)
    expect(view.getByRole("img", {
      name: /Alpha Runner: floor 11.0, median 16.0, ceiling 21.0/,
    })).toBeTruthy()

    fireEvent.click(view.getByRole("button", {name: "Player lab"}))
    expect(view.getByRole("group", {name: "Shared Player Lab set · 3/3"})).toBeTruthy()
  })

  it("highlights the preferred deterministic position without inventing a scenario", async () => {
    const preferredRunner = recommendations([
      candidate(players[3], 20),
      candidate(players[6], 19),
    ])
    const view = render(
      <AnalysisWorkspace
        {...workspaceProps}
        recommendations={preferredRunner}
      />,
    )
    const matrix = view.getByRole("table", {name: "Cross-position decision matrix"})
    expect(within(matrix).getByRole("rowheader", {name: /RB Bravo Runner.*Lean now/}))
      .toBeTruthy()

    view.rerender(
      <AnalysisWorkspace
        {...workspaceProps}
        recommendations={recommendations([
          candidate(players[7], 21),
          candidate(players[2], 18),
        ])}
      />,
    )
    await waitFor(() => expect(within(matrix).getByRole("rowheader", {
      name: /WR Riley Receiver.*Lean now/,
    })).toBeTruthy())

    view.rerender(
      <AnalysisWorkspace
        {...workspaceProps}
        availablePlayers={availablePlayers.filter(player => (
          player.position !== FantasyPosition.RUNNING_BACK
        ))}
        recommendations={preferredRunner}
      />,
    )
    await waitFor(() => expect(within(matrix).queryByText("Lean now")).toBeNull())
  })

  it("opens the historical drawer from the visible Player Lab and restores keyboard focus", async () => {
    const view = render(<AnalysisWorkspace {...workspaceProps} />)
    fireEvent.click(view.getByRole("button", {name: "Player lab"}))
    fireEvent.click(view.getByRole("button", {name: "Run analysis"}))

    const inspect = await view.findByRole("button", {
      name: "Inspect Alpha Runner from season chart",
    })
    inspect.focus()
    fireEvent.keyDown(inspect, {key: "Enter"})
    const close = await view.findByRole("button", {
      name: "Close player comparison",
    })
    await waitFor(() => expect(document.activeElement).toBe(close))
    fireEvent.keyDown(view.getByRole("dialog"), {key: "Escape"})
    await waitFor(() => expect(view.queryByRole("dialog")).toBeNull())
    expect(document.activeElement).toBe(inspect)

    fireEvent.keyDown(inspect, {key: " "})
    await waitFor(() => expect(view.getByRole("dialog")).toBeTruthy())
    fireEvent.click(view.getByRole("button", {
      name: "Close player comparison",
    }))
    await waitFor(() => expect(document.activeElement).toBe(inspect))
  })

  it("enforces the shared maximum-three Player Lab selection boundary", () => {
    const view = render(<AnalysisWorkspace {...workspaceProps} />)
    fireEvent.click(view.getByRole("button", {name: "Player lab"}))

    expect(view.getByRole("group", {
      name: "Shared Player Lab set · 3/3",
    })).toBeTruthy()
    expect((view.getByRole("button", {
      name: "Run analysis",
    }) as HTMLButtonElement).disabled).toBe(false)

    view.unmount()
    const twoPlayers = players.filter(player => (
      ["rb-one", "rb-two"].includes(player.id)
    ))
    const undersized = render(
      <AnalysisWorkspace
        {...workspaceProps}
        availablePlayers={twoPlayers}
        comparisonController={{
          mode: "auto",
          items: twoPlayers.map(player => ({player, reasonCode: "top_position", reasonLabel: "Top RB"})),
          announcement: "",
          pinCurrent: jest.fn(), restoreAuto: jest.fn(), addPinnedPlayer: jest.fn(), removePinnedPlayer: jest.fn(),
        }}
        players={twoPlayers}
      />,
    )
    fireEvent.click(undersized.getByRole("button", {name: "Player lab"}))
    expect(undersized.getByRole("group", {
      name: "Shared Player Lab set · 2/3",
    })).toBeTruthy()
    expect((undersized.getByRole("button", {
      name: "Run analysis",
    }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("uses the Position Tiers alias for applied, pending, and equivalent advisor events", async () => {
    const props = {
      ...workspaceProps,
      analysisViewEvent: {
        kind: "automatic" as const,
        streamId: "phase-10g-alias",
        view: "positional_bests" as const,
        explanation: "Review the position supply.",
        revision: 1,
      },
    }
    const view = render(<AnalysisWorkspace {...props} />)
    const advisorStatus = () => Array.from(
      view.container.querySelectorAll("[aria-live='polite']"),
    ).find(region => region.textContent?.includes("Advisor selected"))

    await waitFor(() => expect(advisorStatus()?.textContent).toContain(
      "Advisor selected Position Tiers. Review the position supply.",
    ))
    expect(view.container.textContent).not.toContain("Realtime positional bests")
    expect(view.getByRole("button", {name: "Position tiers"})
      .getAttribute("aria-pressed")).toBe("true")

    fireEvent.click(view.getByRole("button", {name: "Decision cockpit"}))
    fireEvent.click(view.getByRole("button", {name: "Pin current view"}))
    view.rerender(
      <AnalysisWorkspace
        {...workspaceProps}
        analysisViewEvent={{
          ...props.analysisViewEvent,
          explanation: "Position Tiers should remain pending.",
          revision: 2,
        }}
      />,
    )
    await waitFor(() => expect(view.getByText(
      /Advisor recommends Position Tiers.*Position Tiers should remain pending/,
    )).toBeTruthy())
    const pendingAnnouncement = Array.from(
      view.container.querySelectorAll("[aria-live='polite']"),
    ).find(region => region.textContent?.includes("Your pinned view was preserved"))
      ?.textContent

    view.rerender(
      <AnalysisWorkspace
        {...workspaceProps}
        analysisViewEvent={{
          ...props.analysisViewEvent,
          explanation: "Position Tiers should remain pending.",
          revision: 2,
        }}
      />,
    )
    expect(Array.from(
      view.container.querySelectorAll("[aria-live='polite']"),
    ).find(region => region.textContent?.includes("Your pinned view was preserved"))
      ?.textContent).toBe(pendingAnnouncement)
    expect(view.container.textContent).not.toContain("Realtime positional bests")

    fireEvent.click(view.getByRole("button", {
      name: "Return to automatic navigation",
    }))
    await waitFor(() => expect(Array.from(
      view.container.querySelectorAll("[aria-live='polite']"),
    ).some(region => region.textContent?.includes(
      "Applying the pending advisor recommendation for Position Tiers.",
    ))).toBe(true))
  })

  it("selects all three consolidated workspaces accessibly and retains the manual history boundary", () => {
    const view = render(<AnalysisWorkspace {...workspaceProps} />)

    viewCases.forEach(({button, heading, source, historical}) => {
      const control = view.getByRole("button", {name: button})
      fireEvent.click(control)
      expect(control.getAttribute("aria-pressed")).toBe("true")
      viewCases.filter(item => item.button !== button).forEach(other => {
        expect(view.getByRole("button", {name: other.button})
          .getAttribute("aria-pressed")).toBe("false")
      })
      expect(view.getByText(heading, {selector: "h2"})).toBeTruthy()
      expect(view.getByText(source)).toBeTruthy()
      expect(view.getByText(historical)).toBeTruthy()
      expect(view.getByRole("button", {name: "Run analysis"})).toBeTruthy()
      expect(mockedExecute).not.toHaveBeenCalled()
    })

    expect(view.getByLabelText("Analysis season window").textContent)
      .toContain("2021–2025")
    expect(view.getByLabelText("Analysis scoring profile").textContent)
      .toContain("Half PPR")
  })

  it("clears incompatible result, error, loading, and drawer state and ignores a prior view's in-flight response", async () => {
    let resolveRequest!: (response: AnalysisQueryResponse) => void
    mockedExecute.mockImplementationOnce(() => new Promise(resolve => {
      resolveRequest = resolve
    }))
    const view = render(<AnalysisWorkspace {...workspaceProps} />)
    fireEvent.click(view.getByRole("button", {name: "Position tiers"}))
    fireEvent.click(view.getByRole("button", {name: /RB 4 tiered/}))
    const landscapeInspect = view.getByRole("button", {
      name: "Inspect Alpha Runner",
    })
    fireEvent.click(landscapeInspect)
    expect(view.getByRole("dialog")).toBeTruthy()
    fireEvent.click(view.getByRole("button", {name: "Run analysis"}))
    expect(view.getByRole("button", {name: "Running analysis…"})).toBeTruthy()

    fireEvent.click(view.getByRole("button", {name: "Decision cockpit"}))
    expect(view.queryByRole("dialog")).toBeNull()
    expect(view.queryByRole("button", {name: "Running analysis…"})).toBeNull()
    expect(view.container.querySelector("svg")).toBeNull()

    await act(async () => resolveRequest(historicalResponse))
    expect(view.container.querySelector("svg")).toBeNull()

    mockedExecute.mockRejectedValueOnce(new Error("bounded history error"))
    fireEvent.click(view.getByRole("button", {name: "Run analysis"}))
    await waitFor(() => expect(view.getByText(/bounded history error/)).toBeTruthy())
    fireEvent.click(view.getByRole("button", {name: "Player lab"}))
    expect(view.queryByText(/bounded history error/)).toBeNull()
  })

  it("preserves compatible history for a same-view explanation revision and keeps acknowledgements idempotent", async () => {
    const onHandled = jest.fn()
    const view = render(
      <AnalysisWorkspace {...workspaceProps} onAnalysisViewEventHandled={onHandled} />,
    )
    fireEvent.click(view.getByRole("button", {name: "Position tiers"}))
    fireEvent.click(view.getByRole("button", {name: "Run analysis"}))
    await waitFor(() => expect(view.container.querySelector("svg")).not.toBeNull())

    const event: AutomaticAnalysisViewEvent = {
      kind: "automatic",
      streamId: "draft-phase-10f",
      view: "tier_landscape",
      explanation: "The same live tier context remains useful.",
      revision: 7,
    }
    view.rerender(
      <AnalysisWorkspace
        {...workspaceProps}
        analysisViewEvent={event}
        onAnalysisViewEventHandled={onHandled}
      />,
    )
    await waitFor(() => expect(view.getAllByText(
      /The same live tier context remains useful/,
    )).toHaveLength(2))
    expect(view.container.querySelector("svg")).not.toBeNull()
    expect(onHandled).toHaveBeenCalledTimes(1)

    view.rerender(
      <AnalysisWorkspace
        {...workspaceProps}
        analysisViewEvent={event}
        onAnalysisViewEventHandled={onHandled}
      />,
    )
    expect(onHandled).toHaveBeenCalledTimes(1)
  })

  it("honors automatic, pinned, newest-pending, review, unpin, and confirmed-manual semantics", () => {
    const automatic = transitionAnalysisViewState(
      DEFAULT_ANALYSIS_VIEW_STATE,
      {
        type: "advisor_recommendation",
        recommendation: {
          kind: "automatic",
          streamId: "draft-phase-10f",
          view: "cross_position",
          explanation: "Compare roster-adjusted value before the pick.",
          revision: 1,
        },
      },
    )
    expect(automatic.state).toMatchObject({
      view: "cross_position",
      source: "agent",
      explanation: "Compare roster-adjusted value before the pick.",
    })

    const pinned = transitionAnalysisViewState(automatic.state, {
      type: "set_pinned",
      pinned: true,
    })
    const firstPending = transitionAnalysisViewState(pinned.state, {
      type: "advisor_recommendation",
      recommendation: {
        kind: "automatic",
        streamId: "draft-phase-10f",
        view: "tier_landscape",
        explanation: "First pending view.",
        revision: 2,
      },
    })
    const newestPending = transitionAnalysisViewState(firstPending.state, {
      type: "advisor_recommendation",
      recommendation: {
        kind: "automatic",
        streamId: "draft-phase-10f",
        view: "positional_bests",
        explanation: "Newest pending view.",
        revision: 3,
      },
    })
    expect(newestPending.state).toMatchObject({
      view: "cross_position",
      pinned: true,
      pendingAdvisorRecommendation: {
        view: "positional_bests",
        revision: 3,
      },
    })

    const reviewed = transitionAnalysisViewState(newestPending.state, {
      type: "adopt_pending_recommendation",
    })
    expect(reviewed.state).toMatchObject({
      view: "positional_bests",
      pinned: true,
      source: "manual",
      pendingAdvisorRecommendation: null,
    })

    const anotherPending = transitionAnalysisViewState(reviewed.state, {
      type: "advisor_recommendation",
      recommendation: {
        kind: "automatic",
        streamId: "draft-phase-10f",
        view: "tier_landscape",
        explanation: "Apply once after returning to automatic.",
        revision: 4,
      },
    })
    const unpinned = transitionAnalysisViewState(anotherPending.state, {
      type: "set_pinned",
      pinned: false,
    })
    expect(unpinned).toMatchObject({
      advisorAction: "applied",
      state: {
        view: "tier_landscape",
        pinned: false,
        pendingAdvisorRecommendation: null,
      },
    })
    expect(transitionAnalysisViewState(unpinned.state, {
      type: "set_pinned",
      pinned: false,
    }).changed).toBe(false)

    const repinned = transitionAnalysisViewState(unpinned.state, {
      type: "set_pinned",
      pinned: true,
    })
    const confirmed = transitionAnalysisViewState(repinned.state, {
      type: "confirmed_manual_select",
      event: {
        kind: "confirmed_manual",
        streamId: "draft-phase-10f",
        eventId: "confirmed-view",
        sequence: 1,
        view: "intra_position",
        explanation: "The user confirmed this same-position comparison.",
        supersedesAutomaticRevision: 4,
      },
    })
    expect(confirmed.state).toMatchObject({
      view: "intra_position",
      pinned: true,
      source: "manual",
    })
    const stale = transitionAnalysisViewState(confirmed.state, {
      type: "advisor_recommendation",
      recommendation: {
        kind: "automatic",
        streamId: "draft-phase-10f",
        view: "cross_position",
        explanation: "Superseded automatic advice.",
        revision: 4,
      },
    })
    expect(stale.changed).toBe(false)
    expect(transitionAnalysisViewState(confirmed.state, {
      type: "confirmed_manual_select",
      event: {
        kind: "confirmed_manual",
        streamId: "draft-phase-10f",
        eventId: "confirmed-view",
        sequence: 1,
        view: "intra_position",
        explanation: "Duplicate confirmation.",
        supersedesAutomaticRevision: 4,
      },
    }).changed).toBe(false)
  })

  it("resolves one equivalent desktop/mobile event and acknowledges confirmed advice exactly once", () => {
    const automatic: AutomaticAnalysisViewEvent = {
      kind: "automatic",
      streamId: "draft-phase-10f",
      view: "cross_position",
      explanation: "Shared desktop and mobile explanation.",
      revision: 9,
    }
    const initial = createAnalysisViewEventArbitrationState("draft-phase-10f")
    const layouts = arbitrateAnalysisViewEventsByLayout(initial, automatic)
    expect(layouts.desktop).toBe(layouts.mobile)

    const afterAutomatic = acknowledgeAnalysisViewEvent(initial, automatic)
    const queued = queueConfirmedAnalysisViewEvent(
      afterAutomatic,
      "draft-phase-10f",
      {
        eventId: "proposal-phase-10f",
        view: "intra_position",
        explanation: "Confirmed manual view.",
        supersedesAutomaticRevision: 9,
      },
    )
    const confirmedLayouts = arbitrateAnalysisViewEventsByLayout(
      queued,
      automatic,
    )
    expect(confirmedLayouts.desktop).toBe(confirmedLayouts.mobile)
    const acknowledged = acknowledgeAnalysisViewEvent(
      queued,
      confirmedLayouts.desktop!,
    )
    expect(acknowledgeAnalysisViewEvent(
      acknowledged,
      confirmedLayouts.mobile!,
    )).toBe(acknowledged)
    expect(arbitrateAnalysisViewEventsByLayout(
      acknowledged,
      automatic,
    )).toEqual({desktop: null, mobile: null})

    const pair = render(
      <div>
        <AnalysisWorkspace {...workspaceProps} analysisViewEvent={automatic} />
        <AnalysisWorkspace {...workspaceProps} analysisViewEvent={automatic} />
      </div>,
    )
    expect(pair.getAllByRole("button", {name: "Decision cockpit"})
      .every(button => button.getAttribute("aria-pressed") === "true"))
      .toBe(true)
    expect(pair.getAllByRole("list", {
      name: "Deterministic cross-position recommendation candidates",
    })).toHaveLength(2)
  })

  it("preserves the four distinct ownership models, tier authority, safe ranges, and supplied probability boundaries", () => {
    const supplied = [
      recommendationCandidates[2],
      recommendationCandidates[0],
      recommendationCandidates[1],
    ]
    const positional = buildPositionalBestsPresentationModel({
      recommendations: recommendations(supplied),
      boardSettings,
      settings,
    })
    const cross = buildCrossPositionPresentationModel({
      recommendations: recommendations(supplied),
      boardSettings,
      settings,
    })
    const intra = buildIntraPositionPresentationModel({
      position: FantasyPosition.RUNNING_BACK,
      availablePlayers,
      boardSettings,
      settings,
      rankingSummaries: [projectionSummary],
    })
    const landscape = buildTierLandscapePresentationModel({
      availablePlayers: availablePlayers.filter(item => item.id !== "rb-one"),
      recommendations: recommendations(supplied),
      opponentForecast: {
        schemaVersion: 1,
        model: "combined",
        targetRosterIndex: 0,
        picks: [],
        runProbabilities: [{
          position: FantasyPosition.RUNNING_BACK,
          minimumPicks: 2,
          probability: Number.NaN,
        }],
        tierBoundaryProbabilities: [],
      },
      boardSettings,
      settings,
      rankingSummaries: [projectionSummary],
    })

    expect(positional.candidates.map(item => item.player.id)).toEqual([
      "qb-one", "wr-one", "rb-one",
    ])
    expect(cross.candidates.map(item => item.player.id)).toEqual([
      "qb-one", "wr-one", "rb-one",
    ])
    expect(intra.players.map(item => item.player.id)).toEqual([
      "rb-one", "rb-two", "rb-three", "rb-four",
    ])
    expect(landscape.lanes.flatMap(lane => lane.visibleTierBands)
      .flatMap(band => band.players)
      .map(item => item.player.id)).not.toContain("rb-one")
    expect(landscape.lanes.find(lane => lane.position === "RB")?.run)
      .toEqual({probability: null, minimumPicks: 2})

    const malformedCandidate = candidate(players[0], Number.NaN, {
      projectedFloor: Number.NaN,
      projectedMedian: Number.POSITIVE_INFINITY,
      projectedCeiling: Number.NEGATIVE_INFINITY,
      survivalProbability: 2,
      positionalRunProbability: -1,
      tierBoundaryProbability: Number.NaN,
    })
    const malformedCross = buildCrossPositionPresentationModel({
      recommendations: recommendations([malformedCandidate]),
      boardSettings,
      settings,
    })
    expect(malformedCross.candidates[0]).toMatchObject({
      advisorScore: null,
      projection: {floor: null, median: null, ceiling: null},
      metricValues: {
        survivalProbability: null,
        positionalRunProbability: null,
        tierBoundaryProbability: null,
      },
    })
    expect(intra.players.every(item => (
      item.projection.startPercent === null
      || item.projection.startPercent >= 0
      && item.projection.endPercent !== null
      && item.projection.endPercent <= 100
    ))).toBe(true)
  })

  it("keeps recommendation labels out of the live shortlist and presents custom tiers above projection overlays", () => {
    const positionalModel = buildPositionalBestsPresentationModel({
      recommendations: recommendations(),
      boardSettings,
      settings,
    })
    const crossModel = buildCrossPositionPresentationModel({
      recommendations: recommendations(),
      boardSettings,
      settings,
    })
    const intraModel = buildIntraPositionPresentationModel({
      position: FantasyPosition.RUNNING_BACK,
      availablePlayers,
      boardSettings,
      settings,
      rankingSummaries: [projectionSummary],
    })
    const landscapeModel = buildTierLandscapePresentationModel({
      availablePlayers,
      recommendations: recommendations(),
      boardSettings,
      settings,
      rankingSummaries: [projectionSummary],
    })
    const view = render(
      <div style={{width: 360}}>
        <PositionalBestsLiveSurface model={positionalModel} onInspectPlayer={jest.fn()} />
        <CrossPositionLiveSurface model={crossModel} onInspectPlayer={jest.fn()} />
        <IntraPositionLiveSurface model={intraModel} onInspectPlayer={jest.fn()} />
        <TierLandscapeLiveSurface model={landscapeModel} onInspectPlayer={jest.fn()} />
      </div>,
    )

    expect(view.getAllByText("Preferred candidate")).toHaveLength(2)
    expect(view.getAllByText("Fallback 1")).toHaveLength(2)
    const shortlist = view.getByRole("list", {
      name: "Currently available RB live shortlist",
    })
    expect(shortlist.textContent).not.toMatch(/preferred|fallback/i)
    expect(shortlist.textContent).toContain("Shortlist order 1")
    expect(shortlist.textContent).toContain("Custom user tier")
    expect(shortlist.textContent).toContain("Projection tier · overlay only")
    expect(view.getAllByText(/Custom user tier/).length).toBeGreaterThan(0)
    expect(view.getAllByText(/Projection tier · overlay only/).length)
      .toBeGreaterThan(0)
    view.getByRole("region", {name: "Decision cockpit"})
      .querySelectorAll("h3")
      .forEach(heading => {
        expect(heading.className).toContain("break-words")
        expect(heading.className).not.toContain("truncate")
      })
    expect(view.container.querySelectorAll(".min-w-0").length)
      .toBeGreaterThan(0)
    expect(view.container.textContent).not.toMatch(
      /bye-week concentration|handcuff flag|roster synergy score|injury diagnosis/i,
    )
  })

  it("keeps live inspection keyboard-operable, restores drawer focus, and retains historical chart inspection", async () => {
    const view = render(<AnalysisWorkspace {...workspaceProps} />)
    fireEvent.click(view.getByRole("button", {name: "Player lab"}))
    const inspect = view.getByRole("button", {
      name: "Inspect Bravo Runner comparison",
    })
    inspect.focus()
    fireEvent.keyDown(inspect, {key: "Enter"})
    fireEvent.click(inspect)
    const dialog = view.getByRole("dialog")
    await waitFor(() => expect(document.activeElement).toBe(
      view.getByRole("button", {name: "Close player comparison"}),
    ))
    fireEvent.keyDown(dialog, {key: "Escape"})
    await waitFor(() => expect(view.queryByRole("dialog")).toBeNull())
    expect(document.activeElement).toBe(inspect)

    fireEvent.click(view.getByRole("button", {name: "Run analysis"}))
    await waitFor(() => expect(view.container.querySelector("svg")).not.toBeNull())
    const chartPoint = view.getByRole("button", {name: "Inspect Alpha Runner"})
    chartPoint.focus()
    fireEvent.keyDown(chartPoint, {key: "Enter"})
    expect(view.getByRole("dialog")).toBeTruthy()
  })

  it("announces material live evidence once, stays quiet on equivalent rerenders, and retains useful empty states", async () => {
    const initial = buildIntraPositionPresentationModel({
      position: FantasyPosition.RUNNING_BACK,
      availablePlayers,
      boardSettings,
      settings,
      rankingSummaries: [projectionSummary],
    })
    const view = render(
      <IntraPositionLiveSurface model={initial} onInspectPlayer={jest.fn()} />,
    )
    const liveRegion = () => view.container.querySelector(
      "[aria-live='polite']",
    )?.textContent || ""

    view.rerender(
      <IntraPositionLiveSurface
        model={buildIntraPositionPresentationModel({
          position: FantasyPosition.RUNNING_BACK,
          availablePlayers: [...availablePlayers].reverse(),
          boardSettings,
          settings,
          rankingSummaries: [projectionSummary],
        })}
        onInspectPlayer={jest.fn()}
      />,
    )
    expect(liveRegion()).toBe("")

    view.rerender(
      <IntraPositionLiveSurface
        model={buildIntraPositionPresentationModel({
          position: FantasyPosition.RUNNING_BACK,
          availablePlayers: availablePlayers.filter(item => item.id !== "rb-two"),
          boardSettings,
          settings,
          rankingSummaries: [projectionSummary],
        })}
        onInspectPlayer={jest.fn()}
      />,
    )
    await waitFor(() => expect(liveRegion()).toContain("Update 1."))
    view.rerender(
      <IntraPositionLiveSurface
        model={buildIntraPositionPresentationModel({
          position: FantasyPosition.RUNNING_BACK,
          availablePlayers: availablePlayers.filter(item => item.id !== "rb-two"),
          boardSettings,
          settings,
          rankingSummaries: [projectionSummary],
        })}
        onInspectPlayer={jest.fn()}
      />,
    )
    expect(liveRegion()).toContain("Update 1.")
    expect(liveRegion()).not.toContain("Update 2.")

    view.rerender(
      <IntraPositionLiveSurface
        model={buildIntraPositionPresentationModel({
          position: FantasyPosition.RUNNING_BACK,
          availablePlayers: [],
          boardSettings,
          settings,
          rankingSummaries: [],
        })}
        onInspectPlayer={jest.fn()}
      />,
    )
    expect(view.getByText("No currently available RB players.")).toBeTruthy()
  })

  it("keeps the checked-in Phase 9 evidence and promotion boundary byte-stable", () => {
    const report = runProspectiveRunShadowCampaign(
      campaignJson as unknown as ProspectiveCampaignManifest,
      [],
    )
    const serialized = `${JSON.stringify(report, null, 2)}\n`
    expect(report).toMatchObject({
      status: "evidence_blocked",
      eligibleFixtureCount: 0,
      promotion: {promoted: false},
      policyFingerprint: PHASE9_POLICY_FINGERPRINT,
    })
    expect(report.aggregate).toBeUndefined()
    expect(report.evidence).toHaveLength(0)
    expect(report.fixtures).toHaveLength(0)
    expect(PHASE9_POLICY_FINGERPRINT).toBe(
      "c4d950474e7dd6aae37cc18ba18b356dba2668cd6d626aaa4b5048e5fd29aad7",
    )
    expect(createHash("sha256").update(serialized).digest("hex")).toBe(
      "702a3397aefe3f4f47b150af7ac7926404dbcfb1856d27753f4f32e4dca4e6e6",
    )
  })
})
