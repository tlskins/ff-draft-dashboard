import {
  BoardSettings,
  DataRanker,
  FantasyPosition,
  FantasySettings,
  NFLTeam,
  Player,
  RankingSummary,
  ThirdPartyADPRanker,
  ThirdPartyRanker,
  Tier,
} from "../../types"
import {
  addToRoster,
  createRosters,
  getPlayerMetrics,
  PlayerLibrary,
  PlayerRanks,
  Roster,
} from "../draft"
import { createDraftAdvisorContext } from "./createDraftAdvisorContext"
import { createOpponentForecast } from "./opponentModel"
import {
  createDraftRecommendations,
  getAdvisorProjection,
  getAdvisorRosterCapacity,
  optimizeProjectedLineup,
} from "./recommendations"
import type { DraftPlatform } from "../draft-feed/types"
import type {
  DraftAdvisorContext,
  OpponentForecast,
  OpponentModelKind,
} from "./types"

type ReplayPosition =
  | FantasyPosition.QUARTERBACK
  | FantasyPosition.RUNNING_BACK
  | FantasyPosition.WIDE_RECEIVER
  | FantasyPosition.TIGHT_END

/** Frozen model surface for evidence recorded by deterministic_opponent_v1. */
export type RecordedV1OpponentModelKind = Exclude<
  OpponentModelKind,
  "combined_v2"
>

const POSITIONS: ReplayPosition[] = [
  FantasyPosition.QUARTERBACK,
  FantasyPosition.RUNNING_BACK,
  FantasyPosition.WIDE_RECEIVER,
  FantasyPosition.TIGHT_END,
]

export type DraftReplayStrategy =
  | "combined"
  | "adp_only"
  | "need_only"
  | "rank_only"

export interface RecordedReplayPlayer {
  id: string
  name: string
  position: ReplayPosition
  team: string
  adp: number
  positionRank: number
  userTier: number
  projectedFloor: number
  projectedMedian: number
  projectedCeiling: number
}

/**
 * A locally captured, leakage-safe forecast made while a live board was at a
 * known boundary.  It is deliberately optional so v1 replay fixtures remain
 * portable regression fixtures even when no live forecast labels were kept.
 */
export interface ReplayForecastObservation {
  observedThroughOverallPick: number
  /** Deterministic identity of the live model inputs, captured before labels. */
  inputFingerprint: string
  /** Recomputable identity of this exported observation, not its model inputs. */
  observationFingerprint: string
  modelIdentity: "deterministic_opponent_v1"
  model: RecordedV1OpponentModelKind
  targetRosterIndex: number
  forecast: OpponentForecast
}

export interface ReplayForecastEvidence {
  schemaVersion: 1
  sessionId: string
  observations: ReplayForecastObservation[]
}

export interface RecordedCompletedDraftReplay {
  fixtureVersion: 1
  id: string
  provenance: "recorded" | "synthetic"
  source?: {
    platform: DraftPlatform
    title: string
    sourceUrl?: string
    capturedAt: number
    totalPicks: number
    numRounds: number
    platformRosterSize: number
    excludedPositions: string[]
    rankingProfile?: string
  }
  settings: FantasySettings
  targetRosterIndex: number
  replacementPoints: Record<ReplayPosition, number>
  players: RecordedReplayPlayer[]
  actualPicks: Array<{
    overallPick: number
    rosterIndex: number
    playerId: string | null
    name?: string
    position?: string
    advisorEligible?: boolean
  }>
  /** Optional live-only labels; invalid labels never make roster replay valid. */
  forecastEvidence?: ReplayForecastEvidence
}

export interface FinalRosterQuality {
  legal: boolean
  starterCompleteness: number
  projectedStarterPoints: number
  projectedStarterPointsAboveReplacement: number
  benchCeiling: number
}

export interface CompletedDraftReplayResult {
  schemaVersion: 1
  fixtureId: string
  strategy: DraftReplayStrategy
  selectedPlayerIds: string[]
  roster: Roster
  quality: FinalRosterQuality
  positionalRankViolations: number
  decisionLatencyP95Ms: number
}

interface MaterializedReplay {
  fixture: RecordedCompletedDraftReplay
  settings: FantasySettings
  boardSettings: BoardSettings
  rankingSummaries: RankingSummary[]
  playerLib: PlayerLibrary
}

/**
 * A pre-pick view yielded while replaying a completed board exactly once.
 * Consumers must treat the context as a snapshot: it contains only the
 * recorded selections strictly before `recordedPick`.
 */
export interface RecordedDraftAdvisorContextStep {
  recordedPick: RecordedCompletedDraftReplay["actualPicks"][number]
  context: DraftAdvisorContext
}

const userTier = (
  player: RecordedReplayPlayer,
): Tier => ({
  tierNumber: player.userTier,
  upperLimitPlayerIdx: player.positionRank - 1,
  lowerLimitPlayerIdx: player.positionRank - 1,
  upperLimitValue: 0,
  lowerLimitValue: 0,
})

const projectionTier = (
  player: RecordedReplayPlayer,
): Tier => ({
  tierNumber: player.positionRank,
  upperLimitPlayerIdx: player.positionRank - 1,
  lowerLimitPlayerIdx: player.positionRank - 1,
  upperLimitValue: player.projectedCeiling,
  lowerLimitValue: player.projectedFloor,
})

const toPlayer = (recorded: RecordedReplayPlayer): Player => ({
  id: recorded.id,
  firstName: recorded.name,
  lastName: "",
  fullName: recorded.name,
  team: Object.values(NFLTeam).includes(recorded.team as NFLTeam)
    ? recorded.team as NFLTeam
    : NFLTeam.FA,
  position: recorded.position,
  ranks: {
    [ThirdPartyRanker.CUSTOM]: {
      playerId: recorded.id,
      ranker: ThirdPartyRanker.CUSTOM,
      position: recorded.position,
      standardPositionRank: recorded.positionRank,
      pprPositionRank: recorded.positionRank,
      standardPositionTier: userTier(recorded),
      pprPositionTier: userTier(recorded),
    },
    [ThirdPartyRanker.ESPN]: {
      playerId: recorded.id,
      ranker: ThirdPartyRanker.ESPN,
      position: recorded.position,
      adp: recorded.adp,
      standardOverallRank: recorded.adp,
      pprOverallRank: recorded.adp,
      standardPositionRank: recorded.positionRank,
      pprPositionRank: recorded.positionRank,
    },
  },
})

const emptyPositionRecord = <Value>(value: Value) => ({
  QB: value,
  RB: value,
  WR: value,
  TE: value,
  DST: value,
  K: value,
  "": value,
})

export const materializeCompletedDraftReplay = (
  fixture: RecordedCompletedDraftReplay,
): MaterializedReplay => {
  const players = fixture.players.map(toPlayer)
  const playerLib = Object.fromEntries(
    players.map(player => [player.id, player]),
  )
  const tiers = emptyPositionRecord<Tier[]>([])
  POSITIONS.forEach(position => {
    tiers[position] = fixture.players
      .filter(player => player.position === position)
      .sort((left, right) => left.positionRank - right.positionRank)
      .map(projectionTier)
  })
  const replacementLevels = emptyPositionRecord<[number, number]>([0, 0])
  POSITIONS.forEach(position => {
    const positionPlayers = fixture.players.filter(player =>
      player.position === position)
    replacementLevels[position] = [
      positionPlayers.length,
      fixture.replacementPoints[position],
    ]
  })
  return {
    fixture,
    settings: fixture.settings,
    boardSettings: {
      ranker: ThirdPartyRanker.CUSTOM,
      adpRanker: ThirdPartyADPRanker.ESPN,
    },
    rankingSummaries: [{
      ranker: DataRanker.LAST_SSN_PPG,
      ppr: fixture.settings.ppr,
      replacementLevels,
      stdDevs: emptyPositionRecord(0),
      tiers,
    }],
    playerLib,
  }
}

const playerRanksFor = (
  available: Player[],
  settings: FantasySettings,
  boardSettings: BoardSettings,
): PlayerRanks => {
  const byPosition = (position: ReplayPosition) => available
    .filter(player => player.position === position)
    .sort((left, right) =>
      getPlayerMetrics(left, settings, boardSettings).posRank
      - getPlayerMetrics(right, settings, boardSettings).posRank)
  return {
    QB: byPosition(FantasyPosition.QUARTERBACK),
    RB: byPosition(FantasyPosition.RUNNING_BACK),
    WR: byPosition(FantasyPosition.WIDE_RECEIVER),
    TE: byPosition(FantasyPosition.TIGHT_END),
    Purge: [],
    availPlayersByOverallRank: [...available].sort((left, right) =>
      (getPlayerMetrics(left, settings, boardSettings).overallRank
        ?? Number.MAX_SAFE_INTEGER)
      - (getPlayerMetrics(right, settings, boardSettings).overallRank
        ?? Number.MAX_SAFE_INTEGER)),
    availPlayersByAdp: [...available].sort((left, right) =>
      (getPlayerMetrics(left, settings, boardSettings).adp
        ?? Number.MAX_SAFE_INTEGER)
      - (getPlayerMetrics(right, settings, boardSettings).adp
        ?? Number.MAX_SAFE_INTEGER)),
  }
}

/**
 * Walk a completed board without repeatedly materializing it from pick zero.
 * This is deliberately lower-level than the boundary helper above: empirical
 * offline evaluators can inspect every canonical pre-pick state, while live
 * replay and API behavior remain unchanged.
 */
export const walkRecordedDraftAdvisorContexts = (
  fixture: RecordedCompletedDraftReplay,
  visit: (step: RecordedDraftAdvisorContextStep) => void,
): void => {
  const replay = materializeCompletedDraftReplay(fixture)
  let rosters = createRosters(fixture.settings.numTeams)
  let available = Object.values(replay.playerLib)
  const draftHistory: Array<string | null> = []

  ;[...fixture.actualPicks]
    .sort((left, right) => left.overallPick - right.overallPick)
    .forEach(recordedPick => {
      visit({
        recordedPick,
        context: createDraftAdvisorContext({
          settings: replay.settings,
          boardSettings: replay.boardSettings,
          currentPick: recordedPick.overallPick,
          rosters,
          draftHistory,
          playerLib: replay.playerLib,
          playerRanks: playerRanksFor(available, replay.settings, replay.boardSettings),
          upcomingPickCount: replay.settings.numTeams * 2 + 1,
        }),
      })

      const advisorEligible =
        recordedPick.advisorEligible ?? recordedPick.playerId !== null
      if (!advisorEligible || !recordedPick.playerId) {
        draftHistory[recordedPick.overallPick - 1] = null
        return
      }
      const selected = available.find(player => player.id === recordedPick.playerId)
      if (!selected) {
        throw new Error(
          `Recorded pick ${recordedPick.overallPick} cannot be reconstructed`,
        )
      }
      rosters = addToRoster(rosters, selected, recordedPick.rosterIndex)
      available = available.filter(player => player.id !== selected.id)
      draftHistory[recordedPick.overallPick - 1] = selected.id
    })
}

const openStarterSpots = (
  roster: Roster,
  settings: FantasySettings,
  position: ReplayPosition,
): number => {
  const required = {
    QB: settings.numStartingQbs,
    RB: settings.numStartingRbs,
    WR: settings.numStartingWrs,
    TE: settings.numStartingTes,
  }[position]
  return Math.max(0, required - roster[position].length)
}

const baselineSelection = (
  strategy: Exclude<DraftReplayStrategy, "combined">,
  available: Player[],
  roster: Roster,
  settings: FantasySettings,
  boardSettings: BoardSettings,
): Player | undefined => {
  const orderedByAdp = [...available].sort((left, right) =>
    (getPlayerMetrics(left, settings, boardSettings).adp
      ?? Number.MAX_SAFE_INTEGER)
    - (getPlayerMetrics(right, settings, boardSettings).adp
      ?? Number.MAX_SAFE_INTEGER))
  if (strategy === "adp_only") return orderedByAdp[0]

  const rankedPositions = [...POSITIONS].sort((left, right) => {
    if (strategy === "need_only") {
      const needDifference =
        openStarterSpots(roster, settings, right)
        - openStarterSpots(roster, settings, left)
      if (needDifference !== 0) return needDifference
    }
    const leftTop = available.find(player => player.position === left)
    const rightTop = available.find(player => player.position === right)
    return (
      (leftTop
        ? getPlayerMetrics(leftTop, settings, boardSettings).posRank
        : Number.MAX_SAFE_INTEGER)
      - (rightTop
        ? getPlayerMetrics(rightTop, settings, boardSettings).posRank
        : Number.MAX_SAFE_INTEGER)
      || left.localeCompare(right)
    )
  })
  return rankedPositions.flatMap(position =>
    available
      .filter(player => player.position === position)
      .sort((left, right) =>
        getPlayerMetrics(left, settings, boardSettings).posRank
        - getPlayerMetrics(right, settings, boardSettings).posRank),
  )[0]
}

const percentile95 = (durations: number[]): number => {
  if (durations.length === 0) return 0
  const ordered = [...durations].sort((left, right) => left - right)
  return ordered[Math.ceil(ordered.length * 0.95) - 1]
}

const scoreRoster = (
  roster: Roster,
  replay: MaterializedReplay,
): FinalRosterQuality => {
  const lineup = optimizeProjectedLineup(
    roster.picks,
    replay.playerLib,
    replay.settings,
    replay.boardSettings,
    replay.rankingSummaries,
  )
  const starterSet = new Set(lineup.starterPlayerIds)
  const summary = replay.rankingSummaries[0]
  const projectedStarterPointsAboveReplacement = roster.picks.reduce(
    (total, playerId) => {
      if (!starterSet.has(playerId)) return total
      const player = replay.playerLib[playerId]
      const projection = getAdvisorProjection(
        player,
        replay.settings,
        replay.boardSettings,
        replay.rankingSummaries,
      )
      return total + Math.max(
        0,
        projection.median
        - (summary.replacementLevels[player.position]?.[1] || 0),
      )
    },
    0,
  )
  const benchCeiling = lineup.benchPlayerIds.reduce((total, playerId) => {
    const player = replay.playerLib[playerId]
    const projection = getAdvisorProjection(
      player,
      replay.settings,
      replay.boardSettings,
      replay.rankingSummaries,
    )
    const replacementLevel =
      summary.replacementLevels[player.position]?.[1] || 0
    return total + Math.max(0, projection.ceiling - replacementLevel)
  }, 0)

  return {
    legal: (
      roster.picks.length <= getAdvisorRosterCapacity(replay.settings)
      && new Set(roster.picks).size === roster.picks.length
    ),
    starterCompleteness: lineup.requiredStarterSlots > 0
      ? lineup.filledStarterSlots / lineup.requiredStarterSlots
      : 1,
    projectedStarterPoints: lineup.projectedPoints,
    projectedStarterPointsAboveReplacement,
    benchCeiling,
  }
}

/**
 * Rebuild a canonical, leakage-safe lower-bound context at a recorded board
 * boundary. It intentionally materializes only picks at or before the
 * boundary, so it cannot reproduce UI-only own-turn state that was never
 * serialized and cannot read later labels through roster, history, or
 * availability.
 */
export const createRecordedDraftAdvisorContextAtBoundary = (
  fixture: RecordedCompletedDraftReplay,
  observedThroughOverallPick: number,
  upcomingPickCount = fixture.settings.numTeams * 2 + 1,
  currentPick = observedThroughOverallPick + 1,
): DraftAdvisorContext => {
  if (!Number.isInteger(observedThroughOverallPick)
    || observedThroughOverallPick < 0
    || observedThroughOverallPick >= fixture.actualPicks.length) {
    throw new Error("Recorded opponent boundary is outside the completed draft")
  }
  if (!Number.isInteger(currentPick) || currentPick < observedThroughOverallPick + 1) {
    throw new Error("Recorded opponent context starts before its observed boundary")
  }
  const replay = materializeCompletedDraftReplay(fixture)
  let rosters = createRosters(fixture.settings.numTeams)
  let available = Object.values(replay.playerLib)
  const draftHistory: Array<string | null> = []

  fixture.actualPicks
    .filter(recordedPick =>
      recordedPick.overallPick <= observedThroughOverallPick)
    .sort((left, right) => left.overallPick - right.overallPick)
    .forEach(recordedPick => {
      const advisorEligible =
        recordedPick.advisorEligible ?? recordedPick.playerId !== null
      if (!advisorEligible || !recordedPick.playerId) {
        draftHistory[recordedPick.overallPick - 1] = null
        return
      }
      const selected = available.find(player => player.id === recordedPick.playerId)
      if (!selected) {
        throw new Error(
          `Recorded pick ${recordedPick.overallPick} cannot be reconstructed`,
        )
      }
      rosters = addToRoster(rosters, selected, recordedPick.rosterIndex)
      available = available.filter(player => player.id !== selected.id)
      draftHistory[recordedPick.overallPick - 1] = selected.id
    })

  return createDraftAdvisorContext({
    settings: replay.settings,
    boardSettings: replay.boardSettings,
    currentPick,
    rosters,
    draftHistory,
    playerLib: replay.playerLib,
    playerRanks: playerRanksFor(available, replay.settings, replay.boardSettings),
    upcomingPickCount,
  })
}

export const runCompletedDraftReplay = (
  fixture: RecordedCompletedDraftReplay,
  strategy: DraftReplayStrategy,
): CompletedDraftReplayResult => {
  const replay = materializeCompletedDraftReplay(fixture)
  let rosters = createRosters(fixture.settings.numTeams)
  let available = Object.values(replay.playerLib)
  const draftHistory: Array<string | null> = []
  const decisions: Array<{
    selected: Player
    higherRankedAtPosition: Player[]
  }> = []
  const durations: number[] = []

  ;[...fixture.actualPicks]
    .sort((left, right) => left.overallPick - right.overallPick)
    .forEach(recordedPick => {
      const advisorEligible =
        recordedPick.advisorEligible ?? recordedPick.playerId !== null
      if (!advisorEligible) {
        draftHistory[recordedPick.overallPick - 1] = null
        return
      }

      let selected: Player | undefined
      if (recordedPick.rosterIndex === fixture.targetRosterIndex) {
        const startedAt = performance.now()
        const ranks = playerRanksFor(
          available,
          replay.settings,
          replay.boardSettings,
        )
        if (strategy === "combined") {
          const context = createDraftAdvisorContext({
            settings: replay.settings,
            boardSettings: replay.boardSettings,
            currentPick: recordedPick.overallPick + 1,
            rosters,
            draftHistory,
            playerLib: replay.playerLib,
            playerRanks: ranks,
            upcomingPickCount: replay.settings.numTeams * 2 + 1,
          })
          const forecast = createOpponentForecast(context, {
            model: "combined",
            targetRosterIndex: fixture.targetRosterIndex,
          })
          selected = createDraftRecommendations({
            settings: replay.settings,
            boardSettings: replay.boardSettings,
            rankingSummaries: replay.rankingSummaries,
            playerRanks: ranks,
            playerLib: replay.playerLib,
            roster: rosters[fixture.targetRosterIndex],
            currentPick: recordedPick.overallPick,
            myPickNum: fixture.targetRosterIndex + 1,
            opponentForecast: forecast,
          }).candidates[0]?.player
        } else {
          selected = baselineSelection(
            strategy,
            available,
            rosters[fixture.targetRosterIndex],
            replay.settings,
            replay.boardSettings,
          )
        }
        durations.push(performance.now() - startedAt)
        if (selected) {
          const selectedRank = getPlayerMetrics(
            selected,
            replay.settings,
            replay.boardSettings,
          ).posRank
          decisions.push({
            selected,
            higherRankedAtPosition: available.filter(player =>
              player.position === selected?.position
              && getPlayerMetrics(
                player,
                replay.settings,
                replay.boardSettings,
              ).posRank < selectedRank),
          })
        }
      } else {
        if (!recordedPick.playerId) {
          draftHistory[recordedPick.overallPick - 1] = null
          return
        }
        selected = available.find(player =>
          player.id === recordedPick.playerId)
        if (!selected) {
          const recorded = replay.playerLib[recordedPick.playerId]
          selected = available
            .filter(player => player.position === recorded?.position)
            .sort((left, right) =>
              (getPlayerMetrics(
                left,
                replay.settings,
                replay.boardSettings,
              ).adp ?? Number.MAX_SAFE_INTEGER)
              - (getPlayerMetrics(
                right,
                replay.settings,
                replay.boardSettings,
              ).adp ?? Number.MAX_SAFE_INTEGER))[0]
        }
      }

      if (!selected) {
        draftHistory[recordedPick.overallPick - 1] = null
        return
      }
      rosters = addToRoster(rosters, selected, recordedPick.rosterIndex)
      available = available.filter(player => player.id !== selected?.id)
      draftHistory[recordedPick.overallPick - 1] = selected.id
    })

  const roster = rosters[fixture.targetRosterIndex]
  return {
    schemaVersion: 1,
    fixtureId: fixture.id,
    strategy,
    selectedPlayerIds: [...roster.picks],
    roster,
    quality: scoreRoster(roster, replay),
    positionalRankViolations: decisions.reduce(
      (count, decision) =>
        count + decision.higherRankedAtPosition.length,
      0,
    ),
    decisionLatencyP95Ms: percentile95(durations),
  }
}
