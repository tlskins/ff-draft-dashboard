import Image from "next/image"
import React, {useMemo, useState, type ReactNode} from "react"

import {
  getPlayerMetrics,
  getRankRoundsAheadOfAdp,
  getRoundAndPickShortText,
  getRoundNumForPickNum,
  type PlayerRanks,
} from "../../behavior/draft"
import {
  getLastRankedADPRound,
  organizePlayersByADPRound,
} from "../../behavior/hooks/useADPRoundView"
import type {
  BoardSettings,
  FantasyPosition,
  FantasySettings,
  Player,
  PlayerTarget,
} from "../../types"
import {FantasyPosition as Position} from "../../types"
import styles from "./MobileRankingsEditor.module.css"


export type MobileRankingsView = "position" | "adp" | "targets"
type PositionFilter = "ALL" | "QB" | "RB" | "WR" | "TE"

const POSITIONS = [Position.RUNNING_BACK, Position.WIDE_RECEIVER, Position.QUARTERBACK, Position.TIGHT_END] as const
const FILTERS: PositionFilter[] = ["ALL", "RB", "WR", "QB", "TE"]

interface MobileRankingsEditorProps {
  playerRanks: PlayerRanks
  playerLib: {[playerId: string]: Player}
  settings: FantasySettings
  boardSettings: BoardSettings
  playerTargets: PlayerTarget[]
  isEditingRankings: boolean
  canEditRankings: boolean
  profileControl?: ReactNode
  onBeginRankEdits: () => boolean
  onSaveRankEdits: () => void | Promise<void>
  onReorderPlayer: (playerId: string, position: keyof PlayerRanks, newIndex: number) => void
  addPlayerTarget: (player: Player, targetAsEarlyAsRound: number) => void
  removePlayerTarget: (playerId: string) => void
  replacePlayerTargets: (targets: PlayerTarget[]) => void
}

const matchesQuery = (player: Player, query: string) => {
  const normalized = query.trim().toLocaleLowerCase()
  if (!normalized) return true
  return `${player.fullName} ${player.team} ${player.position}`
    .toLocaleLowerCase()
    .includes(normalized)
}

const isRankablePosition = (position: FantasyPosition): position is typeof POSITIONS[number] => (
  POSITIONS.includes(position as typeof POSITIONS[number])
)

const targetRoundFor = (
  player: Player,
  settings: FantasySettings,
  boardSettings: BoardSettings,
) => {
  const metrics = getPlayerMetrics(player, settings, boardSettings)
  const pick = metrics.adp || metrics.overallRank || 1
  return getRoundNumForPickNum(Math.max(1, Math.round(pick)), settings.numTeams)
}

const MobileRankingsEditor = ({
  playerRanks,
  playerLib,
  settings,
  boardSettings,
  playerTargets,
  isEditingRankings,
  canEditRankings,
  profileControl,
  onBeginRankEdits,
  onSaveRankEdits,
  onReorderPlayer,
  addPlayerTarget,
  removePlayerTarget,
  replacePlayerTargets,
}: MobileRankingsEditorProps) => {
  const [view, setView] = useState<MobileRankingsView>("position")
  const [position, setPosition] = useState<typeof POSITIONS[number]>(Position.RUNNING_BACK)
  const [positionFilter, setPositionFilter] = useState<PositionFilter>("ALL")
  const [adpRound, setAdpRound] = useState(1)
  const [query, setQuery] = useState("")
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "blocked" | "error">("idle")

  const targetsById = useMemo(() => new Map(
    playerTargets.map(target => [target.playerId, target]),
  ), [playerTargets])
  const availableIds = useMemo(() => new Set(
    playerRanks.availPlayersByOverallRank.map(player => player.id),
  ), [playerRanks.availPlayersByOverallRank])
  const lastAdpRound = useMemo(() => getLastRankedADPRound(
    playerRanks.availPlayersByOverallRank,
    settings,
    boardSettings,
  ), [boardSettings, playerRanks.availPlayersByOverallRank, settings])
  const targetRoundLimit = Math.max(
    18,
    lastAdpRound,
    ...playerTargets.map(target => target.targetAsEarlyAsRound),
  )

  const positionPlayers = useMemo(() => playerRanks[position]
    .filter(player => matchesQuery(player, query)), [playerRanks, position, query])
  const playersByAdpRound = useMemo(() => organizePlayersByADPRound({
    availablePlayers: playerRanks.availPlayersByOverallRank,
    fantasySettings: settings,
    boardSettings,
    positionFilter: positionFilter === "ALL" ? "All" : positionFilter,
    roundsToShow: [adpRound],
  }), [adpRound, boardSettings, playerRanks.availPlayersByOverallRank, positionFilter, settings])
  const adpPlayers = useMemo(() => (playersByAdpRound[adpRound] || [])
    .filter(player => matchesQuery(player, query)), [adpRound, playersByAdpRound, query])
  const targetPlayers = useMemo(() => playerTargets.flatMap(target => {
    const player = playerLib[target.playerId]
    if (!player || !availableIds.has(player.id)) return []
    if (positionFilter !== "ALL" && player.position !== positionFilter) return []
    if (!matchesQuery(player, query)) return []
    const metrics = getPlayerMetrics(player, settings, boardSettings)
    return [{player, target, adp: metrics.adp || Number.MAX_SAFE_INTEGER}]
  }).sort((left, right) => left.adp - right.adp
    || left.target.targetAsEarlyAsRound - right.target.targetAsEarlyAsRound
    || left.player.fullName.localeCompare(right.player.fullName)), [
    availableIds,
    boardSettings,
    playerLib,
    playerTargets,
    positionFilter,
    query,
    settings,
  ])

  const updateTargetRound = (playerId: string, round: number) => {
    replacePlayerTargets(playerTargets.map(target => target.playerId === playerId
      ? {...target, targetAsEarlyAsRound: round}
      : target))
  }

  const toggleRankEditing = async () => {
    if (!isEditingRankings) {
      setSaveState(onBeginRankEdits() ? "idle" : "blocked")
      return
    }
    setSaveState("saving")
    try {
      await onSaveRankEdits()
      setSaveState("saved")
    } catch {
      setSaveState("error")
    }
  }

  const renderPlayer = (player: Player, target?: PlayerTarget) => {
    const metrics = getPlayerMetrics(player, settings, boardSettings)
    const tierNumber = metrics.tier?.tierNumber
    const positionList = isRankablePosition(player.position)
      ? playerRanks[player.position]
      : []
    const positionIndex = positionList.findIndex(candidate => candidate.id === player.id)
    const roundsAhead = getRankRoundsAheadOfAdp(
      metrics.overallRank,
      metrics.adp,
      settings.numTeams,
    )
    const tierClass = tierNumber
      ? styles[`tier${Math.min(7, tierNumber)}`]
      : styles.tierUnknown
    return (
      <article
        aria-label={`${player.fullName}, ${player.position} rank ${metrics.posRank}${target ? `, target round ${target.targetAsEarlyAsRound}` : ""}`}
        className={`${styles.playerCard} ${styles[`position${player.position}`]} ${tierClass} ${target ? styles.targetCard : ""}`}
        data-player-id={player.id}
        key={player.id}
      >
        <div className={styles.rankCell}>
          <strong>{metrics.posRank < 9999 ? metrics.posRank : "—"}</strong>
          <span>{player.position}</span>
        </div>
        <div className={styles.playerBody}>
          <div className={styles.playerNameLine}>
            <strong>{player.fullName}</strong>
            {target && <span aria-label="Targeted player" className={styles.targetMark}>◎</span>}
            {player.injuryStatus?.injured && (
              <span className={styles.injuryBadge}>{player.injuryStatus.status}</span>
            )}
          </div>
          <div className={styles.playerEvidence}>
            <span>{player.team}</span>
            <span>{tierNumber ? `Tier ${tierNumber}` : "No tier"}</span>
            <span>ADP {metrics.adp ? getRoundAndPickShortText(metrics.adp, settings.numTeams) : "—"}</span>
            {roundsAhead !== null && (
              <span className={roundsAhead > 0 ? styles.valueEarly : roundsAhead < 0 ? styles.valueLate : styles.valueEven}>
                {roundsAhead > 0 ? `+${roundsAhead}` : roundsAhead} vs ADP
              </span>
            )}
          </div>
          <div className={styles.cardActions}>
            {isEditingRankings && positionIndex >= 0 && (
              <label className={styles.rankEditor}>
                <span>Rank</span>
                <select
                  aria-label={`Move ${player.fullName} to ${player.position} rank`}
                  onChange={event => onReorderPlayer(
                    player.id,
                    player.position as keyof PlayerRanks,
                    Number(event.target.value) - 1,
                  )}
                  value={positionIndex + 1}
                >
                  {positionList.map((_, index) => (
                    <option key={index + 1} value={index + 1}>#{index + 1}</option>
                  ))}
                </select>
              </label>
            )}
            {target ? (
              <>
                <label className={styles.targetRoundEditor}>
                  <span>Target</span>
                  <select
                    aria-label={`Move ${player.fullName} target round`}
                    onChange={event => updateTargetRound(player.id, Number(event.target.value))}
                    value={target.targetAsEarlyAsRound}
                  >
                    {Array.from({length: targetRoundLimit}, (_, index) => (
                      <option key={index + 1} value={index + 1}>R{index + 1}</option>
                    ))}
                  </select>
                </label>
                <button
                  aria-label={`Remove ${player.fullName} target`}
                  className={styles.removeTarget}
                  onClick={() => removePlayerTarget(player.id)}
                  type="button"
                >
                  Remove
                </button>
              </>
            ) : (
              <button
                className={styles.addTarget}
                onClick={() => addPlayerTarget(
                  player,
                  targetRoundFor(player, settings, boardSettings),
                )}
                type="button"
              >
                ◎ Target
              </button>
            )}
          </div>
        </div>
      </article>
    )
  }

  const visibleCount = view === "position"
    ? positionPlayers.length
    : view === "adp" ? adpPlayers.length : targetPlayers.length

  return (
    <div className={styles.shell} data-testid="mobile-rankings-editor">
      <header className={styles.header}>
        <div className={styles.brandRow}>
          <div className={styles.brand}>
            <span className={styles.brandMark}>
              <Image alt="Drafty Logo" height={26} src="/friedchickentechlogo.png" unoptimized width={26} />
            </span>
            <div><strong>Drafty</strong><span>Rankings editor</span></div>
          </div>
          <div className={styles.sourceBadge}>
            <span>{boardSettings.ranker}</span>
            <small>{settings.numTeams} team · {settings.scoringFormat || (settings.ppr ? "ppr" : "standard")}</small>
          </div>
        </div>

        {profileControl && <div className={styles.profileControl}>{profileControl}</div>}

        <nav aria-label="Mobile rankings views" className={styles.viewTabs}>
          {([
            ["position", "Position"],
            ["adp", "ADP round"],
            ["targets", `Targets ${playerTargets.length}`],
          ] as const).map(([id, label]) => (
            <button
              aria-pressed={view === id}
              className={view === id ? styles.activeTab : ""}
              key={id}
              onClick={() => setView(id)}
              type="button"
            >
              {label}
            </button>
          ))}
        </nav>

        <div className={styles.filters}>
          <div className={styles.filterScroller}>
            {view === "position" ? POSITIONS.map(item => (
              <button
                aria-pressed={position === item}
                className={position === item ? styles.activeFilter : ""}
                key={item}
                onClick={() => setPosition(item)}
                type="button"
              >{item}</button>
            )) : FILTERS.map(item => (
              <button
                aria-pressed={positionFilter === item}
                className={positionFilter === item ? styles.activeFilter : ""}
                key={item}
                onClick={() => setPositionFilter(item)}
                type="button"
              >{item}</button>
            ))}
          </div>
          <button
            className={isEditingRankings ? styles.saveRanks : styles.editRanks}
            disabled={!canEditRankings && !isEditingRankings || saveState === "saving"}
            onClick={() => void toggleRankEditing()}
            type="button"
          >
            {isEditingRankings ? saveState === "saving" ? "Saving…" : "Save ranks" : "Edit ranks"}
          </button>
        </div>

        {view === "adp" && (
          <div aria-label="ADP round selector" className={styles.roundScroller}>
            {Array.from({length: lastAdpRound}, (_, index) => index + 1).map(round => (
              <button
                aria-pressed={adpRound === round}
                className={adpRound === round ? styles.activeRound : ""}
                key={round}
                onClick={() => setAdpRound(round)}
                type="button"
              >R{round}</button>
            ))}
          </div>
        )}

        <label className={styles.search}>
          <span aria-hidden="true">⌕</span>
          <input
            aria-label="Search mobile rankings"
            onChange={event => setQuery(event.target.value)}
            placeholder="Search player or team"
            type="search"
            value={query}
          />
          <small>{visibleCount}</small>
        </label>

        <div aria-live="polite" className={styles.saveStatus}>
          {saveState === "saved" && "Ranks saved locally and queued for cloud sync."}
          {saveState === "blocked" && "Rank editing is locked after a draft or purge begins."}
          {saveState === "error" && "Rank changes could not be saved. Your current screen is unchanged."}
          {isEditingRankings && saveState === "idle" && "Editing custom positional ranks."}
        </div>
      </header>

      <main className={styles.content}>
        <div className={styles.listHeading}>
          <div>
            <span>{view === "position" ? `${position} rankings` : view === "adp" ? `ADP round ${adpRound}` : "Target board"}</span>
            <strong>{visibleCount} player{visibleCount === 1 ? "" : "s"}</strong>
          </div>
          <small>{view === "targets" ? "Lowest ADP first" : view === "adp" ? "Ranked within this ADP round" : "Configured positional order"}</small>
        </div>

        <div className={styles.playerList}>
          {view === "position" && positionPlayers.map(player => renderPlayer(player, targetsById.get(player.id)))}
          {view === "adp" && adpPlayers.map(player => renderPlayer(player, targetsById.get(player.id)))}
          {view === "targets" && targetPlayers.map(({player, target}) => renderPlayer(player, target))}
          {visibleCount === 0 && (
            <div className={styles.emptyState} role="status">
              <strong>No players here yet.</strong>
              <span>{view === "targets" ? "Target players from either rankings view." : "Try another position, round, or search."}</span>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default MobileRankingsEditor
