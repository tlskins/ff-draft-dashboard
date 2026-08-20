import React from "react"
import {render, screen} from "@testing-library/react"

import {
  HistoricalRiskRewardSurface,
  RankTierDisagreementSurface,
} from "../components/insight/ApiInsightSurfaces"


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
  })
})
