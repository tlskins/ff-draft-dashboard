/*global chrome*/
import React, { useEffect, useState, useCallback, useRef } from "react"
import { 
  AiFillCaretDown,
  AiFillCaretUp,
} from 'react-icons/ai'
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
} from "../behavior/draft"
import { useRanks } from '../behavior/hooks/useRanks'
import { useDraftBoard } from '../behavior/hooks/useDraftBoard'
import { useRosters } from '../behavior/hooks/useRosters'
import { useFocus } from '../behavior/hooks/useFocus'
import { getPosStyle, predBgColor, nextPredBgColor } from "../behavior/styles"

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

  const [errs, setErrs] = useState(null)
  const [alertMsg, setAlertMsg] = useState(null)

  // counter to run post predictions after non-current pick events
  const [numPostPredicts, setNumPostPredicts] = useState(0)

  // autocomplete
  const [search, setSearch] = useState("")
  const [inputRef, setInputFocus] = useFocus()
  const [suggestions, setSuggestions] = useState([])
  const [suggestionIdx, setSuggestionIdx] = useState(0)

  const [hasCustomTiers, setHasCustomTiers] = useState(null)

  const [activeDraftListenerTitle, setActiveDraftListenerTitle] = useState(null)

  const [viewPlayerId, setViewPlayerId] = useState(null)

  const backgroundRef = useRef(null)

  // listener

  // useEffect(() => {
  //   const handleBackgroundClick = (event) => {
  //     if (backgroundRef.current && !backgroundRef.current.contains(event.target)) {
  //       setInputFocus()
  //     }
  //   }

  //   // Attach the event listener when the component mounts
  //   document.addEventListener('click', handleBackgroundClick)

  //   // Clean up the event listener when the component unmounts
  //   return () => {
  //     document.removeEventListener('click', handleBackgroundClick)
  //   };
  // }, [])

  useEffect(() => {
    window.addEventListener("message", processListenedDraftPick )
    
    return () => {
      window.removeEventListener("message", processListenedDraftPick )
    }
  }, [numTeams, ranks, playerLib, rosters, listeningDraftTitle])

  const processListenedDraftPick = useCallback( event => {
    if ( event.data.type !== "FROM_EXT" || Object.values( playerLib ).length === 0 ) {
      return
    }
    const { draftData: { draftPicks: draftPicksData, draftTitle } } = event.data

    if ( listeningDraftTitle[draftTitle] === undefined ) {
      console.log('heard draft initated event', event)
      const acceptToastId = toast(
        `Listen to draft: ${ draftTitle }`,
        {
          autoClose: false,
          hideProgressBar: true,
          type: 'success',
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

    console.log('heard draft event', event)
    // parse draft event data into structured draft pick
    const draftPicks = draftPicksData.map( data => {
      const imgMatch = data.imgUrl.match(/headshots\/nfl\/players\/full\/(\d+)\.png/)
      return {
        ...data,
        id: imgMatch && parseInt(imgMatch[1]) || null,
        pickStr: data.pick,
        round: parseInt(data.pick.match(/^R(\d+), P(\d+) /)[1]),
        pick: parseInt(data.pick.match(/^R(\d+), P(\d+) /)[2]),
      }
    })

    // draft players from events
    let lastPickNum = 1
    draftPicks.forEach( draftPick => {
      const { round, pick, id, name, position, team } = draftPick
      const player = playerLib[id]
      if ( id && player ) {
        console.log('processing pick', player, draftPick)
        const pickNum = ((round-1) * numTeams) + pick
        onDraftPlayer(id, pickNum)
        onRemovePlayerFromRanks( player )
        addPlayerToRoster( player, pickNum )
        lastPickNum = pickNum
        toast(
          `R${ round } P${ pick }: ${ name } - ${ position } - ${ team }`,
          {
            hideProgressBar: true,
            type: 'success',
            position:'top-right',
          })
      }
    })

    // set updated draft board and predictions
    setCurrPick(lastPickNum+1)
    if ( !draftStarted ) {
      setDraftStarted(true)
    }
    setInputFocus()
  }, [numTeams, ranks, playerLib, rosters, listeningDraftTitle])

  const onSearch = e => {
    let text = e.target.value
    setErrs(null)
    // bulk parse
    if ( text.includes("\n\n")) {
      // onParsePlayers( text )
      // setSearch("")
    } else {
      // normal search suggest
      text = text.replaceAll(/[^a-zA-Z ]/ig, "")
      setSearch(text)
      if ( text.length > 1 ) {
        const regex = new RegExp(text, 'gi');
        const filtered = availPlayers.filter( player => regex.test(player.matchName) )
        setSuggestions(filtered)
      } else {
        setSuggestions([])
      }
    }
  }
  
  // drafting

  const onSelectPick = pickNum => {
    setCurrPick(pickNum)
    setInputFocus()
  }

  const onSelectPlayer = player => {
    onDraftPlayer(player.id, currPick)
    setCurrPick(currPick+1)
    if ( !draftStarted ) {
      setDraftStarted(true)
    }
    setSuggestionIdx(0)
    setSuggestions([])
    setSearch("")
    onRemovePlayerFromRanks( player )
    addPlayerToRoster( player, currPick )
    setInputFocus()
  }

  const onRemovePick = pickNum => {
    const playerId = onRemoveDraftedPlayer(pickNum)
    const player = playerLib[playerId]
    onAddPlayerToRanks( player )
    removePlayerFromRoster( player, pickNum )
    setCurrPick(pickNum)
    setInputFocus()
    onChangeNumPostPredicts(numPostPredicts+1)
  }

  const onPurgePlayer = player => {
    onPurgePlayerFromRanks( player )
    setInputFocus()
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

    console.log('Predictions: ', Object.keys( currPredicts ).sort((a,b) => currPredicts[a] - currPredicts[b]).map( id => playerLib[id].name ))
    console.log('Next Predictions: ', Object.keys( nextPredicts ).sort((a,b) => nextPredicts[a] - nextPredicts[b]).map( id => playerLib[id].name ))

    setPredictedPicks( currPredicts )
    setNextPredictedPicks( nextPredicts )
  }, [numTeams, ranks, playerLib, rosters, myPickNum, currPick, currRoundPick])

  return (
    <div className="flex flex-col items-center justify-center min-h-screen py-2">
      <PageHead />

      <DraftLoaderOptions
        setRanks={setRanks}
        setPlayerLib={setPlayerLib}
        setAlertMsg={setAlertMsg}
        setInputFocus={setInputFocus}
        setPosStatsByNumTeamByYear={setPosStatsByNumTeamByYear}
        availPlayers={availPlayers}
        draftStarted={draftStarted}
        arePlayersLoaded={Object.keys( playerLib ).length !== 0}
        isStd={isStd}
      />

      <main className="flex flex-col items-center justify-center w-full flex-1 px-20 text-center">
        {/* Draft Settings */}
        <p className="font-semibold underline mb-2">
          Draft Settings
        </p>
        <div className="flex flex-row mb-4">
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

        <div className="flex flex-col items-center"
          ref={backgroundRef}
        >

          {/* Current Round Board + Position Groupings */}
          <div className="flex flex-row border rounded">
            <div className="flex flex-col">
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

          {/* Search Bar and Errors */}
          <div className="flex flex-col my-8">
            <div className="flex flex-row items-center justify-center content-center">
              <div className="flex flex-col items-center w-full">
                { activeDraftListenerTitle &&
                  <p className="bg-yellow-300 font-semibold shadow rounded-md text-sm my-1">
                    Listening to: { activeDraftListenerTitle }
                  </p>
                }
                <p className="font-semibold underline">
                  Round { roundIdx+1 } Pick { currRoundPick } (#{ currPick } Overall)
                </p>
                <textarea
                  ref={inputRef}
                  rows={1}
                  className="bg-gray-200 shadow rounded-md my-2 p-1 w-full text-center text-sm text-black focus:outline-none focus:ring-8 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="press keys / commands here"
                  value={search}
                  onChange={onSearch}
                  onKeyUp={ e => {
                    if (['MetaRight', 'MetaLeft'].includes(e.code)) {
                      setShowNextPreds(false)
                    } else if (['ShiftLeft', 'ShiftRight'].includes(e.code)) {
                      // sort by harris
                      onSortRanksByEspn( false )
                    }
                  }}
                  onKeyDown={ e => {
                    // arrow up
                    if (e.code === 'ArrowUp' ) {
                      if ( suggestions.length === 0 ) {
                        onNavRoundUp()
                      } else if ( suggestionIdx > 0 ) {
                        if ( suggestionIdx > 0 ) setSuggestionIdx(suggestionIdx-1)
                      }
                    // arrow down
                    } else if (e.code === 'ArrowDown') {
                      if ( suggestions.length === 0 ) {
                        onNavRoundDown()
                      } else if ( suggestionIdx < suggestions.length-1 ) {
                        setSuggestionIdx(suggestionIdx+1)
                      }
                    // arrow left
                    } else if ( e.code === 'ArrowLeft' ) {
                      onNavLeft()
                    // arrow right
                    } else if ( e.code === 'ArrowRight' ) {
                      onNavRight()
                    // enter
                    } else if (e.code === 'Enter' && suggestionIdx >= 0 && suggestionIdx <= suggestions.length-1 ) {
                      const suggestion = suggestions[suggestionIdx]
                      onSelectPlayer(suggestion)
                    // alt 
                    } else if (['MetaRight', 'MetaLeft'].includes(e.code)) {
                      setShowNextPreds(true)
                    // shift 
                    } else if (['ShiftLeft', 'ShiftRight'].includes(e.code)) {
                      onSortRanksByEspn( true )
                    }
                  }}
                />
                { suggestions.length > 0 &&
                  <div className="flex flex-col relative">
                    <div className="absolute w-100 z-10 border overflow-y-scroll h-48 w-full text-center bg-white border-gray-400 shadow-lg">
                      { suggestions.map( (player,i) => {
                        return(
                          <p key={i}
                            className={`cursor-pointer p-0.5 hover:bg-gray-200 text-sm ${suggestionIdx === i ? 'bg-gray-200' : ''}`}
                            onClick={() => onSelectPlayer(player)}
                          >
                            { player.name }
                          </p>
                        )
                      })}
                    </div>
                  </div>
                }
              </div>

              <div className="h-full items-center justify-center items-center">
                { roundIdx > 0 &&
                  <AiFillCaretUp
                    className="cursor-pointer my-2"
                    onClick={onNavRoundUp}
                    size={22}
                  />
                }
                <AiFillCaretDown
                  className="cursor-pointer my-2"
                  onClick={onNavRoundDown}
                  size={22}
                />
              </div>
            </div>

            { errs &&
              <div className="flex flex-row h-full items-center justify-center items-center px-2 py-1 my-4 shadow-lg rounded-lg border-2 bg-yellow-200">
                <p className="font-semibold text-sm text-red-500 my-1"> { errs } </p>
              </div>
            }

            { alertMsg &&
              <div className="flex flex-row h-full items-center justify-center items-center px-2 py-1 my-4 shadow-lg rounded-lg border-2 bg-green-200">
                <p className="font-semibold text-sm text-green-500 my-1"> { alertMsg } </p>
              </div>
            }

            <div className="flex flex-col mb-4 h-full items-center justify-center items-center">
              { !showNextPreds &&
                <>
                  <div className="flex flex-row items-center justify-center items-center">
                    <div className={`w-8 h-2 rounded ${ predBgColor }`} />
                    <p className="ml-2 text-xs text-center font-semibold">
                      ({ Object.keys(predictedPicks).length }) players predicted taken before your turn
                    </p>
                  </div>
                  <p className="text-xs mt-1 text-center"> 
                    hold ALT to see players predicted taken before your NEXT turn
                  </p>
                </>
              }
              { showNextPreds &&
                <div className="flex flex-row">
                  <div className={`w-8 h-2 rounded ${ nextPredBgColor }`} />
                  <p className="ml-2 text-xs">
                    ({ Object.keys(nextPredictedPicks).length }) players predicted taken before your NEXT-NEXT turn
                  </p>
                </div>
              }
              <p className="text-xs mt-1 text-center"> 
                hold SHIFT to see players sorted by ESPN ranking
              </p>
            </div>
          </div>

          {/* Stats and Positional Breakdowns */}
          <div className="flex flex-row">
            { viewPlayerId &&
              <div className="mr-8">
                <StatsSection
                  viewPlayerId={viewPlayerId}
                  playerLib={playerLib}
                  posStatsByNumTeamByYear={posStatsByNumTeamByYear}
                  numTeams={numTeams}
                  isStd={isStd}
                />
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
              onSelectPlayer={onSelectPlayer}
              onPurgePlayer={onPurgePlayer}
              setViewPlayerId={setViewPlayerId}
            />

            {/* Roster View */}
            { !noPlayers &&
              <div className="flex flex-col rounded h-full overflow-y-auto ml-8 p-1">
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
            }
          </div>
        </div>
      </main>

      <footer className="flex items-center justify-center w-full h-24 border-t">
        <div className="flex flex-col">
          <a
            className="flex items-center justify-center font-semibold"
            href="https://www.harrisfootball.com/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Powered by <span className="font-bold ml-2 text-blue-600 underline">Harris Football</span>
          </a>
          <a href="https://www.flaticon.com/free-icons/pulse" title="pulse icons">Pulse icons created by Kalashnyk - <span className="font-bold ml-2 text-blue-600 underline">Flaticon</span></a>
        </div>
      </footer>
    </div>
  )
}
