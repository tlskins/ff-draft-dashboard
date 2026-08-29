import type {DraftyAuthControls} from "../behavior/hooks/useDraftyAuth"
import type {CloudProfileSyncControls} from "../behavior/hooks/useCloudProfileSync"


interface CloudProfileControlProps {
  auth: DraftyAuthControls
  sync: CloudProfileSyncControls
  compact?: boolean
}

const statusCopy = (
  auth: DraftyAuthControls,
  sync: CloudProfileSyncControls,
): string => {
  if (!auth.configured) return "Cloud profile unavailable"
  if (auth.state === "loading") return "Checking Google sign-in…"
  if (!auth.user) return "Ranks and targets stay on this device"
  if (sync.state === "syncing") return "Syncing ranks and targets…"
  if (sync.state === "synced") return "Ranks and targets synced"
  if (sync.state === "conflict") return "Choose which profile to keep"
  if (sync.state === "offline") return "Offline · local edits are safe"
  if (sync.state === "error") return "Cloud sync needs attention"
  return "Preparing cloud profile…"
}

const CloudProfileControl = ({auth, sync, compact = false}: CloudProfileControlProps) => {
  if (!auth.enabled) return null
  const signedIn = Boolean(auth.user)
  return (
    <section
      aria-label="Cross-device profile"
      className={compact
        ? "rounded border border-slate-300 bg-white px-2 py-1 text-left text-xs shadow-md"
        : "rounded border border-slate-600 bg-slate-800 p-3 text-left text-sm"}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <strong className={compact ? "text-slate-800" : "text-slate-100"}>
            {signedIn ? "Cloud profile" : "Use on phone and desktop"}
          </strong>
          {!compact && auth.user?.email && (
            <p className="truncate text-xs text-slate-400">{auth.user.email}</p>
          )}
        </div>
        {signedIn ? (
          <button
            className={compact
              ? "rounded border border-slate-300 px-2 py-1 font-semibold text-slate-700"
              : "rounded border border-slate-500 px-2 py-1 text-xs font-semibold text-slate-200 hover:bg-slate-700"}
            onClick={() => void auth.signOut().catch(() => undefined)}
            type="button"
          >
            Sign out
          </button>
        ) : (
          <button
            className={compact
              ? "rounded bg-blue-700 px-2 py-1 font-semibold text-white"
              : "rounded bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-400"}
            disabled={auth.state === "loading" || !auth.configured}
            onClick={() => void auth.signIn().catch(() => undefined)}
            type="button"
          >
            Sign in with Google
          </button>
        )}
      </div>
      <p
        className={`mt-1 ${compact ? "text-slate-600" : "text-slate-400"}`}
        role="status"
      >
        {statusCopy(auth, sync)}
      </p>
      {(auth.error || sync.error) && !compact && (
        <p className="mt-1 text-xs text-amber-300">{sync.error || auth.error}</p>
      )}
      {signedIn && sync.state === "conflict" && (
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            className={`rounded border px-2 py-1 text-xs font-semibold ${compact
              ? "border-slate-400 text-slate-700"
              : "border-slate-400 text-slate-100"}`}
            onClick={() => void sync.useCloudCopy()}
            type="button"
          >
            Use cloud copy
          </button>
          <button
            className={`rounded border border-amber-500 px-2 py-1 text-xs font-semibold ${compact
              ? "text-amber-800"
              : "text-amber-200"}`}
            onClick={() => void sync.keepThisDevice().catch(() => undefined)}
            type="button"
          >
            Keep this device
          </button>
        </div>
      )}
      {signedIn && ["offline", "error"].includes(sync.state) && !compact && (
        <button
          className="mt-2 rounded border border-slate-500 px-2 py-1 text-xs font-semibold"
          onClick={sync.retry}
          type="button"
        >
          Retry sync
        </button>
      )}
    </section>
  )
}

export default CloudProfileControl
