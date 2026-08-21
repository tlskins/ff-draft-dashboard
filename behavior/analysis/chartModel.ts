import {
  AnalysisQueryResponse,
  AnalysisVisualization,
} from "../api/historicalAnalysis"


export const SUPPORTED_CHART_TYPES = [
  "line",
  "bar",
  "scatter",
  "density",
  "heatmap",
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
  facet: string
  label: string
}

export interface AnalysisChartFacet {
  key: string
  label: string
  points: ChartPoint[]
}

export interface AnalysisChartModel {
  type: SupportedChartType
  xField: string
  yField: string
  colorField?: string
  facetField?: string
  facets: AnalysisChartFacet[]
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

export interface DensitySample {
  density: number
  value: number
}

export const densitySamples = (
  values: number[],
  minimum: number,
  maximum: number,
  sampleCount = 32,
): DensitySample[] => {
  if (values.length === 0 || sampleCount < 2) return []
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const variance = values.reduce(
    (sum, value) => sum + ((value - mean) ** 2),
    0,
  ) / values.length
  const range = Math.max(Number.EPSILON, maximum - minimum)
  const estimatedBandwidth = 1.06
    * Math.sqrt(variance)
    * (values.length ** -0.2)
  const bandwidth = Math.max(
    range / 100,
    Number.isFinite(estimatedBandwidth) && estimatedBandwidth > 0
      ? estimatedBandwidth
      : range / 8,
  )
  const gaussianCoefficient = 1 / Math.sqrt(2 * Math.PI)
  return Array.from({length: sampleCount}, (_, index) => {
    const value = minimum + (range * index) / (sampleCount - 1)
    const density = values.reduce((sum, observation) => {
      const standardized = (value - observation) / bandwidth
      return sum + gaussianCoefficient * Math.exp(-0.5 * standardized ** 2)
    }, 0) / (values.length * bandwidth)
    return {value, density}
  })
}

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
  if (
    spec.type === "density"
    && (spec.x !== spec.y || !metrics.has(spec.x))
  ) {
    return {
      ok: false,
      error: "Density charts require the same numeric metric for x and y",
    }
  }
  if (
    spec.type === "heatmap"
    && (!dimensions.has(spec.x) || !spec.color)
  ) {
    return {
      ok: false,
      error: "Heatmaps require a categorical x dimension and color row dimension",
    }
  }
  if (spec.color && !dimensions.has(spec.color)) {
    return {ok: false, error: `Unknown color dimension: ${spec.color}`}
  }
  if (spec.facet && !dimensions.has(spec.facet)) {
    return {ok: false, error: `Unknown facet dimension: ${spec.facet}`}
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
    if (spec.facet && fieldValue(row, spec.facet) === undefined) {
      return {
        ok: false,
        error: `${spec.facet} is missing from one or more rows`,
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
      facet: spec.facet ? String(fieldValue(row, spec.facet)) : "All data",
      label: displayLabel(row),
    })
  }

  if (points.length === 0) {
    return {ok: false, error: "No rows matched this analysis"}
  }
  const facetKeys = Array.from(new Set(points.map(point => point.facet)))
  if (facetKeys.length > 12) {
    return {ok: false, error: "Charts may not render more than 12 facets"}
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
      facetField: spec.facet,
      points,
      facets: facetKeys.map(key => ({
        key,
        label: key,
        points: points.filter(point => point.facet === key),
      })),
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
