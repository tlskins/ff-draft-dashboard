import React, {useMemo, useState} from "react"

import {
  groupProfileNotes,
  profileNoteAnalystOptions,
  profileNoteAnalysts,
  profileNoteDateLabel,
  profileNotes,
} from "../behavior/playerProfileNotes"
import type {PlayerProfileNote} from "../types"
import styles from "./DraftDesk.module.css"


const GROUPS: Array<{
  category: PlayerProfileNote["category"]
  label: string
}> = [
  {category: "good", label: "Good"},
  {category: "bad", label: "Bad / risk"},
  {category: "watch", label: "Mixed / watch"},
]

const PlayerProfileNotes: React.FC<{
  allNotes?: PlayerProfileNote[] | null
  notes?: PlayerProfileNote[] | null
  playerName: string
}> = ({allNotes, notes, playerName}) => {
  const [excludedAnalysts, setExcludedAnalysts] = useState<Set<string>>(new Set())
  const analystOptions = useMemo(
    () => profileNoteAnalystOptions(allNotes || notes),
    [allNotes, notes],
  )
  const allOrdered = profileNotes(notes)
  const ordered = profileNotes(notes, excludedAnalysts)
  const grouped = groupProfileNotes(ordered)
  const directionalGroupCount = Number(grouped.good.length > 0)
    + Number(grouped.bad.length > 0)
  const selectedAnalystCount = analystOptions.filter(
    option => !excludedAnalysts.has(option.name),
  ).length
  const toggleAnalyst = (analyst: string, included: boolean) => {
    setExcludedAnalysts(current => {
      const next = new Set(current)
      if (included) next.delete(analyst)
      else next.add(analyst)
      return next
    })
  }
  return (
    <section aria-label={`${playerName} analyst notes`} className={styles.profileAnalystNotes}>
      <header>
        <span>Analyst notes</span>
        <small>{allOrdered.length > 0
          ? `${ordered.length} of ${allOrdered.length} note${allOrdered.length === 1 ? "" : "s"} · newest first`
          : "No matched notes"}</small>
      </header>
      {allOrdered.length > 0 && analystOptions.length > 1 && (
        <details className={styles.profileAnalystFilter}>
          <summary>
            Analysts
            <span>{selectedAnalystCount} / {analystOptions.length}</span>
          </summary>
          <div aria-label="Filter player notes by analyst" role="group">
            <button onClick={() => setExcludedAnalysts(new Set())} type="button">
              Select all
            </button>
            {analystOptions.map(option => (
              <label key={option.name}>
                <input
                  checked={!excludedAnalysts.has(option.name)}
                  onChange={event => toggleAnalyst(option.name, event.target.checked)}
                  type="checkbox"
                />
                <span>{option.name}</span>
                <small>{option.noteCount}</small>
              </label>
            ))}
          </div>
        </details>
      )}
      {ordered.length === 0 ? (
        <p className={styles.profileOutlookUnavailable}>
          {allOrdered.length > 0
            ? "No notes match the selected analysts."
            : "No analyst player or team notes are matched to this profile yet."}
        </p>
      ) : (
        <div
          className={styles.profileAnalystNoteGroups}
          data-directional-groups={directionalGroupCount}
        >
          {GROUPS.filter(group => grouped[group.category].length > 0).map(group => (
            <section
              aria-label={`${group.label} analyst notes`}
              className={styles.profileAnalystNoteGroup}
              data-category={group.category}
              key={group.category}
            >
              <h4>{group.label}<span>{grouped[group.category].length}</span></h4>
              <ul>
                {grouped[group.category].map(note => (
                  <li key={note.noteId}>
                    <p>{note.summary}</p>
                    {note.practicalImplication && (
                      <small className={styles.profileAnalystAction}>
                        {note.practicalImplication}
                      </small>
                    )}
                    <footer>
                      <time dateTime={note.publishedAt}>{profileNoteDateLabel(note.publishedAt)}</time>
                      <span>{note.scope === "team" ? `team: ${note.subject}` : note.actionType.replaceAll("_", " ")}</span>
                      <span>{note.sourceLabel} · {profileNoteAnalysts(note).join(", ")}</span>
                      <a href={note.sourceUrl} rel="noreferrer" target="_blank">
                        {note.episodeTitle}
                      </a>
                    </footer>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </section>
  )
}

export default PlayerProfileNotes
