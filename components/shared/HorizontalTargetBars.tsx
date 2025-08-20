import React, { useState } from 'react'
import { Player, FantasySettings, BoardSettings, PlayerTarget } from '../../types'
import { getPlayerAdp, getRoundNumForPickNum } from '../../behavior/draft'
import { playerShortName } from '../../behavior/presenters'
import { PositionFilter } from '../../behavior/hooks/useADPView'

// Helper function to create extra short names for mobile (first initial + last initial)
const getPlayerInitials = (fullName: string): string => {
  const nameParts = fullName.trim().split(/\s+/)
  if (nameParts.length === 0) return ''
  if (nameParts.length === 1) return nameParts[0].charAt(0).toUpperCase()
  
  const firstInitial = nameParts[0].charAt(0).toUpperCase()
  const lastInitial = nameParts[nameParts.length - 1].charAt(0).toUpperCase()
  return `${firstInitial}${lastInitial}`
}

interface HorizontalTargetBarsProps {
  playerTargets: PlayerTarget[]
  playerLib: { [key: string]: Player }
  fantasySettings: FantasySettings
  boardSettings: BoardSettings
  roundsToShow: number[]
  availablePlayerIds: Set<string>
  setViewPlayerId: (id: string | null) => void
  positionFilter: PositionFilter
}

interface TargetBarData {
  player: Player
  target: PlayerTarget
  targetRound: number
  playerAdp: number
  adpRound: number
  startRoundIndex: number
  endRoundIndex: number
  adpRoundIndex: number
}

const HorizontalTargetBars: React.FC<HorizontalTargetBarsProps> = ({
  playerTargets,
  playerLib,
  fantasySettings,
  boardSettings,
  roundsToShow,
  availablePlayerIds,
  setViewPlayerId,
  positionFilter,
}) => {
  const [hoveredPlayerId, setHoveredPlayerId] = useState<string | null>(null)
  const [popoverPosition, setPopoverPosition] = useState({ x: 0, y: 0 })

  // Calculate target bar data for visible rounds
  const targetBarsData = React.useMemo(() => {
    if (!playerTargets.length || !roundsToShow.length) return []

    const data: TargetBarData[] = playerTargets
      .map(target => {
        const player = playerLib[target.playerId]
        if (!player || !availablePlayerIds.has(player.id)) return null

        // Apply position filter
        if (positionFilter !== 'All' && player.position !== positionFilter) return null

        const targetRound = target.targetAsEarlyAsRound
        const playerAdp = getPlayerAdp(player, fantasySettings, boardSettings)
        const adpRound = getRoundNumForPickNum(playerAdp, fantasySettings.numTeams)

        // Determine the range of rounds this target should span
        const earliestRound = targetRound
        const latestRound = Math.max(targetRound, adpRound)

        // Check if this target overlaps with visible rounds
        const firstVisibleRound = roundsToShow[0]
        const lastVisibleRound = roundsToShow[roundsToShow.length - 1]
        
        // Skip if the target range doesn't overlap with visible rounds
        if (latestRound < firstVisibleRound || earliestRound > lastVisibleRound) {
          return null
        }

        // Find the actual start and end indices within visible rounds
        const visibleStartRound = Math.max(earliestRound, firstVisibleRound)
        const visibleEndRound = Math.min(latestRound, lastVisibleRound)
        
        const startRoundIndex = roundsToShow.findIndex(round => round === visibleStartRound)
        const endRoundIndex = roundsToShow.findIndex(round => round === visibleEndRound)
        const adpRoundIndex = roundsToShow.findIndex(round => round === adpRound)

        // Skip if we can't find valid indices
        if (startRoundIndex === -1 || endRoundIndex === -1) {
          return null
        }

        return {
          player,
          target,
          targetRound,
          playerAdp,
          adpRound,
          startRoundIndex,
          endRoundIndex,
          adpRoundIndex: adpRoundIndex === -1 ? -1 : adpRoundIndex,
        }
      })
      .filter((item): item is TargetBarData => item !== null)

    return data
  }, [playerTargets, playerLib, fantasySettings, boardSettings, roundsToShow, availablePlayerIds, positionFilter])

  const handlePlayerClick = (playerId: string, event: React.MouseEvent) => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    setPopoverPosition({
      x: rect.left + rect.width / 2,
      y: rect.top - 10
    })
    setHoveredPlayerId(playerId)
    setViewPlayerId(playerId) // Sync with main app state
  }

  const handleClickOutside = () => {
    setHoveredPlayerId(null)
    setViewPlayerId(null) // Clear main app state as well
  }

  if (targetBarsData.length === 0) {
    return null
  }

  const barHeight = 20
  const totalHeight = targetBarsData.length * (barHeight + 4) + 8 // 4px gap between bars, 8px padding

  return (
    <div className="relative mb-4" style={{ height: totalHeight }} onClick={handleClickOutside}>
      {/* Target bars */}
      {targetBarsData.map((data, barIndex) => {
        const barY = barIndex * (barHeight + 4) + 4
        
        // Calculate positioning: each round column takes up equal width
        const roundColumnWidth = 100 / roundsToShow.length
        const leftPercentage = data.startRoundIndex * roundColumnWidth
        const widthPercentage = (data.endRoundIndex - data.startRoundIndex + 1) * roundColumnWidth
        
        return (
          <div key={data.player.id} className="absolute w-full" style={{ top: barY, height: barHeight }}>
            {/* Full bar spanning from start to end round */}
            <div
              className="absolute bg-blue-400 border border-gray-800 cursor-pointer hover:shadow-lg transition-shadow rounded"
              style={{
                left: `${leftPercentage}%`,
                width: `${widthPercentage}%`,
                height: barHeight,
              }}
              onClick={(e) => {
                e.stopPropagation()
                handlePlayerClick(data.player.id, e)
              }}
            >
              {/* ADP round segment overlay if different from target round and ADP round is visible */}
              {data.adpRoundIndex !== -1 && data.adpRound !== data.targetRound && data.adpRoundIndex >= data.startRoundIndex && data.adpRoundIndex <= data.endRoundIndex && (
                <div
                  className="absolute bg-red-400 rounded"
                  style={{
                    left: `${((data.adpRoundIndex - data.startRoundIndex) / (data.endRoundIndex - data.startRoundIndex + 1)) * 100}%`,
                    width: `${(1 / (data.endRoundIndex - data.startRoundIndex + 1)) * 100}%`,
                    height: '100%',
                  }}
                />
              )}
              
              {/* If ADP round is the same as target round, show entire bar in red */}
              {data.adpRound === data.targetRound && (
                <div
                  className="absolute bg-red-400 rounded"
                  style={{
                    left: 0,
                    width: '100%',
                    height: '100%',
                  }}
                />
              )}

              {/* Player initials on the leftmost visible segment - Desktop*/}
              <div
                className="absolute text-xs font-bold text-white flex items-center justify-center pointer-events-none w-full"
                style={{
                  left: 4,
                  top: 0,
                  height: '100%',
                  minWidth: '20px',
                }}
              >
                {playerShortName(data.player.fullName)}
              </div>
            </div>
          </div>
        )
      })}

      {/* Player name popover */}
      {hoveredPlayerId && (
        <div
          className="fixed bg-black text-white text-sm px-3 py-2 rounded shadow-lg z-50 pointer-events-none"
          style={{
            left: popoverPosition.x,
            top: popoverPosition.y,
            transform: 'translateX(-50%) translateY(-100%)'
          }}
        >
          {playerLib[hoveredPlayerId]?.fullName}
          <div className="text-xs text-gray-300 mt-1">
            {playerLib[hoveredPlayerId]?.position} | {playerLib[hoveredPlayerId]?.team}
          </div>
        </div>
      )}
    </div>
  )
}

export default HorizontalTargetBars 