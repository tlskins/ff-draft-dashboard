import React, { useState, useMemo, useRef } from "react"
import { toast } from 'react-toastify'

import { myCurrentRound, PlayerRanks, Roster } from '../behavior/draft'
import { Player, FantasySettings, BoardSettings, RankingSummary, Rankings, FantasyPosition, PlayerTarget } from "../types"
import { DraftView, SortOption } from "../pages"
import { HighlightOption } from "../behavior/hooks/usePredictions"
import { getDraftBoard } from '../behavior/DraftBoardUtils'
import { isTitleCard, PlayerRankingDiff, PredictedPicks, type RankingLanePosition } from '../types/DraftBoardTypes'
import { getPosStyle } from '../behavior/styles'
import RankingView from './views/RankingView'
import BestAvailByRoundView from './views/BestAvailByRoundView'
import ADPView from './views/ADPView'
import EditRankingsView, { DiffFilterOption } from './views/EditRankingsView'
import RosterDisplay from './RosterDisplay'
import MobileViewFooter from './MobileViewFooter'
import type { RankingProfileControls } from '../behavior/hooks/useRankingProfiles'
import type { DraftSourceHealth } from '../behavior/draft-feed/types'
import type {
  DraftCaptureConnectionState,
  DraftPersistenceBoundary,
  DraftSourceHealthFreshness,
} from '../behavior/boundaryState'
import DraftSourceHealthBadge from './DraftSourceHealthBadge'
import styles from "./DraftDesk.module.css"
import DeskSegmentedControl from "./draft-desk/DeskSegmentedControl"
import DraftDeskTargetsRoundView from "./draft-desk/DraftDeskTargetsRoundView"
import {
  DraftCaptureStatus,
  DraftPersistenceStatus,
} from './DraftBoundaryStatus'



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
  setViewPlayerId: (id: string | null) => void,
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
  rosters: Roster[],
  playerLib: { [key: string]: Player },
  draftStarted: boolean,
  getDraftRoundForPickNum: (pickNum: number) => (string | null)[],
  viewPlayerId: string | null,
  draftHistory: (string | null)[],
  viewRosterIdx: number,
  draftCaptureState: DraftCaptureConnectionState,
  activeDraftListenerTitle: string | null,
  draftSourceHealth: DraftSourceHealth | null,
  draftSourceHealthFreshness: DraftSourceHealthFreshness,
  draftPersistence: DraftPersistenceBoundary,
  onRetryDraftPersistence: () => void,
  loadCurrentRankings: () => void,
  rankings: Rankings,
  latestRankings: Rankings | null,
  removePlayerTargets: (playerIds: string[]) => void,
  replacePlayerTargets: (targets: PlayerTarget[]) => void,
  myPicks: number[],
  playerTargets: PlayerTarget[],
  customAndLatestRankingsDiffs: { [key: string]: PlayerRankingDiff },
  onSyncPendingRankings: () => void,
  onRevertPlayerToPreSync: (playerId: string) => void,
  addPlayerTarget: (player: Player, targetAsEarlyAsRound: number) => void,
  removePlayerTarget: (playerId: string) => void
  rankingProfileControls: RankingProfileControls
  compact?: boolean
  hideCompactModeControl?: boolean
  pinnedPlayerId?: string | null
  onPinPlayer?: (playerId: string) => void
  visiblePositions?: readonly RankingLanePosition[]
  onVisiblePositionsChange?: (positions: RankingLanePosition[]) => void
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
  rosters,
  playerLib,
  draftStarted,
  getDraftRoundForPickNum,
  draftHistory,
  viewRosterIdx,
  draftCaptureState,
  activeDraftListenerTitle,
  draftSourceHealth,
  draftSourceHealthFreshness,
  draftPersistence,
  onRetryDraftPersistence,
  rankings,
  latestRankings,
  loadCurrentRankings,
  onSelectPlayer,
  onPurgePlayer,
  setViewPlayerId,
  viewPlayerId,
  removePlayerTargets,
  playerTargets,
  replacePlayerTargets,
  myPicks,
  customAndLatestRankingsDiffs,
  onSyncPendingRankings,
  onRevertPlayerToPreSync,
  addPlayerTarget,
  removePlayerTarget,
  rankingProfileControls,
  compact = false,
  hideCompactModeControl = false,
  pinnedPlayerId,
  onPinPlayer,
  visiblePositions,
  onVisiblePositionsChange,
}: RankingsBoardProps) => {
  const [showPurgedModal, setShowPurgedModal] = useState(false)
  const [showRostersModal, setShowRostersModal] = useState(false)
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const [adpRoundPage, setAdpRoundPage] = useState(0)
  const [filterRankedBelowAdp, setFilterRankedBelowAdp] = useState(false)

  // Mobile state for EditRankingsView
  const [selectedPosition, setSelectedPosition] = useState<keyof PlayerRanks>(FantasyPosition.QUARTERBACK)
  const [isPositionDropdownOpen, setIsPositionDropdownOpen] = useState(false)
  const [isDiffFilterDropdownOpen, setIsDiffFilterDropdownOpen] = useState(false)
  const [diffFilter, setDiffFilter] = useState<string>(DiffFilterOption.SHOW_ALL)
  const [isEditsDropdownOpen, setIsEditsDropdownOpen] = useState(false)

  // Refs for dropdown containers (still needed for the new component)
  const draftViewRef = useRef<HTMLDivElement>(null)
  const sortRef = useRef<HTMLDivElement>(null)
  const highlightRef = useRef<HTMLDivElement>(null)

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
  const showAdpRound = draftView === DraftView.ADP_ROUND
  const showTargets = draftView === DraftView.TARGETS
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
    customAndLatestRankingsDiffs,
    addPlayerTarget,
    removePlayerTarget,
    compact,
    pinnedPlayerId,
    onPinPlayer,
    visiblePositions,
    onVisiblePositionsChange,
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
          onCancelCustomRanking={onCancelCustomRanking}
          onUpdateTierBoundary={onUpdateTierBoundary}
          loadCurrentRankings={loadCurrentRankings}
          selectedPosition={selectedPosition}
          setSelectedPosition={setSelectedPosition}
          customAndLatestRankingsDiffs={customAndLatestRankingsDiffs}
          onSyncPendingRankings={onSyncPendingRankings}
          onRevertPlayerToPreSync={onRevertPlayerToPreSync}
          diffFilter={diffFilter}
          setDiffFilter={setDiffFilter}
          isDiffFilterDropdownOpen={isDiffFilterDropdownOpen}
          setIsDiffFilterDropdownOpen={setIsDiffFilterDropdownOpen}
          rankings={rankings}
          latestRankings={latestRankings}
          rankingProfileControls={rankingProfileControls}
        />
      )
    }

    if (showAdpRound) {
      return (
        <ADPView
          addPlayerTarget={addPlayerTarget}
          boardSettings={boardSettings}
          compact={compact}
          currPick={currPick}
          adpRoundPage={adpRoundPage}
          fantasySettings={fantasySettings}
          myPickNum={myPickNum}
          myPicks={myPicks}
          onSelectPlayer={onSelectPlayer}
          onAdpRoundPageChange={setAdpRoundPage}
          onPinPlayer={onPinPlayer}
          playerLib={playerLib}
          playerRanks={playerRanks}
          playerTargets={playerTargets}
          rankingSummaries={rankingSummaries}
          removePlayerTarget={removePlayerTarget}
          removePlayerTargets={removePlayerTargets}
          replacePlayerTargets={replacePlayerTargets}
          setViewPlayerId={setViewPlayerId}
          viewPlayerId={viewPlayerId}
          pinnedPlayerId={pinnedPlayerId}
          filterRankedBelowAdp={filterRankedBelowAdp}
          onFilterRankedBelowAdpChange={setFilterRankedBelowAdp}
        />
      )
    }

    if (showTargets) {
      return (
        <DraftDeskTargetsRoundView
          boardSettings={boardSettings}
          currPick={currPick}
          fantasySettings={fantasySettings}
          onPinPlayer={onPinPlayer}
          pinnedPlayerId={pinnedPlayerId}
          playerLib={playerLib}
          playerRanks={playerRanks}
          playerTargets={playerTargets}
          removePlayerTarget={removePlayerTarget}
          setViewPlayerId={setViewPlayerId}
          viewPlayerId={viewPlayerId}
        />
      )
    }

    if (showPredAvailByRound) {
      return <BestAvailByRoundView {...sharedProps} />
    }

    return (
      <RankingView
        {...sharedProps}
        filterRankedBelowAdp={filterRankedBelowAdp}
        sortOption={sortOption}
        setSortOption={setSortOption}
        highlightOption={highlightOption}
        setHighlightOption={setHighlightOption}
        rankings={rankings}
        onEditRankings={() => setDraftView(DraftView.CUSTOM_RANKING)}
        onFilterRankedBelowAdpChange={setFilterRankedBelowAdp}
      />
    )
  }

  return(
    noPlayers ?
    <></>
    :
    <div data-testid="rankings-board" className={`flex h-full flex-col text-sm ${compact ? styles.rankingsBoardCompact : "border border-slate-200 rounded bg-slate-50 md:p-4 p-1"} ${isEditingCustomRanking ? 'overflow-hidden' : 'overflow-y-auto'}`} style={{color: "#0f172a"}}>
      {!compact && <div className="flex flex-col items-center justify-center content-center mb-2">
        <div className="flex flex-col items-center w-full">
          <DraftCaptureStatus
            activeDraftTitle={activeDraftListenerTitle}
            state={draftCaptureState}
          />
          <DraftSourceHealthBadge
            freshness={draftSourceHealthFreshness}
            health={draftSourceHealth}
          />
          <DraftPersistenceStatus
            onRetry={onRetryDraftPersistence}
            persistence={draftPersistence}
          />
        </div>
      </div>}
    
      {(!compact || !hideCompactModeControl) && <div className="flex flex-row mb-2 align-center justify-center items-center content-center w-full">
        <div className="flex flex-col text-left">
          <div className="flex flex-row">
            {compact && !hideCompactModeControl ? (
              <div data-testid="rankings-mode-toggle">
                <DeskSegmentedControl
                  ariaLabel="Rankings mode"
                  disabled={isEditingCustomRanking}
                  items={[
                    {id: DraftView.RANKING, label: "Position"},
                    {id: DraftView.ADP_ROUND, label: "ADP round"},
                    {id: DraftView.TARGETS, label: "Targets"},
                  ]}
                  onSelect={setDraftView}
                  selectedId={[DraftView.ADP_ROUND, DraftView.TARGETS].includes(draftView)
                    ? draftView
                    : DraftView.RANKING}
                />
              </div>
            ) : !compact ? (
              <select
                aria-label="Rankings mode"
                className="hidden md:block px-3 py-1 mx-2 border rounded bg-blue-100 shadow"
                value={draftView}
                disabled={isEditingCustomRanking}
                onChange={ e => setDraftView(e.target.value as DraftView) }
              >
                { Object.values(DraftView).map( (view: DraftView) => <option key={view} value={ view }> { view } </option>) }
              </select>
            ) : null}
            
            { draftView === DraftView.RANKING && (
              <div className="hidden md:flex flex-row">
                { draftStarted && (
                  <>
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
                  </>
                )}
              </div>
            ) }
          </div>
        </div>
      </div>}

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
                { rankings.copiedRanker ?
                  <p className="text-gray-700 mb-6">
                    Edit custom rankings?
                  </p>
                  :
                  <p className="text-gray-700 mb-6">
                    Create custom rankings from <span className="font-bold text-green-600">{boardSettings.ranker}</span> rankings?
                  </p>
                }
                <p className="text-sm text-gray-600 mb-6">
                  You&apos;ll be able to drag players to reorder rankings and adjust tier boundaries.
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
            },
            {
              label: 'Diffs',
              isOpen: isDiffFilterDropdownOpen,
              onToggle: () => setIsDiffFilterDropdownOpen(!isDiffFilterDropdownOpen),
              variant: 'secondary',
              items: Object.values(DiffFilterOption).map((option: string) => ({
                label: option,
                onClick: () => {
                  setDiffFilter(option)
                  setIsDiffFilterDropdownOpen(false)
                },
                isSelected: diffFilter === option
              }))
            },
            {
              label: 'Edits',
              isOpen: isEditsDropdownOpen,
              onToggle: () => setIsEditsDropdownOpen(!isEditsDropdownOpen),
              variant: 'primary',
              items: [
                {
                  label: 'Finish',
                  onClick: () => {
                    onFinishCustomRanking()
                    setIsEditsDropdownOpen(false)
                  }
                },
                ...(hasCustomRanking ? [{
                  label: 'Clear',
                  onClick: () => {
                    try {
                      rankingProfileControls.clearLocal()
                      loadCurrentRankings()
                      toast.success("Saved rankings cleared in this browser")
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : "Unable to clear saved rankings")
                    }
                    setIsEditsDropdownOpen(false)
                  }
                }] : []),
                ...(Object.keys(customAndLatestRankingsDiffs).length > 0 ? [{
                  label: `Sync (${Object.keys(customAndLatestRankingsDiffs).length})`,
                  onClick: () => {
                    onSyncPendingRankings()
                    toast.success('Rankings synced with latest data!')
                    setIsEditsDropdownOpen(false)
                  }
                }] : [])
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
            ] : [])
          ]
        }
        buttons={[]}
        onClickOutside={() => {
          setOpenDropdown(null)
          if (isEditingCustomRanking) {
            setIsPositionDropdownOpen(false)
            setIsDiffFilterDropdownOpen(false)
            setIsEditsDropdownOpen(false)
          }
        }}
      />
    </div>
  )
}

export default RankingsBoard
