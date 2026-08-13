import React from "react"

import type { HistoricalComparisonResponse } from "../../behavior/api/historical"
import styles from "./AnalysisRedesign.module.css"


interface PlayerLabHistoricalProps {
  onInspectPlayer: (playerId: string) => void
  response: HistoricalComparisonResponse
}

const COLORS = ["#4f46e5", "#0891b2", "#d97706", "#dc2626", "#7c3aed"]
const WEEKS = Array.from({length: 18}, (_, index) => index + 1)
const WIDTH = 760
const HEIGHT = 290
const LEFT = 52
const TOP = 20
const RIGHT = 20
const BOTTOM = 42

const format = (value: number): string => value.toFixed(1)

const valuePercent = (
  value: number,
  minimum: number,
  maximum: number,
): number => Math.max(0, Math.min(100,
  ((value - minimum) / Math.max(1, maximum - minimum)) * 100,
))

const BoxPlotRow: React.FC<{
  color: string
  onInspectPlayer: (playerId: string) => void
  player: HistoricalComparisonResponse["players"][number]
  maximum: number
  minimum: number
}> = ({color, onInspectPlayer, player, maximum, minimum}) => {
  const distribution = player.distribution
  const values = [
    {label: "P10", value: distribution.p10},
    {label: "P25", value: distribution.p25},
    {label: "P50", value: distribution.p50},
    {label: "P75", value: distribution.p75},
    {label: "P90", value: distribution.p90},
  ]
  const percent = (value: number) => valuePercent(value, minimum, maximum)
  const p25 = percent(distribution.p25)
  const p75 = percent(distribution.p75)
  const boxMedian = ((distribution.p50 - distribution.p25) / Math.max(
    .1,
    distribution.p75 - distribution.p25,
  )) * 100
  const chartStyle = {
    "--box-median": `${Math.max(0, Math.min(100, boxMedian))}%`,
    "--high": `${percent(distribution.p90)}%`,
    "--low": `${percent(distribution.p10)}%`,
    "--p25": `${p25}%`,
    "--p75": `${p75}%`,
    "--series-color": color,
  } as React.CSSProperties

  return (
    <tr>
      <th className={styles.labPlayerName} scope="row">
        <button
          aria-label={`Inspect ${player.player_name} from scoring distribution`}
          className={styles.labPlayerButton}
          onClick={() => onInspectPlayer(player.player_id)}
          onKeyDown={event => {
            if (event.key !== "Enter" && event.key !== " ") return
            event.preventDefault()
            onInspectPlayer(player.player_id)
          }}
          type="button"
        >
          <strong>{player.player_name}</strong>
          <span>{player.position} · {distribution.games} recorded games</span>
        </button>
      </th>
      <td className={styles.labPlotCell}>
        <div
          aria-label={`${player.player_name}: P10 ${format(distribution.p10)}, P25 ${format(distribution.p25)}, median ${format(distribution.p50)}, P75 ${format(distribution.p75)}, P90 ${format(distribution.p90)} points`}
          className={styles.boxTrack}
          role="img"
          style={chartStyle}
        >
          <span aria-hidden="true" className={styles.boxWhisker} />
          <span aria-hidden="true" className={styles.boxBody}>
            <span className={styles.boxMedian} />
          </span>
          {values.map((item, index) => (
            <span
              className={`${styles.boxLabel} ${item.label === "P50" ? styles.boxLabelMedian : ""}`}
              key={item.label}
              style={{
                "--value-left": `${percent(item.value)}%`,
                top: index % 2 === 0 ? "43px" : "56px",
              } as React.CSSProperties}
            >
              {item.label} {format(item.value)}
            </span>
          ))}
        </div>
      </td>
      <td className={styles.labVarianceValue}>
        <strong>{format(distribution.std_dev)} pts</strong>
        <span>week-to-week SD</span>
      </td>
    </tr>
  )
}

const seasonSegments = (
  weeks: HistoricalComparisonResponse["players"][number]["weeks"],
  season: number,
  minimum: number,
  maximum: number,
): string[] => {
  const selected = weeks.filter(week => (
    week.season === season && Number.isFinite(week.points)
  ))
    .sort((left, right) => left.week - right.week)
  const segments: typeof selected[] = []
  selected.forEach(week => {
    const current = segments[segments.length - 1]
    if (!current || current[current.length - 1].week + 1 !== week.week) {
      segments.push([week])
    } else {
      current.push(week)
    }
  })
  return segments.map(segment => segment.map(week => {
    const x = LEFT + ((week.week - 1) / 17) * (WIDTH - LEFT - RIGHT)
    const y = TOP + (1 - (week.points - minimum) / (maximum - minimum))
      * (HEIGHT - TOP - BOTTOM)
    return `${x},${y}`
  }).join(" "))
}

const PlayerLabHistorical: React.FC<PlayerLabHistoricalProps> = ({
  onInspectPlayer,
  response,
}) => {
  const values = response.players.flatMap(player => [
    player.distribution.p10,
    player.distribution.p90,
  ])
  const minimum = Math.floor(Math.min(0, ...values) / 5) * 5
  const maximum = Math.max(
    minimum + 5,
    Math.ceil(Math.max(...values, 1) / 5) * 5,
  )
  const latestSeason = response.seasons.length > 0
    ? Math.max(...response.seasons)
    : response.season
  const latestPoints = response.players.flatMap(player => player.weeks
    .filter(week => week.season === latestSeason)
    .map(week => week.points))
    .filter(value => Number.isFinite(value))
  const lineMinimum = Math.floor(Math.min(0, ...latestPoints) / 5) * 5
  const rawLineMaximum = Math.ceil(Math.max(0, ...latestPoints) / 5) * 5
  const lineMaximum = Math.max(lineMinimum + 5, rawLineMaximum)
  const seasonLabel = response.seasons.length === 1
    ? String(response.seasons[0])
    : `${Math.min(...response.seasons)}–${Math.max(...response.seasons)}`
  const scaleTicks = Array.from({length: 5}, (_, index) => (
    minimum + ((maximum - minimum) * index) / 4
  ))

  return (
    <section className={styles.analysisSurface} aria-labelledby="player-lab-results-title">
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2 className={styles.panelTitle} id="player-lab-results-title">Weekly scoring distribution</h2>
            <p className={styles.panelCaption}>Whiskers show P10–P90, the box shows P25–P75, and the center line is the median. Every breakpoint is labeled on its player&apos;s graph.</p>
          </div>
          <span className={styles.neutralPill}>{seasonLabel} · {response.scoring_profile.id.replace("_", " ").toUpperCase()}</span>
        </div>
        <div className={styles.rangeScroll}>
          <table className={styles.labGrid} aria-label="Player scoring distribution comparison">
            <colgroup>
              <col className={styles.labPlayerColumn} />
              <col />
              <col className={styles.labVarianceColumn} />
            </colgroup>
            <thead>
              <tr>
                <th className={styles.labHeaderCell} scope="col">Player</th>
                <th className={styles.labHeaderCell} scope="col">
                  <span className={styles.boxAxisTicks}>
                    {scaleTicks.map((tick, index) => (
                      <span key={tick}>{tick.toFixed(1)}{index === 4 ? " points" : ""}</span>
                    ))}
                  </span>
                </th>
                <th className={styles.labHeaderCell} scope="col" style={{textAlign: "right"}}>Scoring variance</th>
              </tr>
            </thead>
            <tbody>
              {response.players.map((player, index) => (
                <BoxPlotRow
                  color={COLORS[index % COLORS.length]}
                  key={player.player_id}
                  maximum={maximum}
                  minimum={minimum}
                  onInspectPlayer={onInspectPlayer}
                  player={player}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2 className={styles.panelTitle}>Full previous season</h2>
            <p className={styles.panelCaption}>All selected players share one graph. X-axis is NFL week; Y-axis is fantasy points. Missing weeks break the line instead of being treated as zero.</p>
          </div>
          <span className={styles.neutralPill}>{latestSeason} · weeks 1–18</span>
        </div>
        <div className={styles.lineLegend} aria-label="Player color legend">
          {response.players.map((player, index) => (
            <button
              aria-label={`Inspect ${player.player_name} from season chart`}
              key={player.player_id}
              onClick={() => onInspectPlayer(player.player_id)}
              onKeyDown={event => {
                if (event.key !== "Enter" && event.key !== " ") return
                event.preventDefault()
                onInspectPlayer(player.player_id)
              }}
              style={{"--series-color": COLORS[index % COLORS.length]} as React.CSSProperties}
              type="button"
            >
              <i aria-hidden="true" />{player.player_name}
            </button>
          ))}
        </div>
        <div className={styles.seasonScroll}>
          <svg
            aria-label={`${latestSeason} weekly fantasy points for ${response.players.map(player => player.player_name).join(", ")}`}
            className={styles.seasonChart}
            role="img"
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          >
            <title>{latestSeason} weekly fantasy points for the selected players</title>
            <desc>Weeks one through eighteen on the horizontal axis and fantasy points on the vertical axis. Missing weeks are gaps.</desc>
            {[0, .25, .5, .75, 1].map(portion => {
              const y = TOP + portion * (HEIGHT - TOP - BOTTOM)
              const value = lineMaximum
                - (lineMaximum - lineMinimum) * portion
              return (
                <g key={portion}>
                  <line stroke="#dbe3ee" x1={LEFT} x2={WIDTH - RIGHT} y1={y} y2={y} />
                  <text fill="#64748b" fontSize="10" textAnchor="end" x={LEFT - 7} y={y + 3}>{value.toFixed(0)}</text>
                </g>
              )
            })}
            {WEEKS.map(week => {
              const x = LEFT + ((week - 1) / 17) * (WIDTH - LEFT - RIGHT)
              return (
                <g key={week}>
                  {(week === 1 || week === 6 || week === 12 || week === 18) && (
                    <line stroke="#eef2f7" x1={x} x2={x} y1={TOP} y2={HEIGHT - BOTTOM} />
                  )}
                  <text fill="#64748b" fontSize="9" textAnchor="middle" x={x} y={HEIGHT - 19}>{week}</text>
                </g>
              )
            })}
            <text fill="#334155" fontSize="10" fontWeight="600" textAnchor="middle" x={(LEFT + WIDTH - RIGHT) / 2} y={HEIGHT - 3}>NFL week</text>
            <text fill="#334155" fontSize="10" fontWeight="600" textAnchor="middle" transform={`rotate(-90 13 ${HEIGHT / 2})`} x="13" y={HEIGHT / 2}>Fantasy points</text>
            {response.players.map((player, index) => (
              <g key={player.player_id}>
                {seasonSegments(player.weeks, latestSeason, lineMinimum, lineMaximum).map((points, segmentIndex) => (
                  <polyline fill="none" key={segmentIndex} points={points} stroke={COLORS[index % COLORS.length]} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
                ))}
                {player.weeks.filter(week => (
                  week.season === latestSeason && Number.isFinite(week.points)
                )).map(week => {
                  const x = LEFT + ((week.week - 1) / 17) * (WIDTH - LEFT - RIGHT)
                  const y = TOP + (1 - (week.points - lineMinimum)
                    / (lineMaximum - lineMinimum)) * (HEIGHT - TOP - BOTTOM)
                  return (
                    <circle cx={x} cy={y} fill="#ffffff" key={week.week} r="3" stroke={COLORS[index % COLORS.length]} strokeWidth="2">
                      <title>{player.player_name}, week {week.week}: {format(week.points)} points</title>
                    </circle>
                  )
                })}
              </g>
            ))}
          </svg>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2 className={styles.panelTitle}>Recorded playing time</h2>
            <p className={styles.panelCaption}>The weekly source identifies scoring records, but not bye weeks, partial games, injuries, or legal/administrative absences. Missing records stay unclassified.</p>
          </div>
          <span className={styles.neutralPill}>{latestSeason}</span>
        </div>
        <div className={styles.availabilityScroll}>
          <table className={styles.availabilityGrid} aria-label={`${latestSeason} recorded scoring weeks and unclassified gaps`}>
            <thead>
              <tr>
                <th className={styles.availabilityHeader} scope="col">Player</th>
                {WEEKS.map(week => <th className={styles.availabilityHeader} key={week} scope="col">{week}</th>)}
                <th className={styles.availabilityHeader} scope="col">No record</th>
              </tr>
            </thead>
            <tbody>
              {response.players.map(player => {
                const recorded = new Set(player.weeks
                  .filter(week => week.season === latestSeason)
                  .map(week => week.week))
                const unclassified = WEEKS.filter(week => !recorded.has(week)).length
                return (
                  <tr key={player.player_id}>
                    <th className={styles.availabilityName} scope="row">{player.player_name}</th>
                    {WEEKS.map(week => (
                      <td
                        aria-label={`Week ${week}: ${recorded.has(week) ? "scoring record present" : "no scoring record; cause unclassified"}`}
                        className={recorded.has(week) ? styles.gameRecorded : styles.gameUnknown}
                        key={week}
                      >
                        <span aria-hidden="true">{recorded.has(week) ? "●" : "?"}</span>
                      </td>
                    ))}
                    <td className={styles.availabilityTotal}>{unclassified} week{unclassified === 1 ? "" : "s"}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className={styles.availabilityLegend}>
          <span>● Scoring record present</span>
          <span>? No record; cause unknown</span>
        </div>
        <p className={styles.panelCaption}>Health vs. legal cause and partial-game participation require a structured data source; Drafty does not infer them from low or missing scores.</p>
      </section>
    </section>
  )
}

export default PlayerLabHistorical
