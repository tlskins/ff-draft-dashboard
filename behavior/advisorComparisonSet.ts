import {
  BoardSettings,
  FantasyPosition,
  FantasySettings,
  Player,
  PlayerTarget,
} from "../types"
import {getPlayerMetrics} from "./draft"
import type {
  DraftRecommendationCandidate,
  DraftRecommendationSet,
} from "./draft-advisor/recommendations"
import {isPlayerAutomaticallyRecommendable} from "./playerAvailability"

export const MAX_ADVISOR_COMPARISON_PLAYERS = 3

export type AdvisorComparisonReasonCode =
  | "recommended_now"
  | "tier_cliff"
  | "user_target"
  | "top_position"
  | "manual_pin"

export interface AdvisorComparisonItem {
  player: Player
  reasonCode: AdvisorComparisonReasonCode
  reasonLabel: string
}

interface BuildAdvisorComparisonSetOptions {
  recommendations: DraftRecommendationSet | null
  availablePlayers: Player[]
  playerTargets: PlayerTarget[]
  settings: FantasySettings
  boardSettings: BoardSettings
}

const POSITION_ORDER = [
  FantasyPosition.RUNNING_BACK,
  FantasyPosition.WIDE_RECEIVER,
  FantasyPosition.QUARTERBACK,
  FantasyPosition.TIGHT_END,
] as const

const positionOrder = (position: FantasyPosition): number => {
  const index = POSITION_ORDER.indexOf(position as typeof POSITION_ORDER[number])
  return index === -1 ? POSITION_ORDER.length : index
}

const rankValue = (
  player: Player,
  settings: FantasySettings,
  boardSettings: BoardSettings,
): number => {
  const metrics = getPlayerMetrics(player, settings, boardSettings)
  const rank = metrics.overallOrPosRank ?? metrics.posRank
  return Number.isFinite(rank) && rank > 0 ? rank : Number.MAX_SAFE_INTEGER
}

const validAvailablePlayer = (
  player: Player | undefined,
  availableById: Map<string, Player>,
  settings: FantasySettings,
  boardSettings: BoardSettings,
): Player | null => {
  if (!player || !player.id?.trim() || !player.fullName?.trim()) return null
  if (!POSITION_ORDER.includes(player.position as typeof POSITION_ORDER[number])) {
    return null
  }
  const available = availableById.get(player.id)
  if (!available || !isPlayerAutomaticallyRecommendable(available, boardSettings)) {
    return null
  }
  return rankValue(available, settings, boardSettings) < Number.MAX_SAFE_INTEGER
    ? available
    : null
}

const candidateTieBreak = (
  left: DraftRecommendationCandidate,
  right: DraftRecommendationCandidate,
): number => left.positionRank - right.positionRank
  || positionOrder(left.player.position) - positionOrder(right.player.position)
  || left.player.id.localeCompare(right.player.id)

const playerTieBreak = (
  settings: FantasySettings,
  boardSettings: BoardSettings,
) => (left: Player, right: Player): number => (
  rankValue(left, settings, boardSettings)
  - rankValue(right, settings, boardSettings)
  || positionOrder(left.position) - positionOrder(right.position)
  || left.id.localeCompare(right.id)
)

/**
 * Deterministic Phase 14B policy. The first valid occurrence wins:
 * supplied recommendation order, imminent tier-cliff urgency, explicit target
 * round/rank, then one top-ranked alternative per position. The result is
 * validated against live availability, deduplicated, and capped at three.
 */
export const buildAdvisorComparisonSet = ({
  recommendations,
  availablePlayers,
  playerTargets,
  settings,
  boardSettings,
}: BuildAdvisorComparisonSetOptions): AdvisorComparisonItem[] => {
  const availableById = new Map<string, Player>()
  availablePlayers.forEach(player => {
    if (player?.id && !availableById.has(player.id)) {
      availableById.set(player.id, player)
    }
  })
  const result: AdvisorComparisonItem[] = []
  const selected = new Set<string>()
  const include = (
    player: Player | undefined,
    reasonCode: AdvisorComparisonReasonCode,
    reasonLabel: string,
  ) => {
    if (result.length >= MAX_ADVISOR_COMPARISON_PLAYERS) return
    const valid = validAvailablePlayer(
      player,
      availableById,
      settings,
      boardSettings,
    )
    if (!valid || selected.has(valid.id)) return
    selected.add(valid.id)
    result.push({player: valid, reasonCode, reasonLabel})
  }

  // Recommendation order is already deterministic advisor authority. Do not
  // rescore or reinterpret it here.
  recommendations?.candidates.forEach(candidate => include(
    candidate.player,
    "recommended_now",
    "Recommended now",
  ))

  const candidatePool = recommendations?.positionCandidates
    || recommendations?.candidates
    || []
  const cliffCandidates = candidatePool
    .filter(candidate => candidate.evidence.tierLossIfDeferred > 0
      || candidate.evidence.flags.some(flag => /tier.*cliff|tier.*exhaust/i.test(flag)))
    .sort((left, right) => {
      const leftUrgency = left.evidence.tierLossIfDeferred
        * (1 - left.evidence.survivalProbability)
      const rightUrgency = right.evidence.tierLossIfDeferred
        * (1 - right.evidence.survivalProbability)
      return rightUrgency - leftUrgency || candidateTieBreak(left, right)
    })
  cliffCandidates.forEach(candidate => include(
    candidate.player,
    "tier_cliff",
    "Tier cliff",
  ))

  const comparePlayers = playerTieBreak(settings, boardSettings)
  const targets = [...playerTargets]
    .filter((target, index, all) => all.findIndex(candidate => (
      candidate.playerId === target.playerId
    )) === index)
    .sort((left, right) => {
      const leftPlayer = availableById.get(left.playerId)
      const rightPlayer = availableById.get(right.playerId)
      return left.targetAsEarlyAsRound - right.targetAsEarlyAsRound
        || (leftPlayer
          ? rankValue(leftPlayer, settings, boardSettings)
          : Number.MAX_SAFE_INTEGER)
        - (rightPlayer
          ? rankValue(rightPlayer, settings, boardSettings)
          : Number.MAX_SAFE_INTEGER)
        || positionOrder(leftPlayer?.position || FantasyPosition.NONE)
        - positionOrder(rightPlayer?.position || FantasyPosition.NONE)
        || left.playerId.localeCompare(right.playerId)
    })
  targets.forEach(target => include(
    availableById.get(target.playerId),
    "user_target",
    "User target",
  ))

  const topByPosition = POSITION_ORDER.flatMap(position => {
    const top = availablePlayers
      .filter(player => player.position === position)
      .sort(comparePlayers)[0]
    return top ? [top] : []
  }).sort(comparePlayers)
  topByPosition.forEach(player => include(
    player,
    "top_position",
    `Top ${player.position}`,
  ))

  return result
}

export const advisorComparisonSetSignature = (
  items: AdvisorComparisonItem[],
): string => items.map(item => `${item.player.id}:${item.reasonCode}`).join("|")

/** A draft pick add, removal, correction, or replacement changes this key. */
export const createMaterialDraftEventKey = (
  draftHistory: Array<string | null>,
): string => {
  const picks = draftHistory.flatMap((playerId, index) => (
    playerId ? [`${index + 1}:${playerId}`] : []
  ))
  return picks.length > 0 ? `draft:${picks.join("|")}` : "draft:empty"
}

export const createManualComparisonItem = (
  player: Player,
): AdvisorComparisonItem => ({
  player,
  reasonCode: "manual_pin",
  reasonLabel: "Manual pin",
})
