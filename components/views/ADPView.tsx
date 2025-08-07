import React, { useMemo, useState, useEffect } from 'react'
import { Player, FantasySettings, BoardSettings } from '../../types'
import { getPlayerAdp, getPlayerMetrics, getRoundIdxForPickNum, PlayerRanks } from '../../behavior/draft'
import { getPosStyle, getTierStyle } from '../../behavior/styles'

let viewPlayerIdTimer: NodeJS.Timeout

interface ADPViewProps {
  playerRanks: PlayerRanks
  fantasySettings: FantasySettings
  boardSettings: BoardSettings
  viewPlayerId: string | null
  onSelectPlayer: (player: Player) => void
  setViewPlayerId: (id: string) => void
}

type PositionFilter = 'All' | 'QB' | 'RB' | 'WR' | 'TE'

const ADPView: React.FC<ADPViewProps> = ({
  playerRanks,
  fantasySettings,
  boardSettings,
  viewPlayerId,
  onSelectPlayer,
  setViewPlayerId,
}) => {
  const [currentPage, setCurrentPage] = useState(0) // 0-based page index
  const [positionFilter, setPositionFilter] = useState<PositionFilter>('All')
  
  const roundsPerPage = 4
  const totalPages = Math.ceil(14 / roundsPerPage) // 4 pages (rounds 1-4, 5-8, 9-12, 13-14)
  const startRound = currentPage * roundsPerPage + 1
  const endRound = Math.min(startRound + roundsPerPage - 1, 14)
  
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
        const adpRound = Math.floor((adp - 1) / fantasySettings.numTeams) + 1
        
        // Add player to all rounds from round 1 up to their ADP round (since they should be available until drafted)
        for (let round = 1; round <= Math.min(adpRound, numRounds); round++) {
          rounds[round].push(player)
        }
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
  }, [playerRanks.availPlayersByAdp, fantasySettings, boardSettings, positionFilter])

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

  return (
    <div className="h-screen overflow-y-scroll bg-white p-4">
      <div className="mb-4">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-lg font-semibold text-gray-800">
            Available By Round Sorted By Rank
            {positionFilter !== 'All' && ` - ${positionFilter} Only`}
          </h2>
          <div className="flex items-center space-x-2">
            <select
              value={positionFilter}
              onChange={(e) => setPositionFilter(e.target.value as PositionFilter)}
              className="px-2 py-1 text-sm border border-gray-300 rounded bg-white text-gray-700 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="All">All Positions</option>
              <option value="QB">QB Only</option>
              <option value="RB">RB Only</option>
              <option value="WR">WR Only</option>
              <option value="TE">TE Only</option>
            </select>
            <button
              onClick={handlePrevPage}
              disabled={currentPage === 0}
              className={`px-3 py-1 text-sm rounded ${
                currentPage === 0
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-500 text-white hover:bg-blue-600'
              }`}
            >
              ← Prev
            </button>
            <span className="text-sm text-gray-600 px-2">
              Rounds {startRound}-{endRound}
            </span>
            <button
              onClick={handleNextPage}
              disabled={currentPage === totalPages - 1}
              className={`px-3 py-1 text-sm rounded ${
                currentPage === totalPages - 1
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-500 text-white hover:bg-blue-600'
              }`}
            >
              Next →
            </button>
          </div>
        </div>
        <div className="flex flex-col text-left">
          <p className="text-sm text-gray-600">
            Grayed out players you can still get in the next round
          </p>
          <p className="text-sm text-gray-600">
            Shows players available in each round based on their Average Draft Position
            {positionFilter !== 'All' && ` (filtered to ${positionFilter} players only)`}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Use ← → arrow keys or buttons to navigate between round groups
          </p>
        </div>
      </div>
      
      <div className="grid grid-cols-4 gap-2 min-w-full">
        {Array.from({ length: endRound - startRound + 1 }, (_, i) => startRound + i).map(round => (
          <div key={round} className="flex flex-col min-w-0">
            <div className="sticky top-0 bg-blue-100 border-b-2 border-blue-300 p-2 text-center">
              <h3 className="text-sm font-semibold text-blue-800">
                Round {round}
              </h3>
              <p className="text-xs text-blue-600">
                ({playersByRound[round]?.length || 0} players)
              </p>
            </div>
            
            <div className="flex flex-col space-y-1 p-2">
              {playersByRound[round]?.map((player, idx) => {
                const adp = getPlayerAdp(player, fantasySettings, boardSettings)
                const posStyle = getPosStyle(player.position)
                const adpRound = getRoundIdxForPickNum(adp, fantasySettings.numTeams) + 1
                const metrics = getPlayerMetrics(player, fantasySettings, boardSettings)
                const { tier } = metrics
                const { tierNumber } = tier || {}
                const tierStyle = getTierStyle(tierNumber)

                const isHoveringPlayer = viewPlayerId === player.id
                const cardBorderStyle = isHoveringPlayer ? 'border border-4 border-indigo-500' : 'border'
                const defaultCardBgStyle = positionFilter === 'All' ? posStyle : tierStyle
                const bgColor = isHoveringPlayer ? 'bg-yellow-300' : (adpRound === round ? defaultCardBgStyle : 'bg-gray-100')
                
                return (
                  <div
                    key={`${player.id}-${round}-${idx}`}
                    className={`p-2 rounded shadow-sm cursor-pointer transition-colors ${bgColor} ${cardBorderStyle}`}
                    onClick={() => onSelectPlayer(player)}
                    onMouseEnter={() => {
                      if (viewPlayerIdTimer) {
                        clearTimeout(viewPlayerIdTimer)
                      }
                      viewPlayerIdTimer = setTimeout(() => {
                        setViewPlayerId(player.id)
                      }, 250)
                    }}
                    onMouseLeave={() => {
                      if (viewPlayerIdTimer) {
                        clearTimeout(viewPlayerIdTimer)
                      }
                    }}
                  >
                    <div className="flex flex-col text-center items-center">
                      <p className="text-xs font-semibold truncate w-full">
                        {player.fullName}
                      </p>
                      <p className="text-xs text-gray-600">
                        {player.position} - {player.team}
                      </p>
                      <p className="text-xs text-gray-500">
                        ADP: {adp.toFixed(1)}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default ADPView 