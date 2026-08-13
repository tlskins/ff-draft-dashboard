import React, { useEffect, useRef, useState } from "react"

import {
  CrossPositionCandidateModel,
  CrossPositionMetricId,
  CrossPositionPresentationModel,
  MetricComparisonScale,
  metricComparisonPercent,
} from "../../behavior/analysis/crossPosition"
import type {
  TierLandscapeLaneModel,
  TierLandscapePlayerModel,
  TierLandscapePosition,
  TierLandscapePresentationModel,
} from "../../behavior/analysis/tierLandscape"
import { formatProjectionValue } from "../../behavior/analysis/positionalBests"
import { playerStatusSourceLabel } from "../../behavior/api/playerStatus"
import type { Player } from "../../types"
import styles from "./AnalysisRedesign.module.css"

interface CrossPositionLiveSurfaceProps {
  model: CrossPositionPresentationModel | null
  tierModel?: TierLandscapePresentationModel | null
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
  const medianMarkerTransform = projection.medianPercent === null
    ? null
    : projection.medianPercent <= 0
      ? "translateX(0)"
      : projection.medianPercent >= 100
        ? "translateX(-100%)"
        : "translateX(-50%)"
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
              data-testid={`cross-position-projection-median-${candidate.player.id}`}
              style={{
                left: `${projection.medianPercent}%`,
                transform: medianMarkerTransform || undefined,
              }}
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
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-wide text-violet-700">
              {candidate.preferenceLabel}
              {candidate.fallbackNumber === null
                ? " candidate"
                : ` ${candidate.fallbackNumber}`}
            </p>
            <h3
              className="break-words text-lg font-bold text-slate-950"
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

interface CockpitOption {
  lane: TierLandscapeLaneModel
  player: TierLandscapePlayerModel
  suppliedCandidate: CrossPositionCandidateModel | null
}

const POSITION_VISUALS: Record<TierLandscapePosition, {
  accent: string
}> = {
  QB: {accent: "#7c3aed"},
  RB: {accent: "#0891b2"},
  WR: {accent: "#db2777"},
  TE: {accent: "#d97706"},
}

interface CockpitScale {
  minimum: number
  maximum: number
  available: boolean
}

const cockpitScale = (values: Array<number | null>): CockpitScale => {
  const finite = values.filter((value): value is number => (
    typeof value === "number" && Number.isFinite(value)
  ))
  if (finite.length === 0) return {minimum: 0, maximum: 1, available: false}
  const minimum = Math.min(0, ...finite)
  const maximum = Math.max(...finite)
  return {
    minimum,
    maximum: maximum === minimum ? minimum + 1 : maximum,
    available: true,
  }
}

const cockpitPercent = (
  value: number | null,
  scale: CockpitScale,
): number | null => value === null || !scale.available
  ? null
  : Math.max(0, Math.min(100,
      ((value - scale.minimum) / (scale.maximum - scale.minimum)) * 100))

const CockpitMetric: React.FC<{
  color: string
  hint: string
  label: string
  scale: CockpitScale
  text: string
  value: number | null
}> = ({color, hint, label, scale, text, value}) => {
  const percent = cockpitPercent(value, scale)
  return (
    <div className={styles.metricChart}>
      <div
        aria-label={`${label}: ${text}`}
        className={styles.metricTrack}
        role="img"
        style={{
          "--metric-width": `${percent ?? 0}%`,
          "--series-color": color,
        } as React.CSSProperties}
      >
        {percent !== null && (
          <>
            <span aria-hidden="true" className={styles.metricLine} />
            <span aria-hidden="true" className={styles.metricDot} />
          </>
        )}
      </div>
      <span className={styles.metricValue}>{text}</span>
      <span className={styles.metricHint}>{hint}</span>
    </div>
  )
}

const CockpitProjection: React.FC<{
  color: string
  player: TierLandscapePlayerModel
  scale: CockpitScale
}> = ({color, player, scale}) => {
  const floor = cockpitPercent(player.projection.floor, scale)
  const median = cockpitPercent(player.projection.median, scale)
  const ceiling = cockpitPercent(player.projection.ceiling, scale)
  const text = `${formatProjectionValue(player.projection.floor)} / ${formatProjectionValue(player.projection.median)} / ${formatProjectionValue(player.projection.ceiling)}`
  return (
    <div className={styles.metricChart}>
      <div
        aria-label={`${player.player.fullName} projection: floor, median, ceiling ${text} PPG`}
        className={styles.projectionTrack}
        role="img"
        style={{
          "--median-left": `${median ?? 0}%`,
          "--range-left": `${floor ?? 0}%`,
          "--range-width": `${floor !== null && ceiling !== null
            ? Math.max(1, ceiling - floor)
            : 0}%`,
          "--series-color": color,
        } as React.CSSProperties}
      >
        {floor !== null && ceiling !== null && (
          <span aria-hidden="true" className={styles.projectionBand} />
        )}
        {median !== null && (
          <span aria-hidden="true" className={styles.projectionMedian} />
        )}
      </div>
      <span className={styles.projectionValue}>{text} PPG</span>
      <span className={styles.metricHint}>Floor / median / ceiling</span>
    </div>
  )
}

interface ExpectedNextOption {
  expectedMedian: number | null
  player: TierLandscapePlayerModel | null
  suppliedPlayerCount: number
}

/**
 * Turns supplied player-survival evidence into a display-only next-pick
 * estimate. The model already treats per-player survival as an independent
 * approximation; this preserves that boundary and never fills missing
 * probabilities with invented certainty.
 */
export const expectedNextOption = (
  lane: TierLandscapeLaneModel,
  draftedPlayerId: string,
  suppliedCandidates: CrossPositionCandidateModel[],
): ExpectedNextOption => {
  const suppliedSurvival = new Map(suppliedCandidates.map(candidate => [
    candidate.player.id,
    candidate.metricValues.survivalProbability,
  ]))
  let earlierPlayersUnavailable = 1
  const outcomes: Array<{
    player: TierLandscapePlayerModel
    probability: number
  }> = []

  for (const player of lane.players) {
    if (player.player.id === draftedPlayerId) continue
    const survival = player.survivalProbability
      ?? suppliedSurvival.get(player.player.id)
      ?? null
    if (survival === null) {
      // Forecast coverage is rank ordered. Once it ends, a lower-ranked
      // player's chance of being the best available cannot be derived safely.
      break
    }
    if (player.projection.median === null) continue
    outcomes.push({
      player,
      probability: earlierPlayersUnavailable * survival,
    })
    earlierPlayersUnavailable *= 1 - survival
  }

  const totalProbability = outcomes.reduce(
    (total, outcome) => total + outcome.probability,
    0,
  )
  if (outcomes.length === 0 || totalProbability <= 0) {
    return {expectedMedian: null, player: null, suppliedPlayerCount: 0}
  }
  const player = [...outcomes].sort((left, right) => (
    right.probability - left.probability
  ))[0].player
  const expectedMedian = outcomes.reduce((total, outcome) => (
    total + (outcome.player.projection.median || 0) * outcome.probability
  ), 0) / totalProbability

  return {
    expectedMedian,
    player,
    suppliedPlayerCount: outcomes.length,
  }
}

interface WaitCostEstimate {
  cost: number
  current: TierLandscapePlayerModel
  expectedLoss: number | null
  fallback: TierLandscapePlayerModel
  tierGoneProbability: number | null
}

/**
 * Shows the size of the next visible tier cliff and, separately, the supplied
 * chance that the current tier is exhausted before the next user pick. This
 * avoids presenting equal within-tier projections as an empty zero-loss chart
 * and never invents a probability when the forecast does not supply one.
 */
export const waitCostEstimate = (
  lane: TierLandscapeLaneModel,
  draftedPlayerId: string,
  suppliedCandidates: CrossPositionCandidateModel[],
): WaitCostEstimate | null => {
  const suppliedTierBoundary = new Map(suppliedCandidates.map(candidate => [
    candidate.player.id,
    candidate.metricValues.tierBoundaryProbability,
  ]))
  const players = lane.players.filter(player => (
    player.player.id !== draftedPlayerId
    && player.primaryTier !== null
    && player.projection.median !== null
  ))
  const current = players[0]
  const fallback = players.find(player => (
    current && player.primaryTier !== current.primaryTier
  ))
  if (!current || !fallback) return null
  const tierGoneProbability = suppliedTierBoundary.get(current.player.id)
    ?? lane.currentTopAvailableTier?.exhaustionProbability
    ?? null
  const currentMedian = current.projection.median
  const fallbackMedian = fallback.projection.median
  if (currentMedian === null || fallbackMedian === null) return null
  const rawCost = Math.max(0, currentMedian - fallbackMedian)
  const cost = rawCost < 0.005 ? 0 : rawCost
  return {
    cost,
    current,
    expectedLoss: tierGoneProbability === null
      ? null
      : cost * tierGoneProbability,
    fallback,
    tierGoneProbability,
  }
}

const costValueLabel = (value: number): string => (
  value < 1 ? value.toFixed(2) : value.toFixed(1)
)

const DecisionCockpit: React.FC<{
  model: CrossPositionPresentationModel
  tierModel: TierLandscapePresentationModel | null
  onInspectPlayer: (player: Player) => void
}> = ({model, tierModel, onInspectPlayer}) => {
  const options: CockpitOption[] = (tierModel?.lanes || []).flatMap(lane => {
    const player = lane.players[0]
    if (!player) return []
    return [{
      lane,
      player,
      suppliedCandidate: model.candidates.find(candidate => (
        candidate.player.id === player.player.id
      )) || null,
    }]
  })
  const preferredCandidate = model.candidates[0] || null
  // The advisor's preferred position chooses the initial scenario even when
  // its candidate is not that position's rank-driven board leader. If that
  // position has no displayed leader, fixed lane order supplies the fallback.
  const defaultOption = options.find(option => (
    option.lane.position === preferredCandidate?.player.position
  )) || options[0]
  const defaultDraftedId = defaultOption?.player.player.id || ""
  const selectionBasis = [
    preferredCandidate?.player.id || "no-preference",
    preferredCandidate?.player.position || "no-position",
    ...options.map(option => (
      `${option.lane.position}:${option.player.player.id}`
    )),
  ].join("|")
  const selectionBasisRef = useRef(selectionBasis)
  const [draftedId, setDraftedId] = useState(defaultDraftedId)
  const selectionBasisChanged = selectionBasisRef.current !== selectionBasis
  const effectiveDraftedId = selectionBasisChanged
    || !options.some(option => option.player.player.id === draftedId)
    ? defaultDraftedId
    : draftedId
  useEffect(() => {
    if (
      selectionBasisChanged
      || !options.some(option => option.player.player.id === draftedId)
    ) {
      selectionBasisRef.current = selectionBasis
      setDraftedId(defaultDraftedId)
    }
  }, [
    defaultDraftedId,
    draftedId,
    options,
    selectionBasis,
    selectionBasisChanged,
  ])
  const drafted = options.find(option => (
    option.player.player.id === effectiveDraftedId
  )) || options[0]
  const projectedNext = options.map(option => {
    const estimate = expectedNextOption(
      option.lane,
      drafted?.player.player.id || "",
      model.candidates,
    )
    const waitEstimate = waitCostEstimate(
      option.lane,
      drafted?.player.player.id || "",
      model.candidates,
    )
    return {
      position: option.lane.position,
      now: option.player,
      next: estimate.player,
      nextMedian: estimate.player?.projection.median ?? null,
      expectedMedian: estimate.expectedMedian,
      suppliedPlayerCount: estimate.suppliedPlayerCount,
      waitEstimate,
    }
  })
  const waitCosts = projectedNext.filter(item => (
    item.position !== drafted?.lane.position
  )).map(item => ({
    ...item,
    cost: item.waitEstimate?.cost ?? null,
  })).sort((left, right) => (right.cost ?? -1) - (left.cost ?? -1))
  const maximumCost = Math.max(
    0.1,
    Math.ceil(Math.max(...waitCosts.map(item => item.cost ?? 0), 0) * 10) / 10,
  )
  const projectionScale = cockpitScale(options.flatMap(option => [
    option.player.projection.floor,
    option.player.projection.median,
    option.player.projection.ceiling,
  ]))
  const lineupScale = cockpitScale(options.map(option => (
    option.suppliedCandidate?.metricValues.marginalLineupPoints ?? null
  )))
  const probabilityScale: CockpitScale = {
    minimum: 0,
    maximum: 1,
    available: true,
  }

  if (options.length === 0) {
    return (
      <div className="mt-3 rounded-lg border border-dashed border-violet-300 bg-white p-5 text-sm text-violet-950">
        No explicitly available QB, RB, WR, or TE players are loaded for the decision cockpit.
      </div>
    )
  }

  return (
    <div className={styles.analysisSurface}>
      <section className={styles.panel} aria-labelledby="cockpit-top-options-title">
        <div className={styles.panelHeader}>
          <div>
            <h3 className={styles.panelTitle} id="cockpit-top-options-title">Top option at every position</h3>
            <p className={styles.panelCaption}>Select a row to update the scenario. Every chart is aligned to the scale printed above its column, and every exact value stays visible.</p>
          </div>
        </div>
        <div className={styles.matrixToolbar}>
          <div
            aria-label={preferredCandidate
              ? `Advisor preferred ${preferredCandidate.player.fullName}; selected ${drafted?.lane.position || "no"} scenario uses ${drafted?.player.player.fullName || "no player"}`
              : `No advisor preference supplied; selected ${drafted?.lane.position || "no"} scenario uses ${drafted?.player.player.fullName || "no player"}`}
            aria-live="polite"
            className={styles.preferredSummary}
          >
            <span className={styles.statusPill}>Preferred now</span>
            <strong>{preferredCandidate?.player.fullName || "Not supplied"}</strong>
            <span className={styles.panelCaption}>
              {preferredCandidate
                ? `Advisor preference · ${preferredCandidate.player.position}. `
                : "No advisor preference supplied. "}
              Selected scenario: {drafted
                ? `${drafted.lane.position} leader ${drafted.player.player.fullName}`
                : "unavailable"}.
            </span>
          </div>
          <span className={styles.panelCaption}>Projection shows floor → median → ceiling</span>
        </div>
        <div className={styles.matrixScroll}>
          <div className={styles.matrixGrid} role="table" aria-label="Cross-position decision comparison">
            <div className={styles.matrixRow} role="row">
              <div className={styles.matrixHeaderCell} role="columnheader">Draft choice</div>
              <div className={styles.matrixHeaderCell} role="columnheader">
                Projected PPG range
                <span className={styles.headerScale}>
                  <span>{projectionScale.minimum.toFixed(1)}</span>
                  <span>weekly points</span>
                  <span>{projectionScale.maximum.toFixed(1)}</span>
                </span>
              </div>
              <div className={styles.matrixHeaderCell} role="columnheader">
                Lineup gain
                <span className={styles.headerScale}>
                  <span>{lineupScale.minimum.toFixed(1)}</span>
                  <span>points</span>
                  <span>{lineupScale.maximum.toFixed(1)}</span>
                </span>
              </div>
              <div className={styles.matrixHeaderCell} role="columnheader">
                Available next pick
                <span className={styles.headerScale}><span>0%</span><span>chance</span><span>100%</span></span>
              </div>
              <div className={styles.matrixHeaderCell} role="columnheader">
                Current tier gone
                <span className={styles.headerScale}><span>0%</span><span>chance</span><span>100%</span></span>
              </div>
            </div>
            {options.map(option => {
              const visual = POSITION_VISUALS[option.lane.position]
              const selected = option.player.player.id === effectiveDraftedId
              const lineupGain = option.suppliedCandidate
                ?.metricValues.marginalLineupPoints ?? null
              const survival = option.player.survivalProbability
                ?? option.suppliedCandidate?.metricValues.survivalProbability
                ?? null
              const tierCliff = option.suppliedCandidate
                ?.metricValues.tierBoundaryProbability
                ?? option.lane.currentTopAvailableTier?.exhaustionProbability
                ?? null
              const cellClassName = `${styles.matrixCell} ${
                selected ? styles.matrixCellSelected : ""
              }`
              const visualStyle = {
                "--series-color": visual.accent,
              } as React.CSSProperties
              return (
                <div
                  className={styles.matrixRow}
                  key={option.player.player.id}
                  role="row"
                >
                  <div
                    className={`${cellClassName} ${styles.matrixPlayerCell}`}
                    role="rowheader"
                    style={visualStyle}
                  >
                    <button
                      aria-pressed={selected}
                      className={styles.matrixPlayerButton}
                      onClick={() => setDraftedId(option.player.player.id)}
                      type="button"
                    >
                      <span className={styles.positionBadge} style={visualStyle}>{option.lane.position}</span>
                      <span className={styles.matrixPlayerName}>{option.player.player.fullName}</span>
                      <span className={styles.matrixPlayerMeta}>{option.player.player.team || "FA"} · {option.player.primaryTier === null ? "Tier unavailable" : `Tier ${option.player.primaryTier}`}</span>
                      <span className={styles.matrixPlayerAction}>{selected ? "✓ Selected scenario" : "Select scenario"}</span>
                    </button>
                    <button className={styles.detailsButton} onClick={() => onInspectPlayer(option.player.player)} type="button">View player details</button>
                  </div>
                  <div className={cellClassName} role="cell"><CockpitProjection color={visual.accent} player={option.player} scale={projectionScale} /></div>
                  <div className={cellClassName} role="cell"><CockpitMetric color={visual.accent} hint="Projected lineup points added" label={`${option.lane.position} lineup gain`} scale={lineupScale} text={lineupGain === null ? "Not supplied" : `+${lineupGain.toFixed(1)} pts`} value={lineupGain} /></div>
                  <div className={cellClassName} role="cell"><CockpitMetric color={visual.accent} hint={`At pick ${model.nextUserPick ?? "—"}`} label={`${option.lane.position} available next pick`} scale={probabilityScale} text={survival === null ? "Not supplied" : `${(survival * 100).toFixed(0)}%`} value={survival} /></div>
                  <div className={cellClassName} role="cell"><CockpitMetric color={visual.accent} hint="Before your next pick" label={`${option.lane.position} current tier gone`} scale={probabilityScale} text={tierCliff === null ? "Not supplied" : `${(tierCliff * 100).toFixed(0)}%`} value={tierCliff} /></div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      <section className={styles.panel} aria-labelledby="cockpit-if-draft-title">
        <div className={styles.scenarioHeader}>
          <div>
            <p className={styles.eyebrow}>If you draft</p>
            <h3 className={styles.scenarioName} id="cockpit-if-draft-title">{drafted?.player.player.fullName}</h3>
            <p className={styles.panelCaption}>Most likely top option at each position when you pick again. Expected value is shown separately when more than one forecast-covered outcome is available.</p>
          </div>
          <div className={styles.scenarioButtons} role="group" aria-label="Draft choice scenario">
            {options.map(option => {
              const selected = effectiveDraftedId === option.player.player.id
              return (
                <button
                  aria-label={option.lane.position}
                  aria-pressed={selected}
                  className={styles.scenarioButton}
                  key={option.player.player.id}
                  onClick={() => setDraftedId(option.player.player.id)}
                  type="button"
                >
                  <strong>{option.lane.position}</strong>
                  <span>{option.player.player.fullName}</span>
                  <span>{selected ? "Selected" : "Try scenario"}</span>
                </button>
              )
            })}
          </div>
        </div>
        <div className={styles.nextGrid} aria-live="polite">
          {projectedNext.map(item => {
            const visualStyle = {
              "--series-color": POSITION_VISUALS[item.position].accent,
            } as React.CSSProperties
            return (
              <div className={styles.nextCard} key={item.position} style={visualStyle}>
                <span>{item.position} · pick {model.nextUserPick ?? "—"}</span>
                <strong>{item.next?.player.fullName || "Forecast unavailable"}</strong>
                <span className={styles.nextCardValue}>{item.next ? `${formatProjectionValue(item.nextMedian)} median PPG` : "No named outcome"}</span>
                <span>{item.expectedMedian !== null && item.suppliedPlayerCount > 1
                  ? `${formatProjectionValue(item.expectedMedian)} expected PPG across ${item.suppliedPlayerCount} covered outcomes`
                  : item.next
                    ? `Most likely among ${item.suppliedPlayerCount} forecast-covered player${item.suppliedPlayerCount === 1 ? "" : "s"}`
                    : "No rank-ordered availability forecast supplied"}</span>
              </div>
            )
          })}
        </div>
      </section>

      <section className={styles.panel} aria-labelledby="cockpit-wait-title">
        <div className={styles.panelHeader}>
          <div>
            <h3 className={styles.panelTitle} id="cockpit-wait-title">Cost of waiting one turn</h3>
            <p className={styles.panelCaption}>After drafting {drafted?.player.player.fullName}, each bar shows the projected PPG drop from the current top option to the first player in the next tier. The risk label separately shows the supplied chance that the current tier is gone before pick {model.nextUserPick ?? "—"}.</p>
          </div>
          <span className={styles.neutralPill}>Largest tier drop first</span>
        </div>
        <div className={styles.costScroll}>
          <div className={styles.costCanvas} role="group" aria-label="Tier-cliff cost of waiting one turn, sorted by projected points per game lost">
            <div className={styles.costAxis} aria-hidden="true">
              <span>Position</span>
              <span className={styles.costTicks}>
                {[0, .25, .5, .75, 1].map(portion => (
                  <span key={portion}>{costValueLabel(maximumCost * portion)}{portion === 1 ? " PPG" : ""}</span>
                ))}
              </span>
              <span style={{textAlign: "right"}}>Current top → next-tier top</span>
            </div>
            {waitCosts.map(item => {
              const visualStyle = {
                "--cost-width": `${item.cost === null ? 0 : Math.max(
                  item.cost > 0 ? 1.5 : 0,
                  (item.cost / maximumCost) * 100,
                )}%`,
                "--series-color": POSITION_VISUALS[item.position].accent,
              } as React.CSSProperties
              return (
                <div className={styles.costRow} key={item.position} style={visualStyle}>
                  <span className={styles.positionBadge} style={visualStyle}>{item.position}</span>
                  {item.cost === null ? (
                    <span className={styles.panelCaption}>Need current-tier and next-tier projections</span>
                  ) : (
                    <span
                      aria-label={`${item.position} projected drop if the current tier is gone: ${costValueLabel(item.cost)} PPG`}
                      className={styles.costTrack}
                      role="img"
                    >
                      {item.cost > 0 ? <span className={styles.costBar} /> : (
                        <span className={styles.costZero}>No modeled tier drop</span>
                      )}
                      {item.cost > 0 && (
                        <span className={styles.costLabel}>−{costValueLabel(item.cost)} PPG</span>
                      )}
                    </span>
                  )}
                  <span className={styles.costValues}>
                    {item.cost === null || !item.waitEstimate ? (
                      <strong>Tier comparison unavailable</strong>
                    ) : (
                      <>
                        <strong>{formatProjectionValue(item.waitEstimate.current.projection.median)} → {formatProjectionValue(item.waitEstimate.fallback.projection.median)} PPG</strong>
                        <span>{item.waitEstimate.current.player.fullName} → {item.waitEstimate.fallback.player.fullName}</span>
                        <span className={styles.costRisk}>Current tier gone: {item.waitEstimate.tierGoneProbability === null
                          ? "not supplied"
                          : `${(item.waitEstimate.tierGoneProbability * 100).toFixed(0)}%`}</span>
                      </>
                    )}
                  </span>
                </div>
              )
            })}
            <div className={styles.costAxisTitle}>X-axis · projected PPG drop if the current tier clears before your next pick</div>
          </div>
        </div>
        {waitCosts.every(item => item.cost === null) && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Waiting cost is unavailable because this board state does not include both a current-tier projection and a later-tier projection. Missing evidence is not displayed as a zero.
          </p>
        )}
      </section>
    </div>
  )
}

const CrossPositionLiveSurface: React.FC<CrossPositionLiveSurfaceProps> = ({
  model,
  tierModel = null,
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
          Draft recommendations are not available yet. Historical comparison
          below remains available when you run it manually.
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
      className="rounded-2xl border-2 border-slate-300 bg-slate-100 p-4 text-left shadow-sm md:p-5"
    >
      <header>
        <p className="text-xs font-bold uppercase tracking-wide text-indigo-700">
          Default decision view
        </p>
        <h2 className="text-2xl font-bold text-slate-950" id="live-cross-position-title">
          Decision cockpit
        </h2>
        <p className="mt-1 max-w-4xl text-sm text-slate-700">
          Compare the best available QB, RB, WR, and TE now, then test how each
          choice changes the board at your next pick.
        </p>
      </header>

      <DecisionCockpit model={model} onInspectPlayer={onInspectPlayer} tierModel={tierModel} />

      <details className="mt-4 rounded-xl border-2 border-slate-300 bg-white">
        <summary className="cursor-pointer rounded-xl p-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">Detailed recommendation evidence</summary>
        <div className="border-t border-violet-100 p-3">

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
        </div>
      </details>
    </section>
  )
}

export default CrossPositionLiveSurface
