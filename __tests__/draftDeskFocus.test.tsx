import React from "react"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"

import AnalysisWorkspace from "../test-support/TestAnalysisWorkspace"
import DraftDeskProfilePane from "../components/DraftDeskProfilePane"
import { useDataReadiness } from "../behavior/api/dataReadiness"
import {
  completedDataReadinessState,
} from "../test-support/dataReadiness"
import {
  DataRanker,
  FantasyPosition,
  NFLTeam,
  ThirdPartyADPRanker,
  ThirdPartyRanker,
} from "../types"
import type { FantasySettings, Player } from "../types"

jest.mock("../behavior/api/dataReadiness", () => ({
  ...jest.requireActual("../behavior/api/dataReadiness"),
  useDataReadiness: jest.fn(),
}))

const mockedReadiness = jest.mocked(useDataReadiness)

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

const players: Player[] = ["One", "Two", "Three"].map((lastName, index) => ({
  id: `rb-${index + 1}`,
  firstName: "Runner",
  lastName,
  fullName: `Runner ${lastName}`,
  position: FantasyPosition.RUNNING_BACK,
  team: NFLTeam.BUF,
  ranks: {},
}))

describe("Phase 14A profile focus boundary", () => {
  beforeEach(() => {
    localStorage.clear()
    mockedReadiness.mockReturnValue(completedDataReadinessState)
  })

  it("updates the profile focus without changing the manual comparison selection", async () => {
    const view = render(
      <>
        <DraftDeskProfilePane
          boardSettings={{ranker: ThirdPartyRanker.HARRIS, adpRanker: ThirdPartyADPRanker.ESPN}}
          player={players[0]}
          players={players}
          playerStatus={{}}
          rankingSummaries={[]}
          settings={settings}
        />
        <AnalysisWorkspace
          activePlayer={null}
          availablePlayers={players}
          boardSettings={{ranker: ThirdPartyRanker.HARRIS, adpRanker: ThirdPartyADPRanker.ESPN}}
          followActivePlayer={false}
          players={players}
          rankingSummaries={[]}
          settings={settings}
        />
      </>,
    )
    fireEvent.click(screen.getByRole("button", {name: "Player lab"}))
    const comparison = screen.getByRole("region", {name: "Advisor comparison set"})
    expect(within(comparison).getByText("Runner Three")).toBeTruthy()

    view.rerender(
      <>
        <DraftDeskProfilePane
          boardSettings={{ranker: ThirdPartyRanker.HARRIS, adpRanker: ThirdPartyADPRanker.ESPN}}
          player={players[1]}
          players={players}
          playerStatus={{}}
          rankingSummaries={[]}
          settings={settings}
        />
        <AnalysisWorkspace
          activePlayer={null}
          availablePlayers={players}
          boardSettings={{ranker: ThirdPartyRanker.HARRIS, adpRanker: ThirdPartyADPRanker.ESPN}}
          followActivePlayer={false}
          players={players}
          rankingSummaries={[]}
          settings={settings}
        />
      </>,
    )

    expect(screen.getAllByRole("heading", {name: "Runner Two"}).length).toBeGreaterThan(0)
    expect(within(screen.getByRole("region", {name: "Advisor comparison set"}))
      .getByText("Runner Three")).toBeTruthy()
  })

  it("presents populated profile evidence and preserves unavailable status", () => {
    const detailedPlayer: Player = {
      ...players[0],
      pros: "Explosive receiving usage.",
      cons: "Variable weekly workload.",
      ranks: {
        [ThirdPartyRanker.HARRIS]: {
          playerId: players[0].id, ranker: ThirdPartyRanker.HARRIS,
          position: FantasyPosition.RUNNING_BACK, pprOverallRank: 8,
          standardOverallRank: 10, pprPositionRank: 4, standardPositionRank: 5,
          pprPositionTier: {tierNumber: 1, upperLimitPlayerIdx: 0, lowerLimitPlayerIdx: 4, upperLimitValue: 20.4, lowerLimitValue: 16.8},
        },
        [ThirdPartyRanker.ESPN]: {
          playerId: players[0].id, ranker: ThirdPartyRanker.ESPN,
          position: FantasyPosition.RUNNING_BACK, adp: 9.2,
          pprPositionRank: 4, standardPositionRank: 5,
        },
      },
      historicalStats: {
        "2025": {
          rk: 8, player: players[0].fullName, name: players[0].fullName,
          tm: NFLTeam.BUF, team: NFLTeam.BUF,
          fantPos: FantasyPosition.RUNNING_BACK,
          position: FantasyPosition.RUNNING_BACK,
          playerId: players[0].id, g: 16, rushAtt: 210, rec: 52,
          pprPointsPerGame: 19.4,
        },
      },
    }
    const projectionTier = {tierNumber: 1, upperLimitPlayerIdx: 0, lowerLimitPlayerIdx: 4, upperLimitValue: 20.4, lowerLimitValue: 16.8}
    const rankingSummaries = [{
      ranker: DataRanker.LAST_SSN_PPG,
      ppr: true,
      replacementLevels: {QB: [12, 15] as [number, number], RB: [24, 10] as [number, number], WR: [24, 10] as [number, number], TE: [12, 9] as [number, number], DST: [12, 0] as [number, number], K: [12, 0] as [number, number], "": [0, 0] as [number, number]},
      stdDevs: {QB: 3, RB: 3, WR: 3, TE: 3, DST: 0, K: 0, "": 0},
      tiers: {QB: [projectionTier], RB: [projectionTier], WR: [projectionTier], TE: [projectionTier], DST: [], K: [], "": []},
    }]
    const view = render(
      <DraftDeskProfilePane
        boardSettings={{ranker: ThirdPartyRanker.HARRIS, adpRanker: ThirdPartyADPRanker.ESPN}}
        fixtureDetails={{byeWeek: 12, outlook: "Illustrative fixture outlook copy."}}
        player={detailedPlayer}
        players={[detailedPlayer]}
        playerStatus={{
          [detailedPlayer.id]: {
            playerId: detailedPlayer.id,
            state: "ready",
            loadedAt: 1,
            response: {
              schema_version: 1, player_id: detailedPlayer.id,
              last_updated_at: "2026-08-16T12:00:00Z",
              events: [{
                schema_version: 1, id: "status-1", player_id: detailedPlayer.id,
                type: "transaction", status: "active",
                short_summary: "Active with no current designation.",
                source: "nflverse_weekly_rosters", source_url: null,
                source_published_at: "2026-08-16T11:00:00Z",
                fetched_at: "2026-08-16T12:00:00Z", confidence: .98,
                recommendation_impact: "none", stale: false,
              }],
            },
          },
        }}
        rankingSummaries={rankingSummaries}
        settings={settings}
      />,
    )

    expect(screen.getByText("RB 4")).toBeTruthy()
    expect(screen.getByText("16.8–20.4")).toBeTruthy()
    expect(screen.getByText("Active with no current designation.")).toBeTruthy()
    expect(screen.queryByText(/none impact/i)).toBeNull()
    expect(screen.getByText("Seasonal fantasy output")).toBeTruthy()
    expect(screen.getByLabelText("2025: 19.4 PPG")).toBeTruthy()
    const historyTable = screen.getByRole("table", {name: `${detailedPlayer.fullName} seasonal performance`})
    expect(within(historyTable).getByText("2025")).toBeTruthy()
    expect(within(historyTable).getByText("19.4")).toBeTruthy()
    expect(screen.getByText("Illustrative fixture outlook copy.")).toBeTruthy()

    view.rerender(
      <DraftDeskProfilePane
        boardSettings={{ranker: ThirdPartyRanker.HARRIS, adpRanker: ThirdPartyADPRanker.ESPN}}
        player={detailedPlayer}
        players={[detailedPlayer]}
        playerStatus={{[detailedPlayer.id]: {playerId: detailedPlayer.id, state: "unavailable", loadedAt: 1, response: null}}}
        rankingSummaries={rankingSummaries}
        settings={settings}
      />,
    )
    expect(screen.getByText("Status provider unavailable. Rankings and drafting are unaffected.")).toBeTruthy()
  })

  it("keeps older actionable evidence ahead of a newer no-impact transaction and exposes provenance", () => {
    render(
      <DraftDeskProfilePane
        boardSettings={{ranker: ThirdPartyRanker.HARRIS, adpRanker: ThirdPartyADPRanker.ESPN}}
        player={players[0]}
        players={players}
        playerStatus={{
          [players[0].id]: {
            playerId: players[0].id,
            state: "ready",
            loadedAt: 1,
            response: {
              schema_version: 1,
              player_id: players[0].id,
              last_updated_at: "2026-08-16T12:00:00Z",
              events: [{
                schema_version: 1,
                id: "new-transaction",
                player_id: players[0].id,
                type: "transaction",
                status: "active",
                short_summary: "Participated in a routine roster transaction.",
                source: "nflverse_weekly_rosters",
                source_url: null,
                source_published_at: "2026-08-16T11:30:00Z",
                fetched_at: "2026-08-16T12:00:00Z",
                confidence: .99,
                recommendation_impact: "none",
                stale: false,
              }, {
                schema_version: 1,
                id: "material-injury",
                player_id: players[0].id,
                type: "injury",
                status: "questionable",
                short_summary: "Questionable with a material hamstring injury.",
                source: "nflverse_injuries",
                source_url: "https://example.test/injuries/material-injury",
                source_published_at: "2026-08-16T09:00:00Z",
                fetched_at: "2026-08-16T10:00:00Z",
                confidence: .94,
                recommendation_impact: "material",
                stale: false,
              }],
              summary: {
                text: "The hamstring injury materially affects draft confidence.",
                method: "openai",
                model: "gpt-5.4-nano",
                generated_at: "2026-08-16T12:30:00Z",
                event_ids: ["material-injury"],
              },
            },
          },
        }}
        rankingSummaries={[]}
        settings={settings}
      />,
    )

    expect(screen.getByText("Questionable with a material hamstring injury.")).toBeTruthy()
    expect(screen.queryByText("Participated in a routine roster transaction.")).toBeNull()
    expect(screen.getByText("material impact")).toBeTruthy()
    expect(screen.getByText("94% confidence")).toBeTruthy()
    expect(screen.getByRole("link", {name: "nflverse injury report"}).getAttribute("href"))
      .toBe("https://example.test/injuries/material-injury")
    expect(screen.getByText("The hamstring injury materially affects draft confidence.")).toBeTruthy()
    expect(screen.getByLabelText("Structured summary provenance").textContent)
      .toContain("OpenAI summary from structured events only · gpt-5.4-nano · generated 2026-08-16 12:30 UTC")
  })

  it("labels stale material evidence when no current actionable evidence exists", () => {
    render(
      <DraftDeskProfilePane
        boardSettings={{ranker: ThirdPartyRanker.HARRIS, adpRanker: ThirdPartyADPRanker.ESPN}}
        player={players[0]}
        players={players}
        playerStatus={{
          [players[0].id]: {
            playerId: players[0].id,
            state: "ready",
            loadedAt: 1,
            response: {
              schema_version: 1,
              player_id: players[0].id,
              last_updated_at: "2026-08-16T12:00:00Z",
              events: [{
                schema_version: 1,
                id: "stale-suspension",
                player_id: players[0].id,
                type: "suspension",
                status: "suspended",
                short_summary: "Prior suspension evidence requires revalidation.",
                source: "nflverse_weekly_rosters",
                source_url: null,
                source_published_at: "2026-07-01T09:00:00Z",
                fetched_at: "2026-07-01T10:00:00Z",
                confidence: .8,
                recommendation_impact: "material",
                stale: true,
              }],
            },
          },
        }}
        rankingSummaries={[]}
        settings={settings}
      />,
    )

    expect(screen.getByText("Prior suspension evidence requires revalidation.")).toBeTruthy()
    expect(screen.getByText("stale")).toBeTruthy()
  })

  it("keeps structured outlook attribution separate and renders both actionable summaries", () => {
    render(
      <DraftDeskProfilePane
        boardSettings={{ranker: ThirdPartyRanker.HARRIS, adpRanker: ThirdPartyADPRanker.ESPN}}
        player={players[0]}
        players={players}
        playerStatus={{
          [players[0].id]: {
            playerId: players[0].id,
            state: "ready",
            loadedAt: 1,
            response: {
              schema_version: 1,
              player_id: players[0].id,
              last_updated_at: "2026-08-16T12:00:00Z",
              events: [{
                schema_version: 1, id: "injury", player_id: players[0].id,
                type: "injury", status: "questionable",
                short_summary: "Hamstring limitation materially affects availability.",
                source: "nflverse_injuries", source_url: "https://example.test/injury",
                source_published_at: "2026-08-16T09:00:00Z", fetched_at: "2026-08-16T10:00:00Z",
                confidence: .96, recommendation_impact: "material", stale: false,
              }, {
                schema_version: 1, id: "suspension", player_id: players[0].id,
                type: "suspension", status: "appeal_pending",
                short_summary: "One-game suspension appeal remains unresolved.",
                source: "league_transactions", source_url: "https://example.test/suspension",
                source_published_at: "2026-08-16T08:00:00Z", fetched_at: "2026-08-16T09:00:00Z",
                confidence: .88, recommendation_impact: "review", stale: false,
              }, {
                schema_version: 1, id: "unrelated-espn", player_id: players[0].id,
                type: "profile_news", status: "active",
                short_summary: "Unrelated ESPN profile feature.",
                source: "espn_profile_news", source_url: "https://example.test/espn-feature",
                source_published_at: "2026-08-16T11:00:00Z", fetched_at: "2026-08-16T12:00:00Z",
                confidence: .9, recommendation_impact: "none", stale: false,
              }],
              summary: {
                text: "Structured outlook based on injury and suspension evidence.",
                method: "deterministic", model: null,
                generated_at: "2026-08-16T12:30:00Z",
                event_ids: ["injury", "suspension"],
              },
            },
          },
        }}
        rankingSummaries={[]}
        settings={settings}
      />,
    )

    expect(screen.getByText("Hamstring limitation materially affects availability.")).toBeTruthy()
    expect(screen.getByText("One-game suspension appeal remains unresolved.")).toBeTruthy()
    expect(screen.getByRole("link", {name: "league_transactions"}).parentElement?.textContent)
      .toContain("league_transactions · review impact · 88% confidence")
    expect(screen.getByText("Structured outlook based on injury and suspension evidence.")).toBeTruthy()
    expect(screen.getByLabelText("Structured summary provenance").textContent)
      .toContain("Deterministic structured summary · generated 2026-08-16 12:30 UTC")
    expect(screen.queryByRole("link", {name: "Source"})).toBeNull()
    expect(screen.queryByText("Unrelated ESPN profile feature.")).toBeNull()
  })
})
