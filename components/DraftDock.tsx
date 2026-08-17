import React, { useEffect, useMemo, useRef, useState } from "react"

import type { BoardSettings, FantasySettings, Player } from "../types"
import type { Roster } from "../behavior/draft"
import {
  buildDraftDeskLeagueNeeds,
  buildDraftDeskRosterSlots,
} from "../behavior/draftDesk"
import DraftDeskPlayerCard from "./shared/DraftDeskPlayerCard"
import DeskSegmentedControl from "./draft-desk/DeskSegmentedControl"
import styles from "./DraftDesk.module.css"
import {playerShortName} from "../behavior/presenters"

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
  connectionLabel?: string
  connectionDetail?: string
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
  connectionLabel = "Draft feed ready",
  connectionDetail = "Local board current",
}: DraftDockProps) => {
  const [mode, setMode] = useState<DraftDockMode>("roster")
  const dockRef = useRef<HTMLElement>(null)
  const ownRoster = rosters[myPickNum - 1]
  const slots = useMemo(() => buildDraftDeskRosterSlots(ownRoster, settings), [ownRoster, settings])
  const needs = useMemo(() => buildDraftDeskLeagueNeeds(rosters, myPickNum - 1, settings), [myPickNum, rosters, settings])
  const recentPlayerIds = useMemo(() => draftHistory.filter(Boolean).slice(-6) as string[], [draftHistory])
  const nextMyPick = myPicks.find(pick => pick >= currPick) || null
  const picksAway = nextMyPick === null ? null : nextMyPick - currPick
  const formatPick = (pick: number): string => {
    const round = Math.floor((pick - 1) / settings.numTeams) + 1
    const slot = ((pick - 1) % settings.numTeams) + 1
    return `${round}.${String(slot).padStart(2, "0")}`
  }
  const rosterPlayerForSlot = (position: string, id: string): Player | null => {
    if (position === "FLEX") return null
    const slot = Number(id.split("-")[1] || 1) - 1
    const playerId = ownRoster?.[position as "QB" | "RB" | "WR" | "TE"]?.[slot]
    return playerId ? playerLib[playerId] || null : null
  }

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
              <p className={styles.dockLabel}>On the clock · Round {roundIdx + 1}</p>
              <p className={styles.dockMetric}>Pick {formatPick(currPick)} <small>#{currPick}</small></p>
            </div>
            <div className={styles.dockNextPick}>
              <p className={styles.dockLabel}>Your next pick</p>
              <p className={styles.dockMetric}>
                {nextMyPick === null ? "Not scheduled" : formatPick(nextMyPick)}
                {nextMyPick !== null && <small>{picksAway === 0 ? "On the clock" : `${picksAway} away`}</small>}
                {nextMyPick !== null && picksAway !== null && <span className="sr-only">#{nextMyPick} · {picksAway} away</span>}
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
                  <div className={styles.rosterSlots}>{slots.map(slot => {
                    const rosterPlayer = rosterPlayerForSlot(slot.position, slot.id)
                    return <span className={`${slot.filled ? "" : styles.emptySlot} ${slot.position === "QB" ? styles.positionQB : slot.position === "RB" ? styles.positionRB : slot.position === "WR" ? styles.positionWR : slot.position === "TE" ? styles.positionTE : ""}`} key={slot.id}><strong>{slot.label}</strong>{rosterPlayer ? playerShortName(rosterPlayer.fullName) : slot.filled ? "Filled" : "Empty"}</span>
                  })}</div>
                  <details className={styles.rosterDetails}><summary className={styles.focusRing}>Expand roster detail</summary><ul>{["QB", "RB", "WR", "TE"].map(position => <li key={position}><strong>{position}</strong>: {(ownRoster?.[position as "QB" | "RB" | "WR" | "TE"] || []).map(id => playerLib[id]?.fullName || "Unknown").join(", ") || "—"}</li>)}</ul></details>
                </section>
              )}
              {mode === "needs" && (
                <section aria-label="League starter needs" data-testid="draft-dock-league-needs"><p className="sr-only">Other teams&apos; observed starter slots, not model probabilities.</p><ul className={styles.leagueNeedList}>{needs.map(need => <li className={styles.leagueNeedRow} key={need.id}><strong>{need.label}</strong><span>{need.teamsMissing} missing</span></li>)}</ul></section>
              )}
            </div>
          </section>
          <section className={styles.dockConnection} aria-label="Draft connection status">
            <span className={connected ? styles.liveDot : styles.idleDot} aria-hidden="true" />
            <strong>{connectionLabel}</strong>
            <small>{connectionDetail}</small>
          </section>
        </div>
    </aside>
  )
}

export default DraftDock
