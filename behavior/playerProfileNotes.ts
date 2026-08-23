import type {PlayerProfileNote} from "../types"


export const HARRIS_PROFILE_NOTE_SOURCE = "harris_football_podcast"
export const JOSH_HAYDEN_PROFILE_NOTE_SOURCE = "yahoo_josh_hayden_youtube"

export const profileNoteAnalysts = (note: PlayerProfileNote): string[] => Array.from(
  new Set(note.speakers.flatMap(speaker => speaker
    .replace(/^Consensus:\s*/i, "")
    .split(/\s+\+\s+/)
    .map(value => value.trim())
    .filter(Boolean))),
)

export const profileNoteAnalystOptions = (
  notes: PlayerProfileNote[] | null | undefined,
): Array<{name: string; noteCount: number}> => {
  const noteIdsByAnalyst = new Map<string, Set<string>>()
  ;(notes || []).forEach(note => profileNoteAnalysts(note).forEach(name => {
    const noteIds = noteIdsByAnalyst.get(name) || new Set<string>()
    noteIds.add(note.noteId)
    noteIdsByAnalyst.set(name, noteIds)
  }))
  return Array.from(noteIdsByAnalyst, ([name, noteIds]) => ({name, noteCount: noteIds.size}))
    .sort((left, right) => right.noteCount - left.noteCount || left.name.localeCompare(right.name))
}

export const profileNotes = (
  notes: PlayerProfileNote[] | null | undefined,
  excludedAnalysts: ReadonlySet<string> = new Set(),
): PlayerProfileNote[] => (notes || [])
  .filter(note => {
    const analysts = profileNoteAnalysts(note)
    return analysts.length === 0 || analysts.some(analyst => !excludedAnalysts.has(analyst))
  })
  .filter(note => !Number.isNaN(Date.parse(note.publishedAt)))
  .sort((left, right) => (
    Date.parse(right.publishedAt) - Date.parse(left.publishedAt)
    || right.noteId.localeCompare(left.noteId)
  ))

export const groupProfileNotes = (
  notes: PlayerProfileNote[] | null | undefined,
): Record<PlayerProfileNote["category"], PlayerProfileNote[]> => {
  const grouped: Record<PlayerProfileNote["category"], PlayerProfileNote[]> = {
    good: [],
    bad: [],
    watch: [],
  }
  profileNotes(notes).forEach(note => grouped[note.category].push(note))
  return grouped
}

export const harrisProfileNotes = (
  notes: PlayerProfileNote[] | null | undefined,
): PlayerProfileNote[] => profileNotes(notes)
  .filter(note => note.source === HARRIS_PROFILE_NOTE_SOURCE)

export const groupHarrisProfileNotes = (
  notes: PlayerProfileNote[] | null | undefined,
): Record<PlayerProfileNote["category"], PlayerProfileNote[]> => groupProfileNotes(
  harrisProfileNotes(notes),
)

export const profileNoteDateLabel = (value: string): string => new Date(value)
  .toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
