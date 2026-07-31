import React, {
  FormEvent,
  useState,
} from "react"

import type {
  RealtimeChatMessage,
} from "../behavior/hooks/useRealtimeConversation"
import type {
  RealtimeMode,
} from "../behavior/realtime/contracts"
import type {
  RealtimeTransportStatus,
} from "../behavior/realtime/transport"

interface RealtimeTextAdvisorProps {
  status: RealtimeTransportStatus
  messages: RealtimeChatMessage[]
  error: string | null
  isResponding: boolean
  reconnectAttempt: number
  autoAdviceEnabled: boolean
  mode: RealtimeMode
  microphoneEnabled: boolean
  isUserSpeaking: boolean
  onConnect: () => Promise<void>
  onDisconnect: () => void
  onCancelResponse: () => boolean
  onSetAutoAdviceEnabled: (enabled: boolean) => void
  onSetMode: (mode: RealtimeMode) => boolean
  onSetMicrophoneEnabled: (enabled: boolean) => boolean
  onSendText: (text: string) => boolean
}

const QUICK_PROMPTS = [
  "What should I focus on before my next pick?",
  "Compare my three current recommendations.",
  "Is a positional run likely before I pick?",
]

const statusLabel: Record<RealtimeTransportStatus, string> = {
  disconnected: "Model offline",
  connecting: "Connecting",
  reconnecting: "Reconnecting",
  connected: "Live",
}

const RealtimeTextAdvisor: React.FC<RealtimeTextAdvisorProps> = ({
  status,
  messages,
  error,
  isResponding,
  reconnectAttempt,
  autoAdviceEnabled,
  mode,
  microphoneEnabled,
  isUserSpeaking,
  onConnect,
  onDisconnect,
  onCancelResponse,
  onSetAutoAdviceEnabled,
  onSetMode,
  onSetMicrophoneEnabled,
  onSendText,
}) => {
  const [draft, setDraft] = useState("")
  const connected = status === "connected"
  const deterministicFallback = status === "disconnected"
    || status === "connecting"
    || status === "reconnecting"

  const send = (value: string) => {
    if (onSendText(value)) setDraft("")
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    send(draft)
  }

  return (
    <section
      aria-label="Realtime draft analysis"
      className="mt-3 rounded-lg border border-sky-200 bg-sky-50 p-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-800">
            GPT Realtime · {mode}
          </p>
          <p className="text-xs text-sky-950">
            Natural-language analysis grounded in Drafty’s calculations.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {mode === "voice" && connected && (
            <span
              aria-live="polite"
              className={`rounded-full px-2 py-1 text-xs font-semibold ${
                isUserSpeaking
                  ? "bg-amber-100 text-amber-900"
                  : isResponding
                    ? "bg-violet-100 text-violet-800"
                    : microphoneEnabled
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-slate-100 text-slate-600"
              }`}
            >
              {isUserSpeaking
                ? "Listening"
                : isResponding
                  ? "Drafty speaking"
                  : microphoneEnabled
                    ? "Mic ready"
                    : "Muted"}
            </span>
          )}
          <span
            aria-live="polite"
            role="status"
            className={`rounded-full px-2 py-1 text-xs font-semibold ${
              connected
                ? "bg-emerald-100 text-emerald-800"
                : "bg-white text-slate-600"
            }`}
          >
            {statusLabel[status]}
            {status === "reconnecting" && reconnectAttempt > 0
              ? ` ${reconnectAttempt}/3`
              : ""}
          </span>
          {isResponding && connected && (
            <button
              className="rounded border border-rose-300 bg-white px-2 py-1 text-xs font-semibold text-rose-700"
              onClick={onCancelResponse}
              type="button"
            >
              Stop response
            </button>
          )}
          {mode === "voice" && connected && (
            <button
              aria-pressed={!microphoneEnabled}
              className="rounded border border-sky-300 bg-white px-2 py-1 text-xs font-semibold text-sky-800"
              onClick={() =>
                onSetMicrophoneEnabled(!microphoneEnabled)}
              type="button"
            >
              {microphoneEnabled ? "Mute microphone" : "Unmute microphone"}
            </button>
          )}
          {status === "disconnected" ? (
            <button
              className="rounded bg-sky-700 px-2 py-1 text-xs font-semibold text-white disabled:cursor-wait disabled:bg-sky-400"
              onClick={() => void onConnect()}
              type="button"
            >
              {error ? "Retry Realtime" : "Connect"}
            </button>
          ) : (
            <button
              className="rounded border border-sky-300 bg-white px-2 py-1 text-xs font-semibold text-sky-800"
              onClick={onDisconnect}
              type="button"
            >
              Disconnect
            </button>
          )}
        </div>
      </div>

      <div
        aria-label="Realtime input mode"
        className="mt-2 inline-flex rounded border border-sky-200 bg-white p-0.5"
        role="group"
      >
        {(["text", "voice"] as RealtimeMode[]).map(option => (
          <button
            aria-pressed={mode === option}
            className={`rounded px-3 py-1 text-xs font-semibold ${
              mode === option
                ? "bg-sky-700 text-white"
                : "text-sky-800"
            } disabled:cursor-not-allowed disabled:opacity-60`}
            disabled={status !== "disconnected"}
            key={option}
            onClick={() => onSetMode(option)}
            type="button"
          >
            {option === "text" ? "Text" : "Voice"}
          </button>
        ))}
      </div>

      {mode === "voice" && status === "disconnected" && (
        <p className="mt-2 text-xs text-sky-800">
          Connecting will ask for microphone permission. Audio stays in
          the WebRTC session and the typed box remains available.
        </p>
      )}

      {deterministicFallback && (
        <p aria-live="polite" className="mt-2 text-xs text-sky-950" role="status">
          {status === "reconnecting"
            ? "GPT Realtime is reconnecting. Deterministic recommendations remain active."
            : status === "connecting"
              ? "GPT Realtime is connecting. Deterministic recommendations remain active."
              : error
                ? "GPT Realtime is unavailable. Deterministic recommendations remain active; retry when you want natural-language analysis."
                : "GPT Realtime is not connected. Deterministic recommendations remain active; connect when you want natural-language analysis."}
        </p>
      )}

      <label className="mt-2 flex items-center gap-2 text-xs text-sky-900">
        <input
          checked={autoAdviceEnabled}
          disabled={status === "disconnected"}
          onChange={event =>
            onSetAutoAdviceEnabled(event.target.checked)}
          type="checkbox"
        />
        Auto-advice for material pick, tier, and positional-run changes
      </label>

      {error && (
        <p
          className="mt-2 rounded border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-800"
          role="alert"
        >
          {error}
        </p>
      )}

      {messages.length > 0 && (
        <ol
          aria-label="Realtime conversation"
          aria-live="polite"
          aria-relevant="additions"
          className="mt-2 max-h-52 space-y-2 overflow-y-auto rounded border border-sky-100 bg-white p-2"
        >
          {messages.slice(-12).map(message => (
            <li
              className={
                message.role === "user"
                  ? "ml-6 rounded bg-sky-100 px-2 py-1 text-sm text-sky-950"
                  : message.role === "event"
                    ? "rounded border border-amber-200 bg-amber-50 px-2 py-1 text-sm text-amber-950"
                  : "mr-6 rounded bg-slate-100 px-2 py-1 text-sm text-slate-900"
              }
              key={message.id}
            >
              <span className="mr-1 text-xs font-semibold uppercase text-slate-500">
                {message.role === "user"
                  ? "You"
                  : message.role === "event"
                    ? "Draft update"
                    : "Drafty"}
              </span>
              {message.text}
              {message.streaming && (
                <span aria-label="Responding" className="ml-1 animate-pulse">
                  ▍
                </span>
              )}
              {message.interrupted && (
                <span className="ml-1 text-xs italic text-slate-500">
                  stopped
                </span>
              )}
            </li>
          ))}
        </ol>
      )}

      {connected && messages.length === 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {QUICK_PROMPTS.map(prompt => (
            <button
              className="rounded-full border border-sky-200 bg-white px-2 py-1 text-xs text-sky-900 hover:bg-sky-100"
              key={prompt}
              onClick={() => send(prompt)}
              type="button"
            >
              {prompt}
            </button>
          ))}
        </div>
      )}

      <form className="mt-2 flex gap-2" onSubmit={onSubmit}>
        <label className="sr-only" htmlFor="realtime-draft-question">
          Ask Drafty about the draft
        </label>
        <input
          className="min-w-0 flex-1 rounded border border-sky-200 bg-white px-2 py-2 text-sm text-slate-950 disabled:bg-slate-100"
          disabled={!connected}
          id="realtime-draft-question"
          maxLength={1000}
          onChange={event => setDraft(event.target.value)}
          placeholder={
            connected
              ? mode === "voice"
                ? "Type a fallback question; Drafty will answer aloud…"
                : "Ask about tiers, runs, needs, or player comparisons…"
              : `Connect to start a ${mode} session`
          }
          type="text"
          value={draft}
        />
        <button
          className="rounded bg-sky-700 px-3 py-2 text-sm font-semibold text-white disabled:bg-slate-300"
          disabled={!connected || !draft.trim()}
          type="submit"
        >
          Send
        </button>
      </form>

      <p className="mt-2 text-xs text-sky-800">
        Auto-advice is cooldown-limited. Speaking interrupts voice playback.
        View and draft-plan changes require confirmation.
      </p>
    </section>
  )
}

export default RealtimeTextAdvisor
