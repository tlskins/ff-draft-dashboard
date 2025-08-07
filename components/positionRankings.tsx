import React, { useState, useMemo } from "react"

import { myCurrentRound, PlayerRanks, Roster } from '../behavior/draft'
import { Player, FantasySettings, BoardSettings, RankingSummary } from "../types"
import { DraftView, SortOption, HighlightOption } from "../pages"
import { getDraftBoard } from '../behavior/DraftBoardUtils'
import { isTitleCard, PredictedPicks } from '../types/DraftBoardTypes'
import { getPosStyle } from '../behavior/styles'
import RankingView from './views/RankingView'
import BestAvailByRoundView from './views/BestAvailByRoundView'
import EditRankingsView from './views/EditRankingsView'



interface PositionRankingsProps {
  playerRanks: PlayerRanks,
  predictedPicks: PredictedPicks,
  myPickNum: number,
  noPlayers: boolean,
  fantasySettings: FantasySettings,
  boardSettings: BoardSettings,
  currPick: number,
  predNextTiers: { [key: string]: number },
  rankingSummaries: RankingSummary[],
  onSelectPlayer: (player: Player) => void,
  onPurgePlayer: (player: Player) => void,
  setViewPlayerId: (id: string) => void,
  draftView: DraftView,
  setDraftView: (view: DraftView) => void,
  sortOption: SortOption,
  setSortOption: (option: SortOption) => void,
  highlightOption: HighlightOption,
  setHighlightOption: (option: HighlightOption) => void,
  isEditingCustomRanking: boolean,
  hasCustomRanking: boolean,
  canEditCustomRankings: boolean,
  onReorderPlayer: (playerId: string, position: keyof PlayerRanks, newIndex: number) => void,
  onStartCustomRanking: () => void,
  onFinishCustomRanking: () => void,
  onClearCustomRanking: () => void,
  onUpdateTierBoundary: (position: keyof PlayerRanks, tierNumber: number, newBoundaryIndex: number) => void,
  onCancelCustomRanking: () => void,
  rosters: Roster[],
  playerLib: { [key: string]: Player },
  draftStarted: boolean,
  getDraftRoundForPickNum: (pickNum: number) => (string | null)[],
  viewPlayerId: string | null,
}

const PositionRankings = ({
  playerRanks,
  predictedPicks,
  myPickNum,
  noPlayers,
  currPick,
  predNextTiers,
  fantasySettings,
  boardSettings,
  rankingSummaries,
  draftView,
  setDraftView,
  sortOption,
  setSortOption,
  highlightOption,
  setHighlightOption,
  isEditingCustomRanking,
  hasCustomRanking,
  canEditCustomRankings,
  onReorderPlayer,
  onStartCustomRanking,
  onFinishCustomRanking,
  onClearCustomRanking,
  onUpdateTierBoundary,
  onCancelCustomRanking,
  rosters,
  playerLib,
  draftStarted,
  getDraftRoundForPickNum,

  onSelectPlayer,
  onPurgePlayer,
  setViewPlayerId,
  viewPlayerId,
}: PositionRankingsProps) => {
  const [showPurgedModal, setShowPurgedModal] = useState(false)

  const draftBoard = useMemo(() => {
    const myCurrRound = myCurrentRound(currPick, myPickNum, fantasySettings.numTeams)
    return getDraftBoard(playerRanks, predictedPicks, myCurrRound)
  }, [playerRanks, predictedPicks, myPickNum, fantasySettings.numTeams, currPick])

  const showPredAvailByRound = draftView === DraftView.BEST_AVAILABLE
  const draftBoardView = showPredAvailByRound ? draftBoard.predictAvailByRoundView : draftBoard.standardView

  const purgeColumn = draftBoardView.find((column: any) => column.columnTitle === 'Purge')
  const purgedCount = purgeColumn?.cards?.filter((card: any) => !isTitleCard(card)).length || 0

  // Shared props that all views need
  const sharedProps = {
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
    getDraftRoundForPickNum,
    viewPlayerId,
  }

  const renderCurrentView = () => {
    if (isEditingCustomRanking) {
      return (
        <EditRankingsView
          {...sharedProps}
          hasCustomRanking={hasCustomRanking}
          canEditCustomRankings={canEditCustomRankings}
          onReorderPlayer={onReorderPlayer}
          onFinishCustomRanking={onFinishCustomRanking}
          onClearCustomRanking={onClearCustomRanking}
          onUpdateTierBoundary={onUpdateTierBoundary}
        />
      )
    }

    if (showPredAvailByRound) {
      return <BestAvailByRoundView {...sharedProps} />
    }

    return (
      <RankingView
        {...sharedProps}
        sortOption={sortOption}
        setSortOption={setSortOption}
        highlightOption={highlightOption}
        setHighlightOption={setHighlightOption}
      />
    )
  }

  return(
    noPlayers ?
    <></>
    :
    <div className="flex flex-col p-4 h-screen overflow-y-scroll border border-4 rounded shadow-md bg-white text-sm">
      <div className="flex flex-row mb-4 align-center">
        <div className="flex flex-col text-left">
          <div className="flex flex-row">
            <select
                className="p-1 m-1 border rounded bg-blue-100 shadow"
                value={draftView}
                onChange={ e => setDraftView(e.target.value as DraftView) }
              >
              { Object.values(DraftView).map( (view: DraftView) => <option key={view} value={ view }> { view } </option>) }
            </select>
            
            <button
              className="p-1 m-1 border rounded bg-red-500 text-white shadow hover:bg-red-600"
              onClick={() => setShowPurgedModal(true)}
            >
              View Purged Players ({purgedCount})
            </button>
          </div>
        </div>
      </div>

      {renderCurrentView()}

      {/* Custom Ranking Confirmation Modal */}
      {draftView === DraftView.CUSTOM_RANKING && !isEditingCustomRanking && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Create Custom Ranking
            </h3>
            {canEditCustomRankings ? (
              <>
                <p className="text-gray-700 mb-6">
                  Create a custom ranking based on <span className="font-bold text-green-600">{boardSettings.ranker}</span> rankings?
                </p>
                <p className="text-sm text-gray-600 mb-6">
                  You'll be able to drag players to reorder rankings and adjust tier boundaries.
                </p>
                <div className="flex justify-end space-x-3">
                  <button
                    onClick={onCancelCustomRanking}
                    className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                  >
                    No
                  </button>
                  <button
                    onClick={onStartCustomRanking}
                    className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600"
                  >
                    Yes
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-red-600 mb-6">
                  Cannot create custom rankings when players have been drafted or purged.
                </p>
                <div className="flex justify-end">
                  <button
                    onClick={onCancelCustomRanking}
                    className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600"
                  >
                    OK
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Purged Players Modal */}
      {showPurgedModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-4xl w-full mx-4 max-h-96 overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-red-800">
                Purged Players
              </h3>
              <button
                onClick={() => setShowPurgedModal(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ×
              </button>
            </div>
            
            { (() => {
              const purgeColumn = draftBoardView.find((column: any) => column.columnTitle === 'Purge')
              const playerCards = purgeColumn?.cards?.filter((card: any) => !isTitleCard(card)) as Player[] || []
              
              if (playerCards.length === 0) {
                return (
                  <p className="text-gray-600 text-center py-8">
                    No players have been purged.
                  </p>
                )
              }
              
              return (
                <>
                  <p className="text-sm text-red-600 mb-4">
                    Click on any player to remove them from the purge list.
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    { playerCards.map( (player, playerPosIdx) => {
                      const {
                        fullName,
                        id,
                        team,
                        position,
                      } = player

                      const posStyle = getPosStyle(position)

                      return(
                        <div key={`purged-${id}-${playerPosIdx}`}
                          className={`px-3 py-2 rounded shadow-md cursor-pointer border hover:border-gray-500 transition-colors ${posStyle}`}
                          onClick={() => {
                            onPurgePlayer(player)
                            // Close modal if no more purged players
                            const remainingPurged = playerCards.length - 1
                            if (remainingPurged === 0) {
                              setShowPurgedModal(false)
                            }
                          }}
                        >
                          <div className="flex flex-col text-center items-center">
                            <p className="text-sm font-semibold">
                              { fullName }
                            </p>
                            <p className="text-xs">
                              { position } - { team }
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}

export default PositionRankings