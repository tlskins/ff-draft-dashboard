import {
  BoardSettings,
  FantasyPosition,
  FantasySettings,
  Player,
} from "types"
import {
  getPlayerMetrics,
  PlayerLibrary,
  PlayerRanks,
  Roster,
} from "../draft"
import { DraftAdvisorContext, UpcomingDraftSlot } from "./types"

interface CreateDraftAdvisorContextParams {
  settings: FantasySettings
  boardSettings: BoardSettings
  currentPick: number
  rosters: Roster[]
  draftHistory: Array<string | null>
  playerLib: PlayerLibrary
  playerRanks: PlayerRanks
  upcomingPickCount?: number
  availablePlayerLimit?: number
  totalDraftPicks?: number
}

type StarterPosition =
  | FantasyPosition.QUARTERBACK
  | FantasyPosition.RUNNING_BACK
  | FantasyPosition.WIDE_RECEIVER
  | FantasyPosition.TIGHT_END

const starterRequirements = (
  settings: FantasySettings,
): Array<[StarterPosition, number]> => ([
  [FantasyPosition.QUARTERBACK, settings.numStartingQbs],
  [FantasyPosition.RUNNING_BACK, settings.numStartingRbs],
  [FantasyPosition.WIDE_RECEIVER, settings.numStartingWrs],
  [FantasyPosition.TIGHT_END, settings.numStartingTes],
])

const rosterIndexForPick = (overallPick: number, numTeams: number): number => {
  const roundIndex = Math.floor((overallPick - 1) / numTeams)
  const pickInRound = (overallPick - 1) % numTeams
  return roundIndex % 2 === 0
    ? pickInRound
    : numTeams - pickInRound - 1
}

const createUpcomingSlots = (
  currentPick: number,
  numTeams: number,
  count: number,
): UpcomingDraftSlot[] =>
  Array.from({ length: count }, (_, index) => {
    const overallPick = currentPick + index
    return {
      overallPick,
      rosterIndex: rosterIndexForPick(overallPick, numTeams),
    }
  })

const uniqueAvailablePlayers = (playerRanks: PlayerRanks): Player[] => {
  const players = new Map<string, Player>()
  playerRanks.availPlayersByAdp.forEach((player) => players.set(player.id, player))
  playerRanks.availPlayersByOverallRank.forEach(
    (player) => players.set(player.id, player),
  )
  return Array.from(players.values())
}

export const createDraftAdvisorContext = ({
  settings,
  boardSettings,
  currentPick,
  rosters,
  draftHistory,
  playerLib,
  playerRanks,
  upcomingPickCount = 6,
  availablePlayerLimit = 60,
  totalDraftPicks,
}: CreateDraftAdvisorContextParams): DraftAdvisorContext => {
  const requirements = starterRequirements(settings)

  return {
    schemaVersion: 1,
    league: {
      numTeams: settings.numTeams,
      ppr: settings.ppr,
    },
    rosterFormat: {
      startingQbs: settings.numStartingQbs,
      startingRbs: settings.numStartingRbs,
      startingWrs: settings.numStartingWrs,
      startingTes: settings.numStartingTes,
      flex: settings.numFlex,
      bench: settings.numBenchPlayers,
    },
    currentPick,
    ...(Number.isInteger(totalDraftPicks) && totalDraftPicks! > 0
      ? { totalDraftPicks }
      : {}),
    upcomingSlots: createUpcomingSlots(
      currentPick,
      settings.numTeams,
      upcomingPickCount,
    ),
    teams: rosters.map((roster, rosterIndex) => ({
      rosterIndex,
      draftedPlayerIds: [...roster.picks],
      draftedPositionCounts: requirements.map(([position]) => ({
        position,
        count: roster[position].length,
      })),
      needs: requirements.map(([position, required]) => ({
        position,
        openStarterSpots: Math.max(
          0,
          required - roster[position].length,
        ),
      })),
    })),
    availablePlayers: uniqueAvailablePlayers(playerRanks)
      .map((player) => {
        const metrics = getPlayerMetrics(player, settings, boardSettings)
        return {
          id: player.id,
          name: player.fullName,
          position: player.position,
          team: player.team,
          adp: metrics.adp ?? null,
          positionRank: metrics.posRank,
          userTier: metrics.tier?.tierNumber ?? null,
        }
      })
      .sort(
        (left, right) =>
          (left.adp ?? Number.MAX_SAFE_INTEGER) -
          (right.adp ?? Number.MAX_SAFE_INTEGER),
      )
      .slice(0, availablePlayerLimit),
    recentPicks: draftHistory
      .map((playerId, index) => {
        const player = playerId ? playerLib[playerId] : undefined
        return player
          ? {
              overallPick: index + 1,
              playerId: player.id,
              name: player.fullName,
              position: player.position,
              team: player.team,
            }
          : null
      })
      .filter((pick): pick is NonNullable<typeof pick> => pick !== null)
      .slice(-24),
  }
}
