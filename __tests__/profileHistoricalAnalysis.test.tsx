import React from "react"
import {fireEvent, render, screen, waitFor} from "@testing-library/react"

import DraftDeskProfilePane from "../components/DraftDeskProfilePane"
import type {AnalysisQuery, AnalysisQueryResponse} from "../behavior/api/historicalAnalysis"
import {ReadApiCache} from "../behavior/api/readApiCache"
import {ReadApiProvider} from "../behavior/api/readApiContext"
import {useDataReadiness} from "../behavior/api/dataReadiness"
import {completedDataReadinessState} from "../test-support/dataReadiness"
import {
  FantasyPosition,
  NFLTeam,
  ThirdPartyADPRanker,
  ThirdPartyRanker,
} from "../types"
import type {FantasySettings, Player} from "../types"


jest.mock("../behavior/api/dataReadiness", () => ({
  ...jest.requireActual("../behavior/api/dataReadiness"),
  useDataReadiness: jest.fn(),
}))

const mockedReadiness = jest.mocked(useDataReadiness)
const originalApiHost = process.env.NEXT_PUBLIC_API_HOST
const originalHistoricalEnabled = process.env.NEXT_PUBLIC_HISTORICAL_COMPARISON_ENABLED
const originalFetch = global.fetch
const settings: FantasySettings = {
  ppr: true,
  numTeams: 12,
  numStartingQbs: 1,
  numStartingRbs: 2,
  numStartingWrs: 2,
  numStartingTes: 1,
  numFlex: 1,
  numBenchPlayers: 5,
}
const players: Player[] = ["One", "Two"].map((name, index) => ({
  id: `player-${index + 1}`,
  firstName: "Player",
  lastName: name,
  fullName: `Player ${name}`,
  position: FantasyPosition.RUNNING_BACK,
  team: NFLTeam.BUF,
  ranks: {},
}))

const historicalResponse = (
  query: AnalysisQuery,
  player: Player,
): AnalysisQueryResponse => {
  const rows = [2024, 2025].flatMap(season => Array.from(
    {length: 17},
    (_, index) => ({
      dimensions: {
        player_id: player.id,
        player_name: player.fullName,
        position: player.position,
        season,
        week: index + 1,
      },
      metrics: {games: 1, fantasy_points_mean: 8 + index + (season - 2024)},
    }),
  ))
  return {
    query,
    scoring_profile: {id: "ppr", weights: {}},
    sources: [{
      id: "weekly",
      provider: "nflverse",
      dataset: "stats_player_week",
      sha256: "source-sha",
      retrieved_at: "2026-08-20T00:00:00Z",
      schema_version: 1,
    }],
    columns: {
      dimensions: ["player_id", "player_name", "position", "season", "week"],
      metrics: ["games", "fantasy_points_mean"],
    },
    visualization: query.visualization,
    row_count: rows.length,
    truncated: false,
    rows,
  }
}

const profile = (player: Player, cache = new ReadApiCache()) => render(
  <ReadApiProvider cache={cache}>
    <DraftDeskProfilePane
      boardSettings={{ranker: ThirdPartyRanker.HARRIS, adpRanker: ThirdPartyADPRanker.ESPN}}
      player={player}
      players={players}
      playerStatus={{}}
      rankingSummaries={[]}
      settings={settings}
    />
  </ReadApiProvider>,
)

describe("adaptive profile historical API hookup", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_HOST = "https://drafty-api.example.test"
    process.env.NEXT_PUBLIC_HISTORICAL_COMPARISON_ENABLED = "true"
    mockedReadiness.mockReturnValue(completedDataReadinessState)
    global.fetch = jest.fn(async (_url, init) => {
      const query = JSON.parse(String(init?.body)) as AnalysisQuery
      const player = players.find(candidate => candidate.id === query.player_ids[0])!
      return {
        ok: true,
        json: async () => historicalResponse(query, player),
      } as Response
    })
  })

  afterAll(() => {
    process.env.NEXT_PUBLIC_API_HOST = originalApiHost
    process.env.NEXT_PUBLIC_HISTORICAL_COMPARISON_ENABLED = originalHistoricalEnabled
    global.fetch = originalFetch
  })

  it("loads one weekly query, selects density, and switches views without refetching", async () => {
    const view = profile(players[0])
    await waitFor(() => expect(
      screen.getByRole("region", {name: "Production profile module"}),
    ).toBeTruthy())
    expect(view.container.querySelector('[data-chart-type="density"]')).not.toBeNull()
    expect(screen.getByText(/enough recorded weeks are available/i)).toBeTruthy()
    expect(global.fetch).toHaveBeenCalledTimes(1)
    const request = jest.mocked(global.fetch).mock.calls[0]
    const query = JSON.parse(String(request[1]?.body)) as AnalysisQuery
    expect(query).toMatchObject({
      player_ids: [players[0].id],
      seasons: [2023, 2024, 2025],
      group_by: "week",
    })

    fireEvent.click(screen.getByRole("button", {name: "Weekly heatmap"}))
    expect(view.container.querySelector('[data-chart-type="heatmap"]')).not.toBeNull()
    expect(view.container.querySelectorAll('[data-chart-cell="true"]')).toHaveLength(34)
    expect(screen.getByText(/remains pinned while player focus changes/i)).toBeTruthy()
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it("preserves a manual chart pin when player focus changes", async () => {
    const cache = new ReadApiCache()
    const view = profile(players[0], cache)
    await waitFor(() => expect(
      view.container.querySelector('[data-chart-type="density"]'),
    ).not.toBeNull())
    fireEvent.click(screen.getByRole("button", {name: "Weekly trend"}))

    view.rerender(
      <ReadApiProvider cache={cache}>
        <DraftDeskProfilePane
          boardSettings={{ranker: ThirdPartyRanker.HARRIS, adpRanker: ThirdPartyADPRanker.ESPN}}
          player={players[1]}
          players={players}
          playerStatus={{}}
          rankingSummaries={[]}
          settings={settings}
        />
      </ReadApiProvider>,
    )
    await waitFor(() => expect(
      view.container.querySelector('[data-chart-type="line"]'),
    ).not.toBeNull())
    expect(screen.getByRole("button", {name: "Weekly trend"}).getAttribute("aria-pressed"))
      .toBe("true")
    expect(screen.getByText(/remains pinned while player focus changes/i)).toBeTruthy()
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  it("coalesces rapid hover focus before loading weekly history", async () => {
    const cache = new ReadApiCache()
    const view = profile(players[0], cache)
    view.rerender(
      <ReadApiProvider cache={cache}>
        <DraftDeskProfilePane
          boardSettings={{ranker: ThirdPartyRanker.HARRIS, adpRanker: ThirdPartyADPRanker.ESPN}}
          player={players[1]}
          players={players}
          playerStatus={{}}
          rankingSummaries={[]}
          settings={settings}
        />
      </ReadApiProvider>,
    )

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1))
    const request = jest.mocked(global.fetch).mock.calls[0]
    const query = JSON.parse(String(request[1]?.body)) as AnalysisQuery
    expect(query.player_ids).toEqual([players[1].id])
  })

  it("falls back honestly when the historical endpoint fails", async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({error: "Published weekly history unavailable"}),
    } as Response))
    profile(players[0])
    await waitFor(() => expect(
      screen.getByText("Published weekly history unavailable"),
    ).toBeTruthy())
    expect(screen.getByText(/Historical production unavailable/)).toBeTruthy()
    expect(screen.getByRole("region", {name: "Draft value profile module"})).toBeTruthy()
  })
})
