import {
  AnalysisQueryResponse,
  AnalysisVisualization,
} from "../api/historicalAnalysis"


export const SUPPORTED_CHART_TYPES = [
  "line",
  "bar",
  "scatter",
] as const

export type SupportedChartType =
  typeof SUPPORTED_CHART_TYPES[number]

export interface ChartPoint {
  playerId?: string
  x: number
  xLabel: string
  y: number
  yLabel: string
  series: string
  label: string
}

export interface AnalysisChartModel {
  type: SupportedChartType
  xField: string
  yField: string
  colorField?: string
  points: ChartPoint[]
  series: string[]
  xLabels: string[]
  xNumeric: boolean
  xMinimum: number
  xMaximum: number
  yMinimum: number
  yMaximum: number
}

export type AnalysisChartPreparation =
  | {ok: true; model: AnalysisChartModel}
  | {ok: false; error: string}

const fieldValue = (
  row: AnalysisQueryResponse["rows"][number],
  field: string,
) => row.dimensions[field] ?? row.metrics[field]

const finiteNumber = (value: unknown): value is number => (
  typeof value === "number" && Number.isFinite(value)
)

const bounds = (
  values: number[],
  includeZero: boolean,
): [number, number] => {
  let minimum = Math.min(...values)
  let maximum = Math.max(...values)
  if (includeZero) {
    minimum = Math.min(0, minimum)
    maximum = Math.max(0, maximum)
  }
  if (minimum === maximum) {
    const padding = Math.max(1, Math.abs(minimum) * 0.1)
    return [minimum - padding, maximum + padding]
  }
  const padding = (maximum - minimum) * 0.08
  return [minimum - padding, maximum + padding]
}

const displayLabel = (
  row: AnalysisQueryResponse["rows"][number],
): string => String(
  row.dimensions.player_name ||
  row.dimensions.position ||
  row.dimensions.player_id ||
  "Series",
)

export const prepareAnalysisChart = (
  response: AnalysisQueryResponse,
): AnalysisChartPreparation => {
  const spec: AnalysisVisualization = response.visualization
  if (
    !SUPPORTED_CHART_TYPES.includes(
      spec.type as SupportedChartType,
    )
  ) {
    return {
      ok: false,
      error: `${spec.type} charts are not supported by this renderer yet`,
    }
  }
  if (response.rows.length > 500) {
    return {ok: false, error: "Chart datasets may not exceed 500 rows"}
  }

  const dimensions = new Set(response.columns.dimensions)
  const metrics = new Set(response.columns.metrics)
  if (!dimensions.has(spec.x) && !metrics.has(spec.x)) {
    return {ok: false, error: `Unknown x field: ${spec.x}`}
  }
  if (!metrics.has(spec.y)) {
    return {ok: false, error: `Unknown y metric: ${spec.y}`}
  }
  if (spec.color && !dimensions.has(spec.color)) {
    return {ok: false, error: `Unknown color dimension: ${spec.color}`}
  }
  if (spec.facet) {
    return {
      ok: false,
      error: "Faceted charts are not supported by this renderer yet",
    }
  }

  const rawXValues = response.rows.map(row => fieldValue(row, spec.x))
  if (rawXValues.some(value => value === undefined || value === null)) {
    return {ok: false, error: `${spec.x} is missing from one or more rows`}
  }
  const xNumeric = rawXValues.every(finiteNumber)
  const xLabels = xNumeric
    ? []
    : Array.from(new Set(rawXValues.map(value => String(value))))
  const points: ChartPoint[] = []
  for (const row of response.rows) {
    const rawX = fieldValue(row, spec.x)
    const rawY = fieldValue(row, spec.y)
    if (!finiteNumber(rawY)) {
      return {ok: false, error: `${spec.y} contains a non-numeric value`}
    }
    const xLabel = String(rawX)
    const x = xNumeric
      ? Number(rawX)
      : xLabels.indexOf(xLabel)
    if (!Number.isFinite(x) || x < 0) {
      return {ok: false, error: `${spec.x} contains an invalid value`}
    }
    const series = spec.color
      ? String(fieldValue(row, spec.color))
      : displayLabel(row)
    if (
      spec.color &&
      fieldValue(row, spec.color) === undefined
    ) {
      return {
        ok: false,
        error: `${spec.color} is missing from one or more rows`,
      }
    }
    points.push({
      playerId: (
        typeof row.dimensions.player_id === "string"
          ? row.dimensions.player_id
          : undefined
      ),
      x,
      xLabel,
      y: rawY,
      yLabel: rawY.toFixed(1),
      series,
      label: displayLabel(row),
    })
  }

  if (points.length === 0) {
    return {ok: false, error: "No rows matched this analysis"}
  }
  const [xMinimum, xMaximum] = bounds(
    points.map(point => point.x),
    spec.type === "bar" && xNumeric,
  )
  const [yMinimum, yMaximum] = bounds(
    points.map(point => point.y),
    spec.type === "bar",
  )
  return {
    ok: true,
    model: {
      type: spec.type as SupportedChartType,
      xField: spec.x,
      yField: spec.y,
      colorField: spec.color,
      points,
      series: Array.from(new Set(points.map(point => point.series))),
      xLabels,
      xNumeric,
      xMinimum,
      xMaximum,
      yMinimum,
      yMaximum,
    },
  }
}
