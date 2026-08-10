import {
  buildPositionalBestsPresentationModel,
  PositionalBestsCandidateModel,
  ProjectionScale,
} from "./positionalBests"
import type { PlayerStatusCacheSnapshot } from "../api/playerStatusCache"
import type { DraftRecommendationSet } from "../draft-advisor/recommendations"
import type { BoardSettings, FantasySettings } from "../../types"

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
  projectionScale: ProjectionScale
  metricScales: Record<CrossPositionMetricId, MetricComparisonScale>
  candidates: CrossPositionCandidateModel[]
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
    projectionScale: positionalBests.projectionScale,
    metricScales,
    candidates,
  }
}
