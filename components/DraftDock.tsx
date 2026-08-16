import React, { useMemo, useState } from "react"

import type { FantasySettings, Player } from "../types"
import type { Roster } from "../behavior/draft"
import { getPosStyle } from "../behavior/styles"
import {
  buildDraftDeskLeagueNeeds,
  buildDraftDeskRosterSlots,
} from "../behavior/draftDesk"
import styles from "./DraftDesk.module.css"

type DraftDockMode = "round" | "roster" | "needs"

interface DraftDockProps {
  roundIdx: number
  currRoundPick: number
  currPick: number
  isEvenRound: boolean
  currRound: (string | null)[]
  playerLib: {[playerId: string]: Player}
  rosters: Roster[]
  settings: FantasySettings
  myPickNum: number
  myPicks: number[]
  onRemovePick: (pickNum: number) => void
  setCurrPick: (pickNum: number) => void
  setViewPlayerId: (playerId: string | null) => void
}

const modeLabels: Array<{id: DraftDockMode, label: string}> = [
  {id: "round", label: "Current round"},
  {id: "roster", label: "My roster"},
  {id: "needs", label: "League needs"},
]

const positionClass = (position: string): string => (
  position === "QB" ? styles.positionQB
    : position === "RB" ? styles.positionRB
      : position === "WR" ? styles.positionWR
        : styles.positionTE
)

const DraftDock = ({
  roundIdx,
  currRoundPick,
  currPick,
  isEvenRound,
  currRound,
  playerLib,
  rosters,
  settings,
  myPickNum,
  myPicks,
  onRemovePick,
  setCurrPick,
  setViewPlayerId,
}: DraftDockProps) => {
  const [mode, setMode] = useState<DraftDockMode>("round")
  const myRosterIndex = myPickNum - 1
  const ownRoster = rosters[myRosterIndex]
  const slots = useMemo(() => buildDraftDeskRosterSlots(ownRoster, settings), [
    ownRoster, settings,
  ])
  const needs = useMemo(() => buildDraftDeskLeagueNeeds(
    rosters, myRosterIndex, settings,
  ), [myRosterIndex, rosters, settings])
  const nextMyPick = myPicks.find(pick => pick >= currPick) || null
  const picksAway = nextMyPick === null ? null : nextMyPick - currPick

  return (
    <aside
      aria-label="Draft dock"
      className={`${styles.desk} fixed inset-x-0 bottom-0 z-40 hidden border-t border-slate-600 shadow-2xl md:block`}
    >
      <div className={`${styles.surface} flex items-center justify-center gap-6 border-x-0 px-4 py-2 text-sm`} data-testid="draft-dock-tape">
        <p><span className={styles.muted}>Overall</span> <strong>#{currPick}</strong></p>
        <p><span className={styles.muted}>Round</span> <strong>{roundIdx + 1}</strong></p>
        <p><span className={styles.muted}>Round pick</span> <strong>{currRoundPick}</strong></p>
        <p>
          <span className={styles.muted}>Your next</span>{" "}
          <strong>{nextMyPick === null
            ? "not scheduled"
            : picksAway === 0
              ? "on the clock"
              : `#${nextMyPick} · ${picksAway} away`}</strong>
        </p>
      </div>
      <div className="mx-auto max-w-screen-2xl px-4 pb-3 pt-2">
        <div className="mb-2 flex gap-1" role="group" aria-label="Draft dock view">
          {modeLabels.map(item => (
            <button
              aria-pressed={mode === item.id}
              className={`${styles.focusRing} rounded px-3 py-1 text-xs font-semibold ${mode === item.id ? styles.selected : "bg-slate-800 text-slate-100 hover:bg-slate-700"}`}
              key={item.id}
              onClick={() => setMode(item.id)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
        {mode === "round" && (
          <div className="overflow-x-auto" data-testid="draft-dock-current-round">
            <table className="mx-auto text-xs">
              <caption className="sr-only">Current draft round picks</caption>
              <tbody>
                <tr className={isEvenRound ? "flex flex-row-reverse" : "flex"}>
                  {currRound.map((pickedPlayerId, index) => {
                    const player = pickedPlayerId ? playerLib[pickedPlayerId] : null
                    const pickNum = roundIdx * settings.numTeams + index + 1
                    const isCurrent = index + 1 === currRoundPick
                    const isMyPick = index + 1 === (isEvenRound
                      ? settings.numTeams - myPickNum + 1
                      : myPickNum)
                    return (
                      <td className="px-0.5" key={pickNum}>
                        <button
                          aria-label={player
                            ? `Remove ${player.fullName} from pick ${pickNum}`
                            : `Set current pick to ${pickNum}`}
                          className={`${styles.focusRing} ${styles.row} flex min-w-[5.5rem] flex-col border px-2 py-1 text-left ${isCurrent ? "border-amber-300 bg-amber-100 text-slate-950" : player ? `${getPosStyle(player.position)} ${positionClass(player.position)}` : "border-slate-600 bg-slate-800"} ${isMyPick ? "ring-2 ring-emerald-300" : ""}`}
                          onClick={() => player
                            ? onRemovePick(pickNum)
                            : setCurrPick(pickNum)}
                          onFocus={() => player && setViewPlayerId(player.id)}
                          onMouseEnter={() => player && setViewPlayerId(player.id)}
                          type="button"
                        >
                          <span className="font-semibold">#{pickNum}</span>
                          <span className="truncate">{player?.fullName || "Open"}</span>
                        </button>
                      </td>
                    )
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        )}
        {mode === "roster" && (
          <section aria-label="My roster slot summary" data-testid="draft-dock-roster">
            <p className={`${styles.muted} mb-1 text-xs`}>
              Observed roster slots — counts are not probabilities.
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {slots.map(slot => (
                <li
                  className={`${styles.row} ${positionClass(slot.position === "FLEX" ? "TE" : slot.position)} flex min-w-[4.5rem] items-center justify-between border border-slate-600 bg-slate-800 px-2 text-xs`}
                  key={slot.id}
                  title={slot.description}
                >
                  <span className="font-semibold">{slot.label}</span>
                  <span className={slot.filled ? "text-emerald-300" : styles.urgency}>
                    {slot.filled ? "filled" : "open"}
                  </span>
                </li>
              ))}
            </ul>
            <details className="mt-2 text-xs">
              <summary className={`${styles.focusRing} inline cursor-pointer rounded px-1 font-semibold hover:bg-slate-800`}>
                Expand roster detail
              </summary>
              <ul className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-4">
                {["QB", "RB", "WR", "TE"].map(position => (
                  <li className="rounded border border-slate-600 bg-slate-800 p-2" key={position}>
                    <span className="font-semibold">{position}</span>: {(
                      ownRoster?.[position as "QB" | "RB" | "WR" | "TE"] || []
                    ).map(id => playerLib[id]?.fullName || "Unknown player").join(", ") || "—"}
                  </li>
                ))}
              </ul>
            </details>
          </section>
        )}
        {mode === "needs" && (
          <section aria-label="League starter needs" data-testid="draft-dock-league-needs">
            <p className={`${styles.muted} mb-1 text-xs`}>
              Other teams still missing each explicit starter slot — observed counts, not model probabilities.
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {needs.map(need => (
                <li
                  className={`${styles.row} ${positionClass(need.position === "FLEX" ? "TE" : need.position)} flex min-w-[5.25rem] items-center justify-between border border-slate-600 bg-slate-800 px-2 text-xs`}
                  key={need.id}
                  title={need.description}
                >
                  <span className="font-semibold">{need.label}</span>
                  <span>{need.teamsMissing} missing</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </aside>
  )
}

export default DraftDock
