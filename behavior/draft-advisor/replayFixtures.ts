import {
  BoardSettings,
  DataRanker,
  FantasyPosition,
  FantasySettings,
  Player,
  PlayerRanking,
  RankingSummary,
  ThirdPartyRanker,
} from "../../types"
import {
  getProjectedTier,
  PlayerLibrary,
  rankablePositions,
} from "../draft"
import { getRosterIndexForPick } from "../draft-feed/session"
import {
  getAdvisorRosterCapacity,
} from "./recommendations"
import { validateEmpiricalBaseShadowEvidence } from "./empiricalBaseShadowMetrics"
import { validateRunOnlyShadowEvidence } from "./runOnlyShadowMetrics"
import {
  DraftSnapshot,
  EspnDraftPick,
} from "../draft-feed/types"
import type {
  RecordedCompletedDraftReplay,
  RecordedReplayPlayer,
  ReplayEmpiricalBaseShadowEvidence,
  ReplayForecastEvidence,
  ReplayRunOnlyShadowEvidence,
} from "./completedDraftReplay"

interface CaptureCompletedDraftReplayParams {
  id: string
  settings: FantasySettings
  targetRosterIndex: number
  boardSettings: BoardSettings
  rankingSummaries: RankingSummary[]
  playerLib: PlayerLibrary
  draftHistory: Array<string | null>
  sourceSnapshot?: DraftSnapshot | null
  forecastEvidence?: ReplayForecastEvidence
  empiricalBaseShadowEvidence?: ReplayEmpiricalBaseShadowEvidence
  runOnlyShadowEvidence?: ReplayRunOnlyShadowEvidence
}

const projectionSummary = (
  rankingSummaries: RankingSummary[],
  settings: FantasySettings,
) => rankingSummaries.find(summary =>
  summary.ranker === DataRanker.LAST_SSN_PPG
  && summary.ppr === settings.ppr)

const validRank = (value: number | undefined): number | null => {
  if (
    typeof value !== "number"
    || !Number.isSafeInteger(value)
    || value <= 0
    || value >= 9999
  ) return null
  return value
}

const rankValue = (
  rank: PlayerRanking | undefined,
  settings: FantasySettings,
): { positionRank: number, userTier: number } | null => {
  const positionRank = validRank(settings.ppr
    ? rank?.pprPositionRank
    : rank?.standardPositionRank)
  if (!positionRank) return null

  const tierNumber = settings.ppr
    ? rank?.pprPositionTier?.tierNumber
    : rank?.standardPositionTier?.tierNumber
  return {
    positionRank,
    userTier: validRank(tierNumber) || positionRank,
  }
}

const validAdp = (value: number | undefined): number | null =>
  typeof value === "number" && Number.isFinite(value) && value > 0
    ? Number.parseFloat(value.toFixed(1))
    : null

/**
 * Recorded boards must retain rankable players even when a selected ranker has
 * not ranked a newly imported rookie. ESPN is the stable canonical fallback
 * for both positional rank and ADP; no player identity is synthesized here.
 */
const replayMetrics = (
  player: Player,
  settings: FantasySettings,
  boardSettings: BoardSettings,
): { positionRank: number, userTier: number, adp: number } | null => {
  const selectedRank = player.ranks?.[boardSettings.ranker]
  const espnRank = player.ranks?.[ThirdPartyRanker.ESPN]
  const selected = rankValue(selectedRank, settings)
  const fallback = rankValue(espnRank, settings)
  const rank = selected || fallback
  if (!rank) return null

  return {
    ...rank,
    adp: validAdp(player.ranks?.[boardSettings.adpRanker]?.adp)
      ?? validAdp(espnRank?.adp)
      ?? 999,
  }
}

const recordedPlayer = (
  player: Player,
  settings: FantasySettings,
  boardSettings: BoardSettings,
  rankingSummaries: RankingSummary[],
): RecordedReplayPlayer | null => {
  if (!rankablePositions.includes(player.position)) return null
  const metrics = replayMetrics(player, settings, boardSettings)
  if (!metrics) return null
  const projection = getProjectedTier(
    player,
    boardSettings.ranker,
    DataRanker.LAST_SSN_PPG,
    settings,
    rankingSummaries,
  )
  const fallbackTiers = projectionSummary(rankingSummaries, settings)
    ?.tiers[player.position] || []
  const resolvedProjection =
    projection || fallbackTiers[fallbackTiers.length - 1]
  if (!resolvedProjection) return null
  const floor = Math.min(
    resolvedProjection.lowerLimitValue,
    resolvedProjection.upperLimitValue,
  )
  const ceiling = Math.max(
    resolvedProjection.lowerLimitValue,
    resolvedProjection.upperLimitValue,
  )
  return {
    id: player.id,
    name: player.fullName,
    position: player.position as RecordedReplayPlayer["position"],
    team: player.team,
    adp: metrics.adp,
    positionRank: metrics.positionRank,
    userTier: metrics.userTier,
    projectedFloor: floor,
    projectedMedian: (floor + ceiling) / 2,
    projectedCeiling: ceiling,
  }
}

export const validateCompletedDraftReplay = (
  fixture: RecordedCompletedDraftReplay,
): string[] => {
  const errors: string[] = []
  const expectedPickCount = fixture.source?.totalPicks
    ?? getAdvisorRosterCapacity(fixture.settings) * fixture.settings.numTeams
  if (fixture.provenance !== "recorded" && fixture.provenance !== "synthetic") {
    errors.push("provenance must be recorded or synthetic")
  }
  if (fixture.actualPicks.length !== expectedPickCount) {
    errors.push(
      `expected ${expectedPickCount} completed picks, received ${fixture.actualPicks.length}`,
    )
  }
  const playerIds = new Set(fixture.players.map(player => player.id))
  const pickedPlayerIds = new Set<string>()
  fixture.actualPicks.forEach((pick, index) => {
    const expectedOverallPick = index + 1
    if (pick.overallPick !== expectedOverallPick) {
      errors.push(
        `pick ${index + 1} has overallPick ${pick.overallPick}`,
      )
    }
    const expectedRosterIndex = getRosterIndexForPick(
      pick.overallPick,
      fixture.settings.numTeams,
    )
    if (pick.rosterIndex !== expectedRosterIndex) {
      errors.push(
        `pick ${pick.overallPick} has invalid snake roster index`,
      )
    }
    const advisorEligible =
      pick.advisorEligible ?? pick.playerId !== null
    if (advisorEligible && !pick.playerId) {
      errors.push(`pick ${pick.overallPick} is eligible without a player`)
    } else if (pick.playerId && !playerIds.has(pick.playerId)) {
      errors.push(`pick ${pick.overallPick} references an unknown player`)
    }
    if (pick.playerId && pickedPlayerIds.has(pick.playerId)) {
      errors.push(`player ${pick.playerId} is drafted more than once`)
    }
    if (pick.playerId) pickedPlayerIds.add(pick.playerId)
  })
  if (
    fixture.targetRosterIndex < 0
    || fixture.targetRosterIndex >= fixture.settings.numTeams
  ) {
    errors.push("targetRosterIndex is outside the league")
  }
  const targetAdvisorPicks = fixture.actualPicks.filter(pick =>
    pick.rosterIndex === fixture.targetRosterIndex
    && (pick.advisorEligible ?? pick.playerId !== null)).length
  const expectedTargetAdvisorPicks =
    getAdvisorRosterCapacity(fixture.settings)
  if (targetAdvisorPicks !== expectedTargetAdvisorPicks) {
    errors.push(
      `expected ${expectedTargetAdvisorPicks} advisor picks for the target roster, received ${targetAdvisorPicks}`,
    )
  }
  return [...errors, ...validateEmpiricalBaseShadowEvidence(fixture), ...validateRunOnlyShadowEvidence(fixture)]
}

const rankablePosition = (position: string): FantasyPosition | null => {
  const normalized = position.split(",")[0]?.trim()
  return rankablePositions.includes(normalized as FantasyPosition)
    ? normalized as FantasyPosition
    : null
}

const normalizedName = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\b(iii|ii|jr|sr)\b/g, "")
    .replace(/\s+/g, " ")
    .trim()

const espnPlayerId = (
  pick: EspnDraftPick,
  playerLib: PlayerLibrary,
): string | null => {
  const imageId = pick.imgUrl.match(
    /headshots\/nfl\/players\/full\/(\d+)\.png/,
  )?.[1]
  if (imageId && playerLib[imageId]) return imageId
  const position = rankablePosition(pick.position)
  if (!position) return null
  const name = normalizedName(pick.name)
  return Object.values(playerLib).find(player =>
    player.position === position
    && normalizedName(player.fullName) === name)?.id || null
}

const sourceReplayPicks = (
  snapshot: DraftSnapshot,
  playerLib: PlayerLibrary,
  numTeams: number,
): RecordedCompletedDraftReplay["actualPicks"] => {
  if (snapshot.platform !== "ESPN") {
    throw new Error("Completed source capture currently supports ESPN")
  }
  return (snapshot.picks as EspnDraftPick[])
    .map(pick => {
      const coordinate = pick.pick.match(/^R(\d+), P(\d+)\b/)
      if (!coordinate) {
        throw new Error(`ESPN pick is missing a coordinate: ${pick.name}`)
      }
      const round = Number.parseInt(coordinate[1], 10)
      const pickInRound = Number.parseInt(coordinate[2], 10)
      const overallPick = (round - 1) * numTeams + pickInRound
      const position = rankablePosition(pick.position)
      const playerId = position ? espnPlayerId(pick, playerLib) : null
      return {
        overallPick,
        rosterIndex: getRosterIndexForPick(overallPick, numTeams),
        playerId,
        name: pick.name,
        position: pick.position,
        // Preserve late opponent picks outside Drafty's bounded player
        // universe as board evidence, but keep them out of scoring and
        // alternatives because they have no projection record.
        advisorEligible: position !== null && playerId !== null,
      }
    })
    .sort((left, right) => left.overallPick - right.overallPick)
}

const replaySourceUrl = (sourceUrl?: string): string | undefined => {
  if (!sourceUrl) return undefined
  try {
    const url = new URL(sourceUrl)
    const leagueId = url.searchParams.get("leagueId")
    return leagueId
      ? `${url.origin}${url.pathname}?leagueId=${encodeURIComponent(leagueId)}`
      : `${url.origin}${url.pathname}`
  } catch {
    return undefined
  }
}

export const captureCompletedDraftReplay = ({
  id,
  settings,
  targetRosterIndex,
  boardSettings,
  rankingSummaries,
  playerLib,
  draftHistory,
  sourceSnapshot,
  forecastEvidence,
  empiricalBaseShadowEvidence,
  runOnlyShadowEvidence,
}: CaptureCompletedDraftReplayParams): RecordedCompletedDraftReplay => {
  const completion = sourceSnapshot?.completion
  const targetRosterIndexFromSource =
    completion?.targetRosterIndex !== null
    && completion?.targetRosterIndex !== undefined
      ? completion.targetRosterIndex
      : targetRosterIndex
  const sourcePicks = sourceSnapshot && completion?.complete
    ? sourceReplayPicks(
        sourceSnapshot,
        playerLib,
        completion.numTeams,
      )
    : null
  const targetAdvisorPickCount = sourcePicks?.filter(pick =>
    pick.rosterIndex === targetRosterIndexFromSource
    && pick.advisorEligible).length
  const startingRosterSize =
    settings.numStartingQbs
    + settings.numStartingRbs
    + settings.numStartingWrs
    + settings.numStartingTes
    + settings.numFlex
  const capturedSettings = completion?.complete
    ? {
        ...settings,
        ppr: completion.scoringFormat === "PPR"
          ? true
          : settings.ppr,
        numTeams: completion.numTeams,
        numBenchPlayers: Math.max(
          0,
          (targetAdvisorPickCount || 0) - startingRosterSize,
        ),
      }
    : settings
  const summary = projectionSummary(rankingSummaries, capturedSettings)
  if (!summary) {
    throw new Error("Projection summary is required to capture a replay")
  }
  const players = Object.values(playerLib)
    .map(player => recordedPlayer(
      player,
      capturedSettings,
      boardSettings,
      rankingSummaries,
    ))
    .filter((player): player is RecordedReplayPlayer => player !== null)
  const capturedIds = new Set(players.map(player => player.id))
  const sourceOrHistoryPicks: RecordedCompletedDraftReplay["actualPicks"] =
    sourcePicks || draftHistory.flatMap((playerId, index) => {
      if (!playerId) return []
      return [{
        overallPick: index + 1,
        rosterIndex: getRosterIndexForPick(
          index + 1,
          settings.numTeams,
        ),
        playerId,
      }]
    })
  const unmatchedTargetPick = sourceOrHistoryPicks.find(pick =>
    pick.rosterIndex === targetRosterIndexFromSource
    && rankablePosition(pick.position || "") !== null
    && (!pick.playerId || !capturedIds.has(pick.playerId)))
  if (unmatchedTargetPick) {
    throw new Error(
      `Target roster player ${unmatchedTargetPick.name || "Unknown"} lacks matching ranking data`,
    )
  }
  // A live provider can identify a rankable opponent player that is present in
  // Drafty's broad player universe but lacks the selected rank/projection
  // inputs required for deterministic scoring. Preserve that pick as
  // authoritative board evidence while excluding it from roster scoring and
  // alternatives, just like a provider player outside the local universe.
  const actualPicks = sourceOrHistoryPicks.map(pick =>
    pick.playerId && !capturedIds.has(pick.playerId)
      ? {...pick, playerId: null, advisorEligible: false}
      : pick)
  const missingPlayerId = actualPicks.find(pick =>
    pick.playerId && !capturedIds.has(pick.playerId))?.playerId
  if (missingPlayerId) {
    throw new Error(
      `Drafted player ${missingPlayerId} lacks ranking/projection data`,
    )
  }
  const fixture: RecordedCompletedDraftReplay = {
    fixtureVersion: 1,
    id,
    provenance: "recorded",
    source: sourceSnapshot && completion?.complete
      ? {
          platform: sourceSnapshot.platform,
          title: sourceSnapshot.title,
          sourceUrl: replaySourceUrl(sourceSnapshot.sourceUrl),
          capturedAt: sourceSnapshot.capturedAt,
          totalPicks: completion.totalPicks,
          numRounds: completion.numRounds,
          platformRosterSize: completion.platformRosterSize,
          excludedPositions: completion.excludedPositions,
        }
      : undefined,
    settings: capturedSettings,
    targetRosterIndex: targetRosterIndexFromSource,
    replacementPoints: {
      QB: summary.replacementLevels.QB[1],
      RB: summary.replacementLevels.RB[1],
      WR: summary.replacementLevels.WR[1],
      TE: summary.replacementLevels.TE[1],
    },
    players,
    actualPicks,
    ...(forecastEvidence ? (() => {
      if (forecastEvidence.sessionId !== id
        || forecastEvidence.observations.some(observation =>
          observation.targetRosterIndex !== targetRosterIndexFromSource)) {
        throw new Error("Replay forecast evidence belongs to a different draft session or target roster")
      }
      return { forecastEvidence }
    })() : {}),
    ...(empiricalBaseShadowEvidence ? (() => {
      if (empiricalBaseShadowEvidence.sessionId !== id
        || empiricalBaseShadowEvidence.observations.some(observation =>
          observation.targetRosterIndex !== targetRosterIndexFromSource)) {
        throw new Error("Replay empirical-base shadow evidence belongs to a different draft session or target roster")
      }
      return { empiricalBaseShadowEvidence }
    })() : {}),
    ...(runOnlyShadowEvidence ? (() => {
      if (runOnlyShadowEvidence.sessionId !== id
        || runOnlyShadowEvidence.observations.some(observation =>
          observation.targetRosterIndex !== targetRosterIndexFromSource)) {
        throw new Error("Replay run-only shadow evidence belongs to a different draft session or target roster")
      }
      return { runOnlyShadowEvidence }
    })() : {}),
  }
  const errors = validateCompletedDraftReplay(fixture)
  if (errors.length > 0) {
    throw new Error(`Replay capture is incomplete: ${errors.join("; ")}`)
  }
  return fixture
}
