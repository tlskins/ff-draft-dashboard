import {
  buildPositionalBestsPresentationModel,
  PositionalBestsCandidateModel,
  ProjectionScale,
  rankingSourceLabel,
} from "./positionalBests"
import type { PlayerStatusCacheSnapshot } from "../api/playerStatusCache"
import {recommendationPlayerStatusEvidence} from "../api/playerStatus"
import type { DraftRecommendationSet } from "../draft-advisor/recommendations"
import type {DraftRecommendationCandidate} from "../draft-advisor/recommendations"
import type {AdvisorComparisonItem} from "../advisorComparisonSet"
import {getPlayerMetrics} from "../draft"
import {ThirdPartyRanker} from "../../types"
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
extends Omit<PositionalBestsCandidateModel, "candidate"> {
  candidate: DraftRecommendationCandidate | null
  advisorScore: number | null
  metricValues: CrossPositionMetricValues
  inclusionReasonCode: AdvisorComparisonItem["reasonCode"]
  inclusionReasonLabel: string
  recommendationEvidenceAvailable: boolean
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
  lane: TierLandscapeLaneModel | null
  player: Player | null
  identitySource: "candidate" | "comparison_set" | "unavailable"
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
  const preliminary = model.candidates.map(candidate => {
    const lane = lanes.find(item => item.position === candidate.player.position)
      || null
    const lanePlayer = lane?.players.find(item => (
      item.player.id === candidate.player.id
    )) || null
    const currentTier = lanePlayer?.primaryTier ?? null
    const survival = validProbability(candidate?.metricValues.survivalProbability ?? null)
    return {
      position: candidate.player.position as TierLandscapePosition,
      candidate,
      lane,
      player: candidate.player,
      identitySource: candidate.recommendationEvidenceAvailable
        ? "candidate" as const
        : "comparison_set" as const,
      pointsAboveReplacement: candidate?.metricValues.pointsAboveReplacement ?? null,
      riskBeforeNextPick: survival === null ? null : 1 - survival,
      tier: currentTier,
      tierAvailablePlayerCount: currentTier === null
        ? null
        : lane?.players.filter(item => item.primaryTier === currentTier).length
          ?? null,
      runProbability: validProbability(lane?.run.probability ?? null),
      runMinimumPicks: lane?.run.minimumPicks ?? null,
      tierCliffProbability: validProbability(
        candidate?.metricValues.tierBoundaryProbability
        ?? (lanePlayer?.primaryTier === lane?.currentTopAvailableTier?.tier
          ? lane?.currentTopAvailableTier?.exhaustionProbability ?? null
          : null)
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
  const preferredRow = rows[0] || null
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

const emptyMetricValues = (): CrossPositionMetricValues => (
  CROSS_POSITION_METRIC_IDS.reduce((values, id) => {
    values[id] = null
    return values
  }, {} as CrossPositionMetricValues)
)

const usableRank = (value: unknown): number | null => (
  typeof value === "number"
  && Number.isInteger(value)
  && value > 0
  && value < 9999
    ? value
    : null
)

const usableTier = (value: unknown): number | null => (
  typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null
)

export const buildCrossPositionPresentationModel = ({
  recommendations,
  boardSettings,
  settings,
  playerStatus = {},
  comparisonItems,
}: {
  recommendations: DraftRecommendationSet
  boardSettings: BoardSettings
  settings: FantasySettings
  playerStatus?: PlayerStatusCacheSnapshot
  comparisonItems: AdvisorComparisonItem[]
}): CrossPositionPresentationModel => {
  const selectedItems = comparisonItems.slice(0, 3)
  const evidenceById = new Map<string, DraftRecommendationCandidate>()
  const evidenceCandidates = [
    ...recommendations.candidates,
    ...(recommendations.positionCandidates || []),
  ]
  evidenceCandidates.forEach(candidate => {
    if (!evidenceById.has(candidate.player.id)) {
      evidenceById.set(candidate.player.id, candidate)
    }
  })
  const selectedEvidence = selectedItems.flatMap(item => {
    const evidence = evidenceById.get(item.player.id)
    return evidence ? [{...evidence, player: item.player}] : []
  })
  const positionalBests = buildPositionalBestsPresentationModel({
    recommendations,
    boardSettings,
    settings,
    playerStatus,
    candidateLimit: 3,
    candidateSource: selectedEvidence,
  })
  const presentationById = new Map(positionalBests.candidates.map(candidate => (
    [candidate.player.id, candidate]
  )))
  const candidates = selectedItems.map((item, index) => {
    const supplied = presentationById.get(item.player.id)
    if (supplied) {
      return {
        ...supplied,
        player: item.player,
        preferenceLabel: index === 0 ? "Preferred" as const : "Fallback" as const,
        fallbackNumber: index === 0 ? null : index,
        advisorScore: finiteEvidenceValue(supplied.candidate.score),
        metricValues: candidateMetricValues(supplied),
        inclusionReasonCode: item.reasonCode,
        inclusionReasonLabel: item.reasonLabel,
        recommendationEvidenceAvailable: true,
      }
    }
    const metrics = getPlayerMetrics(item.player, settings, boardSettings)
    const customMetrics = getPlayerMetrics(item.player, settings, {
      ...boardSettings,
      ranker: ThirdPartyRanker.CUSTOM,
    })
    const status = playerStatus[item.player.id]
    return {
      candidate: null,
      player: item.player,
      preferenceLabel: index === 0 ? "Preferred" as const : "Fallback" as const,
      fallbackNumber: index === 0 ? null : index,
      positionRank: usableRank(metrics.posRank),
      positionRankSourceLabel: rankingSourceLabel(boardSettings.ranker),
      customPositionRank: usableRank(customMetrics.posRank),
      customTier: usableTier(customMetrics.tier?.tierNumber),
      activeTier: usableTier(metrics.tier?.tierNumber),
      activeTierSourceLabel: rankingSourceLabel(boardSettings.ranker),
      projectionTier: null,
      projection: {
        floor: null,
        median: null,
        ceiling: null,
        rangeFloor: null,
        rangeCeiling: null,
        startPercent: null,
        endPercent: null,
        medianPercent: null,
      },
      statusEvidence: recommendationPlayerStatusEvidence(
        status?.response?.events || [],
      ),
      statusState: status?.state || null,
      advisorScore: null,
      metricValues: emptyMetricValues(),
      inclusionReasonCode: item.reasonCode,
      inclusionReasonLabel: item.reasonLabel,
      recommendationEvidenceAvailable: false,
    }
  })
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
    explanation: "The shared advisor comparison set is shown in controller order. Recommendation evidence is displayed only when supplied.",
    projectionScale: positionalBests.projectionScale,
    metricScales,
    candidates,
  }
}
