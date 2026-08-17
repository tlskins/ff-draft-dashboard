import {
  buildPositionalBestsPresentationModel,
  PositionalBestsCandidateModel,
  ProjectionScale,
} from "./positionalBests"
import type { PlayerStatusCacheSnapshot } from "../api/playerStatusCache"
import type { DraftRecommendationSet } from "../draft-advisor/recommendations"
import type { BoardSettings, FantasySettings, Player } from "../../types"
import type {
  TierLandscapeLaneModel,
  TierLandscapePosition,
  TierLandscapePresentationModel,
} from "./tierLandscape"

export const CROSS_POSITION_METRIC_IDS = [
  "marginalLineupPoints",
  "pointsAboveReplacement",
  "replacementLevel",
  "tierLossIfDeferred",
  "survivalProbability",
  "tierBoundaryProbability",
  "positionalRunProbability",
  "benchUtility",
] as const

export type CrossPositionMetricId = typeof CROSS_POSITION_METRIC_IDS[number]

export interface MetricComparisonScale {
  minimum: number
  maximum: number
  hasFiniteValues: boolean
}

export type CrossPositionMetricValues = Record<
  CrossPositionMetricId,
  number | null
>

export interface CrossPositionCandidateModel
extends PositionalBestsCandidateModel {
  advisorScore: number | null
  metricValues: CrossPositionMetricValues
}

export interface CrossPositionPresentationModel {
  currentPick: number | null
  nextUserPick: number | null
  picksBeforeNextUserPick: number | null
  leagueSize: number | null
  scoringFormat: "PPR" | "Standard"
  explanation: string
  projectionScale: ProjectionScale
  metricScales: Record<CrossPositionMetricId, MetricComparisonScale>
  candidates: CrossPositionCandidateModel[]
}

export interface CrossPositionDecisionRow {
  position: TierLandscapePosition
  candidate: CrossPositionCandidateModel | null
  lane: TierLandscapeLaneModel
  player: Player | null
  identitySource: "candidate" | "tier_lane" | "unavailable"
  pointsAboveReplacement: number | null
  valuePercent: number | null
  riskBeforeNextPick: number | null
  tier: number | null
  tierAvailablePlayerCount: number | null
  runProbability: number | null
  runMinimumPicks: number | null
  tierCliffProbability: number | null
}

export interface CrossPositionDecisionPresentationModel {
  rows: CrossPositionDecisionRow[]
  valueScale: MetricComparisonScale
  preferredRow: CrossPositionDecisionRow | null
  fallbackCandidate: CrossPositionCandidateModel | null
  whyNow: string | null
  nextHorizonNote: string
}

const finiteNumber = (value: unknown): value is number => (
  typeof value === "number" && Number.isFinite(value)
)

const safeLeagueSize = (value: unknown): number | null => (
  finiteNumber(value) && Number.isInteger(value) && value > 0
    ? value
    : null
)

const finiteEvidenceValue = (value: unknown): number | null => (
  finiteNumber(value) ? value : null
)

const finiteProbability = (value: unknown): number | null => (
  finiteNumber(value) && value >= 0 && value <= 1 ? value : null
)

/**
 * A metric scale compares only the supplied values for that one metric. It is
 * never a valuation, probability, or score and it deliberately has no
 * cross-metric meaning.
 */
export const buildMetricComparisonScale = (
  values: unknown[],
): MetricComparisonScale => {
  const finiteValues = values.filter(finiteNumber)
  if (finiteValues.length === 0) {
    return {minimum: 0, maximum: 1, hasFiniteValues: false}
  }
  return {
    minimum: Math.min(...finiteValues),
    maximum: Math.max(...finiteValues),
    hasFiniteValues: true,
  }
}

export const metricComparisonPercent = (
  value: number | null,
  scale: MetricComparisonScale,
): number | null => {
  if (value === null || !scale.hasFiniteValues) return null
  const width = scale.maximum - scale.minimum
  if (!Number.isFinite(width) || width < 0) return null
  if (width === 0) return value === 0 ? 0 : 100
  return Math.min(100, Math.max(0, (
    (value - scale.minimum) / width
  ) * 100))
}

const decisionValueScale = (values: Array<number | null>): MetricComparisonScale => {
  const finiteValues = values.filter(finiteNumber)
  if (finiteValues.length === 0) {
    return {minimum: 0, maximum: 1, hasFiniteValues: false}
  }
  return {
    minimum: 0,
    maximum: Math.max(0, ...finiteValues),
    hasFiniteValues: true,
  }
}

/** A value scale is zero-based so a PAR bar has a stable, explicit baseline. */
export const crossPositionValuePercent = (
  value: number | null,
  scale: MetricComparisonScale,
): number | null => {
  if (value === null || !scale.hasFiniteValues || scale.maximum < 0) return null
  if (scale.maximum === 0) return 0
  return Math.min(100, Math.max(0, (value / scale.maximum) * 100))
}

const validProbability = (value: number | null): number | null => (
  value === null || value < 0 || value > 1 || !Number.isFinite(value)
    ? null
    : value
)

export const crossPositionWhyNow = (
  preferred: CrossPositionDecisionRow | null,
  rows: CrossPositionDecisionRow[],
): string | null => {
  if (!preferred?.candidate) return null
  const nextBest = rows
    .filter(row => row.position !== preferred.position)
    .filter(row => row.pointsAboveReplacement !== null)
    .sort((left, right) => (
      (right.pointsAboveReplacement || 0) - (left.pointsAboveReplacement || 0)
    ))[0]
  const valueLead = preferred.pointsAboveReplacement === null
    || nextBest?.pointsAboveReplacement === null
    || !nextBest
    ? null
    : preferred.pointsAboveReplacement - nextBest.pointsAboveReplacement
  const risk = preferred.riskBeforeNextPick
  const roundedLead = valueLead === null ? null : Number(valueLead.toFixed(1))
  const leadText = roundedLead === null
    ? `${preferred.position} is the deterministic preference.`
    : roundedLead > 0
      ? `${preferred.position} leads ${nextBest.position} by ${roundedLead.toFixed(1)} PAR.`
      : roundedLead < 0
        ? `${preferred.position} trails ${nextBest.position} by ${Math.abs(roundedLead).toFixed(1)} PAR, but remains the deterministic preference.`
        : `${preferred.position} and ${nextBest.position} are tied on PAR.`
  const riskText = risk === null
    ? " Next-pick survival evidence is unavailable."
    : ` ${Math.round(risk * 100)}% risk it is gone before your next pick.`
  return leadText + riskText
}

/**
 * Joins the existing deterministic recommendation and live tier presentation
 * models into a display-only four-position decision matrix. No scoring is
 * recomputed here; unavailable recommendation evidence remains unavailable.
 */
export const buildCrossPositionDecisionPresentationModel = (
  model: CrossPositionPresentationModel,
  tierModel: TierLandscapePresentationModel | null,
): CrossPositionDecisionPresentationModel => {
  const lanes = tierModel?.lanes || []
  const preliminary = lanes.map(lane => {
    const candidate = model.candidates.find(item => (
      item.player.position === lane.position
    )) || null
    const lanePlayer = lane.players[0]?.player || null
    const currentTier = lane.currentTopAvailableTier
    const survival = validProbability(candidate?.metricValues.survivalProbability ?? null)
    return {
      position: lane.position,
      candidate,
      lane,
      player: candidate?.player || lanePlayer,
      identitySource: candidate
        ? "candidate" as const
        : lanePlayer
          ? "tier_lane" as const
          : "unavailable" as const,
      pointsAboveReplacement: candidate?.metricValues.pointsAboveReplacement ?? null,
      riskBeforeNextPick: survival === null ? null : 1 - survival,
      tier: currentTier?.tier ?? null,
      tierAvailablePlayerCount: currentTier?.availablePlayerCount ?? null,
      runProbability: validProbability(lane.run.probability),
      runMinimumPicks: lane.run.minimumPicks,
      tierCliffProbability: validProbability(
        currentTier?.exhaustionProbability
        ?? candidate?.metricValues.tierBoundaryProbability
        ?? null,
      ),
    }
  })
  const valueScale = decisionValueScale(preliminary.map(row => (
    row.pointsAboveReplacement
  )))
  const rows = preliminary.map(row => ({
    ...row,
    valuePercent: crossPositionValuePercent(row.pointsAboveReplacement, valueScale),
  }))
  const preferredCandidate = model.candidates[0] || null
  const preferredRow = rows.find(row => (
    row.position === preferredCandidate?.player.position
    && row.lane.players.some(player => (
      player.player.id === preferredCandidate.player.id
    ))
  )) || null
  return {
    rows,
    valueScale,
    preferredRow,
    fallbackCandidate: model.candidates[1] || null,
    whyNow: crossPositionWhyNow(preferredRow, rows),
    nextHorizonNote: "Only the next-pick horizon is currently supplied; a second-turn run forecast is not calculated.",
  }
}

const candidateMetricValues = (
  candidate: PositionalBestsCandidateModel,
): CrossPositionMetricValues => ({
  marginalLineupPoints: finiteEvidenceValue(
    candidate.candidate.evidence.marginalLineupPoints,
  ),
  pointsAboveReplacement: finiteEvidenceValue(
    candidate.candidate.evidence.pointsAboveReplacement,
  ),
  replacementLevel: finiteEvidenceValue(
    candidate.candidate.evidence.replacementLevel,
  ),
  tierLossIfDeferred: finiteEvidenceValue(
    candidate.candidate.evidence.tierLossIfDeferred,
  ),
  survivalProbability: finiteProbability(
    candidate.candidate.evidence.survivalProbability,
  ),
  tierBoundaryProbability: finiteProbability(
    candidate.candidate.evidence.tierBoundaryProbability,
  ),
  positionalRunProbability: finiteProbability(
    candidate.candidate.evidence.positionalRunProbability,
  ),
  benchUtility: finiteEvidenceValue(
    candidate.candidate.evidence.benchUtility,
  ),
})

export const buildCrossPositionPresentationModel = ({
  recommendations,
  boardSettings,
  settings,
  playerStatus = {},
}: {
  recommendations: DraftRecommendationSet
  boardSettings: BoardSettings
  settings: FantasySettings
  playerStatus?: PlayerStatusCacheSnapshot
}): CrossPositionPresentationModel => {
  const positionalBests = buildPositionalBestsPresentationModel({
    recommendations,
    boardSettings,
    settings,
    playerStatus,
    candidateLimit: 4,
    candidateSource: recommendations.positionCandidates || recommendations.candidates,
  })
  const candidates = positionalBests.candidates.map(candidate => ({
    ...candidate,
    advisorScore: finiteEvidenceValue(candidate.candidate.score),
    metricValues: candidateMetricValues(candidate),
  }))
  const metricScales = CROSS_POSITION_METRIC_IDS.reduce((scales, id) => {
    scales[id] = buildMetricComparisonScale(
      candidates.map(candidate => candidate.metricValues[id]),
    )
    return scales
  }, {} as Record<CrossPositionMetricId, MetricComparisonScale>)

  return {
    currentPick: positionalBests.currentPick,
    nextUserPick: positionalBests.nextUserPick,
    picksBeforeNextUserPick: positionalBests.picksRemainingUntilNextUserPick,
    leagueSize: safeLeagueSize(settings.numTeams),
    scoringFormat: settings.ppr ? "PPR" : "Standard",
    explanation: recommendations.viewExplanation,
    projectionScale: positionalBests.projectionScale,
    metricScales,
    candidates,
  }
}
