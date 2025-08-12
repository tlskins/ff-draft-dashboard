/*global chrome*/
import React, { useEffect, useState, useCallback, FC } from "react"

import PageHead from "../components/pageHead"
import Header from "../components/Header"
import RankingsBoard from "../components/RankingsBoard"
import HistoricalStats from "../components/HistoricalStats"
import RankingSummaryDisplay from "../components/RankingSummary"
import ADPView from "../components/views/ADPView"
import OptimalRosterDisplay from "../components/OptimalRosterDisplay"
import PickHistoryFooter from "../components/PickHistoryFooter"
import MobileFooter, { MobileView } from "../components/MobileFooter"
import MobileTiersView from "../components/MobileTiersView"

import { useRanks } from '../behavior/hooks/useRanks'
import { useDraftBoard } from '../behavior/hooks/useDraftBoard'
import { useDraftListener } from '../behavior/hooks/useDraftListener'
import { usePredictions } from "../behavior/hooks/usePredictions"
import { Player, ThirdPartyRanker } from "types"
import { getPlayerData } from "@/behavior/playerData"

export enum DraftView {
  RANKING = "Rankings By Position",
  BEST_AVAILABLE = "Best Available By Round",
  CUSTOM_RANKING = "Create Custom Ranking",
}

export enum SortOption {
  RANKS = "Sort By Ranks",
  ADP = "Sort By ADP",
}

export enum HighlightOption {
  PREDICTED_TAKEN = "Highlight Next Taken",
  PREDICTED_TAKEN_NEXT_TURN = "Highlight Next-Next Taken",
}

const Home: FC = () => {
  const {
    // state
    settings, setNumTeams, setIsPpr,
    draftStarted, setDraftStarted,
    myPickNum, setMyPickNum,
    currPick, setCurrPick,
    // memo
    roundIdx,
    isEvenRound,
    currRoundPick,
    currMyPickNum,
    myPicks,
    // funcs
    onNavRoundUp,
    onNavRoundDown,
  } = useDraftBoard({
    defaultNumTeams: 12,
    defaultMyPickNum: 6,
  })

  // ranks depend on draft board
  const {
    // state
    rankingSummaries,
    boardSettings,
    playerRanks,
    playerLib,
    playersByPosByTeam,
    noPlayers,
    rosters,
    draftHistory,
    isEditingCustomRanking,
    playerTargets,
    rankings,
    // funcs
    onDraftPlayer,
    onRemoveDraftedPlayer,
    getDraftRoundForPickNum,
    onPurgeAvailPlayer,
    onApplyRankingSortBy,
    onSetRanker,
    onSetAdpRanker,
    // custom ranking funcs
    canEditCustomRankings,
    onStartCustomRanking,
    onFinishCustomRanking,
    onReorderPlayerInPosition,
    onUpdateTierBoundary,
    // player targeting funcs
    addPlayerTarget,
    removePlayerTarget,
    replacePlayerTargets,
    removePlayerTargets,
    // save/load custom rankings funcs
    saveCustomRankings,
    loadCustomRankings,
    hasCustomRankingsSaved,
    clearSavedCustomRankings,
    resetBoardSettings,
    onLoadPlayers,
  } = useRanks({ settings, myPickNum })

  const usingCustomRanking = boardSettings.ranker === ThirdPartyRanker.CUSTOM

  const {
    listenerActive,
    activeDraftListenerTitle,
  } = useDraftListener({
    playerLib,
    playersByPosByTeam,
    rosters,
    settings,
    onDraftPlayer,
    setCurrPick,
    setDraftStarted,
    draftStarted,
  })

  const {
    predictedPicks,
    predNextTiers,
    setNumPostPredicts,
    optimalRosters,
  } = usePredictions({
    rosters,
    playerRanks,
    settings,
    boardSettings,
    currPick,
    myPickNum,
    draftStarted,
    rankingSummaries,
  })

  const [draftView, setDraftView] = useState<DraftView>(DraftView.RANKING)
  const [sortOption, setSortOption] = useState<SortOption>(SortOption.RANKS)
  const [highlightOption, setHighlightOption] = useState<HighlightOption>(HighlightOption.PREDICTED_TAKEN)
  const [viewPlayerId, setViewPlayerId] = useState<string | null>(null)
  const [selectedOptimalRosterIdx, setSelectedOptimalRosterIdx] = useState(0)
  const [mobileView, setMobileView] = useState<MobileView>(MobileView.HEADER)

  const loadCurrentRankings = useCallback(() => {
    const currentRankings = getPlayerData()
    if (currentRankings) {
      onLoadPlayers(currentRankings)
      resetBoardSettings()
    }
  }, [onLoadPlayers, resetBoardSettings])

  useEffect(() => {
    loadCurrentRankings()
  }, [])

  // Custom ranking state - modal now shows automatically when draftView === CUSTOM_RANKING
  
  const currentOptimalRoster = optimalRosters[selectedOptimalRosterIdx] || optimalRosters[0]

  const currRound = getDraftRoundForPickNum(currPick)

  // board navigation listener

  useEffect(() => {
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [predictedPicks, playerLib, settings.ppr, noPlayers, currPick, predNextTiers])

  // key press / up commands
  const onKeyUp = useCallback( (e: KeyboardEvent) => {
    if (['MetaRight', 'MetaLeft'].includes(e.code) && draftView !== DraftView.CUSTOM_RANKING) {
      setHighlightOption(HighlightOption.PREDICTED_TAKEN)
    } else if (['ShiftLeft', 'ShiftRight'].includes(e.code) && draftView !== DraftView.CUSTOM_RANKING) {
      // sort by harris
      onApplyRankingSortBy( false )
      setSortOption(SortOption.RANKS)
    } else if (['KeyZ'].includes(e.code) && draftView !== DraftView.CUSTOM_RANKING) {
      // show predicted avail by round
      setDraftView(DraftView.RANKING)
    }
  }, [playerLib, playerRanks, settings.ppr, noPlayers, currPick, predNextTiers])

  const onKeyDown = useCallback( (e: KeyboardEvent) => {
    // arrow up
    if (e.code === 'ArrowUp' ) {
      onNavRoundUp()
    // arrow down
    } else if (e.code === 'ArrowDown') {
      onNavRoundDown(draftHistory)
    // arrow left
    } else if ( e.code === 'ArrowLeft' ) {
      // onNavLeft()
    // arrow right
    } else if ( e.code === 'ArrowRight' ) {
      // onNavRight(draftHistory)
      // alt 
    } else if (['MetaRight', 'MetaLeft'].includes(e.code) && draftView !== DraftView.CUSTOM_RANKING) {
      setHighlightOption(HighlightOption.PREDICTED_TAKEN_NEXT_TURN)
    // shift 
    } else if (['ShiftLeft', 'ShiftRight'].includes(e.code) && draftView !== DraftView.CUSTOM_RANKING) {
      onApplyRankingSortBy( true )
      setSortOption(SortOption.ADP)
    } else if (['KeyZ'].includes(e.code) && draftView !== DraftView.CUSTOM_RANKING) {
      // show predicted avail by round
      setDraftView(DraftView.BEST_AVAILABLE)
    }
  }, [ playerLib, playerRanks, settings.ppr, noPlayers, currPick, predNextTiers, draftHistory])


  // drafting

  const onSelectPlayer = (player: Player) => {
    onDraftPlayer(player.id, currPick)
    setCurrPick(currPick+1)
    if ( !draftStarted ) {
      setDraftStarted(true)
    }
  }

  const onRemovePick = (pickNum: number) => {
    onRemoveDraftedPlayer(pickNum)
    setCurrPick(pickNum)
    onChangeNumPostPredicts(1)
  }

  const onChangeNumPostPredicts = (num: number) => {
    setNumPostPredicts(num)
  }

  // Custom ranking wrapper functions
  const handleStartCustomRanking = () => {
    const success = onStartCustomRanking(boardSettings.ranker as ThirdPartyRanker)
    if (success) {
      setDraftView(DraftView.CUSTOM_RANKING)
    }
  }

  const handleFinishCustomRanking = () => {
    onFinishCustomRanking()
    setDraftView(DraftView.RANKING)
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen relative">
      <PageHead />
      <main className="flex flex-col items-center justify-center w-full flex-1 md:px-20 text-center bg-gray-50">
        {/* Desktop Header Section */}
        <div className="hidden md:block">
          <Header
            settings={settings}
            boardSettings={boardSettings}
            draftStarted={draftStarted}
            myPickNum={myPickNum}
            setNumTeams={setNumTeams}
            setIsPpr={setIsPpr}
            setMyPickNum={setMyPickNum}
            onSetRanker={onSetRanker}
            onSetAdpRanker={onSetAdpRanker}
          />
        </div>

        <div className="flex flex-col items-center md:mt-4 mt-1 w-full h-screen">
          {/* Desktop Layout */}
          <div className="hidden md:grid justify-center w-screen relative mb-4 grid grid-cols-12 gap-1 px-1">
            {/* Stats Column */}
            <div className="md:col-span-3">
              <div className="justify-start ml-2 p-1 w-full">
                <OptimalRosterDisplay
                  currentOptimalRoster={currentOptimalRoster}
                  optimalRosters={optimalRosters}
                  selectedOptimalRosterIdx={selectedOptimalRosterIdx}
                  setSelectedOptimalRosterIdx={setSelectedOptimalRosterIdx}
                  boardSettings={boardSettings}
                  settings={settings}
                  rankingSummaries={rankingSummaries}
                />
                <RankingSummaryDisplay
                  activePlayer={viewPlayerId ? playerLib[viewPlayerId] : null}
                  rankingSummaries={rankingSummaries}
                  settings={settings}
                  ranker={boardSettings.ranker}
                />
                <HistoricalStats
                  settings={settings}
                  player={viewPlayerId ? playerLib[viewPlayerId] : null}
                />
              </div>
            </div>

            {/* Rankings Board Column */}
            <div className="col-span-5">
              <RankingsBoard
                playerRanks={playerRanks}
                predictedPicks={isEditingCustomRanking || usingCustomRanking ? {} : predictedPicks}
                draftView={draftView}
                setDraftView={setDraftView}
                sortOption={sortOption}
                setSortOption={setSortOption}
                highlightOption={highlightOption}
                setHighlightOption={setHighlightOption}
                myPickNum={myPickNum}
                noPlayers={noPlayers}
                currPick={currPick}
                predNextTiers={isEditingCustomRanking || usingCustomRanking ? {} : predNextTiers}
                fantasySettings={settings}
                boardSettings={boardSettings}
                rankingSummaries={rankingSummaries}
                onSelectPlayer={onSelectPlayer}
                onPurgePlayer={onPurgeAvailPlayer}
                setViewPlayerId={setViewPlayerId}
                isEditingCustomRanking={isEditingCustomRanking}
                hasCustomRanking={usingCustomRanking}
                canEditCustomRankings={canEditCustomRankings()}
                onReorderPlayer={onReorderPlayerInPosition}
                onStartCustomRanking={handleStartCustomRanking}
                onFinishCustomRanking={handleFinishCustomRanking}
                onUpdateTierBoundary={onUpdateTierBoundary}
                onCancelCustomRanking={() => {
                  setDraftView(DraftView.RANKING)
                }}
                saveCustomRankings={saveCustomRankings}
                loadCustomRankings={loadCustomRankings}
                hasCustomRankingsSaved={hasCustomRankingsSaved}
                clearSavedCustomRankings={clearSavedCustomRankings}
                rosters={rosters}
                playerLib={playerLib}
                draftStarted={draftStarted}
                getDraftRoundForPickNum={getDraftRoundForPickNum}
                viewPlayerId={viewPlayerId}
                draftHistory={draftHistory}
                viewRosterIdx={myPickNum-1}
                listenerActive={listenerActive}
                activeDraftListenerTitle={activeDraftListenerTitle}
                loadCurrentRankings={loadCurrentRankings}
                rankings={rankings}
                removePlayerTargets={removePlayerTargets}
              />
            </div>

            <div className="col-span-4">
              <ADPView
                playerRanks={playerRanks}
                fantasySettings={settings}
                boardSettings={boardSettings}
                onSelectPlayer={onSelectPlayer}
                setViewPlayerId={setViewPlayerId}
                viewPlayerId={viewPlayerId}
                myPicks={myPicks}
                playerTargets={playerTargets}
                playerLib={playerLib}
                addPlayerTarget={addPlayerTarget}
                replacePlayerTargets={replacePlayerTargets}
                removePlayerTarget={removePlayerTarget}
                removePlayerTargets={removePlayerTargets}
              />
            </div>
          </div>

          {/* Mobile Layout */}
          <div className="md:hidden w-full h-full px-2">
            {mobileView === MobileView.HEADER && (
              <div className="w-full">
                <Header
                  settings={settings}
                  boardSettings={boardSettings}
                  draftStarted={draftStarted}
                  myPickNum={myPickNum}
                  setNumTeams={setNumTeams}
                  setIsPpr={setIsPpr}
                  setMyPickNum={setMyPickNum}
                  onSetRanker={onSetRanker}
                  onSetAdpRanker={onSetAdpRanker}
                />
              </div>
            )}

            {mobileView === MobileView.RANKINGS && (
              <RankingsBoard
                playerRanks={playerRanks}
                predictedPicks={isEditingCustomRanking || usingCustomRanking ? {} : predictedPicks}
                draftView={draftView}
                setDraftView={setDraftView}
                sortOption={sortOption}
                setSortOption={setSortOption}
                highlightOption={highlightOption}
                setHighlightOption={setHighlightOption}
                myPickNum={myPickNum}
                noPlayers={noPlayers}
                currPick={currPick}
                predNextTiers={isEditingCustomRanking || usingCustomRanking ? {} : predNextTiers}
                fantasySettings={settings}
                boardSettings={boardSettings}
                rankingSummaries={rankingSummaries}
                onSelectPlayer={onSelectPlayer}
                onPurgePlayer={onPurgeAvailPlayer}
                setViewPlayerId={setViewPlayerId}
                isEditingCustomRanking={isEditingCustomRanking}
                hasCustomRanking={usingCustomRanking}
                canEditCustomRankings={canEditCustomRankings()}
                onReorderPlayer={onReorderPlayerInPosition}
                onStartCustomRanking={handleStartCustomRanking}
                onFinishCustomRanking={handleFinishCustomRanking}
                onUpdateTierBoundary={onUpdateTierBoundary}
                onCancelCustomRanking={() => {
                  setDraftView(DraftView.RANKING)
                }}
                saveCustomRankings={saveCustomRankings}
                loadCustomRankings={loadCustomRankings}
                hasCustomRankingsSaved={hasCustomRankingsSaved}
                clearSavedCustomRankings={clearSavedCustomRankings}
                rosters={rosters}
                playerLib={playerLib}
                draftStarted={draftStarted}
                getDraftRoundForPickNum={getDraftRoundForPickNum}
                viewPlayerId={viewPlayerId}
                draftHistory={draftHistory}
                viewRosterIdx={myPickNum-1}
                listenerActive={listenerActive}
                activeDraftListenerTitle={activeDraftListenerTitle}
                loadCurrentRankings={loadCurrentRankings}
                rankings={rankings}
                removePlayerTargets={removePlayerTargets}
              />
            )}

            {mobileView === MobileView.ADP && (
              <ADPView
                playerRanks={playerRanks}
                fantasySettings={settings}
                boardSettings={boardSettings}
                onSelectPlayer={onSelectPlayer}
                setViewPlayerId={setViewPlayerId}
                viewPlayerId={viewPlayerId}
                myPicks={myPicks}
                playerTargets={playerTargets}
                playerLib={playerLib}
                addPlayerTarget={addPlayerTarget}
                replacePlayerTargets={replacePlayerTargets}
                removePlayerTarget={removePlayerTarget}
                removePlayerTargets={removePlayerTargets}
              />
            )}

            {mobileView === MobileView.TIERS && (
              <MobileTiersView
                currentOptimalRoster={currentOptimalRoster}
                optimalRosters={optimalRosters}
                selectedOptimalRosterIdx={selectedOptimalRosterIdx}
                setSelectedOptimalRosterIdx={setSelectedOptimalRosterIdx}
                boardSettings={boardSettings}
                settings={settings}
                rankingSummaries={rankingSummaries}
                ranker={boardSettings.ranker}
              />
            )}
          </div>
        </div>
      </main>

      { draftStarted &&
        <PickHistoryFooter
          roundIdx={roundIdx}
          currRoundPick={currRoundPick}
          currPick={currPick}
          isEvenRound={isEvenRound}
          currRound={currRound}
          playerLib={playerLib}
          settings={settings}
          currMyPickNum={currMyPickNum}
          onRemovePick={onRemovePick}
          setCurrPick={setCurrPick}
          setViewPlayerId={setViewPlayerId}
        />
      }

      {/* Mobile Footer Navigation */}
      <MobileFooter 
        currentView={mobileView}
        onViewChange={setMobileView}
      />
    </div>
  )
}

export default Home;
