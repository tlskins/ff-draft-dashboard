import React, {useState} from "react"

import type {
  BoardSettings,
  FantasySettings,
  Player,
  RankingSummary,
} from "../types"
import {DataRanker} from "../types"
import {getPlayerMetrics, getProjectedTier, getRoundAndPickShortText} from "../behavior/draft"
import type { PlayerStatusCacheSnapshot } from "../behavior/api/playerStatusCache"
import {
  currentPlayerStatus,
  playerStatusSourceLabel,
  recommendationPlayerStatusEvidence,
} from "../behavior/api/playerStatus"
import HistoricalComparison from "./HistoricalComparison"
import PlayerRankingTable from "./PlayerRankingTable"
import RankingSummaryDisplay from "./RankingSummary"
import styles from "./DraftDesk.module.css"
import DeskPaneHeader from "./draft-desk/DeskPaneHeader"
import DeskMetricStrip from "./draft-desk/DeskMetricStrip"
import DeskLineChart from "./draft-desk/DeskLineChart"

export interface DraftDeskFixtureProfileDetails {
  byeWeek?: number
  outlook?: string
}

interface DraftDeskProfilePaneProps {
  player: Player | null
  players: Player[]
  settings: FantasySettings
  boardSettings: BoardSettings
  rankingSummaries: RankingSummary[]
  playerStatus: PlayerStatusCacheSnapshot
  fixtureDetails?: DraftDeskFixtureProfileDetails
}

const profileHistory = (player: Player, settings: FantasySettings) =>
  Object.entries(player.historicalStats || {})
    .map(([season, stats]) => ({
      season,
      games: stats.g,
      points: settings.ppr
        ? stats.pprPointsPerGame
        : stats.fantasyPointsPerGame,
      touches: player.position === "RB"
        ? (stats.rushAtt || 0) + (stats.rec || 0)
        : player.position === "QB"
          ? (stats.passAtt || 0) + (stats.rushAtt || 0)
          : stats.recTgt,
    }))
    .sort((left, right) => Number(left.season) - Number(right.season))
    .slice(-3)

const statusTimestampLabel = (value: string): string =>
  value.replace("T", " ").replace(":00Z", " UTC")

const structuredSummaryProvenance = (
  method: "none" | "deterministic" | "openai",
): string => method === "openai"
  ? "OpenAI summary from structured events only"
  : method === "deterministic"
    ? "Deterministic structured summary"
    : "Structured summary unavailable"

const HistoryChart = ({player, settings}: {
  player: Player
  settings: FantasySettings
}) => {
  const history = profileHistory(player, settings)
  const values = history.map(item => item.points).filter(
    (value): value is number => Number.isFinite(value),
  )
  if (history.length === 0 || values.length === 0) {
    return <p className={styles.profileUnavailable}>Seasonal performance is unavailable.</p>
  }

  return (
    <section aria-label={`${player.fullName} seasonal fantasy output`} className={styles.profileHistory}>
      <header className={styles.profileSectionHeader}>
        <div><strong>Seasonal fantasy output</strong><span>Last {history.length} seasons · {settings.ppr ? "PPR" : "Standard"}</span></div>
        <span>Points per game</span>
      </header>
      <DeskLineChart
        ariaLabel={`${player.fullName} points per game by season`}
        data={history.map(item => ({label: item.season, value: item.points}))}
        unitLabel="PPG"
      />
      <table aria-label={`${player.fullName} seasonal performance`} className={styles.profileHistoryTable}>
        <thead><tr><th>Season</th><th>Games</th><th>PPG</th><th>Opportunities</th></tr></thead>
        <tbody>{history.map(item => (
          <tr key={item.season}>
            <th scope="row">{item.season}</th>
            <td>{item.games ?? "—"}</td>
            <td>{item.points?.toFixed(1) ?? "—"}</td>
            <td>{item.touches ?? "—"}</td>
          </tr>
        ))}</tbody>
      </table>
    </section>
  )
}

const DraftDeskProfilePane = ({
  player,
  players,
  settings,
  boardSettings,
  rankingSummaries,
  playerStatus,
  fixtureDetails,
}: DraftDeskProfilePaneProps) => {
  const [detailsOpen, setDetailsOpen] = useState(false)
  return <section aria-label="Player profile and history" className={`${styles.pane} h-full overflow-y-auto text-left`}>
    <DeskPaneHeader
      actions={player ? <span className={styles.profileWatch}>Focused from board</span> : undefined}
      className="sticky top-0 z-10"
      kicker="Player profile"
      meta={player ? `${player.team} · ${player.position}` : undefined}
      title={player?.fullName || "Focus a player on the board"}
    />
    {!player ? (
      <div className={styles.profileState}>
        Focus any available player to inspect rankings, projection evidence,
        structured status, and historical performance.
      </div>
    ) : (() => {
      const metrics = getPlayerMetrics(player, settings, boardSettings)
      const projection = getProjectedTier(
        player,
        boardSettings.ranker,
        DataRanker.LAST_SSN_PPG,
        settings,
        rankingSummaries,
      )
      const projectionValues = projection
        ? [projection.lowerLimitValue, projection.upperLimitValue].sort((a, b) => a - b)
        : null
      const status = playerStatus[player.id]
      const events = currentPlayerStatus(status?.response?.events || [])
      const recommendationEvidence = recommendationPlayerStatusEvidence(
        status?.response?.events || [],
      )
      const primaryStatusEvent = recommendationEvidence[0]
        || events.find(event => event.recommendation_impact !== "none")
        || events[0]
      const statusSummary = status?.response?.summary
      const outlookEvent = events.find(event => event.source === "espn_profile_news")
      const outlook = statusSummary?.text || fixtureDetails?.outlook || outlookEvent?.short_summary
      const outlookOwner = statusSummary?.text
        ? "structured-summary"
        : fixtureDetails?.outlook
          ? "fixture"
          : outlookEvent
            ? "espn-event"
            : null
      const outlookLabel = outlookOwner === "structured-summary"
        ? "Structured player outlook"
        : outlookOwner === "fixture"
          ? "Illustrative fixture outlook"
          : outlookOwner === "espn-event"
            ? "ESPN player news"
            : null

      return (
        <div className={styles.profileBody}>
          <DeskMetricStrip
            ariaLabel={`${player.fullName} profile metrics`}
            items={[
              {label: "POS RANK", value: metrics.posRank ? `${player.position} ${metrics.posRank}` : "—"},
              {label: "PROJ RANGE", value: projectionValues ? `${projectionValues[0].toFixed(1)}–${projectionValues[1].toFixed(1)}` : "—"},
              {label: "ADP", value: metrics.adp && metrics.adp < 999 ? `${metrics.adp.toFixed(1)} · ${getRoundAndPickShortText(metrics.adp, settings.numTeams)}` : "—"},
              {label: "TIER / BYE", value: `T${metrics.tier?.tierNumber ?? "—"}${fixtureDetails?.byeWeek ? ` · ${fixtureDetails.byeWeek}` : ""}`},
            ]}
          />

          <aside aria-label="Player status summary" className={`${styles.profileStatus} ${status?.state === "unavailable" ? styles.profileStatusUnavailable : ""}`}>
            <span>STATUS</span>
            {!status || status.state === "loading"
              ? <p role="status">Loading structured status…</p>
              : status.state === "unavailable"
                ? <p>Status provider unavailable. Rankings and drafting are unaffected.</p>
                : primaryStatusEvent ? (
                  <div>
                    <p>{primaryStatusEvent.short_summary}</p>
                    {primaryStatusEvent.recommendation_impact !== "none" && (
                      <p className={styles.profileStatusMeta}>
                        <strong>{primaryStatusEvent.recommendation_impact} impact</strong>
                        {primaryStatusEvent.stale && <span>stale</span>}
                        {primaryStatusEvent.source_url ? (
                          <a href={primaryStatusEvent.source_url} rel="noreferrer" target="_blank">
                            {playerStatusSourceLabel(primaryStatusEvent.source)}
                          </a>
                        ) : playerStatusSourceLabel(primaryStatusEvent.source)}
                        <span>{(primaryStatusEvent.confidence * 100).toFixed(0)}% confidence</span>
                      </p>
                    )}
                  </div>
                ) : <p>No structured status updates.</p>}
          </aside>

          <HistoryChart player={player} settings={settings} />

          {outlook && outlookLabel && (
            <section aria-label={outlookLabel} className={styles.profileOutlook}>
              <header><span>{outlookLabel}</span>{outlookOwner === "espn-event" && outlookEvent?.source_url && (
                <a href={outlookEvent.source_url} rel="noreferrer" target="_blank">Source</a>
              )}</header>
              <p>{outlook}</p>
              {statusSummary && (
                <footer aria-label="Structured summary provenance">
                  {structuredSummaryProvenance(statusSummary.method)}
                  {statusSummary.model ? ` · ${statusSummary.model}` : ""}
                  {statusSummary.generated_at && (
                    <>
                      {" · "}
                      <time dateTime={statusSummary.generated_at}>
                        generated {statusTimestampLabel(statusSummary.generated_at)}
                      </time>
                    </>
                  )}
                </footer>
              )}
            </section>
          )}

          <div className={styles.profileNotes}>
            {player.pros && <p><span>+</span><strong>Upside</strong> {player.pros}</p>}
            {player.cons && <p><span>!</span><strong>Risk</strong> {player.cons}</p>}
            {recommendationEvidence.slice(1, 2).map(event => (
              <p key={event.id}>
                <span>↗</span><strong>{event.type.replace(/_/g, " ")}</strong>
                <span className={styles.profileEvidenceBody}>
                  <span>{event.short_summary}</span>
                  <small>
                    {event.source_url ? <a href={event.source_url} rel="noreferrer" target="_blank">{playerStatusSourceLabel(event.source)}</a> : playerStatusSourceLabel(event.source)}
                    {` · ${event.recommendation_impact} impact${event.stale ? " · stale" : ""} · ${(event.confidence * 100).toFixed(0)}% confidence`}
                  </small>
                </span>
              </p>
            ))}
          </div>

          <details className={styles.profileDetails} onToggle={event => setDetailsOpen(event.currentTarget.open)}>
            <summary>Ranking sources and comparison controls</summary>
            {detailsOpen && <>
              <PlayerRankingTable boardSettings={boardSettings} player={player} settings={settings} />
              <RankingSummaryDisplay activePlayer={player} rankingSummaries={rankingSummaries} settings={settings} ranker={boardSettings.ranker} />
              <HistoricalComparison player={player} players={players} settings={settings} />
            </>}
          </details>
        </div>
      )
    })()}
  </section>
}

export default DraftDeskProfilePane
