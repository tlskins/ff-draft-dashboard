import React, { useState, useMemo } from "react"

import { getPosStyle, getTierStyle, predBgColor, nextPredBgColor, getPickDiffColor } from '../../behavior/styles'
import { myCurrentRound, getPlayerMetrics, getProjectedTier, getRoundIdxForPickNum, getRoundAndPickShortText } from '../../behavior/draft'
import { Player, FantasyPosition, DataRanker, PlayerTarget } from "../../types"
import { SortOption } from "../../pages"
import { HighlightOption } from "../../behavior/hooks/usePredictions"
import { RankingViewProps } from "../../types/DraftBoardTypes"
import { getDraftBoard, getIconTypes } from "../../behavior/DraftBoardUtils"
import { isTitleCard } from "../../types/DraftBoardTypes"
import HistoricalStats from "../HistoricalStats"
import PlayerSearchModal from "../PlayerSearchModal"
import { playerShortName } from "@/behavior/presenters"

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
  rankings,
  playerTargets,
  addPlayerTarget,
  removePlayerTarget,
}: RankingViewProps) => {
  const [shownPlayerBg, setShownPlayerBg] = useState("")
  const [animatingOutPlayers, setAnimatingOutPlayers] = useState<Set<string>>(new Set())
  const [isRosterVisible, setIsRosterVisible] = useState(true)
  const [isStatsModalVisible, setIsStatsModalVisible] = useState(false)
  const [modalPlayer, setModalPlayer] = useState<Player | null>(null)
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false)

  const { AnyTiDelete, AnyAiFillCheckCircle, AnyBsLink } = getIconTypes()

  // Helper function to check if a player is a favorite
  const getPlayerFavorite = (playerId: string): PlayerTarget | undefined => {
    return playerTargets.find(target => target.playerId === playerId)
  }

  // Handler for selecting a player with animation
  const handleSelectPlayer = (player: Player) => {
    // Add player to animating out set
    setAnimatingOutPlayers(prev => new Set(prev).add(player.id))
    
    // After animation completes, call the actual onSelectPlayer
    setTimeout(() => {
      onSelectPlayer(player)
      // Remove from animating set (cleanup, though component may unmount)
      setAnimatingOutPlayers(prev => {
        const newSet = new Set(prev)
        newSet.delete(player.id)
        return newSet
      })
    }, 600) // 600ms total animation time
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

  const draftBoard = useMemo(() => {
    const myCurrRound = myCurrentRound(currPick, myPickNum, fantasySettings.numTeams)
    return getDraftBoard(playerRanks, predictedPicks, myCurrRound)
  }, [playerRanks, predictedPicks, myPickNum, fantasySettings.numTeams, currPick])

  // Get user's roster
  const myRosterIdx = myPickNum - 1
  const myRoster = rosters[myRosterIdx] || { QB: [], RB: [], WR: [], TE: [], picks: [] }
  const myRosterEmpty = useMemo(() => {
    return myRoster.QB.length === 0 && myRoster.RB.length === 0 && myRoster.WR.length === 0 && myRoster.TE.length === 0
  }, [myRoster])
  
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
  const isUsingCustomRanks = rankings.copiedRanker && rankings.cachedAt && rankings.editedAt

  return (
    <>
      {/* Controls for ranking view */}
      <div className="flex flex-row md:mb-16 align-center">
        <div className="flex flex-col text-left h-16 md:h-6 w-full">
          <div className="grid md:grid-cols-2 grid-cols-1">
            <div className="flex flex-col">
              <div className="flex flex-col mb-4">
                <h2 className="text-2xl font-bold">{rankings.copiedRanker ? 'Custom' : ''} Rankings By Position</h2>
                <div className="h-1 flex flex-row">
                  { isUsingCustomRanks &&
                    <p className="text-xs">
                      Base { rankings.copiedRanker } ranks from { new Date(rankings.cachedAt).toLocaleString() } last edited { new Date(rankings.editedAt).toLocaleString() }
                    </p>
                  }
                  {
                    !isUsingCustomRanks && rankings.cachedAt &&
                    <p className="text-xs">
                      Latest rankings from { new Date(rankings.cachedAt).toLocaleString() }
                    </p>
                  }
                  <button
                    onClick={() => setIsSearchModalOpen(true)}
                    className="md:hidden w-12 h-12 bg-purple-500 hover:bg-purple-600 text-white rounded-full shadow-lg flex flex-col items-center justify-center transition-colors"
                    title="Search Players"
                  >
                    🔍
                  </button>
                </div>
              </div>

              <div className="hidden md:flex flex-row">
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
                <button
                  onClick={() => setIsSearchModalOpen(true)}
                  className="p-2 m-1 bg-purple-500 hover:bg-purple-600 text-white rounded-lg shadow transition-colors flex-shrink-0"
                  title="Search Players"
                >
                  🔍
                </button>
              </div>
            </div>
            <div className="hidden md:flex flex-col h-full items-end content-end justify-end pb-2">
              { !showNextPreds &&
                <>
                  <div className="flex flex-row justify-end">
                    <div className={`w-8 h-2 rounded ${ predBgColor }`} />
                    <p className="ml-2 text-xs font-semibold">
                      ({ Object.values(predictedPicks).filter( p => !!p && p > 0 && p < 2 ).length }) players predicted taken before your turn
                    </p>
                  </div>
                  <p className="text-xs mt-1 text-right"> 
                    hold ALT to see players predicted taken before your NEXT turn
                  </p>
                </>
              }
              { showNextPreds &&
                <div className="flex flex-row justify-end">
                  <div className={`w-8 h-2 rounded ${ nextPredBgColor }`} />
                  <p className="ml-2 text-xs text-right">
                    ({ Object.values(predictedPicks).filter( p => !!p && p > 0 && p < 3 ).length }) players predicted taken before your NEXT-NEXT turn
                  </p>
                </div>
              }
              { !rankByAdp &&
                <p className="text-xs text-right"> 
                  hold SHIFT to see players sorted by { boardSettings.adpRanker } ranking
                </p>
              }
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-row h-full mb-32">
        <div className="flex flex-col">
          {/* Render my roster header - always show when draft started and roster not empty */}
          { draftStarted && !myRosterEmpty && (
            <div className="flex flex-row col-span-4 text-center justify-center mb-2">
              <p 
                className="text-sm font-semibold underline cursor-pointer hover:text-blue-600 transition-colors"
                onClick={() => setIsRosterVisible(!isRosterVisible)}
              >
                My Roster {isRosterVisible ? '▼' : '▶'}
              </p>
            </div>
          )}
          
          {/* Render my roster content */}
          { draftStarted && !myRosterEmpty && isRosterVisible && (
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
          
          {/* Position Ranks Player Cards */}
          <div className="flex flex-row overflow-x-auto overflow-y-auto max-h-760 md:max-h-none md:overflow-visible min-w-1000 md:min-w-0">
            { draftBoardView.filter((column: any) => column.columnTitle !== 'Purge').map( (draftBoardColumn: any, i: number) => {
              const { columnTitle, cards } = draftBoardColumn
              const posStyle = getPosStyle(columnTitle)
              return(
                <div key={i} className="flex flex-row w-full md:w-auto">
                  <div className="flex flex-col w-full md:w-auto">
                    <div className={`p-1 rounded m-1 ${posStyle} border-b-4 border-indigo-500 sticky top-0 z-10 md:static`}>
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
                        
                        const isAnimatingOut = animatingOutPlayers.has(id)
                        
                        let tierStyle
                        if ( isAnimatingOut ) {
                          // Apply gray-out animation styling
                          tierStyle = 'bg-white text-black opacity-50 scale-50'
                        } else if ( viewPlayerId === id && !!shownPlayerBg ) {
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
                        const currAdpDiff = Math.abs(currPick - (adp || 0)).toFixed(1)
                        const currRankDiff = Math.abs(currPick - (overallRank || 0)).toFixed(1)
                        const rankDiffScore = ((overallRank || 999) - (adp || 999)) * -1
                        const isHoveringPlayer = viewPlayerId === id
                        const cardBorderStyle = isHoveringPlayer ? 'border border-4 border-indigo-500' : 'border'
                        const playerFavorite = getPlayerFavorite(id)

                        return(
                          <div key={`${id}-${playerPosIdx}`} id={`${id}-${playerPosIdx}`}
                            className={`px-2 py-1 m-1 text-center rounded shadow-md ${tierStyle} cursor-pointer ${cardBorderStyle} transition-all duration-700 ease-in-out transform`}
                            onMouseEnter={ () => {
                              if (!isAnimatingOut) {
                                setViewPlayerId(id)
                              }
                            }}
                          >
                            <div className="flex flex-col text-center items-center">
                              <div className="flex text-center items-center justify-center w-full">
                                { playerFavorite ?
                                  <p className="bg-blue-500 text-white rounded px-1 py-0.5 mt-0.5 ml-1">
                                    { playerShortName(fullName) } ({team}) ★ @ Early as RD {playerFavorite.targetAsEarlyAsRound}
                                  </p>
                                  :
                                  <p className="text-sm font-semibold">
                                    { playerShortName(fullName) } ({team})
                                  </p>
                                }
                                {/* Mobile-only stats button */}
                                <button 
                                  className="block md:hidden p-1 text-blue-500 hover:text-blue-700 transition-colors"
                                  onClick={() => handleOpenStatsModal(player)}
                                >
                                  📊
                                </button>
                              </div>
                              <p className="text-xs">
                                { rankText } ({rankDiffScore > 0 ? '+' : '-'}{Math.abs(rankDiffScore).toFixed(1)} vs ADP) { tier ? ` | Tier ${tierNumber}${projTierText}` : "" }
                              </p>

                              { !rankByAdp &&
                                <p className={`text-xs ${getPickDiffColor(currAdpDiff)} text-white rounded px-1 py-0.5 mt-0.5`}>
                                  NOW { currAdpDiff } { isBelowAdp ? 'BELOW' : 'ABOVE' } ADP Pick {!adp ? 'Undrafted' : getRoundAndPickShortText(adp, fantasySettings.numTeams)}
                                </p>
                              }
                              { rankByAdp &&
                                <p className={`text-xs ${getPickDiffColor(currRankDiff)} text-white rounded px-1 py-0.5 mt-0.5`}>
                                  { currRankDiff } { isBelowRank ? 'BELOW' : 'ABOVE' } Rank
                                </p>
                              }
        
                              { isHoveringPlayer && !isAnimatingOut &&
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
                                    onClick={ () => handleSelectPlayer(player) }
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

      {/* Player Search Modal */}
      <PlayerSearchModal
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
        playerLib={playerLib}
        fantasySettings={fantasySettings}
        boardSettings={boardSettings}
        rankingSummaries={rankingSummaries}
        playerTargets={playerTargets}
        addPlayerTarget={addPlayerTarget}
        removePlayerTarget={removePlayerTarget}
        myPickNum={myPickNum}
        currPick={currPick}
      />
    </>
  )
}

export default RankingView 