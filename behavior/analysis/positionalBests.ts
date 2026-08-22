import type {
  DraftRecommendationCandidate,
  DraftRecommendationSet,
} from "../draft-advisor/recommendations"
import { recommendationPlayerStatusEvidence } from "../api/playerStatus"
import type { PlayerStatusEvent } from "../api/playerStatus"
import type { PlayerStatusCacheSnapshot } from "../api/playerStatusCache"
import { ThirdPartyRanker } from "../../types"
import type {
  BoardSettings,
  FantasyRanker,
  FantasySettings,
  Player,
} from "../../types"
import {positionRankFor, positionTierFor, scoringFormatFor} from "../scoringFormat"


export interface ProjectionRangeInput {
  floor: unknown
  median: unknown
  ceiling: unknown
}

export interface ProjectionRangeValues {
  floor: number | null
  median: number | null
  ceiling: number | null
  rangeFloor: number | null
  rangeCeiling: number | null
}

export interface ProjectionScale {
  minimum: number
  maximum: number
  hasFiniteValues: boolean
}

export interface ProjectionRangeModel extends ProjectionRangeValues {
  startPercent: number | null
  endPercent: number | null
  medianPercent: number | null
}

export interface PositionalBestsCandidateModel {
  candidate: DraftRecommendationCandidate
  player: Player
  preferenceLabel: "Preferred" | "Fallback"
  fallbackNumber: number | null
  positionRank: number | null
  positionRankSourceLabel: string
  customPositionRank: number | null
  customTier: number | null
  activeTier: number | null
  activeTierSourceLabel: string
  projectionTier: number | null
  projection: ProjectionRangeModel
  statusEvidence: PlayerStatusEvent[]
  statusState: "loading" | "ready" | "unavailable" | null
}

export interface PositionalBestsPresentationModel {
  currentPick: number | null
  nextUserPick: number | null
  picksRemainingUntilNextUserPick: number | null
  projectionScale: ProjectionScale
  candidates: PositionalBestsCandidateModel[]
}

const finiteNumber = (value: unknown): value is number => (
  typeof value === "number" && Number.isFinite(value)
)

const usableRank = (value: unknown): number | null => (
  finiteNumber(value)
  && Number.isInteger(value)
  && value > 0
  && value < 9999
    ? value
    : null
)

const usableTier = (value: unknown): number | null => (
  finiteNumber(value)
  && Number.isInteger(value)
  && value > 0
    ? value
    : null
)

const clamp = (value: number, minimum: number, maximum: number): number => (
  Math.min(maximum, Math.max(minimum, value))
)

const finiteProjectionValues = (input: ProjectionRangeInput): number[] => [
  input.floor,
  input.median,
  input.ceiling,
].filter(finiteNumber)

/**
 * Normalize only the visual range. Missing values remain missing in text;
 * malformed ordering is repaired for the range so it cannot draw backwards.
 */
export const normalizeProjectionRange = (
  input: ProjectionRangeInput,
): ProjectionRangeValues => {
  const floor = finiteNumber(input.floor) ? input.floor : null
  const median = finiteNumber(input.median) ? input.median : null
  const ceiling = finiteNumber(input.ceiling) ? input.ceiling : null
  const values = finiteProjectionValues(input)
  if (values.length === 0) {
    return {
      floor: null,
      median: null,
      ceiling: null,
      rangeFloor: null,
      rangeCeiling: null,
    }
  }

  const rawRangeFloor = floor ?? Math.min(...values)
  const rawRangeCeiling = ceiling ?? Math.max(...values)
  const rangeFloor = Math.min(rawRangeFloor, rawRangeCeiling, ...values)
  const rangeCeiling = Math.max(rawRangeFloor, rawRangeCeiling, ...values)
  const malformedOrder = floor !== null
    && ceiling !== null
    && floor > ceiling
  return {
    floor: floor === null
      ? null
      : clamp(malformedOrder ? ceiling : floor, rangeFloor, rangeCeiling),
    median: median === null
      ? null
      : clamp(median, rangeFloor, rangeCeiling),
    ceiling: ceiling === null
      ? null
      : clamp(malformedOrder ? floor : ceiling, rangeFloor, rangeCeiling),
    rangeFloor,
    rangeCeiling,
  }
}

export const buildProjectionScale = (
  ranges: ProjectionRangeValues[],
): ProjectionScale => {
  const values = ranges.flatMap(range => [
    range.rangeFloor,
    range.rangeCeiling,
    range.floor,
    range.median,
    range.ceiling,
  ]).filter(finiteNumber)
  if (values.length === 0) {
    return {minimum: 0, maximum: 1, hasFiniteValues: false}
  }
  const minimum = Math.min(...values)
  const maximum = Math.max(...values)
  if (minimum !== maximum) {
    return {minimum, maximum, hasFiniteValues: true}
  }
  if (minimum === 0) {
    return {minimum: 0, maximum: 1, hasFiniteValues: true}
  }
  return {
    minimum: minimum - 1,
    maximum: maximum + 1,
    hasFiniteValues: true,
  }
}

const percentFor = (value: number | null, scale: ProjectionScale): number | null => {
  if (value === null || !scale.hasFiniteValues) return null
  const width = scale.maximum - scale.minimum
  if (!Number.isFinite(width) || width <= 0) return 0
  return clamp(((value - scale.minimum) / width) * 100, 0, 100)
}

export const createProjectionRangeModel = (
  input: ProjectionRangeInput,
  scale: ProjectionScale,
): ProjectionRangeModel => {
  const values = normalizeProjectionRange(input)
  return {
    ...values,
    startPercent: percentFor(values.rangeFloor, scale),
    endPercent: percentFor(values.rangeCeiling, scale),
    medianPercent: percentFor(values.median, scale),
  }
}

export const formatProjectionValue = (value: number | null): string => (
  value === null ? "—" : value.toFixed(1)
)

export const formatEvidenceValue = (value: unknown): string => (
  finiteNumber(value) ? value.toFixed(1) : "Unavailable"
)

export const formatEvidenceProbability = (value: unknown): string => (
  finiteNumber(value) ? `${(value * 100).toFixed(0)}%` : "Unavailable"
)

export const rankingSourceLabel = (ranker: FantasyRanker): string => (
  ranker === ThirdPartyRanker.CUSTOM
    ? "Custom draft board"
    : `${String(ranker)} draft board`
)

const customRankAndTier = (
  player: Player,
  settings: FantasySettings,
): {rank: number | null; tier: number | null} => {
  const custom = player.ranks?.[ThirdPartyRanker.CUSTOM]
  const scoringFormat = scoringFormatFor(settings)
  return {
    rank: usableRank(positionRankFor(custom, scoringFormat)),
    tier: usableTier(positionTierFor(custom, scoringFormat)?.tierNumber),
  }
}

const safePick = (value: unknown): number | null => (
  finiteNumber(value) && value >= 1 ? value : null
)

const buildCandidate = (
  candidate: DraftRecommendationCandidate,
  index: number,
  boardSettings: BoardSettings,
  settings: FantasySettings,
  playerStatus: PlayerStatusCacheSnapshot,
  projectionScale: ProjectionScale,
): PositionalBestsCandidateModel => {
  const custom = customRankAndTier(candidate.player, settings)
  const status = playerStatus[candidate.player.id]
  return {
    candidate,
    player: candidate.player,
    preferenceLabel: index === 0 ? "Preferred" : "Fallback",
    fallbackNumber: index === 0 ? null : index,
    positionRank: usableRank(candidate.positionRank),
    positionRankSourceLabel: rankingSourceLabel(boardSettings.ranker),
    customPositionRank: custom.rank,
    customTier: custom.tier,
    activeTier: usableTier(candidate.evidence.userTier),
    activeTierSourceLabel: rankingSourceLabel(boardSettings.ranker),
    projectionTier: usableTier(candidate.evidence.projectionTier),
    projection: createProjectionRangeModel({
      floor: candidate.evidence.projectedFloor,
      median: candidate.evidence.projectedMedian,
      ceiling: candidate.evidence.projectedCeiling,
    }, projectionScale),
    statusEvidence: recommendationPlayerStatusEvidence(
      status?.response?.events || [],
    ),
    statusState: status?.state || null,
  }
}

export const buildPositionalBestsPresentationModel = ({
  recommendations,
  boardSettings,
  settings,
  playerStatus = {},
  candidateLimit = 3,
  candidateSource,
}: {
  recommendations: DraftRecommendationSet
  boardSettings: BoardSettings
  settings: FantasySettings
  playerStatus?: PlayerStatusCacheSnapshot
  candidateLimit?: number
  candidateSource?: DraftRecommendationCandidate[]
}): PositionalBestsPresentationModel => {
  // The recommendation engine owns shortlist ordering and the default
  // three-candidate surface. Cross-position presentation explicitly opts into
  // the separate per-position source.
  // The slice is a defensive render bound, never a selection or reordering.
  const suppliedCandidates = (candidateSource || recommendations.candidates)
    .slice(0, candidateLimit)
  const normalizedRanges = suppliedCandidates.map(candidate =>
    normalizeProjectionRange({
      floor: candidate.evidence.projectedFloor,
      median: candidate.evidence.projectedMedian,
      ceiling: candidate.evidence.projectedCeiling,
    }))
  const projectionScale = buildProjectionScale(normalizedRanges)
  const currentPick = safePick(recommendations.currentPick)
  const nextUserPick = safePick(recommendations.nextUserPick)
  return {
    currentPick,
    nextUserPick,
    picksRemainingUntilNextUserPick: currentPick !== null
      && nextUserPick !== null
      ? Math.max(0, nextUserPick - currentPick)
      : null,
    projectionScale,
    candidates: suppliedCandidates.map((candidate, index) =>
      buildCandidate(
        candidate,
        index,
        boardSettings,
        settings,
        playerStatus,
        projectionScale,
      )),
  }
}
