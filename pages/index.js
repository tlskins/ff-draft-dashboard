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
  const [filteredAvailPlayers, setFilteredAvailPlayers] = useState([])
  const [numTeams, _] = useState(12)
  const [currPick, setCurrPick] = useState(1)
  const [search, setSearch] = useState("")
  const [currRoundIdx, setCurrRoundIdx] = useState(null)
  const [rounds, setRounds] = useState([])
  const [inputRef, setInputFocus] = useFocus()

  const currRound = currRoundIdx !== null && rounds[currRoundIdx]
  let currRoundPicks = currRound && currRound.map( (_, idx) => idx + 1 )
  if ( currRoundIdx % 2 == 1 ) {
    currRoundPicks = currRoundPicks.reverse()
  }

  const onSearch = e => {
    const text = e.target.value
    setSearch(text)
    if ( text.length > 1 ) {
      const regex = new RegExp(text, 'gi');
      const filtered = availPlayers.filter( player => regex.test(player.matchName) )
      setFilteredAvailPlayers(filtered)
    } else {
      setFilteredAvailPlayers([])
    }
  }

  const onSelectPick = i => () => {
    setCurrPick(currRoundPicks[i] + currRoundIdx * numTeams)
    setInputFocus()
  }

  useEffect(async () => {
    const resp = await GetHarrisRanks()
    if ( resp ) {
      const { QB, RB, WR, TE } = resp
      const availPlayers = [ ...QB, ...RB, ...WR, ...TE ]
      console.log('harrisRanks', availPlayers)
      setAvailPlayers(availPlayers)
    }
  }, [])

  useEffect(() => {
    setRounds([new Array(numTeams).fill(null)])
    setCurrRoundIdx(0)
  }, [numTeams])

  console.log('currRound', currRound)
  const roundsGridClass = `grid-cols-${numTeams}`

  return (
    <div className="flex flex-col items-center justify-center min-h-screen py-2">
      <Head>
        <title>Draft Dashboard</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className="flex flex-col items-center justify-center w-full flex-1 px-20 text-center">

        <div className="flex flex-col border rounded">
          <div className="flex flex-row">
            <div className="flex flex-col">
              <div className={`grid ${roundsGridClass} gap-1`}>
                { currRoundPicks && currRoundPicks.map( pickNum => (
                  <div className="p-1 m-1 rounded border font-bold"
                    key={pickNum}
                  >
                    { pickNum }
                  </div>
                ))}
              </div>
              <div className={`grid ${roundsGridClass} gap-1`}>
                { currRound && currRound.map( (pick, i) => (
                  <div className="p-1 m-1 rounded border hover:bg-blue-200 cursor-pointer"
                    onClick={ onSelectPick( i ) }
                    key={i}
                  >
                    { pick ? pick.name : "N/A" }
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col relative">
              <div className="relative">
                <div>Pick # { currPick }</div>
                <input type="text"
                  className="border-2 rounded m-1"
                  value={search}
                  onChange={onSearch}
                  ref={inputRef}
                />
                { filteredAvailPlayers.length > 0 &&
                  <div className="absolute w-100 z-10 border overflow-y-scroll h-48 bg-white border-gray-400 shadow-lg">
                    { filteredAvailPlayers.map( (player,i) => (
                      <p className="cursor-pointer p-0.5 hover:bg-gray-200 text-sm"
                        key={i}
                      >
                        { player.name }
                      </p>
                    ))}
                  </div>
                }
              </div>
            </div>
          </div>
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
