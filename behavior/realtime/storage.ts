import type { DraftPlanDocument } from "./contracts"

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export const draftPlanStorageKey = (
  draftSessionId: string,
): string => `drafty:draft-plan:v1:${draftSessionId}`

const isDraftPlanDocument = (
  value: unknown,
  draftSessionId: string,
): value is DraftPlanDocument => {
  if (!value || typeof value !== "object") return false
  const document = value as Partial<DraftPlanDocument>
  return (
    document.schema_version === 1
    && document.draft_session_id === draftSessionId
    && typeof document.revision === "number"
    && typeof document.updated_at === "string"
    && Array.isArray(document.entries)
    && document.entries.every(entry => (
      entry
      && typeof entry.id === "string"
      && typeof entry.proposal_id === "string"
      && typeof entry.text === "string"
      && typeof entry.source_event_count === "number"
      && typeof entry.created_at === "string"
    ))
  )
}

export const loadDraftPlan = (
  draftSessionId: string,
  storage: StorageLike,
): DraftPlanDocument | null => {
  const serialized = storage.getItem(draftPlanStorageKey(draftSessionId))
  if (!serialized) return null
  try {
    const parsed: unknown = JSON.parse(serialized)
    return isDraftPlanDocument(parsed, draftSessionId) ? parsed : null
  } catch {
    return null
  }
}

export const saveDraftPlan = (
  document: DraftPlanDocument,
  storage: StorageLike,
): void => {
  storage.setItem(
    draftPlanStorageKey(document.draft_session_id),
    JSON.stringify(document),
  )
}
