import React, { useState, useMemo, useEffect } from 'react'
import { Player, FantasySettings } from '../types'
import { getPlayerMetrics, PlayerRanks } from '../behavior/draft'

interface TierDividersHookProps {
  position: keyof PlayerRanks
  fantasySettings: FantasySettings
  boardSettings: any
  onUpdateTierBoundary: (position: keyof PlayerRanks, tierNumber: number, newBoundaryIndex: number) => void
  allCards: any[] // The full cards array to get correct DOM indices
}

interface TierDividerData {
  tierNumber: number
  boundaryIndex: number
  position: 'before' | 'after'
  playerIndex: number
}

const useTierDividers = ({
  position,
  fantasySettings,
  boardSettings,
  onUpdateTierBoundary,
  allCards
}: TierDividersHookProps) => {
  const [activeTier, setActiveTier] = useState<number | null>(null)

  // Reset active tier when position changes (important for mobile when switching positions)
  useEffect(() => {
    setActiveTier(null)
  }, [position])

  // Calculate tier boundaries and divider data
  const { tierDividers, renderedPlayers } = useMemo(() => {
    // Get all player cards from the position (no slicing for boundary calculation)
    const allPlayerCards = allCards.filter(card => !('title' in card)) as Player[]
    
    // Calculate tier boundaries based on the full position array
    const fullTierBoundaries: number[] = []
    let currentTier: number | undefined = undefined
    
    allPlayerCards.forEach((player, index) => {
      const metrics = getPlayerMetrics(player, fantasySettings, boardSettings)
      const tierNumber = metrics.tier?.tierNumber
      
      if (tierNumber !== currentTier && currentTier !== undefined) {
        fullTierBoundaries.push(index)
      }
      currentTier = tierNumber
    })
    
    // Now get only the rendered cards for display
    const actuallyRenderedCards = allCards.slice(0, 50)
    const renderedPlayerCards = actuallyRenderedCards.filter(card => !('title' in card)) as Player[]
    
    // Create dividers only for boundaries that are visible in the rendered slice
    const dividers: TierDividerData[] = []
    currentTier = undefined
    let boundaryIndex = 0
    
    renderedPlayerCards.forEach((player, renderedIndex) => {
      const metrics = getPlayerMetrics(player, fantasySettings, boardSettings)
      const tierNumber = metrics.tier?.tierNumber
      
      if (tierNumber !== currentTier && currentTier !== undefined) {
        boundaryIndex++
        dividers.push({
          tierNumber: boundaryIndex,
          boundaryIndex: renderedIndex, // Index relative to rendered cards
          position: 'before',
          playerIndex: renderedIndex
        })
      }
      currentTier = tierNumber
    })
    
    return { 
      tierDividers: dividers, 
      renderedPlayers: renderedPlayerCards 
    }
  }, [allCards, fantasySettings, boardSettings])

  // Handle tier divider click to activate/deactivate tier
  const handleTierDividerClick = (divider: TierDividerData) => {
    if (activeTier === divider.tierNumber) {
      // Clicking the same tier deactivates it
      setActiveTier(null)
    } else {
      // Clicking a different tier activates it
      setActiveTier(divider.tierNumber)
    }
  }

  // Handle clicking on a placement location
  const handlePlacementClick = (targetPlayerIndex: number) => {
    if (activeTier !== null) {
      // Convert the rendered index back to the full position array index
      // The targetPlayerIndex is relative to the rendered cards (slice 0-50)
      // but onUpdateTierBoundary expects an index relative to the full position array
      const actuallyRenderedCards = allCards.slice(0, 50)
      const renderedPlayerCards = actuallyRenderedCards.filter(card => !('title' in card)) as Player[]
      
      if (targetPlayerIndex < renderedPlayerCards.length) {
        const targetPlayer = renderedPlayerCards[targetPlayerIndex]
        // Find this player's index in the original allCards array
        const fullIndex = allCards.findIndex(card => 
          !('title' in card) && (card as Player).id === targetPlayer.id
        )
        
        if (fullIndex !== -1) {
          onUpdateTierBoundary(position, activeTier, fullIndex)
        }
      }
      setActiveTier(null) // Deactivate after placement
    }
  }

  // Check if a tier divider should be rendered before this player index
  const shouldRenderDividerBefore = (playerIndex: number): TierDividerData | null => {
    return tierDividers.find(divider => divider.playerIndex === playerIndex) || null
  }

  // Check if a placement indicator should be shown before this player index
  const shouldShowPlacementIndicator = (playerIndex: number): boolean => {
    if (activeTier === null) return false
    
    // Don't show placement indicator at the current tier position
    const activeTierDivider = tierDividers.find(divider => divider.tierNumber === activeTier)
    if (activeTierDivider && activeTierDivider.playerIndex === playerIndex) return false
    
    return true
  }

  // Render function for tier dividers
  const renderTierDivider = (divider: TierDividerData, key?: string) => {
    const isActive = activeTier === divider.tierNumber
    const activeStyle = isActive ? 'from-yellow-400 to-yellow-600 ring-2 ring-yellow-300' : 'from-blue-400 to-blue-600 hover:from-blue-500 hover:to-blue-700'

    return (
      <div
        key={key || `tier-divider-${divider.tierNumber}`}
        className={`w-full h-3 bg-gradient-to-r ${activeStyle} rounded-sm cursor-pointer flex items-center justify-center my-1 transition-all duration-200`}
        onClick={() => handleTierDividerClick(divider)}
        title={isActive ? `Click to deactivate Tier ${divider.tierNumber}` : `Click to move Tier ${divider.tierNumber}`}
      >
        <div className="flex items-center gap-1 text-white text-xs font-bold">
          <div className="w-1 h-1 bg-white rounded-full"></div>
          <span>T{divider.tierNumber}</span>
          <div className="w-1 h-1 bg-white rounded-full"></div>
        </div>
      </div>
    )
  }

  // Render function for placement indicators
  const renderPlacementIndicator = (playerIndex: number, key?: string) => {
    return (
      <div
        key={key || `placement-indicator-${playerIndex}`}
        className="w-full h-2 bg-gray-300 opacity-50 rounded-sm cursor-pointer flex items-center justify-center my-1 hover:bg-gray-400 hover:opacity-75 transition-all duration-200"
        onClick={() => handlePlacementClick(playerIndex)}
        title={`Place Tier ${activeTier} here`}
      >
        <div className="flex items-center gap-1 text-gray-600 text-xs font-bold">
          <span>↓</span>
        </div>
      </div>
    )
  }

  // Legacy function for compatibility - no longer handles tier divider drops
  const handleTierDividerDropOnPlayer = (e: React.DragEvent, targetPlayerIndex: number) => {
    // This function is kept for compatibility but does nothing now
    e.preventDefault()
  }

  // Legacy function for compatibility - no longer checks for tier divider drag data
  const isDragDataTierDivider = (e: React.DragEvent): boolean => {
    // This function is kept for compatibility but always returns false
    return false
  }

  return {
    tierDividers,
    shouldRenderDividerBefore,
    shouldShowPlacementIndicator,
    renderTierDivider,
    renderPlacementIndicator,
    handleTierDividerDropOnPlayer, // Legacy compatibility
    isDragDataTierDivider, // Legacy compatibility
    isDragActive: false, // Always false now since we don't use drag
    activeTier,
    handlePlacementClick
  }
}

export default useTierDividers 