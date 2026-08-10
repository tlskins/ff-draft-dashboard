import React, { useEffect, useRef, useState } from "react"

import {
  CrossPositionCandidateModel,
  CrossPositionMetricId,
  CrossPositionPresentationModel,
  MetricComparisonScale,
  metricComparisonPercent,
} from "../../behavior/analysis/crossPosition"
import { formatProjectionValue } from "../../behavior/analysis/positionalBests"
import { playerStatusSourceLabel } from "../../behavior/api/playerStatus"
import type { Player } from "../../types"

interface CrossPositionLiveSurfaceProps {
  model: CrossPositionPresentationModel | null
  onInspectPlayer: (player: Player) => void
}

const rosterRoleLabel: Record<
  CrossPositionCandidateModel["candidate"]["evidence"]["rosterRole"],
  string
> = {
  open_starter: "Open starter",
  flex_upgrade: "Flex upgrade",
  bench: "Bench",
}

const suppliedNumber = (value: number | null): string => (
  value === null ? "Unavailable" : String(value)
)

const suppliedProbability = (value: number | null): string => (
  value === null || value < 0 || value > 1
    ? "Unavailable"
    : `${String(value)} (${(value * 100).toFixed(1)}%)`
)

const timestampLabel = (value: string): string => (
  value.replace("T", " ").replace(/:00Z$/, " UTC")
)

const candidateUpdateKey = (
  model: CrossPositionPresentationModel | null,
): string => {
  if (!model) return "unavailable"
  return JSON.stringify({
    currentPick: model.currentPick,
    nextUserPick: model.nextUserPick,
    leagueSize: model.leagueSize,
    scoringFormat: model.scoringFormat,
    candidates: model.candidates.map(candidate => ({
      id: candidate.player.id,
      fullName: candidate.player.fullName,
      position: candidate.player.position,
      team: candidate.player.team,
      preferenceLabel: candidate.preferenceLabel,
      fallbackNumber: candidate.fallbackNumber,
      positionRank: candidate.positionRank,
      positionRankSourceLabel: candidate.positionRankSourceLabel,
      customPositionRank: candidate.customPositionRank,
      customTier: candidate.customTier,
      activeTier: candidate.activeTier,
      activeTierSourceLabel: candidate.activeTierSourceLabel,
      projectionTier: candidate.projectionTier,
      projection: candidate.projection,
      advisorScore: candidate.advisorScore,
      metricValues: candidate.metricValues,
      rosterRole: candidate.candidate.evidence.rosterRole,
      flags: candidate.candidate.evidence.flags,
      statusState: candidate.statusState,
      statusEvidence: candidate.statusEvidence.map(event => ({
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
      })),
    })),
  })
}

const ProjectionRangeVisualization: React.FC<{
  candidate: CrossPositionCandidateModel
  model: CrossPositionPresentationModel
}> = ({candidate, model}) => {
  const {projection} = candidate
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
  const ariaLabel = `${candidate.player.fullName} projection uncertainty range: `
    + `floor ${formatProjectionValue(projection.floor)} PPG, `
    + `median ${formatProjectionValue(projection.median)} PPG, `
    + `ceiling ${formatProjectionValue(projection.ceiling)} PPG`

  return (
    <section
      aria-label={`${candidate.player.fullName} projection uncertainty range`}
      className="mt-3 rounded border border-indigo-100 bg-indigo-50 p-2"
    >
      <div className="flex flex-wrap items-center justify-between gap-1">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-indigo-800">
          Projection range · uncertainty context
        </h4>
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
          {rangeLeft !== null && projection.endPercent !== null && (
            <span
              className="absolute top-1/2 h-2 -translate-y-1/2 rounded border-2 border-indigo-700 bg-indigo-200"
              data-testid={`cross-position-projection-${candidate.player.id}`}
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

const MetricRow: React.FC<{
  candidate: CrossPositionCandidateModel
  id: CrossPositionMetricId
  label: string
  scale: MetricComparisonScale
  probability?: boolean
}> = ({candidate, id, label, scale, probability = false}) => {
  const value = candidate.metricValues[id]
  const percent = metricComparisonPercent(value, scale)
  const text = probability
    ? suppliedProbability(value)
    : suppliedNumber(value)
  const barLabel = value === null
    ? `${label}: unavailable`
    : `${label}: ${text}; compared only with supplied candidates for this metric`

  return (
    <div className="rounded border border-slate-200 bg-white p-2">
      <dt className="text-slate-600">{label}</dt>
      <dd className="mt-1 font-semibold text-slate-950">{text}</dd>
      <div
        aria-label={barLabel}
        className="mt-1 h-1.5 overflow-hidden rounded bg-slate-100"
        role="img"
      >
        {percent !== null && (
          <span
            aria-hidden="true"
            className="block h-full bg-indigo-600"
            data-testid={`cross-position-metric-${id}-${candidate.player.id}`}
            style={{width: `${percent}%`}}
          />
        )}
      </div>
    </div>
  )
}

const StatusEvidence: React.FC<{
  candidate: CrossPositionCandidateModel
}> = ({candidate}) => {
  if (candidate.statusEvidence.length === 0) {
    if (candidate.statusState === "unavailable") {
      return (
        <p className="mt-3 rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
          Status provider unavailable; the deterministic recommendation is unaffected.
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

const CandidateCard: React.FC<{
  candidate: CrossPositionCandidateModel
  model: CrossPositionPresentationModel
  onInspectPlayer: (player: Player) => void
}> = ({candidate, model, onInspectPlayer}) => {
  const recommendation = candidate.candidate
  const showActiveTier = candidate.customTier === null
    || candidate.activeTier !== candidate.customTier
  const flags = Array.isArray(recommendation.evidence.flags)
    ? recommendation.evidence.flags.filter(flag => typeof flag === "string")
    : []
  const benchApplies = recommendation.evidence.rosterRole === "bench"
    || candidate.metricValues.benchUtility !== null
      && candidate.metricValues.benchUtility !== 0

  return (
    <li className="min-w-0 rounded-lg border border-violet-100 bg-white p-3">
      <article aria-labelledby={`cross-position-${candidate.player.id}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-violet-700">
              {candidate.preferenceLabel}
              {candidate.fallbackNumber === null
                ? " candidate"
                : ` ${candidate.fallbackNumber}`}
            </p>
            <h3
              className="truncate text-lg font-bold text-slate-950"
              id={`cross-position-${candidate.player.id}`}
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
          <div className="rounded bg-indigo-50 p-2">
            <dt className="text-indigo-700">Projection tier · overlay only</dt>
            <dd className="font-semibold text-indigo-950">
              {candidate.projectionTier === null
                ? "Unavailable"
                : `Tier ${candidate.projectionTier}`}
            </dd>
          </div>
          <div className="col-span-2 rounded border border-slate-200 p-2">
            <dt className="text-slate-500">
              Deterministic advisor score · supplied
            </dt>
            <dd className="font-semibold text-slate-950">
              {suppliedNumber(candidate.advisorScore)}
            </dd>
          </div>
        </dl>

        <ProjectionRangeVisualization candidate={candidate} model={model} />

        <section className="mt-3" aria-label={`${candidate.player.fullName} immediate lineup value`}>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-700">
            Immediate lineup value
          </h4>
          <dl className="mt-1 grid gap-2 text-xs">
            <MetricRow
              candidate={candidate}
              id="marginalLineupPoints"
              label="Marginal lineup points · supplied"
              scale={model.metricScales.marginalLineupPoints}
            />
            <div className="rounded border border-slate-200 bg-white p-2">
              <dt className="text-slate-600">Roster role · supplied</dt>
              <dd className="mt-1 font-semibold text-slate-950">
                {rosterRoleLabel[recommendation.evidence.rosterRole]
                  || "Unavailable"}
              </dd>
            </div>
          </dl>
        </section>

        <section className="mt-3" aria-label={`${candidate.player.fullName} positional value`}>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-700">
            Positional value
          </h4>
          <dl className="mt-1 grid gap-2 text-xs sm:grid-cols-2">
            <MetricRow
              candidate={candidate}
              id="pointsAboveReplacement"
              label="Points above positional replacement · supplied"
              scale={model.metricScales.pointsAboveReplacement}
            />
            <MetricRow
              candidate={candidate}
              id="replacementLevel"
              label="Replacement level · supplied"
              scale={model.metricScales.replacementLevel}
            />
          </dl>
        </section>

        <section className="mt-3" aria-label={`${candidate.player.fullName} wait risk`}>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-700">
            Wait risk · supplied deterministic evidence
          </h4>
          <dl className="mt-1 grid gap-2 text-xs sm:grid-cols-2">
            <MetricRow
              candidate={candidate}
              id="tierLossIfDeferred"
              label="Tier loss if deferred"
              scale={model.metricScales.tierLossIfDeferred}
            />
            <MetricRow
              candidate={candidate}
              id="survivalProbability"
              label="Survival to next user pick"
              probability
              scale={model.metricScales.survivalProbability}
            />
            <MetricRow
              candidate={candidate}
              id="tierBoundaryProbability"
              label="Current-tier boundary / exhaustion probability"
              probability
              scale={model.metricScales.tierBoundaryProbability}
            />
            <MetricRow
              candidate={candidate}
              id="positionalRunProbability"
              label="Positional-run probability"
              probability
              scale={model.metricScales.positionalRunProbability}
            />
          </dl>
        </section>

        {benchApplies && (
          <section className="mt-3" aria-label={`${candidate.player.fullName} bench value`}>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-700">
              Bench value
            </h4>
            <dl className="mt-1 grid gap-2 text-xs">
              <MetricRow
                candidate={candidate}
                id="benchUtility"
                label="Bench utility · supplied"
                scale={model.metricScales.benchUtility}
              />
            </dl>
          </section>
        )}

        {flags.length > 0 && (
          <section
            aria-label={`${candidate.player.fullName} deterministic evidence flags`}
            className="mt-3 rounded border border-amber-200 bg-amber-50 p-2"
          >
            <p className="text-xs font-semibold text-amber-950">
              Deterministic evidence flags
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-amber-950">
              {flags.map(flag => <li key={flag}>{flag}</li>)}
            </ul>
          </section>
        )}

        <StatusEvidence candidate={candidate} />
      </article>
    </li>
  )
}

const CrossPositionLiveSurface: React.FC<CrossPositionLiveSurfaceProps> = ({
  model,
  onInspectPlayer,
}) => {
  const previousUpdateKey = useRef<string | null>(null)
  const announcementCount = useRef(0)
  const [announcement, setAnnouncement] = useState("")
  const updateKey = candidateUpdateKey(model)

  useEffect(() => {
    if (previousUpdateKey.current !== null && previousUpdateKey.current !== updateKey) {
      announcementCount.current += 1
      if (!model) {
        setAnnouncement(
          `Live cross-position comparison is unavailable. Update ${announcementCount.current}.`,
        )
      } else if (model.candidates.length === 0) {
        setAnnouncement(
          "No legal deterministic recommendation candidates remain. "
          + `Update ${announcementCount.current}.`,
        )
      } else {
        setAnnouncement(
          `Live cross-position comparison updated. Preferred candidate: ${
            model.candidates[0].player.fullName
          }. Update ${announcementCount.current}.`,
        )
      }
    }
    previousUpdateKey.current = updateKey
  }, [model, updateKey])

  if (!model) {
    return (
      <section
        aria-labelledby="live-cross-position-title"
        className="rounded-lg border border-violet-200 bg-violet-50 p-3 text-left"
      >
        <h2 className="font-semibold text-violet-950" id="live-cross-position-title">
          Live cross-position comparison unavailable
        </h2>
        <p className="mt-1 text-sm text-violet-900">
          The deterministic advisor has not supplied a recommendation set yet.
          Historical comparison below remains available when you run it manually.
        </p>
        <div aria-live="polite" className="sr-only" role="status">
          {announcement}
        </div>
      </section>
    )
  }

  return (
    <section
      aria-labelledby="live-cross-position-title"
      className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-left"
    >
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">
          Live deterministic advisor
        </p>
        <h2 className="text-xl font-bold text-violet-950" id="live-cross-position-title">
          Cross-position comparison
        </h2>
        <p className="mt-1 max-w-4xl text-sm text-violet-900">
          Candidate selection, order, score, and evidence come from the
          deterministic advisor. This view preserves that supplied order: the
          first candidate is preferred and later candidates are fallbacks.
        </p>
      </header>

      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2 xl:grid-cols-5">
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
          <dt className="text-slate-500">League size</dt>
          <dd className="font-semibold text-slate-950">
            {model.leagueSize === null
              ? "Unavailable"
              : `${model.leagueSize} teams`}
          </dd>
        </div>
        <div className="rounded bg-white p-2">
          <dt className="text-slate-500">Scoring format</dt>
          <dd className="font-semibold text-slate-950">{model.scoringFormat}</dd>
        </div>
      </dl>

      <p className="mt-3 rounded border border-indigo-100 bg-white p-2 text-xs text-indigo-950">
        Projection ranges show uncertainty context from supplied floor, median,
        and ceiling values; they are not calibrated confidence scores. Metric
        bars compare only the displayed candidates within the same metric, and
        exact supplied values remain visible.
      </p>
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
            roster. Historical comparison remains available below.
          </p>
        </div>
      ) : (
        <ol
          aria-label="Deterministic cross-position recommendation candidates"
          className="mt-3 grid min-w-0 gap-3 xl:grid-cols-3"
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

export default CrossPositionLiveSurface
