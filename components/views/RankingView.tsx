import React, { useState, useMemo } from "react"

import { getPosStyle, getTierStyle, predBgColor, nextPredBgColor, getPickDiffColor } from '../../behavior/styles'
import { myCurrentRound, getPlayerMetrics, getProjectedTier, getRoundIdxForPickNum } from '../../behavior/draft'
import { Player, FantasyPosition, DataRanker } from "../../types"
import { SortOption, HighlightOption } from "../../pages"
import { RankingViewProps } from "../../types/DraftBoardTypes"
import { getDraftBoard, getIconTypes } from "../../behavior/DraftBoardUtils"
import { isTitleCard } from "../../types/DraftBoardTypes"

let viewPlayerIdTimer: NodeJS.Timeout

const RankingView = ({
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
  sortOption,
  setSortOption,
  highlightOption,
  setHighlightOption,
  viewPlayerId,
}: RankingViewProps) => {
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

  const draftBoardView = draftBoard.standardView
  const showNextPreds = highlightOption === HighlightOption.PREDICTED_TAKEN_NEXT_TURN
  const rankByAdp = sortOption === SortOption.ADP

  return (
    <>
      {/* Controls for ranking view */}
      <div className="flex flex-row mb-4 align-center">
        <div className="flex flex-col text-left">
          <div className="flex flex-row">
            <select
                className="p-1 m-1 border rounded bg-blue-100 shadow"
                value={sortOption}
                onChange={ e => setSortOption(e.target.value as SortOption) }
              >
              { Object.values(SortOption).map( (option: SortOption) => <option key={option} value={ option }> { option } </option>) }
            </select>
            <select
                className="p-1 m-1 border rounded bg-blue-100 shadow"
                value={highlightOption}
                onChange={ e => setHighlightOption(e.target.value as HighlightOption) }
              >
              { Object.values(HighlightOption).map( (option: HighlightOption) => <option key={option} value={ option }> { option } </option>) }
            </select>
          </div>
          
          { !showNextPreds &&
            <>
              <div className="flex flex-row">
                <div className={`w-8 h-2 rounded ${ predBgColor }`} />
                <p className="ml-2 text-xs font-semibold">
                  ({ Object.values(predictedPicks).filter( p => !!p && p > 0 && p < 2 ).length }) players predicted taken before your turn
                </p>
              </div>
              <p className="text-xs mt-1"> 
                hold ALT to see players predicted taken before your NEXT turn
              </p>
            </>
          }
          { showNextPreds &&
            <div className="flex flex-row">
              <div className={`w-8 h-2 rounded ${ nextPredBgColor }`} />
              <p className="ml-2 text-xs">
                ({ Object.values(predictedPicks).filter( p => !!p && p > 0 && p < 3 ).length }) players predicted taken before your NEXT-NEXT turn
              </p>
            </div>
          }
          { !rankByAdp &&
            <p className="text-xs mt-1"> 
              hold SHIFT to see players sorted by { boardSettings.adpRanker } ranking
            </p>
          }
        </div>
      </div>

      <div className="flex flex-row h-full mb-32">
        <div className="flex flex-col">
          { draftStarted && (
            <div className="flex flex-row justify-center grid grid-cols-4 gap-1">
              { draftBoardView.filter((column: any) => column.columnTitle !== 'Purge').map( (draftBoardColumn: any, i: number) => {
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
            { draftBoardView.filter((column: any) => column.columnTitle !== 'Purge').map( (draftBoardColumn: any, i: number) => {
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

                    { cards.slice(0, 50).map( (card: any, playerPosIdx: number) => {
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
                        const { tier, adp, posRank, overallRank } = metrics
                        const { tierNumber } = tier || {}
                        
                        let tierStyle
                        if ( viewPlayerId === id && !!shownPlayerBg ) {
                          tierStyle = shownPlayerBg
                        } else if ( showNextPreds && predictedPicks[id] && predictedPicks[id] < 3 ) {
                          tierStyle = `${nextPredBgColor} text-white`
                        } else if ( !showNextPreds && predictedPicks[id] && predictedPicks[id] < 2 ) {
                          tierStyle = `${predBgColor} text-white`
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
                        let rankText
                        if ( rankByAdp ) {
                          rankText = `${boardSettings.adpRanker} ADP #${adp?.toFixed(1)}`
                        } else {
                          rankText = posRank === undefined ? 'Unranked' : `${position}${posRank}`
                        }
                        const isBelowAdp = currPick - (adp || 0) >= 0
                        const isBelowRank = currPick - (overallRank || 0) >= 0
                        const adpRound = getRoundIdxForPickNum(adp === undefined ? 999 : Math.floor(adp), fantasySettings.numTeams) + 1
                        const currAdpDiff = Math.abs(currPick - (adp || 0))
                        const currRankDiff = Math.abs(currPick - (overallRank || 0))
                        const rankDiffScore = ((overallRank || 999) - (adp || 999)) * -1
                        const isHoveringPlayer = viewPlayerId === id
                        const cardBorderStyle = isHoveringPlayer ? 'border border-4 border-indigo-500' : 'border'

                        return(
                          <div key={`${id}-${playerPosIdx}`} id={`${id}-${playerPosIdx}`}
                            className={`px-2 py-1 m-1 text-center rounded shadow-md ${tierStyle} cursor-pointer ${cardBorderStyle}`}
                            onMouseEnter={ () => {
                              setViewPlayerId(id)
                              // if ( viewPlayerIdTimer ) {
                              //   clearTimeout( viewPlayerIdTimer )
                              // }
                              // viewPlayerIdTimer = setTimeout(() => {
                              //   setViewPlayerId(id)
                              // }, 250)
                            }}
                            // onMouseLeave={ () => {
                            //   if ( viewPlayerIdTimer ) {
                            //     clearTimeout( viewPlayerIdTimer )
                            //   }
                            // }}
                          >
                            <div className="flex flex-col text-center items-center">
                              <p className="text-sm font-semibold flex text-center">
                                { fullName } ({team})
                              </p>
                              <p className="text-xs">
                                { rankText } ({rankDiffScore > 0 ? '+' : '-'}{Math.abs(rankDiffScore)} vs ADP) { tier ? ` | Tier ${tierNumber}${projTierText}` : "" }
                              </p>
                              { !rankByAdp &&
                                <p className={`text-xs ${getPickDiffColor(currAdpDiff)} text-white rounded px-1 py-0.5 mt-0.5`}>
                                  NOW { currAdpDiff.toFixed(0) } { isBelowAdp ? 'BELOW' : 'ABOVE' } ADP (R{adpRound} P{adp?.toFixed(1)})
                                </p>
                              }
                              { rankByAdp &&
                                <p className={`text-xs ${getPickDiffColor(currRankDiff)} text-white rounded px-1 py-0.5 mt-0.5`}>
                                  { currRankDiff.toFixed(0) } { isBelowRank ? 'BELOW' : 'ABOVE' } Rank
                                </p>
                              }
        
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

export default RankingView 