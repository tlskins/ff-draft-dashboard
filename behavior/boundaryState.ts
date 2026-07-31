/**
 * Small, UI-facing states for boundaries that must not affect local drafting.
 *
 * These are deliberately separate from selector health and transport protocol
 * details. A connection may be stale while selectors are healthy, and an API
 * sync may fail while the in-memory draft is still fully usable.
 */

export type DraftCaptureConnectionState =
  | "disconnected"
  | "live"
  | "stale"

export type DraftSourceHealthFreshness = "unknown" | "fresh" | "stale"

export type DraftPersistenceState =
  | "local"
  | "syncing"
  | "offline"
  | "recovered"
  | "blocked"

export interface DraftPersistenceBoundary {
  state: DraftPersistenceState
  pendingEventCount: number
  error: string | null
  canRetry: boolean
}

export type RealtimeAdviceBoundaryState =
  | "realtime"
  | "reconnecting"
  | "deterministic-fallback"

export const getRealtimeAdviceBoundaryState = (
  status: "disconnected" | "connecting" | "reconnecting" | "connected",
): RealtimeAdviceBoundaryState => {
  if (status === "connected") return "realtime"
  if (status === "connecting" || status === "reconnecting") {
    return "reconnecting"
  }
  return "deterministic-fallback"
}
