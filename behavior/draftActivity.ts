export type DraftActivityTone = "neutral" | "positive" | "warning"

export interface DraftActivityItem {
  id: string
  label: string
  detail?: string
  tone: DraftActivityTone
  occurredAt: number
}

export const appendDraftActivity = (
  current: DraftActivityItem[],
  additions: DraftActivityItem[],
  limit = 8,
): DraftActivityItem[] => {
  const byId = new Map(current.map(item => [item.id, item]))
  additions.forEach(item => {
    // Repeated deterministic alerts are still new observations. Reinsert the
    // key so the ticker and center banner treat the changed event as latest.
    byId.delete(item.id)
    byId.set(item.id, item)
  })
  return Array.from(byId.values()).slice(-limit)
}
