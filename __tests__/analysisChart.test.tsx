import React from "react"
import { render } from "@testing-library/react"

import {
  AnalysisQueryResponse,
} from "../behavior/api/historicalAnalysis"
import {
  densitySamples,
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
        type: "box",
        x: "season",
        y: "fantasy_points_mean",
      },
    }))

    expect(prepared).toEqual({
      ok: false,
      error: "box charts are not supported by this renderer yet",
    })
  })

  it("prepares and renders bounded density series", () => {
    const densityResponse = response({
      visualization: {
        type: "density",
        x: "season",
        y: "fantasy_points_mean",
        color: "player_name",
      },
    })
    const prepared = prepareAnalysisChart(densityResponse)
    expect(prepared.ok).toBe(true)
    const samples = densitySamples([15, 17, 18, 19], 14, 20)
    expect(samples).toHaveLength(32)
    expect(samples.every(sample => Number.isFinite(sample.density))).toBe(true)

    const {container} = render(<DeclarativeChart response={densityResponse} />)
    expect(container.querySelector('[data-chart-type="density"]')).not.toBeNull()
    expect(container.querySelectorAll("[data-density-series]")).toHaveLength(2)
  })

  it("renders a heatmap cell for every validated row", () => {
    const heatmapResponse = response({
      visualization: {
        type: "heatmap",
        x: "season",
        y: "fantasy_points_mean",
        color: "player_name",
      },
    })
    const {container} = render(<DeclarativeChart response={heatmapResponse} />)
    expect(container.querySelector('[data-chart-type="heatmap"]')).not.toBeNull()
    expect(container.querySelectorAll('[data-chart-cell="true"]')).toHaveLength(4)
  })

  it("partitions declared facets without changing the shared dataset", () => {
    const faceted = response({
      visualization: {
        type: "line",
        x: "season",
        y: "fantasy_points_mean",
        facet: "player_name",
      },
    })
    const prepared = prepareAnalysisChart(faceted)
    expect(prepared.ok).toBe(true)
    if (!prepared.ok) return
    expect(prepared.model.facets.map(facet => facet.label)).toEqual([
      "Player One",
      "Player Two",
    ])
    expect(prepared.model.facets.map(facet => facet.points.length)).toEqual([2, 2])

    const view = render(<DeclarativeChart response={faceted} />)
    expect(view.getByRole("region", {name: "Player One facet"})).toBeTruthy()
    expect(view.getByRole("region", {name: "Player Two facet"})).toBeTruthy()
    expect(view.container.querySelectorAll("svg")).toHaveLength(2)
  })

  it("rejects undeclared facet dimensions", () => {
    expect(prepareAnalysisChart(response({
      visualization: {
        type: "line",
        x: "season",
        y: "fantasy_points_mean",
        facet: "team",
      },
    }))).toEqual({ok: false, error: "Unknown facet dimension: team"})
  })
})

describe("manual analysis presets", () => {
  it("builds the volume metric from the selected position", () => {
    const query = buildAnalysisQuery({
      preset: "volume_value",
      playerIds: [],
      position: "RB",
      positionScope: true,
      seasons: [2021, 2023, 2025],
      scoringProfile: "half_ppr",
    })

    expect(query.positions).toEqual(["RB"])
    expect(query.player_ids).toEqual([])
    expect(query.seasons).toEqual([2021, 2023, 2025])
    expect(query.metrics).toContain("carries_total")
    expect(query.visualization).toEqual({
      type: "scatter",
      x: "carries_total",
      y: "fantasy_points_mean",
      color: "position",
    })
  })
})
