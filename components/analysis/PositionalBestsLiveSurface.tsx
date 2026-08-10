import React, { useEffect, useRef, useState } from "react"

import {
  formatEvidenceProbability,
  formatEvidenceValue,
  formatProjectionValue,
  PositionalBestsCandidateModel,
  PositionalBestsPresentationModel,
} from "../../behavior/analysis/positionalBests"
import { playerStatusSourceLabel } from "../../behavior/api/playerStatus"
import type { Player } from "../../types"


interface PositionalBestsLiveSurfaceProps {
  model: PositionalBestsPresentationModel | null
  onInspectPlayer: (player: Player) => void
}

const rosterRoleLabel: Record<
  PositionalBestsCandidateModel["candidate"]["evidence"]["rosterRole"],
  string
> = {
  open_starter: "Open starter",
  flex_upgrade: "Flex upgrade",
  bench: "Bench",
}

const timestampLabel = (value: string): string => (
  value.replace("T", " ").replace(/:00Z$/, " UTC")
)

const candidateUpdateKey = (
  model: PositionalBestsPresentationModel | null,
): string => {
  if (!model) return "unavailable"
  return JSON.stringify({
    currentPick: model.currentPick,
    nextUserPick: model.nextUserPick,
    candidates: model.candidates.map(candidate => ({
      id: candidate.player.id,
      label: candidate.preferenceLabel,
      fallbackNumber: candidate.fallbackNumber,
      positionRank: candidate.positionRank,
      floor: candidate.projection.floor,
      median: candidate.projection.median,
      ceiling: candidate.projection.ceiling,
    })),
  })
}

const ProjectionRangeVisualization: React.FC<{
  candidate: PositionalBestsCandidateModel
  model: PositionalBestsPresentationModel
}> = ({candidate, model}) => {
  const {projection} = candidate
  const rangeWidth = projection.startPercent !== null
    && projection.endPercent !== null
    ? Math.max(1, projection.endPercent - projection.startPercent)
    : 0
  const ariaLabel = `${candidate.player.fullName} projection distribution: `
    + `floor ${formatProjectionValue(projection.floor)} PPG, `
    + `median ${formatProjectionValue(projection.median)} PPG, `
    + `ceiling ${formatProjectionValue(projection.ceiling)} PPG`

  return (
    <section
      aria-label={`${candidate.player.fullName} projection distribution`}
      className="rounded-lg border border-indigo-100 bg-indigo-50 p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-indigo-800">
          Projection range
        </h4>
        <span className="text-xs text-indigo-700">
          {model.projectionScale.hasFiniteValues
            ? `Shared PPG scale ${model.projectionScale.minimum.toFixed(1)}–${model.projectionScale.maximum.toFixed(1)}`
            : "Shared PPG scale unavailable"}
        </span>
      </div>
      <div
        aria-label={ariaLabel}
        className="mt-2 h-7 rounded border border-indigo-200 bg-white p-1"
        role="img"
      >
        <div className="relative h-full" aria-hidden="true">
          {projection.startPercent !== null
            && projection.endPercent !== null && (
            <span
              className="absolute top-1/2 h-2 -translate-y-1/2 rounded border-2 border-indigo-700 bg-indigo-200"
              style={{
                left: `${projection.startPercent}%`,
                width: `${rangeWidth}%`,
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
      <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
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

const StatusEvidence: React.FC<{
  candidate: PositionalBestsCandidateModel
}> = ({candidate}) => {
  if (candidate.statusEvidence.length === 0) {
    if (candidate.statusState === "unavailable") {
      return (
        <p className="mt-2 rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
          Status provider unavailable; rankings and recommendations are unaffected.
        </p>
      )
    }
    if (candidate.statusState === "loading") {
      return (
        <p className="mt-2 text-xs text-slate-500" role="status">
          Loading advisory status evidence…
        </p>
      )
    }
    return null
  }

  return (
    <aside
      aria-label={`${candidate.player.fullName} actionable status evidence`}
      className="mt-2 rounded border border-amber-200 bg-amber-50 p-2"
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

const CandidateCard: React.FC<{
  candidate: PositionalBestsCandidateModel
  model: PositionalBestsPresentationModel
  onInspectPlayer: (player: Player) => void
}> = ({candidate, model, onInspectPlayer}) => {
  const {candidate: recommendation} = candidate
  const showActiveTier = (
    candidate.customTier === null
    || candidate.activeTier !== candidate.customTier
  )

  return (
    <li className="min-w-0 rounded-lg border border-violet-100 bg-white p-3">
      <article aria-labelledby={`positional-best-${candidate.player.id}`}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-violet-700">
              {candidate.preferenceLabel}
              {candidate.fallbackNumber !== null
                ? ` ${candidate.fallbackNumber}`
                : " candidate"}
            </p>
            <h3
              className="text-lg font-bold text-slate-950"
              id={`positional-best-${candidate.player.id}`}
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
            className="shrink-0 rounded border border-indigo-300 bg-white px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
            onClick={() => onInspectPlayer(candidate.player)}
            type="button"
          >
            Inspect comparison
          </button>
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded bg-slate-50 p-2">
            <dt className="text-slate-500">
              Position rank · {candidate.positionRankSourceLabel}
            </dt>
            <dd className="font-semibold text-slate-950">
              {candidate.positionRank === null
                ? "Unavailable"
                : `${candidate.player.position}${candidate.positionRank}`}
            </dd>
          </div>
          {candidate.customPositionRank !== null && (
            <div className="rounded bg-violet-50 p-2">
              <dt className="text-violet-700">Custom position rank</dt>
              <dd className="font-semibold text-violet-950">
                {candidate.player.position}{candidate.customPositionRank}
              </dd>
            </div>
          )}
          {candidate.customTier !== null && (
            <div className="rounded bg-violet-50 p-2">
              <dt className="text-violet-700">Custom tier</dt>
              <dd className="font-semibold text-violet-950">
                Tier {candidate.customTier}
              </dd>
            </div>
          )}
          {showActiveTier && (
            <div className="rounded bg-slate-50 p-2">
              <dt className="text-slate-500">
                Active ranking tier · {candidate.activeTierSourceLabel}
              </dt>
              <dd className="font-semibold text-slate-950">
                {candidate.activeTier === null
                  ? "Unavailable"
                  : `Tier ${candidate.activeTier}`}
              </dd>
            </div>
          )}
          {candidate.projectionTier !== null && (
            <div className="rounded bg-indigo-50 p-2">
              <dt className="text-indigo-700">Projection tier</dt>
              <dd className="font-semibold text-indigo-950">
                Tier {candidate.projectionTier} · overlay only
              </dd>
            </div>
          )}
        </dl>

        <ProjectionRangeVisualization candidate={candidate} model={model} />

        <dl
          aria-label={`${candidate.player.fullName} deterministic evidence`}
          className="mt-3 grid grid-cols-2 gap-2 text-xs"
        >
          <div className="rounded border border-slate-200 p-2">
            <dt className="text-slate-500">Survival to next user pick</dt>
            <dd className="font-semibold text-slate-950">
              {formatEvidenceProbability(
                recommendation.evidence.survivalProbability,
              )}
            </dd>
          </div>
          <div className="rounded border border-slate-200 p-2">
            <dt className="text-slate-500">Tier loss if deferred</dt>
            <dd className="font-semibold text-slate-950">
              {formatEvidenceValue(
                recommendation.evidence.tierLossIfDeferred,
              )} PPG
            </dd>
          </div>
          <div className="col-span-2 rounded border border-slate-200 p-2">
            <dt className="text-slate-500">Roster role</dt>
            <dd className="font-semibold text-slate-950">
              {rosterRoleLabel[recommendation.evidence.rosterRole] || "Unavailable"}
            </dd>
          </div>
        </dl>

        {recommendation.evidence.flags.length > 0 && (
          <section
            aria-label={`${candidate.player.fullName} deterministic evidence flags`}
            className="mt-3 rounded border border-amber-200 bg-amber-50 p-2"
          >
            <p className="text-xs font-semibold text-amber-950">
              Deterministic evidence flags
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-amber-950">
              {recommendation.evidence.flags.map(flag => (
                <li key={flag}>{flag}</li>
              ))}
            </ul>
          </section>
        )}

        <StatusEvidence candidate={candidate} />
      </article>
    </li>
  )
}

const PositionalBestsLiveSurface: React.FC<
  PositionalBestsLiveSurfaceProps
> = ({model, onInspectPlayer}) => {
  const previousUpdateKey = useRef<string | null>(null)
  const [announcement, setAnnouncement] = useState("")
  const updateKey = candidateUpdateKey(model)

  useEffect(() => {
    if (previousUpdateKey.current !== null && previousUpdateKey.current !== updateKey) {
      if (!model) {
        setAnnouncement("Live recommendation data is unavailable.")
      } else if (model.candidates.length === 0) {
        setAnnouncement("No legal deterministic recommendation candidates remain.")
      } else {
        setAnnouncement(
          `Deterministic advisor recommendations updated. Preferred candidate: `
          + `${model.candidates[0].player.fullName}.`,
        )
      }
    }
    previousUpdateKey.current = updateKey
  }, [model, updateKey])

  if (!model) {
    return (
      <section
        aria-labelledby="live-positional-bests-title"
        className="rounded-lg border border-violet-200 bg-violet-50 p-3 text-left"
      >
        <h2
          className="font-semibold text-violet-950"
          id="live-positional-bests-title"
        >
          Live positional bests unavailable
        </h2>
        <p className="mt-1 text-sm text-violet-900">
          The deterministic advisor data is not available yet. Historical
          analysis below remains available when you run it manually.
        </p>
        <div aria-live="polite" className="sr-only" role="status">
          {announcement}
        </div>
      </section>
    )
  }

  return (
    <section
      aria-labelledby="live-positional-bests-title"
      className="rounded-lg border border-violet-200 bg-violet-50 p-3 text-left"
    >
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">
          Live deterministic advisor
        </p>
        <h2
          className="text-xl font-bold text-violet-950"
          id="live-positional-bests-title"
        >
          Realtime positional bests
        </h2>
        <p className="mt-1 text-sm text-violet-900">
          These candidates come from the deterministic advisor and update as
          the supplied recommendation set changes. Candidate order is
          preserved; the first candidate is preferred and the rest are
          fallbacks.
        </p>
      </header>

      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
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
        <div className="rounded bg-white p-2 sm:col-span-2">
          <dt className="text-slate-500">Picks before next user pick</dt>
          <dd className="font-semibold text-slate-950">
            {model.picksRemainingUntilNextUserPick ?? "Unavailable"}
          </dd>
        </div>
      </dl>

      <div aria-live="polite" className="sr-only" role="status">
        {announcement}
      </div>

      {model.candidates.length === 0 ? (
        <div
          className="mt-3 rounded-lg border border-dashed border-violet-300 bg-white p-5 text-sm text-violet-950"
          role="status"
        >
          <p className="font-semibold">No legal recommendation candidates remain.</p>
          <p className="mt-1">
            The deterministic advisor supplied no legal player for the current
            roster. Historical drilldown remains available below.
          </p>
        </div>
      ) : (
        <ol
          aria-label="Deterministic positional recommendation candidates"
          className="mt-3 grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3"
        >
          {model.candidates.map(candidate => (
            <CandidateCard
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

export default PositionalBestsLiveSurface
