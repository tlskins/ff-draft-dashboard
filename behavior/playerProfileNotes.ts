import type {PlayerProfileNote} from "../types"


export const HARRIS_PROFILE_NOTE_SOURCE = "harris_football_podcast"

export const harrisProfileNotes = (
  notes: PlayerProfileNote[] | null | undefined,
): PlayerProfileNote[] => (notes || [])
  .filter(note => note.source === HARRIS_PROFILE_NOTE_SOURCE)
  .filter(note => !Number.isNaN(Date.parse(note.publishedAt)))
  .sort((left, right) => (
    Date.parse(right.publishedAt) - Date.parse(left.publishedAt)
    || right.noteId.localeCompare(left.noteId)
  ))

export const groupHarrisProfileNotes = (
  notes: PlayerProfileNote[] | null | undefined,
): Record<PlayerProfileNote["category"], PlayerProfileNote[]> => {
  const grouped: Record<PlayerProfileNote["category"], PlayerProfileNote[]> = {
    good: [],
    bad: [],
    watch: [],
  }
  harrisProfileNotes(notes).forEach(note => grouped[note.category].push(note))
  return grouped
}

export const profileNoteDateLabel = (value: string): string => new Date(value)
  .toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
