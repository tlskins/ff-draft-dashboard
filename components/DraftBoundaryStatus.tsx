import type {
  DraftCaptureConnectionState,
  DraftPersistenceBoundary,
} from "../behavior/boundaryState"

interface DraftCaptureStatusProps {
  state: DraftCaptureConnectionState
  activeDraftTitle: string | null
}

export const DraftCaptureStatus = ({
  state,
  activeDraftTitle,
}: DraftCaptureStatusProps) => {
  const selectedDraft = activeDraftTitle
    ? ` Draft ${activeDraftTitle} remains selected; the local board is preserved.`
    : ""
  const message = state === "live"
    ? activeDraftTitle
      ? `Listening to: ${activeDraftTitle}`
      : "Extension connected — choose a draft to begin listening."
    : state === "stale"
      ? `Extension capture is stale — waiting for a fresh update.${selectedDraft}`
      : `Extension capture disconnected — open or refresh the ESPN draft tab.${selectedDraft}`

  return (
    <p
      aria-live="polite"
      className={`font-semibold shadow rounded-md text-sm my-1 px-4 ${
        state === "live" && activeDraftTitle
          ? "bg-green-300"
          : state === "live"
            ? "bg-yellow-300"
            : state === "stale"
              ? "bg-amber-200"
              : "bg-gray-300"
      }`}
      role="status"
    >
      {message}
    </p>
  )
}

interface DraftPersistenceStatusProps {
  persistence: DraftPersistenceBoundary
  onRetry: () => void
}

export const DraftPersistenceStatus = ({
  persistence,
  onRetry,
}: DraftPersistenceStatusProps) => {
  if (persistence.state === "local") return null

  const queued = persistence.pendingEventCount
  const message = persistence.state === "syncing"
    ? `Syncing ${queued} locally captured ${queued === 1 ? "pick" : "picks"} to the draft API…`
    : persistence.state === "recovered"
      ? "Draft API sync restored."
      : persistence.state === "blocked"
        ? "Draft API sync queue is full. The local draft and deterministic recommendations are still safe in this browser."
        : `Draft API sync is offline. ${queued} locally captured ${queued === 1 ? "pick is" : "picks are"} queued; the local draft and deterministic recommendations are still safe in this browser.`

  return (
    <div
      aria-live="polite"
      className={`my-1 flex flex-wrap items-center justify-center gap-2 rounded-md px-4 py-1 text-sm font-semibold shadow ${
        persistence.state === "offline" || persistence.state === "blocked"
          ? "bg-amber-200 text-amber-950"
          : "bg-sky-100 text-sky-950"
      }`}
      role="status"
      title={persistence.error || undefined}
    >
      <span>{message}</span>
      {persistence.canRetry && (
        <button
          className="rounded border border-current bg-white px-2 py-0.5 text-xs font-semibold"
          onClick={onRetry}
          type="button"
        >
          Retry sync
        </button>
      )}
    </div>
  )
}
