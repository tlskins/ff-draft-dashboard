import React, { useEffect, useMemo, useRef, useState } from "react"

import type { BoardSettings, FantasySettings, Player } from "../types"
import type { Roster } from "../behavior/draft"
import {
  buildDraftDeskLeagueNeeds,
  buildDraftDeskRosterSlots,
} from "../behavior/draftDesk"
import DraftDeskPlayerCard from "./shared/DraftDeskPlayerCard"
import styles from "./DraftDesk.module.css"

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
}

const modeLabels: Array<{id: DraftDockMode, label: string}> = [
  {id: "round", label: "Current round"},
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
}: DraftDockProps) => {
  const [mode, setMode] = useState<DraftDockMode>("roster")
  const dockRef = useRef<HTMLElement>(null)
  const ownRoster = rosters[myPickNum - 1]
  const slots = useMemo(() => buildDraftDeskRosterSlots(ownRoster, settings), [ownRoster, settings])
  const needs = useMemo(() => buildDraftDeskLeagueNeeds(rosters, myPickNum - 1, settings), [myPickNum, rosters, settings])
  const recentPlayerIds = useMemo(() => draftHistory.filter(Boolean).slice(-6) as string[], [draftHistory])
  const nextMyPick = myPicks.find(pick => pick >= currPick) || null
  const picksAway = nextMyPick === null ? null : nextMyPick - currPick

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
    <aside aria-label="Draft dock" className={`${styles.desk} fixed inset-x-0 bottom-0 z-40 hidden border-t border-slate-600 xl:block`} data-testid="draft-dock" ref={dockRef}>
      <div className="mx-auto max-w-[1800px] px-2 py-1.5">
        <div className={styles.dockLayout} data-testid="draft-dock-tape">
          <section className={styles.dockSection} aria-label="Draft pick status">
            <p className={styles.dockLabel}>Current</p>
            <p className={styles.dockMetric}>Round {roundIdx + 1} · Pick #{currPick}</p>
            <p className={styles.dockLabel}>Next user pick</p>
            <p className={styles.dockMetric}>{nextMyPick === null ? "Not scheduled" : picksAway === 0 ? "On the clock" : `#${nextMyPick} · ${picksAway} away`}</p>
          </section>

          <section className={styles.dockSection} aria-label="Six most recent draft picks">
            <p className={styles.dockLabel}>Last six actual picks</p>
            <div className={styles.dockRecent} data-testid="draft-dock-recent-picks">
              {recentPlayerIds.length > 0 ? recentPlayerIds.map((id, index) => {
                const player = playerLib[id]
                return player ? <DraftDeskPlayerCard boardSettings={boardSettings} dock fantasySettings={settings} key={`${id}-${index}`} onFocusPlayer={setViewPlayerId} player={player} rankContext={`Pick #${draftHistory.lastIndexOf(id) + 1}`} /> : null
              }) : <p className="text-xs text-slate-500">No draft picks yet.</p>}
            </div>
          </section>

          <section className={styles.dockSection} aria-label="Draft dock view">
            <div className={styles.modeToggle} role="group">
              {modeLabels.map(item => <button aria-pressed={mode === item.id} key={item.id} onClick={() => setMode(item.id)} type="button">{item.label}</button>)}
            </div>
            <div className={styles.dockModeContent}>
              {mode === "round" && (
                <div className="overflow-x-auto" data-testid="draft-dock-current-round">
                  <table className="text-[10px]">
                    <caption className="sr-only">Current draft round picks</caption>
                    <tbody><tr className={isEvenRound ? "flex flex-row-reverse gap-1" : "flex gap-1"}>{currRound.map((id, index) => {
                      const player = id ? playerLib[id] : null
                      const pickNum = roundIdx * settings.numTeams + index + 1
                      const ownPick = index + 1 === (isEvenRound ? settings.numTeams - myPickNum + 1 : myPickNum)
                      return <td key={pickNum}><button aria-label={player ? `Remove ${player.fullName} from pick ${pickNum}` : `Set current pick to ${pickNum}`} className={`${styles.focusRing} rounded border px-1 ${index + 1 === currRoundPick ? "border-amber-500 bg-amber-50" : "border-slate-300 bg-white"} ${ownPick ? "ring-1 ring-emerald-500" : ""}`} onClick={() => player ? onRemovePick(pickNum) : setCurrPick(pickNum)} onFocus={() => player && setViewPlayerId(player.id)} type="button">#{pickNum} · {player?.fullName || "Open"}</button></td>
                    })}</tr></tbody>
                  </table>
                </div>
              )}
              {mode === "roster" && (
                <section aria-label="Your roster slot summary" data-testid="draft-dock-roster">
                  <p className="mb-1 text-[10px] text-slate-500">Observed roster slots — counts are not probabilities.</p>
                  <div className="flex flex-wrap gap-1">{slots.map(slot => <span className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px]" key={slot.id}><strong>{slot.label}</strong> · {slot.filled ? "filled" : "open"}</span>)}</div>
                  <details className="mt-1 text-[10px]"><summary className={`${styles.focusRing} inline cursor-pointer font-semibold`}>Expand roster detail</summary><ul className="mt-1 grid grid-cols-4 gap-1">{["QB", "RB", "WR", "TE"].map(position => <li className="rounded border border-slate-300 bg-white p-1" key={position}><strong>{position}</strong>: {(ownRoster?.[position as "QB" | "RB" | "WR" | "TE"] || []).map(id => playerLib[id]?.fullName || "Unknown").join(", ") || "—"}</li>)}</ul></details>
                </section>
              )}
              {mode === "needs" && (
                <section aria-label="League starter needs" data-testid="draft-dock-league-needs"><p className="mb-1 text-[10px] text-slate-500">Other teams&apos; observed starter slots, not model probabilities.</p><ul className={styles.leagueNeedList}>{needs.map(need => <li className={styles.leagueNeedRow} key={need.id}><strong>{need.label}</strong><span>{need.teamsMissing} missing</span></li>)}</ul></section>
              )}
            </div>
          </section>
        </div>
      </div>
    </aside>
  )
}

export default DraftDock
