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
]

describe("manual analysis workspace", () => {
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
    fireEvent.click(first.getByRole("button", {name: "Pin view"}))

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
    expect(second.getByRole("button", {name: "Pinned"})).toBeTruthy()
    expect(second.container.textContent).toContain(
      "Advisor switching disabled",
    )
    await waitFor(() => expect(second.container.textContent).toContain(
      "Your pick is approaching. Your pinned view was preserved.",
    ))

    fireEvent.click(second.getByRole("button", {name: "Pinned"}))
    await waitFor(() => expect(second.container.textContent).toContain(
      "Advisor view: Your pick is approaching.",
    ))
  })
})
