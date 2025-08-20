import React, { useState, useCallback } from 'react'
import { Player, FantasySettings, BoardSettings, PlayerTarget } from '../../types'
import { PlayerRanks } from '../../behavior/draft'
import { PositionFilter, useADPView } from '../../behavior/hooks/useADPView'
import { useADPRoundView } from '../../behavior/hooks/useADPRoundView'
import MobileViewFooter from '../MobileViewFooter'
import TargetsColumn from '../shared/TargetsColumn'
import ADPPlayerCard from '../shared/ADPPlayerCard'
import HorizontalTargetBars from '../shared/HorizontalTargetBars'

interface PlayersByADPRoundViewProps {
  playerRanks: PlayerRanks
  fantasySettings: FantasySettings
  boardSettings: BoardSettings
  viewPlayerId: string | null
  myPicks: number[]
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

const PlayersByADPRoundView: React.FC<PlayersByADPRoundViewProps> = ({
  playerRanks,
  fantasySettings,
  boardSettings,
  viewPlayerId,
  myPicks,
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
  // Use the shared ADP view hook for navigation and targets organization
  const {
    currentPage,
    totalPages,
    startRound,
    endRound,
    roundsToShow,
    organizedTargets,
    handlePrevPage,
    handleNextPage,
    handleSaveFavorites,
    handleLoadFavorites,
    handleClearFavorites,
  } = useADPView({ 
    playerRanks, 
    fantasySettings, 
    boardSettings, 
    myPicks, 
    playerTargets, 
    playerLib, 
    replacePlayerTargets, 
    removePlayerTargets,
    positionFilter
  })

  // Use the new ADP round view hook for organizing players by ADP round
  const { playersByADPRound, getRoundCount } = useADPRoundView({
    playerRanks,
    fantasySettings,
    boardSettings,
    positionFilter,
    roundsToShow,
  })
  
  const [isMobileTargetsOpen, setIsMobileTargetsOpen] = useState(false)
  const [isMobilePositionOpen, setIsMobilePositionOpen] = useState(false)
  const [movingPlayerId, setMovingPlayerId] = useState<string | null>(null)
  
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
            ADP Rounds {startRound}-{endRound}
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
            <div className="sticky top-0 bg-green-100 border-b-2 border-green-300 p-2 text-center flex-shrink-0">
              <h3 className="text-sm font-semibold text-green-800">
                ADP Round {round}
              </h3>
              <p className="text-xs text-green-600">
                ({getRoundCount(round)} players)
              </p>
            </div>
            
            <div className="flex flex-col space-y-1 p-0.5 overflow-y-auto" style={{ height: 'calc(100% - 80px)' }}>
              {(playersByADPRound[round] || []).map((player, idx) => {
                // Use the round number for targeting
                const userPickForRound = myPicks[round - 1] ? round : undefined // Only if user has a pick in this round
                const playerTarget = playerTargets.find(target => target.playerId === player.id)
                const isPlayerTargeted = !!playerTarget
                
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
                     showAdpRound={true}
                   />
                 )
              })}
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

export default PlayersByADPRoundView 