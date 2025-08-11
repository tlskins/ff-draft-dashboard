import React, { useState, useMemo, useEffect } from 'react'
import { Player, FantasySettings } from '../types'
import { getPlayerMetrics, PlayerRanks } from '../behavior/draft'

// Helper function to detect mobile/touch devices
const isMobileDevice = () => {
  return (('ontouchstart' in window) ||
    (navigator.maxTouchPoints > 0) ||
    // @ts-ignore
    (navigator.msMaxTouchPoints > 0))
}

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
  const [draggedDivider, setDraggedDivider] = useState<TierDividerData | null>(null)
  const [touchDragActive, setTouchDragActive] = useState(false)

  // Calculate tier boundaries and divider data
  const { tierDividers, renderedPlayers } = useMemo(() => {
    // Get only the player cards that are actually being rendered (respecting slice limits)
    const actuallyRenderedCards = allCards.slice(0, 50) // Match the slice(0,50) in EditRankingsView
    const renderedPlayerCards = actuallyRenderedCards.filter(card => !('title' in card)) as Player[]
    
    const dividers: TierDividerData[] = []
    let currentTier: number | undefined = undefined
    let tierCount = 0
    
    renderedPlayerCards.forEach((player, index) => {
      const metrics = getPlayerMetrics(player, fantasySettings, boardSettings)
      const tierNumber = metrics.tier?.tierNumber
      
      if (tierNumber !== currentTier && currentTier !== undefined) {
        tierCount++
        dividers.push({
          tierNumber: tierCount,
          boundaryIndex: index,
          position: 'before',
          playerIndex: index
        })
      }
      currentTier = tierNumber
    })
    
    return { 
      tierDividers: dividers, 
      renderedPlayers: renderedPlayerCards 
    }
  }, [allCards, fantasySettings, boardSettings])

  // Prevent scrolling when touch dragging on mobile
  useEffect(() => {
    if (touchDragActive && isMobileDevice()) {
      const preventScroll = (e: TouchEvent) => {
        e.preventDefault()
      }
      
      document.body.addEventListener('touchmove', preventScroll, { passive: false })
      
      return () => {
        document.body.removeEventListener('touchmove', preventScroll)
      }
    }
  }, [touchDragActive])

  // Drag handlers for tier dividers
  const handleDividerDragStart = (e: React.DragEvent, divider: TierDividerData) => {
    if (isMobileDevice()) return
    setDraggedDivider(divider)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', `tier-divider-${divider.tierNumber}`)
    e.dataTransfer.setData('application/json', JSON.stringify(divider))
  }

  const handleDividerTouchStart = (e: React.TouchEvent, divider: TierDividerData) => {
    if (!isMobileDevice()) return
    e.preventDefault()
    setDraggedDivider(divider)
    setTouchDragActive(true)
  }

  const handleDividerTouchEnd = (e: React.TouchEvent) => {
    if (!isMobileDevice() || !touchDragActive || !draggedDivider) return
    
    e.preventDefault()
    const touch = e.changedTouches[0]
    const elementBelow = document.elementFromPoint(touch.clientX, touch.clientY)
    
    if (elementBelow) {
      const cardElement = elementBelow.closest('[data-player-card]')
      if (cardElement) {
        const indexAttr = cardElement.getAttribute('data-player-index')
        if (indexAttr) {
          const targetIndex = parseInt(indexAttr, 10)
          onUpdateTierBoundary(position, draggedDivider.tierNumber, targetIndex)
        }
      }
    }
    
    setDraggedDivider(null)
    setTouchDragActive(false)
  }

  // Check if a tier divider should be rendered before this player index
  const shouldRenderDividerBefore = (playerIndex: number): TierDividerData | null => {
    return tierDividers.find(divider => divider.playerIndex === playerIndex) || null
  }

  // Handle tier divider drops on player cards
  const handleTierDividerDropOnPlayer = (e: React.DragEvent, targetPlayerIndex: number) => {
    e.preventDefault()
    const dragData = e.dataTransfer.getData('application/json')
    
    if (dragData && draggedDivider) {
      try {
        const divider = JSON.parse(dragData) as TierDividerData
        onUpdateTierBoundary(position, divider.tierNumber, targetPlayerIndex)
      } catch (error) {
        console.error('Error parsing tier divider drag data:', error)
      }
    }
    
    setDraggedDivider(null)
  }

  // Check if the drag event contains tier divider data
  const isDragDataTierDivider = (e: React.DragEvent): boolean => {
    const types = Array.from(e.dataTransfer.types)
    return types.some(type => e.dataTransfer.getData(type).startsWith('tier-divider-'))
  }

  // Render function for tier dividers
  const renderTierDivider = (divider: TierDividerData, key?: string) => {
    const isDragged = draggedDivider?.tierNumber === divider.tierNumber
    const draggedStyle = isDragged ? 'opacity-50 transform scale-105' : ''
    const touchDraggedStyle = touchDragActive && isDragged ? 'z-50 shadow-2xl' : ''

    return (
      <div
        key={key || `tier-divider-${divider.tierNumber}`}
        className={`w-full h-3 bg-gradient-to-r from-blue-400 to-blue-600 rounded-sm cursor-move flex items-center justify-center my-1 hover:from-blue-500 hover:to-blue-700 transition-all duration-200 ${draggedStyle} ${touchDraggedStyle}`}
        draggable={!isMobileDevice()}
        onDragStart={(e) => !isMobileDevice() && handleDividerDragStart(e, divider)}
        onTouchStart={(e) => isMobileDevice() && handleDividerTouchStart(e, divider)}
        onTouchEnd={(e) => isMobileDevice() && handleDividerTouchEnd(e)}
        title={`Tier ${divider.tierNumber} boundary - drag to reorder`}
      >
        <div className="flex items-center gap-1 text-white text-xs font-bold">
          <div className="w-1 h-1 bg-white rounded-full"></div>
          <span>T{divider.tierNumber}</span>
          <div className="w-1 h-1 bg-white rounded-full"></div>
        </div>
      </div>
    )
  }

  return {
    tierDividers,
    shouldRenderDividerBefore,
    renderTierDivider,
    handleTierDividerDropOnPlayer,
    isDragDataTierDivider,
    isDragActive: touchDragActive || draggedDivider !== null
  }
}

export default useTierDividers 