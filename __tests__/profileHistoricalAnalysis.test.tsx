import React from "react"
import {fireEvent, render, screen, waitFor} from "@testing-library/react"

import DraftDeskProfilePane from "../components/DraftDeskProfilePane"
import type {HistoricalComparisonResponse} from "../behavior/api/historical"
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

const distribution = (points: number[]) => ({
  games: points.length,
  mean: points.reduce((sum, value) => sum + value, 0) / points.length,
  median: 16,
  std_dev: 4,
  minimum: Math.min(...points),
  p10: 8,
  p25: 12,
  p50: 16,
  p75: 20,
  p90: 24,
  maximum: Math.max(...points),
})

const historicalResponse = (
  player: Player,
  scoring: "standard" | "half_ppr" | "ppr" = "ppr",
): HistoricalComparisonResponse => {
  const points = Array.from({length: 17}, (_, index) => 8 + index)
  return {
    season: 2025,
    seasons: [2025],
    source: {
      id: "weekly", provider: "nflverse", dataset: "stats_player_week",
      sha256: "source-sha", retrieved_at: "2026-08-20T00:00:00Z", schema_version: 1,
    },
    sources: [{
      id: "weekly", provider: "nflverse", dataset: "stats_player_week",
      sha256: "source-sha", retrieved_at: "2026-08-20T00:00:00Z", schema_version: 1,
    }],
    availability_sources: [
      {id: "schedule", provider: "nflverse", dataset: "schedules", season: 2025, sha256: "schedule-sha", retrieved_at: "2026-08-20T00:00:00Z", schema_version: 1},
      {id: "injury", provider: "nflverse", dataset: "injuries", season: 2025, sha256: "injury-sha", retrieved_at: "2026-08-20T00:00:00Z", schema_version: 1},
    ],
    scoring_profile: {id: scoring, weights: {}},
    identity_miss_count: 0,
    players: [{
      player_id: player.id,
      player_name: player.fullName,
      position: player.position,
      distribution: distribution(points),
      season_distributions: [{season: 2025, distribution: distribution(points)}],
      weeks: points.map((value, index) => ({
        season: 2025,
        week: index + 1,
        team: "BUF",
        opponent: "MIA",
        points: value,
        contributions: {},
      })),
      availability: Array.from({length: 18}, (_, index) => ({
        season: 2025,
        week: index + 1,
        team: "BUF",
        opponent: index === 17 ? "" : "MIA",
        status: index === 17 ? "bye" as const : "played" as const,
        played: index !== 17,
        detail: index === 17 ? "BUF bye week." : "Played MIA.",
        report_status: "",
        practice_status: "",
        primary_injury: "",
      })),
    }],
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

const profileHistoryUrls = (): URL[] => jest.mocked(global.fetch).mock.calls
  .map(call => new URL(String(call[0])))
  .filter(url => (
    url.pathname === "/v1/historical/comparison"
    && !url.searchParams.get("player_ids")?.includes(",")
    && url.searchParams.get("seasons") === "2025"
  ))

describe("weekly player-profile scoring history", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_HOST = "https://drafty-api.example.test"
    process.env.NEXT_PUBLIC_HISTORICAL_COMPARISON_ENABLED = "true"
    mockedReadiness.mockReturnValue(completedDataReadinessState)
    global.fetch = jest.fn(async input => {
      const url = new URL(String(input))
      const player = players.find(candidate => (
        candidate.id === url.searchParams.get("player_ids")
      ))!
      const scoring = url.searchParams.get("scoring_profile") as "standard" | "half_ppr" | "ppr"
      return {ok: true, json: async () => historicalResponse(player, scoring)} as Response
    })
  })

  afterAll(() => {
    process.env.NEXT_PUBLIC_API_HOST = originalApiHost
    process.env.NEXT_PUBLIC_HISTORICAL_COMPARISON_ENABLED = originalHistoricalEnabled
    global.fetch = originalFetch
  })

  it("loads the latest season under league scoring and expands weekly bars by default", async () => {
    const view = profile(players[0])
    await waitFor(() => expect(
      view.container.querySelector('[data-chart-type="weekly-bars"]'),
    ).not.toBeNull())

    expect(screen.getByRole("button", {name: "Production"}).getAttribute("aria-pressed"))
      .toBe("true")
    expect(screen.getByText(/PPR league scoring/)).toBeTruthy()
    expect(view.container.querySelectorAll('[data-scoring-bar="true"]')).toHaveLength(17)
    expect(view.container.querySelectorAll('[data-point-label="true"]')).toHaveLength(17)
    expect(view.container.querySelector('[data-week-status="bye"]')).not.toBeNull()
    expect(profileHistoryUrls()).toHaveLength(1)
    expect(profileHistoryUrls()[0].searchParams.get("player_ids")).toBe(players[0].id)
    expect(profileHistoryUrls()[0].searchParams.get("seasons")).toBe("2025")
    expect(profileHistoryUrls()[0].searchParams.get("scoring_profile")).toBe("ppr")
  })

  it("keeps production pinned and reloads the scoring chart when player focus changes", async () => {
    const cache = new ReadApiCache()
    const view = profile(players[0], cache)
    await waitFor(() => expect(profileHistoryUrls()).toHaveLength(1))

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
    await waitFor(() => expect(profileHistoryUrls()).toHaveLength(2))
    expect(screen.getByRole("button", {name: "Production"}).getAttribute("aria-pressed"))
      .toBe("true")
    expect(screen.getByRole("img", {name: /Player Two/})).toBeTruthy()
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

    await waitFor(() => expect(profileHistoryUrls()).toHaveLength(1))
    expect(profileHistoryUrls()[0].searchParams.get("player_ids")).toBe(players[1].id)
  })

  it("falls back honestly when the historical endpoint fails", async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({error: "Published weekly history unavailable"}),
    } as Response))
    profile(players[0])
    await waitFor(() => expect(
      screen.getByText(/Historical comparison API returned 503/),
    ).toBeTruthy())
    expect(screen.getByText(/Historical production unavailable/)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", {name: "Draft value"}))
    expect(screen.getByRole("region", {name: "Draft value profile module"})).toBeTruthy()
  })
})
