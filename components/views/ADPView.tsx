import React, { useCallback, useState } from 'react'
import { Player, FantasySettings, BoardSettings, PlayerTarget } from '../../types'
import { getPlayerAdp, getPlayerMetrics, getRoundIdxForPickNum, getRoundNumForPickNum, getPickInRoundForPickNum, PlayerRanks, getRoundAndPickShortText } from '../../behavior/draft'
import { getPosStyle, getTierStyle } from '../../behavior/styles'
import { useADPView, PositionFilter } from '../../behavior/hooks/useADPView'
import MobileViewFooter from '../MobileViewFooter'
import { playerShortName } from '../../behavior/presenters'

interface ADPViewProps {
  playerRanks: PlayerRanks
  fantasySettings: FantasySettings
  boardSettings: BoardSettings
  viewPlayerId: string | null
  myPicks: number[]
  onSelectPlayer: (player: Player) => void
  setViewPlayerId: (id: string) => void
  playerTargets: PlayerTarget[]
  playerLib: { [key: string]: Player }
  addPlayerTarget: (player: Player, targetAsEarlyAs: number) => void
  replacePlayerTargets: (targets: PlayerTarget[]) => void
  removePlayerTarget: (playerId: string) => void
  removePlayerTargets: (playerIds: string[]) => void
}

const ADPView: React.FC<ADPViewProps> = ({
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
}) => {
  const {
    currentPage,
    positionFilter,
    setPositionFilter,
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
  
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [isMobileTargetsOpen, setIsMobileTargetsOpen] = useState(false)
  const [isMobilePositionOpen, setIsMobilePositionOpen] = useState(false)
  const [movingPlayerId, setMovingPlayerId] = useState<string | null>(null)
  
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
    const newPickNumber = myPicks[round - 1] // round is 1-based, myPicks is 0-based
    if (newPickNumber) {
      const updatedTargets = playerTargets.map(target => 
        target.playerId === playerId 
          ? { ...target, targetAsEarlyAs: newPickNumber }
          : target
      )
      replacePlayerTargets(updatedTargets)
    }
    setMovingPlayerId(null) // Exit move mode
  }, [playerTargets, myPicks, replacePlayerTargets])



  return (
    <div className="h-screen bg-white p-2 w-full flex flex-col">
      {/* Desktop Header - Hidden on mobile */}
      <div className="mb-4 hidden md:block flex-shrink-0">
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

      {/* Mobile Header - Simplified */}
      <div className="mb-4 md:hidden flex-shrink-0">
        <h2 className="text-lg font-semibold text-gray-800 text-center">
          Rounds {startRound}-{endRound}
          {positionFilter !== 'All' && ` - ${positionFilter}`}
        </h2>
      </div>
      
      {/* Main Grid - Dynamic based on rounds */}
      <div className={`grid gap-2 min-w-full flex-1 mb-20 md:mb-4 ${roundsToShow.length === 3 ? 'grid-cols-4' : 'grid-cols-5'} overflow-hidden`}>
        {/* Player Targets Column */}
        <div className="flex flex-col min-w-0 overflow-hidden">
          <div className="sticky top-0 bg-yellow-300 border-b-2 border-purple-300 p-2 text-center flex-shrink-0">
            <h3 className="text-sm font-semibold text-purple-800">
              Targets
            </h3>
            <p className="text-xs text-purple-600">
              ({playerTargets.length} players)
            </p>
          </div>
          
          <div className="flex flex-col space-y-1 p-2 overflow-y-auto flex-1">
            {/* Desktop Manage Targets Dropdown */}
            <div className="relative mt-2 hidden md:block">
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="w-full px-2 py-1 text-xs text-purple-600 border border-2 border-purple-600 rounded hover:bg-purple-600 hover:text-white transition-colors flex justify-between items-center"
              >
                <span>Manage Targets</span>
                <span className={`transform transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`}>▼</span>
              </button>
              
              {isDropdownOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded shadow-lg z-10 font-semibold">
                  <button
                    onClick={() => {
                      handleSaveFavorites()
                      setIsDropdownOpen(false)
                    }}
                    className="w-full px-2 py-2 text-xs text-left font-medium text-green-600 hover:bg-green-600 hover:text-white transition-colors border-b border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={playerTargets.length === 0}
                  >
                    Save targets
                  </button>
                  <button
                    onClick={() => {
                      handleLoadFavorites()
                      setIsDropdownOpen(false)
                    }}
                    className="w-full px-2 py-2 text-xs text-left font-medium text-blue-600 hover:bg-blue-600 hover:text-white transition-colors border-b border-gray-200"
                  >
                    Load targets
                  </button>
                  <button
                    onClick={() => {
                      handleClearFavorites()
                      setIsDropdownOpen(false)
                    }}
                    className="w-full px-2 py-2 text-xs text-left font-medium text-red-600 hover:bg-red-600 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={playerTargets.length === 0}
                  >
                    Clear targets
                  </button>
                </div>
              )}
            </div>

            {organizedTargets.map((item, idx) => {
              if (item.type === 'divider') {
                const isInMoveMode = movingPlayerId !== null
                return (
                  <div key={`divider-${item.round}-${item.pick}`}
                    className="pt-2 mt-2"
                  >
                    <div 
                      className={`text-xs text-white text-center py-1 px-2 rounded-xl ${
                        isInMoveMode 
                          ? 'bg-green-500 hover:bg-green-600 cursor-pointer border-2 border-green-300' 
                          : 'bg-blue-500'
                      } transition-colors`}
                      onClick={isInMoveMode && movingPlayerId ? () => handleMovePlayerToRound(movingPlayerId, item.round) : undefined}
                    >
                      {isInMoveMode ? (
                        <p className="font-semibold">Move to Round {item.round}</p>
                      ) : (
                        <>
                          <p className="font-semibold underline">RD {item.round}</p>
                          <p className="font-light">Pick {item.pick}</p>
                        </>
                      )}
                    </div>
                  </div>
                )
              } else {
                const player = item.player
                const adp = getPlayerAdp(player, fantasySettings, boardSettings)
                const posStyle = getPosStyle(player.position)
                const metrics = getPlayerMetrics(player, fantasySettings, boardSettings)
                const { tier } = metrics
                const { tierNumber } = tier || {}
                const tierStyle = getTierStyle(tierNumber)

                const isHoveringPlayer = viewPlayerId === player.id
                const cardBorderStyle = isHoveringPlayer ? 'border border-4 border-indigo-500' : 'border'
                const defaultCardBgStyle = positionFilter === 'All' ? posStyle : tierStyle
                const bgColor = isHoveringPlayer ? 'bg-yellow-300' : defaultCardBgStyle
                
                return (
                  <div
                    key={`target-${player.id}-${idx}`}
                    className={`p-2 rounded shadow-sm transition-colors ${bgColor} ${cardBorderStyle}`}
                    onMouseEnter={() => {
                      setViewPlayerId(player.id)
                    }}
                    onMouseLeave={() => {
                      setViewPlayerId('')
                    }}
                  >
                    <div className="flex flex-col text-center items-center">
                      <p className="text-xs font-semibold truncate w-full">
                        {player.fullName}
                      </p>
                      <p className="text-xs font-medium text-gray-600">
                        {player.position} | {player.team}
                      </p>
                      <p className="text-xs font-medium text-gray-600">
                        Early as {getRoundAndPickShortText(item.target.targetAsEarlyAs, fantasySettings.numTeams)}
                      </p>
                      <p className="text-xs font-medium text-gray-600">
                        ADP {getRoundAndPickShortText(parseInt(adp.toFixed(0)), fantasySettings.numTeams)}
                      </p>
                      <div className="flex gap-1 mt-2">
                        <button
                          className="px-1 py-0.5 text-xs bg-red-500 text-white rounded shadow hover:bg-red-600 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation()
                            removePlayerTarget(player.id)
                          }}
                        >
                          Remove
                        </button>
                        <button
                          className={`px-1 py-0.5 text-xs rounded shadow transition-colors ${
                            movingPlayerId === player.id 
                              ? 'bg-yellow-500 text-white hover:bg-yellow-600' 
                              : 'bg-blue-500 text-white hover:bg-blue-600'
                          }`}
                          onClick={(e) => {
                            e.stopPropagation()
                            setMovingPlayerId(movingPlayerId === player.id ? null : player.id)
                          }}
                        >
                          {movingPlayerId === player.id ? 'Cancel' : 'Move'}
                        </button>
                      </div>
                    </div>
                  </div>
                )
              }
            })}
          </div>
        </div>

        {/* Round Columns - Dynamic based on viewport */}
        {roundsToShow.map((round) => (
          <div key={round} className="flex flex-col min-w-0 overflow-hidden">
            <div className="sticky top-0 bg-blue-100 border-b-2 border-blue-300 p-2 text-center flex-shrink-0">
              <h3 className="text-sm font-semibold text-blue-800">
                Round {round}
              </h3>
              <p className="text-xs text-blue-600">
                ({getRoundCount(round)} players)
              </p>
            </div>
            
            <div className="flex flex-col space-y-1 p-0.5 overflow-y-auto flex-1">
              {(() => {
                const roundPlayers = playersByRound[round] || []
                const firstTeamPlayers = roundPlayers.slice(0, fantasySettings.numTeams)
                const remainingPlayers = roundPlayers.slice(fantasySettings.numTeams)
                
                const renderPlayer = (player: any, idx: number) => {
                  const adp = getPlayerAdp(player, fantasySettings, boardSettings)
                  const posStyle = getPosStyle(player.position)
                  const adpRound = getRoundNumForPickNum(adp, fantasySettings.numTeams)
                  const adpRoundAndPick = getRoundAndPickShortText(adp, fantasySettings.numTeams)
                  const metrics = getPlayerMetrics(player, fantasySettings, boardSettings)
                  const { tier } = metrics
                  const { tierNumber } = tier || {}
                  const tierStyle = getTierStyle(tierNumber)

                  const isHoveringPlayer = viewPlayerId === player.id
                  const cardBorderStyle = isHoveringPlayer ? 'border border-4 border-indigo-500' : 'border'
                  const defaultCardBgStyle = positionFilter === 'All' ? posStyle : tierStyle
                  const bgColor = isHoveringPlayer ? 'bg-yellow-300' : (adpRound === round ? defaultCardBgStyle : 'bg-gray-100')
                  
                  // Find the user's pick for this round
                  const userPickForRound = myPicks[round - 1] // round is 1-based, array is 0-based
                  const isPlayerTargeted = playerTargets.some(target => target.playerId === player.id)
                  
                  return (
                    <div
                      key={`${player.id}-${round}-${idx}`}
                      className={`p-0.5 mt-0.5 rounded shadow-sm transition-colors ${bgColor} ${cardBorderStyle}`}
                      onMouseEnter={() => {
                        setViewPlayerId(player.id)
                      }}
                      onMouseLeave={() => {
                        setViewPlayerId('')
                      }}
                    >
                      <div className="flex flex-col text-center items-center py-0.5">
                        <p className="text-xs font-semibold truncate w-full">
                          {playerShortName(player.fullName)}
                        </p>
                        <p className="text-xs font-medium text-gray-600 hidden md:flex">
                          {player.position} | {player.team}
                        </p>
                        <p className="text-xs font-medium text-gray-600 hidden md:flex">
                          ADP {adpRoundAndPick}
                        </p>
                        <p className="text-xs font-medium text-gray-600 flex md:hidden">
                          {player.position} | {player.team}
                        </p>
                        <p className="text-xs font-medium text-gray-600 flex md:hidden">
                          ADP {adpRoundAndPick}
                        </p>
                        <div className="flex gap-1 mt-1">
                          {!isPlayerTargeted && userPickForRound && (
                            <button
                              className="px-1 py-0.5 text-xs bg-green-500 text-white rounded shadow hover:bg-green-600 transition-colors"
                              onClick={(e) => {
                                e.stopPropagation()
                                addPlayerTarget(player, userPickForRound)
                              }}
                            >
                              Target
                            </button>
                          )}
                          {isPlayerTargeted && (
                            <button
                              className="px-1 py-0.5 text-xs bg-red-500 text-white rounded shadow hover:bg-red-600 transition-colors"
                              onClick={(e) => {
                                e.stopPropagation()
                                removePlayerTarget(player.id)
                              }}
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
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
    </div>
  )
}

export default ADPView 