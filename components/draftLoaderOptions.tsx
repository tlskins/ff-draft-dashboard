import React, { useCallback, useEffect } from "react"
import { getPlayerData } from "../behavior/playerData"

import Dropdown from "./dropdown"
import { BoardSettings, Player, RankingSummary } from "types"


interface DraftLoaderOptionsProps {
  boardSettings: BoardSettings;
  createPlayerLibrary: (players: Player[]) => void;
  onCreatePlayerRanks: (players: Player[], boardSettings: BoardSettings) => void;
  setRankingSummaries: (summaries: RankingSummary[]) => void;
}

const DraftLoaderOptions: React.FC<DraftLoaderOptionsProps> = ({
  boardSettings,

  onCreatePlayerRanks,
  createPlayerLibrary,
  setRankingSummaries,
}) => {

  const onLoadPlayers = useCallback(() => {
    console.log('onLoadPlayers', boardSettings?.ranker)
    const playerData = getPlayerData()
    if (playerData) {
      const { players, rankingsSummaries } = playerData
      onCreatePlayerRanks(players, boardSettings)
      createPlayerLibrary(players)
      setRankingSummaries(rankingsSummaries)
    }
  }, [onCreatePlayerRanks, createPlayerLibrary, setRankingSummaries, boardSettings])

  useEffect(() => {
    onLoadPlayers()
  }, [])

  return(
    <div className="flex flex-col w-full h-20 border-t relative">
      <div className="flex w-full justify-center items-center">
        <div>
          <Dropdown
            title="Download Extension"
            options={[
              { title: "Download", callback: () => window.open('https://chrome.google.com/webstore/detail/ff-draft-pulse/cjbbljpchmkblfjaglkcdejcloedpnkh?utm_source=ext_sidebar&hl=en-US') },
            ]}
          />
        </div>

        <Dropdown
          title="Find Mock Draft"
          options={[
            { title: "ESPN Mock Draft", callback: () => window.open(`https://fantasy.espn.com/football/mockdraftlobby?addata=right_rail_mock_ffl2023`) },
            { title: "NFL.com Mock Draft", callback: () => window.open('https://fantasy.nfl.com/draftcenter/mockdrafts') },
          ]}
        />
      </div>
    </div>
  )
}

export default DraftLoaderOptions