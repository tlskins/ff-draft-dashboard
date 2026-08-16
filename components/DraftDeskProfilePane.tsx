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
    <header className={`${styles.surface} sticky top-0 z-10 border-x-0 border-t-0 px-3 py-2`}>
      <p className="text-xs font-semibold uppercase tracking-wider text-sky-300">Player profile</p>
      <h2 className="text-sm font-bold">{player?.fullName || "Focus a player on the board"}</h2>
    </header>
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
