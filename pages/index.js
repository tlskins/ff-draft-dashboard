import Head from 'next/head'
import React, { useEffect, useState, useRef } from "react"

import { GetHarrisRanks } from "../behavior/harris"


const useFocus = () => {
  const htmlElRef = useRef(null)
  const setFocus = () => {htmlElRef.current &&  htmlElRef.current.focus()}

  return [ htmlElRef, setFocus ] 
}

export default function Home() {
  const [availPlayers, setAvailPlayers] = useState([])
  const [numTeams, _] = useState(12)

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
    QB: [],
    RB: [],
    WR: [],
    TE: [],
  })

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
    if ( suggestionIdx < 0 || suggestionIdx > suggestions.length-1 ) {
      return
    }
    
    currRound[currRoundPick-1] = player

    setRounds(
      [
        ...rounds.slice(0, roundIdx),
        currRound,
        ...rounds.slice(roundIdx+1, rounds.length)
      ]
    )
    setAvailPlayers(availPlayers.filter( p => p.name !== player.name ))
    setSuggestionIdx(0)
    setSuggestions([])
    setSearch("")
    const posRank = posRanks[player.position]
    setPosRanks({ ...posRanks, [player.position]: posRank.filter( p => p.name !== player.name )})
    setCurrPick(currPick+1)
    if ( currRoundPick === 12 ) {
      setRounds([...rounds, newRound()])
    }
  }

  useEffect(async () => {
    const resp = await GetHarrisRanks()
    if ( resp ) {
      let { QB, RB, WR, TE } = resp
      QB = QB.sort((a,b) => a.harrisPPRRank - b.harrisPPRRank )
      RB = RB.sort((a,b) => a.harrisPPRRank - b.harrisPPRRank )
      WR = WR.sort((a,b) => a.harrisPPRRank - b.harrisPPRRank )
      TE = TE.sort((a,b) => a.harrisPPRRank - b.harrisPPRRank )

      const availPlayers = [ ...QB, ...RB, ...WR, ...TE ]
      console.log('harrisRanks', availPlayers)
      setAvailPlayers(availPlayers)
      setPosRanks({ QB, RB, WR, TE })
    }
  }, [])

  useEffect(() => {
    setRounds([newRound()])
  }, [numTeams])

  console.log('render', isEvenRound, roundIdx, currPick, currRoundPick)

  return (
    <div className="flex flex-col items-center justify-center min-h-screen py-2">
      <Head>
        <title>Draft Dashboard</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className="flex flex-col items-center justify-center w-full flex-1 px-20 text-center">

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
                      className="p-1 text-center border rounded"
                    >
                      { player.name } - { player.team } ({ player.harrisPPRRank })
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>

        <h1 className="text-6xl font-bold">
          Welcome to{' '}
          <a className="text-blue-600" href="https://nextjs.org">
            Next.js!
          </a>
        </h1>

        <p className="mt-3 text-2xl">
          Get started by editing{' '}
          <code className="p-3 font-mono text-lg bg-gray-100 rounded-md">
            pages/index.js
          </code>
        </p>

        <div className="flex flex-wrap items-center justify-around max-w-4xl mt-6 sm:w-full">
          <a
            href="https://nextjs.org/docs"
            className="p-6 mt-6 text-left border w-96 rounded-xl hover:text-blue-600 focus:text-blue-600"
          >
            <h3 className="text-2xl font-bold">Documentation &rarr;</h3>
            <p className="mt-4 text-xl">
              Find in-depth information about Next.js features and API.
            </p>
          </a>

          <a
            href="https://nextjs.org/learn"
            className="p-6 mt-6 text-left border w-96 rounded-xl hover:text-blue-600 focus:text-blue-600"
          >
            <h3 className="text-2xl font-bold">Learn &rarr;</h3>
            <p className="mt-4 text-xl">
              Learn about Next.js in an interactive course with quizzes!
            </p>
          </a>

          <a
            href="https://github.com/vercel/next.js/tree/master/examples"
            className="p-6 mt-6 text-left border w-96 rounded-xl hover:text-blue-600 focus:text-blue-600"
          >
            <h3 className="text-2xl font-bold">Examples &rarr;</h3>
            <p className="mt-4 text-xl">
              Discover and deploy boilerplate example Next.js projects.
            </p>
          </a>

          <a
            href="https://vercel.com/import?filter=next.js&utm_source=create-next-app&utm_medium=default-template&utm_campaign=create-next-app"
            className="p-6 mt-6 text-left border w-96 rounded-xl hover:text-blue-600 focus:text-blue-600"
          >
            <h3 className="text-2xl font-bold">Deploy &rarr;</h3>
            <p className="mt-4 text-xl">
              Instantly deploy your Next.js site to a public URL with Vercel.
            </p>
          </a>
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
