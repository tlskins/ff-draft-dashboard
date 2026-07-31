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

const positionProbabilities = (
  context: DraftAdvisorContext,
  overallPick: number,
  rosterIndex: number,
  model: OpponentModelKind,
): PositionProbability[] => {
  const adp = adpScores(context, overallPick)
  const need = needScores(context, rosterIndex)
  if (model === "adp_only") return adp
  if (model === "need_only") return need
  const recent = recentScores(context)
  return normalize(POSITIONS.map(position => {
    const probabilityFor = (source: PositionProbability[]) =>
      source.find(item => item.position === position)?.probability || 0
    return {
      position,
      score:
        probabilityFor(adp) * 0.55
        + probabilityFor(need) * 0.35
        + probabilityFor(recent) * 0.1,
    }
  }))
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
  }: OpponentModelOptions,
): OpponentForecast => {
  const picks = slotsBeforeUserPick(context, targetRosterIndex).map(slot => {
    const positions = positionProbabilities(
      context,
      slot.overallPick,
      slot.rosterIndex,
      model,
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
