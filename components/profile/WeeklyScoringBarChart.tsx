import React from "react"

import type {HistoricalComparisonResponse} from "../../behavior/api/historical"
import {scoringFormatLabel} from "../../behavior/scoringFormat"
import styles from "../DraftDesk.module.css"


const WIDTH = 480
const HEIGHT = 264
const PLOT = {left: 38, right: 10, top: 32, bottom: 190}

type Availability = NonNullable<
  HistoricalComparisonResponse["players"][number]["availability"]
>[number]
type Week = HistoricalComparisonResponse["players"][number]["weeks"][number]

const statusLabel = (availability: Availability): string => {
  if (availability.status === "injury") return "INJ"
  if (availability.status === "bye") return "BYE"
  if (availability.status === "other") return "OTHER"
  return "PLAYED"
}

const opponentLabel = (availability: Availability): string => (
  availability.opponent ? `vs ${availability.opponent}` : "—"
)

const WeeklyScoringBarChart = ({
  playerId,
  response,
}: {
  playerId: string
  response: HistoricalComparisonResponse
}) => {
  const player = response.players.find(candidate => candidate.player_id === playerId)
    || response.players[0]
  const season = Math.max(...response.seasons)
  const weeks = (player?.weeks || []).filter(week => week.season === season)
  const weekByNumber = new Map<number, Week>(weeks.map(week => [week.week, week]))
  const availability = (player?.availability || [])
    .filter(item => item.season === season)
    .sort((left, right) => left.week - right.week)
  const chartWeeks: Availability[] = availability.length > 0
    ? availability
    : weeks.map(week => ({
      season: week.season,
      week: week.week,
      team: week.team,
      opponent: week.opponent,
      status: "played",
      played: true,
      detail: `Played ${week.opponent}.`,
      report_status: "",
      practice_status: "",
      primary_injury: "",
    }))
  const points = weeks.map(week => week.points)
  const minimum = Math.min(0, ...points)
  const maximum = Math.max(1, ...points)
  const padding = Math.max(2, (maximum - minimum) * 0.12)
  const domainMinimum = Math.min(0, minimum - (minimum < 0 ? padding : 0))
  const domainMaximum = maximum + padding
  const y = (value: number) => PLOT.bottom - (
    (value - domainMinimum) / Math.max(Number.EPSILON, domainMaximum - domainMinimum)
  ) * (PLOT.bottom - PLOT.top)
  const zeroY = y(0)
  const columnWidth = (WIDTH - PLOT.left - PLOT.right) / Math.max(1, chartWeeks.length)
  const barWidth = Math.max(8, columnWidth - 7)
  const ticks = Array.from(new Set([
    domainMinimum,
    0,
    domainMinimum + (domainMaximum - domainMinimum) / 2,
    domainMaximum,
  ])).sort((left, right) => left - right)
  const average = points.length
    ? points.reduce((sum, value) => sum + value, 0) / points.length
    : 0
  const high = points.length ? Math.max(...points) : 0
  const scoringLabel = scoringFormatLabel(response.scoring_profile.id)
  const availabilitySources = Array.from(new Set(
    (response.availability_sources || []).map(source => source.dataset),
  ))

  if (!player || chartWeeks.length === 0) {
    return <p className={styles.profileHistoricalState}>No recorded weekly games are available.</p>
  }

  return (
    <figure className={styles.profileWeeklyChart}>
      <header>
        <div>
          <strong>{season} weekly fantasy points</strong>
          <span>{scoringLabel} league scoring · labels show points per game</span>
        </div>
        <div className={styles.profileWeeklySummary}>
          <span><strong>{average.toFixed(1)}</strong> avg</span>
          <span><strong>{points.length}</strong> games</span>
          <span><strong>{high.toFixed(1)}</strong> high</span>
        </div>
      </header>

      <svg
        aria-label={`${season} weekly ${scoringLabel} fantasy points for ${player.player_name}, including bye, injury-report, and other absence markers`}
        className={styles.profileWeeklySvg}
        data-chart-type="weekly-bars"
        role="img"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      >
        <defs>
          <pattern height="5" id="profile-weekly-hatch" patternUnits="userSpaceOnUse" width="5">
            <path d="M-1 1 L1 -1 M0 5 L5 0 M4 6 L6 4" stroke="#7b878d" strokeWidth="1" />
          </pattern>
        </defs>
        {ticks.map(tick => (
          <g key={tick}>
            <line
              stroke={Math.abs(tick) < 0.001 ? "#89959a" : "#d5dadd"}
              strokeWidth={Math.abs(tick) < 0.001 ? 1.2 : 1}
              x1={PLOT.left}
              x2={WIDTH - PLOT.right}
              y1={y(tick)}
              y2={y(tick)}
            />
            <text fill="#66747a" fontSize="9" textAnchor="end" x={PLOT.left - 5} y={y(tick) + 3}>
              {tick.toFixed(0)}
            </text>
          </g>
        ))}
        {chartWeeks.map((availabilityItem, index) => {
          const week = weekByNumber.get(availabilityItem.week)
          const centerX = PLOT.left + (index + 0.5) * columnWidth
          const barX = centerX - barWidth / 2
          const valueY = week ? y(week.points) : PLOT.top
          const fill = availabilityItem.status === "injury" ? "#b87931" : "#397792"
          const title = week
            ? `Week ${availabilityItem.week}: ${week.points.toFixed(1)} points; ${availabilityItem.detail}`
            : `Week ${availabilityItem.week}: ${availabilityItem.detail}`
          return (
            <g data-week-status={availabilityItem.status} key={availabilityItem.week}>
              {week ? (
                <>
                  <rect
                    data-scoring-bar="true"
                    fill={fill}
                    height={Math.max(1, Math.abs(zeroY - valueY))}
                    width={barWidth}
                    x={barX}
                    y={Math.min(zeroY, valueY)}
                  ><title>{title}</title></rect>
                  <text
                    data-point-label="true"
                    fill="#243239"
                    fontSize="9"
                    fontWeight="700"
                    textAnchor="middle"
                    x={centerX}
                    y={week.points >= 0 ? valueY - 4 : valueY + 11}
                  >{week.points.toFixed(1)}</text>
                </>
              ) : (
                <rect
                  data-absence-column="true"
                  fill="url(#profile-weekly-hatch)"
                  height={PLOT.bottom - PLOT.top}
                  opacity={availabilityItem.status === "bye" ? 0.2 : 0.36}
                  stroke={availabilityItem.status === "injury" ? "#b87931" : "#7b878d"}
                  strokeDasharray="3 3"
                  width={barWidth}
                  x={barX}
                  y={PLOT.top}
                ><title>{title}</title></rect>
              )}
              <text fill="#36454c" fontSize="9" fontWeight="700" textAnchor="middle" x={centerX} y="204">
                W{availabilityItem.week}
              </text>
              <text fill="#718087" fontSize="7.5" textAnchor="middle" x={centerX} y="216">
                {opponentLabel(availabilityItem)}
              </text>
              <rect
                fill={availabilityItem.status === "injury"
                  ? "#ecd9bd"
                  : availabilityItem.status === "bye"
                    ? "#dce1e2"
                    : availabilityItem.status === "other"
                      ? "#e7d7d4"
                      : "#dbe8e2"}
                height="12"
                rx="2"
                width={Math.max(22, barWidth)}
                x={centerX - Math.max(22, barWidth) / 2}
                y="222"
              />
              <text
                fill={availabilityItem.status === "injury"
                  ? "#754b1e"
                  : availabilityItem.status === "other"
                    ? "#774941"
                    : "#536168"}
                fontSize="6.5"
                fontWeight="800"
                textAnchor="middle"
                x={centerX}
                y="230.5"
              >{statusLabel(availabilityItem)}</text>
            </g>
          )
        })}
        <text fill="#647177" fontSize="8" textAnchor="end" x={WIDTH - PLOT.right} y="252">
          INJ = listed on injury report; marker does not assert scoring impact
        </text>
      </svg>

      <figcaption>
        <span><i data-legend="played" />Played</span>
        <span><i data-legend="injury" />Injury report</span>
        <span><i data-legend="bye" />Bye</span>
        <span><i data-legend="other" />Other / no stat line</span>
        <small>
          nflverse weekly stats{availabilitySources.length
            ? ` + ${availabilitySources.join(" + ")}`
            : " · availability detail unavailable"}
        </small>
      </figcaption>
    </figure>
  )
}

export default WeeklyScoringBarChart
