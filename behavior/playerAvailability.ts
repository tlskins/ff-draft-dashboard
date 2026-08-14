import { BoardSettings, Player, ThirdPartyRanker } from "types"

const hasExplicitCustomPositionalRank = (player: Player): boolean => {
  const custom = player.ranks?.[ThirdPartyRanker.CUSTOM]
  return Number.isFinite(custom?.standardPositionRank)
    || Number.isFinite(custom?.pprPositionRank)
}

/**
 * Legacy snapshots remain recommendation-compatible. New snapshots fail closed
 * unless normalized availability permits automation or a nonterminal player has
 * an explicit Custom positional rank. Terminal inactivity cannot be overridden.
 */
export const isPlayerAutomaticallyRecommendable = (
  player: Player,
  boardSettings: BoardSettings,
): boolean => {
  const availability = player.availability
  if (!availability) return true
  if (availability.state === "inactive_confirmed") return false
  if (availability.automaticRecommendationEligible) return true
  return boardSettings.ranker === ThirdPartyRanker.CUSTOM
    && hasExplicitCustomPositionalRank(player)
}
