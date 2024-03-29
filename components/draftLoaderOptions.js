

import React, { useState } from "react"
import { CSVLink } from "react-csv"
import CSVReader from 'react-csv-reader'

import { GetHarrisRanks, GetFprosRanks } from "../behavior/harris"
import {
  createRanks,
  createPlayerLibrary,
} from "../behavior/draft"
import Dropdown from "./dropdown"
import moment from "moment"

const papaparseOptions = {
  header: true,
  dynamicTyping: true,
  skipEmptyLines: true,
}

const DraftLoaderOptions = ({
  setRanks,
  setPlayerLib,
  setAlertMsg,
  setPosStatsByNumTeamByYear,

  arePlayersLoaded,
  isStd,
  playerLib,
}) => {
  // csv
  const [ranksSource, setRanksSource] = useState(null)
  const [csvData, setCsvData] = useState(null)
  const [isUpload, setIsUpload] = useState(false)
  const [showDlExtTooltip, setShowDlExtTooltip] = useState(false)
  const [showRanksTooltip, setShowRanksTooltip] = useState(false)

  const onLoadHarrisRanks = async () => {
    setAlertMsg("Loading Harris Football Ranks...")
    const { players, posStatsByNumTeamByYear } = await GetHarrisRanks()
    const playerLib = createPlayerLibrary( players )
    const ranks = createRanks( players, isStd )
    setRanksSource('Harris')
    setRanks(ranks)
    setPlayerLib( playerLib )
    setPosStatsByNumTeamByYear( posStatsByNumTeamByYear )
    setAlertMsg(null)
  }

  const onLoadFprosRanks = async () => {
    setAlertMsg("Loading Fantasy Pros Ranks...")
    const { players, posStatsByNumTeamByYear } = await GetFprosRanks()
    const playerLib = createPlayerLibrary( players )
    const ranks = createRanks( players, isStd )
    setRanksSource('FPros')
    setRanks(ranks)
    setPlayerLib( playerLib )
    setPosStatsByNumTeamByYear( posStatsByNumTeamByYear )
    setAlertMsg(null)
  }

  const onSetCsvData = () => {   
    if ( csvData ) {
      setCsvData( null )
      return
    }
    // get all unique keys in data
    const header = [
      'Source',
      'Id',
      'Name',
      'Position',
      'Team',
      'ESPN Overall STD Rank',
      'ESPN Overall PPR Rank',
      'ESPN ADP',
      'Custom STD Rank',
      'Custom PPR Rank',
      'Tier',
    ]
    const ranksData = Object.values( playerLib ).map( player => {
      return([
        ranksSource,
        player.id,
        player.name,
        player.position,
        player.team,
        player.espnOvrStdRank,
        player.espnOvrPprRank,
        player.espnAdp.toFixed(1),
        player.customStdRank,
        player.customPprRank,
        player.tier,
      ])
    })
    const nextCsvData = [header, ...ranksData]
    setCsvData(nextCsvData)
  }

  const onFileLoaded = async (csvPlayers) => {
    const csvPlayersMap = csvPlayers.reduce((dict, player) => {
      dict[player['Id']] = player
      return dict
    }, {})
    console.log('onFileLoaded', csvPlayers)
    let players, playerLib, posStatsByNumTeamByYear
    if ( csvPlayers[0]['Source'] === 'Harris' ) {
      setAlertMsg("Loading Harris Football Ranks...")
      const harrisRanks = await GetHarrisRanks()
      posStatsByNumTeamByYear = harrisRanks.posStatsByNumTeamByYear
      players = harrisRanks.players
      setRanksSource('Harris')
    } else if ( csvPlayers[0]['Source'] === 'Harris' ) {
      setAlertMsg("Loading FPros Ranks...")
      const fprosRanks = await GetFprosRanks()
      posStatsByNumTeamByYear = fprosRanks.posStatsByNumTeamByYear
      players = fprosRanks.players
      setRanksSource('FPros')
    }

    // apply csv ranks
    players.forEach( player => {
      const csvPlayer = csvPlayersMap[player.id]
      if ( csvPlayer ) {
        player.tier = csvPlayer['Tier']
        player.customStdRank = csvPlayer['Custom STD Rank']
        player.customPprRank = csvPlayer['Custom PPR Rank']
      } else {
        player.tier = null
        player.customStdRank = null
        player.customPprRank = null
      }
    })

    playerLib = createPlayerLibrary( players )
    const ranks = createRanks( players, isStd )
    setRanks(ranks)
    setPlayerLib( playerLib )
    setIsUpload(false)
    setPosStatsByNumTeamByYear( posStatsByNumTeamByYear )
    setAlertMsg(null)
  }

  let ranksOptions = [
    { title: "Load Current Harris Ranks", callback: onLoadHarrisRanks },
    { title: "Load Current Avg FantasyPros Ranks", callback: onLoadFprosRanks },
    { title: "Load From CSV", callback: () => setIsUpload(!isUpload) },
  ]
  if ( arePlayersLoaded ) {
    ranksOptions = [...ranksOptions, { title: "Export Ranks", callback: onSetCsvData }]
  }

  return(
    <div className="flex flex-col w-full h-20 border-t relative">
      <div className="flex w-full justify-center items-center">
        <div>
          <Dropdown
            title="Download Extension"
            options={[
              { title: "Download", callback: () => window.open('https://chrome.google.com/webstore/detail/ff-draft-pulse/cjbbljpchmkblfjaglkcdejcloedpnkh?utm_source=ext_sidebar&hl=en-US') },
            ]}
            onMouseEnter={() => setShowDlExtTooltip(true)}
            onMouseLeave={() => setShowDlExtTooltip(false)}
          />
          { showDlExtTooltip &&
            <div className="relative">
              <div className="absolute mr-20 -my-20 w-96 bg-yellow-300 text-black text-left text-xs font-semibold tracking-wide rounded shadow py-1.5 px-4 bottom-full z-10">
                <ul className="list-disc pl-6">
                  <li>Extension to listen to your draft platform</li>
                  <li>Adds picks to this dashboard in realtime</li>
                  <li>Just start draft (NFL.com / ESPN) and wait for alert to accept draft events</li>
                  <li>Keep draft platform at least partially visible so tab does not go to sleep</li>
                </ul>
              </div>
            </div>
          }
        </div>
        
        <div>
          <Dropdown
            title="Load / Export Ranks"
            options={ranksOptions}
            onMouseEnter={() => setShowRanksTooltip(true)}
            onMouseLeave={() => setShowRanksTooltip(false)}
          />
          { showRanksTooltip &&
            <div className="relative">
              <div className="absolute mr-20 -my-12 w-96 bg-yellow-300 text-black text-left text-xs font-semibold tracking-wide rounded shadow py-1.5 px-4 bottom-full z-10">
                <ul className="list-disc pl-6">
                  <li>Import player rankings from FFPros / Harris Football</li>
                  <li>Export ranks to csv to edit</li>
                  <li>Edit custom ranks & tiers (1, 2, 3, etc) to easily distinguish tiers of players in a position group</li>
                </ul>
              </div>
            </div>
          }
        </div>

        <Dropdown
          title="Find Mock Draft"
          options={[
            { title: "ESPN Mock Draft", callback: () => window.open(`https://fantasy.espn.com/football/mockdraftlobby?addata=right_rail_mock_ffl2023`) },
            { title: "NFL.com Mock Draft", callback: () => window.open('https://fantasy.nfl.com/draftcenter/mockdrafts') },
          ]}
        />
      </div>

      <div className="flex flex-col w-64 fixed top-4">
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
            filename={`FF${moment().format('YYYY')}_RANKS.csv`}
          >
            Download
          </CSVLink>
        }
      </div>
    </div>
  )
}

export default DraftLoaderOptions