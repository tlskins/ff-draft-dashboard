import React, { useState, useMemo, useRef, useEffect } from "react"

import { myCurrentRound, PlayerRanks, Roster } from '../behavior/draft'
import { Player, FantasySettings, BoardSettings, RankingSummary, Rankings, FantasyPosition, PlayerTarget } from "../types"
import { DraftView, SortOption } from "../pages"
import { HighlightOption } from "../behavior/hooks/usePredictions"
import { getDraftBoard } from '../behavior/DraftBoardUtils'
import { isTitleCard, PredictedPicks } from '../types/DraftBoardTypes'
import { getPosStyle } from '../behavior/styles'
import RankingView from './views/RankingView'
import BestAvailByRoundView from './views/BestAvailByRoundView'
import EditRankingsView from './views/EditRankingsView'
import RosterDisplay from './RosterDisplay'
import Dropdown from './dropdown'
import MobileViewFooter from './MobileViewFooter'



interface RankingsBoardProps {
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
  onUpdateTierBoundary: (position: keyof PlayerRanks, tierNumber: number, newBoundaryIndex: number) => void,
  onCancelCustomRanking: () => void,
  saveCustomRankings: () => boolean,
  loadCustomRankings: () => boolean,
  hasCustomRankingsSaved: () => boolean,
  clearSavedCustomRankings: () => boolean,
  rosters: Roster[],
  playerLib: { [key: string]: Player },
  draftStarted: boolean,
  getDraftRoundForPickNum: (pickNum: number) => (string | null)[],
  viewPlayerId: string | null,
  draftHistory: (string | null)[],
  viewRosterIdx: number,
  listenerActive: boolean,
  activeDraftListenerTitle: string | null,
  loadCurrentRankings: () => void,
  rankings: Rankings,
  removePlayerTargets: (playerIds: string[]) => void,
  playerTargets: PlayerTarget[]
}

const RankingsBoard = ({
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
  onUpdateTierBoundary,
  onCancelCustomRanking,
  saveCustomRankings,
  loadCustomRankings,
  hasCustomRankingsSaved,
  clearSavedCustomRankings,
  rosters,
  playerLib,
  draftStarted,
  getDraftRoundForPickNum,
  draftHistory,
  viewRosterIdx,
  listenerActive,
  activeDraftListenerTitle,
  rankings,
  loadCurrentRankings,
  onSelectPlayer,
  onPurgePlayer,
  setViewPlayerId,
  viewPlayerId,
  playerTargets,
}: RankingsBoardProps) => {
  const [showPurgedModal, setShowPurgedModal] = useState(false)
  const [showRostersModal, setShowRostersModal] = useState(false)
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)

  // Mobile state for EditRankingsView
  const [selectedPosition, setSelectedPosition] = useState<keyof PlayerRanks>(FantasyPosition.QUARTERBACK)
  const [isPositionDropdownOpen, setIsPositionDropdownOpen] = useState(false)

  // Refs for dropdown containers (still needed for the new component)
  const draftViewRef = useRef<HTMLDivElement>(null)
  const sortRef = useRef<HTMLDivElement>(null)
  const highlightRef = useRef<HTMLDivElement>(null)
  const savedRankingsRef = useRef<HTMLDivElement>(null)

  // Handle dropdown opening (simplified for new component)
  const handleDropdownToggle = (dropdownType: string, ref: React.RefObject<HTMLDivElement | null>) => {
    if (openDropdown === dropdownType) {
      setOpenDropdown(null)
    } else {
      setOpenDropdown(dropdownType)
    }
  }

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
    playerTargets,
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
          onUpdateTierBoundary={onUpdateTierBoundary}
          saveCustomRankings={saveCustomRankings}
          loadCurrentRankings={loadCurrentRankings}
          selectedPosition={selectedPosition}
          setSelectedPosition={setSelectedPosition}
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
        rankings={rankings}
      />
    )
  }

  const hasSavedCustomRankings = hasCustomRankingsSaved()

  const savedRankingsOptions = useMemo(() => {
    const dropdownOptions = []

    if (!hasSavedCustomRankings) {
      return []
    }

    dropdownOptions.push({
      title: "Delete Saved Rankings",
      callback: () => {
        clearSavedCustomRankings()
        loadCurrentRankings()
      }
    })
                  
    if (canEditCustomRankings && !rankings.copiedRanker) {
      dropdownOptions.push({
        title: "Load Saved Rankings",
        callback: () => {
          const success = loadCustomRankings()
          if (success) {
            // Optionally show a success message or update UI state
            console.log('Custom rankings loaded successfully')
          }
        }
      })
    }
    
    if (rankings.copiedRanker) {
      dropdownOptions.push({
        title: "Load Latest Rankings",
        callback: loadCurrentRankings
      })
    }

    return dropdownOptions
  }, [hasSavedCustomRankings, canEditCustomRankings, rankings.copiedRanker, loadCurrentRankings, clearSavedCustomRankings])


  return(
    noPlayers ?
    <></>
    :
    <div className={`flex flex-col md:p-4 p-1 h-full border border-4 rounded shadow-md bg-white text-sm ${isEditingCustomRanking ? 'overflow-hidden' : 'overflow-y-scroll'}`}>
      <div className="hidden md:flex flex-col items-center justify-center content-center mb-2">
        <div className="flex flex-col items-center w-full">
          { (!activeDraftListenerTitle && !listenerActive) &&
            <p className="bg-gray-300 font-semibold shadow rounded-md text-sm my-1 px-4">
              Listener inactive
            </p>
          }
          { (!activeDraftListenerTitle && listenerActive) &&
            <p className="bg-yellow-300 font-semibold shadow rounded-md text-sm my-1 px-4">
              Listener active...
            </p>
          }
          { activeDraftListenerTitle &&
            <p className="bg-green-300 font-semibold shadow rounded-md text-sm my-1 px-4">
              Listening to: { activeDraftListenerTitle }
            </p>
          }
        </div>
      </div>  
    
      <div className="flex flex-row md:mb-4 align-center justify-center items-center content-center w-full">
        <div className="flex flex-col text-left">
          <div className="flex flex-row">
            <select
              className="hidden md:block px-3 py-1 mx-2 border rounded bg-blue-100 shadow"
              value={draftView}
              disabled={isEditingCustomRanking}
              onChange={ e => setDraftView(e.target.value as DraftView) }
            >
              { Object.values(DraftView).map( (view: DraftView) => <option key={view} value={ view }> { view } </option>) }
            </select>
            
            { draftView === DraftView.RANKING && (
              <div className="hidden md:flex flex-row">
                <button
                  className="px-3 py-1 text-sm rounded shadow bg-red-300 hover:bg-red-600 hover:text-white mx-2"
                  onClick={() => setShowPurgedModal(true)}
                >
                  View Purged Players ({purgedCount})
                </button>
                <button
                  className="px-3 py-1 text-sm rounded shadow bg-green-300 hover:bg-green-600 hover:text-white mx-2"
                  onClick={() => setShowRostersModal(true)}
                >
                  View Rosters
                </button>
                { savedRankingsOptions.length > 0 && (
                  <Dropdown
                    title="Manage Saved Rankings"
                    options={savedRankingsOptions}
                    className="bg-purple-300 hover:text-white hover:bg-purple-800 mx-2"
                  />
                )}
              </div>
            ) }
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

      {/* Rosters Modal */}
      {showRostersModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="relative w-full h-full flex items-center justify-center">
            <RosterDisplay
              rosters={rosters}
              draftHistory={draftHistory}
              playerLib={playerLib}
              settings={fantasySettings}
              viewRosterIdx={viewRosterIdx}
            />
            <button
              onClick={() => setShowRostersModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-2xl z-10 bg-white rounded-full w-8 h-8 flex items-center justify-center shadow-lg"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Mobile Footer */}
      <MobileViewFooter
        dropdowns={
          isEditingCustomRanking ? [
            {
              label: `Position: ${selectedPosition === FantasyPosition.QUARTERBACK ? 'QB' : 
                               selectedPosition === FantasyPosition.RUNNING_BACK ? 'RB' :
                               selectedPosition === FantasyPosition.WIDE_RECEIVER ? 'WR' : 'TE'}`,
              isOpen: isPositionDropdownOpen,
              onToggle: () => setIsPositionDropdownOpen(!isPositionDropdownOpen),
              variant: 'purple',
              items: [
                {
                  label: 'QB',
                  onClick: () => {
                    setSelectedPosition(FantasyPosition.QUARTERBACK)
                    setIsPositionDropdownOpen(false)
                  },
                  isSelected: selectedPosition === FantasyPosition.QUARTERBACK
                },
                {
                  label: 'RB',
                  onClick: () => {
                    setSelectedPosition(FantasyPosition.RUNNING_BACK)
                    setIsPositionDropdownOpen(false)
                  },
                  isSelected: selectedPosition === FantasyPosition.RUNNING_BACK
                },
                {
                  label: 'WR',
                  onClick: () => {
                    setSelectedPosition(FantasyPosition.WIDE_RECEIVER)
                    setIsPositionDropdownOpen(false)
                  },
                  isSelected: selectedPosition === FantasyPosition.WIDE_RECEIVER
                },
                {
                  label: 'TE',
                  onClick: () => {
                    setSelectedPosition(FantasyPosition.TIGHT_END)
                    setIsPositionDropdownOpen(false)
                  },
                  isSelected: selectedPosition === FantasyPosition.TIGHT_END
                }
              ]
            }
          ] : [
            {
              label: 'View',
              isOpen: openDropdown === 'draftView',
              onToggle: () => handleDropdownToggle('draftView', draftViewRef),
              variant: 'primary',
              items: Object.values(DraftView).map((view: DraftView) => ({
                label: view,
                onClick: () => {
                  setDraftView(view)
                  setOpenDropdown(null)
                },
                disabled: isEditingCustomRanking,
                isSelected: draftView === view
              }))
            },
            ...(draftView === DraftView.RANKING ? [
              {
                label: 'Sort',
                isOpen: openDropdown === 'sort',
                onToggle: () => handleDropdownToggle('sort', sortRef),
                variant: 'secondary' as const,
                items: Object.values(SortOption).map((option: SortOption) => ({
                  label: option,
                  onClick: () => {
                    setSortOption(option)
                    setOpenDropdown(null)
                  },
                  isSelected: sortOption === option
                }))
              },
              {
                label: 'Highlight',
                isOpen: openDropdown === 'highlight',
                onToggle: () => handleDropdownToggle('highlight', highlightRef),
                variant: 'secondary' as const,
                items: Object.values(HighlightOption).map((option: HighlightOption) => ({
                  label: option,
                  onClick: () => {
                    setHighlightOption(option)
                    setOpenDropdown(null)
                  },
                  isSelected: highlightOption === option
                }))
              },
              ...(savedRankingsOptions.length > 0 ? [{
                label: 'Rankings',
                isOpen: openDropdown === 'savedRankings',
                onToggle: () => handleDropdownToggle('savedRankings', savedRankingsRef),
                variant: 'secondary' as const,
                items: savedRankingsOptions.map((option) => ({
                  label: option.title,
                  onClick: () => {
                    option.callback()
                    setOpenDropdown(null)
                  }
                }))
              }] : [])
            ] : [])
          ]
        }
        buttons={
          isEditingCustomRanking ? [
            {
              label: 'Finish',
              onClick: onFinishCustomRanking,
              variant: 'primary'
            },
            {
              label: 'Save',
              onClick: () => {
                const success = saveCustomRankings()
                if (success) {
                  alert('Custom rankings saved successfully!')
                } else {
                  alert('Failed to save custom rankings')
                }
              },
              variant: 'secondary'
            },
            ...(hasCustomRanking ? [{
              label: 'Clear',
              onClick: loadCurrentRankings,
              variant: 'danger' as const
            }] : [])
          ] : []
        }
        onClickOutside={() => {
          setOpenDropdown(null)
          if (isEditingCustomRanking) {
            setIsPositionDropdownOpen(false)
          }
        }}
      />
    </div>
  )
}

export default RankingsBoard