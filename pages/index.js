/*global chrome*/
import React, { useEffect, useState, useCallback } from "react"
import { 
  AiFillCaretDown,
  AiFillCaretUp,
  AiFillCheckCircle,
  AiFillStar
} from 'react-icons/ai'
import { TiDelete } from 'react-icons/ti'
import { BsLink } from 'react-icons/bs'

import PageHead from "../components/pageHead"
import DraftLoaderOptions from "../components/draftLoaderOptions"
import { GetHarrisRanks, GetFprosRanks } from "../behavior/harris"
import {
  createPlayerLibrary,
  createRanks,
  removePlayerFromRanks,
  addPlayerToRanks,
  purgePlayerFromRanks,
  sortRanks,
  nextPositionPicked,
  nextPickedPlayerId,
  allPositions,
  getPicksUntil,
} from "../behavior/draft"
import { useDraftBoard } from '../behavior/hooks/useDraftBoard'
import { useRosters } from '../behavior/hooks/useRosters'
import { useFocus } from '../behavior/hooks/useFocus'


const predBgColor = "bg-gray-400"
const nextPredBgColor = "bg-gray-600"

const getTierStyle = tier => {
  switch(parseInt(tier)) {
    case 1:
      return "bg-yellow-50 text-black"
    case 2:
      return "bg-yellow-100 text-black"
    case 3:
      return "bg-yellow-200 text-black"
    case 4:
      return "bg-yellow-300 text-black"
    case 5:
      return "bg-yellow-400 text-black"
    case 6:
      return "bg-yellow-500 text-black"
    case 7:
      return "bg-yellow-600 text-black"
    case 8:
      return "bg-yellow-700 text-white"
    case 9:
      return "bg-yellow-800 text-white"
    case 10:
      return "bg-yellow-900 text-white"
    default:
      return ""
  }
}

const getPosStyle = position => {
  switch(position) {
    case "QB":
      return "bg-yellow-300 shadow-md"
    case "RB":
      return "bg-blue-300 shadow-md"
    case "WR":
      return "bg-green-300 shadow-md"
    case "TE":
      return "bg-red-300 shadow-md"
    default:
      return ""
  }
}

let listenerDraftPicks = []

let handlePickTimer

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
  
  const [predictedPicks, setPredictedPicks] = useState({})
  const [nextPredictedPicks, setNextPredictedPicks] = useState({})
  const [showNextPreds, setShowNextPreds] = useState(false)
  const [shownPlayerId, setShownPlayerId] = useState(null)
  const [shownPlayerBg, setShownPlayerBg] = useState("")

  const [errs, setErrs] = useState(null)
  const [alertMsg, setAlertMsg] = useState(null)

  // counter to run post predictions after non-current pick events
  const [numPostPredicts, setNumPostPredicts] = useState(0)

  // ranks
  const [playerLib, setPlayerLib] = useState({})
  const [ranks, setRanks] = useState(createRanks([], isStd))
  const [isEspnRank, setIsEspnRank] = useState(false)
  const { availPlayers, harris, purge } = ranks
  const playerRanks = [
    [harris.QB, "QB"],
    [harris.RB, "RB"],
    [harris.WR, "WR"],
    [harris.TE, "TE"],
    [purge, "Purge"],
  ]

  // autocomplete
  const [search, setSearch] = useState("")
  const [inputRef, setInputFocus] = useFocus()
  const [suggestions, setSuggestions] = useState([])
  const [suggestionIdx, setSuggestionIdx] = useState(0)

  // listener

  useEffect(() => {
    window.addEventListener("message", event => {
      const { type, draftPicks: draftPicksData } = event.data
      if (type !== "FROM_EXT")
        return
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
      console.log(draftPicks)
      listenerDraftPicks = draftPicks
    })
  }, [])

  const handleListenedDraftPicks = useCallback(() => {
    if ( listenerDraftPicks.length !== 0 ) {
      listenerDraftPicks.forEach( processListenedDraftPick )
      listenerDraftPicks = []
    }
    handlePickTimer = setTimeout(handleListenedDraftPicks, 900)
  }, [numTeams, ranks, playerLib])

  useEffect(() => {
    handleListenedDraftPicks()

    return () => {
      clearTimeout(handlePickTimer)
    }
  }, [handleListenedDraftPicks])

  const processListenedDraftPick = draftPick => {
    const { round, pick, id } = draftPick
    const player = playerLib[id]
    if ( !id || !player ) {
      return
    }
    console.log('processing pick', player, draftPick)
    const pickNum = ((round-1) * numTeams) + pick

    onDraftPlayer(id, pickNum)
    setCurrPick(pickNum+1)
    if ( !draftStarted ) {
      setDraftStarted(true)
    }

    const newRanks = removePlayerFromRanks( ranks, player )
    setRanks(newRanks)

    addPlayerToRoster( player, pickNum )

    predictPicks()
    setInputFocus()
  }

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

    const newRanks = removePlayerFromRanks( ranks, player )
    setRanks(newRanks)

    addPlayerToRoster( player, currPick )

    predictPicks()
    setInputFocus()
  }

  const onRemovePick = pickNum => {
    const playerId = onRemoveDraftedPlayer(pickNum)
    const player = playerLib[playerId]
    addPlayerToRanks( ranks, player )
    const newRanks = sortRanks( ranks )
    setRanks(newRanks)

    // get round pick for a pick number 
    removePlayerFromRoster( player, pickNum )
    setCurrPick(pickNum)
    setInputFocus()
    setNumPostPredicts(numPostPredicts+1)
  }

  const onPurgePlayer = player => {
    const newRanks = purgePlayerFromRanks( ranks, player )
    setRanks(newRanks)
    setInputFocus()
  }

  // data import export

  const onLoadHarrisRanks = async () => {
    setAlertMsg("Loading...")
    const players = await GetHarrisRanks()
    if ( players ) {
      const playerLib = createPlayerLibrary( players )
      const ranks = createRanks( players, isStd )
      setRanks(ranks)
      setPlayerLib( playerLib )
    }
    setAlertMsg(null)
  }

  const onLoadFprosRanks = async () => {
    setAlertMsg("Loading...")
    const players = await GetFprosRanks()
    if ( players ) {
      const playerLib = createPlayerLibrary( players )
      const ranks = createRanks( players, isStd )
      setRanks(ranks)
      setPlayerLib( playerLib )
    }
    setAlertMsg(null)
  }

  const onUpdateEspnRanks = async () => {
    setAlertMsg("Loading...")
    const { players } = await GetHarrisRanks()
    if ( players ) {
      const newLib = { ...playerLib }
      players.forEach( player => {
        const existPlayer = newLib[player.id]
        if ( existPlayer ) {
          newLib[player.id] = {
            ...existPlayer,
            espnAdp: player.espnAdp,
            position: player.position,
            team: player.team,
          }
        } else {
          newLib[player.id] = player
        }
      })

      const newPlayers = Object.values( newLib )
      const ranks = createRanks( newPlayers, isStd )
      setRanks(ranks)
      setPlayerLib( newLib )
    }
    setAlertMsg(null)
  }

  useEffect(() => {
    if ( numPostPredicts > 0 ) {
      predictPicks()
    }
  }, [numPostPredicts])

  const onSetCsvData = () => {    
    // get all unique keys in data
    const allKeys = {}
    availPlayers.forEach( p => Object.keys(p).forEach(key => {
      allKeys[key] = 1
    }))
    const keys = Object.keys(allKeys)
    const ranksData = availPlayers.map( player => {
      return keys.map( key => player[key])
    })
    const csvData = [keys, ...ranksData]
    setCsvData(csvData)
  }

  const onFileLoaded = (players) => {
    console.log('onFileLoaded', players)
    const playerLib = createPlayerLibrary( players )
    const ranks = createRanks( players, isStd )
    setRanks(ranks)
    setPlayerLib( playerLib )
    setIsUpload(false)
  }

  const predictPicks = () => {
    const [picksUntil, nextPicksUntil] = getPicksUntil(myPickNum, currPick, numTeams)

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
  }

  // batch parsing

  // const onParsePlayers = text => {
  //   const lines = text.split("\n\n")
  //   const rgxName = /^(.+) \/ .{2,5} .{2,5}\nR(\d+), P(\d+) - Team/i
  //   const allPlayers = Object.values( playerLib )
  //   let newRanks = ranks
  //   let newRosters = rosters
  //   let lastRound, lastPick
  //   let isDraftStarted = draftStarted
  //   for (let i=0; i<=lines.length-1; i++) {
  //     const line = lines[i]
  //     const pickMatch = line.match(rgxName)
  //     if ( !pickMatch || pickMatch.length < 4 ) {
  //       continue
  //     }
  //     const roundNum = parseInt( pickMatch[2] )
  //     const pickNum = parseInt( pickMatch[3] )
  //     if ( !roundNum || !pickNum ) {
  //       continue
  //     }
  //     let player
  //     for (let i=0; i<allPlayers.length-1; i++) {
  //       if (allPlayers[i].name === pickMatch[1]) {
  //         player = allPlayers[i]
  //         break
  //       }
  //     }
  //     if ( !player ) {
  //       continue
  //     }
  //     if ( roundNum > rounds.length + 1 ) {
  //       setErrs("Parsing too many rounds ahead of the current pick!")
  //       return
  //     }
  //     rounds[roundNum-1][pickNum-1] = player.id
  //     newRanks = removePlayerFromRanks( ranks, player )
  //     const rosterIdx = roundNum % 2 === 0 ? numTeams - pickNum : pickNum - 1
  //     newRosters = addToRoster( newRosters, player, rosterIdx)
  //     lastRound = roundNum
  //     lastPick = pickNum
  //     isDraftStarted = true
  //   }
  //   setDraftStarted( isDraftStarted )
  //   setRanks(newRanks)
  //   setRounds([...rounds])
  //   const newCurrPick = ((lastRound - 1) * numTeams) + lastPick + 1
  //   setCurrPick(newCurrPick)
  //   setRosters( newRosters )
  //   setNumPostPredicts(numPostPredicts+1)
  //   setInputFocus()
  // }

  console.log('render', rosters, viewRosterIdx, currRound )

  return (
    <div className="flex flex-col items-center justify-center min-h-screen py-2">
      <PageHead />
      <main className="flex flex-col items-center justify-center w-full flex-1 px-20 text-center">

        <DraftLoaderOptions
          onLoadHarrisRanks={onLoadHarrisRanks}
          onLoadFprosRanks={onLoadFprosRanks}
          onFileLoaded={onFileLoaded}
          onUpdateEspnRanks={onUpdateEspnRanks}
          onSetCsvData={onSetCsvData}
          draftStarted={draftStarted}
          arePlayersLoaded={Object.keys( playerLib ).length !== 0}
        />

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
                const newRanks = createRanks( Object.values( playerLib ), newIsStd)
                setRanks(newRanks)
              }}
              disabled={draftStarted}
            >
              { ["Standard", "PPR"].map( opt => <option key={opt} value={ opt }> { opt } </option>) }
            </select>
          </div>
        </div>

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

        <div className="flex flex-col my-8">
          <div className="flex flex-row justify-items-center justify-center content-center">
            <div className="flex flex-col w-full">
              <p className="font-semibold underline">
                Round { roundIdx+1 } Pick { currRoundPick } (#{ currPick } Overall)
              </p>
              <textarea
                rows={1}
                className="bg-gray-200 shadow rounded-md my-2 p-1 w-full text-center text-sm text-black"
                placeholder="search by player name or copy ESPN live draft feed"
                value={search}
                onChange={onSearch}
                onKeyUp={ e => {
                  if (['MetaRight', 'MetaLeft'].includes(e.code)) {
                    setShowNextPreds(false)
                  } else if (['ShiftLeft', 'ShiftRight'].includes(e.code)) {
                    const newRanks = sortRanks( ranks )
                    setRanks( newRanks )
                    setIsEspnRank(false)
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
                    const newRanks = sortRanks( ranks, true )
                    setRanks( newRanks )
                    setIsEspnRank(true)
                  }
                }}
                ref={inputRef}
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

          <div className="flex flex-row border rounded h-full overflow-y-auto">
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

            { playerRanks.filter(([posGroup,])=> posGroup.length > 0).map( ([posGroup, posName], i) => {
              const posStyle = getPosStyle(posName)
              return(
                <div key={i}
                  className="flex flex-col"
                >
                  <div className={`p-1 rounded m-1 ${posStyle}`}>
                    { posName }
                  </div>
                  { posGroup.slice(0,30).map( ([pId,]) => playerLib[pId] ).filter( p => !!p ).map( player => {
                    const { firstName, lastName, name, id, team, tier, customPprRank, customStdRank, espnAdp, target } = player
                    let tierStyle
                    if ( shownPlayerId === id && !!shownPlayerBg ) {
                      tierStyle = shownPlayerBg
                    } else if ( showNextPreds && nextPredictedPicks[player.id] ) {
                      tierStyle = `${nextPredBgColor} text-white`
                    } else if ( !showNextPreds && predictedPicks[player.id] ) {
                      tierStyle = `${predBgColor} text-white`
                    } else {
                      tierStyle = getTierStyle(player.tier)
                    }
                    const playerUrl = `${firstName.toLowerCase()}-${lastName.toLowerCase()}`
                    let rankText
                    if ( isEspnRank ) {
                      rankText = `ESPN ADP #${espnAdp}`
                    } else {
                      rankText = isStd ? `#${customStdRank}` : `#${customPprRank}`
                    }

                    return(
                      <div key={id} id={id}
                        className={`px-2 py-1 m-1 text-center border rounded shadow-md relative ${tierStyle} `}
                        onMouseEnter={ () => setShownPlayerId(id) }
                        onMouseLeave={ () => setShownPlayerId(null) }
                      >
                        <div className="flex flex-col text-center">
                          <p className="text-sm font-semibold flex">
                            { name }
                            { target &&
                              <AiFillStar
                                color="blue"
                                size={24}
                              />
                            }
                          </p>
                          <p className="text-xs">
                            { team } - { rankText } { tier ? ` - Tier ${tier}` : "" }
                          </p>

                          { shownPlayerId === id &&
                            <div className={`grid grid-cols-3 mt-1 w-full absolute opacity-60`}>
                              <TiDelete
                                className="cursor-pointer -mt-2"
                                color="red"
                                onClick={ () => onPurgePlayer( player) }
                                onMouseEnter={() => setShownPlayerBg("bg-red-500")}
                                onMouseLeave={() => setShownPlayerBg("")}
                                size={46}
                              />

                              <AiFillCheckCircle
                                className="cursor-pointer -mt-1"
                                color="green"
                                onClick={ () => onSelectPlayer( player ) }
                                onMouseEnter={() => setShownPlayerBg("bg-green-400")}
                                onMouseLeave={() => setShownPlayerBg("")}
                                size={33}
                              />

                              <BsLink
                                className="cursor-pointer -mt-2"
                                color="blue"
                                onClick={ () => window.open(`https://www.fantasypros.com/nfl/games/${playerUrl}.php`) }
                                onMouseEnter={() => setShownPlayerBg("bg-blue-400")}
                                onMouseLeave={() => setShownPlayerBg("")}
                                size={40}
                              />
                            </div>
                          }
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>

      </main>

      <footer className="flex items-center justify-center w-full h-24 border-t">
        <a
          className="flex items-center justify-center font-semibold"
          href="https://www.harrisfootball.com/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Powered by <span className="font-bold ml-2 text-blue-600 underline">Harris Football</span>
        </a>
      </footer>
    </div>
  )
}
