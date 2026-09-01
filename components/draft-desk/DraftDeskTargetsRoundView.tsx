import React, {useMemo, useState} from "react"

import {
  getPlayerMetrics,
  getRoundAndPickShortText,
  getRoundNumForPickNum,
  type PlayerRanks,
} from "../../behavior/draft"
import type {BoardSettings, FantasySettings, Player, PlayerTarget} from "../../types"
import DraftDeskPlayerCard from "../shared/DraftDeskPlayerCard"
import styles from "../DraftDesk.module.css"

type PositionFilter = "All" | "QB" | "RB" | "WR" | "TE"

interface DraftDeskTargetsRoundViewProps {
  playerRanks: PlayerRanks
  playerTargets: PlayerTarget[]
  playerLib: {[key: string]: Player}
  fantasySettings: FantasySettings
  boardSettings: BoardSettings
  viewPlayerId: string | null
  setViewPlayerId: (id: string) => void
  removePlayerTarget: (playerId: string) => void
  currPick: number
  queuedPlayerIds?: readonly string[]
  onQueuePlayer?: (playerId: string) => void
}

interface TargetRange {
  player: Player
  target: PlayerTarget
  rankPick: number
  rankRound: number
  adpPick: number
  adpRound: number
  startRound: number
  endRound: number
}

const ROUNDS_PER_PAGE = 4

const DraftDeskTargetsRoundView = ({
  playerRanks,
  playerTargets,
  playerLib,
  fantasySettings,
  boardSettings,
  viewPlayerId,
  setViewPlayerId,
  removePlayerTarget,
  currPick,
  queuedPlayerIds,
  onQueuePlayer,
}: DraftDeskTargetsRoundViewProps) => {
  const [positionFilter, setPositionFilter] = useState<PositionFilter>("All")
  const [currentPage, setCurrentPage] = useState(0)
  const availableIds = useMemo(() => new Set(
    playerRanks.availPlayersByOverallRank.map(player => player.id),
  ), [playerRanks.availPlayersByOverallRank])
  const targetRanges = useMemo(() => playerTargets.flatMap(target => {
    const player = playerLib[target.playerId]
    if (!player || !availableIds.has(player.id)) return []
    const metrics = getPlayerMetrics(player, fantasySettings, boardSettings)
    if (
      !Number.isFinite(metrics.overallRank)
      || !Number.isFinite(metrics.adp)
      || metrics.overallRank! <= 0
      || metrics.adp! <= 0
    ) return []
    const rankPick = metrics.overallRank!
    const adpPick = metrics.adp!
    const rankRound = getRoundNumForPickNum(rankPick, fantasySettings.numTeams)
    const adpRound = getRoundNumForPickNum(adpPick, fantasySettings.numTeams)
    return [{
      player,
      target,
      rankPick,
      rankRound,
      adpPick,
      adpRound,
      startRound: Math.min(rankRound, adpRound),
      endRound: Math.max(rankRound, adpRound),
    } satisfies TargetRange]
  }).sort((left, right) => left.adpPick - right.adpPick
    || left.rankPick - right.rankPick
    || left.player.fullName.localeCompare(right.player.fullName)
    || left.player.id.localeCompare(right.player.id)), [
    availableIds,
    boardSettings,
    fantasySettings,
    playerLib,
    playerTargets,
  ])
  const filteredRanges = positionFilter === "All"
    ? targetRanges
    : targetRanges.filter(range => range.player.position === positionFilter)
  const maxRound = Math.max(14, ...targetRanges.map(range => range.endRound))
  const totalPages = Math.max(1, maxRound - ROUNDS_PER_PAGE + 1)
  const boundedPage = Math.min(currentPage, totalPages - 1)
  const startRound = boundedPage + 1
  const visibleRounds = Array.from({length: ROUNDS_PER_PAGE}, (_, index) => startRound + index)
  const endRound = visibleRounds.at(-1)!
  const visibleRanges = filteredRanges.filter(range => (
    range.startRound <= endRound && range.endRound >= startRound
  ))

  return (
    <section aria-label="Target ranking windows" className={styles.targetsRoundView} data-testid="draft-desk-targets-round-view">
      <div className={styles.adpToolbar}>
        <div>
          <strong>Targets by rank and ADP round</strong>
          <select aria-label="Target position filter" className={styles.deskSelect} onChange={event => setPositionFilter(event.target.value as PositionFilter)} value={positionFilter}>
            <option value="All">All positions</option>
            <option value="QB">QB only</option><option value="RB">RB only</option>
            <option value="WR">WR only</option><option value="TE">TE only</option>
          </select>
        </div>
        <div>
          <button aria-label="Previous target rounds" disabled={boundedPage === 0} onClick={() => setCurrentPage(Math.max(0, boundedPage - 1))} type="button">←</button>
          <span>Rounds {startRound}–{endRound}</span>
          <button aria-label="Next target rounds" disabled={boundedPage === totalPages - 1} onClick={() => setCurrentPage(Math.min(totalPages - 1, boundedPage + 1))} type="button">→</button>
        </div>
      </div>

      <div className={styles.targetsRoundHeader}>
        {visibleRounds.map(round => <div key={round}><span>ROUND {round}</span><small>Rank → ADP window</small></div>)}
      </div>
      {targetRanges.length === 0 ? (
        <p className={styles.targetChartEmpty} role="status">No available targets have both configured rank and ADP evidence.</p>
      ) : visibleRanges.length === 0 ? (
        <p className={styles.targetChartEmpty} role="status">No target windows overlap rounds {startRound}–{endRound}.</p>
      ) : (
        <div className={styles.targetsRoundRows}>
          {visibleRanges.map(range => {
            const visibleStart = Math.max(range.startRound, startRound)
            const visibleEnd = Math.min(range.endRound, endRound)
            return (
              <div className={styles.targetsRoundRow} key={range.player.id}>
                <DraftDeskPlayerCard
                  actions={<button onClick={() => removePlayerTarget(range.player.id)} type="button">Remove</button>}
                  boardSettings={boardSettings}
                  className={styles.targetsRoundPlayerCard}
                  compact
                  currentPick={currPick}
                  evidence={<span>Rank #{range.rankPick} · ADP {getRoundAndPickShortText(range.adpPick, fantasySettings.numTeams)}</span>}
                  fantasySettings={fantasySettings}
                  focused={viewPlayerId === range.player.id}
                  leadingRank={range.rankPick}
                  onFocusPlayer={setViewPlayerId}
                  onQueuePlayer={onQueuePlayer}
                  queued={queuedPlayerIds?.includes(range.player.id)}
                  player={range.player}
                  rankContext={`Rank R${range.rankRound} → ADP R${range.adpRound}`}
                  rootProps={{
                    "data-range-end": String(range.endRound),
                    "data-range-start": String(range.startRound),
                    style: {
                      gridColumn: `${visibleStart - startRound + 1} / ${visibleEnd - startRound + 2}`,
                    },
                  } as React.HTMLAttributes<HTMLDivElement>}
                  target={range.target}
                />
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

export default DraftDeskTargetsRoundView
