import {
  BoardSettings,
  FantasyPosition,
  FantasySettings,
  Player,
  RankingSummary,
  ThirdPartyRanker,
} from "../../types"
import {
  createProjectionRangeModel,
  buildProjectionScale,
  normalizeProjectionRange,
  ProjectionRangeModel,
  ProjectionRangeValues,
  ProjectionScale,
  rankingSourceLabel,
} from "./positionalBests"
import { getAdvisorProjection } from "../draft-advisor/recommendations"
import type { DraftRecommendationSet } from "../draft-advisor/recommendations"
import type { OpponentForecast } from "../draft-advisor/types"

/** The fixed visual order is intentionally independent of board ordering. */
export const TIER_LANDSCAPE_POSITIONS = [
  FantasyPosition.QUARTERBACK,
  FantasyPosition.RUNNING_BACK,
  FantasyPosition.WIDE_RECEIVER,
  FantasyPosition.TIGHT_END,
] as const

export type TierLandscapePosition = typeof TIER_LANDSCAPE_POSITIONS[number]

/** Keep the live surface useful without rendering the full available pool. */
export const MAX_VISIBLE_TIER_BANDS_PER_LANE = 3
export const MAX_VISIBLE_PLAYERS_PER_TIER_BAND = 3

type PrimaryTierSource = "custom" | "active" | "unavailable"

export interface TierLandscapeForecastHorizon {
  pickCount: number
  firstOverallPick: number | null
  lastOverallPick: number | null
}

export interface TierLandscapeRunEvidence {
  probability: number | null
  minimumPicks: number | null
}

export interface TierLandscapeActiveTierBoundary {
  tier: number
  sourceLabel: string
  probability: number | null
  unavailableReason: string | null
}

export interface TierLandscapeCurrentTier {
  tier: number | null
  label: string
  sourceLabel: string
  availablePlayerCount: number
  exhaustionProbability: number | null
  exhaustionUnavailableReason: string | null
  activeTierBoundary: TierLandscapeActiveTierBoundary | null
}

export interface TierLandscapePlayerModel {
  player: Player
  positionRank: number | null
  positionRankSourceLabel: string
  primaryTier: number | null
  primaryTierSourceLabel: string
  projectionTier: number | null
  projection: ProjectionRangeModel
  survivalProbability: number | null
}

export interface TierLandscapeTierBandModel {
  id: string
  tier: number | null
  label: string
  sourceLabel: string
  availablePlayerCount: number
  hiddenPlayerCount: number
  players: TierLandscapePlayerModel[]
}

export interface TierLandscapeLaneModel {
  position: TierLandscapePosition
  availablePlayerCount: number
  totalTierBandCount: number
  hiddenTierBandCount: number
  primaryTierSourceLabel: string
  currentTopAvailableTier: TierLandscapeCurrentTier | null
  run: TierLandscapeRunEvidence
  /** Complete, explicitly available pool in board-rank order. */
  players: TierLandscapePlayerModel[]
  visibleTierBands: TierLandscapeTierBandModel[]
}

export interface TierLandscapePresentationModel {
  currentPick: number | null
  nextUserPick: number | null
  picksBeforeNextUserPick: number | null
  forecastHorizon: TierLandscapeForecastHorizon | null
  projectionScale: ProjectionScale
  lanes: TierLandscapeLaneModel[]
}

interface PreliminaryPlayer {
  player: Player
  positionRank: number | null
  positionRankSourceLabel: string
  activeTier: number | null
  primaryTier: number | null
  primaryTierSource: PrimaryTierSource
  primaryTierSourceLabel: string
  projectionTier: number | null
  projectionValues: ProjectionRangeValues
}

interface PreliminaryTierBand {
  id: string
  tier: number | null
  source: PrimaryTierSource
  sourceLabel: string
  players: PreliminaryPlayer[]
  firstRank: number
  firstPlayerId: string
}

interface PreliminaryLane {
  position: TierLandscapePosition
  availablePlayerCount: number
  totalTierBandCount: number
  hiddenTierBandCount: number
  primaryTierSourceLabel: string
  currentTopAvailableTier: PreliminaryTierBand | null
  players: PreliminaryPlayer[]
  visibleTierBands: PreliminaryTierBand[]
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  !!value && typeof value === "object"
)

const arrayValue = (value: unknown): unknown[] => (
  Array.isArray(value) ? value : []
)

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

const usablePick = (value: unknown): number | null => (
  finiteNumber(value)
  && Number.isSafeInteger(value)
  && value >= 1
    ? value
    : null
)

/**
 * Forecast providers should already return probabilities in [0, 1].  The
 * presentation layer rejects non-finite values and clamps finite outliers so
 * malformed snapshots cannot create impossible visual evidence.
 */
export const normalizeSuppliedProbability = (value: unknown): number | null => (
  finiteNumber(value)
    ? Math.min(1, Math.max(0, value))
    : null
)

const customTierFor = (
  player: Player,
  settings: FantasySettings,
): number | null => {
  const custom = player.ranks?.[ThirdPartyRanker.CUSTOM]
  return usablePositiveInteger(settings.ppr
    ? custom?.pprPositionTier?.tierNumber
    : custom?.standardPositionTier?.tierNumber)
}

const activeRankAndTierFor = (
  player: Player,
  settings: FantasySettings,
  boardSettings: BoardSettings,
): {positionRank: number | null; tier: number | null} => {
  const active = player.ranks?.[boardSettings.ranker]
  return {
    positionRank: usablePositiveInteger(settings.ppr
      ? active?.pprPositionRank
      : active?.standardPositionRank),
    tier: usablePositiveInteger(settings.ppr
      ? active?.pprPositionTier?.tierNumber
      : active?.standardPositionTier?.tierNumber),
  }
}

const sourceLabelFor = (
  source: PrimaryTierSource,
  boardSettings: BoardSettings,
): string => {
  if (source === "custom") return "Custom user tier"
  if (source === "active") return `${rankingSourceLabel(boardSettings.ranker)} tier`
  return "Tier unavailable"
}

const bandLabel = (sourceLabel: string, tier: number | null): string => (
  tier === null ? "Tier unavailable" : `${sourceLabel} ${tier}`
)

const playerProjection = (
  player: Player,
  settings: FantasySettings,
  boardSettings: BoardSettings,
  rankingSummaries: RankingSummary[],
): {tier: number | null; values: ProjectionRangeValues} => {
  const projection = getAdvisorProjection(
    player,
    settings,
    boardSettings,
    rankingSummaries,
  )
  const tier = usablePositiveInteger(projection.tier)
  const values = tier === null
    ? normalizeProjectionRange({floor: null, median: null, ceiling: null})
    : normalizeProjectionRange({
        floor: projection.floor,
        median: projection.median,
        ceiling: projection.ceiling,
      })
  return {tier, values}
}

const preliminaryPlayerFor = (
  player: Player,
  settings: FantasySettings,
  boardSettings: BoardSettings,
  rankingSummaries: RankingSummary[],
): PreliminaryPlayer => {
  const active = activeRankAndTierFor(player, settings, boardSettings)
  const activeTier = active.tier
  const customTier = customTierFor(player, settings)
  const primaryTierSource: PrimaryTierSource = customTier !== null
    ? "custom"
    : activeTier !== null
      ? "active"
      : "unavailable"
  const projection = playerProjection(
    player,
    settings,
    boardSettings,
    rankingSummaries,
  )

  return {
    player,
    positionRank: active.positionRank,
    positionRankSourceLabel: rankingSourceLabel(boardSettings.ranker),
    activeTier,
    primaryTier: customTier ?? activeTier,
    primaryTierSource,
    primaryTierSourceLabel: sourceLabelFor(primaryTierSource, boardSettings),
    projectionTier: projection.tier,
    projectionValues: projection.values,
  }
}

const playerOrder = (left: PreliminaryPlayer, right: PreliminaryPlayer): number => (
  (left.positionRank ?? Number.MAX_SAFE_INTEGER)
  - (right.positionRank ?? Number.MAX_SAFE_INTEGER)
  || left.player.id.localeCompare(right.player.id)
)

const uniqueAvailablePlayers = (players: Player[]): Player[] => {
  const byId = new Map<string, Player>()
  players
    .filter(player => (
      !!player
      && typeof player.id === "string"
      && TIER_LANDSCAPE_POSITIONS.includes(
        player.position as TierLandscapePosition,
      )
    ))
    .sort((left, right) => left.id.localeCompare(right.id))
    .forEach(player => {
      if (!byId.has(player.id)) byId.set(player.id, player)
    })
  return Array.from(byId.values())
}

const primaryTierSourceSummary = (
  players: PreliminaryPlayer[],
  boardSettings: BoardSettings,
): string => {
  const customCount = players.filter(player =>
    player.primaryTierSource === "custom").length
  const activeCount = players.filter(player =>
    player.primaryTierSource === "active").length
  if (customCount > 0 && activeCount > 0) {
    return "Custom user tiers when present; "
      + `${rankingSourceLabel(boardSettings.ranker)} tiers otherwise`
  }
  if (customCount > 0) return "Custom user tiers"
  if (activeCount > 0) return `${rankingSourceLabel(boardSettings.ranker)} tiers`
  return "Tier source unavailable"
}

const buildPreliminaryLane = (
  position: TierLandscapePosition,
  availablePlayers: Player[],
  settings: FantasySettings,
  boardSettings: BoardSettings,
  rankingSummaries: RankingSummary[],
): PreliminaryLane => {
  const players = availablePlayers
    .filter(player => player.position === position)
    .map(player => preliminaryPlayerFor(
      player,
      settings,
      boardSettings,
      rankingSummaries,
    ))
    .sort(playerOrder)
  const byBand = new Map<string, PreliminaryTierBand>()
  players.forEach(player => {
    const id = `${player.primaryTierSource}:${player.primaryTier ?? "unavailable"}`
    const existing = byBand.get(id)
    if (existing) {
      existing.players.push(player)
      return
    }
    byBand.set(id, {
      id,
      tier: player.primaryTier,
      source: player.primaryTierSource,
      sourceLabel: player.primaryTierSourceLabel,
      players: [player],
      firstRank: player.positionRank ?? Number.MAX_SAFE_INTEGER,
      firstPlayerId: player.player.id,
    })
  })
  const tierBands = Array.from(byBand.values())
    .map(band => ({...band, players: [...band.players].sort(playerOrder)}))
    .sort((left, right) => (
      left.firstRank - right.firstRank
      || left.firstPlayerId.localeCompare(right.firstPlayerId)
      || left.id.localeCompare(right.id)
    ))

  return {
    position,
    availablePlayerCount: players.length,
    totalTierBandCount: tierBands.length,
    hiddenTierBandCount: Math.max(
      0,
      tierBands.length - MAX_VISIBLE_TIER_BANDS_PER_LANE,
    ),
    primaryTierSourceLabel: primaryTierSourceSummary(players, boardSettings),
    currentTopAvailableTier: tierBands[0] || null,
    players,
    visibleTierBands: tierBands.slice(0, MAX_VISIBLE_TIER_BANDS_PER_LANE),
  }
}

const forecastPicks = (forecast: OpponentForecast | null | undefined): unknown[] => {
  if (!forecast || !isRecord(forecast)) return []
  return arrayValue(forecast.picks)
    .filter(pick => usablePick(isRecord(pick) ? pick.overallPick : null) !== null)
}

const forecastHorizonFor = (
  forecast: OpponentForecast | null | undefined,
): TierLandscapeForecastHorizon | null => {
  if (!forecast || !isRecord(forecast) || !Array.isArray(forecast.picks)) {
    return null
  }
  const picks = forecastPicks(forecast)
    .map(pick => usablePick((pick as Record<string, unknown>).overallPick))
    .filter((pick): pick is number => pick !== null)
    .sort((left, right) => left - right)
  return {
    pickCount: picks.length,
    firstOverallPick: picks[0] ?? null,
    lastOverallPick: picks[picks.length - 1] ?? null,
  }
}

/**
 * This is deliberately only an aggregation of supplied player probabilities:
 * multiply (1 - p) for each valid supplied per-pick entry for this player.
 * Missing player entries contribute no factor and never become an invented
 * probability.  With no supplied entry the surface says unavailable.
 */
export const survivalFromSuppliedForecast = (
  playerId: string,
  forecast: OpponentForecast | null | undefined,
): number | null => {
  const probabilities = forecastPicks(forecast).flatMap(pick => {
    const record = pick as Record<string, unknown>
    const candidate = arrayValue(record.playerProbabilities).find(entry => {
      if (!isRecord(entry) || entry.playerId !== playerId) return false
      return normalizeSuppliedProbability(entry.overallProbability) !== null
    })
    if (!isRecord(candidate)) return []
    const probability = normalizeSuppliedProbability(candidate.overallProbability)
    return probability === null ? [] : [probability]
  })
  if (probabilities.length === 0) return null
  return probabilities.reduce(
    (survival, probability) => survival * (1 - probability),
    1,
  )
}

const suppliedRunFor = (
  position: TierLandscapePosition,
  forecast: OpponentForecast | null | undefined,
): TierLandscapeRunEvidence => {
  if (!forecast || !isRecord(forecast)) {
    return {probability: null, minimumPicks: null}
  }
  const run = arrayValue(forecast.runProbabilities).find(candidate => (
    isRecord(candidate) && candidate.position === position
  ))
  if (!isRecord(run)) return {probability: null, minimumPicks: null}
  return {
    probability: normalizeSuppliedProbability(run.probability),
    minimumPicks: usablePositiveInteger(run.minimumPicks),
  }
}

const suppliedTierBoundaryFor = (
  position: TierLandscapePosition,
  tier: number | null,
  forecast: OpponentForecast | null | undefined,
): number | null => {
  if (tier === null || !forecast || !isRecord(forecast)) return null
  const boundary = arrayValue(forecast.tierBoundaryProbabilities).find(
    candidate => (
      isRecord(candidate)
      && candidate.position === position
      && candidate.userTier === tier
    ),
  )
  return isRecord(boundary)
    ? normalizeSuppliedProbability(boundary.probability)
    : null
}

const missingTierBoundaryReason = (
  forecast: OpponentForecast | null | undefined,
  tier: number | null,
): string => {
  if (tier === null) return "Current tier is unavailable."
  if (!forecast || !isRecord(forecast)) return "Opponent forecast is unavailable."
  if (!Array.isArray(forecast.tierBoundaryProbabilities)) {
    return "No valid supplied tier-boundary evidence."
  }
  return "No supplied tier-boundary probability for this tier."
}

const currentTierFor = (
  lane: PreliminaryLane,
  boardSettings: BoardSettings,
  forecast: OpponentForecast | null | undefined,
): TierLandscapeCurrentTier | null => {
  const current = lane.currentTopAvailableTier
  if (!current) return null
  const primaryIsCustom = current.source === "custom"
  const activeRankerIsCustom = boardSettings.ranker === ThirdPartyRanker.CUSTOM
  const sourceAligned = !primaryIsCustom || activeRankerIsCustom
  const exhaustionProbability = sourceAligned
    ? suppliedTierBoundaryFor(lane.position, current.tier, forecast)
    : null
  const activeTiers = Array.from(new Set(current.players
    .map(player => player.activeTier)
    .filter((tier): tier is number => tier !== null)))
  const activeTier = activeTiers.length === 1 ? activeTiers[0] : null
  const activeTierBoundaryProbability = activeTier === null
    ? null
    : suppliedTierBoundaryFor(lane.position, activeTier, forecast)
  const activeTierBoundary = primaryIsCustom && !activeRankerIsCustom
    && activeTier !== null
    ? {
        tier: activeTier,
        sourceLabel: `${rankingSourceLabel(boardSettings.ranker)} tier`,
        probability: activeTierBoundaryProbability,
        unavailableReason: activeTierBoundaryProbability === null
          ? missingTierBoundaryReason(forecast, activeTier)
          : null,
      }
    : null
  return {
    tier: current.tier,
    label: bandLabel(current.sourceLabel, current.tier),
    sourceLabel: current.sourceLabel,
    availablePlayerCount: current.players.length,
    exhaustionProbability,
    exhaustionUnavailableReason: exhaustionProbability !== null
      ? null
      : !sourceAligned
        ? "The supplied forecast boundary uses the active draft-board tier, "
          + "not this custom user tier."
        : missingTierBoundaryReason(forecast, current.tier),
    activeTierBoundary,
  }
}

const playerModelFor = (
  player: PreliminaryPlayer,
  projectionScale: ProjectionScale,
  forecast: OpponentForecast | null | undefined,
): TierLandscapePlayerModel => ({
  player: player.player,
  positionRank: player.positionRank,
  positionRankSourceLabel: player.positionRankSourceLabel,
  primaryTier: player.primaryTier,
  primaryTierSourceLabel: player.primaryTierSourceLabel,
  projectionTier: player.projectionTier,
  projection: createProjectionRangeModel({
    floor: player.projectionValues.floor,
    median: player.projectionValues.median,
    ceiling: player.projectionValues.ceiling,
  }, projectionScale),
  survivalProbability: survivalFromSuppliedForecast(player.player.id, forecast),
})

export const buildTierLandscapePresentationModel = ({
  availablePlayers,
  recommendations = null,
  opponentForecast = null,
  boardSettings,
  settings,
  rankingSummaries,
}: {
  availablePlayers: Player[]
  recommendations?: DraftRecommendationSet | null
  opponentForecast?: OpponentForecast | null
  boardSettings: BoardSettings
  settings: FantasySettings
  rankingSummaries: RankingSummary[]
}): TierLandscapePresentationModel => {
  const available = uniqueAvailablePlayers(availablePlayers)
  const preliminaryLanes = TIER_LANDSCAPE_POSITIONS.map(position =>
    buildPreliminaryLane(
      position,
      available,
      settings,
      boardSettings,
      rankingSummaries,
    ))
  const visiblePlayers = preliminaryLanes.flatMap(lane => lane.players)
  const projectionScale = buildProjectionScale(
    visiblePlayers.map(player => player.projectionValues),
  )
  const currentPick = usablePick(recommendations?.currentPick)
  const nextUserPick = usablePick(recommendations?.nextUserPick)

  return {
    currentPick,
    nextUserPick,
    picksBeforeNextUserPick: currentPick !== null && nextUserPick !== null
      ? Math.max(0, nextUserPick - currentPick)
      : null,
    forecastHorizon: forecastHorizonFor(opponentForecast),
    projectionScale,
    lanes: preliminaryLanes.map(lane => ({
      position: lane.position,
      availablePlayerCount: lane.availablePlayerCount,
      totalTierBandCount: lane.totalTierBandCount,
      hiddenTierBandCount: lane.hiddenTierBandCount,
      primaryTierSourceLabel: lane.primaryTierSourceLabel,
      currentTopAvailableTier: currentTierFor(
        lane,
        boardSettings,
        opponentForecast,
      ),
      run: suppliedRunFor(lane.position, opponentForecast),
      players: lane.players.map(player => playerModelFor(
        player,
        projectionScale,
        opponentForecast,
      )),
      visibleTierBands: lane.visibleTierBands.map(band => ({
        id: band.id,
        tier: band.tier,
        label: bandLabel(band.sourceLabel, band.tier),
        sourceLabel: band.sourceLabel,
        availablePlayerCount: band.players.length,
        hiddenPlayerCount: Math.max(
          0,
          band.players.length - MAX_VISIBLE_PLAYERS_PER_TIER_BAND,
        ),
        players: band.players
          .slice(0, MAX_VISIBLE_PLAYERS_PER_TIER_BAND)
          .map(player => playerModelFor(
            player,
            projectionScale,
            opponentForecast,
          )),
      })),
    })),
  }
}
