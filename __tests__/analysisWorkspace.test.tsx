import React from "react"
import {
  fireEvent,
  render,
  waitFor,
} from "@testing-library/react"

import {
  executeHistoricalAnalysis,
} from "../behavior/api/historicalAnalysis"
import AnalysisWorkspace from "../components/analysis/AnalysisWorkspace"
import {
  FantasyPosition,
  FantasySettings,
  NFLTeam,
  Player,
  ThirdPartyADPRanker,
  ThirdPartyRanker,
} from "../types"


jest.mock("../behavior/api/historicalAnalysis", () => ({
  ...jest.requireActual("../behavior/api/historicalAnalysis"),
  executeHistoricalAnalysis: jest.fn(),
}))

const mockedExecute = jest.mocked(executeHistoricalAnalysis)

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

const players: Player[] = [
  {
    id: "one",
    firstName: "Player",
    lastName: "One",
    fullName: "Player One",
    position: FantasyPosition.RUNNING_BACK,
    team: NFLTeam.ARI,
    ranks: {},
  },
  {
    id: "two",
    firstName: "Player",
    lastName: "Two",
    fullName: "Player Two",
    position: FantasyPosition.RUNNING_BACK,
    team: NFLTeam.BUF,
    ranks: {},
  },
  {
    id: "qb-one",
    firstName: "Quarterback",
    lastName: "One",
    fullName: "Quarterback One",
    position: FantasyPosition.QUARTERBACK,
    team: NFLTeam.ARI,
    ranks: {},
  },
  {
    id: "wr-one",
    firstName: "Receiver",
    lastName: "One",
    fullName: "Receiver One",
    position: FantasyPosition.WIDE_RECEIVER,
    team: NFLTeam.BUF,
    ranks: {},
  },
  {
    id: "te-one",
    firstName: "Tight End",
    lastName: "One",
    fullName: "Tight End One",
    position: FantasyPosition.TIGHT_END,
    team: NFLTeam.ARI,
    ranks: {},
  },
]

describe("decision analysis workspace navigation", () => {
  beforeEach(() => {
    localStorage.clear()
    mockedExecute.mockReset()
    mockedExecute.mockResolvedValue({
      query: {
        player_ids: ["one", "two"],
        positions: [],
        seasons: {start: 2023, end: 2025},
        scoring_profile_id: "ppr",
        metrics: [
          "games",
          "fantasy_points_mean",
          "fantasy_points_p10",
          "fantasy_points_p90",
        ],
        group_by: "season",
        filters: [],
        sort: {field: "season", direction: "asc"},
        limit: 100,
        visualization: {
          type: "line",
          x: "season",
          y: "fantasy_points_mean",
          color: "player_id",
        },
      },
      scoring_profile: {id: "ppr", weights: {}},
      sources: [{
        id: "source",
        provider: "nflverse",
        dataset: "stats_player_week",
        sha256: "abc",
        retrieved_at: "2026-07-30T00:00:00Z",
        schema_version: 1,
      }],
      columns: {
        dimensions: [
          "player_id",
          "player_name",
          "position",
          "season",
        ],
        metrics: [
          "games",
          "fantasy_points_mean",
          "fantasy_points_p10",
          "fantasy_points_p90",
        ],
      },
      visualization: {
        type: "line",
        x: "season",
        y: "fantasy_points_mean",
        color: "player_id",
      },
      row_count: 2,
      truncated: false,
      rows: [
        {
          dimensions: {
            player_id: "one",
            player_name: "Player One",
            position: "RB",
            season: 2025,
          },
          metrics: {
            games: 17,
            fantasy_points_mean: 19,
            fantasy_points_p10: 8,
            fantasy_points_p90: 30,
          },
        },
        {
          dimensions: {
            player_id: "two",
            player_name: "Player Two",
            position: "RB",
            season: 2025,
          },
          metrics: {
            games: 17,
            fantasy_points_mean: 18,
            fantasy_points_p10: 9,
            fantasy_points_p90: 27,
          },
        },
      ],
    })
  })

  it("builds a preset query and renders the validated response", async () => {
    const {container, getByRole, getByText} = render(
      <AnalysisWorkspace
        activePlayer={players[0]}
        boardSettings={{
          ranker: ThirdPartyRanker.HARRIS,
          adpRanker: ThirdPartyADPRanker.ESPN,
        }}
        players={players}
        rankingSummaries={[]}
        settings={settings}
      />,
    )

    expect(getByText("Historical analysis workspace")).toBeTruthy()
    fireEvent.click(getByText("Intra-position"))
    fireEvent.click(getByRole("button", {name: "Run analysis"}))

    await waitFor(() => expect(mockedExecute).toHaveBeenCalledTimes(1))
    expect(mockedExecute.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        player_ids: ["one", "two"],
        group_by: "season",
        scoring_profile_id: "ppr",
      }),
    )
    await waitFor(() =>
      expect(container.querySelector("svg")).not.toBeNull())
    expect(container.textContent).toContain("2 grouped rows")

    fireEvent.click(getByRole("button", {name: "Inspect Player One"}))
    expect(getByText("Player comparison")).toBeTruthy()
    expect(getByRole("dialog")).toBeTruthy()
  })

  it("exposes all four views as selectable accessible controls", () => {
    const view = render(
      <AnalysisWorkspace
        activePlayer={players[0]}
        boardSettings={{
          ranker: ThirdPartyRanker.HARRIS,
          adpRanker: ThirdPartyADPRanker.ESPN,
        }}
        players={players}
        rankingSummaries={[]}
        settings={settings}
      />,
    )
    const labels = [
      "Positional tier landscape",
      "Realtime positional bests",
      "Cross-position comparison",
      "Intra-position comparison",
    ]
    labels.forEach(label => {
      expect(view.getByRole("button", {name: label})).toBeTruthy()
    })

    const cross = view.getByRole("button", {
      name: "Cross-position comparison",
    })
    expect(view.getByRole("group", {name: "Analysis views"})).toBeTruthy()
    expect(cross.getAttribute("aria-pressed")).toBe("false")
    fireEvent.click(cross)
    expect(cross.getAttribute("aria-pressed")).toBe("true")
    expect(view.container.textContent).toContain("Automatic navigation")
    expect(view.getByText("Current view selected manually:")).toBeTruthy()
  })

  it("allows manual selection while pinned without leaving pinned mode", () => {
    const view = render(
      <AnalysisWorkspace
        activePlayer={players[0]}
        boardSettings={{
          ranker: ThirdPartyRanker.HARRIS,
          adpRanker: ThirdPartyADPRanker.ESPN,
        }}
        players={players}
        rankingSummaries={[]}
        settings={settings}
      />,
    )
    fireEvent.click(view.getByRole("button", {name: "Pin current view"}))
    fireEvent.click(view.getByRole("button", {
      name: "Intra-position comparison",
    }))

    expect(view.getByRole("button", {
      name: "Return to automatic navigation",
    })).toBeTruthy()
    expect(view.getByRole("button", {
      name: "Intra-position comparison",
    }).getAttribute("aria-pressed")).toBe("true")
    expect(view.container.textContent).toContain("Pinned navigation")
    expect(view.getByText("Pinned: advisor cannot replace this view")).toBeTruthy()
  })

  it("applies automatic revisions once, preserves manual choices for stale advice, and accepts newer revisions", async () => {
    const view = render(
      <AnalysisWorkspace
        activePlayer={players[0]}
        boardSettings={{
          ranker: ThirdPartyRanker.HARRIS,
          adpRanker: ThirdPartyADPRanker.ESPN,
        }}
        players={players}
        rankingSummaries={[]}
        settings={settings}
      />,
    )

    view.rerender(
      <AnalysisWorkspace
        activePlayer={players[0]}
        advisorViewSuggestion={{
          view: "cross_position",
          explanation: "Compare roster-adjusted value.",
          revision: 10,
        }}
        boardSettings={{
          ranker: ThirdPartyRanker.HARRIS,
          adpRanker: ThirdPartyADPRanker.ESPN,
        }}
        players={players}
        rankingSummaries={[]}
        settings={settings}
      />,
    )
    await waitFor(() => expect(view.getByRole("button", {
      name: "Cross-position comparison",
    }).getAttribute("aria-pressed")).toBe("true"))

    fireEvent.click(view.getByRole("button", {
      name: "Intra-position comparison",
    }))
    view.rerender(
      <AnalysisWorkspace
        activePlayer={players[0]}
        advisorViewSuggestion={{
          view: "tier_landscape",
          explanation: "The stale recommendation is ignored.",
          revision: 10,
        }}
        boardSettings={{
          ranker: ThirdPartyRanker.HARRIS,
          adpRanker: ThirdPartyADPRanker.ESPN,
        }}
        players={players}
        rankingSummaries={[]}
        settings={settings}
      />,
    )
    await waitFor(() => expect(view.getByRole("button", {
      name: "Intra-position comparison",
    }).getAttribute("aria-pressed")).toBe("true"))

    view.rerender(
      <AnalysisWorkspace
        activePlayer={players[0]}
        advisorViewSuggestion={{
          view: "positional_bests",
          explanation: "Review the best available options.",
          revision: 11,
        }}
        boardSettings={{
          ranker: ThirdPartyRanker.HARRIS,
          adpRanker: ThirdPartyADPRanker.ESPN,
        }}
        players={players}
        rankingSummaries={[]}
        settings={settings}
      />,
    )
    await waitFor(() => expect(view.getByRole("button", {
      name: "Realtime positional bests",
    }).getAttribute("aria-pressed")).toBe("true"))
    expect(view.container.textContent).toContain("Review the best available options.")
  })

  it("persists a pinned manual view across workspace remounts", async () => {
    const props = {
      activePlayer: players[0],
      boardSettings: {
        ranker: ThirdPartyRanker.HARRIS,
        adpRanker: ThirdPartyADPRanker.ESPN,
      },
      players,
      rankingSummaries: [],
      settings,
    }
    const first = render(<AnalysisWorkspace {...props} />)
    fireEvent.click(first.getByRole("button", {name: "Pin current view"}))

    await waitFor(() => expect(JSON.parse(
      localStorage.getItem("drafty-analysis-view-state") || "{}",
    ).pinned).toBe(true))
    first.unmount()

    const second = render(
      <AnalysisWorkspace
        {...props}
        advisorViewSuggestion={{
          view: "cross_position",
          explanation: "Your pick is approaching.",
          revision: 10,
        }}
      />,
    )
    expect(second.getByRole("button", {
      name: "Return to automatic navigation",
    })).toBeTruthy()
    expect(second.container.textContent).toContain(
      "Pinned: advisor cannot replace this view",
    )
    await waitFor(() => expect(second.container.textContent).toContain(
      "Your pick is approaching. Your current pinned view was preserved.",
    ))

    fireEvent.click(second.getByRole("button", {
      name: "Return to automatic navigation",
    }))
    await waitFor(() => expect(second.container.textContent).toContain(
      "Current view selected by advisor: Your pick is approaching.",
    ))
  })

  it("keeps only the newest pending pinned recommendation and reviews it without unpinning", async () => {
    const view = render(
      <AnalysisWorkspace
        activePlayer={players[0]}
        boardSettings={{
          ranker: ThirdPartyRanker.HARRIS,
          adpRanker: ThirdPartyADPRanker.ESPN,
        }}
        players={players}
        rankingSummaries={[]}
        settings={settings}
      />,
    )
    fireEvent.click(view.getByRole("button", {name: "Pin current view"}))
    const props = {
      activePlayer: players[0],
      boardSettings: {
        ranker: ThirdPartyRanker.HARRIS,
        adpRanker: ThirdPartyADPRanker.ESPN,
      },
      players,
      rankingSummaries: [],
      settings,
    }
    view.rerender(
      <AnalysisWorkspace
        {...props}
        advisorViewSuggestion={{
          view: "cross_position",
          explanation: "First pinned recommendation.",
          revision: 20,
        }}
      />,
    )
    await waitFor(() => expect(view.container.textContent).toContain(
      "First pinned recommendation.",
    ))
    view.rerender(
      <AnalysisWorkspace
        {...props}
        advisorViewSuggestion={{
          view: "positional_bests",
          explanation: "Newest pinned recommendation.",
          revision: 21,
        }}
      />,
    )
    await waitFor(() => expect(view.container.textContent).toContain(
      "Newest pinned recommendation.",
    ))
    expect(view.container.textContent).not.toContain(
      "First pinned recommendation.",
    )

    fireEvent.click(view.getByRole("button", {
      name: "Review pending advisor recommendation",
    }))
    expect(view.getByRole("button", {
      name: "Realtime positional bests",
    }).getAttribute("aria-pressed")).toBe("true")
    expect(view.getByRole("button", {
      name: "Return to automatic navigation",
    })).toBeTruthy()
  })

  it("announces advisor transitions politely and clears prior view state", async () => {
    const view = render(
      <AnalysisWorkspace
        activePlayer={players[0]}
        boardSettings={{
          ranker: ThirdPartyRanker.HARRIS,
          adpRanker: ThirdPartyADPRanker.ESPN,
        }}
        players={players}
        rankingSummaries={[]}
        settings={settings}
      />,
    )
    fireEvent.click(view.getByRole("button", {
      name: "Intra-position comparison",
    }))
    fireEvent.click(view.getByRole("button", {name: "Run analysis"}))
    await waitFor(() => expect(view.container.querySelector("svg")).not.toBeNull())
    fireEvent.click(view.getByRole("button", {name: "Inspect Player One"}))
    expect(view.getByRole("dialog")).toBeTruthy()

    view.rerender(
      <AnalysisWorkspace
        activePlayer={players[0]}
        advisorViewSuggestion={{
          view: "cross_position",
          explanation: "The pick is approaching; compare positions.",
          revision: 40,
        }}
        boardSettings={{
          ranker: ThirdPartyRanker.HARRIS,
          adpRanker: ThirdPartyADPRanker.ESPN,
        }}
        players={players}
        rankingSummaries={[]}
        settings={settings}
      />,
    )
    await waitFor(() => expect(view.getByRole("button", {
      name: "Cross-position comparison",
    }).getAttribute("aria-pressed")).toBe("true"))
    expect(view.queryByRole("dialog")).toBeNull()
    expect(view.container.querySelector("svg")).toBeNull()
    expect(view.container.textContent).toContain(
      "The pick is approaching; compare positions.",
    )
    const liveRegions = Array.from(
      view.container.querySelectorAll("[aria-live='polite']"),
    )
    expect(liveRegions.length).toBeGreaterThan(0)
    expect(liveRegions.some(region =>
      region.textContent?.includes("Advisor selected cross position"),
    )).toBe(true)
  })

  it("clears an analysis error when an advisor changes the active view", async () => {
    mockedExecute.mockRejectedValueOnce(new Error("temporary analysis error"))
    const view = render(
      <AnalysisWorkspace
        activePlayer={players[0]}
        boardSettings={{
          ranker: ThirdPartyRanker.HARRIS,
          adpRanker: ThirdPartyADPRanker.ESPN,
        }}
        players={players}
        rankingSummaries={[]}
        settings={settings}
      />,
    )
    fireEvent.click(view.getByRole("button", {
      name: "Intra-position comparison",
    }))
    fireEvent.click(view.getByRole("button", {name: "Run analysis"}))
    await waitFor(() => expect(view.container.textContent).toContain(
      "temporary analysis error",
    ))

    view.rerender(
      <AnalysisWorkspace
        activePlayer={players[0]}
        advisorViewSuggestion={{
          view: "cross_position",
          explanation: "Switch to the current cross-position context.",
          revision: 41,
        }}
        boardSettings={{
          ranker: ThirdPartyRanker.HARRIS,
          adpRanker: ThirdPartyADPRanker.ESPN,
        }}
        players={players}
        rankingSummaries={[]}
        settings={settings}
      />,
    )
    await waitFor(() => expect(view.container.textContent).not.toContain(
      "temporary analysis error",
    ))
  })

  it("keeps returning to the draft board as an explicit manual action", () => {
    const onClose = jest.fn()
    const view = render(
      <AnalysisWorkspace
        activePlayer={players[0]}
        boardSettings={{
          ranker: ThirdPartyRanker.HARRIS,
          adpRanker: ThirdPartyADPRanker.ESPN,
        }}
        onClose={onClose}
        players={players}
        rankingSummaries={[]}
        settings={settings}
      />,
    )
    fireEvent.click(view.getByRole("button", {name: "Return to draft board"}))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
