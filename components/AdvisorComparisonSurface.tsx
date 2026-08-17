import React, {useEffect, useMemo, useState} from "react"

import type {
  AdvisorComparisonController,
} from "../behavior/hooks/useAdvisorComparisonController"
import type {Player} from "../types"
import styles from "./DraftDesk.module.css"

interface AdvisorComparisonSurfaceProps {
  controller: AdvisorComparisonController
  availablePlayers: Player[]
}

const AdvisorComparisonSurface = ({
  controller,
  availablePlayers,
}: AdvisorComparisonSurfaceProps) => {
  const addable = useMemo(() => availablePlayers
    .filter(player => player.id?.trim() && player.fullName?.trim())
    .filter(player => ["QB", "RB", "WR", "TE"].includes(player.position))
    .filter(player => !controller.items.some(item => item.player.id === player.id))
    .sort((left, right) => left.fullName.localeCompare(right.fullName)), [
    availablePlayers,
    controller.items,
  ])
  const [selectedId, setSelectedId] = useState("")
  useEffect(() => {
    if (!addable.some(player => player.id === selectedId)) {
      setSelectedId(addable[0]?.id || "")
    }
  }, [addable, selectedId])

  return (
    <section aria-label="Advisor comparison set" className={styles.comparisonSet}>
      <header className={styles.comparisonSetHeader}>
        <div>
          <strong>Players in play</strong>
          <span>Advisor-owned · maximum 3</span>
        </div>
        <div aria-label="Comparison set mode" className={styles.modeToggle} role="group">
          <button
            aria-pressed={controller.mode === "auto"}
            onClick={controller.restoreAuto}
            type="button"
          >Auto</button>
          <button
            aria-pressed={controller.mode === "pinned"}
            onClick={controller.pinCurrent}
            type="button"
          >Pinned</button>
        </div>
      </header>
      {controller.items.length > 0 ? (
        <ol className={styles.comparisonSetList}>
          {controller.items.map(item => (
            <li className={styles.comparisonSetItem} key={item.player.id}>
              <span className={styles[`position${item.player.position}`]} aria-hidden="true" />
              <div>
                <strong>{item.player.fullName}</strong>
                <span>{item.player.position} · {item.player.team}</span>
              </div>
              <small>{item.reasonLabel}</small>
              {controller.mode === "pinned" && (
                <button
                  aria-label={`Unpin ${item.player.fullName}`}
                  className={styles.focusRing}
                  onClick={() => controller.removePinnedPlayer(item.player.id)}
                  type="button"
                >×</button>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <p className={styles.comparisonSetEmpty}>No valid available comparison players.</p>
      )}
      {controller.mode === "pinned" && (
        <div className={styles.comparisonSetAdd}>
          <label htmlFor="advisor-comparison-add">Add player</label>
          <select
            disabled={addable.length === 0 || controller.items.length >= 3}
            id="advisor-comparison-add"
            onChange={event => setSelectedId(event.target.value)}
            value={selectedId}
          >
            {addable.map(player => (
              <option key={player.id} value={player.id}>{player.fullName}</option>
            ))}
          </select>
          <button
            disabled={!selectedId || controller.items.length >= 3}
            onClick={() => {
              const player = addable.find(candidate => candidate.id === selectedId)
              if (player) controller.addPinnedPlayer(player)
            }}
            type="button"
          >Add</button>
        </div>
      )}
      <div
        aria-atomic="true"
        aria-live="polite"
        className="sr-only"
        data-testid="advisor-comparison-live-region"
        role="status"
      >{controller.announcement}</div>
    </section>
  )
}

export default AdvisorComparisonSurface
