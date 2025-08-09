/*global chrome*/
import React, { useEffect, useState, useCallback, FC } from "react"

import PageHead from "../components/pageHead"
import DraftLoaderOptions from "../components/draftLoaderOptions"
import PositionRankings from "../components/positionRankings"
import HistoricalStats from "../components/HistoricalStats"
import RankingSummaryDisplay from "../components/RankingSummary"
import ADPView from "../components/views/ADPView"

import { useRanks } from '../behavior/hooks/useRanks'
import { useDraftBoard } from '../behavior/hooks/useDraftBoard'
import { useDraftListener } from '../behavior/hooks/useDraftListener'
import { usePredictions } from "../behavior/hooks/usePredictions"
import { getPosStyle, getTierStyle } from "../behavior/styles"
import { getProjectedTier } from "../behavior/draft"
import { Player, ThirdPartyRanker, DataRanker, ThirdPartyADPRanker } from "types"

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
    // funcs
    onCreatePlayerRanks,
    onDraftPlayer,
    onRemoveDraftedPlayer,
    getDraftRoundForPickNum,
    onPurgeAvailPlayer,
    onApplyRankingSortBy,
    onSetRanker,
    onSetAdpRanker,
    createPlayerLibrary,
    setRankingSummaries,
    // custom ranking funcs
    canEditCustomRankings,
    onStartCustomRanking,
    onFinishCustomRanking,
    onClearCustomRanking,
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

  const handleClearCustomRanking = () => {
    onClearCustomRanking()
    setDraftView(DraftView.RANKING)
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen py-2 relative">
      <PageHead />
      <main className="flex flex-col items-center justify-center w-full flex-1 px-20 text-center bg-gray-50">
        {/* Draft Settings */}
        <div className="w-screen justify-center z-10 bg-gray-200 shadow-md">
          <DraftLoaderOptions
            boardSettings={boardSettings}
            onLoadPlayers={onLoadPlayers}
          />

          <div className="flex flex-row mb-8 mt-2 w-screen justify-center">
            <div className={`flex flex-row text-sm text-center mr-4 rounded shadow-md ${draftStarted ? 'bg-gray-300' : 'bg-gray-100' }`}>
              <p className="align-text-bottom align-bottom p-1 m-1 font-semibold">
                # Teams
              </p>
              <select
                className={`p-1 m-1 border rounded ${draftStarted ? 'bg-gray-300' : ''}`}
                value={settings.numTeams}
                onChange={ e => {
                  const newNumTeams = parseFloat(e.target.value)
                  setNumTeams(newNumTeams)
                  setMyPickNum(1)
                }}
                disabled={draftStarted}
              >
                { [10, 12, 14].map( num => <option key={num} value={ num }> { num } </option>) }
              </select>
            </div>

            <div className={`flex flex-row text-sm text-center mr-4 rounded shadow-md ${draftStarted ? 'bg-gray-300' : 'bg-gray-100' }`}>
              <p className="align-text-bottom align-bottom p-1 m-1 font-semibold">
                Your Pick #
              </p>
              <select
                className={`p-1 m-1 border rounded ${draftStarted ? 'bg-gray-300' : ''}`}
                value={myPickNum}
                onChange={ e =>  setMyPickNum(parseInt(e.target.value))}
                disabled={draftStarted}
              >
                { Array.from(Array(settings.numTeams)).map( (_, i) => <option key={i+1} value={ i+1 }> { i+1 } </option>) }
              </select>
            </div>

            <div className={`flex flex-row text-sm text-center mr-4 rounded shadow-md ${draftStarted ? 'bg-gray-300' : 'bg-gray-100' }`}>
              <p className="align-text-bottom align-bottom p-1 m-1 font-semibold">
                STD / PPR
              </p>
              <select
                className={`p-1 m-1 border rounded ${draftStarted ? 'bg-gray-300' : ''}`}
                value={settings.ppr ? "PPR" : "Standard"}
                onChange={ e => {
                  const isPpr = e.target.value === "PPR"
                  setIsPpr(isPpr)
                }}
                disabled={draftStarted}
              >
                { ["Standard", "PPR"].map( opt => <option key={opt} value={ opt }> { opt } </option>) }
              </select>
            </div>

            <div className={`flex flex-row text-sm text-center mr-4 rounded shadow-md ${draftStarted ? 'bg-gray-300' : 'bg-gray-100' }`}>
              <p className="align-text-bottom align-bottom p-1 m-1 font-semibold">
                Ranker
              </p>
              <select
                className={`p-1 m-1 border rounded ${draftStarted ? 'bg-gray-300' : ''}`}
                value={boardSettings.ranker}
                onChange={ e => {
                  onSetRanker(e.target.value as ThirdPartyRanker)
                }}
                disabled={draftStarted}
              >
                { Object.values(ThirdPartyRanker).map( ranker => <option key={ranker} value={ ranker }> { ranker } </option>) }
              </select>
            </div>

            <div className={`flex flex-row text-sm text-center mr-4 rounded shadow-md ${draftStarted ? 'bg-gray-300' : 'bg-gray-100' }`}>
              <p className="align-text-bottom align-bottom p-1 m-1 font-semibold">
                ADP Source
              </p>
              <select
                className={`p-1 m-1 border rounded ${draftStarted ? 'bg-gray-300' : ''}`}
                value={boardSettings.adpRanker}
                onChange={ e => {
                  onSetAdpRanker(e.target.value as ThirdPartyADPRanker)
                }}
                disabled={draftStarted}
              >
                { Object.values(ThirdPartyADPRanker).map( ranker => <option key={ranker} value={ ranker }> { ranker } </option>) }
              </select>
            </div>
          </div>
        </div>



        <div className="flex flex-col items-center mt-4">
          {/* Stats and Positional Breakdowns */}
          <div className="flex flex-row justify-center w-screen relative mb-4 grid grid-cols-12 gap-1 px-1">

            <div className="col-span-3 flex flex-col justify-start ml-2 p-1">
              {currentOptimalRoster && Object.keys(currentOptimalRoster.roster).length > 0 && (
                <div className="flex flex-col mr-1 mb-2 text-sm px-2 py-2 shadow-md border border-blue-200">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-semibold underline">
                      Optimal Total {currentOptimalRoster.metric} Roster Using Ranking Tiers vs ADP ({currentOptimalRoster.value.toFixed(1)} {currentOptimalRoster.metric})
                    </p>
                    {optimalRosters.length > 1 && (
                      <select
                        className="ml-2 px-2 py-1 text-xs border border-blue-300 rounded bg-white"
                        value={selectedOptimalRosterIdx}
                        onChange={(e) => setSelectedOptimalRosterIdx(parseInt(e.target.value))}
                      >
                        {optimalRosters.map((roster, idx) => (
                          <option key={idx} value={idx}>
                            #{idx + 1} ({roster.value.toFixed(1)} {roster.metric})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div className="overflow-x-auto text-left">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-blue-300">
                          <th className="text-left py-1 px-2 font-medium text-blue-700">Pick</th>
                          <th className="text-left py-1 px-2 font-medium text-blue-700">Pos</th>
                          <th className="text-left py-1 px-2 font-medium text-blue-700">Player</th>
                          <th className="text-left py-1 px-2 font-medium text-blue-700">Team</th>
                          <th className="text-left py-1 px-2 font-medium text-blue-700">Tier</th>
                          <th className="text-left py-1 px-2 font-medium text-blue-700">{currentOptimalRoster.metric}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(currentOptimalRoster.roster)
                          .sort(([pickA], [pickB]) => parseInt(pickA) - parseInt(pickB))
                          .map(([pick, optimalPick]) => {
                            const player = optimalPick.player
                            const tier = getProjectedTier(player, boardSettings.ranker, DataRanker.LAST_SSN_PPG, settings, rankingSummaries);
                            const tierValue = tier ? (tier.lowerLimitValue + tier.upperLimitValue) / 2 : 0;
                            return (
                              <tr key={pick} className="border-b border-blue-200 hover:bg-blue-100">
                                <td className="py-1 px-2 font-medium">R{optimalPick.round} (P{pick})</td>
                                <td className={`py-1 px-2 rounded-md ${getPosStyle(player.position)}`}>{player.position}</td>
                                <td className="py-1 px-2 font-medium">{player.fullName}</td>
                                <td className="py-1 px-2">{player.team}</td>
                                <td className={`py-1 px-2 ${getTierStyle(tier?.tierNumber || 0)}`}>{tier?.tierNumber || "N/A"}</td>
                                <td className="py-1 px-2">{tierValue.toFixed(1)}</td>
                              </tr>
                            )
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
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

            <div className="col-span-5">
              <PositionRankings
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
                onClearCustomRanking={handleClearCustomRanking}
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
