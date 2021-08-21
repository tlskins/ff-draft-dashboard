import Head from 'next/head'
import React, { useEffect, useState, useRef } from "react"
import { CSVLink, CSVDownload } from "react-csv"
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


const useFocus = () => {
  const htmlElRef = useRef(null)
  const setFocus = () => {htmlElRef.current &&  htmlElRef.current.focus()}

  return [ htmlElRef, setFocus ] 
}

const newRound = numTeams => new Array(numTeams).fill(null)

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
  const [availPlayers, setAvailPlayers] = useState([])
  const [numTeams, _] = useState(12)
  const [draftStarted, setDraftStarted] = useState(false)
  const [shownPlayerId, setShownPlayerId] = useState(null)

  // rounds
  const [currPick, setCurrPick] = useState(1)
  const [rounds, setRounds] = useState([])
  const roundIdx = Math.floor( (currPick-1) / numTeams )
  const isEvenRound = roundIdx % 2 == 1
  const currRound = rounds[roundIdx] || []
  const isRoundEmpty = currRound.every( p => !p )
  let currRoundPick = currPick % numTeams
  if ( currRoundPick === 0 ) currRoundPick = 12

  // autocomplete
  const [search, setSearch] = useState("")
  const [inputRef, setInputFocus] = useFocus()
  const [suggestions, setSuggestions] = useState([])
  const [suggestionIdx, setSuggestionIdx] = useState(0)

  // ranks
  const [posRanks, setPosRanks] = useState({
    QB: [], RB: [], WR: [], TE: [], purge: [],
  })
  const playerColumns = [[posRanks.QB, "QB"], [posRanks.RB, "RB"], [posRanks.WR, "WR"], [posRanks.TE, "TE"], [posRanks.purge, "Purge"]]

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
    if ( text.length > 1 ) {
      const regex = new RegExp(text, 'gi');
      const filtered = availPlayers.filter( player => regex.test(player.matchName) )
      setSuggestions(filtered)
    } else {
      setSuggestions([])
    }
  }

  const onSelectPick = pickNum => {
    setCurrPick(pickNum)
    setInputFocus()
  }

  const onSelectPlayer = player => {    
    currRound[currRoundPick-1] = player
    setRounds(
      [
        ...rounds.slice(0, roundIdx),
        currRound,
        ...rounds.slice(roundIdx+1, rounds.length)
      ]
    )
    setAvailPlayers(availPlayers.filter( p => p.id !== player.id ))
    setSuggestionIdx(0)
    setSuggestions([])
    setSearch("")
    const posRank = posRanks[player.position]
    setPosRanks({
      ...posRanks,
      purge: posRanks.purge.filter( p => p.id !== player.id ),
      [player.position]: posRank.filter( p => p.id !== player.id ),
    })
    setCurrPick(currPick+1)
    if ( currRoundPick === 12 ) {
      setRounds([...rounds, newRound(numTeams)])
    }
    if ( !draftStarted ) {
      setDraftStarted(true)
    }
  }

  const onPurgePlayer = player => {    
    setAvailPlayers(availPlayers.filter( p => p.id !== player.id ))
    const purgeIdx = posRanks.purge.findIndex( p => p.id === player.id )

    if ( purgeIdx === -1 ) {
      setPosRanks({
        ...posRanks,
        purge: [...posRanks.purge, player],
        [player.position]: posRanks[player.position].filter( p => p.id !== player.id ),
      })
    } else {
      let posRank = [...posRanks[player.position], player]
      posRank = posRank.sort((a,b) => a.harrisPprRank - b.harrisPprRank )
      setPosRanks({
        ...posRanks,
        purge: posRanks.purge.filter( p => p.id !== player.id ),
        [player.position]: posRank,
      })
    }
  }

  const onRemovePick = pickNum => {
    const pickRdIdx = Math.floor( (pickNum-1) / numTeams )
    const pickRd = rounds[pickRdIdx]
    const currRoundIdx = (pickNum % numTeams)-1
    if ( currRoundIdx === -1 ) currRoundIdx = 11
    const player = pickRd[currRoundIdx]
    pickRd[currRoundIdx] = undefined
    setRounds(
      [
        ...rounds.slice(0, pickRdIdx),
        pickRd,
        ...rounds.slice(pickRdIdx+1, rounds.length)
      ]
    )
    let posRank = [...posRanks[player.position], player]
    console.log('posRank', posRank)
    posRank = posRank.sort((a,b) => a.harrisPprRank - b.harrisPprRank )
    setPosRanks({
      ...posRanks,
      [player.position]: posRank
    })
    setAvailPlayers([...availPlayers, player])
  }

  const onLoadHarrisRanks = async () => {
    const resp = await GetHarrisRanks()
    if ( resp ) {
      let { QB, RB, WR, TE } = resp
      QB = QB.filter( p => !!p.harrisPprRank).sort((a,b) => a.harrisPprRank - b.harrisPprRank )
      RB = RB.filter( p => !!p.harrisPprRank).sort((a,b) => a.harrisPprRank - b.harrisPprRank )
      WR = WR.filter( p => !!p.harrisPprRank).sort((a,b) => a.harrisPprRank - b.harrisPprRank )
      TE = TE.filter( p => !!p.harrisPprRank).sort((a,b) => a.harrisPprRank - b.harrisPprRank )

      const availPlayers = [ ...QB, ...RB, ...WR, ...TE ]
      console.log('harrisRanks', availPlayers)
      setAvailPlayers(availPlayers)
      setPosRanks({ QB, RB, WR, TE, purge: []})
    }
  }

  useEffect(() => {
    setRounds([newRound(numTeams)])
  }, [numTeams])

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
    const QB = players.filter( p => !!p.harrisPprRank && p.position === "QB" ).sort((a,b) => a.harrisPprRank - b.harrisPprRank )
    const RB = players.filter( p => !!p.harrisPprRank && p.position === "RB" ).sort((a,b) => a.harrisPprRank - b.harrisPprRank )
    const WR = players.filter( p => !!p.harrisPprRank && p.position === "WR" ).sort((a,b) => a.harrisPprRank - b.harrisPprRank )
    const TE = players.filter( p => !!p.harrisPprRank && p.position === "TE" ).sort((a,b) => a.harrisPprRank - b.harrisPprRank )
    setAvailPlayers(players)
    setPosRanks({ QB, RB, WR, TE, purge: [] })
    setIsUpload(false)
  }

  console.log('render', isEvenRound, roundIdx, currPick, currRoundPick)

  return (
    <div className="flex flex-col items-center justify-center min-h-screen py-2">
      <Head>
        <title>Draft Dashboard</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className="flex flex-col items-center justify-center w-full flex-1 px-20 text-center">

        <div className="flex flex-row">
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
                    if ( i+1 === currRoundPick ) {
                      bgColor = "bg-yellow-200"
                      hover = "hover:bg-yellow-300"
                    } else if ( !!pick ) {
                      bgColor = "bg-blue-200"
                      hover = "hover:bg-red-300"
                    } else {
                      bgColor = "bg-gray-100"
                      hover = "hover:bg-yellow-200"
                    }
                    const pickNum = roundIdx*numTeams+(i+1)
                    return(
                      <td className={`flex flex-col p-1 m-1 rounded border ${hover} cursor-pointer text-sm ${bgColor}`}
                        onClick={ pick ? () => onRemovePick(pickNum) : () => onSelectPick( pickNum ) }
                        key={i}
                      >
                        <p className="font-semibold">
                          { `#${pickNum}` } { pick ? ` | Rd ${roundIdx+1} Pick ${i+1}` : "" }
                        </p>
                        { pick && <p> { pick.name } </p> }
                      </td>
                    )
                  })}
                </tr>
              </tbody>
            </table>
          </div>

          <div className="flex flex-row relative">
            <div className="flex flex-col relative">
              <div>Round { roundIdx+1 } | Pick { currPick }</div>
              <input type="text"
                className="border-2 rounded m-1"
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
                <div className="absolute w-100 z-10 border overflow-y-scroll h-48 bg-white border-gray-400 shadow-lg">
                  { suggestions.map( (player,i) => {
                    return(
                      <p className={`cursor-pointer p-0.5 hover:bg-gray-200 text-sm ${suggestionIdx === i ? 'bg-gray-200' : ''}`}
                        key={i}
                      >
                        { player.name }
                      </p>
                    )
                  })}
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
        </div>

        <div className="flex flex-row border rounded h-96 mt-2 overflow-y-auto">
          { playerColumns.filter(([posGroup,])=> posGroup.length > 0).map( ([posGroup, posName], i) => {
            return(
              <div key={i}
                className="flex flex-col"
              >
                <div> { posName }</div>
                { posGroup.slice(0,30).map( (player) => {
                  const tierStyle = getTierStyle(player.tier)
                  const { firstName, lastName, name, id, team, tier, harrisPprRank, position } = player
                  const playerUrl = `${firstName.toLowerCase()}-${lastName.toLowerCase()}`
                  return(
                    <div key={id}
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
                                size={20}
                              />

                              <AiFillCheckCircle
                                className="mx-2 cursor-pointer"
                                color="green"
                                onClick={ () => onSelectPlayer( player ) }
                                size={18}
                              />

                              <BsLink
                                className="mx-2 cursor-pointer"
                                color="blue"
                                size={20}
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
