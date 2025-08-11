import React, { useState, useMemo, useEffect } from "react"

import { getPosStyle, getTierStyle } from '../../behavior/styles'
import { myCurrentRound, getPlayerMetrics, getProjectedTier, getRoundIdxForPickNum, PlayerRanks } from '../../behavior/draft'
import { Player, FantasyPosition, DataRanker } from "../../types"
import { EditRankingsViewProps } from "../../types/DraftBoardTypes"
import { getDraftBoard } from "../../behavior/DraftBoardUtils"
import { isTitleCard } from "../../types/DraftBoardTypes"
import useTierDividers from '../TierSlider'

let viewPlayerIdTimer: NodeJS.Timeout

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
}: EditRankingsViewProps) => {
  const [shownPlayerId, setShownPlayerId] = useState<string | null>(null)
  const [shownPlayerBg, setShownPlayerBg] = useState("")
  const [draggedPlayer, setDraggedPlayer] = useState<Player | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  // Touch state for mobile
  const [touchDragActive, setTouchDragActive] = useState(false)
  const [touchStartY, setTouchStartY] = useState(0)

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
    <>
      {/* Controls for edit rankings view */}
      <div className="flex flex-row mb-4 align-center">
        <div className="flex flex-col text-left">
          <h2 className="text-2xl font-bold">Edit Rankings</h2>
          <p className="text-sm text-gray-600">
            {isMobileDevice() 
              ? "Touch and drag players to reorder rankings • Drag tier dividers to adjust tier boundaries"
              : "Drag players to reorder rankings • Drag tier dividers to adjust tier boundaries"
            }
          </p>
          <div className="flex flex-col">
            <span className="p-1 m-1 text-sm font-semibold text-green-600">
              {isMobileDevice() 
                ? "Touch and drag players to reorder rankings • Drag tier dividers to adjust tier boundaries"
                : "Drag players to reorder rankings • Drag tier dividers to adjust tier boundaries"
              }
            </span>
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
                    alert('Custom rankings saved successfully!')
                  } else {
                    alert('Failed to save custom rankings')
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
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-row h-full mb-32">
        <div className="flex flex-col">
          { draftStarted && (
            <div className="flex flex-row justify-center grid grid-cols-4 gap-1">
              { draftBoardView.filter(column => column.columnTitle !== 'Purge').map( (draftBoardColumn, i) => {
                const { columnTitle } = draftBoardColumn
                const position = columnTitle as FantasyPosition
                const rosterPlayers = (myRoster as any)[position] || []

                return(
                  <div key={i} className="flex flex-col">
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
          
          <div className="flex flex-row overflow-x-auto overflow-y-auto max-h-760 md:max-h-none md:overflow-visible min-w-900 md:min-w-0">
            { draftBoardView.filter(column => column.columnTitle !== 'Purge').map( (draftBoardColumn, i) => {
              const { columnTitle, cards } = draftBoardColumn

              const posStyle = getPosStyle(columnTitle)
              const playerCards = cards.filter(card => !isTitleCard(card)) as Player[]
              
              // Use the tier dividers hook for this position
              const tierDividers = useTierDividers({
                position: columnTitle as keyof PlayerRanks,
                fantasySettings,
                boardSettings,
                onUpdateTierBoundary,
                allCards: cards
              })
              
              return(
                <div key={i} className="flex flex-row">
                  <div className="flex flex-col">
                    <div className={`p-1 rounded m-1 ${posStyle} border-b-4 border-indigo-500`}>
                      <span className="font-bold underline">{ columnTitle }</span>
                      { Boolean(predNextTiers[columnTitle]) &&
                        <p className="text-xs font-semibold">next-next pick @ tier { predNextTiers[columnTitle] }</p>
                      }
                    </div>

                    { cards.slice(0, 50).map( (card, playerPosIdx) => {
                      // Check if we should render a tier divider before this card
                      const dividerBefore = tierDividers.shouldRenderDividerBefore(playerPosIdx)
                      
                      return (
                        <React.Fragment key={`card-fragment-${playerPosIdx}`}>
                          {/* Render tier divider if needed */}
                          {dividerBefore && tierDividers.renderTierDivider(dividerBefore, `divider-before-${playerPosIdx}`)}
                          
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
                                firstName,
                                lastName,
                                fullName,
                                id,
                                team,
                                position,
                              } = player

                              const metrics = getPlayerMetrics(player, fantasySettings, boardSettings)
                              const { tier, adp, posRank } = metrics
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
                              
                              const playerUrl = `${firstName.toLowerCase()}-${lastName.toLowerCase()}`
                              const rankText = posRank === undefined ? 'Unranked' : `${position}${posRank}`
                              const adpRound = getRoundIdxForPickNum(adp === undefined ? 999 : Math.floor(adp), fantasySettings.numTeams) + 1
                              const isHoveringPlayer = shownPlayerId === id
                              const cardBorderStyle = isHoveringPlayer ? 'border border-4 border-indigo-500' : 'border'

                              const isDraggedOver = dragOverIndex === playerPosIdx
                              const isDragged = draggedPlayer?.id === id
                              const dragOverStyle = isDraggedOver ? 'border-2 border-dashed border-blue-500 bg-blue-50' : ''
                              const draggedStyle = isDragged ? 'opacity-50' : ''
                              const touchDraggedStyle = touchDragActive && isDragged ? 'z-50 transform scale-105 shadow-2xl' : ''

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
                                    <p className="text-sm font-semibold flex text-center">
                                      { fullName } ({team})
                                    </p>
                                    <p className="text-xs">
                                      { rankText } { tier ? ` - Tier ${tierNumber}${projTierText}` : "" }
                                    </p>
                                    <p className="text-xs text-gray-600">
                                      ADP: R{adpRound} P{adp?.toFixed(1)}
                                    </p>
                                  </div>
                                </div>
                              )
                            })()
                          )}
                        </React.Fragment>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}

export default EditRankingsView 