import React, { useEffect, useRef, useState } from "react"

import {
  formatEvidenceProbability,
  formatProjectionValue,
} from "../../behavior/analysis/positionalBests"
import type {
  TierLandscapeLaneModel,
  TierLandscapePlayerModel,
  TierLandscapePresentationModel,
  TierLandscapeTierBandModel,
} from "../../behavior/analysis/tierLandscape"
import type { Player } from "../../types"

interface TierLandscapeLiveSurfaceProps {
  model: TierLandscapePresentationModel | null
  onInspectPlayer: (player: Player) => void
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
      {lane.visibleTierBands.length > 0 && (
        <ol
          aria-label={`${lane.position} visible tier bands`}
          className="mt-3 space-y-3"
        >
          {lane.visibleTierBands.map(band => (
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
}) => {
  const previousUpdateKey = useRef<string | null>(null)
  const announcementCount = useRef(0)
  const [announcement, setAnnouncement] = useState("")
  const updateKey = landscapeUpdateKey(model)

  useEffect(() => {
    if (previousUpdateKey.current !== null && previousUpdateKey.current !== updateKey) {
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
  }, [model, updateKey])

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
        <div aria-live="polite" className="sr-only" role="status">
          {announcement}
        </div>
      </section>
    )
  }

  return (
    <section
      aria-labelledby="live-tier-landscape-title"
      className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-left"
    >
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">
          Live deterministic draft surface
        </p>
        <h2 className="text-xl font-bold text-violet-950" id="live-tier-landscape-title">
          Positional tier landscape
        </h2>
        <p className="mt-1 max-w-4xl text-sm text-violet-900">
          Available-player density and tiers update from the current draft board.
          Live probabilities come directly from the supplied deterministic
          opponent forecast; projection ranges are secondary overlays.
        </p>
      </header>

      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded bg-white p-2">
          <dt className="text-slate-500">Current pick</dt>
          <dd className="font-semibold text-slate-950">
            {model.currentPick ?? "Unavailable"}
          </dd>
        </div>
        <div className="rounded bg-white p-2">
          <dt className="text-slate-500">Next user pick</dt>
          <dd className="font-semibold text-slate-950">
            {model.nextUserPick ?? "Unavailable"}
          </dd>
        </div>
        <div className="rounded bg-white p-2">
          <dt className="text-slate-500">Picks before next user pick</dt>
          <dd className="font-semibold text-slate-950">
            {model.picksBeforeNextUserPick ?? "Unavailable"}
          </dd>
        </div>
        <div className="rounded bg-white p-2">
          <dt className="text-slate-500">Supplied opponent-pick horizon</dt>
          <dd className="font-semibold text-slate-950">
            {forecastHorizonLabel(model)}
          </dd>
        </div>
      </dl>

      <p className="mt-3 rounded border border-violet-100 bg-white p-2 text-xs text-violet-900">
        Later-user-pick expected tiers are unavailable: the supplied forecast
        covers only the opponent-pick horizon before the next user pick. This
        surface does not create a new expected-tier forecast.
      </p>
      <div aria-live="polite" className="sr-only" role="status">
        {announcement}
      </div>

      <div className="mt-3 grid min-w-0 gap-3 xl:grid-cols-2">
        {model.lanes.map(lane => (
          <Lane
            key={lane.position}
            lane={lane}
            model={model}
            onInspectPlayer={onInspectPlayer}
          />
        ))}
      </div>
    </section>
  )
}

export default TierLandscapeLiveSurface
