import React from "react"
import {fireEvent, render, screen} from "@testing-library/react"

import {
  CurrentBoardProjectionSurface,
  HistoricalRiskRewardSurface,
  RankTierDisagreementSurface,
  SourceReadinessSurface,
} from "../components/insight/ApiInsightSurfaces"

jest.mock("../behavior/api/rankingSources", () => ({
  useRankingSourceDetail: () => ({state: "idle", data: null}),
}))


const distribution = {
  games: 17,
  mean: 20,
  median: 20,
  std_dev: 4,
  minimum: 10,
  p10: 20,
  p25: 20,
  p50: 20,
  p75: 20,
  p90: 20,
  maximum: 20,
}

describe("compact API insight surfaces", () => {
  it("renders bounded current-board floor, median, and ceiling ranges", () => {
    render(<CurrentBoardProjectionSurface
      recommendations={{positionCandidates: [{
          player: {id: "one", fullName: "Player One", team: "BUF", position: "RB"},
          positionRank: 1,
          evidence: {projectedFloor: 10, projectedMedian: 15, projectedCeiling: 20, userTier: 1},
        }, {
          player: {id: "two", fullName: "Player Two", team: "MIA", position: "RB"},
          positionRank: 2,
          evidence: {projectedFloor: 8, projectedMedian: 12, projectedCeiling: 16, userTier: 2},
        }]} as never}
      onInspectPlayer={jest.fn()}
    />)

    expect(screen.getByRole("region", {name: "Current-board projection context"}))
      .toBeTruthy()
    const maximum = screen.getByRole("img", {name: /Player One: floor 10.0/})
    const median = maximum.querySelectorAll("span")[1] as HTMLElement
    expect(median.style.left).toBe("58.333333333333336%")
    expect(screen.getByText("RB1 · T1")).toBeTruthy()
  })

  it("bounds an equal historical range at the shared maximum", () => {
    render(<HistoricalRiskRewardSurface model={{
      state: "ready",
      fingerprint: "history",
      error: null,
      seasons: [2025],
      scoringProfile: "ppr",
      riskScore: 4,
      trendScore: 0,
      players: [{
        player_id: "one",
        player_name: "Player One",
        position: "RB",
        distribution,
        season_distributions: [{season: 2025, distribution}],
        weeks: [],
      }, {
        player_id: "two",
        player_name: "Player Two",
        position: "RB",
        distribution: {...distribution, mean: 10, median: 10, p10: 10, p25: 10, p50: 10, p75: 10, p90: 10, minimum: 10, maximum: 10},
        season_distributions: [],
        weeks: [],
      }],
    }} />)
    const graph = screen.getByRole("img", {name: /Player One: P10/})
    const band = graph.querySelector("span") as HTMLElement
    expect(band.style.left).toBe("99%")
    expect(band.style.width).toBe("1%")
    expect(screen.getByRole("region", {name: "Historical risk and reward comparison"})).toBeTruthy()
  })

  it("renders rank-source evidence as a named compact region", () => {
    render(<RankTierDisagreementSurface model={{
      state: "ready",
      fingerprint: "ranks",
      maximumSpread: 8,
      players: [{
        id: "one",
        name: "Player One",
        position: "RB",
        minimumRank: 3,
        maximumRank: 11,
        rankSpread: 8,
        ranks: [
          {source: "ESPN", rank: 3, tier: 1},
          {source: "Harris", rank: 11, tier: 3},
        ],
      }],
    }} />)
    const region = screen.getByRole("region", {name: "Rank and tier disagreement"})
    expect(region).toBeTruthy()
    expect(region.textContent).toContain("8-spot spread")
    fireEvent.change(screen.getByLabelText("Filter disagreement position"), {
      target: {value: "WR"},
    })
    expect(region.textContent).toContain("0 matching players")
    fireEvent.change(screen.getByLabelText("Filter disagreement position"), {
      target: {value: "RB"},
    })
    fireEvent.change(screen.getByLabelText("Search disagreement players"), {
      target: {value: "Player One"},
    })
    expect(region.textContent).toContain("1 matching players")
  })

  it("distinguishes loaded rankings from unrecorded provider freshness", () => {
    render(<SourceReadinessSurface model={{
      state: "ready",
      fingerprint: "sources",
      rankingSources: [{
        schema_version: 1,
        id: "espn",
        provider_id: "espn",
        provider_name: "ESPN",
        authorization_status: "approved",
        records_transport: "managed",
        minimum_refresh_interval_hours: null,
        records_unavailable_reason: null,
        storage_transport: "sqlite",
        metadata_status: "not_recorded",
        availability: "unavailable",
        is_stale: false,
        last_attempt_at: null,
        last_success_at: null,
        last_success_provider_id: null,
        failure_reason: null,
        retrieved_at: null,
        source_updated_at: null,
        season: null,
        scoring_type: null,
        fingerprint: null,
        raw_source_fingerprint: null,
        record_count: null,
        tier_method: null,
      }],
      statusSources: [],
      historicalSeasons: [2023, 2024, 2025],
      rankingsCachedAt: "2026-08-20T23:44:19Z",
      error: null,
    }} />)

    expect(screen.getByText(/Rankings loaded from Aug 20, 2026 artifact/)).toBeTruthy()
    expect(screen.getByText("Freshness not recorded")).toBeTruthy()
    expect(screen.getByText("Approved · Managed")).toBeTruthy()
  })

  it("distinguishes an approved Yahoo page from an unavailable record transport", () => {
    render(<SourceReadinessSurface model={{
      state: "unavailable",
      fingerprint: "yahoo-sources",
      rankingSources: [{
        schema_version: 1,
        id: "matt-harmon",
        provider_id: "matt-harmon",
        provider_name: "Yahoo Sports · Matt Harmon",
        ranker: "Matt Harmon",
        catalog_status: "candidate",
        ingestion_mode: "user_import",
        scoring_formats: ["half_ppr", "ppr"],
        tier_policy: "source_or_drafty_derived",
        source_url: "https://sports.yahoo.com/fantasy/article/example",
        authorization_status: "approved",
        records_transport: "metadata_only",
        minimum_refresh_interval_hours: 24,
        records_unavailable_reason: "rankings_payload_is_external_and_robots_disallow_automated_collection",
        storage_transport: "sqlite",
        metadata_status: "not_recorded",
        availability: "unavailable",
        is_stale: false,
        last_attempt_at: null,
        last_success_at: null,
        last_success_provider_id: null,
        failure_reason: null,
        retrieved_at: null,
        source_updated_at: null,
        season: null,
        scoring_type: null,
        fingerprint: null,
        raw_source_fingerprint: null,
        record_count: null,
        tier_method: null,
        source_native_tier_count: 0,
      }],
      statusSources: [],
      historicalSeasons: [],
      rankingsCachedAt: null,
      error: null,
      unavailableReason: "Ranking source records are unavailable.",
    }} />)

    expect(screen.getByText("Approved · Metadata only")).toBeTruthy()
    expect(screen.getByText("Freshness not recorded")).toBeTruthy()
  })
})
