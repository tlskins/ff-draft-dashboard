import React from 'react'
import { Player, FantasySettings, BoardSettings, PlayerTarget } from '../../types'
import { getPlayerAdp, getPlayerMetrics, getRoundAndPickShortText } from '../../behavior/draft'
import { getPosStyle, getTierStyle } from '../../behavior/styles'
import { PositionFilter } from '../../behavior/hooks/useADPView'
import { playerShortName } from '../../behavior/presenters'

interface ADPPlayerCardProps {
  player: Player
  fantasySettings: FantasySettings
  boardSettings: BoardSettings
  viewPlayerId: string | null
  setViewPlayerId: (id: string) => void
  positionFilter: PositionFilter
  // Target-related props
  isPlayerTargeted?: boolean
  playerTarget?: PlayerTarget
  userPickForRound?: number
  addPlayerTarget?: (player: Player, targetAsEarlyAsRound: number) => void
  removePlayerTarget?: (playerId: string) => void
  // Optional styling overrides
  showAdpRound?: boolean // Show ADP round instead of availability
  className?: string
}

export const ADPPlayerCard: React.FC<ADPPlayerCardProps> = ({
  player,
  fantasySettings,
  boardSettings,
  viewPlayerId,
  setViewPlayerId,
  positionFilter,
  isPlayerTargeted = false,
  playerTarget,
  userPickForRound,
  addPlayerTarget,
  removePlayerTarget,
  showAdpRound = false,
  className = '',
}) => {
  const adp = getPlayerAdp(player, fantasySettings, boardSettings)
  const posStyle = getPosStyle(player.position)
  const metrics = getPlayerMetrics(player, fantasySettings, boardSettings)
  const { tier, overallRank } = metrics
  const { tierNumber } = tier || {}
  const tierStyle = getTierStyle(tierNumber)

  const isHoveringPlayer = viewPlayerId === player.id
  const cardBorderStyle = isHoveringPlayer ? 'border border-4 border-indigo-500' : 'border'
  const defaultCardBgStyle = positionFilter === 'All' ? posStyle : tierStyle
  
  // If className contains background override (like bg-gray-100), use that, otherwise use default styling
  const hasBackgroundOverride = className.includes('bg-')
  const bgColor = isHoveringPlayer ? 'bg-yellow-300' : (hasBackgroundOverride ? '' : defaultCardBgStyle)
  
  const adpRoundAndPick = getRoundAndPickShortText(adp, fantasySettings.numTeams)
  
  // Calculate rank differential (Overall Rank - ADP)
  const rankDifferential = overallRank && adp && adp < 999 ? overallRank - Math.round(adp) : null
  
  return (
    <div
      className={`p-0.5 mt-0.5 rounded shadow-sm transition-colors ${bgColor} ${cardBorderStyle} ${className}`}
      onMouseEnter={() => setViewPlayerId(player.id)}
      onMouseLeave={() => setViewPlayerId('')}
    >
      <div className="flex flex-col text-center items-center py-0.5">
        {/* Player name with inline favorite star */}
        <div className="flex items-center justify-center w-full">
          {playerTarget ? (
            <p className="text-xs font-medium bg-blue-500 text-white rounded px-0.5 mt-0.5 ml-1">
              {playerShortName(player.fullName)} ★
            </p>
          ) : (
            <p className="text-xs font-semibold truncate">
              {playerShortName(player.fullName)}
            </p>
          )}
        </div>
        
        {/* Position and Team */}
        <p className="text-xs font-medium text-gray-600">
          {player.position} | {player.team}
        </p>
        
        {/* ADP */}
        <p className="text-xs font-medium text-gray-600">
          ADP {adpRoundAndPick} vs RK {overallRank ? getRoundAndPickShortText(overallRank, fantasySettings.numTeams) : 'N/A'}
        </p>
        
        {/* Action buttons */}
        <div className="flex gap-1 mt-1">
          {!isPlayerTargeted && userPickForRound && addPlayerTarget && (
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
          {isPlayerTargeted && removePlayerTarget && (
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

export default ADPPlayerCard 