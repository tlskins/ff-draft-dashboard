import React, { useCallback, useState, useEffect } from 'react'
import { Player, FantasySettings, BoardSettings, PlayerTarget } from '../../types'
import { getPlayerAdp, getRoundIdxForPickNum, getRoundNumForPickNum, PlayerRanks } from '../../behavior/draft'
import { useADPView, PositionFilter } from '../../behavior/hooks/useADPView'
import MobileViewFooter from '../MobileViewFooter'
import TargetsColumn from '../shared/TargetsColumn'
import ADPPlayerCard from '../shared/ADPPlayerCard'
import HorizontalTargetBars from '../shared/HorizontalTargetBars'

interface PlayersByRoundViewProps {
  playerRanks: PlayerRanks
  fantasySettings: FantasySettings
  boardSettings: BoardSettings
  viewPlayerId: string | null
  myPicks: number[]
  currPick: number
  setViewPlayerId: (id: string | null) => void
  playerTargets: PlayerTarget[]
  playerLib: { [key: string]: Player }
  addPlayerTarget: (player: Player, targetAsEarlyAsRound: number) => void
  replacePlayerTargets: (targets: PlayerTarget[]) => void
  removePlayerTarget: (playerId: string) => void
  removePlayerTargets: (playerIds: string[]) => void
  positionFilter: PositionFilter
  setPositionFilter: (filter: PositionFilter) => void
  onSwitchToTargetsView: () => void
}

const PlayersByRoundView: React.FC<PlayersByRoundViewProps> = ({
  playerRanks,
  fantasySettings,
  boardSettings,
  viewPlayerId,
  myPicks,
  currPick,
  setViewPlayerId,
  playerTargets,
  playerLib,
  addPlayerTarget,
  replacePlayerTargets,
  removePlayerTarget,
  removePlayerTargets,
  positionFilter,
  setPositionFilter,
  onSwitchToTargetsView,
}) => {
  const {
    currentPage,
    totalPages,
    startRound,
    endRound,
    roundsToShow,
    playersByRound,
    organizedTargets,
    handlePrevPage,
    handleNextPage,
    handleSaveFavorites,
    handleLoadFavorites,
    handleClearFavorites,
  } = useADPView({ playerRanks, fantasySettings, boardSettings, myPicks, playerTargets, playerLib, replacePlayerTargets, removePlayerTargets })
  
  const [isMobileTargetsOpen, setIsMobileTargetsOpen] = useState(false)
  const [isMobilePositionOpen, setIsMobilePositionOpen] = useState(false)
  const [movingPlayerId, setMovingPlayerId] = useState<string | null>(null)
  
  // Helper function to check if we should advance to next page
  const checkAutoAdvance = useCallback(() => {
    if (currentPage >= totalPages - 1) return // Don't advance if we're on the last page
    
    // Find the user's next pick in the earliest visible round (startRound)
    const myPicksInStartRound = myPicks.filter(pick => {
      const pickRound = getRoundIdxForPickNum(pick, fantasySettings.numTeams) + 1
      return pickRound === startRound
    })
    
    if (myPicksInStartRound.length > 0) {
      const earliestPickInStartRound = Math.min(...myPicksInStartRound)
      
      // Check if currPick has passed this pick (meaning user just made their pick)
      if (currPick > earliestPickInStartRound) {
        // Advance to next page to show upcoming rounds
        handleNextPage()
      }
    }
  }, [currentPage, totalPages, myPicks, fantasySettings.numTeams, startRound, currPick, handleNextPage])

  // Auto-navigation: advance to next page when currPick passes user's next pick in earliest visible round
  useEffect(() => {
    checkAutoAdvance()
  }, [currPick])
  
  const getRoundCount = useCallback((round: number) => {
    return (playersByRound[round] || []).filter( (player, playerIdx) => {
      if ( playerIdx >= fantasySettings.numTeams ) {
        return false
      }
      const adp = getPlayerAdp(player, fantasySettings, boardSettings)
      const adpRound = getRoundNumForPickNum(adp, fantasySettings.numTeams)
      return adpRound === round
    }).length
  }, [fantasySettings, boardSettings, playersByRound])

  const handleMovePlayerToRound = useCallback((playerId: string, round: number) => {
    const updatedTargets = playerTargets.map(target => 
      target.playerId === playerId 
        ? { ...target, targetAsEarlyAsRound: round }
        : target
    )
    replacePlayerTargets(updatedTargets)
    setMovingPlayerId(null) // Exit move mode
  }, [playerTargets, replacePlayerTargets])

  return (
    <>
      {/* Desktop Header - Hidden on mobile */}
      <div className="mb-4 hidden md:block flex-shrink-0">
        <div className="flex justify-between items-center mb-2">
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
      </div>

      {/* Mobile Header - Simplified */}
      <div className="mb-4 md:hidden flex-shrink-0">
        <div className="flex justify-between items-center mb-2">
          <button
            onClick={handlePrevPage}
            disabled={currentPage === 0}
            className={`px-3 py-2 text-sm rounded ${
              currentPage === 0
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-blue-500 text-white hover:bg-blue-600'
            }`}
          >
            ← Prev
          </button>
          <h2 className="text-lg font-semibold text-gray-800 text-center">
            Rounds {startRound}-{endRound}
            {positionFilter !== 'All' && ` - ${positionFilter}`}
          </h2>
          <button
            onClick={handleNextPage}
            disabled={currentPage === totalPages - 1}
            className={`px-3 py-2 text-sm rounded ${
              currentPage === totalPages - 1
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-blue-500 text-white hover:bg-blue-600'
            }`}
          >
            Next →
          </button>
        </div>
      </div>
      
      {/* Horizontal Target Bars */}
      <div className={`grid gap-2 min-w-full ${roundsToShow.length === 3 ? 'grid-cols-4' : 'grid-cols-5'}`}>
        {/* Empty space for targets column */}
        <div></div>
        
        {/* Horizontal target bars spanning round columns */}
        <div className={`${roundsToShow.length === 3 ? 'col-span-3' : 'col-span-4'} relative`}>
          <HorizontalTargetBars
            playerTargets={playerTargets}
            playerLib={playerLib}
            fantasySettings={fantasySettings}
            boardSettings={boardSettings}
            roundsToShow={roundsToShow}
            availablePlayerIds={new Set(playerRanks.availPlayersByOverallRank.map(player => player.id))}
            setViewPlayerId={setViewPlayerId}
            positionFilter={positionFilter}
          />
        </div>
      </div>

      {/* Main Grid - Dynamic based on rounds */}
      <div 
        className={`grid gap-2 min-w-full mb-20 md:mb-4 ${roundsToShow.length === 3 ? 'grid-cols-4' : 'grid-cols-5'} overflow-hidden`}
        style={{ height: 'calc(100vh - 220px)' }}
      >
        {/* Player Targets Column */}
        <TargetsColumn
          playerTargets={playerTargets}
          organizedTargets={organizedTargets}
          fantasySettings={fantasySettings}
          boardSettings={boardSettings}
          viewPlayerId={viewPlayerId}
          setViewPlayerId={setViewPlayerId}
          removePlayerTarget={removePlayerTarget}
          positionFilter={positionFilter}
          movingPlayerId={movingPlayerId}
          setMovingPlayerId={setMovingPlayerId}
          handleMovePlayerToRound={handleMovePlayerToRound}
          handleSaveFavorites={handleSaveFavorites}
          handleLoadFavorites={handleLoadFavorites}
          handleClearFavorites={handleClearFavorites}
          onSwitchToTargetsView={onSwitchToTargetsView}
        />

        {/* Round Columns - Dynamic based on viewport */}
        {roundsToShow.map((round) => (
          <div key={round} className="flex flex-col min-w-0 overflow-hidden h-full">
            <div className="sticky top-0 bg-blue-100 border-b-2 border-blue-300 p-2 text-center flex-shrink-0">
              <h3 className="text-sm font-semibold text-blue-800">
                Round {round}
              </h3>
              <p className="text-xs text-blue-600">
                ({getRoundCount(round)} players)
              </p>
            </div>
            
            <div className="flex flex-col space-y-1 p-0.5 overflow-y-auto" style={{ height: 'calc(100% - 80px)' }}>
              {(() => {
                const roundPlayers = playersByRound[round] || []
                const firstTeamPlayers = roundPlayers.slice(0, fantasySettings.numTeams)
                const remainingPlayers = roundPlayers.slice(fantasySettings.numTeams)
                
                const renderPlayer = (player: any, idx: number) => {
                  const adp = getPlayerAdp(player, fantasySettings, boardSettings)
                  const adpRound = getRoundNumForPickNum(adp, fantasySettings.numTeams)
                  
                  // Use the round number for targeting
                  const userPickForRound = myPicks[round - 1] ? round : undefined // Only if user has a pick in this round
                  const playerTarget = playerTargets.find(target => target.playerId === player.id)
                  const isPlayerTargeted = !!playerTarget
                  
                  // Additional className for graying out players available next round
                  const additionalClassName = adpRound === round ? '' : 'bg-gray-100'
                  
                  return (
                    <ADPPlayerCard
                      key={`${player.id}-${round}-${idx}`}
                      player={player}
                      fantasySettings={fantasySettings}
                      boardSettings={boardSettings}
                      viewPlayerId={viewPlayerId}
                      setViewPlayerId={setViewPlayerId}
                      positionFilter={positionFilter}
                      isPlayerTargeted={isPlayerTargeted}
                      playerTarget={playerTarget}
                      userPickForRound={userPickForRound}
                      addPlayerTarget={addPlayerTarget}
                      removePlayerTarget={removePlayerTarget}
                      className={additionalClassName}
                    />
                  )
                }
                
                return (
                  <>
                    {firstTeamPlayers.length > 0 && (
                      <div className="border-2 border border-gray-400 rounded-lg p-1 space-y-1">
                        {firstTeamPlayers.map((player, idx) => renderPlayer(player, idx))}
                      </div>
                    )}
                    {remainingPlayers.map((player, idx) => renderPlayer(player, idx + fantasySettings.numTeams))}
                  </>
                )
              })()}
            </div>
          </div>
        ))}
      </div>

      {/* Mobile Footer */}
      <MobileViewFooter
        dropdowns={[
          {
            label: 'Targets',
            isOpen: isMobileTargetsOpen,
            onToggle: () => {
              setIsMobileTargetsOpen(!isMobileTargetsOpen)
              setIsMobilePositionOpen(false)
            },
            variant: 'purple',
            items: [
              {
                label: 'Save targets',
                onClick: () => {
                  handleSaveFavorites()
                  setIsMobileTargetsOpen(false)
                },
                disabled: playerTargets.length === 0
              },
              {
                label: 'Load targets',
                onClick: () => {
                  handleLoadFavorites()
                  setIsMobileTargetsOpen(false)
                }
              },
              {
                label: 'Clear targets',
                onClick: () => {
                  handleClearFavorites()
                  setIsMobileTargetsOpen(false)
                },
                disabled: playerTargets.length === 0
              },
              {
                label: 'Visualize targets',
                onClick: () => {
                  onSwitchToTargetsView()
                  setIsMobileTargetsOpen(false)
                },
                disabled: playerTargets.length === 0
              }
            ]
          },
          {
            label: positionFilter === 'All' ? 'All' : positionFilter,
            isOpen: isMobilePositionOpen,
            onToggle: () => {
              setIsMobilePositionOpen(!isMobilePositionOpen)
              setIsMobileTargetsOpen(false)
            },
            variant: 'primary',
            items: [
              {
                label: 'All Positions',
                onClick: () => {
                  setPositionFilter('All')
                  setIsMobilePositionOpen(false)
                },
                isSelected: positionFilter === 'All'
              },
              ...(['QB', 'RB', 'WR', 'TE'] as PositionFilter[]).map(pos => ({
                label: `${pos} Only`,
                onClick: () => {
                  setPositionFilter(pos)
                  setIsMobilePositionOpen(false)
                },
                isSelected: positionFilter === pos
              }))
            ]
          }
        ]}
        buttons={[
          {
            label: '←',
            onClick: () => {
              handlePrevPage()
              setIsMobileTargetsOpen(false)
              setIsMobilePositionOpen(false)
            },
            disabled: currentPage === 0,
            variant: 'secondary'
          },
          {
            label: '→',
            onClick: () => {
              handleNextPage()
              setIsMobileTargetsOpen(false)
              setIsMobilePositionOpen(false)
            },
            disabled: currentPage === totalPages - 1,
            variant: 'secondary'
          }
        ]}
        onClickOutside={() => {
          setIsMobileTargetsOpen(false)
          setIsMobilePositionOpen(false)
        }}
      />
    </>
  )
}

export default PlayersByRoundView 