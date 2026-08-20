import React, { useEffect, useMemo, useRef, useState } from "react"

import {
  formatEvidenceProbability,
  formatProjectionValue,
} from "../../behavior/analysis/positionalBests"
import type {
  TierLandscapeLaneModel,
  TierLandscapePlayerModel,
  TierLandscapePosition,
  TierLandscapePresentationModel,
  TierLandscapeTierBandModel,
} from "../../behavior/analysis/tierLandscape"
import type { Player } from "../../types"
import styles from "./AnalysisRedesign.module.css"

interface TierLandscapeLiveSurfaceProps {
  model: TierLandscapePresentationModel | null
  onInspectPlayer: (player: Player) => void
  runwayForecast?: TierRunwayForecast
  /** Standalone behavior remains enabled unless a parent owns announcements. */
  announceUpdates?: boolean
}

export interface TierRunwayHorizon {
  turn: 1 | 2 | 3
  runProbability: number | null
  tierExhaustionProbability: number | null
}

export type TierRunwayForecast = Partial<Record<
  TierLandscapePosition,
  TierRunwayHorizon[]
>>

const TIER_COLORS = ["#4f46e5", "#0891b2", "#d97706", "#64748b"]
const POSITION_COLORS: Record<TierLandscapePosition, string> = {
  QB: "#7c3aed",
  RB: "#0891b2",
  WR: "#db2777",
  TE: "#d97706",
}

const tierColor = (tier: number | null): string => (
  tier === null ? TIER_COLORS[3] : TIER_COLORS[Math.min(3, Math.max(0, tier - 1))]
)

const positionProjectionScale = (lane: TierLandscapeLaneModel) => {
  const values = lane.players.filter(player => player.primaryTier !== null)
    .flatMap(player => [
    player.projection.floor,
    player.projection.median,
    player.projection.ceiling,
  ]).filter((value): value is number => typeof value === "number" && Number.isFinite(value))
  if (values.length === 0) return {minimum: 0, maximum: 1, available: false}
  const minimum = Math.floor(Math.min(...values))
  const rawMaximum = Math.ceil(Math.max(...values))
  return {
    minimum,
    maximum: rawMaximum === minimum ? minimum + 1 : rawMaximum,
    available: true,
  }
}

const positionProjectionTicks = (
  lane: TierLandscapeLaneModel,
): number[] => {
  const scale = positionProjectionScale(lane)
  return Array.from({length: 5}, (_, index) => (
    scale.minimum + ((scale.maximum - scale.minimum) * index) / 4
  ))
}

const RangeRow: React.FC<{
  isShortlisted: boolean
  player: TierLandscapePlayerModel
  lane: TierLandscapeLaneModel
  onInspectPlayer: (player: Player) => void
  onToggleShortlist: (playerId: string) => void
}> = ({isShortlisted, player, lane, onInspectPlayer, onToggleShortlist}) => {
  const scale = positionProjectionScale(lane)
  const percent = (value: number | null): number | null => (
    value === null || !scale.available
      ? null
      : ((value - scale.minimum) / (scale.maximum - scale.minimum)) * 100
  )
  const start = percent(player.projection.floor)
  const median = percent(player.projection.median)
  const end = percent(player.projection.ceiling)
  const color = tierColor(player.primaryTier)
  const visualStyle = {
    "--median-left": `${median ?? 0}%`,
    "--range-left": `${start ?? 0}%`,
    "--range-width": `${start !== null && end !== null
      ? Math.max(1, end - start)
      : 0}%`,
    "--series-color": color,
  } as React.CSSProperties

  return (
    <div className={styles.rangeRow}>
      <span className={styles.rangePlayerControl}>
        <button
          aria-label={`Inspect ${player.player.fullName}`}
          className={styles.rangePlayerButton}
          onClick={() => onInspectPlayer(player.player)}
          type="button"
        >
          <strong>{player.player.fullName}</strong>
          <span>{player.player.team || "FA"} · {player.positionRankSourceLabel} #{player.positionRank ?? "—"} · Tier {player.primaryTier}</span>
        </button>
        <button
          aria-label={`${isShortlisted ? "Remove" : "Add"} ${player.player.fullName} ${isShortlisted ? "from" : "to"} short list`}
          aria-pressed={isShortlisted}
          className={styles.starButton}
          onClick={() => onToggleShortlist(player.player.id)}
          title={isShortlisted ? "Remove from short list" : "Add to short list"}
          type="button"
        >
          {isShortlisted ? "★" : "☆"}
        </button>
      </span>
      <span
        aria-label={`${player.player.fullName}: floor ${formatProjectionValue(player.projection.floor)}, median ${formatProjectionValue(player.projection.median)}, ceiling ${formatProjectionValue(player.projection.ceiling)} projected points per game`}
        className={styles.rangeTrack}
        role="img"
        style={visualStyle}
      >
        {start !== null && end !== null && (
          <span aria-hidden="true" className={styles.rangeBand} />
        )}
        {median !== null && (
          <span aria-hidden="true" className={styles.rangeMedian} />
        )}
      </span>
      <span className={styles.breakpointValues}>
        <span><strong>{formatProjectionValue(player.projection.floor)}</strong>Floor</span>
        <span><strong>{formatProjectionValue(player.projection.median)}</strong>Median</span>
        <span><strong>{formatProjectionValue(player.projection.ceiling)}</strong>Ceiling</span>
      </span>
    </div>
  )
}

const forecastHorizonLabel = (
  model: TierLandscapePresentationModel,
): string => {
  const horizon = model.forecastHorizon
  if (horizon === null) return "Unavailable"
  if (horizon.pickCount === 0) return "No valid supplied opponent picks"
  if (horizon.firstOverallPick === null || horizon.lastOverallPick === null) {
    return `${horizon.pickCount} supplied opponent pick${horizon.pickCount === 1 ? "" : "s"}`
  }
  return horizon.firstOverallPick === horizon.lastOverallPick
    ? `1 supplied opponent pick · ${horizon.firstOverallPick}`
    : `${horizon.pickCount} supplied opponent picks · ${horizon.firstOverallPick}–${horizon.lastOverallPick}`
}

const landscapeUpdateKey = (
  model: TierLandscapePresentationModel | null,
): string => {
  if (!model) return "unavailable"
  return JSON.stringify({
    currentPick: model.currentPick,
    nextUserPick: model.nextUserPick,
    picksBeforeNextUserPick: model.picksBeforeNextUserPick,
    forecastHorizon: model.forecastHorizon,
    projectionScale: model.projectionScale,
    lanes: model.lanes.map(lane => ({
      position: lane.position,
      availablePlayerCount: lane.availablePlayerCount,
      totalTierBandCount: lane.totalTierBandCount,
      hiddenTierBandCount: lane.hiddenTierBandCount,
      primaryTierSourceLabel: lane.primaryTierSourceLabel,
      currentTopAvailableTier: lane.currentTopAvailableTier,
      run: lane.run,
      players: lane.players.map(player => ({
        id: player.player.id,
        rank: player.positionRank,
        tier: player.primaryTier,
        projection: player.projection,
        survivalProbability: player.survivalProbability,
      })),
      visibleTierBands: lane.visibleTierBands.map(band => ({
        id: band.id,
        label: band.label,
        sourceLabel: band.sourceLabel,
        availablePlayerCount: band.availablePlayerCount,
        hiddenPlayerCount: band.hiddenPlayerCount,
        players: band.players.map(player => ({
          id: player.player.id,
          fullName: player.player.fullName,
          team: player.player.team,
          position: player.player.position,
          positionRank: player.positionRank,
          positionRankSourceLabel: player.positionRankSourceLabel,
          primaryTier: player.primaryTier,
          primaryTierSourceLabel: player.primaryTierSourceLabel,
          projectionTier: player.projectionTier,
          floor: player.projection.floor,
          median: player.projection.median,
          ceiling: player.projection.ceiling,
          startPercent: player.projection.startPercent,
          medianPercent: player.projection.medianPercent,
          endPercent: player.projection.endPercent,
          survivalProbability: player.survivalProbability,
        })),
      })),
    })),
  })
}

const ProjectionRangeOverlay: React.FC<{
  player: TierLandscapePlayerModel
  model: TierLandscapePresentationModel
}> = ({player, model}) => {
  const {projection} = player
  const rangeWidth = projection.startPercent !== null
    && projection.endPercent !== null
    ? Math.max(0, projection.endPercent - projection.startPercent)
    : 0
  const isPoint = rangeWidth === 0
  const rangeLeft = projection.startPercent === null
    ? null
    : isPoint
      ? Math.min(99, projection.startPercent)
      : projection.startPercent
  const ariaLabel = `${player.player.fullName} projection range overlay: `
    + `floor ${formatProjectionValue(projection.floor)} PPG, `
    + `median ${formatProjectionValue(projection.median)} PPG, `
    + `ceiling ${formatProjectionValue(projection.ceiling)} PPG.`

  return (
    <section
      aria-label={`${player.player.fullName} projection range overlay`}
      className="mt-3 rounded border border-indigo-100 bg-indigo-50 p-2"
    >
      <div className="flex flex-wrap items-center justify-between gap-1">
        <h6 className="text-xs font-semibold uppercase tracking-wide text-indigo-800">
          Projection range · overlay only
        </h6>
        <span className="text-xs text-indigo-700">
          {model.projectionScale.hasFiniteValues
            ? `Shared PPG scale ${model.projectionScale.minimum.toFixed(1)}–${model.projectionScale.maximum.toFixed(1)}`
            : "Shared PPG scale unavailable"}
        </span>
      </div>
      <div
        aria-label={ariaLabel}
        className="mt-2 h-6 rounded border border-indigo-200 bg-white p-1"
        role="img"
      >
        <div aria-hidden="true" className="relative h-full">
          {projection.startPercent !== null
            && projection.endPercent !== null && (
            <span
              className="absolute top-1/2 h-2 -translate-y-1/2 rounded border-2 border-indigo-700 bg-indigo-200"
              data-testid={`tier-landscape-projection-${player.player.id}`}
              style={{
                left: `${rangeLeft}%`,
                width: `${isPoint ? 1 : rangeWidth}%`,
              }}
            />
          )}
          {projection.medianPercent !== null && (
            <span
              className="absolute top-0 h-full w-0.5 bg-slate-950"
              style={{left: `${projection.medianPercent}%`}}
            />
          )}
        </div>
      </div>
      <dl className="mt-2 grid grid-cols-3 gap-1 text-xs">
        <div>
          <dt className="text-indigo-700">Floor</dt>
          <dd className="font-semibold text-indigo-950">
            {formatProjectionValue(projection.floor)} PPG
          </dd>
        </div>
        <div>
          <dt className="text-indigo-700">Median</dt>
          <dd className="font-semibold text-indigo-950">
            {formatProjectionValue(projection.median)} PPG
          </dd>
        </div>
        <div>
          <dt className="text-indigo-700">Ceiling</dt>
          <dd className="font-semibold text-indigo-950">
            {formatProjectionValue(projection.ceiling)} PPG
          </dd>
        </div>
      </dl>
    </section>
  )
}

const TierLandscapePlayerCard: React.FC<{
  player: TierLandscapePlayerModel
  model: TierLandscapePresentationModel
  onInspectPlayer: (player: Player) => void
}> = ({player, model, onInspectPlayer}) => (
  <li className="min-w-0 rounded border border-slate-200 bg-white p-3">
    <article aria-labelledby={`tier-landscape-player-${player.player.id}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h5
            className="truncate font-semibold text-slate-950"
            id={`tier-landscape-player-${player.player.id}`}
          >
            {player.player.fullName}
          </h5>
          <p className="text-xs text-slate-500">
            {player.player.position}
            {player.player.team ? ` · ${player.player.team}` : ""}
          </p>
        </div>
        <button
          aria-label={`Inspect ${player.player.fullName} comparison`}
          className="shrink-0 rounded border border-indigo-300 bg-white px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
          onClick={() => onInspectPlayer(player.player)}
          type="button"
        >
          Inspect
        </button>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded bg-slate-50 p-2">
          <dt className="text-slate-500">
            Position rank · {player.positionRankSourceLabel}
          </dt>
          <dd className="font-semibold text-slate-950">
            {player.positionRank === null
              ? "Unavailable"
              : `${player.player.position}${player.positionRank}`}
          </dd>
        </div>
        <div className="rounded bg-violet-50 p-2">
          <dt className="text-violet-700">
            Primary tier · {player.primaryTierSourceLabel}
          </dt>
          <dd className="font-semibold text-violet-950">
            {player.primaryTier === null
              ? "Unavailable"
              : `Tier ${player.primaryTier}`}
          </dd>
        </div>
        <div className="col-span-2 rounded bg-indigo-50 p-2">
          <dt className="text-indigo-700">Projection tier · overlay only</dt>
          <dd className="font-semibold text-indigo-950">
            {player.projectionTier === null
              ? "Unavailable"
              : `Tier ${player.projectionTier}`}
          </dd>
        </div>
        <div className="col-span-2 rounded border border-slate-200 p-2">
          <dt className="text-slate-500">
            Survival to next user pick · supplied player probabilities
          </dt>
          <dd className="font-semibold text-slate-950">
            {formatEvidenceProbability(player.survivalProbability)}
          </dd>
        </div>
      </dl>
      <ProjectionRangeOverlay model={model} player={player} />
    </article>
  </li>
)

const TierBand: React.FC<{
  band: TierLandscapeTierBandModel
  lane: TierLandscapeLaneModel
  model: TierLandscapePresentationModel
  onInspectPlayer: (player: Player) => void
}> = ({band, lane, model, onInspectPlayer}) => {
  const headingId = `tier-landscape-${lane.position}-${band.id}`
  return (
    <li>
      <section
        aria-labelledby={headingId}
        className="rounded-lg border border-violet-100 bg-violet-50 p-3"
      >
        <header className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h4 className="font-semibold text-violet-950" id={headingId}>
              {band.label}
            </h4>
            <p className="text-xs text-violet-800">
              {band.sourceLabel} · {band.availablePlayerCount} available
              {band.availablePlayerCount === 1 ? " player" : " players"}
            </p>
          </div>
          {band.hiddenPlayerCount > 0 && (
            <p className="text-xs text-violet-800">
              Showing top {band.players.length}; {band.hiddenPlayerCount} more available
            </p>
          )}
        </header>
        <ol
          aria-label={`${lane.position} ${band.label} leading available players`}
          className="mt-3 grid min-w-0 gap-2 sm:grid-cols-2"
        >
          {band.players.map(player => (
            <TierLandscapePlayerCard
              key={player.player.id}
              model={model}
              onInspectPlayer={onInspectPlayer}
              player={player}
            />
          ))}
        </ol>
      </section>
    </li>
  )
}

const Lane: React.FC<{
  lane: TierLandscapeLaneModel
  model: TierLandscapePresentationModel
  onInspectPlayer: (player: Player) => void
}> = ({lane, model, onInspectPlayer}) => {
  const headingId = `tier-landscape-lane-${lane.position}`
  const current = lane.currentTopAvailableTier
  const tieredBands = lane.visibleTierBands.filter(band => band.tier !== null)
  const runLabel = lane.run.probability === null
    ? "Unavailable"
    : `${formatEvidenceProbability(lane.run.probability)}${
      lane.run.minimumPicks === null
        ? " · modeled length unavailable"
        : ` · at least ${lane.run.minimumPicks} positional ${
          lane.run.minimumPicks === 1 ? "pick" : "picks"
        }`
    }`
  return (
    <section
      aria-labelledby={headingId}
      className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3"
      data-testid={`tier-landscape-lane-${lane.position}`}
    >
      <header>
        <h3 className="text-lg font-bold text-slate-950" id={headingId}>
          {lane.position}
        </h3>
        <p className="text-xs text-slate-600">
          Primary tier source: {lane.primaryTierSourceLabel}
        </p>
        <p className="mt-1 text-xs text-slate-600">
          {lane.availablePlayerCount} available {lane.availablePlayerCount === 1
            ? "player"
            : "players"} across {lane.totalTierBandCount} tier {lane.totalTierBandCount === 1
            ? "band"
            : "bands"}.
          {lane.hiddenTierBandCount > 0 && (
            <> {lane.hiddenTierBandCount} later tier {lane.hiddenTierBandCount === 1
              ? "band is"
              : "bands are"} omitted from this bounded landscape.</>
          )}
        </p>
      </header>
      {current ? (
        <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
          <div className="rounded bg-white p-2">
            <dt className="text-slate-500">Current top available tier</dt>
            <dd className="font-semibold text-slate-950">{current.label}</dd>
            <p className="mt-1 text-slate-600">
              {current.availablePlayerCount} available in this tier
            </p>
          </div>
          <div className="rounded bg-white p-2">
            <dt className="text-slate-500">
              Current-tier exhaustion · supplied forecast
            </dt>
            <dd className="font-semibold text-slate-950">
              {formatEvidenceProbability(current.exhaustionProbability)}
            </dd>
            {current.exhaustionUnavailableReason && (
              <p className="mt-1 text-slate-600">
                {current.exhaustionUnavailableReason}
              </p>
            )}
          </div>
          <div className="rounded bg-white p-2">
            <dt className="text-slate-500">Modeled positional run · supplied</dt>
            <dd className="font-semibold text-slate-950">{runLabel}</dd>
          </div>
          {current.activeTierBoundary && (
            <div className="rounded bg-white p-2">
              <dt className="text-slate-500">
                Active board tier exhaustion · supplied forecast
              </dt>
              <dd className="font-semibold text-slate-950">
                {current.activeTierBoundary.sourceLabel} {current.activeTierBoundary.tier}
                {" · "}
                {formatEvidenceProbability(
                  current.activeTierBoundary.probability,
                )}
              </dd>
              {current.activeTierBoundary.unavailableReason && (
                <p className="mt-1 text-slate-600">
                  {current.activeTierBoundary.unavailableReason}
                </p>
              )}
            </div>
          )}
        </dl>
      ) : (
        <p className="mt-3 rounded border border-dashed border-slate-300 bg-white p-3 text-sm text-slate-600" role="status">
          No explicitly available {lane.position} players are supplied for the live landscape.
        </p>
      )}
      {tieredBands.length > 0 && (
        <ol
          aria-label={`${lane.position} visible tier bands`}
          className="mt-3 space-y-3"
        >
          {tieredBands.map(band => (
            <TierBand
              band={band}
              key={band.id}
              lane={lane}
              model={model}
              onInspectPlayer={onInspectPlayer}
            />
          ))}
        </ol>
      )}
    </section>
  )
}

const TierLandscapeLiveSurface: React.FC<TierLandscapeLiveSurfaceProps> = ({
  model,
  onInspectPlayer,
  runwayForecast = {},
  announceUpdates = true,
}) => {
  const previousUpdateKey = useRef<string | null>(null)
  const announcementCount = useRef(0)
  const [announcement, setAnnouncement] = useState("")
  const [selectedPosition, setSelectedPosition] = useState<TierLandscapePosition | null>(null)
  const [displayMode, setDisplayMode] = useState<"available" | "shortlist">("available")
  const [shortlistedIds, setShortlistedIds] = useState<string[]>([])
  const updateKey = landscapeUpdateKey(model)
  const selectedLane = useMemo(() => (
    model?.lanes.find(lane => lane.position === selectedPosition)
      || model?.lanes[0]
      || null
  ), [model, selectedPosition])
  const displayedPlayers = useMemo(() => (
    selectedLane?.players.filter(player => (
      player.primaryTier !== null
      && (displayMode === "available" || shortlistedIds.includes(player.player.id))
    )) || []
  ), [displayMode, selectedLane, shortlistedIds])
  const toggleShortlist = (playerId: string) => setShortlistedIds(current => (
    current.includes(playerId)
      ? current.filter(id => id !== playerId)
      : [...current, playerId]
  ))

  useEffect(() => {
    const availableIds = new Set(model?.lanes.flatMap(lane => (
      lane.players.filter(player => player.primaryTier !== null)
        .map(player => player.player.id)
    )) || [])
    setShortlistedIds(current => {
      const valid = current.filter(id => availableIds.has(id))
      return valid.length === current.length ? current : valid
    })
  }, [model])

  useEffect(() => {
    if (announceUpdates && previousUpdateKey.current !== null && previousUpdateKey.current !== updateKey) {
      announcementCount.current += 1
      if (!model) {
        setAnnouncement(
          `Live tier landscape is unavailable. Update ${announcementCount.current}.`,
        )
      } else {
        const summary = model.lanes
          .filter(lane => lane.currentTopAvailableTier !== null)
          .map(lane => `${lane.position} ${lane.currentTopAvailableTier?.label}`)
          .join("; ")
        setAnnouncement(
          `Live tier landscape updated. ${summary || "No available positional tiers."} `
          + `Update ${announcementCount.current}.`,
        )
      }
    }
    previousUpdateKey.current = updateKey
  }, [announceUpdates, model, updateKey])

  if (!model) {
    return (
      <section
        aria-labelledby="live-tier-landscape-title"
        className="rounded-lg border border-violet-200 bg-violet-50 p-3 text-left"
      >
        <h2 className="font-semibold text-violet-950" id="live-tier-landscape-title">
          Live positional tier landscape unavailable
        </h2>
        <p className="mt-1 text-sm text-violet-900">
          Explicit available-player data is not available yet. Historical
          drilldown below remains available when you run it manually.
        </p>
        {announceUpdates && <div aria-live="polite" className="sr-only" role="status">
          {announcement}
        </div>}
      </section>
    )
  }

  return (
    <section
      aria-labelledby="live-tier-landscape-title"
      className="rounded-2xl border-2 border-slate-300 bg-slate-100 p-4 text-left shadow-sm md:p-5"
    >
      <header>
        <p className="text-xs font-bold uppercase tracking-wide text-indigo-700">
          Position tiers
        </p>
        <h2 className="text-2xl font-bold text-slate-950" id="live-tier-landscape-title">
          Where will each tier run out?
        </h2>
        <p className="mt-1 max-w-4xl text-sm text-slate-700">
          Choose a position to see every available player on its own
          projected-points scale. Color identifies the player tier; the three
          values are floor, median, and ceiling.
        </p>
      </header>

      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-slate-300 bg-white p-3"><dt className="text-slate-500">Current pick</dt><dd className="font-semibold text-slate-950">{model.currentPick ?? "Unavailable"}</dd></div>
        <div className="rounded-lg border border-slate-300 bg-white p-3"><dt className="text-slate-500">Next user pick</dt><dd className="font-semibold text-slate-950">{model.nextUserPick ?? "Unavailable"}</dd></div>
        <div className="rounded-lg border border-slate-300 bg-white p-3"><dt className="text-slate-500">Picks before next user pick</dt><dd className="font-semibold text-slate-950">{model.picksBeforeNextUserPick ?? "Unavailable"}</dd></div>
        <div className="rounded-lg border border-slate-300 bg-white p-3"><dt className="text-slate-500">Supplied opponent-pick horizon</dt><dd className="font-semibold text-slate-950">{forecastHorizonLabel(model)}</dd></div>
      </dl>
      <p className="mt-3 rounded border border-violet-100 bg-white p-2 text-xs text-violet-900">
        Later-user-pick expected tiers are unavailable: the supplied
        forecast covers only the opponent picks before your next turn.
      </p>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-wide text-indigo-800">Choose a position</p>
        <div className="inline-flex rounded-xl border-2 border-slate-300 bg-slate-200 p-1" role="group" aria-label="Position player display">
          <button aria-pressed={displayMode === "available"} className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-bold text-slate-800 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${displayMode === "available" ? "border-indigo-400 bg-indigo-100 shadow-sm" : "border-transparent hover:bg-white"}`} onClick={() => setDisplayMode("available")} type="button">{displayMode === "available" ? "✓ " : ""}Available players</button>
          <button aria-pressed={displayMode === "shortlist"} className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-bold text-slate-800 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${displayMode === "shortlist" ? "border-indigo-400 bg-indigo-100 shadow-sm" : "border-transparent hover:bg-white"}`} onClick={() => setDisplayMode("shortlist")} type="button">{displayMode === "shortlist" ? "✓ " : ""}Your short list · {shortlistedIds.length}</button>
        </div>
      </div>

      <div className={styles.positionSummaryGrid} role="group" aria-label="Position tier views">
        {model.lanes.map(lane => {
          const scale = positionProjectionScale(lane)
          const tieredPlayers = lane.players.filter(player => (
            player.primaryTier !== null
          ))
          return (
            <button
              aria-pressed={selectedLane?.position === lane.position}
              className={styles.positionSummaryButton}
              key={lane.position}
              onClick={() => setSelectedPosition(lane.position)}
              type="button"
            >
              <span className={styles.positionSummaryTop}>
                <strong>{lane.position}</strong>
                <span>{tieredPlayers.length} tiered</span>
              </span>
              <span aria-hidden="true" className={styles.miniPlot}>
                {tieredPlayers.slice(0, 12).map(player => {
                  const median = player.projection.median
                  const height = median === null || !scale.available
                    ? 3
                    : Math.max(8, ((median - scale.minimum) / (scale.maximum - scale.minimum)) * 100)
                  return <span className={styles.miniBar} key={player.player.id} style={{backgroundColor: tierColor(player.primaryTier), height: `${height}%`}} />
                })}
              </span>
            </button>
          )
        })}
      </div>

      {selectedLane && (
        <>
          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <h3 className={styles.panelTitle}>{selectedLane.position} projection range</h3>
                <p className={styles.panelCaption}>Projected weekly points (PPG) · floor → median → ceiling. Players without a user or board tier are omitted.</p>
              </div>
              <span className={styles.neutralPill}>{displayMode === "available" ? `${displayedPlayers.length} tiered players` : `${displayedPlayers.length} shortlisted`}</span>
            </div>
            <div className={styles.rangeScroll}>
            <div className={styles.rangeCanvas}>
            <div className={styles.rangeHeader} aria-hidden="true">
              <span>Player</span>
              <span className={styles.rangeTicks}>
                {positionProjectionTicks(selectedLane).map((tick, index) => (
                  <span key={`${selectedLane.position}-${tick}`}>{tick.toFixed(1)}{index === 4 ? " PPG" : ""}</span>
                ))}
              </span>
              <span style={{textAlign: "right"}}>Exact breakpoints</span>
            </div>
            <div className={styles.rangeBody}>
              {displayedPlayers.length > 0 ? displayedPlayers.map(player => (
                <RangeRow isShortlisted={shortlistedIds.includes(player.player.id)} key={player.player.id} lane={selectedLane} onInspectPlayer={onInspectPlayer} onToggleShortlist={toggleShortlist} player={player} />
              )) : (
                <p className="p-5 text-sm text-slate-500">{displayMode === "shortlist" ? `No tiered ${selectedLane.position} players are on your short list. Return to Available players and use the star controls to add some.` : `No available ${selectedLane.position} players have a user or board tier.`}</p>
              )}
            </div>
            <div className={styles.tierLegend}>
              {[1, 2, 3, 4].map(tier => (
                <span key={tier} style={{"--series-color": tierColor(tier)} as React.CSSProperties}>
                  <i aria-hidden="true" />Tier {tier === 4 ? "4+" : tier}
                </span>
              ))}
            </div>
            </div>
            </div>
          </div>

          <section className={styles.panel} aria-labelledby="tier-runway-title">
            <div className={styles.panelHeader}>
              <div>
                <h3 className={styles.panelTitle} id="tier-runway-title">Which position may run before each turn?</h3>
                <p className={styles.panelCaption}>Compare every position on the same turn-by-turn runway. Each cell leads with run chance and keeps current-tier exhaustion as separate evidence.</p>
              </div>
              <span className={styles.neutralPill}>Next-pick horizon: {forecastHorizonLabel(model)}</span>
            </div>
            <div className={styles.runwayScroll}>
              <table className={styles.runwayTable} aria-label="Position run outlook over the next three turns">
                <thead>
                  <tr>
                    <th scope="col">Position</th>
                    <th scope="col">Next turn · +1</th>
                    <th scope="col">Turn +2</th>
                    <th scope="col">Turn +3</th>
                  </tr>
                </thead>
                <tbody>
                  {model.lanes.map(lane => (
                    <tr className={selectedLane.position === lane.position ? styles.runwaySelectedRow : undefined} key={lane.position}>
                      <th scope="row">
                        <button
                          aria-label={`Show ${lane.position} tier details`}
                          aria-pressed={selectedLane.position === lane.position}
                          className={styles.runwayPositionButton}
                          onClick={() => setSelectedPosition(lane.position)}
                          type="button"
                        >
                          <span className={styles.positionBadge} style={{"--series-color": POSITION_COLORS[lane.position]} as React.CSSProperties}>{lane.position}</span>
                          <span>{lane.currentTopAvailableTier?.label || "Tier unavailable"}</span>
                        </button>
                      </th>
                      {([1, 2, 3] as const).map(turn => {
                        const supplied = runwayForecast[lane.position]?.find(
                          horizon => horizon.turn === turn,
                        )
                        const hasForecast = turn === 1 || Boolean(supplied)
                        const runProbability = supplied?.runProbability
                          ?? (turn === 1 ? lane.run.probability : null)
                        const exhaustionProbability = supplied?.tierExhaustionProbability
                          ?? (turn === 1
                            ? lane.currentTopAvailableTier?.exhaustionProbability ?? null
                            : null)
                        return (
                          <td key={turn}>
                            {hasForecast ? (
                              <div className={styles.runwayCell}>
                                <div className={styles.runwayCellValue}>
                                  <strong>{runProbability === null ? "Run not supplied" : `${(runProbability * 100).toFixed(0)}% run chance`}</strong>
                                </div>
                                <div className={styles.runwayCellTrack} aria-hidden="true">
                                  {runProbability !== null && (
                                    <span style={{
                                      backgroundColor: POSITION_COLORS[lane.position],
                                      width: `${runProbability * 100}%`,
                                    }} />
                                  )}
                                </div>
                                <span className={styles.runwayCellNote}>Current tier gone: {exhaustionProbability === null ? "not supplied" : `${(exhaustionProbability * 100).toFixed(0)}%`}</span>
                              </div>
                            ) : (
                              <span className={styles.runwayMissing}>Not forecast</span>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-slate-500">Next turn uses the current opponent forecast across all four positions. Turn +2 and +3 stay marked Not forecast until optional runway evidence is supplied.</p>
          </section>
        </>
      )}
      {announceUpdates && <div aria-live="polite" className="sr-only" role="status">
        {announcement}
      </div>}

      <details className="mt-4 rounded-xl border-2 border-slate-300 bg-white">
        <summary className="cursor-pointer rounded-xl p-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">Detailed tier and forecast evidence</summary>
        <div className="grid min-w-0 gap-3 border-t border-violet-100 p-3 xl:grid-cols-2">
          {model.lanes.map(lane => <Lane key={lane.position} lane={lane} model={model} onInspectPlayer={onInspectPlayer} />)}
        </div>
      </details>
    </section>
  )
}

export default TierLandscapeLiveSurface
