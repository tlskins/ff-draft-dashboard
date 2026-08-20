import { FantasyPosition } from "../../types"
import {
  opponentPlayerProbabilities,
  opponentPositionProbabilities,
  probabilityOfAtLeast,
} from "../draft-advisor/opponentModel"
import type {
  DraftAdvisorContext,
  OpponentForecast,
  PositionProbability,
} from "../draft-advisor/types"

export const ROUND_MARKET_POSITIONS = [
  FantasyPosition.QUARTERBACK,
  FantasyPosition.RUNNING_BACK,
  FantasyPosition.WIDE_RECEIVER,
  FantasyPosition.TIGHT_END,
] as const

export type RoundMarketPosition = typeof ROUND_MARKET_POSITIONS[number]
export type RoundMarketBucketId = "next_user_turn" | "following_user_turn"
export type RoundMarketProvenance =
  | "frozen_v1_window"
  | "static_board_derived_v1"
  | "unavailable"

/** Fixed and bounded; callers memoize by inputFingerprint at material events. */
export const ROUND_MARKET_SIMULATION_COUNT = 512
export const ROUND_MARKET_DEFAULT_RUN_THRESHOLD = 3

export interface RoundMarketTierInput {
  /** Only active-board tiers can be aligned to the frozen forecast inputs. */
  authority: "active_board" | "custom_user"
  position: RoundMarketPosition
  tier: number
  playerIds: string[]
}

export interface RoundMarketNeedEvidence {
  position: RoundMarketPosition
  otherTeamsOpenStarterSlots: number | null
  otherTeamsWithOpenStarter: number | null
  otherTeamsOpenFlexSlots: number | null
  otherTeamsWithOpenFlex: number | null
  status: "observed" | "unavailable"
  unavailableReason: string | null
}

export interface RoundMarketTier {
  id: string
  authority: "active_board" | "custom_user"
  position: RoundMarketPosition
  tier: number | null
  playerIds: string[]
  availablePlayerCount: number
  /** Unique selections inside this bucket; selections in an earlier bucket stay removed. */
  expectedUniquePlayersTakenInBucket: number | null
  /** Cumulative chance the tier is empty after this bucket completes. */
  exhaustionProbabilityByEndOfBucket: number | null
  probabilityMethod:
    | "deterministic_without_replacement_simulation_v1"
    | "unavailable"
  /** Tier outcomes rebuild full bounded-pool weights; they are not retained top-five player evidence. */
  provenance: "static_board_derived_v1" | "unavailable"
  assumption: string | null
  status: "available" | "authority_mismatch" | "pool_incomplete" | "unavailable"
  unavailableReason: string | null
}

export interface RoundMarketPositionLane {
  position: RoundMarketPosition
  expectedPositionalPicks: number | null
  runThreshold: number | null
  probabilityAtLeastThreshold: number | null
  observedNeed: RoundMarketNeedEvidence
  /** At most the next two active-board tiers, in stable tier/id order. */
  tiers: RoundMarketTier[]
}

export interface RoundMarketBucket {
  id: RoundMarketBucketId
  targetOverallPick: number | null
  firstOpponentOverallPick: number | null
  lastOpponentOverallPick: number | null
  opponentPickCount: number
  provenance: RoundMarketProvenance
  staticBoardAssumption: boolean
  positions: RoundMarketPositionLane[]
  unavailableReason: string | null
}

export interface RoundMarketPresentationModel {
  schemaVersion: 1
  id: "round_market_v1"
  inputFingerprint: string
  modelIdentity: "deterministic_opponent_v1"
  targetRosterIndex: number
  buckets: [RoundMarketBucket, RoundMarketBucket]
}

export interface BuildRoundMarketParams {
  context: DraftAdvisorContext
  opponentForecast: OpponentForecast | null | undefined
  targetRosterIndex: number
  /** Membership comes from the full active board, not the bounded model pool. */
  activeBoardTiers?: RoundMarketTierInput[]
  runThreshold?: number
}

interface SlotMarket {
  overallPick: number
  rosterIndex: number
  positionProbabilities: PositionProbability[]
}

interface TierSimulationStats {
  expectedTaken: number
  exhausted: number
}

const epsilon = 0.000001

const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map(key =>
      `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`
  }
  return JSON.stringify(value)
}

/** Stable browser-safe fingerprint; it is a cache identity, not cryptographic proof. */
export const createRoundMarketInputFingerprint = (value: unknown): string => {
  const serialized = stableJson(value)
  let hash = 0x811c9dc5
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, "0")
}

const canonicalFingerprintInput = ({
  context, opponentForecast, targetRosterIndex, activeBoardTiers, runThreshold,
}: BuildRoundMarketParams & {runThreshold: number}) => ({
  id: "round_market_v1",
  targetRosterIndex,
  runThreshold,
  context: {
    schemaVersion: context.schemaVersion,
    league: context.league,
    rosterFormat: context.rosterFormat,
    currentPick: context.currentPick,
    // Slot ordering is temporal evidence and therefore intentionally preserved.
    upcomingSlots: context.upcomingSlots,
    teams: [...context.teams].sort((left, right) => left.rosterIndex - right.rosterIndex)
      .map(team => ({
        ...team,
        draftedPlayerIds: [...team.draftedPlayerIds].sort(),
        draftedPositionCounts: team.draftedPositionCounts?.slice().sort((left, right) =>
          left.position.localeCompare(right.position)),
        needs: [...team.needs].sort((left, right) => left.position.localeCompare(right.position)),
      })),
    availablePlayers: [...context.availablePlayers].sort((left, right) => left.id.localeCompare(right.id)),
    // Recent picks are temporal evidence and therefore intentionally preserved.
    recentPicks: context.recentPicks,
  },
  opponentForecast: opponentForecast && {
    ...opponentForecast,
    // Pick ordering is temporal evidence; per-pick distributions are sets.
    picks: opponentForecast.picks.map(pick => ({
      ...pick,
      positionProbabilities: [...pick.positionProbabilities].sort((left, right) =>
        left.position.localeCompare(right.position)),
      playerProbabilities: [...pick.playerProbabilities].sort((left, right) =>
        left.playerId.localeCompare(right.playerId)),
    })),
    runProbabilities: [...opponentForecast.runProbabilities].sort((left, right) =>
      left.position.localeCompare(right.position)),
    tierBoundaryProbabilities: [...opponentForecast.tierBoundaryProbabilities]
      .map(tier => ({...tier, playerIds: [...tier.playerIds].sort()}))
      .sort((left, right) => left.position.localeCompare(right.position) || left.userTier - right.userTier),
  },
  activeBoardTiers: Array.from(new Map((activeBoardTiers || []).map(tier => {
    const normalized = {...tier, playerIds: Array.from(new Set(tier.playerIds)).sort()}
    return [`${normalized.authority}\u0000${normalized.position}\u0000${normalized.tier}\u0000${normalized.playerIds.join("\u0000")}`, normalized] as const
  })).values()).sort((left, right) => left.position.localeCompare(right.position)
    || left.tier - right.tier || left.authority.localeCompare(right.authority)),
})

const asRoundPosition = (value: unknown): RoundMarketPosition | null => (
  ROUND_MARKET_POSITIONS.includes(value as RoundMarketPosition)
    ? value as RoundMarketPosition
    : null
)

const finiteProbability = (value: unknown): value is number => (
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1
)

const validPositionVector = (value: unknown): value is PositionProbability[] => {
  if (!Array.isArray(value) || value.length !== ROUND_MARKET_POSITIONS.length) return false
  const positions = new Set<RoundMarketPosition>()
  const total = value.reduce((sum, item) => {
    if (!item || !asRoundPosition(item.position) || !finiteProbability(item.probability)) {
      return Number.NaN
    }
    positions.add(item.position as RoundMarketPosition)
    return sum + item.probability
  }, 0)
  return positions.size === ROUND_MARKET_POSITIONS.length
    && Number.isFinite(total) && Math.abs(total - 1) <= epsilon
}

const validThreshold = (value: unknown): value is number => (
  typeof value === "number" && Number.isInteger(value) && value > 0
)

const expectedSlotsBefore = (
  context: DraftAdvisorContext,
  targetRosterIndex: number,
): {first: SlotMarket[] | null; second: SlotMarket[] | null; firstTarget: number | null; secondTarget: number | null} => {
  if (!Array.isArray(context.upcomingSlots)) {
    return {first: null, second: null, firstTarget: null, secondTarget: null}
  }
  const targetIndices = context.upcomingSlots.flatMap((slot, index) => (
    slot && Number.isInteger(slot.overallPick) && Number.isInteger(slot.rosterIndex)
      && slot.rosterIndex === targetRosterIndex ? [index] : []
  ))
  const firstIndex = targetIndices[0]
  const secondIndex = targetIndices[1]
  const slotsBetween = (start: number, end: number): SlotMarket[] => context.upcomingSlots
    .slice(start, end)
    .flatMap(slot => (
      slot && Number.isInteger(slot.overallPick) && Number.isInteger(slot.rosterIndex)
        && slot.rosterIndex !== targetRosterIndex
        ? [{overallPick: slot.overallPick, rosterIndex: slot.rosterIndex, positionProbabilities: []}]
        : []
    ))
  return {
    first: firstIndex === undefined ? null : slotsBetween(0, firstIndex),
    second: firstIndex === undefined || secondIndex === undefined
      ? null
      : slotsBetween(firstIndex + 1, secondIndex),
    firstTarget: firstIndex === undefined ? null : context.upcomingSlots[firstIndex].overallPick,
    secondTarget: secondIndex === undefined ? null : context.upcomingSlots[secondIndex].overallPick,
  }
}

const frozenFirstSlots = (
  expected: SlotMarket[],
  forecast: OpponentForecast | null | undefined,
  targetRosterIndex: number,
): {slots: SlotMarket[] | null; reason: string | null} => {
  if (!forecast || !Array.isArray(forecast.picks)) {
    return {slots: null, reason: "Frozen opponent forecast is unavailable."}
  }
  if (forecast.targetRosterIndex !== targetRosterIndex) {
    return {slots: null, reason: "Frozen opponent forecast target roster does not match the requested market target."}
  }
  if (forecast.model !== "combined") {
    return {slots: null, reason: "Round market accepts only the frozen combined opponent forecast."}
  }
  if (forecast.picks.length !== expected.length) {
    return {slots: null, reason: "Frozen opponent forecast does not match the next-turn opponent slots."}
  }
  const slots = forecast.picks.flatMap((pick, index) => {
    const expectedPick = expected[index]
    if (!pick || pick.overallPick !== expectedPick.overallPick
      || pick.rosterIndex !== expectedPick.rosterIndex
      || !validPositionVector(pick.positionProbabilities)) return []
    return [{
      overallPick: pick.overallPick,
      rosterIndex: pick.rosterIndex,
      positionProbabilities: pick.positionProbabilities,
    }]
  })
  return slots.length === expected.length
    ? {slots, reason: null}
    : {slots: null, reason: "Frozen opponent forecast has an invalid positional probability vector."}
}

const staticSecondSlots = (
  context: DraftAdvisorContext,
  expected: SlotMarket[],
): {slots: SlotMarket[] | null; reason: string | null} => {
  try {
    const slots = expected.map(slot => ({
      ...slot,
      positionProbabilities: opponentPositionProbabilities(
        context,
        slot.overallPick,
        slot.rosterIndex,
        "combined",
      ),
    }))
    return slots.every(slot => validPositionVector(slot.positionProbabilities))
      ? {slots, reason: null}
      : {slots: null, reason: "Static-board frozen-v1 derivation returned an invalid positional vector."}
  } catch {
    return {slots: null, reason: "Static-board frozen-v1 derivation is unavailable."}
  }
}

const observedNeedFor = (
  context: DraftAdvisorContext,
  targetRosterIndex: number,
  position: RoundMarketPosition,
): RoundMarketNeedEvidence => {
  if (!Array.isArray(context.teams) || !context.rosterFormat) {
    return {
      position,
      otherTeamsOpenStarterSlots: null,
      otherTeamsWithOpenStarter: null,
      otherTeamsOpenFlexSlots: null,
      otherTeamsWithOpenFlex: null,
      status: "unavailable",
      unavailableReason: "Observed roster format or teams are unavailable.",
    }
  }
  const otherTeams = context.teams.filter(team => team.rosterIndex !== targetRosterIndex)
  const directSlots = otherTeams
    .map(team => Math.max(0, team.needs.find(need => need.position === position)
      ?.openStarterSpots || 0))
  const directRequirement: Record<RoundMarketPosition, number> = {
    QB: context.rosterFormat.startingQbs,
    RB: context.rosterFormat.startingRbs,
    WR: context.rosterFormat.startingWrs,
    TE: context.rosterFormat.startingTes,
  }
  const hasCompleteFlexCounts = otherTeams.every(team => (
    Array.isArray(team.draftedPositionCounts)
    && ([FantasyPosition.RUNNING_BACK, FantasyPosition.WIDE_RECEIVER,
      FantasyPosition.TIGHT_END] as RoundMarketPosition[]).every(eligible => {
      const count = team.draftedPositionCounts!.find(item => item.position === eligible)?.count
      return typeof count === "number" && Number.isInteger(count) && count >= 0
    })
  ))
  const flexOpen = hasCompleteFlexCounts ? otherTeams.map(team => {
      const surplus = ([FantasyPosition.RUNNING_BACK, FantasyPosition.WIDE_RECEIVER,
        FantasyPosition.TIGHT_END] as RoundMarketPosition[]).reduce((total, eligible) => {
        const drafted = team.draftedPositionCounts?.find(count => count.position === eligible)
          ?.count || 0
        return total + Math.max(0, drafted - directRequirement[eligible])
      }, 0)
      return Math.max(0, context.rosterFormat!.flex - surplus)
    }) : null
  return {
    position,
    otherTeamsOpenStarterSlots: directSlots.reduce((sum, value) => sum + value, 0),
    otherTeamsWithOpenStarter: directSlots.filter(value => value > 0).length,
    otherTeamsOpenFlexSlots: flexOpen?.reduce((sum, value) => sum + value, 0) ?? null,
    otherTeamsWithOpenFlex: flexOpen?.filter(value => value > 0).length ?? null,
    status: hasCompleteFlexCounts ? "observed" : "unavailable",
    unavailableReason: hasCompleteFlexCounts
      ? null
      : "Observed FLEX need is unavailable because one or more non-user rosters lack eligible drafted-position counts.",
  }
}

const unavailableTier = (
  position: RoundMarketPosition,
  reason: string,
): RoundMarketTier => ({
  id: `active_board:${position}:unavailable`, authority: "active_board", position,
  tier: null, playerIds: [], availablePlayerCount: 0,
  expectedUniquePlayersTakenInBucket: null, exhaustionProbabilityByEndOfBucket: null,
  probabilityMethod: "unavailable", provenance: "unavailable", assumption: null,
  status: "unavailable", unavailableReason: reason,
})

const tierFor = (
  position: RoundMarketPosition,
  supplied: RoundMarketTierInput,
  poolPlayers: Map<string, DraftAdvisorContext["availablePlayers"][number]>,
): RoundMarketTier => {
  const ids = Array.from(new Set(supplied.playerIds)).sort()
  if (supplied.authority !== "active_board") return {
    id: `${supplied.authority}:${position}:tier:${supplied.tier}`, authority: supplied.authority,
    position, tier: supplied.tier, playerIds: ids, availablePlayerCount: ids.length,
    expectedUniquePlayersTakenInBucket: null, exhaustionProbabilityByEndOfBucket: null,
    probabilityMethod: "unavailable", provenance: "unavailable", assumption: null,
    status: "authority_mismatch",
    unavailableReason: "Custom user tiers are not aligned to the frozen active-board forecast.",
  }
  const aligned = validThreshold(supplied.tier) && ids.length > 0 && ids.every(id => {
    const player = poolPlayers.get(id)
    return player?.position === position && player.userTier === supplied.tier
  })
  if (!aligned) return {
    id: `active_board:${position}:tier:${supplied.tier}`, authority: "active_board", position,
    tier: validThreshold(supplied.tier) ? supplied.tier : null, playerIds: ids,
    availablePlayerCount: ids.filter(id => poolPlayers.has(id)).length,
    expectedUniquePlayersTakenInBucket: null, exhaustionProbabilityByEndOfBucket: null,
    probabilityMethod: "unavailable", provenance: "unavailable", assumption: null,
    status: "pool_incomplete",
    unavailableReason: "The bounded frozen forecast pool does not contain every aligned active-board tier player.",
  }
  return {
    id: `active_board:${position}:tier:${supplied.tier}`, authority: "active_board", position,
    tier: supplied.tier, playerIds: ids, availablePlayerCount: ids.length,
    expectedUniquePlayersTakenInBucket: null, exhaustionProbabilityByEndOfBucket: null,
    probabilityMethod: "deterministic_without_replacement_simulation_v1",
    provenance: "static_board_derived_v1",
    assumption: "Tier outcomes rebuild full bounded-pool player weights without replacement; they are not retained top-five forecast player probabilities.",
    status: "available",
    unavailableReason: null,
  }
}

const tiersFor = (
  position: RoundMarketPosition,
  activeBoardTiers: RoundMarketTierInput[] | undefined,
  poolPlayers: Map<string, DraftAdvisorContext["availablePlayers"][number]>,
): RoundMarketTier[] => {
  const supplied = (activeBoardTiers || []).filter(candidate => candidate.position === position)
  const active = supplied.filter(candidate => candidate.authority === "active_board")
  if (active.length === 0) {
    const custom = supplied[0]
    return custom ? [tierFor(position, custom, poolPlayers)]
      : [unavailableTier(position, "Active-board tier membership was not supplied.")]
  }
  const groups = new Map<number, RoundMarketTierInput[]>()
  active.forEach(candidate => {
    const group = groups.get(candidate.tier) || []
    group.push(candidate)
    groups.set(candidate.tier, group)
  })
  const resolved = Array.from(groups.entries())
    .sort(([left], [right]) => left - right)
    .slice(0, 2)
    .map(([tier, definitions]) => {
      const memberships = new Set(definitions.map(candidate => Array.from(new Set(candidate.playerIds)).sort().join("\u0000")))
      if (memberships.size !== 1) return unavailableTier(
        position,
        `Conflicting active-board tier ${tier} memberships were supplied.`,
      )
      return tierFor(position, definitions[0], poolPlayers)
    })
    .sort((left, right) => (left.tier || Number.MAX_SAFE_INTEGER) - (right.tier || Number.MAX_SAFE_INTEGER)
      || left.id.localeCompare(right.id))
  const membershipCount = new Map<string, number>()
  resolved.filter(tier => tier.status === "available").forEach(tier => {
    tier.playerIds.forEach(id => membershipCount.set(id, (membershipCount.get(id) || 0) + 1))
  })
  return resolved.map(tier => (
    tier.status === "available" && tier.playerIds.some(id => (membershipCount.get(id) || 0) > 1)
      ? {...tier,
        expectedUniquePlayersTakenInBucket: null,
        exhaustionProbabilityByEndOfBucket: null,
        probabilityMethod: "unavailable" as const,
        provenance: "unavailable" as const,
        assumption: null,
        status: "unavailable" as const,
        unavailableReason: "A player is assigned to more than one displayed active-board tier."}
      : tier
  ))
}

const emptyLane = (
  position: RoundMarketPosition,
  need: RoundMarketNeedEvidence,
  tiers: RoundMarketTier[],
): RoundMarketPositionLane => ({
  position, expectedPositionalPicks: null, runThreshold: null,
  probabilityAtLeastThreshold: null, observedNeed: need, tiers,
})

const randomFor = (seed: number) => {
  let state = seed || 0x6d2b79f5
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return ((state >>> 0) + 0.5) / 4294967296
  }
}

const chooseWeighted = <T>(items: T[], weights: number[], random: () => number): T | null => {
  const total = weights.reduce((sum, weight) => sum + (Number.isFinite(weight) && weight > 0 ? weight : 0), 0)
  if (total <= 0) return null
  let needle = random() * total
  for (let index = 0; index < items.length; index += 1) {
    needle -= Math.max(0, weights[index] || 0)
    if (needle <= 0) return items[index]
  }
  return items[items.length - 1] || null
}

const playerWeightsForSlot = (
  context: DraftAdvisorContext,
  slot: SlotMarket,
): Map<RoundMarketPosition, Array<{playerId: string; conditionalProbability: number}>> => {
  const players = opponentPlayerProbabilities(
    context,
    slot.overallPick,
    slot.positionProbabilities,
    context.availablePlayers.length,
  )
  return ROUND_MARKET_POSITIONS.reduce((byPosition, position) => {
    byPosition.set(position, players
      .filter(player => player.position === position && finiteProbability(player.conditionalProbability))
      .map(player => ({playerId: player.playerId, conditionalProbability: player.conditionalProbability})))
    return byPosition
  }, new Map<RoundMarketPosition, Array<{playerId: string; conditionalProbability: number}>>())
}

const simulateTierStats = (
  context: DraftAdvisorContext,
  slotsByBucket: [SlotMarket[] | null, SlotMarket[] | null],
  tiers: RoundMarketTier[],
  fingerprint: string,
): [Map<string, TierSimulationStats>, Map<string, TierSimulationStats>] => {
  const result: [Map<string, TierSimulationStats>, Map<string, TierSimulationStats>] = [new Map(), new Map()]
  const availableTiers = tiers.filter(tier => tier.status === "available")
  availableTiers.forEach(tier => {
    result[0].set(tier.id, {expectedTaken: 0, exhausted: 0})
    result[1].set(tier.id, {expectedTaken: 0, exhausted: 0})
  })
  // A missing following turn must not erase valid next-turn tier evidence.
  if (availableTiers.length === 0 || !slotsByBucket[0]) return result
  const allSlots = slotsByBucket.flatMap(slots => slots || [])
  const weights = new Map(allSlots.map(slot => [slot.overallPick, playerWeightsForSlot(context, slot)]))
  const seed = Number.parseInt(fingerprint, 16) || 1
  for (let scenario = 0; scenario < ROUND_MARKET_SIMULATION_COUNT; scenario += 1) {
    const random = randomFor((seed + Math.imul(scenario + 1, 0x9e3779b9)) >>> 0)
    const taken = new Set<string>()
    slotsByBucket.forEach((slots, bucketIndex) => {
      if (!slots) return
      const bucketTaken = new Set<string>()
      slots.forEach(slot => {
        const position = chooseWeighted(
          ROUND_MARKET_POSITIONS as unknown as RoundMarketPosition[],
          ROUND_MARKET_POSITIONS.map(candidate => slot.positionProbabilities
            .find(probability => probability.position === candidate)?.probability || 0),
          random,
        )
        if (!position) return
        const candidates = (weights.get(slot.overallPick)?.get(position) || [])
          .filter(candidate => !taken.has(candidate.playerId))
        const selected = chooseWeighted(
          candidates,
          candidates.map(candidate => candidate.conditionalProbability),
          random,
        )
        if (!selected) return
        taken.add(selected.playerId)
        bucketTaken.add(selected.playerId)
      })
      availableTiers.forEach(tier => {
        const stats = result[bucketIndex as 0 | 1].get(tier.id)!
        stats.expectedTaken += tier.playerIds.filter(id => bucketTaken.has(id)).length
        if (tier.playerIds.every(id => taken.has(id))) stats.exhausted += 1
      })
    })
  }
  result.forEach(bucket => bucket.forEach(stats => {
    stats.expectedTaken /= ROUND_MARKET_SIMULATION_COUNT
    stats.exhausted /= ROUND_MARKET_SIMULATION_COUNT
  }))
  return result
}

const bucketFor = ({
  id,
  targetOverallPick,
  slots,
  provenance,
  reason,
  threshold,
  needs,
  tiers,
  simulation,
}: {
  id: RoundMarketBucketId
  targetOverallPick: number | null
  slots: SlotMarket[] | null
  provenance: RoundMarketProvenance
  reason: string | null
  threshold: number
  needs: Map<RoundMarketPosition, RoundMarketNeedEvidence>
  tiers: RoundMarketTier[]
  simulation: Map<string, TierSimulationStats>
}): RoundMarketBucket => {
  const first = slots?.[0]?.overallPick ?? null
  const last = slots?.[slots.length - 1]?.overallPick ?? null
  return {
    id, targetOverallPick, firstOpponentOverallPick: first, lastOpponentOverallPick: last,
    opponentPickCount: slots?.length || 0, provenance, staticBoardAssumption: provenance === "static_board_derived_v1",
    unavailableReason: reason,
    positions: ROUND_MARKET_POSITIONS.map(position => {
      const laneTiers = tiers.filter(candidate => candidate.position === position)
      if (!slots) return emptyLane(position, needs.get(position)!, laneTiers)
      const probabilities = slots.map(slot => slot.positionProbabilities.find(item => item.position === position)?.probability || 0)
      return {
        position,
        expectedPositionalPicks: probabilities.reduce((sum, probability) => sum + probability, 0),
        runThreshold: threshold,
        probabilityAtLeastThreshold: probabilityOfAtLeast(probabilities, threshold),
        observedNeed: needs.get(position)!,
        tiers: laneTiers.map(tier => {
          const stats = simulation.get(tier.id)
          return stats && tier.status === "available" ? {
            ...tier,
            expectedUniquePlayersTakenInBucket: stats.expectedTaken,
            exhaustionProbabilityByEndOfBucket: stats.exhausted,
          } : tier
        }),
      }
    }),
  }
}

/**
 * Additive, display-only round market. It reuses frozen-v1 positional math but
 * never alters OpponentForecast, recommendations, capture identity, or promotion.
 */
export const buildRoundMarketPresentationModel = ({
  context,
  opponentForecast,
  targetRosterIndex,
  activeBoardTiers,
  runThreshold = ROUND_MARKET_DEFAULT_RUN_THRESHOLD,
}: BuildRoundMarketParams): RoundMarketPresentationModel => {
  const safeThreshold = validThreshold(runThreshold) ? runThreshold : ROUND_MARKET_DEFAULT_RUN_THRESHOLD
  const poolPlayers = new Map(context.availablePlayers
    .filter(player => asRoundPosition(player.position))
    .map(player => [player.id, player] as const))
  const tiers = ROUND_MARKET_POSITIONS.flatMap(position => tiersFor(
    position,
    activeBoardTiers,
    poolPlayers,
  ))
  const needs = new Map(ROUND_MARKET_POSITIONS.map(position => [position,
    observedNeedFor(context, targetRosterIndex, position)]))
  const topology = expectedSlotsBefore(context, targetRosterIndex)
  const first = topology.first === null
    ? {slots: null, reason: "Next user turn is unavailable in the supplied slot schedule."}
    : frozenFirstSlots(topology.first, opponentForecast, targetRosterIndex)
  const second = first.reason !== null
    ? {slots: null, reason: "Following user turn is unavailable because the frozen opponent forecast was not admitted."}
    : topology.second === null
    ? {slots: null, reason: "Following user turn is unavailable in the supplied slot schedule."}
    : staticSecondSlots(context, topology.second)
  const fingerprint = createRoundMarketInputFingerprint(canonicalFingerprintInput({
    context, opponentForecast, targetRosterIndex, activeBoardTiers,
    runThreshold: safeThreshold,
  }))
  const simulated = simulateTierStats(context, [first.slots, second.slots], tiers, fingerprint)
  return {
    schemaVersion: 1,
    id: "round_market_v1",
    inputFingerprint: fingerprint,
    modelIdentity: "deterministic_opponent_v1",
    targetRosterIndex,
    buckets: [
      bucketFor({
        id: "next_user_turn", targetOverallPick: topology.firstTarget, slots: first.slots,
        provenance: first.slots ? "frozen_v1_window" : "unavailable", reason: first.reason,
        threshold: safeThreshold, needs, tiers, simulation: simulated[0],
      }),
      bucketFor({
        id: "following_user_turn", targetOverallPick: topology.secondTarget, slots: second.slots,
        provenance: second.slots ? "static_board_derived_v1" : "unavailable", reason: second.reason,
        threshold: safeThreshold, needs, tiers, simulation: simulated[1],
      }),
    ],
  }
}
