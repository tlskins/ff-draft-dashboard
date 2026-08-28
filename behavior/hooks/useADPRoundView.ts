import { useMemo } from 'react'
import { Player, FantasySettings, BoardSettings, FantasyPosition } from '../../types'
import { getPlayerAdp, getPlayerMetrics, PlayerRanks, getRoundNumForPickNum } from '../draft'
import { PositionFilter } from './useADPView'

interface UseADPRoundViewProps {
  playerRanks: PlayerRanks
  fantasySettings: FantasySettings
  boardSettings: BoardSettings
  positionFilter: PositionFilter
  roundsToShow: number[]
}

interface OrganizePlayersByADPRoundProps extends Omit<UseADPRoundViewProps, 'playerRanks'> {
  availablePlayers: Player[]
}

/**
 * Place ranked, available players into the round implied by the configured ADP
 * source. ADP is an average pick, so round buckets are not expected to contain
 * exactly `numTeams` players. Rounding to the nearest legal pick keeps the
 * bucket consistent with the round/pick label rendered on player cards.
 */
export const organizePlayersByADPRound = ({
  availablePlayers,
  fantasySettings,
  boardSettings,
  positionFilter,
  roundsToShow,
}: OrganizePlayersByADPRoundProps): {[round: number]: Player[]} => {
  const rounds: {[round: number]: Player[]} = {}
  roundsToShow.forEach(round => {
    rounds[round] = []
  })

  const filteredPlayers = positionFilter === 'All'
    ? availablePlayers
    : availablePlayers.filter(player => player.position === positionFilter as FantasyPosition)

  filteredPlayers.forEach(player => {
    const metrics = getPlayerMetrics(player, fantasySettings, boardSettings)
    // This is a rankings view: a standalone ADP does not make an unranked
    // player eligible. Positional-only ranking sources remain supported.
    const isRanked = metrics.overallRank != null || metrics.overallOrPosRank != null
    const adp = getPlayerAdp(player, fantasySettings, boardSettings)
    if (!isRanked || !Number.isFinite(adp) || adp >= 999) return

    const nearestOverallPick = Math.max(1, Math.round(adp))
    const adpRound = getRoundNumForPickNum(nearestOverallPick, fantasySettings.numTeams)
    if (rounds[adpRound] !== undefined) rounds[adpRound].push(player)
  })

  Object.keys(rounds).forEach(round => {
    rounds[Number(round)].sort((a, b) => {
      const metricsA = getPlayerMetrics(a, fantasySettings, boardSettings)
      const metricsB = getPlayerMetrics(b, fantasySettings, boardSettings)
      const rankA = metricsA.overallRank ?? metricsA.overallOrPosRank ?? 9999
      const rankB = metricsB.overallRank ?? metricsB.overallOrPosRank ?? 9999
      return rankA - rankB
    })
  })

  return rounds
}

export const getLastRankedADPRound = (
  availablePlayers: Player[],
  fantasySettings: FantasySettings,
  boardSettings: BoardSettings,
  minimumRound = 14,
): number => {
  const occupiedRounds = availablePlayers.flatMap(player => {
    const metrics = getPlayerMetrics(player, fantasySettings, boardSettings)
    const isRanked = metrics.overallRank != null || metrics.overallOrPosRank != null
    const adp = getPlayerAdp(player, fantasySettings, boardSettings)
    if (!isRanked || !Number.isFinite(adp) || adp >= 999) return []
    return [getRoundNumForPickNum(
      Math.max(1, Math.round(adp)),
      fantasySettings.numTeams,
    )]
  })
  return Math.max(minimumRound, ...occupiedRounds)
}

export const useADPRoundView = ({
  playerRanks,
  fantasySettings,
  boardSettings,
  positionFilter,
  roundsToShow,
}: UseADPRoundViewProps) => {
  // Organize players by their expected ADP round, sorted by overall rank
  const playersByADPRound = useMemo(() => {
    return organizePlayersByADPRound({
      availablePlayers: playerRanks.availPlayersByOverallRank,
      fantasySettings,
      boardSettings,
      positionFilter,
      roundsToShow,
    })
  }, [playerRanks.availPlayersByOverallRank, fantasySettings, boardSettings, positionFilter, roundsToShow])

  // Get count of players expected to be drafted in each round
  const getRoundCount = (round: number) => {
    return (playersByADPRound[round] || []).length
  }

  return {
    playersByADPRound,
    getRoundCount,
  }
}

export default useADPRoundView
