import React from "react"
import { render } from "@testing-library/react"

import {
  AnalysisQueryResponse,
} from "../behavior/api/historicalAnalysis"
import {
  prepareAnalysisChart,
} from "../behavior/analysis/chartModel"
import {
  buildAnalysisQuery,
} from "../behavior/analysis/presets"
import DeclarativeChart from "../components/analysis/DeclarativeChart"


const response = (
  overrides: Partial<AnalysisQueryResponse> = {},
): AnalysisQueryResponse => ({
  query: {
    player_ids: ["one", "two"],
    positions: [],
    seasons: {start: 2024, end: 2025},
    scoring_profile_id: "ppr",
    metrics: ["fantasy_points_mean"],
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
    dimensions: ["player_id", "player_name", "position", "season"],
    metrics: ["fantasy_points_mean"],
  },
  visualization: {
    type: "line",
    x: "season",
    y: "fantasy_points_mean",
    color: "player_id",
  },
  row_count: 4,
  truncated: false,
  rows: [
    {
      dimensions: {
        player_id: "one",
        player_name: "Player One",
        position: "RB",
        season: 2024,
      },
      metrics: {fantasy_points_mean: 15},
    },
    {
      dimensions: {
        player_id: "two",
        player_name: "Player Two",
        position: "RB",
        season: 2024,
      },
      metrics: {fantasy_points_mean: 17},
    },
    {
      dimensions: {
        player_id: "one",
        player_name: "Player One",
        position: "RB",
        season: 2025,
      },
      metrics: {fantasy_points_mean: 19},
    },
    {
      dimensions: {
        player_id: "two",
        player_name: "Player Two",
        position: "RB",
        season: 2025,
      },
      metrics: {fantasy_points_mean: 18},
    },
  ],
  ...overrides,
})

describe("declarative analysis chart", () => {
  it("prepares numeric axes and independent color series", () => {
    const prepared = prepareAnalysisChart(response())

    expect(prepared.ok).toBe(true)
    if (!prepared.ok) return
    expect(prepared.model.type).toBe("line")
    expect(prepared.model.xNumeric).toBe(true)
    expect(prepared.model.series).toEqual(["one", "two"])
    expect(prepared.model.points).toHaveLength(4)
  })

  it("renders SVG only for fields declared by the response", () => {
    const {container} = render(
      <DeclarativeChart response={response()} />,
    )
    expect(container.querySelector("svg")).not.toBeNull()
    expect(container.querySelectorAll("polyline")).toHaveLength(2)

    const invalid = response({
      visualization: {
        type: "line",
        x: "arbitrary_field",
        y: "fantasy_points_mean",
      },
    })
    const invalidRender = render(
      <DeclarativeChart response={invalid} />,
    )
    expect(invalidRender.container.querySelector("svg")).toBeNull()
    expect(invalidRender.container.textContent).toContain(
      "Unknown x field",
    )
  })

  it("fails closed for chart types not implemented by the renderer", () => {
    const prepared = prepareAnalysisChart(response({
      visualization: {
        type: "heatmap",
        x: "season",
        y: "fantasy_points_mean",
      },
    }))

    expect(prepared).toEqual({
      ok: false,
      error: "heatmap charts are not supported by this renderer yet",
    })
  })
})

describe("manual analysis presets", () => {
  it("builds the volume metric from the selected position", () => {
    const query = buildAnalysisQuery({
      preset: "volume_value",
      playerIds: [],
      position: "RB",
      positionScope: true,
      seasonWindow: 3,
      scoringProfile: "half_ppr",
    })

    expect(query.positions).toEqual(["RB"])
    expect(query.player_ids).toEqual([])
    expect(query.seasons).toEqual({start: 2023, end: 2025})
    expect(query.metrics).toContain("carries_total")
    expect(query.visualization).toEqual({
      type: "scatter",
      x: "carries_total",
      y: "fantasy_points_mean",
      color: "position",
    })
  })
})
