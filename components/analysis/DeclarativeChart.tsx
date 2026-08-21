import React, { useMemo } from "react"

import { AnalysisQueryResponse } from "../../behavior/api/historicalAnalysis"
import {
  AnalysisChartModel,
  ChartPoint,
  densitySamples,
  prepareAnalysisChart,
} from "../../behavior/analysis/chartModel"


interface DeclarativeChartProps {
  response: AnalysisQueryResponse
  onSelectPlayer?: (playerId: string) => void
}

interface ChartPanelProps {
  facetLabel?: string
  model: AnalysisChartModel
  onSelectPlayer?: (playerId: string) => void
  points: ChartPoint[]
}

const WIDTH = 760
const HEIGHT = 360
const MARGIN = {top: 28, right: 24, bottom: 58, left: 58}
const COLORS = [
  "#2563eb",
  "#dc2626",
  "#059669",
  "#7c3aed",
  "#d97706",
  "#0891b2",
]

const scale = (
  value: number,
  minimum: number,
  maximum: number,
  start: number,
  end: number,
) => start + (
  (value - minimum) / Math.max(Number.EPSILON, maximum - minimum)
) * (end - start)

const colorFor = (model: AnalysisChartModel, series: string) => (
  COLORS[model.series.indexOf(series) % COLORS.length]
)

const fieldLabel = (field: string) => field
  .replaceAll("_", " ")
  .replace(/\b\w/g, character => character.toUpperCase())

const tickValues = (minimum: number, maximum: number) => (
  Array.from({length: 5}, (_, index) =>
    minimum + ((maximum - minimum) * index) / 4)
)

const pointInteractionProps = (
  point: ChartPoint,
  onSelectPlayer?: (playerId: string) => void,
) => ({
  "aria-label": `Inspect ${point.label}`,
  className: onSelectPlayer && point.playerId ? "cursor-pointer" : "",
  onClick: () => {
    if (point.playerId) onSelectPlayer?.(point.playerId)
  },
  onKeyDown: (event: React.KeyboardEvent<SVGElement>) => {
    if (point.playerId && ["Enter", " "].includes(event.key)) {
      onSelectPlayer?.(point.playerId)
    }
  },
  role: point.playerId ? "button" : undefined,
  tabIndex: point.playerId ? 0 : undefined,
})

const DensityPanel = ({model, points, facetLabel}: ChartPanelProps) => {
  const plotLeft = MARGIN.left
  const plotRight = WIDTH - MARGIN.right
  const plotTop = MARGIN.top
  const plotBottom = HEIGHT - MARGIN.bottom
  const groups = model.series
    .map(series => ({
      series,
      samples: densitySamples(
        points.filter(point => point.series === series).map(point => point.y),
        model.yMinimum,
        model.yMaximum,
      ),
    }))
    .filter(group => group.samples.length > 0)
  const maximumDensity = Math.max(
    Number.EPSILON,
    ...groups.flatMap(group => group.samples.map(sample => sample.density)),
  )
  const x = (value: number) => scale(
    value, model.yMinimum, model.yMaximum, plotLeft, plotRight,
  )
  const y = (value: number) => scale(
    value, 0, maximumDensity, plotBottom, plotTop,
  )

  return (
    <svg
      aria-label={`${fieldLabel(model.yField)} density${facetLabel ? ` for ${facetLabel}` : ""}`}
      className="h-auto w-full"
      data-chart-type="density"
      role="img"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
    >
      {tickValues(0, maximumDensity).map(value => (
        <line
          key={value}
          stroke="#e2e8f0"
          x1={plotLeft}
          x2={plotRight}
          y1={y(value)}
          y2={y(value)}
        />
      ))}
      <line stroke="#64748b" x1={plotLeft} x2={plotRight} y1={plotBottom} y2={plotBottom} />
      <line stroke="#64748b" x1={plotLeft} x2={plotLeft} y1={plotTop} y2={plotBottom} />
      {groups.map(group => {
        const linePoints = group.samples.map(sample => (
          `${x(sample.value)},${y(sample.density)}`
        )).join(" ")
        const areaPoints = `${plotLeft},${plotBottom} ${linePoints} ${plotRight},${plotBottom}`
        return (
          <g key={group.series}>
            <polygon
              fill={colorFor(model, group.series)}
              opacity="0.14"
              points={areaPoints}
            />
            <polyline
              data-density-series={group.series}
              fill="none"
              points={linePoints}
              stroke={colorFor(model, group.series)}
              strokeWidth="3"
            >
              <title>{group.series} distribution</title>
            </polyline>
          </g>
        )
      })}
      {tickValues(model.yMinimum, model.yMaximum).map(value => (
        <text
          fill="#64748b"
          fontSize="10"
          key={value}
          textAnchor="middle"
          x={x(value)}
          y={plotBottom + 17}
        >{value.toFixed(1)}</text>
      ))}
      <text fill="#334155" fontSize="12" textAnchor="middle" x={(plotLeft + plotRight) / 2} y={HEIGHT - 6}>
        {fieldLabel(model.yField)}
      </text>
      <text
        fill="#334155"
        fontSize="12"
        textAnchor="middle"
        transform={`rotate(-90 14 ${(plotTop + plotBottom) / 2})`}
        x="14"
        y={(plotTop + plotBottom) / 2}
      >Density</text>
    </svg>
  )
}

const HeatmapPanel = ({model, points, facetLabel, onSelectPlayer}: ChartPanelProps) => {
  const plotLeft = Math.max(MARGIN.left, 105)
  const plotRight = WIDTH - MARGIN.right
  const plotTop = MARGIN.top
  const plotBottom = HEIGHT - MARGIN.bottom
  const xValues = Array.from(new Set(
    [...points].sort((left, right) => left.x - right.x).map(point => point.xLabel),
  ))
  const rowValues = Array.from(new Set(points.map(point => point.series)))
  const cellWidth = (plotRight - plotLeft) / Math.max(1, xValues.length)
  const cellHeight = (plotBottom - plotTop) / Math.max(1, rowValues.length)
  const valueMinimum = Math.min(...points.map(point => point.y))
  const valueMaximum = Math.max(...points.map(point => point.y))
  const intensity = (value: number) => 0.12 + 0.83 * (
    (value - valueMinimum)
    / Math.max(Number.EPSILON, valueMaximum - valueMinimum)
  )

  return (
    <svg
      aria-label={`${fieldLabel(model.yField)} heatmap by ${fieldLabel(model.xField)}${facetLabel ? ` for ${facetLabel}` : ""}`}
      className="h-auto w-full"
      data-chart-type="heatmap"
      role="img"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
    >
      <text fill="#475569" fontSize="10" textAnchor="end" x={plotRight} y="14">
        {fieldLabel(model.yField)} · {valueMinimum.toFixed(1)} low · {valueMaximum.toFixed(1)} high
      </text>
      {rowValues.map((series, rowIndex) => (
        <text
          fill="#475569"
          fontSize="10"
          key={series}
          textAnchor="end"
          x={plotLeft - 8}
          y={plotTop + (rowIndex + 0.5) * cellHeight + 4}
        >{series}</text>
      ))}
      {xValues.map((value, columnIndex) => (
        <text
          fill="#64748b"
          fontSize="10"
          key={value}
          textAnchor="middle"
          transform={`rotate(-24 ${plotLeft + (columnIndex + 0.5) * cellWidth} ${plotBottom + 18})`}
          x={plotLeft + (columnIndex + 0.5) * cellWidth}
          y={plotBottom + 18}
        >{value}</text>
      ))}
      {points.map((point, index) => {
        const columnIndex = xValues.indexOf(point.xLabel)
        const rowIndex = rowValues.indexOf(point.series)
        return (
          <rect
            {...pointInteractionProps(point, onSelectPlayer)}
            data-chart-cell="true"
            fill="#2563eb"
            fillOpacity={intensity(point.y)}
            height={Math.max(1, cellHeight - 2)}
            key={`${point.series}-${point.xLabel}-${index}`}
            width={Math.max(1, cellWidth - 2)}
            x={plotLeft + columnIndex * cellWidth + 1}
            y={plotTop + rowIndex * cellHeight + 1}
          >
            <title>{point.label}: {point.xLabel}, {point.yLabel}</title>
          </rect>
        )
      })}
      <text fill="#334155" fontSize="12" textAnchor="middle" x={(plotLeft + plotRight) / 2} y={HEIGHT - 6}>
        {fieldLabel(model.xField)}
      </text>
      <text
        fill="#334155"
        fontSize="12"
        textAnchor="middle"
        transform={`rotate(-90 14 ${(plotTop + plotBottom) / 2})`}
        x="14"
        y={(plotTop + plotBottom) / 2}
      >{model.colorField ? fieldLabel(model.colorField) : "Series"}</text>
    </svg>
  )
}

const StandardPanel = ({model, points, facetLabel, onSelectPlayer}: ChartPanelProps) => {
  const plotLeft = MARGIN.left
  const plotRight = WIDTH - MARGIN.right
  const plotTop = MARGIN.top
  const plotBottom = HEIGHT - MARGIN.bottom
  const x = (value: number) => scale(value, model.xMinimum, model.xMaximum, plotLeft, plotRight)
  const y = (value: number) => scale(value, model.yMinimum, model.yMaximum, plotBottom, plotTop)
  const categoricalWidth = (plotRight - plotLeft) / Math.max(1, points.length)
  const lineSeries = model.series.map(series => ({
    series,
    points: points.filter(point => point.series === series).sort((left, right) => left.x - right.x),
  })).filter(group => group.points.length > 0)

  return (
    <svg
      aria-label={`${fieldLabel(model.yField)} by ${fieldLabel(model.xField)}${facetLabel ? ` for ${facetLabel}` : ""}`}
      className="h-auto w-full"
      data-chart-type={model.type}
      role="img"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
    >
      {tickValues(model.yMinimum, model.yMaximum).map(value => (
        <g key={value}>
          <line stroke="#e2e8f0" x1={plotLeft} x2={plotRight} y1={y(value)} y2={y(value)} />
          <text fill="#64748b" fontSize="11" textAnchor="end" x={plotLeft - 8} y={y(value) + 4}>{value.toFixed(1)}</text>
        </g>
      ))}
      <line stroke="#64748b" x1={plotLeft} x2={plotLeft} y1={plotTop} y2={plotBottom} />
      <line stroke="#64748b" x1={plotLeft} x2={plotRight} y1={plotBottom} y2={plotBottom} />

      {model.type === "line" && lineSeries.map(group => (
        <g key={group.series}>
          <polyline fill="none" points={group.points.map(point => `${x(point.x)},${y(point.y)}`).join(" ")} stroke={colorFor(model, group.series)} strokeWidth="3" />
          {group.points.map(point => (
            <circle
              {...pointInteractionProps(point, onSelectPlayer)}
              cx={x(point.x)}
              cy={y(point.y)}
              fill={colorFor(model, point.series)}
              key={`${point.series}-${point.xLabel}`}
              r="4"
            ><title>{point.label}: {point.xLabel}, {point.yLabel}</title></circle>
          ))}
        </g>
      ))}

      {model.type === "scatter" && points.map((point, index) => (
        <circle
          {...pointInteractionProps(point, onSelectPlayer)}
          cx={x(point.x)}
          cy={y(point.y)}
          fill={colorFor(model, point.series)}
          key={`${point.series}-${point.xLabel}-${index}`}
          opacity="0.85"
          r="6"
        ><title>{point.label}: {point.xLabel}, {point.yLabel}</title></circle>
      ))}

      {model.type === "bar" && points.map((point, index) => {
        const barX = plotLeft + index * categoricalWidth + 3
        const zeroY = y(Math.max(0, model.yMinimum))
        const valueY = y(point.y)
        return (
          <rect
            {...pointInteractionProps(point, onSelectPlayer)}
            fill={colorFor(model, point.series)}
            height={Math.abs(zeroY - valueY)}
            key={`${point.series}-${point.xLabel}-${index}`}
            width={Math.max(2, categoricalWidth - 6)}
            x={barX}
            y={Math.min(zeroY, valueY)}
          ><title>{point.label}: {point.xLabel}, {point.yLabel}</title></rect>
        )
      })}

      {points.map((point, index) => {
        const shouldLabel = model.type === "bar" || index === 0 || index === points.length - 1
        if (!shouldLabel) return null
        const labelX = model.type === "bar"
          ? plotLeft + (index + 0.5) * categoricalWidth
          : x(point.x)
        return (
          <text
            fill="#64748b"
            fontSize="10"
            key={`x-label-${point.series}-${index}`}
            textAnchor="middle"
            transform={`rotate(-24 ${labelX} ${plotBottom + 18})`}
            x={labelX}
            y={plotBottom + 18}
          >{point.xLabel}</text>
        )
      })}
      <text fill="#334155" fontSize="12" textAnchor="middle" x={(plotLeft + plotRight) / 2} y={HEIGHT - 6}>{fieldLabel(model.xField)}</text>
      <text fill="#334155" fontSize="12" textAnchor="middle" transform={`rotate(-90 14 ${(plotTop + plotBottom) / 2})`} x="14" y={(plotTop + plotBottom) / 2}>{fieldLabel(model.yField)}</text>
    </svg>
  )
}

const ChartPanel = (props: ChartPanelProps) => {
  if (props.model.type === "density") return <DensityPanel {...props} />
  if (props.model.type === "heatmap") return <HeatmapPanel {...props} />
  return <StandardPanel {...props} />
}

const DeclarativeChart: React.FC<DeclarativeChartProps> = ({
  response,
  onSelectPlayer,
}) => {
  const prepared = useMemo(() => prepareAnalysisChart(response), [response])
  if (!prepared.ok) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="status">
        Chart unavailable: {prepared.error}
      </div>
    )
  }

  const {model} = prepared
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className={model.facets.length > 1 ? "grid gap-3 md:grid-cols-2" : "grid gap-3"}>
        {model.facets.map(facet => (
          <section
            aria-label={model.facetField ? `${facet.label} facet` : undefined}
            className="min-w-0"
            key={facet.key}
          >
            {model.facetField && (
              <h3 className="mb-1 text-xs font-semibold text-slate-700">
                {fieldLabel(model.facetField)} · {facet.label}
              </h3>
            )}
            <ChartPanel
              facetLabel={model.facetField ? facet.label : undefined}
              model={model}
              onSelectPlayer={onSelectPlayer}
              points={facet.points}
            />
          </section>
        ))}
      </div>

      {model.series.length > 1 && model.type !== "heatmap" && (
        <div className="mt-2 flex flex-wrap justify-center gap-3 text-xs">
          {model.series.map(series => (
            <span className="flex items-center gap-1" key={series}>
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{backgroundColor: colorFor(model, series)}} />
              {series}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export default DeclarativeChart
