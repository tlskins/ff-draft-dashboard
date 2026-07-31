import { FantasyPosition } from "../../types"
import type {
  DraftAdvisorContext,
  DraftAdvisorPlayer,
  ForecastPlayerProbability,
  OpponentForecast,
  OpponentModelKind,
  OpponentPickForecast,
  PositionProbability,
  TierBoundaryProbability,
} from "./types"

type ForecastPosition =
  | FantasyPosition.QUARTERBACK
  | FantasyPosition.RUNNING_BACK
  | FantasyPosition.WIDE_RECEIVER
  | FantasyPosition.TIGHT_END

const POSITIONS: ForecastPosition[] = [
  FantasyPosition.QUARTERBACK,
  FantasyPosition.RUNNING_BACK,
  FantasyPosition.WIDE_RECEIVER,
  FantasyPosition.TIGHT_END,
]

export interface OpponentModelOptions {
  model?: OpponentModelKind
  targetRosterIndex: number
  runLength?: number
  playerLimitPerPosition?: number
  /** Offline-only tuning may supply an explicit combined_v2 blend. */
  combinedV2Config?: OpponentModelBlendConfig
}

/**
 * Every source is itself a normalized position distribution.  Keeping the
 * blend explicit makes a challenger auditable and prevents a replay search
 * from quietly changing the frozen live-v1 formula.
 */
export interface OpponentModelBlendConfig {
  id: string
  adpWeight: number
  directNeedWeight: number
  formatFlexPressureWeight: number
  recentRunWeight: number
}

export const V1_EQUIVALENT_OPPONENT_CONFIG: OpponentModelBlendConfig = {
  id: "v1_equivalent",
  adpWeight: 0.55,
  directNeedWeight: 0.35,
  formatFlexPressureWeight: 0,
  recentRunWeight: 0.1,
}

/** The original offline v2 challenger, preserved as a named baseline. */
export const INITIAL_V2_OPPONENT_CONFIG: OpponentModelBlendConfig = {
  id: "initial_v2",
  adpWeight: 0.5,
  directNeedWeight: 0,
  formatFlexPressureWeight: 0.4,
  recentRunWeight: 0.1,
}

export const validateOpponentModelBlendConfig = (
  config: OpponentModelBlendConfig,
): OpponentModelBlendConfig => {
  const weights = [
    config.adpWeight,
    config.directNeedWeight,
    config.formatFlexPressureWeight,
    config.recentRunWeight,
  ]
  if (!config.id || weights.some(weight => !Number.isFinite(weight) || weight < 0)) {
    throw new Error("Opponent model blend config has invalid weights")
  }
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  if (total <= 0) throw new Error("Opponent model blend config has no active source")
  return {
    ...config,
    adpWeight: config.adpWeight / total,
    directNeedWeight: config.directNeedWeight / total,
    formatFlexPressureWeight: config.formatFlexPressureWeight / total,
    recentRunWeight: config.recentRunWeight / total,
  }
}

const normalize = (
  scores: Array<{ position: ForecastPosition; score: number }>,
): PositionProbability[] => {
  const total = scores.reduce((sum, item) => sum + item.score, 0)
  return scores.map(item => ({
    position: item.position,
    probability: total > 0 ? item.score / total : 1 / scores.length,
  }))
}

const playersAtPosition = (
  context: DraftAdvisorContext,
  position: ForecastPosition,
): DraftAdvisorPlayer[] => context.availablePlayers
  .filter(player => player.position === position)
  .sort((left, right) =>
    (left.adp ?? Number.MAX_SAFE_INTEGER)
    - (right.adp ?? Number.MAX_SAFE_INTEGER)
    || left.positionRank - right.positionRank
    || left.id.localeCompare(right.id))

const adpScores = (
  context: DraftAdvisorContext,
  overallPick: number,
): PositionProbability[] => normalize(POSITIONS.map(position => {
  const candidates = playersAtPosition(context, position).slice(0, 3)
  const score = candidates.reduce((sum, player, index) => {
    const adp = player.adp ?? overallPick + 24
    const proximity = Math.exp(-Math.abs(adp - overallPick) / 10)
    return sum + proximity / (index + 1)
  }, 0.01)
  return { position, score }
}))

const needScores = (
  context: DraftAdvisorContext,
  rosterIndex: number,
): PositionProbability[] => {
  const team = context.teams.find(candidate =>
    candidate.rosterIndex === rosterIndex)
  return normalize(POSITIONS.map(position => {
    const openSpots = team?.needs.find(need =>
      need.position === position)?.openStarterSpots || 0
    return {
      position,
      score: 0.35 + openSpots * 1.5,
    }
  }))
}

const recentScores = (
  context: DraftAdvisorContext,
): PositionProbability[] => {
  const recent = context.recentPicks.slice(-6)
  return normalize(POSITIONS.map(position => ({
    position,
    score: 1 + recent.filter(pick => pick.position === position).length,
  })))
}

const formatFor = (context: DraftAdvisorContext) => {
  const inferred = (position: ForecastPosition) => context.teams.reduce(
    (maximum, team) => Math.max(maximum, team.needs.find(need =>
      need.position === position)?.openStarterSpots || 0),
    0,
  )
  return context.rosterFormat || {
    startingQbs: inferred(FantasyPosition.QUARTERBACK),
    startingRbs: inferred(FantasyPosition.RUNNING_BACK),
    startingWrs: inferred(FantasyPosition.WIDE_RECEIVER),
    startingTes: inferred(FantasyPosition.TIGHT_END),
    flex: 0,
    bench: 0,
  }
}

const directStarterRequirement = (
  context: DraftAdvisorContext,
  position: ForecastPosition,
): number => {
  const format = formatFor(context)
  return {
    QB: format.startingQbs,
    RB: format.startingRbs,
    WR: format.startingWrs,
    TE: format.startingTes,
  }[position]
}

const isFlexEligible = (position: ForecastPosition): boolean =>
  position === FantasyPosition.RUNNING_BACK
  || position === FantasyPosition.WIDE_RECEIVER
  || position === FantasyPosition.TIGHT_END

/** Extra RB/WR/TE players beyond direct slots absorb flex demand; QB cannot. */
const openFlexSpots = (
  context: DraftAdvisorContext,
  rosterIndex: number,
): number => {
  const team = context.teams.find(candidate =>
    candidate.rosterIndex === rosterIndex)
  if (!team) return 0
  const format = formatFor(context)
  const occupiedFlexSpots = POSITIONS.reduce((total, position) => {
    if (!isFlexEligible(position)) return total
    const drafted = team.draftedPositionCounts?.find(count =>
      count.position === position)?.count || 0
    return total + Math.max(
      0,
      drafted - directStarterRequirement(context, position),
    )
  }, 0)
  return Math.max(0, format.flex - occupiedFlexSpots)
}

const v2FormatNeedScores = (
  context: DraftAdvisorContext,
  rosterIndex: number,
): PositionProbability[] => {
  const team = context.teams.find(candidate =>
    candidate.rosterIndex === rosterIndex)
  const teamFlexOpen = openFlexSpots(context, rosterIndex)
  const scoringMultiplier = (position: ForecastPosition): number => {
    if (context.league.ppr && position === FantasyPosition.WIDE_RECEIVER) return 1.08
    if (context.league.ppr && position === FantasyPosition.TIGHT_END) return 1.05
    if (!context.league.ppr && position === FantasyPosition.RUNNING_BACK) return 1.05
    return 1
  }
  return normalize(POSITIONS.map(position => {
    const directOpen = team?.needs.find(need =>
      need.position === position)?.openStarterSpots || 0
    const leagueDirectOpen = context.teams.reduce((total, candidate) => total + (
      candidate.needs.find(need => need.position === position)?.openStarterSpots || 0
    ), 0)
    const leagueFlexOpen = context.teams.reduce((total, candidate) =>
      total + openFlexSpots(context, candidate.rosterIndex), 0)
    const flexDemand = isFlexEligible(position)
      ? teamFlexOpen * 1.15 + leagueFlexOpen * 0.2
      : 0
    return {
      position,
      score: (0.2 + directOpen * 1.8 + leagueDirectOpen * 0.35 + flexDemand)
        * scoringMultiplier(position),
    }
  }))
}

const blendPositionSources = (
  sources: {
    adp: PositionProbability[]
    directNeed: PositionProbability[]
    formatFlexPressure: PositionProbability[]
    recentRun: PositionProbability[]
  },
  config: OpponentModelBlendConfig,
): PositionProbability[] => {
  const validated = validateOpponentModelBlendConfig(config)
  const probabilityFor = (
    source: PositionProbability[],
    position: ForecastPosition,
  ) => source.find(item => item.position === position)?.probability || 0
  return normalize(POSITIONS.map(position => ({
    position,
    score:
      probabilityFor(sources.adp, position) * validated.adpWeight
      + probabilityFor(sources.directNeed, position) * validated.directNeedWeight
      + probabilityFor(sources.formatFlexPressure, position)
        * validated.formatFlexPressureWeight
      + probabilityFor(sources.recentRun, position) * validated.recentRunWeight,
  })))
}

/** Exposed for deterministic offline ablations; all outputs are normalized. */
export const opponentPositionSources = (
  context: DraftAdvisorContext,
  overallPick: number,
  rosterIndex: number,
) => ({
  adp: adpScores(context, overallPick),
  directNeed: needScores(context, rosterIndex),
  // This deliberately preserves the initial v2 source, including its existing
  // direct/league/flex construction, so its historical challenger is stable.
  formatFlexPressure: v2FormatNeedScores(context, rosterIndex),
  recentRun: recentScores(context),
})

const positionProbabilities = (
  context: DraftAdvisorContext,
  overallPick: number,
  rosterIndex: number,
  model: OpponentModelKind,
  combinedV2Config?: OpponentModelBlendConfig,
): PositionProbability[] => {
  const sources = opponentPositionSources(context, overallPick, rosterIndex)
  const { adp, directNeed: need, recentRun: recent } = sources
  if (model === "adp_only") return adp
  if (model === "need_only") return need
  if (model === "combined_v2") {
    return blendPositionSources(
      sources,
      combinedV2Config || INITIAL_V2_OPPONENT_CONFIG,
    )
  }
  return blendPositionSources(sources, V1_EQUIVALENT_OPPONENT_CONFIG)
}

const playerProbabilities = (
  context: DraftAdvisorContext,
  overallPick: number,
  positions: PositionProbability[],
  limit: number,
): ForecastPlayerProbability[] => positions.flatMap(positionForecast => {
  const candidates = playersAtPosition(
    context,
    positionForecast.position as ForecastPosition,
  ).slice(0, limit)
  const raw = candidates.map(player => ({
    player,
    score: Math.exp(
      -Math.abs((player.adp ?? overallPick + 24) - overallPick) / 10
      - Math.max(0, player.positionRank - 1) * 0.04,
    ),
  }))
  const total = raw.reduce((sum, item) => sum + item.score, 0)
  return raw.map(item => {
    const conditionalProbability = total > 0
      ? item.score / total
      : 1 / raw.length
    return {
      playerId: item.player.id,
      name: item.player.name,
      position: item.player.position,
      conditionalProbability,
      overallProbability:
        conditionalProbability * positionForecast.probability,
    }
  })
})

const slotsBeforeUserPick = (
  context: DraftAdvisorContext,
  targetRosterIndex: number,
) => {
  const userPickIndex = context.upcomingSlots.findIndex(slot =>
    slot.rosterIndex === targetRosterIndex)
  return userPickIndex < 0
    ? context.upcomingSlots
    : context.upcomingSlots.slice(0, userPickIndex)
}

export const probabilityOfAtLeast = (
  probabilities: number[],
  minimum: number,
): number => {
  if (minimum <= 0) return 1
  if (probabilities.length < minimum) return 0
  let distribution = Array(probabilities.length + 1).fill(0) as number[]
  distribution[0] = 1
  probabilities.forEach(probability => {
    const next = Array(probabilities.length + 1).fill(0) as number[]
    distribution.forEach((current, count) => {
      if (current === 0) return
      next[count] += current * (1 - probability)
      next[count + 1] += current * probability
    })
    distribution = next
  })
  return distribution
    .slice(minimum)
    .reduce((sum, probability) => sum + probability, 0)
}

const runProbabilities = (
  picks: OpponentPickForecast[],
  runLength: number,
) => POSITIONS.map(position => ({
  position,
  minimumPicks: runLength,
  probability: probabilityOfAtLeast(
    picks.map(pick =>
      pick.positionProbabilities.find(item =>
        item.position === position)?.probability || 0),
    runLength,
  ),
}))

const probabilityPlayerIsTaken = (
  picks: OpponentPickForecast[],
  playerId: string,
): number => 1 - picks.reduce((survival, pick) => {
  const probability = pick.playerProbabilities.find(player =>
    player.playerId === playerId)?.overallProbability || 0
  return survival * (1 - probability)
}, 1)

const tierBoundaryProbabilities = (
  context: DraftAdvisorContext,
  picks: OpponentPickForecast[],
): TierBoundaryProbability[] => POSITIONS.flatMap(position => {
  const tiered = playersAtPosition(context, position)
    .filter(player => player.userTier !== null)
  const currentTier = tiered.reduce<number | null>(
    (lowest, player) => lowest === null
      ? player.userTier
      : Math.min(lowest, player.userTier as number),
    null,
  )
  if (currentTier === null) return []
  const tierPlayers = tiered.filter(player =>
    player.userTier === currentTier)
  return [{
    position,
    userTier: currentTier,
    playerIds: tierPlayers.map(player => player.id),
    probability: tierPlayers.reduce(
      (probability, player) =>
        probability * probabilityPlayerIsTaken(picks, player.id),
      1,
    ),
  }]
})

export const createOpponentForecast = (
  context: DraftAdvisorContext,
  {
    model = "combined",
    targetRosterIndex,
    runLength = 3,
    playerLimitPerPosition = 5,
    combinedV2Config,
  }: OpponentModelOptions,
): OpponentForecast => {
  const picks = slotsBeforeUserPick(context, targetRosterIndex).map(slot => {
    const positions = positionProbabilities(
      context,
      slot.overallPick,
      slot.rosterIndex,
      model,
      combinedV2Config,
    )
    return {
      overallPick: slot.overallPick,
      rosterIndex: slot.rosterIndex,
      positionProbabilities: positions,
      playerProbabilities: playerProbabilities(
        context,
        slot.overallPick,
        positions,
        playerLimitPerPosition,
      ),
    }
  })

  return {
    schemaVersion: 1,
    model,
    targetRosterIndex,
    picks,
    runProbabilities: runProbabilities(picks, runLength),
    tierBoundaryProbabilities: tierBoundaryProbabilities(context, picks),
  }
}
