import {
  BoardSettings,
  DataRanker,
  FantasyPosition,
  FantasySettings,
  Player,
  RankingSummary,
} from "../../types"
import {
  getMyNextPick,
  getPlayerMetrics,
  getProjectedTier,
  isMyPick,
  PlayerLibrary,
  PlayerRanks,
  Roster,
} from "../draft"
import type { AnalysisViewId } from "../analysis/viewState"
import type { OpponentForecast } from "./types"
import { isPlayerAutomaticallyRecommendable } from "../playerAvailability"

type RosterRole = "open_starter" | "flex_upgrade" | "bench"
type AdvisorPosition =
  | FantasyPosition.QUARTERBACK
  | FantasyPosition.RUNNING_BACK
  | FantasyPosition.WIDE_RECEIVER
  | FantasyPosition.TIGHT_END

const ADVISOR_POSITIONS: AdvisorPosition[] = [
  FantasyPosition.QUARTERBACK,
  FantasyPosition.RUNNING_BACK,
  FantasyPosition.WIDE_RECEIVER,
  FantasyPosition.TIGHT_END,
]

const isAdvisorPosition = (
  position: FantasyPosition,
): position is AdvisorPosition => ADVISOR_POSITIONS.includes(
  position as AdvisorPosition,
)

export interface AdvisorValuationWeights {
  lineupValue: number
  benchUpside: number
  tierUrgency: number
  replacementValue: number
}

export const DEFAULT_ADVISOR_VALUATION_WEIGHTS:
AdvisorValuationWeights = {
  lineupValue: 1,
  benchUpside: 0.35,
  tierUrgency: 0.75,
  replacementValue: 0.1,
}

export interface DraftRecommendationEvidence {
  projectedFloor: number
  projectedMedian: number
  projectedCeiling: number
  replacementLevel: number
  pointsAboveReplacement: number
  marginalLineupPoints: number
  benchUtility: number
  tierLossIfDeferred: number
  survivalProbability: number
  positionalRunProbability: number
  tierBoundaryProbability: number
  userTier: number | null
  projectionTier: number | null
  rosterRole: RosterRole
  flags: string[]
}

export interface DraftRecommendationCandidate {
  player: Player
  positionRank: number
  score: number
  evidence: DraftRecommendationEvidence
}

export interface DraftRecommendationSet {
  schemaVersion: 1
  currentPick: number
  nextUserPick: number
  preferredView: AnalysisViewId
  viewExplanation: string
  /** Best deterministic option at each position; independent of the shortlist. */
  positionCandidates?: DraftRecommendationCandidate[]
  candidates: DraftRecommendationCandidate[]
}

interface CreateDraftRecommendationsParams {
  settings: FantasySettings
  boardSettings: BoardSettings
  rankingSummaries: RankingSummary[]
  playerRanks: PlayerRanks
  playerLib: PlayerLibrary
  roster: Roster | undefined
  currentPick: number
  myPickNum: number
  predictedPicks?: Record<string, number>
  opponentForecast?: OpponentForecast
  weights?: AdvisorValuationWeights
}

export interface AdvisorProjection {
  floor: number
  median: number
  ceiling: number
  tier: number | null
}

export interface OptimizedProjectedLineup {
  projectedPoints: number
  starterPlayerIds: string[]
  benchPlayerIds: string[]
  filledStarterSlots: number
  requiredStarterSlots: number
}

export const getAdvisorStarterCount = (
  position: AdvisorPosition,
  settings: FantasySettings,
): number => {
  switch (position) {
    case FantasyPosition.QUARTERBACK:
      return settings.numStartingQbs
    case FantasyPosition.RUNNING_BACK:
      return settings.numStartingRbs
    case FantasyPosition.WIDE_RECEIVER:
      return settings.numStartingWrs
    case FantasyPosition.TIGHT_END:
      return settings.numStartingTes
    default:
      return 0
  }
}

export const getAdvisorRosterCapacity = (
  settings: FantasySettings,
): number =>
  settings.numStartingQbs
  + settings.numStartingRbs
  + settings.numStartingWrs
  + settings.numStartingTes
  + settings.numFlex
  + settings.numBenchPlayers

export const getAdvisorProjection = (
  player: Player,
  settings: FantasySettings,
  boardSettings: BoardSettings,
  rankingSummaries: RankingSummary[],
): AdvisorProjection => {
  const tier = getProjectedTier(
    player,
    boardSettings.ranker,
    DataRanker.LAST_SSN_PPG,
    settings,
    rankingSummaries,
  )
  if (!tier) {
    return { floor: 0, median: 0, ceiling: 0, tier: null }
  }
  const floor = Math.min(tier.lowerLimitValue, tier.upperLimitValue)
  const ceiling = Math.max(tier.lowerLimitValue, tier.upperLimitValue)
  return {
    floor,
    median: (floor + ceiling) / 2,
    ceiling,
    tier: tier.tierNumber,
  }
}

export const optimizeProjectedLineup = (
  playerIds: string[],
  playerLib: PlayerLibrary,
  settings: FantasySettings,
  boardSettings: BoardSettings,
  rankingSummaries: RankingSummary[],
): OptimizedProjectedLineup => {
  const values = ADVISOR_POSITIONS.reduce((byPosition, position) => {
    byPosition[position] = []
    return byPosition
  }, {} as Record<
    AdvisorPosition,
    Array<{ playerId: string; value: number }>
  >)

  playerIds.forEach(playerId => {
    const player = playerLib[playerId]
    if (!player || !isAdvisorPosition(player.position)) return
    values[player.position].push(
      {
        playerId,
        value: getAdvisorProjection(
          player,
          settings,
          boardSettings,
          rankingSummaries,
        ).median,
      },
    )
  })
  ADVISOR_POSITIONS.forEach(position =>
    values[position].sort((left, right) =>
      right.value - left.value
      || left.playerId.localeCompare(right.playerId)))

  let total = 0
  const starterPlayerIds: string[] = []
  const flexPool: Array<{ playerId: string; value: number }> = []
  ADVISOR_POSITIONS.forEach(position => {
    const required = getAdvisorStarterCount(position, settings)
    const starters = values[position].slice(0, required)
    total += starters.reduce((sum, item) => sum + item.value, 0)
    starterPlayerIds.push(...starters.map(item => item.playerId))
    if ([
      FantasyPosition.RUNNING_BACK,
      FantasyPosition.WIDE_RECEIVER,
      FantasyPosition.TIGHT_END,
    ].includes(position)) {
      flexPool.push(...values[position].slice(required))
    }
  })
  flexPool.sort((left, right) =>
    right.value - left.value
    || left.playerId.localeCompare(right.playerId))
  const flexStarters = flexPool.slice(0, settings.numFlex)
  total += flexStarters.reduce((sum, item) => sum + item.value, 0)
  starterPlayerIds.push(...flexStarters.map(item => item.playerId))
  const starterIds = new Set(starterPlayerIds)
  const validPlayerIds = playerIds.filter(playerId => {
    const player = playerLib[playerId]
    return player && isAdvisorPosition(player.position)
  })
  const requiredStarterSlots = ADVISOR_POSITIONS.reduce(
    (sum, position) =>
      sum + getAdvisorStarterCount(position, settings),
    settings.numFlex,
  )

  return {
    projectedPoints: total,
    starterPlayerIds,
    benchPlayerIds: validPlayerIds.filter(playerId =>
      !starterIds.has(playerId)),
    filledStarterSlots: starterPlayerIds.length,
    requiredStarterSlots,
  }
}

const resolveNextUserPick = (
  currentPick: number,
  myPickNum: number,
  numTeams: number,
): number => {
  const safeCurrentPick = Math.max(1, currentPick)
  return getMyNextPick(safeCurrentPick, myPickNum, numTeams)
}

const survivalProbability = (
  player: Player,
  nextUserPick: number,
  settings: FantasySettings,
  boardSettings: BoardSettings,
  predictedPicks: Record<string, number>,
  opponentForecast?: OpponentForecast,
): number => {
  if (opponentForecast) {
    const survival = opponentForecast.picks.reduce((probability, pick) => {
      const taken = pick.playerProbabilities.find(candidate =>
        candidate.playerId === player.id)?.overallProbability || 0
      return probability * (1 - taken)
    }, 1)
    return Math.max(0.05, Math.min(0.95, survival))
  }
  if (predictedPicks[player.id] !== undefined) return 0.05
  const adp = getPlayerMetrics(player, settings, boardSettings).adp
  if (!adp || adp >= 999) return 0.5
  const probability = 1 / (1 + Math.exp((nextUserPick - adp) / 6))
  return Math.max(0.05, Math.min(0.95, probability))
}

const preferredView = (
  currentPick: number,
  nextUserPick: number,
  maximumRunProbability: number,
  onClock: boolean,
): Pick<DraftRecommendationSet, "preferredView" | "viewExplanation"> => {
  const picksAway = Math.max(0, nextUserPick - currentPick)
  if (onClock) {
    return {
      preferredView: "cross_position",
      viewExplanation:
        "You are on the clock; compare roster-adjusted value across positions.",
    }
  }
  if (maximumRunProbability >= 0.5 && picksAway > 2) {
    return {
      preferredView: "tier_landscape",
      viewExplanation:
        `A positional run has a ${(maximumRunProbability * 100).toFixed(0)}% modeled probability before your next pick; inspect tier density.`,
    }
  }
  if (picksAway <= 2) {
    return {
      preferredView: "cross_position",
      viewExplanation:
        `Your pick is ${picksAway} pick${picksAway === 1 ? "" : "s"} away; compare roster-adjusted value across positions.`,
    }
  }
  if (picksAway <= 5) {
    return {
      preferredView: "positional_bests",
      viewExplanation:
        `Your pick is ${picksAway} picks away; focus on the best available player at each position.`,
    }
  }
  return {
    preferredView: "tier_landscape",
    viewExplanation:
      `Your pick is ${picksAway} picks away; monitor positional density and tier cliffs.`,
  }
}

export const createDraftRecommendations = ({
  settings,
  boardSettings,
  rankingSummaries,
  playerRanks,
  playerLib,
  roster,
  currentPick,
  myPickNum,
  predictedPicks = {},
  opponentForecast,
  weights = DEFAULT_ADVISOR_VALUATION_WEIGHTS,
}: CreateDraftRecommendationsParams): DraftRecommendationSet => {
  const nextUserPick = resolveNextUserPick(
    currentPick,
    myPickNum,
    settings.numTeams,
  )
  const maximumRunProbability = Math.max(
    0,
    ...(opponentForecast?.runProbabilities.map(run =>
      run.probability) || []),
  )
  const view = preferredView(
    currentPick,
    nextUserPick,
    maximumRunProbability,
    isMyPick(Math.max(1, currentPick), myPickNum, settings.numTeams),
  )
  const rosterPicks = roster?.picks || []

  if (rosterPicks.length >= getAdvisorRosterCapacity(settings)) {
    return {
      schemaVersion: 1,
      currentPick,
      nextUserPick,
      ...view,
      candidates: [],
    }
  }

  const currentLineupValue = optimizeProjectedLineup(
    rosterPicks,
    playerLib,
    settings,
    boardSettings,
    rankingSummaries,
  ).projectedPoints

  const candidates = ADVISOR_POSITIONS.flatMap(position => {
    const availableAtPosition = playerRanks[position]
      .filter(player => !rosterPicks.includes(player.id))
      .filter(player => isPlayerAutomaticallyRecommendable(
        player,
        boardSettings,
      ))
      .sort((left, right) => {
        const leftRank = getPlayerMetrics(left, settings, boardSettings).posRank
        const rightRank = getPlayerMetrics(right, settings, boardSettings).posRank
        const normalizedLeft = Number.isFinite(leftRank) && leftRank > 0
          ? leftRank
          : Number.MAX_SAFE_INTEGER
        const normalizedRight = Number.isFinite(rightRank) && rightRank > 0
          ? rightRank
          : Number.MAX_SAFE_INTEGER
        return normalizedLeft - normalizedRight
          || left.id.localeCompare(right.id)
      })
    const player = availableAtPosition[0]
    if (!player) return []

    const projection = getAdvisorProjection(
      player,
      settings,
      boardSettings,
      rankingSummaries,
    )
    const nextPlayer = availableAtPosition[1]
    const nextProjection = nextPlayer
      ? getAdvisorProjection(
        nextPlayer,
        settings,
        boardSettings,
        rankingSummaries,
      )
      : null
    const metrics = getPlayerMetrics(player, settings, boardSettings)
    const replacementSummary = rankingSummaries.find(summary =>
      summary.ranker === DataRanker.LAST_SSN_PPG
      && summary.ppr === settings.ppr)
    const replacementLevel =
      replacementSummary?.replacementLevels[player.position]?.[1] || 0
    const pointsAboveReplacement = Math.max(
      0,
      projection.median - replacementLevel,
    )
    const valueWithCandidate = optimizeProjectedLineup(
      [...rosterPicks, player.id],
      { ...playerLib, [player.id]: player },
      settings,
      boardSettings,
      rankingSummaries,
    ).projectedPoints
    const marginalLineupPoints = Math.max(
      0,
      valueWithCandidate - currentLineupValue,
    )
    const openStarter = (roster?.[position]?.length || 0)
      < getAdvisorStarterCount(position, settings)
    const rosterRole: RosterRole = openStarter
      ? "open_starter"
      : marginalLineupPoints > 0
        ? "flex_upgrade"
        : "bench"
    const benchUtility = rosterRole === "bench"
      ? (
        pointsAboveReplacement * 0.2
        + Math.max(0, projection.ceiling - projection.median)
      )
      : 0
    const userTier = metrics.tier?.tierNumber ?? null
    const nextUserTier = nextPlayer
      ? getPlayerMetrics(nextPlayer, settings, boardSettings)
        .tier?.tierNumber
      : null
    const userTierGap = userTier && nextUserTier
      ? Math.max(0, nextUserTier - userTier)
      : 0
    const tierLossIfDeferred = Math.max(
      0,
      projection.median - (nextProjection?.median || replacementLevel),
    ) * (1 + userTierGap * 0.5)
    const survives = survivalProbability(
      player,
      nextUserPick,
      settings,
      boardSettings,
      predictedPicks,
      opponentForecast,
    )
    const positionalRunProbability =
      opponentForecast?.runProbabilities.find(run =>
        run.position === position)?.probability || 0
    const tierBoundaryProbability =
      opponentForecast?.tierBoundaryProbabilities.find(boundary =>
        boundary.position === position
        && (
          userTier === null
          || boundary.userTier === userTier
        ))?.probability || 0
    const flags = [
      ...(openStarter ? [`Unfilled ${position} starter`] : []),
      ...(rosterRole === "bench" ? ["Bench-upside valuation"] : []),
      ...(userTierGap > 0 ? ["User-tier cliff"] : []),
      ...(survives < 0.35 ? ["Unlikely to survive to next pick"] : []),
      ...(positionalRunProbability >= 0.5
        ? ["Modeled positional run"]
        : []),
      ...(tierBoundaryProbability >= 0.5
        ? ["User tier may be exhausted"]
        : []),
      ...(projection.tier === null ? ["Missing projection tier"] : []),
    ]
    const score =
      marginalLineupPoints * weights.lineupValue
      + benchUtility * weights.benchUpside
      + tierLossIfDeferred * (1 - survives) * weights.tierUrgency
      + pointsAboveReplacement * weights.replacementValue

    return [{
      player,
      positionRank: metrics.posRank,
      score,
      evidence: {
        projectedFloor: projection.floor,
        projectedMedian: projection.median,
        projectedCeiling: projection.ceiling,
        replacementLevel,
        pointsAboveReplacement,
        marginalLineupPoints,
        benchUtility,
        tierLossIfDeferred,
        survivalProbability: survives,
        positionalRunProbability,
        tierBoundaryProbability,
        userTier,
        projectionTier: projection.tier,
        rosterRole,
        flags,
      },
    }]
  })

  const byScore = [...candidates].sort((left, right) =>
    right.score - left.score
    || left.positionRank - right.positionRank
    || left.player.id.localeCompare(right.player.id))
  const highestUrgency = [...candidates].sort((left, right) =>
    right.evidence.tierLossIfDeferred
    * (1 - right.evidence.survivalProbability)
    - left.evidence.tierLossIfDeferred
    * (1 - left.evidence.survivalProbability))[0]
  const selected = new Map<string, DraftRecommendationCandidate>()
  byScore.slice(0, 2).forEach(candidate =>
    selected.set(candidate.player.id, candidate))
  if (highestUrgency) {
    selected.set(highestUrgency.player.id, highestUrgency)
  }
  for (const candidate of byScore) {
    if (selected.size >= 3) break
    selected.set(candidate.player.id, candidate)
  }

  return {
    schemaVersion: 1,
    currentPick,
    nextUserPick,
    ...view,
    positionCandidates: byScore,
    candidates: Array.from(selected.values())
      .sort((left, right) => right.score - left.score)
      .slice(0, 3),
  }
}
