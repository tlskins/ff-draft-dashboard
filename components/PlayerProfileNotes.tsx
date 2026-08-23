import React from "react"

import {
  groupHarrisProfileNotes,
  harrisProfileNotes,
  profileNoteDateLabel,
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
  notes?: PlayerProfileNote[] | null
  playerName: string
}> = ({notes, playerName}) => {
  const ordered = harrisProfileNotes(notes)
  const grouped = groupHarrisProfileNotes(ordered)
  const directionalGroupCount = Number(grouped.good.length > 0)
    + Number(grouped.bad.length > 0)
  return (
    <section aria-label={`${playerName} Harris Football notes`} className={styles.profileHarrisNotes}>
      <header>
        <span>Harris Football notes</span>
        <small>{ordered.length > 0
          ? `${ordered.length} matched note${ordered.length === 1 ? "" : "s"} · newest first`
          : "No matched notes"}</small>
      </header>
      {ordered.length === 0 ? (
        <p className={styles.profileOutlookUnavailable}>
          No Harris player or team notes are matched to this profile yet.
        </p>
      ) : (
        <div
          className={styles.profileHarrisNoteGroups}
          data-directional-groups={directionalGroupCount}
        >
          {GROUPS.filter(group => grouped[group.category].length > 0).map(group => (
            <section
              aria-label={`${group.label} Harris notes`}
              className={styles.profileHarrisNoteGroup}
              data-category={group.category}
              key={group.category}
            >
              <h4>{group.label}<span>{grouped[group.category].length}</span></h4>
              <ul>
                {grouped[group.category].map(note => (
                  <li key={note.noteId}>
                    <p>{note.summary}</p>
                    {note.practicalImplication && (
                      <small className={styles.profileHarrisAction}>
                        {note.practicalImplication}
                      </small>
                    )}
                    <footer>
                      <time dateTime={note.publishedAt}>{profileNoteDateLabel(note.publishedAt)}</time>
                      <span>{note.scope === "team" ? `team: ${note.subject}` : note.actionType.replaceAll("_", " ")}</span>
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
