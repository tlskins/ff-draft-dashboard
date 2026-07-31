import React from "react"
import type {
  DraftRecommendationSet,
} from "../behavior/draft-advisor/recommendations"
import type { Player } from "../types"
import type {
  AdvisorProposal,
  DraftPlanDocument,
} from "../behavior/realtime/contracts"
import type {
  RealtimeChatMessage,
} from "../behavior/hooks/useRealtimeConversation"
import type {
  RealtimeMode,
} from "../behavior/realtime/contracts"
import type {
  RealtimeTransportStatus,
} from "../behavior/realtime/transport"
import {
  playerStatusSourceLabel,
  recommendationPlayerStatusEvidence,
} from "../behavior/api/playerStatus"
import type {
  PlayerStatusCacheSnapshot,
} from "../behavior/api/playerStatusCache"
import DraftPlanPanel from "./DraftPlanPanel"
import RealtimeTextAdvisor from "./RealtimeTextAdvisor"
import type {
  ReplayCaptureStatus,
  ReplayExportPreflight,
} from "../behavior/draft-advisor/replayCaptureStatus"
import { useDialogAccessibility } from "../behavior/hooks/useDialogAccessibility"

interface LiveAdvisorPanelProps {
  recommendations: DraftRecommendationSet
  draftStarted: boolean
  onSelectPlayer: (player: Player) => void
  playerStatus?: PlayerStatusCacheSnapshot
  onExportReplay?: () => void
  onExportRosterOnly?: () => void
  replayCaptureStatus?: ReplayCaptureStatus
  replayExportPreflight?: ReplayExportPreflight
  draftPlan?: DraftPlanDocument | null
  realtimeProposals?: AdvisorProposal[]
  onAcceptProposal?: (proposalId: string) => void
  onRejectProposal?: (proposalId: string) => void
  realtimeStatus?: RealtimeTransportStatus
  realtimeMessages?: RealtimeChatMessage[]
  realtimeError?: string | null
  realtimeIsResponding?: boolean
  realtimeReconnectAttempt?: number
  realtimeAutoAdviceEnabled?: boolean
  realtimeMode?: RealtimeMode
  realtimeMicrophoneEnabled?: boolean
  realtimeIsUserSpeaking?: boolean
  onConnectRealtime?: () => Promise<void>
  onDisconnectRealtime?: () => void
  onCancelRealtimeResponse?: () => boolean
  onSetRealtimeAutoAdviceEnabled?: (enabled: boolean) => void
  onSetRealtimeMode?: (mode: RealtimeMode) => boolean
  onSetRealtimeMicrophoneEnabled?: (enabled: boolean) => boolean
  onSendRealtimeText?: (text: string) => boolean
}

const roleLabel = {
  open_starter: "Starter",
  flex_upgrade: "Flex upgrade",
  bench: "Bench upside",
}

const LiveAdvisorPanel: React.FC<LiveAdvisorPanelProps> = ({
  recommendations,
  draftStarted,
  onSelectPlayer,
  playerStatus = {},
  onExportReplay,
  onExportRosterOnly,
  replayCaptureStatus,
  replayExportPreflight,
  draftPlan,
  realtimeProposals = [],
  onAcceptProposal,
  onRejectProposal,
  realtimeStatus,
  realtimeMessages = [],
  realtimeError = null,
  realtimeIsResponding = false,
  realtimeReconnectAttempt = 0,
  realtimeAutoAdviceEnabled = true,
  realtimeMode = "text",
  realtimeMicrophoneEnabled = false,
  realtimeIsUserSpeaking = false,
  onConnectRealtime,
  onDisconnectRealtime,
  onCancelRealtimeResponse,
  onSetRealtimeAutoAdviceEnabled,
  onSetRealtimeMode,
  onSetRealtimeMicrophoneEnabled,
  onSendRealtimeText,
}) => {
  const [preflightOpen, setPreflightOpen] = React.useState(false)
  const exportButton = React.useRef<HTMLButtonElement>(null)
  const dialogRef = React.useRef<HTMLDivElement>(null)
  const confirmRef = React.useRef<HTMLButtonElement>(null)
  const onDialogKeyDown = useDialogAccessibility({
    active: preflightOpen,
    dialogRef,
    initialFocusRef: confirmRef,
    onClose: () => setPreflightOpen(false),
  })
  if (!draftStarted) return null

  return (
    <section
      aria-label="Deterministic draft advisor"
      className="mb-3 rounded-xl border border-violet-200 bg-violet-50 p-3 text-left shadow-sm"
    >
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">
            Live deterministic advisor · combined opponent model
          </p>
          <p className="text-sm text-violet-950">
            {recommendations.viewExplanation}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-violet-800">
            Next user pick {recommendations.nextUserPick}
          </span>
          {onExportReplay && (
            <button
              className="rounded-full border border-violet-300 bg-white px-2 py-1 text-xs font-semibold text-violet-800 hover:bg-violet-100"
              onClick={event => {
                event.currentTarget.focus()
                setPreflightOpen(true)
              }}
              ref={exportButton}
            >
              Export replay fixture
            </button>
          )}
        </div>
      </div>
      {replayCaptureStatus && (
        <p
          aria-live="polite"
          className="mb-2 text-xs text-violet-900"
          role="status"
        >
          {replayCaptureStatus.message}
          {" "}
          {replayCaptureStatus.observationCount} observation
          {replayCaptureStatus.observationCount === 1 ? "" : "s"}
          {replayCaptureStatus.latestObservedThroughOverallPick !== null
            && `; latest board boundary ${replayCaptureStatus.latestObservedThroughOverallPick}.`}
        </p>
      )}
      {preflightOpen && replayExportPreflight && (
        <div
          aria-label="Replay export preflight"
          aria-modal="true"
          className="mb-3 rounded border border-violet-300 bg-white p-3"
          onKeyDown={onDialogKeyDown}
          ref={dialogRef}
          role="dialog"
          tabIndex={-1}
        >
          <p className="font-semibold">Replay export preflight</p>
          <p className="text-sm">{replayExportPreflight.message}</p>
          <p className="text-xs">
            Board: {replayExportPreflight.totalPlatformPicks}
            {" "}
            {replayExportPreflight.authoritativePlatformBoard
              ? "ESPN platform picks"
              : "recorded picks"}.
            {" "}
            Evidence: {replayExportPreflight.evidencePresent
              ? "present"
              : "not captured"}.
            {" "}
            Labeled picks: {replayExportPreflight.labeledPickCount}; windows:
            {" "}
            {replayExportPreflight.labeledWindowCount}.
          </p>
          <ul aria-label="Replay export checks" className="mt-1 text-xs">
            <li>
              Board complete: {replayExportPreflight.boardComplete ? "yes" : "no"}
            </li>
            <li>
              Authoritative ESPN board:
              {" "}
              {replayExportPreflight.authoritativePlatformBoard ? "yes" : "no"}
            </li>
            <li>
              Campaign evidence ready:
              {" "}
              {replayExportPreflight.campaignEvidenceReady ? "yes" : "no"}
            </li>
            <li>
              Session match: {replayExportPreflight.sessionMatch ? "yes" : "no"};
              {" "}
              target roster match:
              {" "}
              {replayExportPreflight.targetRosterMatch ? "yes" : "no"}
            </li>
            <li>
              Forecast evidence valid:
              {" "}
              {replayExportPreflight.evidenceValid ? "yes" : "no"}
            </li>
          </ul>
          <div className="mt-2 flex flex-wrap gap-2">
            {replayExportPreflight.state !== "blocked" && (
              <button
                className="rounded bg-violet-700 px-2 py-1 text-xs font-semibold text-white"
                onClick={() => {
                  setPreflightOpen(false)
                  onExportReplay?.()
                }}
                ref={confirmRef}
                type="button"
              >
                Confirm download
              </button>
            )}
            {replayExportPreflight.state === "blocked"
              && replayExportPreflight.canExportRosterOnly
              && onExportRosterOnly && (
                <button
                  className="rounded border border-violet-400 px-2 py-1 text-xs font-semibold"
                  onClick={() => {
                    setPreflightOpen(false)
                    onExportRosterOnly()
                  }}
                  ref={confirmRef}
                  type="button"
                >
                  Export roster-only fixture
                </button>
              )}
            <button
              className="rounded border border-violet-400 px-2 py-1 text-xs font-semibold"
              onClick={() => setPreflightOpen(false)}
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      <p aria-live="polite" className="sr-only" role="status">
        Draft pick {recommendations.currentPick}. Top recommendation: {
          recommendations.candidates[0]?.player.fullName || "none"
        }.
      </p>
      {recommendations.candidates.length === 0 ? (
        <p className="text-sm text-violet-900">
          No legal roster selections remain.
        </p>
      ) : (
        <ol className="grid gap-2 md:grid-cols-3">
          {recommendations.candidates.map((candidate, index) => {
            const statusEvents = recommendationPlayerStatusEvidence(
              playerStatus[candidate.player.id]?.response?.events || [],
            )
            return (
              <li
                className="rounded-lg border border-violet-100 bg-white p-3"
                key={candidate.player.id}
              >
                <button
                  className="w-full text-left"
                  onClick={() => onSelectPlayer(candidate.player)}
                >
                  <span className="text-xs font-semibold text-violet-600">
                    {index === 0 ? "Preferred" : `Fallback ${index}`}
                  </span>
                  <span className="block font-semibold text-slate-950">
                    {candidate.player.fullName}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {candidate.player.position}
                    {candidate.player.team
                      ? ` · ${candidate.player.team}`
                      : ""}
                    {" · "}
                    {roleLabel[candidate.evidence.rosterRole]}
                  </span>
                </button>
                <dl className="mt-2 grid grid-cols-4 gap-1 text-xs">
                  <div>
                    <dt className="text-slate-500">Lineup +</dt>
                    <dd className="font-semibold">
                      {candidate.evidence.marginalLineupPoints.toFixed(1)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Tier loss</dt>
                    <dd className="font-semibold">
                      {candidate.evidence.tierLossIfDeferred.toFixed(1)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Survives</dt>
                    <dd className="font-semibold">
                      {(candidate.evidence.survivalProbability * 100)
                        .toFixed(0)}%
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Run risk</dt>
                    <dd className="font-semibold">
                      {(candidate.evidence.positionalRunProbability * 100)
                        .toFixed(0)}%
                    </dd>
                  </div>
                </dl>
                {candidate.evidence.flags.length > 0 && (
                  <p className="mt-2 text-xs text-amber-800">
                    {candidate.evidence.flags.join(" · ")}
                  </p>
                )}
                {statusEvents.length > 0 && (
                  <aside
                    aria-label={
                      `${candidate.player.fullName} status evidence`
                    }
                    className="mt-2 space-y-1 rounded border border-amber-200 bg-amber-50 p-2"
                  >
                    <p className="text-xs font-semibold text-amber-950">
                      Current status evidence
                    </p>
                    {statusEvents.map(event => (
                      <div className="text-xs text-amber-950" key={event.id}>
                        <p>
                          <span className="font-semibold capitalize">
                            {event.type.replace(/_/g, " ")}
                            {" · "}
                            {event.recommendation_impact}
                          </span>
                          {" — "}
                          {event.short_summary}
                        </p>
                        <p className="text-amber-800">
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
                          {event.source_published_at && (
                            <>
                              {" · "}
                              <time dateTime={event.source_published_at}>
                                published {
                                  event.source_published_at.slice(0, 10)
                                }
                              </time>
                            </>
                          )}
                        </p>
                      </div>
                    ))}
                  </aside>
                )}
              </li>
            )
          })}
        </ol>
      )}
      {draftPlan && onAcceptProposal && onRejectProposal && (
        <DraftPlanPanel
          plan={draftPlan}
          proposals={realtimeProposals}
          onAcceptProposal={onAcceptProposal}
          onRejectProposal={onRejectProposal}
        />
      )}
      {draftPlan
        && realtimeStatus
        && onConnectRealtime
        && onDisconnectRealtime
        && onCancelRealtimeResponse
        && onSetRealtimeAutoAdviceEnabled
        && onSetRealtimeMode
        && onSetRealtimeMicrophoneEnabled
        && onSendRealtimeText
        && (
          <RealtimeTextAdvisor
            error={realtimeError}
            isResponding={realtimeIsResponding}
            messages={realtimeMessages}
            reconnectAttempt={realtimeReconnectAttempt}
            autoAdviceEnabled={realtimeAutoAdviceEnabled}
            mode={realtimeMode}
            microphoneEnabled={realtimeMicrophoneEnabled}
            isUserSpeaking={realtimeIsUserSpeaking}
            onCancelResponse={onCancelRealtimeResponse}
            onConnect={onConnectRealtime}
            onDisconnect={onDisconnectRealtime}
            onSetAutoAdviceEnabled={onSetRealtimeAutoAdviceEnabled}
            onSetMode={onSetRealtimeMode}
            onSetMicrophoneEnabled={
              onSetRealtimeMicrophoneEnabled
            }
            onSendText={onSendRealtimeText}
            status={realtimeStatus}
          />
        )}
    </section>
  )
}

export default LiveAdvisorPanel
