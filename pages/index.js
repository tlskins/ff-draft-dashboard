/*global chrome*/
import React, { useEffect, useState, useCallback } from "react"
import { toast } from "react-toastify"

import PageHead from "../components/pageHead"
import DraftLoaderOptions from "../components/draftLoaderOptions"
import PositionRankings from "../components/positionRankings"
import StatsSection from "../components/statsSection"
import {
  addRankTiers,
  addDefaultTiers,
  nextPositionPicked,
  nextPickedPlayerId,
  allPositions,
  getPicksUntil,
  parseEspnDraftEvents,
  parseNflDraftEvents,
} from "../behavior/draft"
import { useRanks } from '../behavior/hooks/useRanks'
import { useDraftBoard } from '../behavior/hooks/useDraftBoard'
import { useRosters } from '../behavior/hooks/useRosters'
import { getPosStyle } from "../behavior/styles"

var listeningDraftTitle = {}
var maxCurrPick = 0

export default function Home() {
  const {
    // state
    numTeams, setNumTeams,
    isStd, setIsStd,
    draftStarted, setDraftStarted,
    myPickNum, setMyPickNum,
    currPick, setCurrPick,
    // memo
    roundIdx,
    isEvenRound,
    currRound,
    currRoundPick,
    currMyPickNum,
    // funcs
    onDraftPlayer,
    onRemoveDraftedPlayer,
    onNavLeft,
    onNavRight,
    onNavRoundUp,
    onNavRoundDown,
  } = useDraftBoard()

  // rosters depend on draft board
  const {
    // state
    rosters,
    viewRosterIdx, setViewRosterIdx,
    // funcs
    addPlayerToRoster,
    removePlayerFromRoster,
  } = useRosters({
    numTeams,
    isEvenRound,
    currRoundPick,
  })

  // ranks depend on draft board
  const {
    // state
    playerLib, setPlayerLib,
    playersByPosByTeam, setPlayersByPosByTeam,
    ranks, setRanks,
    posStatsByNumTeamByYear, setPosStatsByNumTeamByYear,
    isEspnRank, setIsEspnRank,
    availPlayers, harris, purge,
    playerRanks,
    noPlayers,
    // funcs
    onRemovePlayerFromRanks,
    onAddPlayerToRanks,
    onPurgePlayerFromRanks,
    onSortRanksByEspn,
  } = useRanks({ isStd })
  
  const [predictedPicks, setPredictedPicks] = useState({})
  const [nextPredictedPicks, setNextPredictedPicks] = useState({})
  const [showNextPreds, setShowNextPreds] = useState(false)
  const [predRunTiers, setPredRunTiers] = useState({ QB: 0, RB: 0, WR: 0, TE: 0 })
  const [predNextTiers, setPredNextTiers] = useState({ QB: 0, RB: 0, WR: 0, TE: 0 })

  const [alertMsg, setAlertMsg] = useState(null)

  // counter to run post predictions after non-current pick events
  const [numPostPredicts, setNumPostPredicts] = useState(0)

  const [hasCustomTiers, setHasCustomTiers] = useState(null)

  const [activeDraftListenerTitle, setActiveDraftListenerTitle] = useState(null)

  const [viewPlayerId, setViewPlayerId] = useState(null)

  // listeners

  useEffect(() => {
    window.addEventListener("message", processListenedDraftPick )
    
    return () => {
      window.removeEventListener("message", processListenedDraftPick )
    }
  }, [numTeams, ranks, playerLib, rosters, listeningDraftTitle])

  useEffect(() => {
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [showNextPreds, predictedPicks, nextPredictedPicks, playerRanks, playerLib, isEspnRank, isStd, noPlayers, currPick, predNextTiers])

  // key press / up commands
  const onKeyUp = useCallback( e => {
    if (['MetaRight', 'MetaLeft'].includes(e.code)) {
      setShowNextPreds( false )
    } else if (['ShiftLeft', 'ShiftRight'].includes(e.code)) {
      // sort by harris
      onSortRanksByEspn( false )
    }
  }, [showNextPreds, predictedPicks, nextPredictedPicks, playerRanks, isEspnRank, isStd, noPlayers, currPick, predNextTiers])

  const onKeyDown = useCallback( e => {
    // arrow up
    if (e.code === 'ArrowUp' ) {
      onNavRoundUp()
    // arrow down
    } else if (e.code === 'ArrowDown') {
      onNavRoundDown()
    // arrow left
    } else if ( e.code === 'ArrowLeft' ) {
      onNavLeft()
    // arrow right
    } else if ( e.code === 'ArrowRight' ) {
      onNavRight()
      // alt 
    } else if (['MetaRight', 'MetaLeft'].includes(e.code)) {
      setShowNextPreds(true)
    // shift 
    } else if (['ShiftLeft', 'ShiftRight'].includes(e.code)) {
      onSortRanksByEspn( true )
    }
  }, [ showNextPreds, predictedPicks, nextPredictedPicks, playerRanks, playerLib, isEspnRank, isStd, noPlayers, currPick, predNextTiers])

  const processListenedDraftPick = useCallback( event => {
    if ( event.data.type !== "FROM_EXT" || Object.values( playerLib ).length === 0 ) {
      return
    }
    if ( event.data.draftData === true ) {
      console.log('listener ack received in app')
      return
    }
    const { draftData: { draftPicks: draftPicksData, draftTitle, platform } } = event.data

    if ( listeningDraftTitle[draftTitle] === undefined ) {
      console.log('heard draft initated event', event)
      const acceptToastId = toast(
        `Listen to draft: ${ draftTitle }`,
        {
          autoClose: false,
          hideProgressBar: true,
          type: 'success',
          theme: 'colored',
          position:'top-right',
          containerId: 'AcceptListenDraft',
          onClick: () => {
            listeningDraftTitle[draftTitle].listening = true
            setActiveDraftListenerTitle( draftTitle )
            toast.dismiss(listeningDraftTitle[draftTitle].rejectToastId)
          }
        })
      const rejectToastId = toast(
        `Ignore draft: ${ draftTitle }`,
        {
          autoClose: false,
          hideProgressBar: true,
          type: 'error',
          theme: 'colored',
          position:'top-right',
          containerId: 'RejectListenDraft',
          onClick: () => {
            listeningDraftTitle[draftTitle].listening = false
            toast.dismiss(listeningDraftTitle[draftTitle].acceptToastId)
          }
        })
      listeningDraftTitle = {
        ...listeningDraftTitle,
        [draftTitle]: {
          listening: null,
          acceptToastId,
          rejectToastId,
        }
      }
      return
    } else if ( !listeningDraftTitle[draftTitle].listening || draftPicksData.length === 0 ) {
      return
    }

    // parse draft event data into structured draft pick
    let draftPicks
    if ( platform === 'ESPN') {
      draftPicks = parseEspnDraftEvents( draftPicksData )
    } else if ( platform == 'NFL' ) {
      draftPicks = parseNflDraftEvents( draftPicksData, playersByPosByTeam )
    }

    console.log('heard draft event', event)

    if ( !draftPicks || draftPicks.length === 0 ) {
      return
    }

    // draft players from events
    let lastPickNum = 1
    draftPicks.forEach( draftPick => {
      const { round, pick, id, ovrPick } = draftPick
      const player = playerLib[id]
      if ( id && player ) {
        const { name, position, team } = player
        console.log('processing pick', player, draftPick)
        const pickNum = ovrPick ||  ((round-1) * numTeams) + pick
        onDraftPlayer(id, pickNum)
        onRemovePlayerFromRanks( player )
        addPlayerToRoster( player, pickNum )
        lastPickNum = pickNum
        toast(
          `Pick #${pickNum}: ${ name } - ${ position } - ${ team }`,
          {
            type: 'success',
            theme: 'colored',
            position:'top-right',
          })
      }
    })

    // set updated draft board and predictions
    setCurrPick(lastPickNum+1)
    if ( !draftStarted ) {
      setDraftStarted(true)
    }
  }, [numTeams, ranks, playerLib, rosters, listeningDraftTitle, playersByPosByTeam])
  
  // drafting

  const onSelectPick = pickNum => {
    setCurrPick(pickNum)
  }

  const onSelectPlayer = player => {
    onDraftPlayer(player.id, currPick)
    setCurrPick(currPick+1)
    if ( !draftStarted ) {
      setDraftStarted(true)
    }
    onRemovePlayerFromRanks( player )
    addPlayerToRoster( player, currPick )
  }

  const onRemovePick = pickNum => {
    const playerId = onRemoveDraftedPlayer(pickNum)
    const player = playerLib[playerId]
    onAddPlayerToRanks( player )
    removePlayerFromRoster( player, pickNum )
    setCurrPick(pickNum)
    onChangeNumPostPredicts(numPostPredicts+1)
  }

  const onPurgePlayer = player => {
    onPurgePlayerFromRanks( player )
  }

  // data import export

  useEffect(() => {
    if ( hasCustomTiers == null || hasCustomTiers === false ) {
      if ( hasCustomTiers == null ) {
        const players = Object.values(playerLib)
        const hasNoTiers = players.every( player => player.tier === "" )
        setHasCustomTiers(!hasNoTiers)
      }
      const nextPlayerLib = addDefaultTiers(playerLib, isStd, numTeams)
      addRankTiers(playerLib, numTeams, posStatsByNumTeamByYear)
      const playersByPosByTeam = Object.values( playerLib ).reduce(( dict, player ) => {
        if ( !dict[player.position] ) {
          dict[player.position] = {}
        }
        if ( !dict[player.position][player.team] ) {
          dict[player.position][player.team] = []
        }
        dict[player.position][player.team].push(player)

        return dict
      }, {})
      setPlayersByPosByTeam( playersByPosByTeam )
      setPlayerLib( nextPlayerLib )
    }
  }, [playerLib, isStd, numTeams, posStatsByNumTeamByYear])

  const onChangeNumPostPredicts = numPostPredicts => {
    setNumPostPredicts(numPostPredicts)
  }

  useEffect(() => {
    predictPicks()
  }, [currPick, myPickNum, numTeams])

  const predictPicks = useCallback(() => {
    if ( rosters.length === 0 ) {
      return
    }
    if (currPick <= maxCurrPick) {
      return
    }
    console.log('predictPicks', currPick, maxCurrPick)
    maxCurrPick = currPick
    const [picksUntil, nextPicksUntil] = getPicksUntil(myPickNum, currPick-1, numTeams)

    let posCounts = { QB: 0, RB: 0, WR: 0, TE: 0 }
    rosters.forEach( roster => {
      allPositions.forEach( pos => {
        posCounts[pos] += roster[pos].length
      })
    })
    let currPredicts = {}
    let nextPredicts = {}
    Array.from(Array(nextPicksUntil)).forEach((_, i) => {
      const roster = rosters[currRoundPick-1]
      const roundNum = Math.floor((currPick+i-1) / numTeams) + 1
      const positions = nextPositionPicked( roster, roundNum, posCounts )
      const { predicted, updatedCounts } = nextPickedPlayerId( ranks, positions, nextPredicts, i+1, posCounts )
      if ( i+1 <= picksUntil ) {
        currPredicts = predicted
      }
      nextPredicts = predicted
      posCounts = updatedCounts
    })

    // detect positional runs
    let runDetected = false
    playerRanks.forEach(([posRanks, pos]) => {
      const posTopPlayerId = posRanks[0] && posRanks[0][0] // player id
      const posTopPlayer = playerLib[posTopPlayerId]
      if ( posRanks.length > 0 && posTopPlayer?.tier && parseInt(posTopPlayer?.tier) !== 0 ) {
        const currTopTier = parseInt(posTopPlayer?.tier)
        const nextPosRanks = posRanks.filter( r => !Object.keys( nextPredicts ).includes( r[0] ))
        const posNextTopPlayerId = nextPosRanks[0] && nextPosRanks[0][0] // player id
        const posNextTopPlayer = playerLib[posNextTopPlayerId]
        const nextTier = parseInt( posNextTopPlayer?.tier )
        predNextTiers[pos] = nextTier
        if ( currTopTier && currTopTier > predRunTiers[pos] && ( !nextTier || nextTier - currTopTier >= 2 )) {
          const playersTaken = posRanks.length - nextPosRanks.length
          toast(
            `Run on ${ pos } down to tier ${ nextTier } after your next pick with ${ playersTaken } ${ pos }s taken `,
            {
              type: 'warning',
              position:'top-right',
              theme: 'colored',
              autoClose: 10000,
            })
          predRunTiers[pos] = nextTier
          runDetected = true
        }
      }
    })
    setPredNextTiers(predNextTiers)
    if ( runDetected ) {
      setPredRunTiers(predRunTiers)
    }

    // console.log('Predictions: ', Object.keys( currPredicts ).sort((a,b) => currPredicts[a] - currPredicts[b]).map( id => playerLib[id].name ))
    // console.log('Next Predictions: ', Object.keys( nextPredicts ).sort((a,b) => nextPredicts[a] - nextPredicts[b]).map( id => playerLib[id].name ))

    setPredictedPicks( currPredicts )
    setNextPredictedPicks( nextPredicts )
  }, [numTeams, ranks, playerLib, playerRanks, rosters, myPickNum, currPick, currRoundPick, predRunTiers, predNextTiers])

  return (
    <div className="flex flex-col items-center justify-center min-h-screen py-2 relative">
      <PageHead />
      <main className="flex flex-col items-center justify-center w-full flex-1 px-20 text-center bg-gray-50">
        {/* Draft Settings */}
        <div className="w-screen justify-center z-10 bg-gray-200 shadow-md">
          <DraftLoaderOptions
            setRanks={setRanks}
            setPlayerLib={setPlayerLib}
            setAlertMsg={setAlertMsg}
            setPosStatsByNumTeamByYear={setPosStatsByNumTeamByYear}
            availPlayers={availPlayers}
            draftStarted={draftStarted}
            arePlayersLoaded={Object.keys( playerLib ).length !== 0}
            isStd={isStd}
          />

          <div className="flex flex-row mb-8 mt-2 w-screen justify-center">
            <div className="flex flex-row text-sm text-center mr-4 rounded bg-gray-100 shadow-md">
              <p className="align-text-bottom align-bottom p-1 m-1 font-semibold">
                Your Pick #
              </p>
              <select
                className="p-1 m-1 border rounded"
                value={myPickNum}
                onChange={ e =>  setMyPickNum(parseInt(e.target.value))}
                disabled={draftStarted}
              >
                { Array.from(Array(numTeams)).map( (_, i) => <option key={i+1} value={ i+1 }> { i+1 } </option>) }
              </select>
            </div>

            <div className="flex flex-row text-sm text-center mr-2 rounded bg-gray-100 shadow-md">
              <p className="align-text-bottom align-bottom p-1 m-1 font-semibold">
                # Teams
              </p>
              <select
                className="p-1 m-1 border rounded"
                value={numTeams}
                onChange={ e => {
                  setNumTeams(parseFloat(e.target.value))
                  setMyPickNum(1)
                }}
                disabled={draftStarted}
              >
                { [10, 12, 14].map( num => <option key={num} value={ num }> { num } </option>) }
              </select>
            </div>

            <div className="flex flex-row text-sm text-center mr-2 rounded bg-gray-100 shadow-md">
              <p className="align-text-bottom align-bottom p-1 m-1 font-semibold">
                STD / PPR
              </p>
              <select
                className="p-1 m-1 border rounded"
                value={isStd ? "Standard" : "PPR"}
                onChange={ e => {
                  const newIsStd = e.target.value === "Standard"
                  setIsStd( newIsStd )
                }}
                disabled={draftStarted}
              >
                { ["Standard", "PPR"].map( opt => <option key={opt} value={ opt }> { opt } </option>) }
              </select>
            </div>
          </div>
        </div>

        { (!draftStarted && noPlayers) &&
          <div className="w-full font-semibold shadow rounded-md py-8 pl-32 pr-8 my-8 bg-white">
            <ol className="list-decimal text-left">
              <li className="my-4">
                Download <span className="text-blue-600 underline mx-1 cursor-pointer" onClick={() => window.open('https://chrome.google.com/webstore/detail/ff-draft-pulse/cjbbljpchmkblfjaglkcdejcloedpnkh?utm_source=ext_sidebar&hl=en-US')}>chrome extension</span>
                to listen to live drafts. Currently support ESPN or NFL.com draft platforms. Just need to install extension, opening extension is not necessary after installation.
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

        <div className="flex flex-col items-center">
          {/* Round info / errors */}
          <div className="flex flex-row items-center justify-center content-center">
            <div className="flex flex-col items-center w-full">
              { activeDraftListenerTitle &&
                <p className="bg-yellow-300 font-semibold shadow rounded-md text-sm my-1 px-4">
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

          {/* Stats and Positional Breakdowns */}
          <div className="flex flex-row justify-center w-screen relative my-4">
            { !noPlayers &&
              <div className="flex flex-row px-4 mr-2 overflow-y-scroll rounded border border-4 h-screen shadow-md bg-white">
                <StatsSection
                  viewPlayerId={viewPlayerId}
                  playerLib={playerLib}
                  posStatsByNumTeamByYear={posStatsByNumTeamByYear}
                  numTeams={numTeams}
                  isStd={isStd}
                />

                <div className="flex flex-col rounded h-full overflow-y-auto ml-2 p-1">
                  <p className="font-semibold underline py-2">
                    Rosters
                  </p>

                  { !draftStarted &&
                    <p className="font-semibold">
                      Waiting for draft...
                    </p>
                  }

                  { draftStarted &&
                    <div className="flex flex-col mr-1 mb-2 text-sm px-2 py-1 bg-gray-100 shadow-md border">
                      <select
                        className="rounded p-1 border font-semibold"
                        value={viewRosterIdx}
                        onChange={ e => setViewRosterIdx(parseInt( e.target.value ))}
                      >
                        { rosters.map((_,i) => {
                          return(
                            <option key={i} value={i}> Team { i+1 } </option>
                          )
                        })}
                      </select>
                      { allPositions.map( pos => [rosters[viewRosterIdx][pos], pos] ).filter( ([posGroup,]) => posGroup.length > 0 ).map( ([posGroup, pos]) => {
                        return(
                          <div className="mt-1 text-left" key={pos}>
                            <p className="font-semibold"> { pos } ({ posGroup.length }) </p>
                            { posGroup.map( playerId => {
                              const player = playerLib[playerId]
                              return(
                                <p className="text-xs" key={playerId}> { player.name } - { player.team } </p>
                              )
                            })}
                          </div>
                        )
                      })}
                    </div>
                  }
                </div>
              </div>
            }

            <PositionRankings
              playerRanks={playerRanks}
              playerLib={playerLib}
              nextPredictedPicks={nextPredictedPicks}
              predictedPicks={predictedPicks}
              showNextPreds={showNextPreds}
              isEspnRank={isEspnRank}
              isStd={isStd}
              noPlayers={noPlayers}
              currPick={currPick}
              predNextTiers={predNextTiers}
              onSelectPlayer={onSelectPlayer}
              onPurgePlayer={onPurgePlayer}
              setViewPlayerId={setViewPlayerId}
            />
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
                  { currRound.map( (pickedPlayerId, i) => {
                    let bgColor = ""
                    let hover = ""
                    const player = playerLib[pickedPlayerId]
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
                    const myPickStyle = i+1 == currMyPickNum ? "border-4 border-green-400" : "border"
                    const pickNum = roundIdx*numTeams+(i+1)
                    return(
                      <td className={`flex flex-col p-1 m-1 rounded ${myPickStyle} ${hover} cursor-pointer text-sm ${bgColor}`}
                        onClick={ pickedPlayerId ? () => onRemovePick(pickNum) : () => onSelectPick( pickNum ) }
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
                        { player && <p> { player.name } </p> }
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
