import {
  FantasyPosition,
} from "../../types"
import type {
  BoardSettings,
  FantasySettings,
  Player,
} from "../../types"
import {getPlayerMetrics} from "../draft"
import type {RoundMarketTierInput} from "../analysis/roundMarket"
import type {PlanConstraintsPresentationModel} from "./planConstraints"
import type {PlanConstraintsEvidenceSummary} from "./insightCandidates"

const POSITIONS = [
  FantasyPosition.QUARTERBACK,
  FantasyPosition.RUNNING_BACK,
  FantasyPosition.WIDE_RECEIVER,
  FantasyPosition.TIGHT_END,
] as const

const isPosition = (value: unknown): value is typeof POSITIONS[number] => (
  POSITIONS.includes(value as typeof POSITIONS[number])
)

const usableTier = (value: unknown): value is number => (
  typeof value === "number" && Number.isInteger(value) && value > 0
)

interface TieredPlayer {
  id: string
  position: typeof POSITIONS[number]
  tier: number
}

/**
 * Derives membership only from the complete supplied active board.  A player
 * with conflicting duplicate memberships is omitted rather than guessed; the
 * round-market core will independently fail closed if its bounded pool cannot
 * support one of these full-board memberships.
 */
export const buildActiveBoardTierInputs = ({
  availablePlayers,
  boardSettings,
  settings,
}: {
  availablePlayers: Player[]
  boardSettings: BoardSettings
  settings: FantasySettings
}): RoundMarketTierInput[] => {
  const memberships = availablePlayers.flatMap(player => {
    if (!player?.id?.trim() || !isPosition(player.position)) return []
    const tier = getPlayerMetrics(player, settings, boardSettings).tier?.tierNumber
    return usableTier(tier) ? [{id: player.id.trim(), position: player.position, tier}] : []
  })
  const byId = new Map<string, TieredPlayer[]>()
  memberships.forEach(membership => {
    const current = byId.get(membership.id) || []
    current.push(membership)
    byId.set(membership.id, current)
  })
  const resolved = Array.from(byId.values()).flatMap(entries => {
    const [first] = entries
    return first && entries.every(entry => (
      entry.position === first.position && entry.tier === first.tier
    )) ? [first] : []
  })
  const grouped = new Map<string, TieredPlayer[]>()
  resolved.forEach(entry => {
    const key = `${entry.position}\u0000${entry.tier}`
    const current = grouped.get(key) || []
    current.push(entry)
    grouped.set(key, current)
  })
  return POSITIONS.flatMap(position => Array.from(grouped.values())
    .filter(entries => entries[0]?.position === position)
    .sort((left, right) => left[0].tier - right[0].tier)
    .slice(0, 2)
    .flatMap(entries => {
      const playerIds = Array.from(new Set(entries.map(entry => entry.id))).sort()
      const tier = entries[0]?.tier
      return tier && playerIds.length > 0 ? [{
        authority: "active_board" as const,
        position,
        tier,
        playerIds,
      }] : []
    }))
}

/**
 * Read-only counts for deck selection.  This never turns plan or roster data
 * into a draft recommendation.
 */
export const buildPlanConstraintsEvidenceSummary = (
  model: PlanConstraintsPresentationModel,
): PlanConstraintsEvidenceSummary => {
  const userOpen = model.rosterState === "unavailable"
    ? null
    : model.userSlots.filter(slot => !slot.filled).length
  const otherTeamUnmet = model.leagueNeedsState === "ready"
    ? model.leagueNeeds.reduce((count, need) => count + need.teamsMissing, 0)
    : model.leagueNeedsState === "empty" ? 0 : null
  const confirmedEntries = model.plan.state === "unavailable"
    ? null
    : model.plan.entries.length
  const summary = [
    userOpen === null ? null : `Open user starter/FLEX slots: ${userOpen}.`,
    otherTeamUnmet === null ? null : `Other-team unmet starter/FLEX slots: ${otherTeamUnmet}.`,
    confirmedEntries === null ? null : `Confirmed plan entries: ${confirmedEntries}.`,
  ].filter((value): value is string => value !== null).join(" ")
  if (!summary) return {
    fingerprint: `plan_constraints:${model.fingerprint}:unavailable`,
    summary: "",
    state: "unavailable",
    unavailableReason: "No verified roster, league-needs, or confirmed-plan context is available.",
  }
  return {
    fingerprint: `plan_constraints:${model.fingerprint}`,
    summary,
    state: "ready",
  }
}
