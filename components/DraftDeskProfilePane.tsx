import React from "react"

import type {
  BoardSettings,
  FantasySettings,
  Player,
  RankingSummary,
} from "../types"
import type { PlayerStatusCacheSnapshot } from "../behavior/api/playerStatusCache"
import HistoricalComparison from "./HistoricalComparison"
import HistoricalStats from "./HistoricalStats"
import PlayerRankingTable from "./PlayerRankingTable"
import PlayerStatusPanel from "./PlayerStatusPanel"
import RankingSummaryDisplay from "./RankingSummary"
import styles from "./DraftDesk.module.css"
import DeskPaneHeader from "./draft-desk/DeskPaneHeader"

interface DraftDeskProfilePaneProps {
  player: Player | null
  players: Player[]
  settings: FantasySettings
  boardSettings: BoardSettings
  rankingSummaries: RankingSummary[]
  playerStatus: PlayerStatusCacheSnapshot
}

const DraftDeskProfilePane = ({
  player,
  players,
  settings,
  boardSettings,
  rankingSummaries,
  playerStatus,
}: DraftDeskProfilePaneProps) => (
  <section aria-label="Player profile and history" className={`${styles.pane} h-full overflow-y-auto text-left`}>
    <DeskPaneHeader
      className="sticky top-0 z-10"
      kicker="Player profile"
      meta={player ? `${player.team} · ${player.position}` : undefined}
      title={player?.fullName || "Focus a player on the board"}
    />
    <div className="space-y-1 p-2">
      <RankingSummaryDisplay
        activePlayer={player}
        rankingSummaries={rankingSummaries}
        settings={settings}
        ranker={boardSettings.ranker}
      />
      <PlayerRankingTable
        boardSettings={boardSettings}
        player={player}
        settings={settings}
      />
      <PlayerStatusPanel
        playerId={player?.id || null}
        playerName={player?.fullName}
        status={player ? playerStatus[player.id] : undefined}
      />
      <HistoricalStats player={player} settings={settings} />
      <HistoricalComparison player={player} players={players} settings={settings} />
    </div>
  </section>
)

export default DraftDeskProfilePane
