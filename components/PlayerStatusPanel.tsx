import React from "react"

import {
  currentPlayerStatus,
  PlayerStatusEvent,
  playerStatusSourceLabel,
} from "../behavior/api/playerStatus"
import type {
  PlayerStatusCacheEntry,
} from "../behavior/api/playerStatusCache"


interface PlayerStatusPanelProps {
  playerId: string | null
  playerName?: string
  status?: PlayerStatusCacheEntry
}

const timestampLabel = (value: string): string =>
  value.replace("T", " ").replace(":00Z", " UTC")

const impactStyle: Record<
  PlayerStatusEvent["recommendation_impact"],
  string
> = {
  none: "bg-emerald-100 text-emerald-800",
  review: "bg-amber-100 text-amber-900",
  material: "bg-rose-100 text-rose-800",
}

const PlayerStatusPanel: React.FC<PlayerStatusPanelProps> = ({
  playerId,
  playerName,
  status,
}) => {
  const loading = playerId && (!status || status.state === "loading")
  const unavailable = status?.state === "unavailable"
  const events = currentPlayerStatus(status?.response?.events || [])
  const summary = status?.response?.summary

  return (
    <section
      aria-label="Player status"
      className="w-full px-4 py-2 text-left text-sm"
    >
      <p className="py-2 font-semibold underline">
        {playerName ? `${playerName} Status` : "Player Status"}
      </p>
      {summary?.text && (
        <aside
          aria-label="Structured player status summary"
          className="mb-2 rounded border border-sky-200 bg-sky-50 p-2"
        >
          <p className="text-xs text-sky-950">
            {summary.text}
          </p>
          <p className="mt-1 text-xs text-sky-700">
            {summary.method === "openai"
              ? "AI summary from structured events only"
              : "Deterministic structured summary"}
            {summary.model ? ` · ${summary.model}` : ""}
            {summary.generated_at && (
              <>
                {" · "}
                <time dateTime={summary.generated_at}>
                  generated {timestampLabel(summary.generated_at)}
                </time>
              </>
            )}
          </p>
        </aside>
      )}
      {!playerId && (
        <p className="font-semibold">
          Hover on a player to view structured status...
        </p>
      )}
      {playerId && loading && (
        <p className="text-xs text-slate-500" role="status">
          Loading structured status…
        </p>
      )}
      {playerId && !loading && unavailable && (
        <p className="text-xs text-slate-500">
          Status provider unavailable. Rankings and drafting are unaffected.
        </p>
      )}
      {playerId
        && !loading
        && !unavailable
        && events.length === 0
        && (
          <p className="text-xs text-slate-500">
            No structured status updates.
          </p>
        )}
      {events.length > 0 && (
        <ol className="space-y-2">
          {events.slice(0, 4).map(event => (
            <li
              className="rounded border border-slate-200 bg-white p-2"
              key={event.id}
            >
              <div className="flex flex-wrap items-center gap-1">
                <span className="font-semibold capitalize">
                  {event.type.replace(/_/g, " ")}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    impactStyle[event.recommendation_impact]
                  }`}
                >
                  {event.recommendation_impact}
                </span>
                {event.stale && (
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">
                    stale
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-800">
                {event.short_summary}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {event.source_url ? (
                  <a
                    className="underline"
                    href={event.source_url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {playerStatusSourceLabel(event.source)}
                  </a>
                ) : (
                  playerStatusSourceLabel(event.source)
                )}
                {" · "}
                {(event.confidence * 100).toFixed(0)}% confidence
                {" · "}
                {event.source_published_at && (
                  <>
                    <time dateTime={event.source_published_at}>
                      published {
                        timestampLabel(event.source_published_at)
                      }
                    </time>
                    {" · "}
                  </>
                )}
                <time dateTime={event.fetched_at}>
                  fetched {timestampLabel(event.fetched_at)}
                </time>
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

export default PlayerStatusPanel
