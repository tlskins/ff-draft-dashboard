/*global chrome*/
import React, { useEffect, useState, useCallback, FC } from "react"

import PageHead from "../components/pageHead"
import DraftLoaderOptions from "../components/draftLoaderOptions"
import PositionRankings from "../components/positionRankings"
import HistoricalStats from "../components/HistoricalStats"
import RankingSummaryDisplay from "../components/RankingSummary"
import Rosters from "../components/Rosters"
import { useRanks } from '../behavior/hooks/useRanks'
import { useDraftBoard } from '../behavior/hooks/useDraftBoard'
import { useDraftListener } from '../behavior/hooks/useDraftListener'
import { usePredictions } from "../behavior/hooks/usePredictions"
import { getPosStyle } from "../behavior/styles"
import { Player, ThirdPartyRanker } from "types"

export enum DraftView {
  RANKING = "Ranking View",
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

  // TODO - fix edit custom tiers
  // const [hasCustomTiers, setHasCustomTiers] = useState<boolean | null>(null)
  const [viewRosterIdx, setViewRosterIdx] = useState(0)
  const [draftView, setDraftView] = useState<DraftView>(DraftView.RANKING)
  const [sortOption, setSortOption] = useState<SortOption>(SortOption.RANKS)
  const [highlightOption, setHighlightOption] = useState<HighlightOption>(HighlightOption.PREDICTED_TAKEN)
  const [alertMsg, setAlertMsg] = useState<string | null>(null)
  const [viewPlayerId, setViewPlayerId] = useState<string | null>(null)
  
  // Custom ranking state - modal now shows automatically when draftView === CUSTOM_RANKING

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


  // TODO - fix edit custom tiers
  // const [hasCustomTiers, setHasCustomTiers] = useState<boolean | null>(null)

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
            settings={settings}
            boardSettings={boardSettings}
            onCreatePlayerRanks={onCreatePlayerRanks}
            createPlayerLibrary={createPlayerLibrary}
            setRankingSummaries={setRankingSummaries}
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
          </div>
        </div>

        <div className="flex flex-col items-center justify-center content-center mt-2">
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

          { alertMsg &&
            <div className="flex flex-row h-full items-center justify-center items-center px-2 py-1 my-4 shadow-lg rounded-lg border-2 bg-green-200">
              <p className="font-semibold text-sm text-green-500 my-1"> { alertMsg } </p>
            </div>
          }
        </div>

        { (!draftStarted && noPlayers && !alertMsg) &&
          <div className="w-full font-semibold shadow rounded-md py-8 pl-32 pr-8 my-8 bg-white">
            <ol className="list-decimal text-left">
              <li className="my-4">
                Download
                <span className="text-blue-600 underline mx-1 cursor-pointer"
                  onClick={() => window.open('https://chrome.google.com/webstore/detail/ff-draft-pulse/cjbbljpchmkblfjaglkcdejcloedpnkh?utm_source=ext_sidebar&hl=en-US')}
                >
                  chrome extension
                </span>
                to listen to live drafts. Refresh this website after installing extension. Currently support ESPN or NFL.com draft platforms. Just need to install extension, opening extension is not necessary after installation.
              </li>
              <li className="my-4">
                Choose your draft settings including your pick number, # of teams, and format (STD / PPR).
              </li>
              <li className="my-4">
                Load ranks from your favorite analysts to get started.
              </li>
              <li className="my-4">
                Optionally export ranks to csv and edit custom ranks and or tiers.
              </li>
              <li className="my-4">
                Find a mock draft or open your draft platform app in a separate window. Remember to keep your draft platform at least partially visible so that the tab doesn't go to sleep. Press the green alert to start listening to the draft's picks.
              </li>
              <li className="my-4">
                Hover on players to view player profiles and positional stats. Click players to manually select players at current picks. Press left, right arrows to navigate to different picks within a round. Press up and down to navigate to different rounds.
              </li>
            </ol>
          </div>
        }

        <div className="flex flex-col items-center mt-4">
          {/* Stats and Positional Breakdowns */}
          <div className="flex flex-row justify-center w-screen relative my-4 grid grid-cols-12 gap-1 px-1">

            <div className="col-span-4 flex flex-col justify-start">
              <HistoricalStats
                settings={settings}
                player={viewPlayerId ? playerLib[viewPlayerId] : null}
              />
              <RankingSummaryDisplay
                activePlayer={viewPlayerId ? playerLib[viewPlayerId] : null}
                rankingSummaries={rankingSummaries}
                settings={settings}
                ranker={boardSettings.ranker}
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
              />
            </div>

            <div className="col-span-3"> 
              <Rosters
                draftStarted={draftStarted}
                viewRosterIdx={viewRosterIdx}
                setViewRosterIdx={setViewRosterIdx}
                rosters={rosters}
                optimalRosters={optimalRosters}
                playerLib={playerLib}
                rankingSummaries={rankingSummaries}
                boardSettings={boardSettings}
                settings={settings}
              />
            </div>
          </div>
        </div>
      </main>

      { draftStarted &&
        <div className="flex items-center justify-center w-full h-24 border-t border-gray-300 fixed bottom-0 z-10 bg-gray-200">
          {/* <div className="flex flex-col">
            <a href="https://www.flaticon.com/free-icons/pulse" title="pulse icons">Pulse icons created by Kalashnyk - <span className="font-bold ml-2 text-blue-600 underline">Flaticon</span></a>
          </div> */}

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
