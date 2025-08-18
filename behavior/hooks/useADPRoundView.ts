import { useMemo } from 'react'
import { Player, FantasySettings, BoardSettings } from '../../types'
import { getPlayerAdp, getPlayerMetrics, PlayerRanks, getRoundNumForPickNum } from '../draft'
import { PositionFilter } from './useADPView'

interface UseADPRoundViewProps {
  playerRanks: PlayerRanks
  fantasySettings: FantasySettings
  boardSettings: BoardSettings
  positionFilter: PositionFilter
  roundsToShow: number[]
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
    const availablePlayers = playerRanks.availPlayersByOverallRank
    const rounds: { [round: number]: Player[] } = {}
    
    // Initialize rounds
    roundsToShow.forEach(round => {
      rounds[round] = []
    })
    
    // Filter players by position if a specific position is selected
    const filteredPlayers = positionFilter === 'All' 
      ? availablePlayers 
      : availablePlayers.filter(player => player.position === positionFilter)
    
    // Organize filtered players by their ADP round
    filteredPlayers.forEach(player => {
      const adp = getPlayerAdp(player, fantasySettings, boardSettings)
      
      // Only include players with valid ADP data
      if (adp && adp < 999) {
        const adpRound = getRoundNumForPickNum(adp, fantasySettings.numTeams)
        
        // Only include players whose ADP round is in our visible rounds
        if (rounds[adpRound] !== undefined) {
          rounds[adpRound].push(player)
        }
      }
    })
    
    // Sort players within each round by overall rank (best ranked players first)
    Object.keys(rounds).forEach(round => {
      rounds[parseInt(round)].sort((a, b) => {
        const metricsA = getPlayerMetrics(a, fantasySettings, boardSettings)
        const metricsB = getPlayerMetrics(b, fantasySettings, boardSettings)
        const rankA = metricsA.overallRank || 999
        const rankB = metricsB.overallRank || 999
        return rankA - rankB
      })
    })
    
    return rounds
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