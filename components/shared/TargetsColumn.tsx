import React, { useState } from 'react'
import { Player, FantasySettings, BoardSettings, PlayerTarget } from '../../types'
import { getPlayerAdp, getPlayerMetrics, getRoundAndPickShortText } from '../../behavior/draft'
import { getPosStyle, getTierStyle } from '../../behavior/styles'
import { PositionFilter } from '../../behavior/hooks/useADPView'

interface TargetsColumnProps {
  playerTargets: PlayerTarget[]
  organizedTargets: Array<{ type: 'divider', round: number, pick: number } | { type: 'player', player: Player, target: PlayerTarget }>
  fantasySettings: FantasySettings
  boardSettings: BoardSettings
  viewPlayerId: string | null
  setViewPlayerId: (id: string) => void
  removePlayerTarget: (playerId: string) => void
  positionFilter: PositionFilter
  movingPlayerId: string | null
  setMovingPlayerId: (id: string | null) => void
  handleMovePlayerToRound: (playerId: string, round: number) => void
  // Desktop dropdown management
  handleSaveFavorites: () => void
  handleLoadFavorites: () => void
  handleClearFavorites: () => void
  onSwitchToTargetsView: () => void
}

export const TargetsColumn: React.FC<TargetsColumnProps> = ({
  playerTargets,
  organizedTargets,
  fantasySettings,
  boardSettings,
  viewPlayerId,
  setViewPlayerId,
  removePlayerTarget,
  positionFilter,
  movingPlayerId,
  setMovingPlayerId,
  handleMovePlayerToRound,
  handleSaveFavorites,
  handleLoadFavorites,
  handleClearFavorites,
  onSwitchToTargetsView,
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)

  return (
    <div className="flex flex-col min-w-0 overflow-hidden h-full">
      <div className="sticky top-0 bg-yellow-300 border-b-2 border-purple-300 p-2 text-center flex-shrink-0">
        <h3 className="text-sm font-semibold text-purple-800">
          Targets
        </h3>
        <p className="text-xs text-purple-600">
          ({playerTargets.length} players)
        </p>
      </div>
      
      <div className="flex flex-col space-y-1 p-2 overflow-y-auto" style={{ height: 'calc(100% - 80px)' }}>
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
                className="w-full px-2 py-2 text-xs text-left font-medium text-red-600 hover:bg-red-600 hover:text-white transition-colors border-b border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={playerTargets.length === 0}
              >
                Clear targets
              </button>
              <button
                onClick={() => {
                  onSwitchToTargetsView()
                  setIsDropdownOpen(false)
                }}
                className="w-full px-2 py-2 text-xs text-left font-medium text-indigo-600 hover:bg-indigo-600 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={playerTargets.length === 0}
              >
                Visualize targets
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
  )
}

export default TargetsColumn 