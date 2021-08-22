import Head from 'next/head'
import React, { useEffect, useState, useRef } from "react"
import { CSVLink } from "react-csv"
import CSVReader from 'react-csv-reader'
import { 
  AiFillCaretDown,
  AiFillCaretUp,
  AiFillCheckCircle,
} from 'react-icons/ai'
import {
  TiDelete,
} from 'react-icons/ti'
import {
  BsLink,
} from 'react-icons/bs'

import { GetHarrisRanks } from "../behavior/harris"
import {
  createPlayerLibrary,
  createRanks,
  removePlayerFromRanks,
  addPlayerToRanks,
  purgePlayerFromRanks,
  sortRanks,

  createRosters,
  addToRoster,
  removeFromRoster,

  nextPositionPicked,
  nextPickedPlayerId,

  allPositions,

  delay,
} from "../behavior/draft"


const useFocus = () => {
  const htmlElRef = useRef(null)
  const setFocus = () => {htmlElRef.current &&  htmlElRef.current.focus()}

  return [ htmlElRef, setFocus ] 
}

const newRound = numTeams => new Array(numTeams).fill(null)

const predBgColor = "bg-gray-500"

const getTierStyle = tier => {
  switch(tier) {
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

export default function Home() {
  const [numTeams, _] = useState(12)
  const [draftStarted, setDraftStarted] = useState(false)
  const [shownPlayerId, setShownPlayerId] = useState(null)
  const [myPickNum, setMyPickNum] = useState(6)
  const [predictedPicks, setPredictedPicks] = useState({})

  // counter to run post predictions after non-current pick events
  const [numPostPredicts, setNumPostPredicts] = useState(0)

  // rosters
  const [rosters, setRosters] = useState([])

  // rounds
  const [currPick, setCurrPick] = useState(1)
  const [rounds, setRounds] = useState([])
  const roundIdx = Math.floor( (currPick-1) / numTeams )
  const isEvenRound = roundIdx % 2 == 1
  const currRound = rounds[roundIdx] || []
  const isRoundEmpty = currRound.every( p => !p )
  const currRoundPick = currPick % numTeams === 0 ? 12 : currPick % numTeams
  const currMyPickNum = isEvenRound ? numTeams - myPickNum + 1 : myPickNum
  const nextMyPickNum = isEvenRound ? myPickNum : numTeams - myPickNum + 1

  // ranks
  const [playerLib, setPlayerLib] = useState({})
  const [ranks, setRanks] = useState(createRanks([], false))
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

  // csv
  const [csvData, setCsvData] = useState(null)
  const [isUpload, setIsUpload] = useState(false)

  // nav
  const onNavRoundUp = () => {
    if ( isEvenRound ) {
      setCurrPick(currPick - (2*(currRoundPick-1)+1))
    } else {
      if ( roundIdx > 0 ) setCurrPick(currPick - (2*currRoundPick)+1)
    }
  }

  const onNavRoundDown = () => {
    if ( roundIdx === rounds.length-1 ) {
      // dont allow new round if curr round is empty
      if ( isRoundEmpty ) {
        return
      }
      setRounds([...rounds, newRound(numTeams)])
    }

    setCurrPick(currPick + (2*(numTeams-currRoundPick)+1))
  }

  const onSearch = e => {
    const text = e.target.value
    setSearch(text)
    // bulk parse
    if ( text.includes( "\n")) {
      onParsePlayers( text )
      setSearch("")
    } else {
      // normal search suggest
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
    currRound[currRoundPick-1] = player.id
    setRounds(
      [
        ...rounds.slice(0, roundIdx),
        currRound,
        ...rounds.slice(roundIdx+1, rounds.length)
      ]
    )
    setCurrPick(currPick+1)
    if ( currRoundPick === 12 ) {
      setRounds([...rounds, newRound(numTeams)])
    }
    if ( !draftStarted ) {
      setDraftStarted(true)
    }

    setSuggestionIdx(0)
    setSuggestions([])
    setSearch("")

    const newRanks = removePlayerFromRanks( ranks, player )
    setRanks(newRanks)
    const rosterIdx = isEvenRound ? numTeams-currRoundPick : currRoundPick-1
    const newRosters = addToRoster( rosters, player, rosterIdx)
    setRosters( newRosters )

    predictPicks()
    setInputFocus()
  }

  const onRemovePick = pickNum => {
    const pickRdIdx = Math.floor( (pickNum-1) / numTeams )
    const pickRd = rounds[pickRdIdx]
    const currRoundIdx = (pickNum % numTeams)-1
    if ( currRoundIdx === -1 ) currRoundIdx = 11
    const playerId = pickRd[currRoundIdx]
    const player = playerLib[playerId]
    pickRd[currRoundIdx] = undefined
    setRounds(
      [
        ...rounds.slice(0, pickRdIdx),
        pickRd,
        ...rounds.slice(pickRdIdx+1, rounds.length)
      ]
    )
    addPlayerToRanks( ranks, player )
    const newRanks = sortRanks( ranks )
    setRanks(newRanks)
    const newRosters = removeFromRoster( rosters, player, currRoundPick-1)
    setRosters( newRosters )
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
    const { players } = await GetHarrisRanks()
    if ( players ) {
      const playerLib = createPlayerLibrary( players )
      const ranks = createRanks( players, false )
      console.log('loaded ranks', ranks)
      setRanks(ranks)
      setPlayerLib( playerLib )
    }
  }

  useEffect(() => {
    setRounds([newRound(numTeams)])
    setRosters(createRosters(numTeams))
  }, [numTeams])

  useEffect(() => {
    if ( numPostPredicts > 0 ) {
      predictPicks()
    }
  }, [numPostPredicts])

  const onSetCsvData = () => {
    if ( draftStarted ) {
      return
    }
    
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
    console.log(csvData)
    setCsvData(csvData)
  }

  const papaparseOptions = {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
  }

  const onFileLoaded = (players, fileInfo) => {
    console.log('uploaded', players, fileInfo)
    const playerLib = createPlayerLibrary( players )
    const ranks = createRanks( players, false )
    setRanks(ranks)
    setPlayerLib( playerLib )
    setIsUpload(false)
  }

  const predictPicks = () => {
    let picksUntil
    if ( currMyPickNum > currRoundPick + 1 ) {
      picksUntil = currMyPickNum - currRoundPick - 1
    } else {
      picksUntil = (numTeams - currRoundPick + 1) + (nextMyPickNum - 1) - 1
    }
    console.log('picksUntil', currRoundPick, picksUntil)

    let posCounts = { QB: 0, RB: 0, WR: 0, TE: 0 }
    rosters.forEach( roster => {
      allPositions.forEach( pos => {
        posCounts[pos] += roster[pos].length
      })
    })
    let allPredicts = {}
    Array.from(Array(picksUntil)).forEach((_, i) => {
      const roster = rosters[currRoundPick-1]
      const roundNum = Math.floor((currPick+i-1) / numTeams) + 1
      const positions = nextPositionPicked( roster, roundNum, posCounts )
      const { predicted, updatedCounts } = nextPickedPlayerId( ranks, positions, allPredicts, i+1, posCounts )
      allPredicts = predicted
      posCounts = updatedCounts
    })

    console.log('Predictions: ', Object.keys( allPredicts ).sort((a,b) => allPredicts[a] - allPredicts[b]).map( id => playerLib[id].name ))
    setPredictedPicks( allPredicts )
  }

  // batch parsing

  const onParsePlayers = text => {
    const lines = text.split("\n\n")
    const rgxName = /^(.+) \/ .{2,5} .{2,5}\nR(\d+), P(\d+) - Team/i
    const allPlayers = Object.values( playerLib )
    let newRanks = ranks
    let newRosters = rosters
    let lastRound, lastPick
    lines.forEach( line => {
      const pickMatch = line.match(rgxName)
      console.log('pickMatch', pickMatch)
      if ( !pickMatch || pickMatch.length < 4 ) {
        return
      }
      const roundNum = parseInt( pickMatch[2] )
      const pickNum = parseInt( pickMatch[3] )
      if ( !roundNum || !pickNum ) {
        return
      }
      let player
      for (let i=0; i<allPlayers.length-1; i++) {
        if (allPlayers[i].name === pickMatch[1]) {
          player = allPlayers[i]
          break
        }
      }
      if ( !player ) {
        return
      }
      rounds[roundNum-1][pickNum-1] = player.id
      newRanks = removePlayerFromRanks( ranks, player )
      const rosterIdx = roundNum % 2 === 0 ? numTeams - pickNum : pickNum - 1
      newRosters = addToRoster( rosters, player, rosterIdx)
      lastRound = roundNum
      lastPick = pickNum
    })

    setRanks(newRanks)
    setRounds([...rounds])
    setCurrPick(((lastRound - 1) * numTeams) + lastPick + 1)
    setRosters( newRosters )
    setNumPostPredicts(numPostPredicts+1)
    setInputFocus()
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen py-2">
      <Head>
        <title>Draft Dashboard</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className="flex flex-col items-center justify-center w-full flex-1 px-20 text-center">

        <div className="flex flex-row">
          <div className="flex flex-row text-sm text-center mr-2">
            <p className="align-text-bottom align-bottom p-1 m-2">
              Your Pick #
            </p>
            <input type="text"
              className="w-10 h-8 border rounded p-1 m-2"
              value={myPickNum}
              onChange={ e => setMyPickNum(parseInt(e.target.value)) }
              pattern="[0-9]*"
              disabled={draftStarted}
            />
          </div>

          <div className="flex flex-col">
            <input type="button"
              className="border rounded p-1 m-2 cursor-pointer bg-blue-200"
              value="Load Harris Ranks"
              onClick={ onLoadHarrisRanks }
            />
          </div>

          <div className="flex flex-col">
            { (!draftStarted && !csvData && availPlayers.length > 0) &&
              <input type="button"
                className="border rounded p-1 m-2 cursor-pointer bg-green-200"
                value="Export CSV"
                onClick={ onSetCsvData }
              />
            }
            { csvData && 
              <CSVLink data={csvData}
                className="border rounded p-1 m-2 cursor-pointer bg-green-300"
              >
                Download
              </CSVLink>
            }
          </div>

          <div className="flex flex-col">
            { !isUpload &&
              <input type="button"
                className="border rounded p-1 m-2 cursor-pointer bg-green-200"
                value="Upload CSV"
                onClick={ () => setIsUpload(true) }
              />
            }
            { isUpload &&
              <CSVReader
                cssClass="flex flex-col text-left text-sm border rounded p-1 m-2"
                label="Upload Ranks"
                onFileLoaded={ onFileLoaded }
                parserOptions={papaparseOptions}
              />
            }
          </div>
        </div>

        <div className="flex flex-row border rounded">
          <div className="flex flex-col">
            <table class="table-auto">
              <tbody>
                <tr className={`flex justify-between ${isEvenRound ? 'flex-row-reverse' : ''}`}>
                  { currRound.map( (pick, i) => {
                    let bgColor = ""
                    let hover = ""
                    const player = playerLib[pick]
                    if ( i+1 === currRoundPick ) {
                      bgColor = "bg-yellow-400"
                      hover = "hover:bg-yellow-300"
                    } else if ( !!player ) {
                      if ( player.position === "QB" ) bgColor = "bg-yellow-100 shadow-md"
                      if ( player.position === "RB" ) bgColor = "bg-blue-100 shadow-md"
                      if ( player.position === "WR" ) bgColor = "bg-green-100 shadow-md"
                      if ( player.position === "TE" ) bgColor = "bg-pink-300 shadow-md"
                      hover = "hover:bg-red-300"
                    } else {
                      bgColor = "bg-gray-100"
                      hover = "hover:bg-yellow-200"
                    }
                    const myPickStyle = i+1 == currMyPickNum ? "border-4 border-green-400" : "border"
                    const pickNum = roundIdx*numTeams+(i+1)
                    return(
                      <td className={`flex flex-col p-1 m-1 rounded ${myPickStyle} ${hover} cursor-pointer text-sm ${bgColor}`}
                        onClick={ pick ? () => onRemovePick(pickNum) : () => onSelectPick( pickNum ) }
                        key={i}
                      >
                        <p className="font-semibold">
                          { `#${pickNum}` } { pick ? ` | Rd ${roundIdx+1} Pick ${i+1}` : "" }
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

        <div className="flex flex-col mt-2">
          <div className="flex flex-row justify-items-center justify-center content-center">
            <div className="flex flex-col w-3/4">
              <p className="font-semibold underline">
                Round { roundIdx+1 } Pick { currRoundPick } (#{ currPick } Overall)
              </p>
              <input type="text"
                className="border-2 rounded m-1 p-1 text-center text-sm"
                placeholder="search by player name or copy ESPN live draft feed"
                value={search}
                onChange={onSearch}
                onKeyDown={ e => {
                  console.log('onKeyDown', e.code)
                  // arrow up
                  if (e.code === 'ArrowUp' ) {
                    if ( suggestions.length === 0 ) {
                      onNavRoundUp()
                    } else if ( suggestionIdx > 0 ) {
                      // suggestion up
                      if ( suggestionIdx > 0 ) setSuggestionIdx(suggestionIdx-1)
                    }

                  // arrow down
                  } else if (e.code === 'ArrowDown') {
                    if ( suggestions.length === 0 ) {
                      onNavRoundDown()
                    } else if ( suggestionIdx < suggestions.length-1 ) {
                      // suggestion down
                      setSuggestionIdx(suggestionIdx+1)
                    }

                  // arrow left
                  } else if ( e.code === 'ArrowLeft' ) {
                    if ( currPick === 1 ) {
                      return
                    }
                    if ( currRoundPick === numTeams ) {
                      if ( isRoundEmpty ) {
                        return
                      }
                      setRounds([...rounds, newRound(numTeams)])
                    }
                    const diff = isEvenRound ? 1 : -1
                    setCurrPick(currPick+diff)

                  // arrow right
                  } else if ( e.code === 'ArrowRight' ) {
                    if ( currRoundPick === numTeams ) {
                      if ( isRoundEmpty ) {
                        return
                      }
                      setRounds([...rounds, newRound(numTeams)])
                    }
                    const diff = isEvenRound ? -1 : 1
                    setCurrPick(currPick+diff)

                  // enter
                  } else if (e.code === 'Enter' && suggestionIdx >= 0 && suggestionIdx <= suggestions.length-1 ) {
                    const suggestion = suggestions[suggestionIdx]
                    onSelectPlayer(suggestion)
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

              { !isRoundEmpty &&
                <AiFillCaretDown
                  className="cursor-pointer my-2"
                  onClick={onNavRoundDown}
                  size={22}
                />
              }
            </div>
          </div>

          <div className="flex flex-row mb-4 h-full items-center justify-center items-center">
            <div className={`w-8 h-2 rounded ${predBgColor}`} />
            <p className="ml-2 text-xs">
              Players predicted taken before you next turn
            </p>
          </div>

          <div className="flex flex-row border rounded h-full overflow-y-auto">
            { playerRanks.filter(([posGroup,])=> posGroup.length > 0).map( ([posGroup, posName], i) => {
              return(
                <div key={i}
                  className="flex flex-col"
                >
                  <div> { posName }</div>
                  { posGroup.slice(0,30).map( ([id,]) => playerLib[id] ).filter( p => !!p ).map( player => {
                    let tierStyle = getTierStyle(player.tier)
                    if ( predictedPicks[player.id] ) tierStyle = `${predBgColor} text-white`
                    const { firstName, lastName, name, id, team, tier, harrisPprRank } = player
                    const playerUrl = `${firstName.toLowerCase()}-${lastName.toLowerCase()}`
                    return(
                      <div key={id} id={id}
                        className={`px-2 py-1 m-1 text-center border rounded shadow-md hover:bg-blue-200 ${tierStyle}`}
                        onMouseEnter={ () => setShownPlayerId(id) }
                        onMouseLeave={ () => setShownPlayerId(null) }
                      >
                        <div className="flex flex-col text-center">
                          <p className="text-sm font-semibold">
                            { name }
                          </p>
                          <p className="text-xs">
                            { team } - #{ harrisPprRank} { tier ? ` - ${tier}` : "" }
                          </p>

                          { shownPlayerId === id &&
                            <div className="flex flex-col text-xs mt-1 items-center justify-center justify-items-center bg-yellow-200 p-1 shadow-md rounded-md">
                              <div className="flex flex-row text-xs">
                                <TiDelete
                                  className="mx-2 cursor-pointer"
                                  color="red"
                                  onClick={ () => onPurgePlayer( player) }
                                  size={40}
                                />

                                <AiFillCheckCircle
                                  className="mx-2 cursor-pointer"
                                  color="green"
                                  onClick={ () => onSelectPlayer( player ) }
                                  size={40}
                                />

                                <BsLink
                                  className="mx-2 cursor-pointer"
                                  color="blue"
                                  size={40}
                                  onClick={ () => window.open(`https://www.fantasypros.com/nfl/games/${playerUrl}.php`) }
                                />
                              </div>
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
          className="flex items-center justify-center"
          href="https://vercel.com?utm_source=create-next-app&utm_medium=default-template&utm_campaign=create-next-app"
          target="_blank"
          rel="noopener noreferrer"
        >
          Powered by{' '}
          <img src="/vercel.svg" alt="Vercel Logo" className="h-4 ml-2" />
        </a>
      </footer>
    </div>
  )
}
