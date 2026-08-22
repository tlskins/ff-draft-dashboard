import {
  BoardSettings,
  FantasyPosition,
  FantasySettings,
  Player,
  RankingSummary,
  ThirdPartyRanker,
} from "../../types"
import type { FantasyRanker } from "../../types"
import { recommendationPlayerStatusEvidence } from "../api/playerStatus"
import type { PlayerStatusEvent } from "../api/playerStatus"
import type { PlayerStatusCacheSnapshot } from "../api/playerStatusCache"
import { getAdvisorProjection } from "../draft-advisor/recommendations"
import {
  buildProjectionScale,
  createProjectionRangeModel,
  normalizeProjectionRange,
  ProjectionRangeModel,
  ProjectionRangeValues,
  ProjectionScale,
  rankingSourceLabel,
} from "./positionalBests"
import {positionRankFor, positionTierFor, scoringFormatFor} from "../scoringFormat"

export const INTRA_POSITION_POSITIONS = [
  FantasyPosition.QUARTERBACK,
  FantasyPosition.RUNNING_BACK,
  FantasyPosition.WIDE_RECEIVER,
  FantasyPosition.TIGHT_END,
] as const

export type IntraPosition = typeof INTRA_POSITION_POSITIONS[number]

/** The live shortlist is intentionally bounded independently of advisor picks. */
export const MAX_INTRA_POSITION_SHORTLIST_PLAYERS = 5

export interface IntraPositionPlayerModel {
  player: Player
  shortlistOrder: number
  positionRank: number | null
  positionRankSourceLabel: string
  customPositionRank: number | null
  customTier: number | null
  activeTier: number | null
  activeTierSourceLabel: string
  projectionTier: number | null
  projection: ProjectionRangeModel
  projectionSpread: number | null
  statusEvidence: PlayerStatusEvent[]
  statusState: "loading" | "ready" | "unavailable" | null
}

export interface IntraPositionPresentationModel {
  position: IntraPosition
  totalAvailablePlayerCount: number
  visiblePlayerCount: number
  hiddenPlayerCount: number
  projectionScale: ProjectionScale
  players: IntraPositionPlayerModel[]
}

interface PreliminaryPlayer {
  player: Player
  positionRank: number | null
  positionRankSourceLabel: string
  customPositionRank: number | null
  customTier: number | null
  activeTier: number | null
  activeTierSourceLabel: string
  projectionTier: number | null
  projectionValues: ProjectionRangeValues
  projectionSpread: number | null
  statusEvidence: PlayerStatusEvent[]
  statusState: "loading" | "ready" | "unavailable" | null
}

const finiteNumber = (value: unknown): value is number => (
  typeof value === "number" && Number.isFinite(value)
)

const usablePositiveInteger = (value: unknown): number | null => (
  finiteNumber(value)
  && Number.isInteger(value)
  && value > 0
  && value < 9999
    ? value
    : null
)

const displayName = (player: Player): string => (
  typeof player.fullName === "string" ? player.fullName : ""
)

const rankAndTierFor = (
  player: Player,
  ranker: FantasyRanker,
  settings: FantasySettings,
): {rank: number | null; tier: number | null} => {
  const ranking = player.ranks?.[ranker]
  const scoringFormat = scoringFormatFor(settings)
  return {
    rank: usablePositiveInteger(positionRankFor(ranking, scoringFormat)),
    tier: usablePositiveInteger(positionTierFor(ranking, scoringFormat)?.tierNumber),
  }
}

/**
 * Only the supplied available collection may populate the live shortlist.
 * Sorting before de-duplication makes duplicate records deterministic without
 * consulting the complete player library or any advisor candidate set.
 */
const uniqueAvailablePlayersAtPosition = (
  availablePlayers: Player[],
  position: IntraPosition,
): Player[] => {
  const candidates = (Array.isArray(availablePlayers) ? availablePlayers : [])
    .filter((player): player is Player => (
      !!player
      && typeof player.id === "string"
      && player.id.length > 0
      && player.position === position
    ))
    .slice()
    .sort((left, right) => (
      left.id.localeCompare(right.id)
      || displayName(left).localeCompare(displayName(right))
      || String(left.team).localeCompare(String(right.team))
    ))
  const byId = new Map<string, Player>()
  candidates.forEach(player => {
    if (!byId.has(player.id)) byId.set(player.id, player)
  })
  return Array.from(byId.values())
}

const playerOrder = (
  left: PreliminaryPlayer,
  right: PreliminaryPlayer,
): number => (
  (left.positionRank ?? Number.MAX_SAFE_INTEGER)
  - (right.positionRank ?? Number.MAX_SAFE_INTEGER)
  || displayName(left.player).localeCompare(displayName(right.player))
  || left.player.id.localeCompare(right.player.id)
)

const projectionFor = (
  player: Player,
  settings: FantasySettings,
  boardSettings: BoardSettings,
  rankingSummaries: RankingSummary[],
): {
  tier: number | null
  values: ProjectionRangeValues
  spread: number | null
} => {
  const projection = getAdvisorProjection(
    player,
    settings,
    boardSettings,
    rankingSummaries,
  )
  const tier = usablePositiveInteger(projection.tier)
  if (tier === null) {
    return {
      tier: null,
      values: normalizeProjectionRange({
        floor: null,
        median: null,
        ceiling: null,
      }),
      spread: null,
    }
  }

  const values = normalizeProjectionRange({
    floor: projection.floor,
    median: projection.median,
    ceiling: projection.ceiling,
  })
  return {
    tier,
    values,
    spread: values.floor !== null && values.ceiling !== null
      ? values.ceiling - values.floor
      : null,
  }
}

const preliminaryPlayerFor = (
  player: Player,
  boardSettings: BoardSettings,
  settings: FantasySettings,
  rankingSummaries: RankingSummary[],
  playerStatus: PlayerStatusCacheSnapshot,
): PreliminaryPlayer => {
  const active = rankAndTierFor(player, boardSettings.ranker, settings)
  const custom = rankAndTierFor(player, ThirdPartyRanker.CUSTOM, settings)
  const projection = projectionFor(
    player,
    settings,
    boardSettings,
    rankingSummaries,
  )
  const status = playerStatus[player.id]
  return {
    player,
    positionRank: active.rank,
    positionRankSourceLabel: rankingSourceLabel(boardSettings.ranker),
    customPositionRank: custom.rank,
    customTier: custom.tier,
    activeTier: active.tier,
    activeTierSourceLabel: rankingSourceLabel(boardSettings.ranker),
    projectionTier: projection.tier,
    projectionValues: projection.values,
    projectionSpread: projection.spread,
    statusEvidence: recommendationPlayerStatusEvidence(
      status?.response?.events || [],
    ),
    statusState: status?.state || null,
  }
}

/**
 * Builds a live, selected-position shortlist.  It deliberately does not read
 * recommendation candidates, ADP, history, status, or projections to decide
 * eligibility or order.
 */
export const buildIntraPositionPresentationModel = ({
  position,
  availablePlayers,
  boardSettings,
  settings,
  rankingSummaries,
  playerStatus = {},
}: {
  position: IntraPosition
  availablePlayers: Player[]
  boardSettings: BoardSettings
  settings: FantasySettings
  rankingSummaries: RankingSummary[]
  playerStatus?: PlayerStatusCacheSnapshot
}): IntraPositionPresentationModel => {
  const eligible = uniqueAvailablePlayersAtPosition(availablePlayers, position)
  const ordered = eligible
    .map(player => preliminaryPlayerFor(
      player,
      boardSettings,
      settings,
      rankingSummaries,
      playerStatus,
    ))
    .sort(playerOrder)
  const visible = ordered.slice(0, MAX_INTRA_POSITION_SHORTLIST_PLAYERS)
  const projectionScale = buildProjectionScale(
    visible.map(player => player.projectionValues),
  )

  return {
    position,
    totalAvailablePlayerCount: ordered.length,
    visiblePlayerCount: visible.length,
    hiddenPlayerCount: Math.max(0, ordered.length - visible.length),
    projectionScale,
    players: visible.map((player, index) => ({
      player: player.player,
      shortlistOrder: index + 1,
      positionRank: player.positionRank,
      positionRankSourceLabel: player.positionRankSourceLabel,
      customPositionRank: player.customPositionRank,
      customTier: player.customTier,
      activeTier: player.activeTier,
      activeTierSourceLabel: player.activeTierSourceLabel,
      projectionTier: player.projectionTier,
      projection: createProjectionRangeModel({
        floor: player.projectionValues.floor,
        median: player.projectionValues.median,
        ceiling: player.projectionValues.ceiling,
      }, projectionScale),
      projectionSpread: player.projectionSpread,
      statusEvidence: player.statusEvidence,
      statusState: player.statusState,
    })),
  }
}
