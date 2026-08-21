import React, {useState} from "react"

import type {
  BoardSettings,
  FantasySettings,
  Player,
  RankingSummary,
} from "../types"
import {DataRanker, ThirdPartyRanker} from "../types"
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
import {
  normalizePlayerOutlook,
  playerOutlookFreshness,
  playerOutlookSourceLabel,
} from "../behavior/playerOutlook"
import {
  PROFILE_MODULE_IDS,
  PROFILE_MODULE_LABELS,
  ProfileModuleId,
  selectProfileModule,
} from "../behavior/profile/profileModuleController"
import {
  PROFILE_HISTORICAL_VIEW_IDS,
  PROFILE_HISTORICAL_VIEWS,
  ProfileHistoricalViewId,
  historicalSeasonCount,
  presentProfileHistoricalView,
  selectProfileHistoricalView,
} from "../behavior/profile/profileHistoricalViews"
import {useProfileHistoricalAnalysis} from "../behavior/hooks/useProfileHistoricalAnalysis"
import {formatSeasonList} from "../behavior/api/dataReadiness"
import DeclarativeChart from "./analysis/DeclarativeChart"

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
  rankingsSeason?: number | null
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

const ProfileHistoricalAnalysis = ({
  player,
  resource,
  seasons,
  settings,
}: {
  player: Player
  resource: ReturnType<typeof useProfileHistoricalAnalysis>["resource"]
  seasons: number[]
  settings: FantasySettings
}) => {
  const [pinnedView, setPinnedView] = useState<ProfileHistoricalViewId | null>(null)
  const readyResponse = resource.data && ["ready", "stale"].includes(resource.state)
    ? resource.data
    : null
  const automaticView = readyResponse
    ? selectProfileHistoricalView(readyResponse)
    : null
  const activeView = pinnedView || automaticView?.id || "weekly_trend"
  const presentedResponse = readyResponse
    ? presentProfileHistoricalView(readyResponse, activeView)
    : null
  const localHistoryAvailable = profileHistory(player, settings).length > 0
  const unavailableReason = resource.error
    || resource.unavailableReason
    || "Historical analysis is unavailable."

  return (
    <section aria-label={`${player.fullName} API historical analysis`} className={styles.profileHistoricalAnalysis}>
      <header className={styles.profileHistoricalController}>
        <div>
          <strong>{pinnedView ? "Pinned historical view" : "Auto historical view"}</strong>
          <span aria-live="polite">{pinnedView
            ? `${PROFILE_HISTORICAL_VIEWS[pinnedView].label} remains pinned while player focus changes.`
            : automaticView?.explanation || "Waiting for validated weekly history."}</span>
        </div>
        <div aria-label="Historical profile view selection" className={styles.profileHistoricalButtons} role="group">
          <button aria-pressed={pinnedView === null} onClick={() => setPinnedView(null)} type="button">Auto</button>
          {PROFILE_HISTORICAL_VIEW_IDS.map(viewId => (
            <button
              aria-pressed={activeView === viewId}
              disabled={!readyResponse}
              key={viewId}
              onClick={() => setPinnedView(viewId)}
              type="button"
            >{PROFILE_HISTORICAL_VIEWS[viewId].label}</button>
          ))}
        </div>
      </header>

      {presentedResponse ? (
        <>
          <DeclarativeChart compact response={presentedResponse} />
          <footer className={styles.profileHistoricalProvenance}>
            nflverse weekly stats · {formatSeasonList(seasons)} · {presentedResponse.row_count} recorded weeks
            {resource.state === "stale" && ` · ${resource.staleReason || "refresh pending"}`}
          </footer>
        </>
      ) : (
        <>
          <p className={styles.profileHistoricalState} role={resource.state === "loading" ? "status" : undefined}>
            {resource.state === "loading"
              ? "Loading validated weekly history…"
              : `${unavailableReason}${localHistoryAvailable ? " Showing embedded seasonal history instead." : ""}`}
          </p>
          {localHistoryAvailable ? (
            <HistoryChart player={player} settings={settings} />
          ) : (
            <p className={styles.profileHistoryEmpty}>Historical production unavailable; draft context remains available for rookies and players without NFL games.</p>
          )}
        </>
      )}
    </section>
  )
}

const ProfileDraftContext = ({
  player,
  players,
  settings,
  boardSettings,
  rankingSummaries,
  projection,
}: {
  player: Player
  players: Player[]
  settings: FantasySettings
  boardSettings: BoardSettings
  rankingSummaries: RankingSummary[]
  projection: ReturnType<typeof getProjectedTier>
}) => {
  const metrics = getPlayerMetrics(player, settings, boardSettings)
  const ppgSummary = rankingSummaries.find(summary => (
    summary.ranker === DataRanker.LAST_SSN_PPG
    && summary.ppr === settings.ppr
  ))
  const replacement = ppgSummary?.replacementLevels[player.position]
  const projectionValues = projection
    ? [projection.lowerLimitValue, projection.upperLimitValue].sort((a, b) => a - b)
    : null
  const midpoint = projectionValues
    ? (projectionValues[0] + projectionValues[1]) / 2
    : null
  const aboveReplacement = midpoint !== null && replacement
    ? midpoint - replacement[1]
    : null
  const scaleMaximum = Math.max(
    1,
    projectionValues?.[1] || 0,
    replacement?.[1] || 0,
  ) * 1.12
  const bandStart = projectionValues ? (projectionValues[0] / scaleMaximum) * 100 : 0
  const bandWidth = projectionValues
    ? ((projectionValues[1] - projectionValues[0]) / scaleMaximum) * 100
    : 0
  const baseline = replacement ? (replacement[1] / scaleMaximum) * 100 : null
  const projectionPeers = projection
    ? players
      .filter(candidate => candidate.position === player.position)
      .filter(candidate => getProjectedTier(
        candidate,
        boardSettings.ranker,
        DataRanker.LAST_SSN_PPG,
        settings,
        rankingSummaries,
      )?.tierNumber === projection.tierNumber)
      .sort((left, right) => (
        (getPlayerMetrics(left, settings, boardSettings).posRank || 9999)
        - (getPlayerMetrics(right, settings, boardSettings).posRank || 9999)
      ))
      .slice(0, 5)
    : []
  const sourceRanks = [ThirdPartyRanker.HARRIS, ThirdPartyRanker.FPROS]
    .map(ranker => {
      const rank = player.ranks?.[ranker]
      return {
        ranker,
        positionRank: settings.ppr
          ? rank?.pprPositionRank
          : rank?.standardPositionRank,
      }
    })

  return (
    <section aria-label={`${player.fullName} draft context`} className={styles.profileDraftContext}>
      <header className={styles.profileContextHeader}>
        <div>
          <strong>Draft context</strong>
          <span>{boardSettings.ranker} board · {boardSettings.adpRanker} ADP</span>
        </div>
        <span>{metrics.tier ? `Board tier ${metrics.tier.tierNumber}` : "Board tier unavailable"}</span>
      </header>

      <div className={styles.profileRankSources}>
        {sourceRanks.map(source => (
          <div key={source.ranker}>
            <span>{source.ranker}</span>
            <strong>{source.positionRank ? `${player.position}${source.positionRank}` : "—"}</strong>
          </div>
        ))}
        <div>
          <span>{boardSettings.adpRanker} ADP</span>
          <strong>{metrics.adp && metrics.adp < 999
            ? `Pick ${metrics.adp.toFixed(1)} · R${getRoundAndPickShortText(metrics.adp, settings.numTeams)}`
            : "—"}</strong>
        </div>
      </div>

      <div className={styles.profilePpgBand}>
        <div className={styles.profilePpgBandHeader}>
          <div>
            <strong>Rank-mapped PPG band</strong>
            <span>2025 positional production tier · not an individual projection</span>
          </div>
          <strong>{projectionValues
            ? `${projectionValues[0].toFixed(1)}–${projectionValues[1].toFixed(1)} PPG`
            : "Unavailable"}</strong>
        </div>
        {projectionValues && (
          <div
            aria-label={`${player.fullName} rank-mapped PPG band from ${projectionValues[0].toFixed(1)} to ${projectionValues[1].toFixed(1)}${replacement ? `; replacement baseline ${replacement[1].toFixed(1)}` : ""}`}
            className={styles.profilePpgTrack}
            role="img"
          >
            <span className={styles.profilePpgBandRange} style={{left: `${bandStart}%`, width: `${Math.max(1, bandWidth)}%`}} />
            {baseline !== null && <span className={styles.profilePpgBaseline} style={{left: `${baseline}%`}} />}
          </div>
        )}
        <div className={styles.profilePpgBandFooter}>
          <span>{projection ? `Projection tier ${projection.tierNumber}` : "Projection tier unavailable"}</span>
          <span>{aboveReplacement !== null
            ? `${aboveReplacement >= 0 ? "+" : ""}${aboveReplacement.toFixed(1)} PPG vs replacement`
            : "Replacement comparison unavailable"}</span>
        </div>
      </div>

      {projectionPeers.length > 0 && (
        <div className={styles.profileTierPeers}>
          <span>Same mapped band</span>
          <div>{projectionPeers.map(peer => (
            <span className={peer.id === player.id ? styles.profileTierPeerActive : ""} key={peer.id}>
              {peer.fullName}
            </span>
          ))}</div>
        </div>
      )}
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
  rankingsSeason,
}: DraftDeskProfilePaneProps) => {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [pinnedModule, setPinnedModule] = useState<ProfileModuleId | null>(null)
  const profileHistorical = useProfileHistoricalAnalysis({
    playerId: player?.id || "",
    scoringProfile: settings.ppr ? "ppr" : "standard",
  })
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
      const artifactOutlook = player.outlook || (fixtureDetails?.outlook
        ? normalizePlayerOutlook(fixtureDetails.outlook, {
            source: "fixture",
            season: rankingsSeason,
          })
        : null)
      const outlookFreshness = artifactOutlook
        ? playerOutlookFreshness(artifactOutlook, rankingsSeason)
        : null
      const historySeasonCount = Math.max(
        profileHistory(player, settings).length,
        historicalSeasonCount(profileHistorical.resource.data),
      )
      const statusImpact = recommendationEvidence.some(
        event => event.recommendation_impact === "material",
      )
        ? "material"
        : recommendationEvidence.some(
          event => event.recommendation_impact === "review",
        )
          ? "review"
          : "none"
      const automaticModule = selectProfileModule({
        hasDraftContext: Boolean(
          (metrics.posRank && metrics.posRank < 9999)
          || metrics.tier
          || projection
          || (metrics.adp && metrics.adp < 999),
        ),
        historySeasonCount,
        hasOutlook: Boolean(statusSummary?.text || artifactOutlook),
        hasPlayerNotes: Boolean(player.pros || player.cons),
        statusImpact,
      })
      const activeModule = pinnedModule || automaticModule.id

      return (
        <div className={styles.profileBody}>
          <DeskMetricStrip
            ariaLabel={`${player.fullName} profile metrics`}
            items={[
              {label: "POS RANK", value: metrics.posRank ? `${player.position} ${metrics.posRank}` : "—"},
              {label: "PPG BAND", value: projectionValues ? `${projectionValues[0].toFixed(1)}–${projectionValues[1].toFixed(1)}` : "—"},
              {label: "ADP PICK", value: metrics.adp && metrics.adp < 999 ? `${metrics.adp.toFixed(1)} (R${getRoundAndPickShortText(metrics.adp, settings.numTeams)})` : "—"},
              {label: "BOARD TIER", value: `${metrics.tier ? `T${metrics.tier.tierNumber}` : "—"}${fixtureDetails?.byeWeek ? ` · Bye ${fixtureDetails.byeWeek}` : ""}`},
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

          <section aria-label="Player profile module controller" className={styles.profileModuleController}>
            <header>
              <div>
                <strong>{pinnedModule ? "Pinned profile module" : "Auto profile module"}</strong>
                <span aria-live="polite">
                  {pinnedModule
                    ? `${PROFILE_MODULE_LABELS[pinnedModule]} remains pinned while player focus changes.`
                    : automaticModule.explanation}
                </span>
              </div>
              <div aria-label="Profile module selection" className={styles.profileModuleButtons} role="group">
                <button
                  aria-pressed={pinnedModule === null}
                  onClick={() => setPinnedModule(null)}
                  type="button"
                >Auto</button>
                {PROFILE_MODULE_IDS.map(moduleId => (
                  <button
                    aria-pressed={activeModule === moduleId}
                    key={moduleId}
                    onClick={() => setPinnedModule(moduleId)}
                    type="button"
                  >{PROFILE_MODULE_LABELS[moduleId]}</button>
                ))}
              </div>
            </header>
          </section>

          <div
            aria-label={`${PROFILE_MODULE_LABELS.draft_context} profile module`}
            hidden={activeModule !== "draft_context"}
            role="region"
          >
            <ProfileDraftContext
              boardSettings={boardSettings}
              player={player}
              players={players}
              projection={projection}
              rankingSummaries={rankingSummaries}
              settings={settings}
            />
          </div>

          <div
            aria-label={`${PROFILE_MODULE_LABELS.outlook} profile module`}
            hidden={activeModule !== "outlook"}
            role="region"
          >
            {statusSummary?.text && (
              <section aria-label="Structured player outlook" className={styles.profileOutlook}>
                <header><span>Structured player outlook</span></header>
                <p>{statusSummary.text}</p>
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
              </section>
            )}

            <section aria-label="ESPN player outlook" className={styles.profileOutlook}>
              <header><span>{artifactOutlook?.source === "fixture"
                ? "Illustrative fixture outlook"
                : "ESPN player outlook"}</span></header>
              {artifactOutlook ? (
                <>
                  <p>{artifactOutlook.text}</p>
                  <footer aria-label="Player outlook provenance">
                    {playerOutlookSourceLabel(artifactOutlook.source)}
                    {artifactOutlook.season
                      ? ` · ${artifactOutlook.season} season`
                      : " · season unknown; not labeled current"}
                    {outlookFreshness === "prior" && " · stale prior-season evidence"}
                    {outlookFreshness === "mismatched" && " · season does not match active rankings"}
                    {artifactOutlook.observedAt ? (
                      <>
                        {" · "}
                        <time dateTime={artifactOutlook.observedAt}>
                          observed {statusTimestampLabel(artifactOutlook.observedAt)}
                        </time>
                      </>
                    ) : " · observation time unavailable"}
                  </footer>
                </>
              ) : (
                <p className={styles.profileOutlookUnavailable}>
                  ESPN player outlook unavailable for this player.
                </p>
              )}
            </section>

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
          </div>

          <div
            aria-label={`${PROFILE_MODULE_LABELS.production} profile module`}
            hidden={activeModule !== "production"}
            role="region"
          >
            <ProfileHistoricalAnalysis
              player={player}
              resource={profileHistorical.resource}
              seasons={profileHistorical.seasons}
              settings={settings}
            />
          </div>

          <details className={styles.profileDetails} onToggle={event => setDetailsOpen(event.currentTarget.open)}>
            <summary>Advanced rankings and historical comparison</summary>
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
