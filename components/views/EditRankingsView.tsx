import React, { useState, useMemo } from "react"

import { getPosStyle, getTierStyle } from '../../behavior/styles'
import { myCurrentRound, getPlayerMetrics, getProjectedTier, getRoundIdxForPickNum, PlayerRanks } from '../../behavior/draft'
import { Player, FantasyPosition, DataRanker } from "../../types"
import { EditRankingsViewProps } from "../../types/DraftBoardTypes"
import { getDraftBoard, getIconTypes } from "../../behavior/DraftBoardUtils"
import { isTitleCard } from "../../types/DraftBoardTypes"
import TierSlider from '../TierSlider'

let viewPlayerIdTimer: NodeJS.Timeout

const EditRankingsView = ({
  playerRanks,
  predictedPicks,
  myPickNum,
  fantasySettings,
  boardSettings,
  currPick,
  predNextTiers,
  rankingSummaries,
  onSelectPlayer,
  onPurgePlayer,
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

  const { AnyTiDelete, AnyAiFillCheckCircle, AnyBsLink } = getIconTypes()

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

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, player: Player) => {
    setDraggedPlayer(player)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverIndex(index)
  }

  const handleDragLeave = () => {
    setDragOverIndex(null)
  }

  const handleDrop = (e: React.DragEvent, columnTitle: string, dropIndex: number) => {
    e.preventDefault()
    if (!draggedPlayer) return

    const positionKey = columnTitle as keyof PlayerRanks
    if (positionKey !== 'Purge' && positionKey !== 'availPlayersByOverallRank' && positionKey !== 'availPlayersByAdp') {
      onReorderPlayer(draggedPlayer.id, positionKey, dropIndex)
    }
    
    setDraggedPlayer(null)
    setDragOverIndex(null)
  }

  return (
    <>
      {/* Controls for edit rankings view */}
      <div className="flex flex-row mb-4 align-center">
        <div className="flex flex-col text-left">
          <h2 className="text-2xl font-bold">Edit Rankings</h2>
          <p className="text-sm text-gray-600">
            Drag players to reorder rankings • Drag tier handles to adjust tier boundaries
          </p>
          <div className="flex flex-col">
            <span className="p-1 m-1 text-sm font-semibold text-green-600">
              Drag players to reorder rankings • Drag tier handles to adjust tier boundaries
            </span>
            <div className="flex flex-row">
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
                  Save Rankings
              </button>
              <button
                  className="p-2 m-1 border rounded-md bg-green-500 text-white hover:bg-green-600"
                  onClick={onFinishCustomRanking}
                >
                  Finish Editing
              </button>
              { hasCustomRanking &&
                <button
                  className="p-2 m-1 border rounded-md bg-gray-500 text-white hover:bg-gray-600"
                  onClick={loadCurrentRankings}
                >
                  Clear Custom Rankings
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
          
          <div className="flex flex-row">
            { draftBoardView.filter(column => column.columnTitle !== 'Purge').map( (draftBoardColumn, i) => {
              const { columnTitle, cards } = draftBoardColumn

              const posStyle = getPosStyle(columnTitle)
              const playerCards = cards.filter(card => !isTitleCard(card)) as Player[]
              
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
                      if ( isTitleCard(card) ) {
                        return (
                          <div key={`${card.title}-${playerPosIdx}`} id={`${card.title}-${playerPosIdx}`}
                            className={`px-2 m-1 text-center border rounded shadow-md relative ${card.bgColor}`}
                          >
                            <div className="flex flex-col text-center items-center">
                              <p className="text-xs font-semibold flex text-center text-white">
                                { card.title }
                              </p>
                            </div>
                          </div>
                        )
                      } else {
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

                        return(
                          <div key={`${id}-${playerPosIdx}`} id={`${id}-${playerPosIdx}`}
                            className={`px-2 py-1 m-1 text-center rounded shadow-md ${tierStyle} cursor-move ${cardBorderStyle} ${dragOverStyle} ${draggedStyle}`}
                            draggable={true}
                            onDragStart={(e) => handleDragStart(e, player)}
                            onDragOver={(e) => handleDragOver(e, playerPosIdx)}
                            onDragLeave={() => handleDragLeave()}
                            onDrop={(e) => handleDrop(e, columnTitle, playerPosIdx)}
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
        
                              { isHoveringPlayer &&
                                <div className={`grid grid-cols-3 items-center justify-items-center gap-2 mt-2 pt-2 w-full border-t`}>
                                  <AnyTiDelete
                                    className="cursor-pointer"
                                    color="red"
                                    onClick={ () => onPurgePlayer(player) }
                                    onMouseEnter={() => setShownPlayerBg("bg-red-500")}
                                    onMouseLeave={() => setShownPlayerBg("")}
                                    size={32}
                                  />
        
                                  <AnyAiFillCheckCircle
                                    className="cursor-pointer"
                                    color="green"
                                    onClick={ () => onSelectPlayer(player) }
                                    onMouseEnter={() => setShownPlayerBg("bg-green-400")}
                                    onMouseLeave={() => setShownPlayerBg("")}
                                    size={26}
                                  />
        
                                  <AnyBsLink
                                    className="cursor-pointer"
                                    color="blue"
                                    onClick={ () => window.open(`https://www.fantasypros.com/nfl/games/${playerUrl}.php`) }
                                    onMouseEnter={() => setShownPlayerBg("bg-blue-400")}
                                    onMouseLeave={() => setShownPlayerBg("")}
                                    size={30}
                                  />
                                </div>
                              }
                            </div>
                          </div>
                        )
                      }
                    })}
                  </div>
                  
                  {/* Tier Slider */}
                  { columnTitle !== 'Purge' && playerCards.length > 0 &&
                    <TierSlider
                      position={columnTitle as keyof PlayerRanks}
                      fantasySettings={fantasySettings}
                      boardSettings={boardSettings}
                      onUpdateTierBoundary={onUpdateTierBoundary}
                      allCards={cards}
                    />
                  }
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