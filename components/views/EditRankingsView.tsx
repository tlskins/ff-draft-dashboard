import React, { useState, useMemo, useEffect } from "react"
import { toast } from 'react-toastify'

import { getPickDiffColor, getPosStyle, getTierStyle } from '../../behavior/styles'
import { myCurrentRound, getPlayerMetrics, getProjectedTier, getRoundIdxForPickNum, PlayerRanks, getRoundAndPickShortText } from '../../behavior/draft'
import { Player, FantasyPosition, DataRanker } from "../../types"
import { EditRankingsViewProps } from "../../types/DraftBoardTypes"
import { getDraftBoard } from "../../behavior/DraftBoardUtils"
import { isTitleCard } from "../../types/DraftBoardTypes"
import useTierDividers from '../TierSlider'
import HistoricalStats from "../HistoricalStats"
import { playerShortName } from "@/behavior/presenters"

let viewPlayerIdTimer: NodeJS.Timeout

// Filter options for diff view
export enum DiffFilterOption {
  SHOW_ALL = "Show All",
  SHOW_CHANGED = "Show Changed",
}

// Helper function to detect mobile/touch devices
const isMobileDevice = () => {
  return (('ontouchstart' in window) ||
    (navigator.maxTouchPoints > 0) ||
    // @ts-ignore
    (navigator.msMaxTouchPoints > 0))
}

const EditRankingsView = ({
  playerRanks,
  predictedPicks,
  myPickNum,
  fantasySettings,
  boardSettings,
  currPick,
  predNextTiers,
  rankingSummaries,
  setViewPlayerId,
  rosters,
  playerLib,
  draftStarted,
  hasCustomRanking,
  onReorderPlayer,
  onFinishCustomRanking,
  onUpdateTierBoundary,
  saveCustomRankings,
  loadCurrentRankings,
  selectedPosition,
  setSelectedPosition,
  customAndLatestRankingsDiffs,
  onSyncPendingRankings,
  onRevertPlayerToPreSync,
  diffFilter: externalDiffFilter,
  setDiffFilter: externalSetDiffFilter,
  isDiffFilterDropdownOpen,
  setIsDiffFilterDropdownOpen,
  rankings,
  latestRankings,
}: EditRankingsViewProps) => {
  const [shownPlayerId, setShownPlayerId] = useState<string | null>(null)
  const [shownPlayerBg, setShownPlayerBg] = useState("")
  const [draggedPlayer, setDraggedPlayer] = useState<Player | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  // Touch state for mobile
  const [touchDragActive, setTouchDragActive] = useState(false)
  const [touchStartY, setTouchStartY] = useState(0)
  // Stats modal state
  const [isStatsModalVisible, setIsStatsModalVisible] = useState(false)
  const [modalPlayer, setModalPlayer] = useState<Player | null>(null)
  // Mobile scrollbar state
  const [scrollContainerRef, setScrollContainerRef] = useState<HTMLDivElement | null>(null)
  const [scrollbarRef, setScrollbarRef] = useState<HTMLDivElement | null>(null)
  const [isDraggingScrollbar, setIsDraggingScrollbar] = useState(false)
  // Diff filter state - use external state if provided, otherwise use local state
  const [internalDiffFilter, setInternalDiffFilter] = useState<DiffFilterOption>(DiffFilterOption.SHOW_ALL)
  const diffFilter = (externalDiffFilter as DiffFilterOption) || internalDiffFilter
  const setDiffFilter = externalSetDiffFilter ? 
    (filter: DiffFilterOption) => externalSetDiffFilter(filter) : 
    setInternalDiffFilter

  // Check if there are newer rankings available (different cachedAt timestamps)
  const hasNewerRankings = Boolean(
    latestRankings && 
    rankings.cachedAt && 
    latestRankings.cachedAt && 
    latestRankings.cachedAt !== rankings.cachedAt
  )

  // Function to check if a player has significant diffs
  const hasSignificantDiffs = (playerId: string): boolean => {
    if (!customAndLatestRankingsDiffs || !customAndLatestRankingsDiffs[playerId]) {
      return false
    }
    
    const syncPlayerDiffs = customAndLatestRankingsDiffs[playerId]
    const hasAdpDiff = Boolean(syncPlayerDiffs.adpDiff && syncPlayerDiffs.adpDiff > (fantasySettings.numTeams / 2))
    const hasPosRankDiff = Boolean(syncPlayerDiffs.posRankDiff && syncPlayerDiffs.posRankDiff > (fantasySettings.numTeams / 3))
    
    return hasAdpDiff || hasPosRankDiff
  }

  // Function to filter cards based on diff filter
  const filterCardsByDiffs = (cards: (Player | any)[]): (Player | any)[] => {
    if (diffFilter === DiffFilterOption.SHOW_ALL) {
      return cards
    }
    
    return cards.filter(card => {
      if (isTitleCard(card)) {
        return true // Always show title cards
      }
      
      const player = card as Player
      return hasSignificantDiffs(player.id)
    })
  }

  // Handler for opening stats modal
  const handleOpenStatsModal = (player: Player) => {
    setModalPlayer(player)
    setIsStatsModalVisible(true)
  }

  // Handler for closing stats modal
  const handleCloseStatsModal = () => {
    setIsStatsModalVisible(false)
    setModalPlayer(null)
  }

  // Calculate scrollbar thumb height and visibility
  const getScrollbarMetrics = () => {
    if (!scrollContainerRef) return { thumbHeight: 60, isScrollable: false }
    
    const container = scrollContainerRef
    const containerHeight = container.clientHeight
    const contentHeight = container.scrollHeight
    
    const isScrollable = contentHeight > containerHeight
    if (!isScrollable) return { thumbHeight: 60, isScrollable: false }
    
    // Calculate thumb height as a ratio of visible content to total content
    const ratio = containerHeight / contentHeight
    const minThumbHeight = 40
    const maxThumbHeight = containerHeight * 0.8
    const thumbHeight = Math.max(minThumbHeight, Math.min(maxThumbHeight, containerHeight * ratio))
    
    return { thumbHeight, isScrollable }
  }

  // Mobile scrollbar handlers
  const updateScrollbarPosition = () => {
    if (!scrollContainerRef || !scrollbarRef || !isMobileDevice()) {
      return
    }
    
    const container = scrollContainerRef
    const scrollbar = scrollbarRef
    const scrollbarThumb = scrollbar.querySelector('.scrollbar-thumb') as HTMLElement
    
    if (!scrollbarThumb) {
      return
    }
    
    const { thumbHeight, isScrollable } = getScrollbarMetrics()
    
    if (!isScrollable) {
      scrollbar.style.display = 'none'
      return
    }
    
    scrollbar.style.display = 'block'
    scrollbarThumb.style.height = `${thumbHeight}px`
    
    const maxScrollTop = container.scrollHeight - container.clientHeight
    if (maxScrollTop <= 0) return
    
    const scrollPercentage = container.scrollTop / maxScrollTop
    const maxThumbTop = scrollbar.clientHeight - thumbHeight
    const thumbTop = scrollPercentage * maxThumbTop
    
    scrollbarThumb.style.transform = `translateY(${Math.max(0, Math.min(maxThumbTop, thumbTop))}px)`
  }

  const handleScrollbarMouseDown = (e: React.MouseEvent) => {
    if (!isMobileDevice()) return
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingScrollbar(true)
  }

  const handleScrollbarTouchStart = (e: React.TouchEvent) => {
    if (!isMobileDevice()) return
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingScrollbar(true)
  }

  const handleScrollbarMove = (clientY: number) => {
    if (!isDraggingScrollbar || !scrollContainerRef || !scrollbarRef) return
    
    const scrollbar = scrollbarRef
    const container = scrollContainerRef
    const scrollbarThumb = scrollbar.querySelector('.scrollbar-thumb') as HTMLElement
    
    if (!scrollbarThumb) return
    
    const { thumbHeight } = getScrollbarMetrics()
    const scrollbarRect = scrollbar.getBoundingClientRect()
    const relativeY = clientY - scrollbarRect.top
    
    // Calculate scroll percentage based on thumb position
    const maxThumbTop = scrollbar.clientHeight - thumbHeight
    const thumbTop = Math.max(0, Math.min(maxThumbTop, relativeY - thumbHeight / 2))
    const scrollPercentage = maxThumbTop > 0 ? thumbTop / maxThumbTop : 0
    
    const maxScrollTop = container.scrollHeight - container.clientHeight
    container.scrollTop = scrollPercentage * maxScrollTop
  }

  const handleScrollbarMouseMove = (e: MouseEvent) => {
    handleScrollbarMove(e.clientY)
  }

  const handleScrollbarTouchMove = (e: TouchEvent) => {
    e.preventDefault()
    handleScrollbarMove(e.touches[0].clientY)
  }

  const handleScrollbarEnd = () => {
    setIsDraggingScrollbar(false)
  }

  const draftBoard = useMemo(() => {
    const myCurrRound = myCurrentRound(currPick, myPickNum, fantasySettings.numTeams)
    return getDraftBoard(playerRanks, predictedPicks, myCurrRound)
  }, [playerRanks, predictedPicks, myPickNum, fantasySettings.numTeams, currPick])



  // Get user's roster
  const myRosterIdx = myPickNum - 1
  const myRoster = rosters[myRosterIdx] || { QB: [], RB: [], WR: [], TE: [], picks: [] }
  
  // Helper function to get round for a picked player
  const getPlayerDraftRound = (playerId: string): number => {
    const pickIndex = myRoster.picks.indexOf(playerId)
    if (pickIndex === -1) return 0
    
    // Simple calculation: each position has picks in order, so we can calculate round
    // based on when the player was picked in our roster
    return pickIndex + 1
  }

  const draftBoardView = draftBoard.standardView

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

  // Handle scrollbar dragging events
  useEffect(() => {
    if (!isDraggingScrollbar) return

    document.addEventListener('mousemove', handleScrollbarMouseMove)
    document.addEventListener('mouseup', handleScrollbarEnd)
    document.addEventListener('touchmove', handleScrollbarTouchMove, { passive: false })
    document.addEventListener('touchend', handleScrollbarEnd)

    return () => {
      document.removeEventListener('mousemove', handleScrollbarMouseMove)
      document.removeEventListener('mouseup', handleScrollbarEnd)
      document.removeEventListener('touchmove', handleScrollbarTouchMove)
      document.removeEventListener('touchend', handleScrollbarEnd)
    }
  }, [isDraggingScrollbar])

  // Update scrollbar position when content scrolls
  useEffect(() => {
    if (!scrollContainerRef || !isMobileDevice()) return

    const container = scrollContainerRef
    container.addEventListener('scroll', updateScrollbarPosition)
    
    // Also listen for resize events to update scrollbar when content changes
    const resizeObserver = new ResizeObserver(updateScrollbarPosition)
    resizeObserver.observe(container)
    
    // Initial position update with a slight delay to ensure content is rendered
    const timeoutId = setTimeout(updateScrollbarPosition, 100)

    return () => {
      container.removeEventListener('scroll', updateScrollbarPosition)
      resizeObserver.disconnect()
      clearTimeout(timeoutId)
    }
  }, [scrollContainerRef])

  // Update scrollbar when content changes (e.g., filtering)
  useEffect(() => {
    if (isMobileDevice()) {
      const timeoutId = setTimeout(updateScrollbarPosition, 50)
      return () => clearTimeout(timeoutId)
    }
  }, [draftBoardView, selectedPosition])

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, player: Player) => {
    setDraggedPlayer(player)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', `player-${player.id}`)
    e.dataTransfer.setData('application/json', JSON.stringify(player))
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverIndex(index)
  }

  const handleDragLeave = () => {
    setDragOverIndex(null)
  }

  const handleDrop = (e: React.DragEvent, columnTitle: string, dropIndex: number, tierDividers?: any) => {
    e.preventDefault()
    
    // Check if this is a tier divider being dropped
    if (tierDividers && tierDividers.isDragDataTierDivider(e)) {
      tierDividers.handleTierDividerDropOnPlayer(e, dropIndex)
      setDragOverIndex(null)
      return
    }
    
    // Handle player drops
    if (!draggedPlayer) return

    const positionKey = columnTitle as keyof PlayerRanks
    if (positionKey !== 'Purge' && positionKey !== 'availPlayersByOverallRank' && positionKey !== 'availPlayersByAdp') {
      onReorderPlayer(draggedPlayer.id, positionKey, dropIndex)
    }
    
    setDraggedPlayer(null)
    setDragOverIndex(null)
  }

  // Touch event handlers for mobile
  const handleTouchStart = (e: React.TouchEvent, player: Player) => {
    if (!isMobileDevice()) return
    
    e.preventDefault()
    setDraggedPlayer(player)
    setTouchDragActive(true)
    setTouchStartY(e.touches[0].clientY)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isMobileDevice() || !touchDragActive || !draggedPlayer) return
    
    e.preventDefault()
    const touch = e.touches[0]
    const elementBelow = document.elementFromPoint(touch.clientX, touch.clientY)
    
    if (elementBelow) {
      const cardElement = elementBelow.closest('[data-player-card]')
      if (cardElement) {
        const indexAttr = cardElement.getAttribute('data-player-index')
        const index = indexAttr ? parseInt(indexAttr, 10) : null
        setDragOverIndex(index)
      }
    }
  }

  const handleTouchEnd = (e: React.TouchEvent, columnTitle?: string) => {
    if (!isMobileDevice() || !touchDragActive || !draggedPlayer) return
    
    e.preventDefault()
    const touch = e.changedTouches[0]
    const elementBelow = document.elementFromPoint(touch.clientX, touch.clientY)
    
    if (elementBelow && dragOverIndex !== null) {
      const cardElement = elementBelow.closest('[data-player-card]')
      if (cardElement) {
        const columnAttr = cardElement.getAttribute('data-column-title')
        const indexAttr = cardElement.getAttribute('data-player-index')
        
        if (columnAttr && indexAttr) {
          const positionKey = columnAttr as keyof PlayerRanks
          const dropIndex = parseInt(indexAttr, 10)
          
          if (positionKey !== 'Purge' && positionKey !== 'availPlayersByOverallRank' && positionKey !== 'availPlayersByAdp') {
            onReorderPlayer(draggedPlayer.id, positionKey, dropIndex)
          }
        }
      }
    }
    
    setDraggedPlayer(null)
    setDragOverIndex(null)
    setTouchDragActive(false)
    setTouchStartY(0)
  }

  return (
    <div className="h-full flex flex-col">
      {/* Controls for edit rankings view */}
      <div className="flex flex-row mb-4 align-center flex-shrink-0">
        <div className="flex flex-col text-left">
          <h2 className="text-2xl font-bold">Edit Rankings</h2>
          <p className="text-sm text-gray-600">
            Drag players to reorder rankings • Click tier to edit and click new placement to move
          </p>
          <div className="hidden md:flex flex-col">
            <div className="flex flex-row">
              <button
                  className="p-2 m-1 border rounded-md bg-green-500 text-white hover:bg-green-600"
                  onClick={onFinishCustomRanking}
                >
                  Finish
              </button>
              <button
                className="p-2 m-1 border rounded-md bg-blue-500 text-white hover:bg-blue-600"
                onClick={() => {
                  const success = saveCustomRankings()
                  if (success) {
                    toast.success('Custom rankings saved successfully!')
                  } else {
                    toast.error('Failed to save custom rankings')
                  }
                }}
              >
                Save
              </button>
              { hasCustomRanking &&
                <button
                  className="p-2 m-1 border rounded-md bg-gray-500 text-white hover:bg-gray-600"
                  onClick={loadCurrentRankings}
                >
                  Clear
                </button>
              }
              {hasNewerRankings && (
                <button
                  className="p-2 m-1 border rounded-md bg-yellow-500 text-white hover:bg-yellow-600"
                  onClick={() => {
                    onSyncPendingRankings()
                    toast.success('Rankings synced with latest data!')
                  }}
                >
                  Sync ({Object.keys(customAndLatestRankingsDiffs).length})
                </button>
              )}
            </div>
            <div className="flex flex-row items-center mt-2">
              <label className="text-sm font-medium text-gray-700 mr-2">
                Filter Diffs:
              </label>
              <select
                className="px-3 py-1 border rounded bg-gray-100 shadow text-sm"
                value={diffFilter}
                onChange={(e) => setDiffFilter(e.target.value as DiffFilterOption)}
              >
                {Object.values(DiffFilterOption).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col h-full mb-32 md:mb-4 overflow-hidden">
        {/* Drafted players section - responsive grid */}
        { draftStarted && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-1 mb-4 flex-shrink-0">
            { draftBoardView.filter(column => column.columnTitle !== 'Purge').map( (draftBoardColumn, i) => {
              const { columnTitle } = draftBoardColumn
              const position = columnTitle as FantasyPosition
              const rosterPlayers = (myRoster as any)[position] || []

              // On mobile, only show the selected position's roster
              if (isMobileDevice() && position !== selectedPosition) {
                return null
              }

              return(
                <div key={i} className="flex flex-col">
                  <div className="text-center font-bold mb-1 md:hidden">{columnTitle} Roster</div>
                  { rosterPlayers.map( (playerId: string) => {
                    const player = playerLib[playerId]
                    if (!player) return null
                    const metrics = getPlayerMetrics(player, fantasySettings, boardSettings)
                    const { tier } = metrics
                    const { tierNumber } = tier || {}
                    const { fullName, team } = player
                    const roundDrafted = getPlayerDraftRound(playerId)
                    const tierStyle = getTierStyle(tierNumber)

                    return(
                      <div key={playerId}
                        className={`px-2 py-1 m-1 text-center rounded shadow-md w-full ${tierStyle}`}
                      >
                        <p className="font-semibold">{fullName} ({team})</p>
                        <p className="text-xs">R{roundDrafted} | Tier {tierNumber}</p>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )}
        
        {/* Draft board section with horizontal scroll */}
        <div className="flex-1 overflow-hidden min-h-0">
          <div className="flex flex-row h-full">
            {/* Mobile scrollbar - left side */}
            {isMobileDevice() && (
              <div 
                ref={setScrollbarRef}
                className="w-4 bg-gray-300 rounded-sm mr-2 relative flex-shrink-0 cursor-pointer select-none shadow-inner"
                style={{ 
                  height: '100%',
                  minHeight: '300px',
                  zIndex: 10
                }}
                onMouseDown={handleScrollbarMouseDown}
                onTouchStart={handleScrollbarTouchStart}
              >
                <div 
                  className="scrollbar-thumb absolute w-full bg-blue-500 rounded-sm transition-all duration-200 hover:bg-blue-600 active:bg-blue-700 shadow-sm"
                  style={{ 
                    height: '60px',
                    minHeight: '40px',
                    top: '0px'
                  }}
                />
              </div>
            )}
            
            {/* Main content area */}
            <div 
              ref={setScrollContainerRef}
              className="overflow-x-auto overflow-y-auto h-full flex-1"
            >
              <div className="flex flex-row min-w-full md:min-w-0 w-full">
              { draftBoardView.filter(column => column.columnTitle !== 'Purge').map( (draftBoardColumn, i) => {
                const { columnTitle, cards } = draftBoardColumn

                // On mobile, only show the selected position column
                if (isMobileDevice() && columnTitle !== selectedPosition) {
                  return null
                }

                const posStyle = getPosStyle(columnTitle)
                const playerCards = cards.filter(card => !isTitleCard(card)) as Player[]
                
                // Apply diff filtering to cards
                const filteredCards = filterCardsByDiffs(cards)
                
                // Use the tier dividers hook for this position
                const tierDividers = useTierDividers({
                  position: columnTitle as keyof PlayerRanks,
                  fantasySettings,
                  boardSettings,
                  onUpdateTierBoundary,
                  allCards: cards
                })
                
                return(
                  <div key={i} className="flex flex-row w-full md:w-auto">
                    <div className="flex flex-col w-full md:w-auto">
                      <div className={`p-1 rounded m-1 ${posStyle} border-b-4 border-indigo-500`}>
                        <span className="font-bold underline">{ columnTitle }</span>
                        { Boolean(predNextTiers[columnTitle]) &&
                          <p className="text-xs font-semibold">next-next pick @ tier { predNextTiers[columnTitle] }</p>
                        }
                      </div>

                      { filteredCards.slice(0, 50).map( (card, playerPosIdx) => {
                        // Check if we should render a tier divider before this card
                        const dividerBefore = tierDividers.shouldRenderDividerBefore(playerPosIdx)
                        // Check if we should render a placement indicator before this card
                        const shouldShowPlacement = tierDividers.shouldShowPlacementIndicator(playerPosIdx)
                        
                        return (
                          <React.Fragment key={`card-fragment-${playerPosIdx}`}>
                            {/* Render tier divider if needed */}
                            {dividerBefore && tierDividers.renderTierDivider(dividerBefore, `divider-before-${playerPosIdx}`)}
                            
                            {/* Render placement indicator if tier is active and no divider */}
                            {!dividerBefore && shouldShowPlacement && tierDividers.renderPlacementIndicator(playerPosIdx, `placement-before-${playerPosIdx}`)}
                            
                            {/* Render the card */}
                            {isTitleCard(card) ? (
                              <div key={`${card.title}-${playerPosIdx}`} id={`${card.title}-${playerPosIdx}`}
                                className={`px-2 m-1 text-center border rounded shadow-md relative ${card.bgColor}`}
                              >
                                <div className="flex flex-col text-center items-center">
                                  <p className="text-xs font-semibold flex text-center text-white">
                                    { card.title }
                                  </p>
                                </div>
                              </div>
                            ) : (
                              (() => {
                                const player = card as Player
                                const {
                                  fullName,
                                  id,
                                  team,
                                  position,
                                } = player

                                const metrics = getPlayerMetrics(player, fantasySettings, boardSettings)
                                const { tier, adp, posRank, overallRank } = metrics
                                const { tierNumber } = tier || {}
                                
                                let tierStyle
                                if ( shownPlayerId === id && !!shownPlayerBg ) {
                                  tierStyle = shownPlayerBg
                                } else {
                                  tierStyle = getTierStyle(tierNumber)
                                }

                                const projPlayerTier = getProjectedTier(
                                  player,
                                  boardSettings.ranker,
                                  DataRanker.LAST_SSN_PPG,
                                  fantasySettings,
                                  rankingSummaries,
                                )
                                const projTierText = projPlayerTier ? ` (${((projPlayerTier.upperLimitValue + projPlayerTier.lowerLimitValue) / 2).toFixed(1)} PPG)` : ''
                                
                                const rankText = posRank === undefined ? 'Unranked' : `${position}${posRank}`
                                const isHoveringPlayer = shownPlayerId === id

                                const isDraggedOver = dragOverIndex === playerPosIdx
                                const isDragged = draggedPlayer?.id === id
                                const dragOverStyle = isDraggedOver ? 'border-2 border-dashed border-blue-500 bg-blue-50' : ''
                                const draggedStyle = isDragged ? 'opacity-50' : ''
                                const touchDraggedStyle = touchDragActive && isDragged ? 'z-50 transform scale-105 shadow-2xl' : ''
                                const syncPlayerDiffs = customAndLatestRankingsDiffs ? customAndLatestRankingsDiffs[id] : undefined

                                const majorSyncAdpDiff = syncPlayerDiffs && Boolean(syncPlayerDiffs.adpDiff && syncPlayerDiffs.adpDiff > (fantasySettings.numTeams / 2))
                                const majorSyncPosRankDiff = syncPlayerDiffs && Boolean(syncPlayerDiffs.posRankDiff && syncPlayerDiffs.posRankDiff > (fantasySettings.numTeams / 3))
                                const majorSyncDiff = majorSyncAdpDiff || majorSyncPosRankDiff
                                const cardBorderStyle = isHoveringPlayer || majorSyncDiff ? 'border border-4 border-indigo-500' : 'border'

                                return(
                                  <div key={`${id}-${playerPosIdx}`} id={`${id}-${playerPosIdx}`}
                                    className={`px-2 py-1 m-1 text-center rounded shadow-md ${tierStyle} cursor-move ${cardBorderStyle} ${dragOverStyle} ${draggedStyle} ${touchDraggedStyle}`}
                                    draggable={!isMobileDevice()}
                                    data-player-card="true"
                                    data-player-index={playerPosIdx}
                                    data-column-title={columnTitle}
                                    onDragStart={(e) => !isMobileDevice() && handleDragStart(e, player)}
                                    onDragOver={(e) => !isMobileDevice() && handleDragOver(e, playerPosIdx)}
                                    onDragLeave={() => !isMobileDevice() && handleDragLeave()}
                                    onDrop={(e) => !isMobileDevice() && handleDrop(e, columnTitle, playerPosIdx, tierDividers)}
                                    onTouchStart={(e) => isMobileDevice() && handleTouchStart(e, player)}
                                    onTouchMove={(e) => isMobileDevice() && handleTouchMove(e)}
                                    onTouchEnd={(e) => isMobileDevice() && handleTouchEnd(e, columnTitle)}
                                    onMouseEnter={ () => {
                                      if ( viewPlayerIdTimer ) {
                                        clearTimeout( viewPlayerIdTimer )
                                      }
                                      viewPlayerIdTimer = setTimeout(() => {
                                        setShownPlayerId(id) 
                                        setViewPlayerId(id)
                                      }, 250)
                                    }}
                                    onMouseLeave={ () => {
                                      if ( viewPlayerIdTimer ) {
                                        clearTimeout( viewPlayerIdTimer )
                                      }
                                    }}
                                  >
                                    <div className="flex flex-col text-center items-center">
                                      <div className="flex text-center items-center justify-center w-full md:hidden">
                                        <p className="text-sm font-semibold">
                                          { playerShortName(fullName) } ({team})
                                        </p>
                                        {/* Mobile-only stats button */}
                                        <button 
                                          className="block md:hidden p-1 text-blue-500 hover:text-blue-700 transition-colors"
                                          onClick={(e) => {
                                            e.preventDefault()
                                            e.stopPropagation()
                                            handleOpenStatsModal(player)
                                          }}
                                          onTouchStart={(e) => e.stopPropagation()}
                                          onTouchEnd={(e) => e.stopPropagation()}
                                        >
                                          📊
                                        </button>
                                      </div>
                                      <p className="text-sm font-semibold flex text-center hidden md:block">
                                        { fullName } ({team})
                                      </p>
                                      <p className="text-xs">
                                        { rankText } { tier ? ` - Tier ${tierNumber}${projTierText}` : "" }
                                      </p>
                                      <div className="flex flex-row items-center justify-center align-center">
                                        <p className="text-xs">
                                          ADP {adp ? getRoundAndPickShortText(adp, fantasySettings.numTeams) : ''}
                                        </p>
                                        { majorSyncAdpDiff && (
                                          <p className={`text-xs ${getPickDiffColor(syncPlayerDiffs.adpDiff)} border-2 border-blue-500 text-white rounded px-1 py-0.5 mt-0.5 ml-1`}>
                                            { syncPlayerDiffs.adpDiff > 0 ? '+' : '-' } { Math.abs(syncPlayerDiffs.adpDiff).toFixed(1) }
                                          </p>
                                        )}
                                      </div>
                                      <div className="flex flex-row items-center justify-center align-center">
                                        <p className="text-xs">
                                          OVR Pick {overallRank ? getRoundAndPickShortText(overallRank, fantasySettings.numTeams) : ''}
                                        </p>
                                        { majorSyncPosRankDiff && (
                                          <p className={`text-xs ${getPickDiffColor(syncPlayerDiffs.posRankDiff)} border-2 border-green-500 text-white rounded px-1 py-0.5 mt-0.5 ml-1`}>
                                           { syncPlayerDiffs.posRankDiff > 0 ? '+' : '-' } { Math.abs(syncPlayerDiffs.posRankDiff).toFixed(1) }
                                          </p>
                                        )}
                                      </div>
                                      { syncPlayerDiffs && hasSignificantDiffs(id) && (
                                        <button
                                          className="text-xs bg-red-500 text-white rounded px-2 py-1 mt-1 hover:bg-orange-600 transition-colors"
                                          onClick={(e) => {
                                            e.preventDefault()
                                            e.stopPropagation()
                                            onRevertPlayerToPreSync(id)
                                            toast.success(`Reverted ${fullName} to pre-sync ranking`)
                                          }}
                                          onTouchStart={(e) => e.stopPropagation()}
                                          onTouchEnd={(e) => e.stopPropagation()}
                                        >
                                          Revert
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                )
                              })()
                            )}
                          </React.Fragment>
                        )
                      })}
                      
                      {/* Render placement indicator at the end if tier is active */}
                      {tierDividers.shouldShowPlacementIndicator(50) && tierDividers.renderPlacementIndicator(50, `placement-end`)}
                    </div>
                  </div>
                )
              })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Stats Modal */}
      {isStatsModalVisible && modalPlayer && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-auto relative">
            <button
              className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 text-2xl font-bold z-10"
              onClick={handleCloseStatsModal}
            >
              ×
            </button>
            <HistoricalStats player={modalPlayer} settings={fantasySettings} />
          </div>
        </div>
      )}
    </div>
  )
}

export default EditRankingsView 