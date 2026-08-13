import React, { useEffect, useRef, useState } from "react"

import {
  IntraPositionPlayerModel,
  IntraPositionPresentationModel,
} from "../../behavior/analysis/intraPosition"
import { formatProjectionValue } from "../../behavior/analysis/positionalBests"
import { playerStatusSourceLabel } from "../../behavior/api/playerStatus"
import type { Player } from "../../types"

interface IntraPositionLiveSurfaceProps {
  model: IntraPositionPresentationModel
  onInspectPlayer: (player: Player) => void
}

const timestampLabel = (value: string): string => (
  value.replace("T", " ").replace(/:00Z$/, " UTC")
)

const formatSpread = (value: number | null): string => (
  value === null ? "Unavailable" : `${value.toFixed(1)} PPG`
)

const horizontalMarkerTransform = (percent: number): string => (
  percent <= 0
    ? "translateX(0)"
    : percent >= 100
      ? "translateX(-100%)"
      : "translateX(-50%)"
)

const centeredPointMarkerTransform = (percent: number): string => (
  `${horizontalMarkerTransform(percent)} translateY(-50%)`
)

const renderedStatusFingerprint = (
  candidate: IntraPositionPlayerModel,
) => {
  const actionableEvents = candidate.statusEvidence.map(event => ({
    id: event.id,
    type: event.type,
    recommendationImpact: event.recommendation_impact,
    shortSummary: event.short_summary,
    source: event.source,
    sourceUrl: event.source_url,
    sourcePublishedAt: event.source_published_at,
    fetchedAt: event.fetched_at,
    confidence: event.confidence,
    stale: event.stale,
  }))
  if (actionableEvents.length > 0) {
    return {state: "actionable", events: actionableEvents}
  }
  if (
    candidate.statusState === "loading"
    || candidate.statusState === "unavailable"
  ) {
    return {state: candidate.statusState}
  }
  return null
}

/**
 * Includes every displayed live fact, rather than cache bookkeeping, so an
 * equivalent rerender is quiet while a material availability/evidence change
 * receives one polite announcement.
 */
const shortlistUpdateKey = (model: IntraPositionPresentationModel): string => (
  JSON.stringify({
    position: model.position,
    totalAvailablePlayerCount: model.totalAvailablePlayerCount,
    visiblePlayerCount: model.visiblePlayerCount,
    hiddenPlayerCount: model.hiddenPlayerCount,
    projectionScale: model.projectionScale,
    players: model.players.map(candidate => ({
      shortlistOrder: candidate.shortlistOrder,
      id: candidate.player.id,
      fullName: candidate.player.fullName,
      position: candidate.player.position,
      team: candidate.player.team,
      positionRank: candidate.positionRank,
      positionRankSourceLabel: candidate.positionRankSourceLabel,
      customPositionRank: candidate.customPositionRank,
      customTier: candidate.customTier,
      activeTier: candidate.activeTier,
      activeTierSourceLabel: candidate.activeTierSourceLabel,
      projectionTier: candidate.projectionTier,
      projection: candidate.projection,
      projectionSpread: candidate.projectionSpread,
      status: renderedStatusFingerprint(candidate),
    })),
  })
)

const ProjectionRangeVisualization: React.FC<{
  candidate: IntraPositionPlayerModel
  model: IntraPositionPresentationModel
}> = ({candidate, model}) => {
  const {projection} = candidate
  const rangeStart = projection.startPercent
  const rangeEnd = projection.endPercent
  const hasRange = rangeStart !== null && rangeEnd !== null
  const rangeWidth = rangeStart !== null && rangeEnd !== null
    ? Math.max(0, rangeEnd - rangeStart)
    : 0
  const isPoint = hasRange && rangeWidth === 0
  const ariaLabel = `${candidate.player.fullName} projection risk and reward `
    + `context: floor ${formatProjectionValue(projection.floor)} PPG, `
    + `median ${formatProjectionValue(projection.median)} PPG, `
    + `ceiling ${formatProjectionValue(projection.ceiling)} PPG, `
    + `spread ${formatSpread(candidate.projectionSpread)}.`

  return (
    <section
      aria-label={`${candidate.player.fullName} projection risk and reward context`}
      className="mt-3 rounded-lg border-2 border-indigo-200 bg-indigo-50 p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-1">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-indigo-800">
          Projection range · downside to upside
        </h4>
        <span className="text-xs text-indigo-700">
          {model.projectionScale.hasFiniteValues
            ? `Shared PPG scale ${model.projectionScale.minimum.toFixed(1)}–${model.projectionScale.maximum.toFixed(1)}`
            : "Shared PPG scale unavailable"}
        </span>
      </div>
      <div
        aria-label={ariaLabel}
        className="mt-2 h-10 overflow-hidden rounded-lg border-2 border-slate-300 bg-white p-1"
        role="img"
        style={{backgroundImage: "linear-gradient(to right, #e2e8f0 1px, transparent 1px)", backgroundSize: "25% 100%"}}
      >
        <div aria-hidden="true" className="relative h-full">
          {hasRange && isPoint && rangeStart !== null && (
            <span
              className="absolute top-1/2 h-3 w-1 rounded bg-indigo-700"
              data-testid={`intra-position-projection-point-${candidate.player.id}`}
              style={{
                left: `${rangeStart}%`,
                transform: centeredPointMarkerTransform(rangeStart),
              }}
            />
          )}
          {hasRange && !isPoint && rangeStart !== null && (
            <span
              className="absolute top-1/2 h-3 -translate-y-1/2 rounded border-2 border-indigo-700 bg-indigo-200 shadow-sm"
              data-testid={`intra-position-projection-range-${candidate.player.id}`}
              style={{
                left: `${rangeStart}%`,
                width: `${rangeWidth}%`,
              }}
            />
          )}
          {projection.medianPercent !== null && (
            <span
              className="absolute top-0 h-full w-1 rounded bg-slate-950"
              data-testid={`intra-position-projection-median-${candidate.player.id}`}
              style={{
                left: `${projection.medianPercent}%`,
                transform: horizontalMarkerTransform(projection.medianPercent),
              }}
            />
          )}
        </div>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-indigo-700">Floor · downside</dt>
          <dd className="font-semibold text-indigo-950">
            {formatProjectionValue(projection.floor)} PPG
          </dd>
        </div>
        <div>
          <dt className="text-indigo-700">Median · expected</dt>
          <dd className="font-semibold text-indigo-950">
            {formatProjectionValue(projection.median)} PPG
          </dd>
        </div>
        <div>
          <dt className="text-indigo-700">Ceiling · upside</dt>
          <dd className="font-semibold text-indigo-950">
            {formatProjectionValue(projection.ceiling)} PPG
          </dd>
        </div>
        <div>
          <dt className="text-indigo-700">Projection spread · uncertainty</dt>
          <dd className="font-semibold text-indigo-950">
            {formatSpread(candidate.projectionSpread)}
          </dd>
        </div>
      </dl>
      <p className="mt-2 text-xs text-indigo-800">
        The range is projection uncertainty context, not a risk score,
        reward score, or calibrated confidence percentage.
      </p>
    </section>
  )
}

const StatusEvidence: React.FC<{
  candidate: IntraPositionPlayerModel
}> = ({candidate}) => {
  if (candidate.statusEvidence.length === 0) {
    if (candidate.statusState === "unavailable") {
      return (
        <p className="mt-3 rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
          Status provider unavailable; shortlist order, ranks, tiers, and
          projections are unaffected.
        </p>
      )
    }
    if (candidate.statusState === "loading") {
      return (
        <p className="mt-3 text-xs text-slate-500" role="status">
          Loading advisory status evidence…
        </p>
      )
    }
    return null
  }

  return (
    <aside
      aria-label={`${candidate.player.fullName} actionable status evidence`}
      className="mt-3 rounded border border-amber-200 bg-amber-50 p-2"
    >
      <p className="text-xs font-semibold text-amber-950">
        Advisory status evidence
      </p>
      <ul className="mt-1 space-y-2">
        {candidate.statusEvidence.map(event => (
          <li className="text-xs text-amber-950" key={event.id}>
            <p>
              <span className="font-semibold capitalize">
                {event.type.replace(/_/g, " ")}
                {" · "}
                {event.recommendation_impact}
              </span>
              {" — "}
              {event.short_summary}
            </p>
            <p className="text-amber-800">
              {event.source_url ? (
                <a
                  className="underline"
                  href={event.source_url}
                  rel="noreferrer"
                  target="_blank"
                >
                  {playerStatusSourceLabel(event.source)}
                </a>
              ) : (
                playerStatusSourceLabel(event.source)
              )}
              {" · "}
              {(event.confidence * 100).toFixed(0)}% confidence
              {" · "}
              {event.stale ? "stale" : "current"}
              {event.source_published_at && (
                <>
                  {" · "}
                  <time dateTime={event.source_published_at}>
                    published {timestampLabel(event.source_published_at)}
                  </time>
                </>
              )}
              {" · "}
              <time dateTime={event.fetched_at}>
                fetched {timestampLabel(event.fetched_at)}
              </time>
            </p>
          </li>
        ))}
      </ul>
    </aside>
  )
}

const ShortlistCard: React.FC<{
  candidate: IntraPositionPlayerModel
  model: IntraPositionPresentationModel
  onInspectPlayer: (player: Player) => void
}> = ({candidate, model, onInspectPlayer}) => {
  const showActiveTier = candidate.customTier === null
    || candidate.activeTier !== candidate.customTier

  return (
    <li className="min-w-0 rounded-xl border-2 border-slate-300 bg-white p-4 shadow-sm">
      <article aria-labelledby={`intra-position-${candidate.player.id}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-violet-700">
              Shortlist order {candidate.shortlistOrder}
            </p>
            <h3
              className="truncate text-lg font-bold text-slate-950"
              id={`intra-position-${candidate.player.id}`}
            >
              {candidate.player.fullName}
            </h3>
            <p className="text-xs text-slate-500">
              {candidate.player.position}
              {candidate.player.team ? ` · ${candidate.player.team}` : ""}
            </p>
          </div>
          <button
            aria-label={`Inspect ${candidate.player.fullName} comparison`}
            className="shrink-0 cursor-pointer rounded-lg border-2 border-indigo-400 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-900 shadow-sm transition hover:-translate-y-0.5 hover:bg-indigo-100 hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            onClick={() => onInspectPlayer(candidate.player)}
            type="button"
          >
            Inspect comparison
          </button>
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
          {candidate.customTier !== null && (
            <div className="rounded bg-violet-100 p-2">
              <dt className="text-violet-800">Custom user tier</dt>
              <dd className="font-semibold text-violet-950">
                Tier {candidate.customTier}
              </dd>
            </div>
          )}
          {candidate.customPositionRank !== null && (
            <div className="rounded bg-violet-50 p-2">
              <dt className="text-violet-700">Custom user position rank</dt>
              <dd className="font-semibold text-violet-950">
                {candidate.player.position}{candidate.customPositionRank}
              </dd>
            </div>
          )}
          <div className="rounded bg-slate-50 p-2">
            <dt className="text-slate-500">
              Active position rank · {candidate.positionRankSourceLabel}
            </dt>
            <dd className="font-semibold text-slate-950">
              {candidate.positionRank === null
                ? "Unranked"
                : `${candidate.player.position}${candidate.positionRank}`}
            </dd>
          </div>
          {showActiveTier && (
            <div className="rounded bg-slate-50 p-2">
              <dt className="text-slate-500">
                Active tier · {candidate.activeTierSourceLabel}
              </dt>
              <dd className="font-semibold text-slate-950">
                {candidate.activeTier === null
                  ? "Unavailable"
                  : `Tier ${candidate.activeTier}`}
              </dd>
            </div>
          )}
          <div className="col-span-2 rounded bg-indigo-50 p-2">
            <dt className="text-indigo-700">Projection tier · overlay only</dt>
            <dd className="font-semibold text-indigo-950">
              {candidate.projectionTier === null
                ? "Unavailable"
                : `Tier ${candidate.projectionTier}`}
            </dd>
          </div>
        </dl>

        <ProjectionRangeVisualization candidate={candidate} model={model} />
        <StatusEvidence candidate={candidate} />
      </article>
    </li>
  )
}

const IntraPositionLiveSurface: React.FC<IntraPositionLiveSurfaceProps> = ({
  model,
  onInspectPlayer,
}) => {
  const previousUpdateKey = useRef<string | null>(null)
  const announcementCount = useRef(0)
  const [announcement, setAnnouncement] = useState("")
  const updateKey = shortlistUpdateKey(model)

  useEffect(() => {
    if (previousUpdateKey.current !== null && previousUpdateKey.current !== updateKey) {
      announcementCount.current += 1
      if (model.players.length === 0) {
        setAnnouncement(
          `No currently available ${model.position} players in the live shortlist. `
          + `Update ${announcementCount.current}.`,
        )
      } else {
        const visibleNames = model.players.map(candidate =>
          candidate.player.fullName).join(", ")
        setAnnouncement(
          `${model.position} live shortlist updated: ${visibleNames}. `
          + `${model.visiblePlayerCount} of ${model.totalAvailablePlayerCount} currently available player${
            model.totalAvailablePlayerCount === 1 ? "" : "s"
          } visible. Displayed ranks, tiers, projection ranges, and advisory `
          + `status evidence were refreshed. Update ${announcementCount.current}.`,
        )
      }
    }
    previousUpdateKey.current = updateKey
  }, [model, updateKey])

  return (
    <section
      aria-labelledby="live-intra-position-title"
      className="rounded-2xl border-2 border-slate-300 bg-slate-100 p-4 text-left shadow-sm md:p-5"
    >
      <header>
        <p className="text-xs font-bold uppercase tracking-wide text-indigo-700">
          Player lab · current board
        </p>
        <h2 className="text-2xl font-bold text-slate-950" id="live-intra-position-title">
          Compare {model.position} options
        </h2>
        <p className="mt-1 max-w-4xl text-sm text-slate-700">
          Start with up to five available players in board order. Run the
          historical comparison below to see exact weekly breakpoints and the
          previous season on one shared chart.
        </p>
      </header>

      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-4">
        <div className="rounded-lg border border-slate-300 bg-white p-3">
          <dt className="text-slate-500">Selected position</dt>
          <dd className="font-semibold text-slate-950">{model.position}</dd>
        </div>
        <div className="rounded-lg border border-slate-300 bg-white p-3">
          <dt className="text-slate-500">Total currently available</dt>
          <dd className="font-semibold text-slate-950">
            {model.totalAvailablePlayerCount}
          </dd>
        </div>
        <div className="rounded-lg border border-slate-300 bg-white p-3">
          <dt className="text-slate-500">Shown for comparison</dt>
          <dd className="font-semibold text-slate-950">
            {model.visiblePlayerCount}
          </dd>
        </div>
        <div className="rounded-lg border border-slate-300 bg-white p-3">
          <dt className="text-slate-500">More available</dt>
          <dd className="font-semibold text-slate-950">
            {model.hiddenPlayerCount}
          </dd>
        </div>
      </dl>

      <p className="mt-3 rounded border border-indigo-100 bg-white p-2 text-xs text-indigo-950">
        The live ranges are projections. Historical scoring variance is kept
        separate and loads only when you choose Run analysis. Additional risk
        and synergy evidence remains unavailable until reliable structured
        contracts exist.
      </p>
      <div aria-live="polite" className="sr-only" role="status">
        {announcement}
      </div>

      {model.players.length === 0 ? (
        <div
          className="mt-3 rounded-lg border border-dashed border-violet-300 bg-white p-5 text-sm text-violet-950"
          role="status"
        >
          <p className="font-semibold">
            No currently available {model.position} players.
          </p>
          <p className="mt-1">
            The supplied live availability collection has no eligible player at
            this position. The separate historical Player A and Player B
            drilldown remains manually runnable below.
          </p>
        </div>
      ) : (
        <ol
          aria-label={`Currently available ${model.position} live shortlist`}
          className="mt-3 grid min-w-0 gap-3 xl:grid-cols-3"
        >
          {model.players.map(candidate => (
            <ShortlistCard
              candidate={candidate}
              key={candidate.player.id}
              model={model}
              onInspectPlayer={onInspectPlayer}
            />
          ))}
        </ol>
      )}
    </section>
  )
}

export default IntraPositionLiveSurface
