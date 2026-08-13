import React from "react"
import { fireEvent, render, within } from "@testing-library/react"

import type { HistoricalComparisonResponse } from "../behavior/api/historical"
import PlayerLabHistorical from "../components/analysis/PlayerLabHistorical"


const distribution = (offset: number) => ({
  games: 16,
  mean: 14 + offset,
  median: 13 + offset,
  std_dev: 4 + offset,
  minimum: 2 + offset,
  p10: 5 + offset,
  p25: 9 + offset,
  p50: 13 + offset,
  p75: 17 + offset,
  p90: 22 + offset,
  maximum: 30 + offset,
})

const response: HistoricalComparisonResponse = {
  season: 2025,
  seasons: [2025],
  source: {id: "weekly", provider: "nflverse", dataset: "stats_player_week", sha256: "abc", retrieved_at: "2026-08-10T00:00:00Z", schema_version: 1},
  sources: [{id: "weekly", provider: "nflverse", dataset: "stats_player_week", sha256: "abc", retrieved_at: "2026-08-10T00:00:00Z", schema_version: 1}],
  scoring_profile: {id: "ppr", weights: {}},
  identity_miss_count: 0,
  players: ["Alpha", "Bravo", "Charlie"].map((name, index) => ({
    player_id: name.toLowerCase(),
    player_name: name,
    position: "RB",
    distribution: distribution(index),
    season_distributions: [{season: 2025, distribution: distribution(index)}],
    weeks: [1, 2, 4].map(week => ({
      season: 2025,
      week,
      team: "BUF",
      opponent: "MIA",
      points: 10 + week + index,
      contributions: {},
    })),
  })),
}

describe("Player Lab historical visuals", () => {
  it("shows exact distribution breakpoints, one combined season chart, and honest participation gaps", () => {
    const onInspectPlayer = jest.fn()
    const view = render(
      <PlayerLabHistorical
        onInspectPlayer={onInspectPlayer}
        response={response}
      />,
    )

    expect(view.getByRole("img", {
      name: /Alpha: P10 5.0, P25 9.0, median 13.0, P75 17.0, P90 22.0/,
    })).toBeTruthy()
    expect(view.getByRole("img", {
      name: /2025 weekly fantasy points for Alpha, Bravo, Charlie/,
    })).toBeTruthy()
    expect(view.getAllByText(/P10 \d+\.\d/)).toHaveLength(3)
    expect(view.getByText(/Missing records stay unclassified/)).toBeTruthy()
    expect(view.getAllByLabelText(
      "Week 3: no scoring record; cause unclassified",
    )).toHaveLength(3)
    const comparisonTable = view.getByRole("table", {
      name: "Player scoring distribution comparison",
    })
    expect(within(comparisonTable).getAllByRole("row")).toHaveLength(4)
    expect(within(comparisonTable).getAllByRole("rowheader")).toHaveLength(3)
    expect(within(comparisonTable).getAllByRole("cell")).toHaveLength(6)
    const playingTimeTable = view.getByRole("table", {
      name: "2025 recorded scoring weeks and unclassified gaps",
    })
    expect(within(playingTimeTable).getAllByRole("row")).toHaveLength(4)
    expect(within(playingTimeTable).getAllByRole("rowheader")).toHaveLength(3)
    expect(within(playingTimeTable).getAllByRole("cell")).toHaveLength(57)

    const distributionControl = view.getByRole("button", {
      name: "Inspect Alpha from scoring distribution",
    })
    fireEvent.keyDown(distributionControl, {key: "Enter"})
    expect(onInspectPlayer).toHaveBeenLastCalledWith("alpha")
    const seasonControl = view.getByRole("button", {
      name: "Inspect Bravo from season chart",
    })
    fireEvent.keyDown(seasonControl, {key: " "})
    expect(onInspectPlayer).toHaveBeenLastCalledWith("bravo")
    expect(view.container.textContent).not.toMatch(
      /Week 3: (injury|legal|bye|partial)/i,
    )
  })

  it("keeps negative and positive weekly endpoints inside one zero-inclusive scale", () => {
    const negativeResponse: HistoricalComparisonResponse = {
      ...response,
      players: response.players.map((player, index) => ({
        ...player,
        weeks: player.weeks.map(week => ({
          ...week,
          points: index === 0 && week.week === 1
            ? -7
            : index === 1 && week.week === 2
              ? 37
              : week.points,
        })),
      })),
    }
    const view = render(
      <PlayerLabHistorical
        onInspectPlayer={jest.fn()}
        response={negativeResponse}
      />,
    )

    const circles = Array.from(view.container.querySelectorAll("circle"))
    const negativePoint = circles.find(circle => (
      circle.textContent === "Alpha, week 1: -7.0 points"
    ))
    const positivePoint = circles.find(circle => (
      circle.textContent === "Bravo, week 2: 37.0 points"
    ))
    expect(Number(negativePoint?.getAttribute("cy"))).toBeGreaterThanOrEqual(20)
    expect(Number(negativePoint?.getAttribute("cy"))).toBeLessThanOrEqual(248)
    expect(Number(positivePoint?.getAttribute("cy"))).toBeGreaterThanOrEqual(20)
    expect(Number(positivePoint?.getAttribute("cy"))).toBeLessThanOrEqual(248)
    expect(view.getByText("-10")).toBeTruthy()
    expect(view.getByText("40")).toBeTruthy()
  })
})
