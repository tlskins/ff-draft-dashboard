import React, { useCallback } from 'react'
import { Player, FantasySettings, BoardSettings, PlayerTarget } from '../../types'
import { getPlayerAdp, getPlayerMetrics, getRoundIdxForPickNum, PlayerRanks } from '../../behavior/draft'
import { getPosStyle, getTierStyle } from '../../behavior/styles'
import { useADPView, PositionFilter } from '../../behavior/hooks/useADPView'

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
  addPlayerTarget: (player: Player, targetBelowPick: number) => void
  replacePlayerTargets: (targets: PlayerTarget[]) => void
  removePlayerTarget: (playerId: string) => void
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
}) => {
  const {
    currentPage,
    positionFilter,
    setPositionFilter,
    totalPages,
    startRound,
    endRound,
    playersByRound,
    organizedTargets,
    handlePrevPage,
    handleNextPage,
    handleSaveFavorites,
    handleLoadFavorites,
    handleClearFavorites,
  } = useADPView({ playerRanks, fantasySettings, boardSettings, myPicks, playerTargets, playerLib, addPlayerTarget, replacePlayerTargets, removePlayerTarget })
  
  const getRoundCount = useCallback((round: number) => {
    return (playersByRound[round] || []).filter( (player, playerIdx) => {
      if ( playerIdx >= fantasySettings.numTeams ) {
        return false
      }
      const adp = getPlayerAdp(player, fantasySettings, boardSettings)
      const adpRound = getRoundIdxForPickNum(adp, fantasySettings.numTeams) + 1
      return adpRound === round
    }).length
  }, [fantasySettings, boardSettings, playersByRound])

  return (
    <div className="h-screen overflow-y-scroll bg-white p-2">
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
      
      <div className="grid grid-cols-5 gap-2 min-w-full">
        <div className="flex flex-col min-w-0">
          <div className="sticky top-0 bg-yellow-300 border-b-2 border-purple-300 p-2 text-center">
            <h3 className="text-sm font-semibold text-purple-800">
              Player Targets
            </h3>
            <p className="text-xs text-purple-600">
              ({playerTargets.length} players)
            </p>
          </div>
          
          <div className="flex flex-col space-y-1 p-2">
          <div className="flex gap-1 mt-2">
              <button
                onClick={handleSaveFavorites}
                className="flex-1 px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                disabled={playerTargets.length === 0}
              >
                Save
              </button>
              <button
                onClick={handleLoadFavorites}
                className="flex-1 px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
              >
                Load
              </button>
              <button
                onClick={handleClearFavorites}
                className="flex-1 px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                disabled={playerTargets.length === 0}
              >
                Clear
              </button>
            </div>

            {organizedTargets.map((item, idx) => {
              if (item.type === 'divider') {
                return (
                  <div key={`divider-${item.round}-${item.pick}`}
                    className="pt-2 mt-2"
                  >
                    <p className="text-xs rounded bg-blue-500 text-white text-center font-semibold py-1 px-2">
                      Round {item.round} - Pick {item.pick}
                    </p>
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
                    className={`p-2 rounded shadow-sm cursor-pointer transition-colors ${bgColor} ${cardBorderStyle}`}
                    onClick={() => removePlayerTarget(player.id)}
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
                        {player.position} | {player.team} | ADP {adp.toFixed(0)}
                      </p>
                      <p className="text-xs text-red-600 font-medium">
                        Click to remove
                      </p>
                    </div>
                  </div>
                )
              }
            })}
          </div>
        </div>

        {Array.from({ length: endRound - startRound + 1 }, (_, i) => startRound + i).map(round => (
          <div key={round} className="flex flex-col min-w-0">
            <div className="sticky top-0 bg-blue-100 border-b-2 border-blue-300 p-2 text-center">
              <h3 className="text-sm font-semibold text-blue-800">
                Round {round}
              </h3>
              <p className="text-xs text-blue-600">
                ({getRoundCount(round)} players)
              </p>
            </div>
            
            <div className="flex flex-col space-y-1 p-0.5">
              {(() => {
                const roundPlayers = playersByRound[round] || []
                const firstTeamPlayers = roundPlayers.slice(0, fantasySettings.numTeams)
                const remainingPlayers = roundPlayers.slice(fantasySettings.numTeams)
                
                const renderPlayer = (player: any, idx: number) => {
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
                          {player.fullName}
                        </p>
                        <p className="text-xs font-medium text-gray-600">
                          {player.position} | {player.team} | ADP RD {adpRound}
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
    </div>
  )
}

export default ADPView 