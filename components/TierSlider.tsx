import React, { useState, useMemo, useEffect, useCallback } from 'react'
import { Player, FantasySettings, ThirdPartyRanker } from '../types'
import { getPlayerMetrics, PlayerRanks } from '../behavior/draft'

interface TierSliderProps {
  position: keyof PlayerRanks
  fantasySettings: FantasySettings
  boardSettings: any
  onUpdateTierBoundary: (position: keyof PlayerRanks, tierNumber: number, newBoundaryIndex: number) => void
  allCards: any[] // The full cards array to get correct DOM indices
}

const TierSlider: React.FC<TierSliderProps> = ({
  position,
  fantasySettings,
  boardSettings,
  onUpdateTierBoundary,
  allCards
}) => {
  const [draggedHandle, setDraggedHandle] = useState<number | null>(null)
  const [dragOffset, setDragOffset] = useState(0)
  const [playerCardPositions, setPlayerCardPositions] = useState<number[]>([])
  const [containerTop, setContainerTop] = useState(0)

  // Calculate tier boundaries from actually rendered cards
  const { tierBoundaries, renderedPlayers } = useMemo(() => {
    // Get only the player cards that are actually being rendered (respecting slice limits)
    const actuallyRenderedCards = allCards.slice(0, 30) // Match the slice(0,30) in positionRankings
    const renderedPlayerCards = actuallyRenderedCards.filter(card => !('title' in card)) as Player[]
    
    const boundaries: number[] = []
    let currentTier: number | undefined = undefined
    
    renderedPlayerCards.forEach((player, index) => {
      const metrics = getPlayerMetrics(player, fantasySettings, boardSettings)
      const tierNumber = metrics.tier?.tierNumber
      
      if (tierNumber !== currentTier && currentTier !== undefined) {
        boundaries.push(index)
      }
      currentTier = tierNumber
    })
    
    return { 
      tierBoundaries: boundaries, 
      renderedPlayers: renderedPlayerCards 
    }
  }, [allCards, fantasySettings, boardSettings])

  // Measure actual positions of player cards from DOM
  const measurePlayerCardPositions = useCallback(() => {
    const positions: number[] = []
    let containerTopPos = 0
    
    renderedPlayers.forEach((player, playerIndex) => {
      // Find the actual DOM index by looking in the allCards array (limited to first 30)
      const limitedCards = allCards.slice(0, 30)
      const domIndex = limitedCards.findIndex(card => !('title' in card) && card.id === player.id)
      

      
      if (domIndex !== -1) {
        const cardElement = document.getElementById(`${player.id}-${domIndex}`)
        if (cardElement) {
          const rect = cardElement.getBoundingClientRect()
          const parentColumn = cardElement.closest('.flex.flex-col')
          if (parentColumn && playerIndex === 0) {
            // Get the container's top position for relative positioning
            containerTopPos = parentColumn.getBoundingClientRect().top
          }
          // Store the center position of each card relative to the container
          positions.push(rect.top + rect.height / 2 - containerTopPos)
        } else {
          // Fallback to estimated position if element not found
          positions.push(playerIndex * 84 + 42)
        }
      } else {
        // Fallback if player not found in allCards
        positions.push(playerIndex * 84 + 42)
      }
    })
    
    setPlayerCardPositions(positions)
    setContainerTop(containerTopPos)
  }, [renderedPlayers, allCards])

  // Measure positions when component mounts or players change
  useEffect(() => {
    // Use multiple timeouts to ensure DOM is fully rendered
    const timeoutId1 = setTimeout(measurePlayerCardPositions, 50)
    const timeoutId2 = setTimeout(measurePlayerCardPositions, 200) // Backup measurement
    const timeoutId3 = setTimeout(measurePlayerCardPositions, 500) // Final measurement
    
    return () => {
      clearTimeout(timeoutId1)
      clearTimeout(timeoutId2)
      clearTimeout(timeoutId3)
    }
  }, [measurePlayerCardPositions])

  // Re-measure on window resize
  useEffect(() => {
    const handleResize = () => {
      setTimeout(measurePlayerCardPositions, 50) // Small delay after resize
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [measurePlayerCardPositions])

  // Observer to re-measure when DOM changes
  useEffect(() => {
    if (renderedPlayers.length === 0) return

    const observer = new MutationObserver(() => {
      setTimeout(measurePlayerCardPositions, 100)
    })

    // Observe the first player's parent container for changes
    const firstPlayer = renderedPlayers[0]
    if (firstPlayer) {
      const limitedCards = allCards.slice(0, 30)
      const domIndex = limitedCards.findIndex(card => !('title' in card) && card.id === firstPlayer.id)
      if (domIndex !== -1) {
        const firstPlayerElement = document.getElementById(`${firstPlayer.id}-${domIndex}`)
        const container = firstPlayerElement?.closest('.flex.flex-col')
        if (container) {
          observer.observe(container, { 
            childList: true, 
            subtree: true, 
            attributes: true,
            attributeFilter: ['class', 'style']
          })
        }
      }
    }

    return () => observer.disconnect()
  }, [renderedPlayers, allCards, measurePlayerCardPositions])

  const getPlayerCardPosition = (index: number) => {
    return playerCardPositions[index] || (index * 84 + 42) // Fallback to estimate if not measured
  }

  const handleMouseDown = (e: React.MouseEvent, tierIndex: number) => {
    setDraggedHandle(tierIndex)
    const currentPos = getPlayerCardPosition(tierBoundaries[tierIndex])
    setDragOffset(e.clientY - containerTop - currentPos)
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (draggedHandle === null || playerCardPositions.length === 0) return

    const newY = e.clientY - containerTop - dragOffset
    
    // Find the closest player index based on actual card positions
    let closestIndex = 0
    let minDistance = Math.abs(newY - playerCardPositions[0])
    
    for (let i = 1; i < playerCardPositions.length; i++) {
      const distance = Math.abs(newY - playerCardPositions[i])
      if (distance < minDistance) {
        minDistance = distance
        closestIndex = i
      }
    }
    
    // Constrain to valid positions (between adjacent tier boundaries)
    const minIndex = draggedHandle > 0 ? tierBoundaries[draggedHandle - 1] + 1 : 0
    const maxIndex = draggedHandle < tierBoundaries.length - 1 ? tierBoundaries[draggedHandle + 1] - 1 : renderedPlayers.length - 1
    
    const constrainedIndex = Math.max(minIndex, Math.min(maxIndex, closestIndex))
    
    if (constrainedIndex !== tierBoundaries[draggedHandle]) {
      onUpdateTierBoundary(position, draggedHandle + 1, constrainedIndex)
    }
  }

  const handleMouseUp = () => {
    setDraggedHandle(null)
    setDragOffset(0)
  }

  const containerHeight = playerCardPositions.length > 0 
    ? Math.max(...playerCardPositions) + 50 // Add some padding at the bottom
    : renderedPlayers.length * 84 // Fallback estimate

  return (
    <div 
      className="relative w-8 ml-2"
      style={{ height: containerHeight }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Vertical line */}
      <div className="absolute left-3 top-0 w-0.5 bg-gray-400 h-full" />
      
      {/* Player notches - only show if we have measured positions */}
      {playerCardPositions.length > 0 && renderedPlayers.map((_, index) => (
        <div
          key={index}
          className="absolute left-2 w-3 h-0.5 bg-gray-300"
          style={{ top: getPlayerCardPosition(index) }}
        />
      ))}
      
      {/* Tier boundary handles - only show if we have measured positions */}
      {playerCardPositions.length > 0 && tierBoundaries.map((boundaryIndex, tierIndex) => (
        <div
          key={tierIndex}
          className={`absolute left-0 w-7 h-5 bg-blue-500 border border-blue-600 rounded cursor-ns-resize hover:bg-blue-600 ${
            draggedHandle === tierIndex ? 'bg-blue-700' : ''
          }`}
          style={{ top: Math.max(0, getPlayerCardPosition(boundaryIndex) - 10) }}
          onMouseDown={(e) => handleMouseDown(e, tierIndex)}
          title={`Tier ${tierIndex + 1} boundary`}
        >
          <div className="flex flex-col justify-center items-center h-full text-xs text-white font-bold">
            <div>{tierIndex + 1}</div>
            <div className="w-4 h-0.5 bg-white rounded" />
          </div>
        </div>
      ))}
      
      {/* Loading indicator when positions aren't measured yet */}
      {playerCardPositions.length === 0 && (
        <div className="absolute left-1 top-4 text-xs text-gray-500">
          <div>Measuring positions...</div>
          <button 
            onClick={measurePlayerCardPositions}
            className="mt-1 px-1 py-0.5 bg-blue-400 text-white rounded text-xs hover:bg-blue-500"
            title="Manually refresh position measurements"
          >
            Refresh
          </button>
        </div>
      )}
      

    </div>
  )
}

export default TierSlider 