import Head from 'next/head'
import React, { useEffect, useState, useRef } from "react"
import { CSVLink, CSVDownload } from "react-csv"

import { GetHarrisRanks } from "../behavior/harris"


const useFocus = () => {
  const htmlElRef = useRef(null)
  const setFocus = () => {htmlElRef.current &&  htmlElRef.current.focus()}

  return [ htmlElRef, setFocus ] 
}

export default function Home() {
  const [availPlayers, setAvailPlayers] = useState([])
  const [numTeams, _] = useState(12)
  const [draftStarted, setDraftStarted] = useState(false)

  // rounds
  const [currPick, setCurrPick] = useState(1)
  const [rounds, setRounds] = useState([])
  const roundIdx = Math.floor( (currPick-1) / numTeams )
  const isEvenRound = roundIdx % 2 == 1
  const currRound = rounds[roundIdx] || []
  const isRoundEmpty = currRound.every( p => !p )
  let currRoundPick = currPick % numTeams
  if ( currRoundPick === 0 ) currRoundPick = 12

  let currRoundPicks = currRound.map( (_, idx) => idx + 1 )

  
  const newRound = () => new Array(numTeams).fill(null)

  // autocomplete
  const [search, setSearch] = useState("")
  const [inputRef, setInputFocus] = useFocus()
  const [suggestions, setSuggestions] = useState([])
  const [suggestionIdx, setSuggestionIdx] = useState(0)

  // ranks
  const [posRanks, setPosRanks] = useState({
    QB: [], RB: [], WR: [], TE: [],
  })

  // csv
  const [csvData, setCsvData] = useState(null)

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

  const onSelectPick = i => () => {
    setCurrPick((i+1) + (roundIdx * numTeams))
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
    setPosRanks({ ...posRanks, [player.position]: posRank.filter( p => p.id !== player.id )})
    setCurrPick(currPick+1)
    if ( currRoundPick === 12 ) {
      setRounds([...rounds, newRound()])
    }
    if ( !draftStarted ) {
      setDraftStarted(true)
    }
  }

  useEffect(async () => {
    const resp = await GetHarrisRanks()
    if ( resp ) {
      let { QB, RB, WR, TE } = resp
      QB = QB.filter( p => !!p.harrisPPRRank).sort((a,b) => a.harrisPPRRank - b.harrisPPRRank )
      RB = RB.filter( p => !!p.harrisPPRRank).sort((a,b) => a.harrisPPRRank - b.harrisPPRRank )
      WR = WR.filter( p => !!p.harrisPPRRank).sort((a,b) => a.harrisPPRRank - b.harrisPPRRank )
      TE = TE.filter( p => !!p.harrisPPRRank).sort((a,b) => a.harrisPPRRank - b.harrisPPRRank )

      const availPlayers = [ ...QB, ...RB, ...WR, ...TE ]
      console.log('harrisRanks', availPlayers)
      setAvailPlayers(availPlayers)
      setPosRanks({ QB, RB, WR, TE })
    }
  }, [])

  useEffect(() => {
    setRounds([newRound()])
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

  console.log('render', isEvenRound, roundIdx, currPick, currRoundPick)

  return (
    <div className="flex flex-col items-center justify-center min-h-screen py-2">
      <Head>
        <title>Draft Dashboard</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className="flex flex-col items-center justify-center w-full flex-1 px-20 text-center">

        <div className="flex flex-row">
          { !draftStarted &&
            <input type="button"
              className="border rounded p-1"
              value="Export CSV"
              onClick={ onSetCsvData }
            />
          }
          { csvData && 
            <CSVLink data={csvData}>
              Download
            </CSVLink>
          }
        </div>

        <div className="flex flex-row border rounded">
          <div className="flex flex-col">
          <table class="table-auto">
            <thead>
              <tr className={`flex justify-between ${isEvenRound ? 'flex-row-reverse' : ''}`}>
                { currRoundPicks.map( (pickNum, i) => {
                  let bgColor = ""
                  if ( i+1 === currRoundPick ) {
                    bgColor = "bg-yellow-200"
                  }
                  return(
                    <th className={`p-1 m-1 rounded border font-bold ${bgColor}`}
                      key={pickNum}
                    >
                      { pickNum }
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              <tr className={`flex justify-between ${isEvenRound ? 'flex-row-reverse' : ''}`}>
                { currRound.map( (pick, i) => {
                  let bgColor = ""
                  if ( i+1 === currRoundPick ) {
                    bgColor = "bg-yellow-200"
                  } else if ( !!pick ) {
                    bgColor = "bg-blue-200"
                  } else {
                    bgColor = "bg-gray-100"
                  }
                  return(
                    <td className={`p-1 m-1 rounded border hover:bg-blue-200 cursor-pointer ${bgColor}`}
                      onClick={ onSelectPick( i ) }
                      key={i}
                    >
                      { pick ? pick.name : "N/A" }
                    </td>
                  )
                })}
              </tr>
            </tbody>
          </table>
          </div>

          <div className="flex flex-col relative">
            <div className="relative">
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
                      // nav round up
                      if ( isEvenRound ) {
                        setCurrPick(currPick - (2*(currRoundPick-1)+1))
                      } else {
                        if ( roundIdx > 0 ) setCurrPick(currPick - (2*currRoundPick)+1)
                      }
                    } else if ( suggestionIdx > 0 ) {
                      // suggestion up
                      if ( suggestionIdx > 0 ) setSuggestionIdx(suggestionIdx-1)
                    }

                  // arrow down
                  } else if (e.code === 'ArrowDown') {
                    // round nav
                    if ( suggestions.length === 0 ) {
                      if ( roundIdx === rounds.length-1 ) {
                        // dont allow new round if curr round is empty
                        if ( isRoundEmpty ) {
                          return
                        }
                        setRounds([...rounds, newRound()])
                      }

                      setCurrPick(currPick + (2*(numTeams-currRoundPick)+1))
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
                      setRounds([...rounds, newRound()])
                    }
                    const diff = isEvenRound ? 1 : -1
                    setCurrPick(currPick+diff)

                  // arrow right
                  } else if ( e.code === 'ArrowRight' ) {
                    if ( currRoundPick === numTeams ) {
                      if ( isRoundEmpty ) {
                        return
                      }
                      setRounds([...rounds, newRound()])
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
          </div>
        </div>

        <div className="flex flex-row border rounded">
          { [[posRanks.QB, "QB"], [posRanks.RB, "RB"], [posRanks.WR, "WR"], [posRanks.TE, "TE"]].map( ([posGroup, posName], i) => {
            return(
              <div key={i}
                className="flex flex-col"
              >
                <div> { posName }</div>
                { posGroup.slice(0,10).map( (player,j) => {
                  return(
                    <div key={j}
                      className="p-1 text-center border rounded cursor-pointer hover:bg-blue-200"
                      onClick={ () => onSelectPlayer(player) }
                    >
                      { player.name } - { player.team } ({ player.harrisPPRRank })
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
