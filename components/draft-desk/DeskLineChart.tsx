import React, {useMemo} from "react"

import {
  deskChartPoints,
  paddedZeroAwareDomain,
  type DeskChartDatum,
} from "../../behavior/draftDeskCharts"
import styles from "../DraftDesk.module.css"

interface DeskLineChartProps {
  ariaLabel: string
  data: DeskChartDatum[]
  unitLabel: string
}

const DeskLineChart = ({ariaLabel, data, unitLabel}: DeskLineChartProps) => {
  const domain = useMemo(
    () => paddedZeroAwareDomain(data.map(item => item.value)),
    [data],
  )
  const points = useMemo(() => deskChartPoints(data, domain), [data, domain])
  const polyline = points.map(point => `${point.x},${point.y}`).join(" ")

  if (points.length === 0) {
    return <p className={styles.profileUnavailable}>Seasonal performance is unavailable.</p>
  }

  return (
    <svg
      aria-label={ariaLabel}
      className={styles.deskLineChart}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      viewBox="0 0 320 118"
    >
      <title>{ariaLabel}</title>
      <text className={styles.chartUnitLabel} x="36" y="8">{unitLabel}</text>
      {domain.ticks.map(tick => {
        const y = 92 - ((tick - domain.min) / (domain.max - domain.min)) * 82
        return <g key={tick}>
          <line className={styles.chartGridLine} x1="36" x2="306" y1={y} y2={y} />
          <text className={styles.chartTickLabel} textAnchor="end" x="31" y={y + 2.5}>{tick}</text>
        </g>
      })}
      {points.length > 1 && <polyline className={styles.chartLine} points={polyline} />}
      {points.map(point => (
        <circle
          aria-label={`${point.label}: ${point.value.toFixed(1)} ${unitLabel}`}
          className={styles.chartPoint}
          cx={point.x}
          cy={point.y}
          data-chart-point={point.label}
          key={point.label}
          r="3"
        />
      ))}
      {data.map((datum, index) => {
        const x = data.length <= 1 ? 171 : 36 + index * (270 / (data.length - 1))
        return <text className={styles.chartSeasonLabel} key={datum.label} textAnchor="middle" x={x} y="108">{datum.label}</text>
      })}
    </svg>
  )
}

export default DeskLineChart
