

import React, { useState } from "react"
import { CSVLink } from "react-csv"
import CSVReader from 'react-csv-reader'

import { GetHarrisRanks, GetFprosRanks } from "../behavior/harris"
import {
  createRanks,
  createPlayerLibrary,
} from "../behavior/draft"
import Dropdown from "./dropdown"

const papaparseOptions = {
  header: true,
  dynamicTyping: true,
  skipEmptyLines: true,
}

const DraftLoaderOptions = ({
  setRanks,
  setPlayerLib,
  setAlertMsg,
  setInputFocus,
  setPosStatsByNumTeamByYear,

  availPlayers,
  draftStarted,
  arePlayersLoaded,
  isStd,
}) => {
  // csv
  const [csvData, setCsvData] = useState(null)
  const [isUpload, setIsUpload] = useState(false)
  const [showHowToExport, setShowHowToExport] = useState(false)

  const onLoadHarrisRanks = async () => {
    setAlertMsg("Loading...")
    const { players, posStatsByNumTeamByYear } = await GetHarrisRanks()
    const playerLib = createPlayerLibrary( players )
    const ranks = createRanks( players, isStd )
    setRanks(ranks)
    setPlayerLib( playerLib )
    setInputFocus()
    setPosStatsByNumTeamByYear( posStatsByNumTeamByYear )
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
      setInputFocus()
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
      setInputFocus()
    }
    setAlertMsg(null)
  }

  const onSetCsvData = () => {    
    // get all unique keys in data
    const allKeys = {}
    availPlayers.forEach( p => Object.keys(p).forEach(key => {
      allKeys[key] = 1
    }))
    const keys = Object.keys(allKeys)
    const ranksData = availPlayers.map( player => keys.map( key => player[key]))
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
    setInputFocus()
  }

  const ranksOptions = [
    { title: "Load Current Harris Ranks", callback: onLoadHarrisRanks },
    { title: "Load Current FPros Ranks", callback: onLoadFprosRanks },
    { title: "Load From CSV", callback: () => setIsUpload(!isUpload) },
  ]
  if ( arePlayersLoaded && !csvData ) {
    ranksOptions.push({ title: "Export Ranks", callback: onSetCsvData })
  }
  if (!draftStarted && arePlayersLoaded) {
    ranksOptions.push({ title: "Sync Current ESPN ADP", callback: onUpdateEspnRanks })
  }

  return(
    <div className="flex flex-col items-center justify-center w-full h-42 border-t">
      <div className="flex flex-row w-96">
        <Dropdown
          title="Load / Export Ranks"
          options={ranksOptions}
        />

        <Dropdown
          title="Find Mock Draft"
          options={[
            { title: "ESPN Mock Draft", callback: () => window.open(`https://fantasy.espn.com/football/mockdraftlobby?addata=right_rail_mock_ffl2023`) }
          ]}
        />
      </div>

      { isUpload &&
        <CSVReader
          cssClass="tracking-wide font-semibold border rounded px-4 py-2 m-2 cursor-pointer shadow-md uppercase text-sm flex flex-col"
          label="Upload Ranks"
          onFileLoaded={ onFileLoaded }
          parserOptions={papaparseOptions}
        />
      }

      { csvData && 
        <CSVLink data={csvData}
          onClick={ () => setCsvData(null)}
          className="tracking-wide font-semibold border rounded px-4 py-2 m-2 cursor-pointer shadow-md uppercase bg-green-300"
        >
          Download
        </CSVLink>
      }

      {/* <div className="flex flex-col">
        { (arePlayersLoaded && !csvData) &&
          <div>
            <input type="button"
              className="tracking-wide font-semibold border rounded px-4 py-2 m-2 cursor-pointer shadow-md uppercase bg-green-200"
              value="Export & Edit Ranks CSV"
              onMouseEnter={ () => setShowHowToExport(true) }
              onMouseLeave={ () => setShowHowToExport(false) }
              onClick={ onSetCsvData }
            />
            { showHowToExport &&
              <div className="relative">
                <div className="absolute mr-20 -my-20 w-96 bg-yellow-300 text-black text-left text-xs font-semibold tracking-wide rounded shadow py-1.5 px-4 bottom-full z-10">
                  <ul className="list-disc pl-6">
                    <li>Export ranks to CSV</li>
                    <li>Edit the custom PPR / STD ranks for each position</li>
                    <li>Optionally add a column "tier" with number 1-10</li>
                    <li>Upload new CSV</li>
                  </ul>
                </div>
              </div>
            }
          </div>
        }
        { csvData && 
          <CSVLink data={csvData}
            onClick={ () => setCsvData(null)}
            className="tracking-wide font-semibold border rounded px-4 py-2 m-2 cursor-pointer shadow-md uppercase bg-green-300"
          >
            Download
          </CSVLink>
        }
      </div>

      <div className="flex flex-col">
        <input type="button"
          className="tracking-wide font-semibold border rounded px-4 py-2 m-2 cursor-pointer shadow-md uppercase bg-green-300"
          value="Find ESPN Mock Draft"
          onClick={ () => window.open(`https://fantasy.espn.com/football/mockdraftlobby?addata=right_rail_mock_ffl2023`) }
        />

        { (!draftStarted && arePlayersLoaded) &&
          <input type="button"
            className="tracking-wide font-semibold border rounded px-4 py-2 m-2 cursor-pointer shadow-md uppercase bg-indigo-300"
            value="Sync Current ESPN ADP"
            onClick={ onUpdateEspnRanks }
          />
        }
      </div> */}
    </div>
  )
}

export default DraftLoaderOptions