import React, { useEffect, useMemo, useState } from "react"

import {
  getPlayerMetrics,
  myCurrentRound,
} from "../../behavior/draft"
import { getIconTypes, getDraftBoard } from "../../behavior/DraftBoardUtils"
import { HighlightOption } from "../../behavior/hooks/usePredictions"
import { isTitleCard, type RankingLanePosition, RankingViewProps } from "../../types/DraftBoardTypes"
import { FantasyPosition } from "../../types"
import type { Player, PlayerTarget } from "../../types"
import PlayerSearchModal from "../PlayerSearchModal"
import DraftDeskPlayerCard from "../shared/DraftDeskPlayerCard"
import styles from "../DraftDesk.module.css"
import {
  predictionAvailabilityCompactCue,
  predictionAvailabilityWindowLabel,
} from "../../behavior/presenters"

type PositionPair = "RB_WR" | "QB_TE"

const lanesForPair: Record<PositionPair, RankingLanePosition[]> = {
  RB_WR: [FantasyPosition.RUNNING_BACK, FantasyPosition.WIDE_RECEIVER],
  QB_TE: [FantasyPosition.QUARTERBACK, FantasyPosition.TIGHT_END],
}

const positionLabels: Record<string, string> = {
  QB: "QUARTERBACK",
  RB: "RUNNING BACK",
  WR: "WIDE RECEIVER",
  TE: "TIGHT END",
}

const RankingView = ({
  playerRanks,
  predictedPicks,
  myPickNum,
  fantasySettings,
  boardSettings,
  currPick,
  predNextTiers,
  rankingSummaries,
  onSelectPlayer,
  onPurgePlayer,
  setViewPlayerId,
  rosters,
  playerLib,
  draftStarted,
  sortOption,
  setSortOption,
  highlightOption,
  setHighlightOption,
  viewPlayerId,
  rankings,
  playerTargets,
  addPlayerTarget,
  removePlayerTarget,
  onEditRankings,
  compact = false,
  pinnedPlayerId,
  onPinPlayer,
  onVisiblePositionsChange,
}: RankingViewProps) => {
  const [pair, setPair] = useState<PositionPair>("RB_WR")
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false)
  const [isRosterVisible, setIsRosterVisible] = useState(false)
  const [animatingOutPlayers, setAnimatingOutPlayers] = useState<Set<string>>(new Set())
  const { AnyAiFillCheckCircle, AnyBsLink, AnyTiDelete } = getIconTypes()
  const draftBoard = useMemo(() => getDraftBoard(
    playerRanks,
    predictedPicks,
    myCurrentRound(currPick, myPickNum, fantasySettings.numTeams),
  ), [currPick, fantasySettings.numTeams, myPickNum, playerRanks, predictedPicks])
  const columnsByPosition = useMemo(() => new Map(draftBoard.standardView
    .filter(column => column.columnTitle !== "Purge")
    .map(column => [column.columnTitle, column])), [draftBoard.standardView])
  const myRoster = rosters[myPickNum - 1]
  const isUsingCustomRanks = rankings.copiedRanker && rankings.cachedAt && rankings.editedAt

  useEffect(() => {
    if (!compact) return
    onVisiblePositionsChange?.(lanesForPair[pair])
  }, [compact, onVisiblePositionsChange, pair])

  const favorite = (playerId: string): PlayerTarget | undefined => playerTargets
    .find(target => target.playerId === playerId)

  const selectPlayer = (player: Player) => {
    setAnimatingOutPlayers(current => new Set(current).add(player.id))
    window.setTimeout(() => {
      onSelectPlayer(player)
      setAnimatingOutPlayers(current => {
        const next = new Set(current)
        next.delete(player.id)
        return next
      })
    }, 600)
  }

  const renderPlayer = (player: Player, index: number) => {
    const metrics = getPlayerMetrics(player, fantasySettings, boardSettings)
    const ranking = sortOption === "Sort By ADP"
      ? `${boardSettings.adpRanker} ADP #${metrics.adp?.toFixed(1) || "—"}`
      : metrics.posRank === undefined ? "Unranked" : `${player.position}${metrics.posRank} · #${metrics.overallRank || "—"}`
    const focused = viewPlayerId === player.id
    const animating = animatingOutPlayers.has(player.id)
    const predictionWindow = predictedPicks[player.id]
    return (
      <DraftDeskPlayerCard
        actions={focused && !animating ? <>
          <button aria-label={`Purge ${player.fullName}`} className={`${styles.focusRing} rounded border border-rose-300 px-1 text-rose-700 hover:bg-rose-50`} onClick={() => onPurgePlayer(player)} type="button"><AnyTiDelete size={16} /></button>
          <button aria-label={`Draft ${player.fullName}`} className={`${styles.focusRing} rounded border border-emerald-300 px-1 text-emerald-700 hover:bg-emerald-50`} onClick={() => selectPlayer(player)} type="button"><AnyAiFillCheckCircle size={16} /></button>
          <button aria-label={`Open ${player.fullName} game log`} className={`${styles.focusRing} rounded border border-sky-300 px-1 text-sky-700 hover:bg-sky-50`} onClick={() => window.open(`https://www.fantasypros.com/nfl/games/${player.firstName.toLowerCase()}-${player.lastName.toLowerCase()}.php`)} type="button"><AnyBsLink size={16} /></button>
        </> : undefined}
        className={animating ? "opacity-40" : ""}
        compact={compact}
        fantasySettings={fantasySettings}
        focused={focused}
        key={`${player.id}-${index}`}
        boardSettings={boardSettings}
        onFocusPlayer={id => !animating && setViewPlayerId(id)}
        onPinPlayer={onPinPlayer}
        pinned={pinnedPlayerId === player.id}
        player={player}
        currentPick={currPick}
        leadingRank={metrics.posRank || index + 1}
        rankContext={ranking}
        target={favorite(player.id)}
        urgency={predictionAvailabilityWindowLabel(predictionWindow) || undefined}
        urgencyCue={predictionAvailabilityCompactCue(predictionWindow) || undefined}
      />
    )
  }

  const renderLane = (position: FantasyPosition) => {
    const column = columnsByPosition.get(position)
    const players = (column?.cards || []).filter(card => !isTitleCard(card)) as Player[]
    return (
      <section className={styles.positionLane} data-testid={`ranking-position-lane-${position}`} key={position}>
        <header className={styles.positionLaneHeader}>
          <span>{positionLabels[position] || position}</span>
          <span>{predNextTiers[position] ? `Next tier ${predNextTiers[position]}` : `${players.length} available`}</span>
        </header>
        <div aria-hidden="true" className={styles.positionLaneColumns}>
          <span>RK</span><span>PLAYER / ADP / TIER</span>
        </div>
        <div className={styles.positionLaneCards}>
          {players.slice(0, 50).map(renderPlayer)}
        </div>
      </section>
    )
  }

  const allPositionColumns = draftBoard.standardView
    .filter(column => column.columnTitle !== "Purge")
    .map(column => renderLane(column.columnTitle as FantasyPosition))

  return (
    <div className={`flex min-h-0 flex-1 flex-col ${compact ? "" : "gap-3"}`}>
      <div className={compact ? styles.rankingsToolbar : "flex flex-wrap items-center justify-between gap-1 text-left"}>
        {!compact && <div>
          <p className="text-xs font-bold text-slate-900">{rankings.copiedRanker ? "Custom " : ""}Position rankings</p>
          {isUsingCustomRanks && <p className="text-[10px] text-slate-500">Custom ranking source remains authoritative.</p>}
        </div>}
        {compact && (
          <div aria-label="Position pair" className={styles.positionPairToggle} role="group">
            <button aria-pressed={pair === "RB_WR"} onClick={() => setPair("RB_WR")} type="button">RB + WR</button>
            <button aria-pressed={pair === "QB_TE"} onClick={() => setPair("QB_TE")} type="button">QB + TE</button>
          </div>
        )}
        <div className={compact ? styles.rankingsUtilities : "flex flex-wrap gap-1"}>
          <span>{rankings.copiedRanker ? "Custom rank" : `${boardSettings.ranker} rank`}</span>
          <select aria-label="Ranking sort" className={compact ? styles.deskSelect : "rounded border border-slate-300 bg-white px-1 py-0.5 text-[11px]"} onChange={event => setSortOption(event.target.value as typeof sortOption)} value={sortOption}>
            <option value="Sort By Ranks">Ranks</option><option value="Sort By ADP">ADP</option>
          </select>
          <select aria-label="Ranking highlight" className={compact ? styles.deskSelect : "rounded border border-slate-300 bg-white px-1 py-0.5 text-[11px]"} onChange={event => setHighlightOption(event.target.value as typeof highlightOption)} value={highlightOption}>
            {Object.values(HighlightOption).map(option => <option key={option} value={option}>{option}</option>)}
          </select>
          <button aria-label="Search players" className={compact ? styles.deskUtilityButton : `${styles.focusRing} rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-semibold hover:bg-slate-50`} onClick={() => setIsSearchModalOpen(true)} type="button">Search</button>
          {compact && onEditRankings && <button className={styles.deskUtilityButton} onClick={onEditRankings} type="button">Edit</button>}
        </div>
      </div>

      {draftStarted && myRoster && !compact && (
        <details className={compact ? styles.rankingRosterDetails : "rounded border border-slate-200 bg-white px-2 py-1 text-left text-xs"} open={isRosterVisible} onToggle={event => setIsRosterVisible(event.currentTarget.open)}>
          <summary className="cursor-pointer font-semibold">Your drafted players</summary>
          <div className="mt-1 grid grid-cols-2 gap-1">
            {(["QB", "RB", "WR", "TE"] as Array<"QB" | "RB" | "WR" | "TE">).flatMap(position => (myRoster[position] || [])
              .map((id: string) => playerLib[id]).filter(Boolean).map((player: Player, index: number) => renderPlayer(player, index)))}
          </div>
        </details>
      )}

      <div className={compact ? styles.positionLanes : "grid min-h-0 flex-1 grid-cols-4 gap-2 overflow-y-auto"}>
        {compact ? lanesForPair[pair].map(renderLane) : allPositionColumns}
      </div>

      <PlayerSearchModal
        addPlayerTarget={addPlayerTarget}
        boardSettings={boardSettings}
        currPick={currPick}
        fantasySettings={fantasySettings}
        isOpen={isSearchModalOpen}
        myPickNum={myPickNum}
        onClose={() => setIsSearchModalOpen(false)}
        playerLib={playerLib}
        playerTargets={playerTargets}
        rankingSummaries={rankingSummaries}
        removePlayerTarget={removePlayerTarget}
      />
    </div>
  )
}

export default RankingView
