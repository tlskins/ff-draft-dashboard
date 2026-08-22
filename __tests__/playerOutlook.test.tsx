import React from "react"
import {fireEvent, render, within} from "@testing-library/react"

import {
  normalizePlayerOutlook,
  normalizePlayerOutlookText,
  PLAYER_OUTLOOK_MAX_LENGTH,
  playerOutlookFreshness,
} from "../behavior/playerOutlook"
import {toDomainRankings} from "../behavior/playerData"
import DraftDeskProfilePane from "../components/DraftDeskProfilePane"
import {
  FantasyPosition, NFLTeam, ThirdPartyADPRanker, ThirdPartyRanker,
} from "../types"
import type {FantasySettings, Player} from "../types"
import type {components as ApiComponents} from "../behavior/api/schema"

const settings: FantasySettings = {
  ppr: true, numTeams: 12, numStartingQbs: 1, numStartingRbs: 2,
  numStartingWrs: 2, numStartingTes: 1, numFlex: 1, numBenchPlayers: 5,
}
const basePlayer: Player = {
  id: "one", firstName: "One", lastName: "Player", fullName: "One Player",
  team: NFLTeam.BUF, position: FantasyPosition.RUNNING_BACK, ranks: {},
}
const profile = (player: Player, rankingsSeason: number | null = 2026) => render(
  <DraftDeskProfilePane
    boardSettings={{ranker: ThirdPartyRanker.HARRIS, adpRanker: ThirdPartyADPRanker.ESPN}}
    player={player}
    players={[player]}
    playerStatus={{}}
    rankingSummaries={[]}
    rankingsSeason={rankingsSeason}
    settings={settings}
  />,
)

describe("Phase 14B ESPN player outlook contract", () => {
  it("retains valid source, season, observation time, and text", () => {
    const value = normalizePlayerOutlook({
      text: "  Backfield role remains strong. ", source: "espn",
      season: 2026, observedAt: "2026-08-16T12:00:00Z",
    })
    expect(value).toEqual({
      text: "Backfield role remains strong.", source: "espn",
      season: 2026, observedAt: "2026-08-16T12:00:00Z",
    })
    expect(playerOutlookFreshness(value!, 2026)).toBe("current")
  })

  it("strips markup, collapses whitespace, and deterministically bounds untrusted text", () => {
    const normalized = normalizePlayerOutlookText(
      `<p>${"word ".repeat(500)}</p><script>ignored markup</script>`,
    )
    expect(normalized).not.toContain("<")
    expect(normalized?.length).toBe(PLAYER_OUTLOOK_MAX_LENGTH)
    expect(normalized?.endsWith("…")).toBe(true)
    expect(normalizePlayerOutlookText("  \n\t ")).toBeNull()
    expect(normalizePlayerOutlook({text: "Valid", source: "Bad Source!"})).toBeNull()
    expect(normalizePlayerOutlook({text: 123, source: "espn"})).toBeNull()
  })

  it("retains the legacy upstream ESPN playerOutlook field at ranking ingestion", () => {
    const raw = {
      cached_at: "2026-08-16T12:00:00Z", season: 2026,
      settings: {}, rankings_summaries: [], all_data_rankers: [], all_third_party_rankers: [],
      players: [{
        id: "one", first_name: "One", last_name: "Player", full_name: "One Player",
        team: "BUF", position: "RB", ranks: {}, historical_stats: {},
        playerOutlook: " ESPN parser outlook. ",
      }],
    } as unknown as ApiComponents["schemas"]["RankingsResponse"]
    expect(toDomainRankings(raw).players[0].outlook).toEqual({
      text: "ESPN parser outlook.", source: "espn", season: 2026,
      observedAt: "2026-08-16T12:00:00Z",
    })
  })

  it("converts the canonical API RankingsResponse outlook into Player.outlook", () => {
    const raw = {
      cached_at: "2026-08-16T12:00:00Z", season: 2026,
      settings: {}, rankings_summaries: [], all_data_rankers: [], all_third_party_rankers: [],
      players: [{
        id: "one", first_name: "One", last_name: "Player", full_name: "One Player",
        team: "BUF", position: "RB", ranks: {}, historical_stats: {},
        outlook: {
          text: "API-published ESPN outlook.",
          source: "espn",
          season: 2026,
          observed_at: "2026-08-16T12:00:00Z",
        },
      }],
    } as unknown as ApiComponents["schemas"]["RankingsResponse"]

    expect(toDomainRankings(raw).players[0].outlook).toEqual({
      text: "API-published ESPN outlook.",
      source: "espn",
      season: 2026,
      observedAt: "2026-08-16T12:00:00Z",
    })
  })

  it("renders current, prior-season, and unknown-season provenance honestly", () => {
    const current = profile({...basePlayer, outlook: {
      text: "Current outlook.", source: "espn", season: 2026,
      observedAt: "2026-08-16T12:00:00Z",
    }})
    fireEvent.click(current.getByRole("button", {name: "Outlook"}))
    let outlook = current.getByRole("region", {name: "ESPN player outlook"})
    expect(within(outlook).getByText("Current outlook.")).toBeTruthy()
    expect(within(outlook).getByLabelText("Player outlook provenance").textContent)
      .toContain("ESPN · 2026 season · observed 2026-08-16 12:00 UTC")

    current.rerender(<DraftDeskProfilePane
      boardSettings={{ranker: ThirdPartyRanker.HARRIS, adpRanker: ThirdPartyADPRanker.ESPN}}
      player={{...basePlayer, outlook: {text: "Older outlook.", source: "espn", season: 2025, observedAt: null}}}
      players={[basePlayer]} playerStatus={{}} rankingSummaries={[]} rankingsSeason={2026} settings={settings}
    />)
    outlook = current.getByRole("region", {name: "ESPN player outlook"})
    expect(within(outlook).getByLabelText("Player outlook provenance").textContent)
      .toContain("2025 season · stale prior-season evidence · observation time unavailable")

    current.rerender(<DraftDeskProfilePane
      boardSettings={{ranker: ThirdPartyRanker.HARRIS, adpRanker: ThirdPartyADPRanker.ESPN}}
      player={{...basePlayer, outlook: {text: "Unknown season.", source: "espn", season: null, observedAt: null}}}
      players={[basePlayer]} playerStatus={{}} rankingSummaries={[]} rankingsSeason={2026} settings={settings}
    />)
    expect(current.getByLabelText("Player outlook provenance").textContent)
      .toContain("season unknown; not labeled current")
  })

  it("renders the unavailable fallback without removing structured status evidence", () => {
    const view = profile(basePlayer)
    expect(view.getByText("ESPN player outlook unavailable for this player.")).toBeTruthy()
    expect(view.getByRole("complementary", {name: "Player status summary"}))
      .toBeTruthy()
  })
})
