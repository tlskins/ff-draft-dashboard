import React from "react"

import type {PlanConstraintsPresentationModel} from "../../behavior/insights/planConstraints"
import styles from "./PlanConstraintsSurface.module.css"

interface PlanConstraintsSurfaceProps {
  model: PlanConstraintsPresentationModel
}

const stateLabel = (state: "ready" | "empty" | "unavailable"): string => (
  state === "ready" ? "Current" : state === "empty" ? "Empty" : "Unavailable"
)

const stateClass = (state: "ready" | "empty" | "unavailable"): string => (
  `${styles.status} ${state === "empty"
    ? styles.emptyStatus
    : state === "unavailable" ? styles.unavailableStatus : ""}`
)

const PlanConstraintsSurface: React.FC<PlanConstraintsSurfaceProps> = ({model}) => (
  <section aria-label="Plan and roster constraints" className={styles.surface}>
    <header className={styles.header}>
      <div>
        <p className={styles.kicker}>Read-only context</p>
        <h2>Plan & constraints</h2>
      </div>
      <span className={stateClass(model.rosterState)}>{stateLabel(model.rosterState)}</span>
    </header>

    <section className={styles.section} aria-labelledby="plan-constraints-roster-title">
      <div className={styles.sectionHeader}>
        <h3 id="plan-constraints-roster-title">Your starter slots</h3>
        {model.rosterState !== "unavailable" && (
          <span className={styles.metadata}>{model.userSlots.filter(slot => slot.filled).length}/{model.userSlots.length} filled</span>
        )}
      </div>
      {model.rosterUnavailableReason && <p className={styles.note}>{model.rosterUnavailableReason}</p>}
      {model.rosterState !== "unavailable" && <div className={styles.tableWrap}>
        <table aria-label="Your starter slot constraints" className={styles.table}>
          <thead>
            <tr><th scope="col">Slot</th><th scope="col">Observed</th><th scope="col">State</th></tr>
          </thead>
          <tbody>
            {model.userSlots.map(slot => (
              <tr key={slot.id}>
                <th scope="row">{slot.label}</th>
                <td>{slot.observed}</td>
                <td className={slot.filled ? styles.filled : styles.open}>{slot.filled ? "Filled" : "Open"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>}
    </section>

    <section className={styles.section} aria-labelledby="plan-constraints-league-title">
      <div className={styles.sectionHeader}>
        <h3 id="plan-constraints-league-title">Other-team needs</h3>
        <span className={stateClass(model.leagueNeedsState)}>{stateLabel(model.leagueNeedsState)}</span>
      </div>
      {model.leagueNeedsUnavailableReason && <p className={styles.note}>{model.leagueNeedsUnavailableReason}</p>}
      {model.leagueNeedsState === "empty" ? <p className={styles.empty}>No other rosters are available to compare.</p> : model.leagueNeedsState === "ready" ? (
        <div className={styles.tableWrap}>
          <table aria-label="Other-team starter and FLEX needs" className={styles.table}>
            <thead>
              <tr><th scope="col">Slot</th><th scope="col">Teams missing</th></tr>
            </thead>
            <tbody>
              {model.leagueNeeds.map(need => (
                <tr key={need.id}><th scope="row">{need.label}</th><td>{need.teamsMissing}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>

    <section className={styles.section} aria-labelledby="plan-constraints-plan-title">
      <div className={styles.sectionHeader}>
        <h3 id="plan-constraints-plan-title">Confirmed draft plan</h3>
        <span className={stateClass(model.plan.state)}>{stateLabel(model.plan.state)}</span>
      </div>
      {model.plan.revision !== null && <p className={styles.metadata}>Revision {model.plan.revision}</p>}
      {model.plan.unavailableReason && <p className={styles.empty}>{model.plan.unavailableReason}</p>}
      {model.plan.state === "empty" && <p className={styles.empty}>No confirmed plan entries yet.</p>}
      {model.plan.entries.length > 0 && (
        <ol aria-label="Confirmed plan entries" className={styles.planList}>
          {model.plan.entries.map(entry => (
            <li key={entry.id}><span className={styles.entrySource}>P{entry.sourceEventCount + 1} </span>{entry.text}</li>
          ))}
        </ol>
      )}
    </section>
  </section>
)

export default PlanConstraintsSurface
