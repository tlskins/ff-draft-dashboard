import React, { useMemo } from "react"

import { AnalysisQueryResponse } from "../../behavior/api/historicalAnalysis"
import {
  AnalysisChartModel,
  prepareAnalysisChart,
} from "../../behavior/analysis/chartModel"


interface DeclarativeChartProps {
  response: AnalysisQueryResponse
  onSelectPlayer?: (playerId: string) => void
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

const DeclarativeChart: React.FC<DeclarativeChartProps> = ({
  response,
  onSelectPlayer,
}) => {
  const prepared = useMemo(
    () => prepareAnalysisChart(response),
    [response],
  )
  if (!prepared.ok) {
    return (
      <div
        className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
        role="status"
      >
        Chart unavailable: {prepared.error}
      </div>
    )
  }

  const {model} = prepared
  const plotLeft = MARGIN.left
  const plotRight = WIDTH - MARGIN.right
  const plotTop = MARGIN.top
  const plotBottom = HEIGHT - MARGIN.bottom
  const x = (value: number) => scale(
    value,
    model.xMinimum,
    model.xMaximum,
    plotLeft,
    plotRight,
  )
  const y = (value: number) => scale(
    value,
    model.yMinimum,
    model.yMaximum,
    plotBottom,
    plotTop,
  )
  const categoricalWidth = (
    plotRight - plotLeft
  ) / Math.max(1, model.points.length)
  const lineSeries = model.series.map(series => ({
    series,
    points: model.points
      .filter(point => point.series === series)
      .sort((left, right) => left.x - right.x),
  }))

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <svg
        aria-label={`${fieldLabel(model.yField)} by ${fieldLabel(model.xField)}`}
        className="h-auto w-full"
        role="img"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      >
        {tickValues(model.yMinimum, model.yMaximum).map(value => (
          <g key={value}>
            <line
              stroke="#e2e8f0"
              x1={plotLeft}
              x2={plotRight}
              y1={y(value)}
              y2={y(value)}
            />
            <text
              fill="#64748b"
              fontSize="11"
              textAnchor="end"
              x={plotLeft - 8}
              y={y(value) + 4}
            >
              {value.toFixed(1)}
            </text>
          </g>
        ))}
        <line
          stroke="#64748b"
          x1={plotLeft}
          x2={plotLeft}
          y1={plotTop}
          y2={plotBottom}
        />
        <line
          stroke="#64748b"
          x1={plotLeft}
          x2={plotRight}
          y1={plotBottom}
          y2={plotBottom}
        />

        {model.type === "line" && lineSeries.map(group => (
          <g key={group.series}>
            <polyline
              fill="none"
              points={group.points.map(point =>
                `${x(point.x)},${y(point.y)}`).join(" ")}
              stroke={colorFor(model, group.series)}
              strokeWidth="3"
            />
            {group.points.map(point => (
              <circle
                aria-label={`Inspect ${point.label}`}
                cx={x(point.x)}
                cy={y(point.y)}
                className={
                  onSelectPlayer && point.playerId ? "cursor-pointer" : ""
                }
                fill={colorFor(model, point.series)}
                key={`${point.series}-${point.xLabel}`}
                onClick={() => {
                  if (point.playerId) onSelectPlayer?.(point.playerId)
                }}
                onKeyDown={event => {
                  if (
                    point.playerId &&
                    ["Enter", " "].includes(event.key)
                  ) {
                    onSelectPlayer?.(point.playerId)
                  }
                }}
                r="4"
                role={point.playerId ? "button" : undefined}
                tabIndex={point.playerId ? 0 : undefined}
              >
                <title>
                  {point.label}: {point.xLabel}, {point.yLabel}
                </title>
              </circle>
            ))}
          </g>
        ))}

        {model.type === "scatter" && model.points.map((point, index) => (
          <circle
            aria-label={`Inspect ${point.label}`}
            cx={x(point.x)}
            cy={y(point.y)}
            className={
              onSelectPlayer && point.playerId ? "cursor-pointer" : ""
            }
            fill={colorFor(model, point.series)}
            key={`${point.series}-${point.xLabel}-${index}`}
            onClick={() => {
              if (point.playerId) onSelectPlayer?.(point.playerId)
            }}
            onKeyDown={event => {
              if (
                point.playerId &&
                ["Enter", " "].includes(event.key)
              ) {
                onSelectPlayer?.(point.playerId)
              }
            }}
            opacity="0.85"
            r="6"
            role={point.playerId ? "button" : undefined}
            tabIndex={point.playerId ? 0 : undefined}
          >
            <title>
              {point.label}: {point.xLabel}, {point.yLabel}
            </title>
          </circle>
        ))}

        {model.type === "bar" && model.points.map((point, index) => {
          const barX = plotLeft + index * categoricalWidth + 3
          const zeroY = y(Math.max(0, model.yMinimum))
          const valueY = y(point.y)
          return (
            <rect
              aria-label={`Inspect ${point.label}`}
              className={
                onSelectPlayer && point.playerId ? "cursor-pointer" : ""
              }
              fill={colorFor(model, point.series)}
              height={Math.abs(zeroY - valueY)}
              key={`${point.series}-${point.xLabel}-${index}`}
              onClick={() => {
                if (point.playerId) onSelectPlayer?.(point.playerId)
              }}
              onKeyDown={event => {
                if (
                  point.playerId &&
                  ["Enter", " "].includes(event.key)
                ) {
                  onSelectPlayer?.(point.playerId)
                }
              }}
              role={point.playerId ? "button" : undefined}
              tabIndex={point.playerId ? 0 : undefined}
              width={Math.max(2, categoricalWidth - 6)}
              x={barX}
              y={Math.min(zeroY, valueY)}
            >
              <title>
                {point.label}: {point.xLabel}, {point.yLabel}
              </title>
            </rect>
          )
        })}

        {model.points.map((point, index) => {
          const shouldLabel = (
            model.type === "bar" ||
            index === 0 ||
            index === model.points.length - 1
          )
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
            >
              {point.xLabel}
            </text>
          )
        })}

        <text
          fill="#334155"
          fontSize="12"
          textAnchor="middle"
          x={(plotLeft + plotRight) / 2}
          y={HEIGHT - 6}
        >
          {fieldLabel(model.xField)}
        </text>
        <text
          fill="#334155"
          fontSize="12"
          textAnchor="middle"
          transform={`rotate(-90 14 ${(plotTop + plotBottom) / 2})`}
          x="14"
          y={(plotTop + plotBottom) / 2}
        >
          {fieldLabel(model.yField)}
        </text>
      </svg>

      {model.series.length > 1 && (
        <div className="mt-2 flex flex-wrap justify-center gap-3 text-xs">
          {model.series.map(series => (
            <span className="flex items-center gap-1" key={series}>
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{backgroundColor: colorFor(model, series)}}
              />
              {series}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export default DeclarativeChart
