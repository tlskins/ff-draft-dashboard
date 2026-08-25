import React from "react"
import {render, screen} from "@testing-library/react"

import type {HistoricalComparisonResponse} from "../behavior/api/historical"
import WeeklyScoringBarChart from "../components/profile/WeeklyScoringBarChart"


const distribution = {
  games: 2, mean: 10, median: 10, std_dev: 5, minimum: 5,
  p10: 5, p25: 5, p50: 10, p75: 15, p90: 15, maximum: 15,
}

const response: HistoricalComparisonResponse = {
  season: 2025,
  seasons: [2025],
  source: {id: "weekly", provider: "nflverse", dataset: "stats_player_week", sha256: "weekly", retrieved_at: "2026-08-20T00:00:00Z", schema_version: 1},
  sources: [{id: "weekly", provider: "nflverse", dataset: "stats_player_week", sha256: "weekly", retrieved_at: "2026-08-20T00:00:00Z", schema_version: 1}],
  availability_sources: [
    {id: "schedule", provider: "nflverse", dataset: "schedules", season: 2025, sha256: "schedule", retrieved_at: "2026-08-20T00:00:00Z", schema_version: 1},
    {id: "injury", provider: "nflverse", dataset: "injuries", season: 2025, sha256: "injury", retrieved_at: "2026-08-20T00:00:00Z", schema_version: 1},
  ],
  scoring_profile: {id: "half_ppr", weights: {}},
  identity_miss_count: 0,
  players: [{
    player_id: "one",
    player_name: "One Player",
    position: "RB",
    distribution,
    season_distributions: [{season: 2025, distribution}],
    weeks: [
      {season: 2025, week: 1, team: "BUF", opponent: "MIA", points: 15, contributions: {}},
      {season: 2025, week: 2, team: "BUF", opponent: "NYJ", points: 5, contributions: {}},
    ],
    availability: [
      {season: 2025, week: 1, team: "BUF", opponent: "MIA", status: "played", played: true, detail: "Played MIA.", report_status: "", practice_status: "", primary_injury: ""},
      {season: 2025, week: 2, team: "BUF", opponent: "NYJ", status: "injury", played: true, detail: "Played while listed Questionable — ankle.", report_status: "Questionable", practice_status: "Limited", primary_injury: "Ankle"},
      {season: 2025, week: 3, team: "BUF", opponent: "", status: "bye", played: false, detail: "BUF bye week.", report_status: "", practice_status: "", primary_injury: ""},
      {season: 2025, week: 4, team: "BUF", opponent: "KC", status: "other", played: false, detail: "No recorded fantasy stat line against KC.", report_status: "", practice_status: "", primary_injury: ""},
    ],
  }],
}

describe("weekly scoring bar chart", () => {
  it("labels point values, league scoring, and availability states", () => {
    const {container} = render(
      <WeeklyScoringBarChart playerId="one" response={response} />,
    )
    expect(screen.getByText(/Half PPR league scoring/)).toBeTruthy()
    expect(screen.getByRole("img", {name: /weekly Half PPR fantasy points/})).toBeTruthy()
    expect(container.querySelectorAll('[data-scoring-bar="true"]')).toHaveLength(2)
    expect(container.querySelectorAll('[data-point-label="true"]')).toHaveLength(2)
    expect(container.querySelector('[data-week-status="injury"]')).not.toBeNull()
    expect(container.querySelector('[data-week-status="bye"]')).not.toBeNull()
    expect(container.querySelector('[data-week-status="other"]')).not.toBeNull()
    expect(container.querySelectorAll('[data-absence-column="true"]')).toHaveLength(2)
    expect(screen.getByText(/listed on injury report; marker does not assert scoring impact/)).toBeTruthy()
  })
})
