import React, {useState} from "react"

import type {IntraPositionPresentationModel} from "../../behavior/analysis/intraPosition"
import {playerStatusSourceLabel} from "../../behavior/api/playerStatus"
import {useRankingSourceDetail} from "../../behavior/api/rankingSources"
import type {
  HistoricalInsightModel,
  PlayerStatusInsightModel,
  RankTierDisagreementModel,
  SourceReadinessInsightModel,
} from "../../behavior/insights/apiInsightModels"
import type {Player} from "../../types"
import styles from "./ApiInsightSurfaces.module.css"


const number = (value: number): string => value.toFixed(1)
const percent = (value: number, minimum: number, maximum: number): number => (
  Math.max(0, Math.min(100, ((value - minimum) / Math.max(.1, maximum - minimum)) * 100))
)

const StateMessage: React.FC<{
  state: string
  reason?: string | null
}> = ({state, reason}) => (
  <p className={styles.stateMessage} role="note">
    {state === "loading" || state === "idle"
      ? "Loading published evidence…"
      : reason || "Published evidence is unavailable for this view."}
  </p>
)

const RankingSourceDetail: React.FC<{sourceId: string; label: string}> = ({
  sourceId,
  label,
}) => {
  const [open, setOpen] = useState(false)
  const resource = useRankingSourceDetail(sourceId, open)
  return (
    <details className={styles.sourceDetail} onToggle={event => (
      setOpen(event.currentTarget.open)
    )}>
      <summary>{label} details</summary>
      {resource.state === "idle" || resource.state === "loading" ? (
        <span>Loading source details…</span>
      ) : resource.data ? (
        <dl>
          <div><dt>Last success</dt><dd>{resource.data.last_success_at || "—"}</dd></div>
          <div><dt>Retrieved</dt><dd>{resource.data.retrieved_at || "—"}</dd></div>
          <div><dt>Season</dt><dd>{resource.data.season || "—"}</dd></div>
          <div><dt>Failure</dt><dd>{resource.data.failure_reason || "None reported"}</dd></div>
        </dl>
      ) : <span>{resource.unavailableReason || resource.error || "Source details unavailable."}</span>}
    </details>
  )
}

export const CompactIntraPositionSurface: React.FC<{
  model: IntraPositionPresentationModel | null
  onInspectPlayer: (player: Player) => void
}> = ({model, onInspectPlayer}) => {
  if (!model || model.players.length < 2) return (
    <StateMessage state="unavailable" reason="Two current players at one position are required." />
  )
  return (
    <section aria-label={`${model.position} compact comparison`}>
      <p className={styles.caption}>
        Top {model.position} options · {model.totalAvailablePlayerCount} available
      </p>
      <table className={styles.table}>
        <thead><tr><th>Player</th><th>Rank</th><th>Tier</th><th>PPG band</th></tr></thead>
        <tbody>
          {model.players.slice(0, 3).map(item => (
            <tr key={item.player.id}>
              <th scope="row">
                <button onClick={() => onInspectPlayer(item.player)} type="button">
                  {item.player.fullName}
                </button>
                <small>{item.player.team}</small>
              </th>
              <td>{item.positionRank === null ? "—" : item.positionRank}</td>
              <td>{item.activeTier === null ? "—" : item.activeTier}</td>
              <td>{item.projection.floor !== null && item.projection.ceiling !== null
                ? `${number(item.projection.floor)}–${number(item.projection.ceiling)}`
                : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

export const HistoricalRiskRewardSurface: React.FC<{
  model: HistoricalInsightModel
}> = ({model}) => {
  if (model.players.length === 0 || !["ready", "stale"].includes(model.state)) {
    return <StateMessage state={model.state} reason={model.unavailableReason || model.error} />
  }
  const minimum = Math.min(...model.players.map(player => player.distribution.p10))
  const maximum = Math.max(...model.players.map(player => player.distribution.p90))
  return (
    <section aria-label="Historical risk and reward comparison">
      <p className={styles.caption}>
        Weekly P10–P90 · {model.seasons.join("–")} · {model.scoringProfile?.toUpperCase()}
      </p>
      <ul className={styles.rangeList}>
        {model.players.map(player => {
          const start = percent(player.distribution.p10, minimum, maximum)
          const end = percent(player.distribution.p90, minimum, maximum)
          const median = percent(player.distribution.p50, minimum, maximum)
          const width = Math.min(100, Math.max(1, end - start))
          const left = Math.min(start, 100 - width)
          return (
            <li key={player.player_id}>
              <div className={styles.rangeHeading}>
                <strong>{player.player_name}</strong>
                <span>σ {number(player.distribution.std_dev)}</span>
              </div>
              <div
                aria-label={`${player.player_name}: P10 ${number(player.distribution.p10)}, median ${number(player.distribution.p50)}, P90 ${number(player.distribution.p90)}`}
                className={styles.rangeTrack}
                role="img"
              >
                <span className={styles.rangeBand} style={{left: `${left}%`, width: `${width}%`}} />
                <span className={styles.medianMarker} style={{left: `${median}%`, transform: median >= 100 ? "translateX(-100%)" : median <= 0 ? "none" : "translateX(-50%)"}} />
              </div>
              <div className={styles.rangeLabels}>
                <span>{number(player.distribution.p10)}</span>
                <span>{number(player.distribution.p50)} median</span>
                <span>{number(player.distribution.p90)}</span>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export const HistoricalProductionSurface: React.FC<{
  model: HistoricalInsightModel
}> = ({model}) => {
  if (model.players.length === 0 || !["ready", "stale"].includes(model.state)) {
    return <StateMessage state={model.state} reason={model.unavailableReason || model.error} />
  }
  const maximum = Math.max(1, ...model.players.flatMap(player => (
    player.season_distributions.map(season => season.distribution.mean)
  )))
  return (
    <section aria-label="Historical production comparison">
      <p className={styles.caption}>Completed-season weekly means; games are shown beside each bar.</p>
      <ul className={styles.productionList}>
        {model.players.map(player => (
          <li key={player.player_id}>
            <strong>{player.player_name}</strong>
            {player.season_distributions.map(season => (
              <div className={styles.productionRow} key={season.season}>
                <span>{season.season}</span>
                <div className={styles.productionTrack}>
                  <i style={{width: `${(season.distribution.mean / maximum) * 100}%`}} />
                </div>
                <b>{number(season.distribution.mean)}</b>
                <small>{season.distribution.games}g</small>
              </div>
            ))}
          </li>
        ))}
      </ul>
    </section>
  )
}

export const RankTierDisagreementSurface: React.FC<{
  model: RankTierDisagreementModel
}> = ({model}) => model.state !== "ready" ? (
  <StateMessage state={model.state} reason={model.unavailableReason} />
) : (
  <section aria-label="Rank and tier disagreement">
    <p className={styles.caption}>Positional ranks from published board sources; lower is better.</p>
    <ul className={styles.disagreementList}>
      {model.players.map(player => (
        <li key={player.id}>
          <div><strong>{player.name}</strong><span>{player.position} · {player.rankSpread}-spot spread</span></div>
          <div className={styles.sourceRanks}>
            {player.ranks.map(rank => (
              <span key={rank.source}>
                {rank.source} <b>{rank.rank}</b>{rank.tier === null ? "" : ` · T${rank.tier}`}
              </span>
            ))}
          </div>
        </li>
      ))}
    </ul>
  </section>
)

export const PlayerStatusInsightSurface: React.FC<{
  model: PlayerStatusInsightModel
}> = ({model}) => {
  const events = model.items.flatMap(item => item.events.map(event => ({item, event})))
  if (events.length === 0) return (
    <StateMessage state={model.state} reason={model.unavailableReason} />
  )
  return (
    <section aria-label="Actionable player status">
      <ul className={styles.statusList}>
        {events.map(({item, event}) => (
          <li key={`${item.player.id}:${event.id}`}>
            <div><strong>{item.player.fullName}</strong><span data-impact={event.recommendation_impact}>{event.recommendation_impact}</span></div>
            <p>{event.short_summary}</p>
            <small>{playerStatusSourceLabel(event.source)}{event.stale ? " · stale" : ""}</small>
          </li>
        ))}
      </ul>
    </section>
  )
}

export const SourceReadinessSurface: React.FC<{
  model: SourceReadinessInsightModel
}> = ({model}) => (
  <section aria-label="Published data source readiness">
    {model.error && <StateMessage state="error" reason={model.error} />}
    {model.unavailableReason && <p className={styles.sourceWarning}>{model.unavailableReason}</p>}
    <p className={styles.caption}>
      Historical seasons: {model.historicalSeasons.length > 0
        ? model.historicalSeasons.join(", ") : "unavailable"}
    </p>
    <table className={styles.table}>
      <thead><tr><th>Ranking source</th><th>State</th><th>Records</th></tr></thead>
      <tbody>{model.rankingSources.map(source => (
        <tr key={source.id}>
          <th scope="row">{source.provider_name}</th>
          <td>{source.availability}</td>
          <td>{source.record_count ?? "—"}</td>
        </tr>
      ))}</tbody>
    </table>
    <div className={styles.sourceDetails}>
      {model.rankingSources.map(source => (
        <RankingSourceDetail
          key={source.id}
          label={source.provider_name}
          sourceId={source.id}
        />
      ))}
    </div>
    <table className={styles.table}>
      <thead><tr><th>Status dataset</th><th>State</th><th>Records</th></tr></thead>
      <tbody>{model.statusSources.map(source => (
        <tr key={`${source.provider}:${source.dataset}`}>
          <th scope="row">{source.dataset.replaceAll("_", " ")}</th>
          <td>{source.availability} · {source.freshness}</td>
          <td>{source.record_count}</td>
        </tr>
      ))}</tbody>
    </table>
  </section>
)
