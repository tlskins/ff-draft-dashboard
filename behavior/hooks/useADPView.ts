import { useMemo, useState, useEffect } from 'react'
import { Player, FantasySettings, BoardSettings, PlayerTarget } from '../../types'
import { getPlayerAdp, getPlayerMetrics, PlayerRanks, getRoundIdxForPickNum } from '../draft'

export type PositionFilter = 'All' | 'QB' | 'RB' | 'WR' | 'TE'

interface UseADPViewProps {
  playerRanks: PlayerRanks
  fantasySettings: FantasySettings
  boardSettings: BoardSettings
  myPicks: number[]
  playerTargets: PlayerTarget[]
  playerLib: { [key: string]: Player }
}

export const useADPView = ({ playerRanks, fantasySettings, boardSettings, myPicks, playerTargets, playerLib }: UseADPViewProps) => {
  const [currentPage, setCurrentPage] = useState(0) // 0-based page index
  const [positionFilter, setPositionFilter] = useState<PositionFilter>('All')
  
  const roundsPerPage = 4
  const totalPages = 14 - roundsPerPage + 1 // 12 pages (rounds 1-3, 2-4, ..., 12-14)
  const startRound = currentPage + 1
  const endRound = Math.min(startRound + roundsPerPage - 1, 14)
  
  // Organize player targets by round with dividers
  const organizedTargets = useMemo(() => {
    // Get target players and sort by ADP
    const targetPlayers = playerTargets
      .map(target => playerLib[target.playerId])
      .filter(player => player) // Filter out any missing players
      .sort((a, b) => {
        const adpA = getPlayerAdp(a, fantasySettings, boardSettings)
        const adpB = getPlayerAdp(b, fantasySettings, boardSettings)
        return adpA - adpB
      })

    // Create sections with dividers based on myPicks
    const sections: Array<{ type: 'divider', round: number, pick: number } | { type: 'player', player: Player, target: PlayerTarget }> = []
    
    let currentPickIndex = 0
    
    targetPlayers.forEach(player => {
      const adp = getPlayerAdp(player, fantasySettings, boardSettings)
      const target = playerTargets.find(t => t.playerId === player.id)!
      
      // Add dividers for any picks that come before this player's ADP
      while (currentPickIndex < myPicks.length && myPicks[currentPickIndex] <= adp) {
        const pick = myPicks[currentPickIndex]
        const round = getRoundIdxForPickNum(pick, fantasySettings.numTeams) + 1
        sections.push({ type: 'divider', round, pick })
        currentPickIndex++
      }
      
      // Add the player
      sections.push({ type: 'player', player, target })
    })
    
    // Add any remaining dividers for later picks
    while (currentPickIndex < myPicks.length) {
      const pick = myPicks[currentPickIndex]
      const round = getRoundIdxForPickNum(pick, fantasySettings.numTeams) + 1
      sections.push({ type: 'divider', round, pick })
      currentPickIndex++
    }
    
    return sections
  }, [playerTargets, playerLib, fantasySettings, boardSettings, myPicks])

  const playersByRound = useMemo(() => {
    const availablePlayers = playerRanks.availPlayersByAdp
    const numRounds = 14
    const rounds: { [round: number]: Player[] } = {}
    
    // Initialize rounds 1-14
    for (let round = 1; round <= numRounds; round++) {
      rounds[round] = []
    }
    
    // Filter players by position if a specific position is selected
    const filteredPlayers = positionFilter === 'All' 
      ? availablePlayers 
      : availablePlayers.filter(player => player.position === positionFilter)
    
    // Organize filtered players by ADP rounds
    filteredPlayers.forEach(player => {
      const adp = getPlayerAdp(player, fantasySettings, boardSettings)
      
      // Only include players with valid ADP data
      if (adp && adp < 999) {
        myPicks.forEach((myPick, pickIdx) => {
          if (adp >= myPick) {
            const myPickRound = pickIdx + 1
            rounds[myPickRound].push(player)
          }
        })
      }
    })
    
    // Sort players within each round by ADP
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
  }, [playerRanks.availPlayersByAdp, fantasySettings, boardSettings, positionFilter, myPicks])

  const handlePrevPage = () => {
    setCurrentPage(Math.max(0, currentPage - 1))
  }
  
  const handleNextPage = () => {
    setCurrentPage(Math.min(totalPages - 1, currentPage + 1))
  }

  // Keyboard navigation
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      // Only handle if no input is focused
      if (document.activeElement?.tagName === 'INPUT') return
      
      if (event.key === 'ArrowLeft' && currentPage > 0) {
        event.preventDefault()
        handlePrevPage()
      } else if (event.key === 'ArrowRight' && currentPage < totalPages - 1) {
        event.preventDefault()
        handleNextPage()
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [currentPage, totalPages])

  return {
    // State
    currentPage,
    positionFilter,
    setPositionFilter,
    
    // Computed values
    roundsPerPage,
    totalPages,
    startRound,
    endRound,
    playersByRound,
    organizedTargets,
    
    // Functions
    handlePrevPage,
    handleNextPage,
  }
} 