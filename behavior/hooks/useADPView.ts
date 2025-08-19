import { useMemo, useState, useEffect, useCallback } from 'react'
import { toast } from 'react-toastify'
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
  replacePlayerTargets: (targets: PlayerTarget[]) => void
  removePlayerTargets: (playerIds: string[]) => void
}

export const useADPView = ({
  playerRanks,
  fantasySettings,
  boardSettings,
  myPicks,
  playerTargets,
  playerLib,
  replacePlayerTargets,
  removePlayerTargets,
}: UseADPViewProps) => {
  const [currentPage, setCurrentPage] = useState(0) // 0-based page index
  const [positionFilter, setPositionFilter] = useState<PositionFilter>('All')
  const [isMobile, setIsMobile] = useState(false)
  const [hasAttemptedAutoLoad, setHasAttemptedAutoLoad] = useState(false)
  
  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768) // Tailwind's md breakpoint
    }
    
    checkMobile() // Initial check
    window.addEventListener('resize', checkMobile)
    
    return () => window.removeEventListener('resize', checkMobile)
  }, [])
  
  const roundsPerPage = isMobile ? 3 : 4
  const totalPages = 14 - roundsPerPage + 1 // Dynamic based on mobile/desktop
  const startRound = currentPage + 1
  const endRound = Math.min(startRound + roundsPerPage - 1, 14)
  
  // Calculate rounds to show
  const roundsToShow = useMemo(() => {
    return Array.from({ length: endRound - startRound + 1 }, (_, i) => startRound + i)
  }, [startRound, endRound])
  
  // Organize player targets by round with dividers
  const organizedTargets = useMemo(() => {
    const targetPlayersMap = playerTargets.reduce((acc, target) => {
      acc[target.playerId] = target
      return acc
    }, {} as { [key: string]: PlayerTarget })

    // Create a set of available player IDs for fast lookup
    const availablePlayerIds = new Set(playerRanks.availPlayersByOverallRank.map(player => player.id))

    // Get target players and sort by ADP, only including available players
    const targetPlayers = playerTargets
      .map(target => playerLib[target.playerId])
      .filter(player => player && availablePlayerIds.has(player.id)) // Filter out missing players and drafted players
      .sort((a, b) => {
        const adpA = getPlayerAdp(a, fantasySettings, boardSettings)
        const adpB = getPlayerAdp(b, fantasySettings, boardSettings)
        return adpA - adpB
      })

    // Create sections with dividers based on myPicks
    const sections: Array<{ type: 'divider', round: number, pick: number } | { type: 'player', player: Player, target: PlayerTarget }> = []
    
    let currentPickIndex = 0
    
    targetPlayers.forEach(player => {
      const targetRound = targetPlayersMap[player.id].targetAsEarlyAsRound
      const target = playerTargets.find(t => t.playerId === player.id)!
      
      // Add dividers for any picks that come before this player's target round
      while (currentPickIndex < myPicks.length) {
        const pick = myPicks[currentPickIndex]
        const pickRound = getRoundIdxForPickNum(pick, fantasySettings.numTeams) + 1
        if (pickRound > targetRound) break
        const round = pickRound
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
  }, [playerTargets, playerLib, fantasySettings, boardSettings, myPicks, playerRanks])

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
    
    // Sort players within each round by overall rank
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

  // Favorites management functions
  const handleSaveFavorites = () => {
    try {
      localStorage.setItem('ff-draft-favorites', JSON.stringify(playerTargets))
      toast.success('Targets saved successfully!')
    } catch (error) {
      toast.error('Failed to save targets')
    }
  }

  const handleLoadFavorites = useCallback(() => {
    try {
      const savedFavorites = localStorage.getItem('ff-draft-favorites')
      if (savedFavorites) {
        const savedTargets = JSON.parse(savedFavorites) as PlayerTarget[]
        if (Array.isArray(savedTargets) && savedTargets.length > 0) {
          const newTargets = savedTargets.filter( target => {
            const player = playerLib[target.playerId]
            return Boolean(player)
          })
          replacePlayerTargets(newTargets)
        } else {
          toast.info('No saved favorites found')
        }
      } else {
        toast.info('No saved favorites found')
      }
    } catch (error) {
      toast.error('Failed to load favorites')
    }
  }, [playerLib, replacePlayerTargets])

  // Auto-load favorites when playerLib is available (only once)
  useEffect(() => {
    // Only auto-load if we haven't tried yet and playerLib has data
    if (!hasAttemptedAutoLoad && Object.keys(playerLib).length > 0) {
      setHasAttemptedAutoLoad(true)
      try {
        const savedFavorites = localStorage.getItem('ff-draft-favorites')
        if (savedFavorites) {
          const savedTargets = JSON.parse(savedFavorites) as PlayerTarget[]
          if (Array.isArray(savedTargets) && savedTargets.length > 0) {
            const newTargets = savedTargets.filter( target => {
              const player = playerLib[target.playerId]
              return Boolean(player)
            })
            if (newTargets.length > 0) {
              replacePlayerTargets(newTargets)
            }
          }
        }
      } catch (error) {
        // Silently ignore errors during auto-load
      }
    }
  }, [hasAttemptedAutoLoad, playerLib, replacePlayerTargets])

  const handleClearFavorites = () => {
    if (confirm('Are you sure you want to clear all player targets?')) {
      const playerIds = playerTargets.map(target => target.playerId)
      removePlayerTargets(playerIds)
      try {
        localStorage.removeItem('ff-draft-favorites')
      } catch (error) {
        // Ignore localStorage errors on clear
      }
    }
  }

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
    roundsToShow,
    playersByRound,
    organizedTargets,
    
    // Functions
    handlePrevPage,
    handleNextPage,
    handleSaveFavorites,
    handleLoadFavorites,
    handleClearFavorites,
  }
} 