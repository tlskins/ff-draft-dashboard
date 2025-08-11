import React, { useState, useMemo, useEffect, useRef } from "react"

import { myCurrentRound, PlayerRanks, Roster } from '../behavior/draft'
import { Player, FantasySettings, BoardSettings, RankingSummary, Rankings } from "../types"
import { DraftView, SortOption, HighlightOption } from "../pages"
import { getDraftBoard } from '../behavior/DraftBoardUtils'
import { isTitleCard, PredictedPicks } from '../types/DraftBoardTypes'
import { getPosStyle } from '../behavior/styles'
import RankingView from './views/RankingView'
import BestAvailByRoundView from './views/BestAvailByRoundView'
import EditRankingsView from './views/EditRankingsView'
import RosterDisplay from './RosterDisplay'
import Dropdown from './dropdown'



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
}: RankingsBoardProps) => {
  const [showPurgedModal, setShowPurgedModal] = useState(false)
  const [showRostersModal, setShowRostersModal] = useState(false)
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const [dropdownAlignment, setDropdownAlignment] = useState<{[key: string]: 'left' | 'right'}>({})

  // Refs for dropdown containers
  const draftViewRef = useRef<HTMLDivElement>(null)
  const sortRef = useRef<HTMLDivElement>(null)
  const highlightRef = useRef<HTMLDivElement>(null)
  const savedRankingsRef = useRef<HTMLDivElement>(null)

  // Calculate optimal dropdown alignment to prevent cutoff
  const calculateDropdownAlignment = (ref: React.RefObject<HTMLDivElement | null>): 'left' | 'right' => {
    if (!ref.current) return 'left'
    
    const rect = ref.current.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const dropdownWidth = 192 // min-w-48 = 12rem = 192px
    const padding = 16 // Some padding from edge
    
    // If there's not enough space on the right, align to the right
    if (rect.left + dropdownWidth + padding > viewportWidth) {
      return 'right'
    }
    
    return 'left'
  }

  // Handle dropdown opening with dynamic positioning
  const handleDropdownToggle = (dropdownType: string, ref: React.RefObject<HTMLDivElement | null>) => {
    if (openDropdown === dropdownType) {
      setOpenDropdown(null)
    } else {
      const alignment = calculateDropdownAlignment(ref)
      setDropdownAlignment(prev => ({ ...prev, [dropdownType]: alignment }))
      setOpenDropdown(dropdownType)
    }
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: Event) => {
      const target = event.target as HTMLElement
      if (!target.closest('.mobile-footer-dropdown')) {
        setOpenDropdown(null)
      }
    }

    if (openDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('touchstart', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [openDropdown])

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
          onUpdateTierBoundary={onUpdateTierBoundary}
          saveCustomRankings={saveCustomRankings}
          loadCurrentRankings={loadCurrentRankings}
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
    <div className="flex flex-col p-4 h-full overflow-y-scroll border border-4 rounded shadow-md bg-white text-sm">
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
    
      <div className="flex flex-row mb-4 align-center justify-center items-center content-center w-full">
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
      <div className="md:hidden fixed bottom-20 left-0 right-0 bg-white border border-gray-300 z-50 mobile-footer-dropdown">
        <div className="flex flex-row">
          {/* Draft View Dropdown */}
          <div className="flex-1 relative" ref={draftViewRef}>
            {openDropdown === 'draftView' && (
              <div className={`absolute bottom-full bg-white border border-gray-300 shadow-lg max-h-48 overflow-y-auto min-w-48 z-10 ${
                dropdownAlignment.draftView === 'right' 
                  ? 'right-0' 
                  : 'left-0'
              }`}>
                {Object.values(DraftView).map((view: DraftView) => (
                  <button
                    key={view}
                    className={`w-full p-3 text-left hover:bg-blue-50 border-b border-gray-200 whitespace-nowrap ${
                      draftView === view ? 'bg-blue-100 font-semibold' : ''
                    }`}
                    disabled={isEditingCustomRanking}
                    onClick={() => {
                      setDraftView(view)
                      setOpenDropdown(null)
                    }}
                  >
                    {view}
                  </button>
                ))}
              </div>
            )}
            <button
              className={`w-full p-3 text-center border-r border-gray-300 shadow-lg ${
                openDropdown === 'draftView' ? 'bg-blue-100' : 'hover:bg-gray-50'
              } ${isEditingCustomRanking ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={isEditingCustomRanking}
              onClick={() => handleDropdownToggle('draftView', draftViewRef)}
            >
              <div className="text-xs text-gray-600">View</div>
            </button>
          </div>

          {/* Sort Option Dropdown - only show on RankingView */}
          {draftView === DraftView.RANKING && (
            <div className="flex-1 relative" ref={sortRef}>
              {openDropdown === 'sort' && (
                <div className={`absolute bottom-full bg-white border border-gray-300 shadow-lg max-h-48 overflow-y-auto min-w-48 z-10 ${
                  dropdownAlignment.sort === 'right' 
                    ? 'right-0' 
                    : 'left-0'
                }`}>
                  {Object.values(SortOption).map((option: SortOption) => (
                    <button
                      key={option}
                      className={`w-full p-3 text-left hover:bg-blue-50 border-b border-gray-200 whitespace-nowrap ${
                        sortOption === option ? 'bg-blue-100 font-semibold' : ''
                      }`}
                      onClick={() => {
                        setSortOption(option)
                        setOpenDropdown(null)
                      }}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              )}
              <button
                className={`w-full p-3 text-center border-r border-gray-300 shadow-lg ${
                  openDropdown === 'sort' ? 'bg-blue-100' : 'hover:bg-gray-50'
                }`}
                onClick={() => handleDropdownToggle('sort', sortRef)}
              >
                <div className="text-xs text-gray-600">Sort</div>
              </button>
            </div>
          )}

          {/* Highlight Option Dropdown - only show on RankingView */}
          {draftView === DraftView.RANKING && (
            <div className="flex-1 relative" ref={highlightRef}>
              {openDropdown === 'highlight' && (
                <div className={`absolute bottom-full bg-white border border-gray-300 shadow-lg max-h-48 overflow-y-auto min-w-48 z-10 ${
                  dropdownAlignment.highlight === 'right' 
                    ? 'right-0' 
                    : 'left-0'
                }`}>
                  {Object.values(HighlightOption).map((option: HighlightOption) => (
                    <button
                      key={option}
                      className={`w-full p-3 text-left hover:bg-blue-50 border-b border-gray-200 whitespace-nowrap ${
                        highlightOption === option ? 'bg-blue-100 font-semibold' : ''
                      }`}
                      onClick={() => {
                        setHighlightOption(option)
                        setOpenDropdown(null)
                      }}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              )}
              <button
                className={`w-full p-3 text-center border-r border-gray-300 shadow-lg ${
                  openDropdown === 'highlight' ? 'bg-blue-100' : 'hover:bg-gray-50'
                }`}
                onClick={() => handleDropdownToggle('highlight', highlightRef)}
              >
                <div className="text-xs text-gray-600">Highlight</div>
              </button>
            </div>
          )}

          {/* Saved Rankings Dropdown - only show if there are options and on ranking view */}
          {draftView === DraftView.RANKING && savedRankingsOptions.length > 0 && (
            <div className="flex-1 relative" ref={savedRankingsRef}>
              {openDropdown === 'savedRankings' && (
                <div className={`absolute bottom-full bg-white border border-gray-300 shadow-lg max-h-48 overflow-y-auto min-w-48 z-10 ${
                  dropdownAlignment.savedRankings === 'right' 
                    ? 'right-0' 
                    : 'left-0'
                }`}>
                  {savedRankingsOptions.map((option) => (
                    <button
                      key={option.title}
                      className="w-full p-3 text-left hover:bg-blue-50 border-b border-gray-200 whitespace-nowrap"
                      onClick={() => {
                        option.callback()
                        setOpenDropdown(null)
                      }}
                    >
                      {option.title}
                    </button>
                  ))}
                </div>
              )}
              <button
                className={`w-full p-3 text-center shadow-lg ${
                  openDropdown === 'savedRankings' ? 'bg-blue-100' : 'hover:bg-gray-50'
                }`}
                onClick={() => handleDropdownToggle('savedRankings', savedRankingsRef)}
              >
                <div className="text-xs text-gray-600">Rankings</div>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default RankingsBoard