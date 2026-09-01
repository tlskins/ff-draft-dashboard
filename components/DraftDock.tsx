import React, { useEffect, useMemo, useRef, useState } from "react"

import type { BoardSettings, FantasySettings, Player } from "../types"
import type { Roster } from "../behavior/draft"
import {
  buildDraftDeskLeagueNeedMatrix,
  DRAFT_DESK_NEED_POSITIONS,
} from "../behavior/draftDesk"
import {getPlayerMetrics} from "../behavior/draft"
import DraftDeskPlayerCard from "./shared/DraftDeskPlayerCard"
import DeskSegmentedControl from "./draft-desk/DeskSegmentedControl"
import styles from "./DraftDesk.module.css"
import {playerShortName} from "../behavior/presenters"
import type {DraftActivityItem} from "../behavior/draftActivity"

type DraftDockMode = "round" | "roster" | "needs"

interface DraftDockProps {
  roundIdx: number
  currRoundPick: number
  currPick: number
  isEvenRound: boolean
  currRound: (string | null)[]
  draftHistory: (string | null)[]
  playerLib: {[playerId: string]: Player}
  rosters: Roster[]
  settings: FantasySettings
  boardSettings: BoardSettings
  myPickNum: number
  myPicks: number[]
  onRemovePick: (pickNum: number) => void
  setCurrPick: (pickNum: number) => void
  setViewPlayerId: (playerId: string | null) => void
  onHeightChange?: (height: number) => void
  connected?: boolean
  draftComplete?: boolean
  totalPicks?: number
  connectionLabel?: string
  connectionDetail?: string
  activity?: DraftActivityItem[]
  pendingDraftTitle?: string | null
  onAcceptDraft?: () => void
  onIgnoreDraft?: () => void
}

const modeLabels: Array<{id: DraftDockMode, label: string}> = [
  {id: "round", label: "Round"},
  {id: "roster", label: "Your roster"},
  {id: "needs", label: "League needs"},
]

const DraftDock = ({
  roundIdx,
  currRoundPick,
  currPick,
  isEvenRound,
  currRound,
  draftHistory,
  playerLib,
  rosters,
  settings,
  boardSettings,
  myPickNum,
  myPicks,
  onRemovePick,
  setCurrPick,
  setViewPlayerId,
  onHeightChange,
  connected = false,
  draftComplete = false,
  totalPicks,
  connectionLabel = "Draft feed ready",
  connectionDetail = "Local board current",
  activity = [],
  pendingDraftTitle,
  onAcceptDraft,
  onIgnoreDraft,
}: DraftDockProps) => {
  const [mode, setMode] = useState<DraftDockMode>("roster")
  const dockRef = useRef<HTMLElement>(null)
  const ownRoster = rosters[myPickNum - 1]
  const needs = useMemo(() => buildDraftDeskLeagueNeedMatrix(rosters), [rosters])
  const recentPlayerIds = useMemo(() => draftHistory.filter(Boolean).slice(-6) as string[], [draftHistory])
  const nextMyPick = myPicks.find(pick => pick >= currPick) || null
  const picksAway = nextMyPick === null ? null : nextMyPick - currPick
  const formatPick = (pick: number): string => {
    const round = Math.floor((pick - 1) / settings.numTeams) + 1
    const slot = ((pick - 1) % settings.numTeams) + 1
    return `${round}.${String(slot).padStart(2, "0")}`
  }
  const rosterColumns = DRAFT_DESK_NEED_POSITIONS.map(position => ({
    position,
    players: (ownRoster?.[position] || []).map(id => playerLib[id]).filter(Boolean),
  }))

  useEffect(() => {
    const dock = dockRef.current
    if (!dock || !onHeightChange) return
    const reportHeight = () => onHeightChange(dock.getBoundingClientRect().height)
    reportHeight()
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(reportHeight)
    observer.observe(dock)
    return () => observer.disconnect()
  }, [onHeightChange])

  return (
    <aside aria-label="Draft dock" className={`${styles.desk} ${styles.draftDock} z-40 hidden xl:block`} data-testid="draft-dock" ref={dockRef}>
      <div className={styles.dockLayout} data-testid="draft-dock-tape">
          <section className={styles.dockPickStack} aria-label="Draft pick status">
            <div className={styles.dockPickClock}>
              <p className={styles.dockLabel}>{draftComplete ? "Draft complete" : `On the clock · Round ${roundIdx + 1}`}</p>
              <p className={styles.dockMetric}>{draftComplete
                ? totalPicks
                  ? `${totalPicks} picks captured`
                  : "Final board captured"
                : <>Pick {formatPick(currPick)} <small>#{currPick}</small></>}</p>
            </div>
            <div className={styles.dockNextPick}>
              <p className={styles.dockLabel}>Your next pick</p>
              <p className={styles.dockMetric}>
                {draftComplete ? "No remaining picks" : nextMyPick === null ? "Not scheduled" : formatPick(nextMyPick)}
                {!draftComplete && nextMyPick !== null && <small>#{nextMyPick} · {picksAway === 0 ? "On the clock" : `${picksAway} away`}</small>}
                {!draftComplete && nextMyPick !== null && picksAway !== null && <span className="sr-only">#{nextMyPick} · {picksAway} away</span>}
              </p>
            </div>
          </section>

          <section className={styles.dockRecentPicks} aria-label="Six most recent draft picks">
            <p className={styles.dockLabel}>Recent picks</p>
            <div className={styles.dockRecent} data-testid="draft-dock-recent-picks">
              {recentPlayerIds.length > 0 ? recentPlayerIds.map((id, index) => {
                const player = playerLib[id]
                return player ? <DraftDeskPlayerCard boardSettings={boardSettings} dock fantasySettings={settings} key={`${id}-${index}`} onFocusPlayer={setViewPlayerId} player={player} rankContext={formatPick(draftHistory.lastIndexOf(id) + 1)} /> : null
              }) : <p className={styles.dockEmpty}>No draft picks yet.</p>}
            </div>
          </section>

          <section className={styles.dockContent} aria-label="Draft dock view">
            <DeskSegmentedControl
              ariaLabel="Draft dock view"
              className={styles.dockModeToggle}
              items={modeLabels}
              onSelect={setMode}
              selectedId={mode}
            />
            <div className={styles.dockModeContent}>
              {mode === "round" && (
                <div className={styles.dockRound} data-testid="draft-dock-current-round">
                  <table>
                    <caption className="sr-only">Current draft round picks</caption>
                    <tbody><tr className={isEvenRound ? styles.roundReverse : undefined}>{currRound.map((id, index) => {
                      const player = id ? playerLib[id] : null
                      const pickNum = roundIdx * settings.numTeams + index + 1
                      const ownPick = index + 1 === (isEvenRound ? settings.numTeams - myPickNum + 1 : myPickNum)
                      return <td key={pickNum}><button aria-current={index + 1 === currRoundPick ? "step" : undefined} aria-label={player ? `Remove ${player.fullName} from pick ${pickNum}` : `Set current pick to ${pickNum}`} className={`${styles.focusRing} ${ownPick ? styles.ownRoundPick : ""}`} onClick={() => player ? onRemovePick(pickNum) : setCurrPick(pickNum)} onFocus={() => player && setViewPlayerId(player.id)} type="button"><strong>{formatPick(pickNum)}</strong>{player ? playerShortName(player.fullName) : "Open"}</button></td>
                    })}</tr></tbody>
                  </table>
                </div>
              )}
              {mode === "roster" && (
                <section aria-label="Your roster slot summary" data-testid="draft-dock-roster">
                  <p className="sr-only">Observed roster slots — counts are not probabilities.</p>
                  <div className={styles.rosterMatrix}>
                    {rosterColumns.map(column => <section key={column.position}>
                      <strong>{column.position}</strong>
                      {column.players.length > 0 ? column.players.map(player => {
                        const tier = getPlayerMetrics(player, settings, boardSettings).tier?.tierNumber
                        return <span key={player.id} title={player.fullName}>
                          {playerShortName(player.fullName)} <small>{tier ? `T${tier}` : "T—"}</small>
                        </span>
                      }) : <span className={styles.emptySlot}>—</span>}
                    </section>)}
                  </div>
                </section>
              )}
              {mode === "needs" && (
                <section aria-label="League roster needs" data-testid="draft-dock-league-needs">
                  <p className="sr-only">All teams&apos; observed positional depth, not model probabilities.</p>
                  <table className={styles.leagueNeedTable}>
                    <caption className="sr-only">Teams missing each positional roster slot</caption>
                    <thead><tr><th>Slot</th>{DRAFT_DESK_NEED_POSITIONS.map(position => <th key={position}>{position}</th>)}</tr></thead>
                    <tbody>{[1, 2, 3, 4].map(slot => <tr key={slot}>
                      <th>{slot}</th>
                      {DRAFT_DESK_NEED_POSITIONS.map(position => {
                        const need = needs.find(item => item.position === position && item.slot === slot)!
                        const filled = need.teamCount - need.teamsMissing
                        const filledRatio = need.teamCount > 0 ? filled / need.teamCount : 0
                        return <td
                          data-filled-ratio={filledRatio.toFixed(2)}
                          key={position}
                          style={{"--need-fill": filledRatio} as React.CSSProperties}
                          title={`${need.teamsMissing} of ${need.teamCount} teams missing ${position}${slot}`}
                        ><span className="sr-only">{position}{slot}: </span>{need.teamsMissing}</td>
                      })}
                    </tr>)}</tbody>
                  </table>
                </section>
              )}
            </div>
          </section>
          <section className={`${styles.dockConnection} ${pendingDraftTitle ? styles.dockConnectionPrompt : ""}`} aria-label="Draft connection status">
            {pendingDraftTitle ? <>
              <span className={styles.liveDot} aria-hidden="true" />
              <strong>Draft found</strong>
              <small title={pendingDraftTitle}>{pendingDraftTitle}</small>
              <div className={styles.dockConnectionActions}>
                <button onClick={onAcceptDraft} type="button">Connect</button>
                <button onClick={onIgnoreDraft} type="button">Ignore</button>
              </div>
            </> : <>
              <span className={connected ? styles.liveDot : styles.idleDot} aria-hidden="true" />
              <strong>{connectionLabel}</strong>
              <small>{connectionDetail}</small>
            </>}
            {activity.length > 0 && (
              <ol aria-label="Draft activity ticker" className={styles.dockTicker}>
                {activity.slice(-3).reverse().map(item => (
                  <li className={item.tone === "warning" ? styles.dockTickerWarning : ""} key={item.id}>
                    <strong>{item.label}</strong>{item.detail && <span>{item.detail}</span>}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
    </aside>
  )
}

export default DraftDock
