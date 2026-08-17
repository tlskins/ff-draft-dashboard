import React, {useCallback, useState} from "react"

import {getPlayerMetrics, getRoundAndPickShortText, PlayerRanks} from "../../behavior/draft"
import {PositionFilter, useADPView} from "../../behavior/hooks/useADPView"
import {useADPRoundView} from "../../behavior/hooks/useADPRoundView"
import type {BoardSettings, FantasySettings, Player, PlayerTarget} from "../../types"
import DraftDeskPlayerCard from "../shared/DraftDeskPlayerCard"
import styles from "../DraftDesk.module.css"

interface DraftDeskAdpRoundViewProps {
  playerRanks: PlayerRanks
  fantasySettings: FantasySettings
  boardSettings: BoardSettings
  viewPlayerId: string | null
  myPicks: number[]
  setViewPlayerId: (id: string) => void
  playerTargets: PlayerTarget[]
  playerLib: {[key: string]: Player}
  addPlayerTarget: (player: Player, targetAsEarlyAsRound: number) => void
  replacePlayerTargets: (targets: PlayerTarget[]) => void
  removePlayerTarget: (playerId: string) => void
  removePlayerTargets: (playerIds: string[]) => void
  onSwitchToTargetsView: () => void
}

const DraftDeskAdpRoundView = ({
  playerRanks,
  fantasySettings,
  boardSettings,
  viewPlayerId,
  myPicks,
  setViewPlayerId,
  playerTargets,
  playerLib,
  addPlayerTarget,
  replacePlayerTargets,
  removePlayerTarget,
  removePlayerTargets,
  onSwitchToTargetsView,
}: DraftDeskAdpRoundViewProps) => {
  const [positionFilter, setPositionFilter] = useState<PositionFilter>("All")
  const {
    currentPage,
    totalPages,
    startRound,
    roundsToShow,
    organizedTargets,
    handlePrevPage,
    handleNextPage,
    handleSaveFavorites,
    handleLoadFavorites,
    handleClearFavorites,
  } = useADPView({
    playerRanks,
    fantasySettings,
    boardSettings,
    myPicks,
    playerTargets,
    playerLib,
    replacePlayerTargets,
    removePlayerTargets,
    positionFilter,
  })
  const visibleRounds = roundsToShow.slice(0, 3)
  const {playersByADPRound, getRoundCount} = useADPRoundView({
    playerRanks,
    fantasySettings,
    boardSettings,
    positionFilter,
    roundsToShow: visibleRounds,
  })
  const targetPlayers = organizedTargets.filter(
    (item): item is Extract<typeof item, {type: "player"}> => item.type === "player",
  )
  const moveTarget = useCallback((playerId: string, round: number) => {
    replacePlayerTargets(playerTargets.map(target => target.playerId === playerId
      ? {...target, targetAsEarlyAsRound: round}
      : target))
  }, [playerTargets, replacePlayerTargets])

  return (
    <div className={styles.adpDesk} data-testid="draft-desk-adp-round-view">
      <div className={styles.adpToolbar}>
        <div>
          <strong>Best by ADP round</strong>
          <select aria-label="ADP position filter" className={styles.deskSelect} onChange={event => setPositionFilter(event.target.value as PositionFilter)} value={positionFilter}>
            <option value="All">All positions</option>
            <option value="QB">QB only</option><option value="RB">RB only</option>
            <option value="WR">WR only</option><option value="TE">TE only</option>
          </select>
        </div>
        <div>
          <button aria-label="Previous ADP rounds" disabled={currentPage === 0} onClick={handlePrevPage} type="button">←</button>
          <span>ADP rounds {startRound}–{visibleRounds.at(-1)}</span>
          <button aria-label="Next ADP rounds" disabled={currentPage === totalPages - 1} onClick={handleNextPage} type="button">→</button>
        </div>
      </div>

      <div className={styles.targetWindows}>
        <span>TARGET WINDOWS</span>
        {targetPlayers.slice(0, 2).map(({player, target}) => (
          <button key={player.id} onClick={() => setViewPlayerId(player.id)} type="button">
            {player.fullName} · R{target.targetAsEarlyAsRound}
          </button>
        ))}
      </div>

      <div className={styles.adpGrid}>
        <section className={styles.adpColumn}>
          <header><span>YOUR TARGETS</span><strong>{targetPlayers.length} players</strong><small>Manage · save · load</small></header>
          <div className={styles.targetActions}>
            <button onClick={handleSaveFavorites} type="button">Save</button>
            <button onClick={handleLoadFavorites} type="button">Load</button>
            <button onClick={handleClearFavorites} type="button">Clear</button>
            <button onClick={onSwitchToTargetsView} type="button">View</button>
          </div>
          <div className={styles.adpCards}>
            {targetPlayers.map(({player, target}, index) => (
              <DraftDeskPlayerCard
                actions={<>
                  <select aria-label={`Move ${player.fullName} target round`} onChange={event => moveTarget(player.id, Number(event.target.value))} value={target.targetAsEarlyAsRound}>
                    {Array.from({length: 14}, (_, round) => <option key={round + 1} value={round + 1}>R{round + 1}</option>)}
                  </select>
                  <button onClick={() => removePlayerTarget(player.id)} type="button">Remove</button>
                </>}
                boardSettings={boardSettings}
                compact
                fantasySettings={fantasySettings}
                focused={viewPlayerId === player.id}
                key={player.id}
                leadingRank={index + 1}
                onFocusPlayer={setViewPlayerId}
                player={player}
                rankContext={`Target round ${target.targetAsEarlyAsRound}`}
                target={target}
              />
            ))}
          </div>
        </section>

        {visibleRounds.map(round => (
          <section className={styles.adpColumn} key={round}>
            <header><span>ADP ROUND {round}</span><strong>{getRoundCount(round)} players</strong><small>Sorted by overall rank</small></header>
            <div className={styles.adpCards}>
              {(playersByADPRound[round] || []).map(player => {
                const metrics = getPlayerMetrics(player, fantasySettings, boardSettings)
                const target = playerTargets.find(item => item.playerId === player.id)
                return (
                  <DraftDeskPlayerCard
                    actions={target
                      ? <button onClick={() => removePlayerTarget(player.id)} type="button">Remove</button>
                      : <button onClick={() => addPlayerTarget(player, round)} type="button">Target</button>}
                    boardSettings={boardSettings}
                    compact
                    fantasySettings={fantasySettings}
                    focused={viewPlayerId === player.id}
                    key={player.id}
                    leadingRank={metrics.overallRank || "—"}
                    onFocusPlayer={setViewPlayerId}
                    player={player}
                    rankContext={`Rank ${metrics.overallRank || "—"} · ADP ${metrics.adp ? getRoundAndPickShortText(metrics.adp, fantasySettings.numTeams) : "—"}`}
                    target={target}
                  />
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

export default DraftDeskAdpRoundView
