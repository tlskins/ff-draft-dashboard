/*global chrome*/
import React, { useEffect, useState, useCallback, FC } from "react"

import PageHead from "../components/pageHead"
import Header from "../components/Header"
import RankingsBoard from "../components/RankingsBoard"
import HistoricalStats from "../components/HistoricalStats"
import RankingSummaryDisplay from "../components/RankingSummary"
import ADPView from "../components/views/ADPView"
import Dropdown from "../components/dropdown"
import OptimalRosterDisplay from "../components/OptimalRosterDisplay"

import { useRanks } from '../behavior/hooks/useRanks'
import { useDraftBoard } from '../behavior/hooks/useDraftBoard'
import { useDraftListener } from '../behavior/hooks/useDraftListener'
import { usePredictions } from "../behavior/hooks/usePredictions"
import { getPosStyle, getTierStyle } from "../behavior/styles"
import { getProjectedTier } from "../behavior/draft"
import { Player, ThirdPartyRanker, DataRanker, ThirdPartyADPRanker } from "types"
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
    onNavLeft,
    onNavRight,
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
    if (['MetaRight', 'MetaLeft'].includes(e.code)) {
      setHighlightOption(HighlightOption.PREDICTED_TAKEN)
    } else if (['ShiftLeft', 'ShiftRight'].includes(e.code)) {
      // sort by harris
      onApplyRankingSortBy( false )
      setSortOption(SortOption.RANKS)
    } else if (['KeyZ'].includes(e.code)) {
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
      onNavLeft()
    // arrow right
    } else if ( e.code === 'ArrowRight' ) {
      onNavRight(draftHistory)
      // alt 
    } else if (['MetaRight', 'MetaLeft'].includes(e.code)) {
      setHighlightOption(HighlightOption.PREDICTED_TAKEN_NEXT_TURN)
    // shift 
    } else if (['ShiftLeft', 'ShiftRight'].includes(e.code)) {
      onApplyRankingSortBy( true )
      setSortOption(SortOption.ADP)
    } else if (['KeyZ'].includes(e.code)) {
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
      <main className="flex flex-col items-center justify-center w-full flex-1 px-20 text-center bg-gray-50">
        {/* Header Section */}
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

        <div className="flex flex-col items-center mt-4">
          <div className="flex flex-row justify-center w-screen relative mb-4 grid grid-cols-12 gap-1 px-1">

            {/* Stats Column */}
            <div className="col-span-3 flex flex-col justify-start ml-2 p-1">
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
              />
            </div>
          </div>
        </div>
      </main>

      { draftStarted &&
        <div className="flex items-center justify-center w-full h-24 border-t border-gray-300 fixed bottom-0 z-10 bg-gray-200">
          <div className="flex flex-col items-center">
            <p className="font-semibold underline text-center rounded py-1">
              Round { roundIdx+1 } Pick { currRoundPick } (#{ currPick } Overall)
            </p>
            <table className="table-auto">
              <tbody>
                <tr className={`flex justify-between ${isEvenRound ? 'flex-row-reverse' : ''}`}>
                  { currRound.map( (pickedPlayerId: string | null, i: number) => {
                    let bgColor = ""
                    let hover = ""
                    const player = pickedPlayerId ? playerLib[pickedPlayerId] : null
                    if ( i+1 === currRoundPick ) {
                      bgColor = "bg-yellow-400"
                      hover = "hover:bg-yellow-300"
                    } else if ( !!player ) {
                      bgColor = getPosStyle( player.position )
                      hover = "hover:bg-red-300"
                    } else {
                      bgColor = "bg-gray-100"
                      hover = "hover:bg-yellow-200"
                    }
                    const myPickStyle = i+1 === currMyPickNum ? "border-4 border-green-400" : "border"
                    const pickNum = roundIdx*settings.numTeams+(i+1)
                    return(
                      <td className={`flex flex-col p-1 m-1 rounded ${myPickStyle} ${hover} cursor-pointer text-sm ${bgColor} items-center`}
                        onClick={ pickedPlayerId ? () => onRemovePick(pickNum) : () => setCurrPick( pickNum ) }
                        key={i}
                        onMouseEnter={() => {
                          if ( pickedPlayerId ) {
                            setViewPlayerId(pickedPlayerId)
                          }
                        }}
                      >
                        <p className="font-semibold">
                          { `#${pickNum}` } { pickedPlayerId ? ` | Rd ${roundIdx+1} Pick ${i+1}` : "" }
                        </p>
                        { player && <p> { player.fullName } </p> }
                      </td>
                    )
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      }
    </div>
  )
}

export default Home;
