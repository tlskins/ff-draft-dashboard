import React, { useState, useMemo } from "react"

import { getPosStyle, getTierStyle } from '../../behavior/styles'
import { myCurrentRound, getPlayerMetrics, getProjectedTier, getRoundIdxForPickNum } from '../../behavior/draft'
import { Player, FantasyPosition, DataRanker } from "../../types"
import { BestAvailByRoundViewProps } from "../../types/DraftBoardTypes"
import { getDraftBoard, getIconTypes } from "../../behavior/DraftBoardUtils"
import { isTitleCard } from "../../types/DraftBoardTypes"

let viewPlayerIdTimer: NodeJS.Timeout

const BestAvailByRoundView = ({
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
}: BestAvailByRoundViewProps) => {
  const [shownPlayerId, setShownPlayerId] = useState<string | null>(null)
  const [shownPlayerBg, setShownPlayerBg] = useState("")

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

  const draftBoardView = draftBoard.predictAvailByRoundView

  return (
    <>
      {/* Info text for best available by round view */}
      <div className="flex flex-row mb-4 align-center">
        <div className="flex flex-col text-left">
          <h2 className="text-2xl font-bold">Best Available By Round</h2>
          <p className="text-xs mt-1 font-semibold text-blue-600"> 
            Showing best predicted players available to you by round
          </p>
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

                        return(
                          <div key={`${id}-${playerPosIdx}`} id={`${id}-${playerPosIdx}`}
                            className={`px-2 py-1 m-1 text-center rounded shadow-md ${tierStyle} cursor-pointer ${cardBorderStyle}`}
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
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}

export default BestAvailByRoundView 