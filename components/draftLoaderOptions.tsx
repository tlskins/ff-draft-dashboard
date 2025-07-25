import React, { useState } from "react"
import { CSVLink } from "react-csv"
import CSVReader from 'react-csv-reader'

import { GetHarrisRanks, GetFprosRanks } from "../behavior/harris"
import {
  createRanks,
  createPlayerLibrary,
  Ranks,
  PlayerLibrary,
} from "../behavior/draft"
import Dropdown from "./dropdown"
import moment from "moment"
import { Player, PosStatsByNumTeamByYear } from "types"

const papaparseOptions = {
  header: true,
  dynamicTyping: true,
  skipEmptyLines: true,
}

interface DraftLoaderOptionsProps {
  setRanks: (ranks: Ranks) => void;
  setPlayerLib: (playerLib: PlayerLibrary) => void;
  setAlertMsg: (msg: string | null) => void;
  setPosStatsByNumTeamByYear: (posStats: PosStatsByNumTeamByYear) => void;
  arePlayersLoaded: boolean;
  isStd: boolean;
  playerLib: PlayerLibrary;
}

const DraftLoaderOptions: React.FC<DraftLoaderOptionsProps> = ({
  setRanks,
  setPlayerLib,
  setAlertMsg,
  setPosStatsByNumTeamByYear,

  arePlayersLoaded,
  isStd,
  playerLib,
}) => {
  // csv
  const [ranksSource, setRanksSource] = useState<string | null>(null)
  const [csvData, setCsvData] = useState<any[][] | null>(null)
  const [isUpload, setIsUpload] = useState(false)
  const [showDlExtTooltip, setShowDlExtTooltip] = useState(false)
  const [showRanksTooltip, setShowRanksTooltip] = useState(false)

  const onLoadHarrisRanks = async () => {
    setAlertMsg("Loading Harris Football Ranks...")
    const harrisData = await GetHarrisRanks()
    if (harrisData) {
      const { players, posStatsByNumTeamByYear } = harrisData
      const playerLib = createPlayerLibrary(players)
      const ranks = createRanks(players, isStd)
      setRanksSource('Harris')
      setRanks(ranks)
      setPlayerLib(playerLib)
      setPosStatsByNumTeamByYear(posStatsByNumTeamByYear)
      setAlertMsg(null)
    }
  }

  const onLoadFprosRanks = async () => {
    setAlertMsg("Loading Fantasy Pros Ranks...")
    const fprosData = await GetFprosRanks()
    if (fprosData) {
      const { players, posStatsByNumTeamByYear } = fprosData
      const playerLib = createPlayerLibrary(players)
      const ranks = createRanks(players, isStd)
      setRanksSource('FPros')
      setRanks(ranks)
      setPlayerLib(playerLib)
      setPosStatsByNumTeamByYear(posStatsByNumTeamByYear)
      setAlertMsg(null)
    }
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
    const ranksData = Object.values(playerLib).map((player: Player) => {
      return [
        ranksSource,
        player.id,
        player.name,
        player.position,
        player.team,
        player.espnOvrStdRank,
        player.espnOvrPprRank,
        (player.espnAdp || 0).toFixed(1),
        player.customStdRank,
        player.customPprRank,
        player.tier,
      ]
    })
    const nextCsvData = [header, ...ranksData]
    setCsvData(nextCsvData)
  }

  const onFileLoaded = async (csvPlayers: any[]) => {
    const csvPlayersMap = csvPlayers.reduce((dict, player) => {
      dict[player['Id']] = player
      return dict
    }, {} as { [id: string]: any })

    let players: Player[] = [], 
      playerLib: PlayerLibrary, 
      posStatsByNumTeamByYear: PosStatsByNumTeamByYear | undefined
    if (csvPlayers[0]['Source'] === 'Harris') {
      setAlertMsg("Loading Harris Football Ranks...")
      const harrisRanks = await GetHarrisRanks()
      if (harrisRanks) {
        posStatsByNumTeamByYear = harrisRanks.posStatsByNumTeamByYear
        players = harrisRanks.players
        setRanksSource('Harris')
      }
    } else if (csvPlayers[0]['Source'] === 'FPros') {
      setAlertMsg("Loading FPros Ranks...")
      const fprosRanks = await GetFprosRanks()
      if (fprosRanks) {
        posStatsByNumTeamByYear = fprosRanks.posStatsByNumTeamByYear
        players = fprosRanks.players
        setRanksSource('FPros')
      }
    }

    // apply csv ranks
    players.forEach((player: Player) => {
      const csvPlayer = csvPlayersMap[player.id]
      if (csvPlayer) {
        player.tier = csvPlayer['Tier']
        player.customStdRank = csvPlayer['Custom STD Rank']
        player.customPprRank = csvPlayer['Custom PPR Rank']
      } else {
        player.tier = ''
        player.customStdRank = undefined
        player.customPprRank = undefined
      }
    })

    playerLib = createPlayerLibrary(players)
    const ranks = createRanks(players, isStd)
    setRanks(ranks)
    setPlayerLib(playerLib)
    setIsUpload(false)
    if (posStatsByNumTeamByYear) {
      setPosStatsByNumTeamByYear(posStatsByNumTeamByYear)
    }
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