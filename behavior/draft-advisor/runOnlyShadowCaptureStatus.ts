import type { ReplayForecastEvidence, ReplayRunOnlyShadowEvidence } from "./completedDraftReplay"
import type { OpponentForecast } from "./types"
import type { RunOnlyShadowForecast } from "./boundedResidualRunShadow"

export type RunOnlyShadowCaptureStatus = {
  state: "waiting" | "recording" | "paused" | "completed_usable" | "completed_unusable"
  reasonCode: "no_session" | "not_started" | "fallback_phase" | "history_ahead" | "frozen_capture_paused" | "mismatch" | "recording" | "completed_usable" | "completed_unusable"
  message: string
  frozenObservationCount: number
  shadowObservationCount: number
  comparableObservationCount: number
  knownTotal: boolean
  boundariesMatch: boolean
  horizonsMatch: boolean
}

export const deriveRunOnlyShadowCaptureStatus = (params: {
  sessionId?: string | null
  draftStarted: boolean
  complete: boolean
  historyAhead: boolean
  frozenEvidence?: ReplayForecastEvidence
  shadowEvidence?: ReplayRunOnlyShadowEvidence
  frozenForecast: OpponentForecast
  shadowForecast: RunOnlyShadowForecast
  frozenRecording: boolean
}): RunOnlyShadowCaptureStatus => {
  const frozen = params.frozenEvidence && params.frozenEvidence.sessionId === params.sessionId
    ? params.frozenEvidence.observations : []
  const shadow = params.shadowEvidence && params.shadowEvidence.sessionId === params.sessionId
    ? params.shadowEvidence.observations : []
  const byBoundary = new Map(frozen.map(observation => [observation.observedThroughOverallPick, observation]))
  const boundariesMatch = shadow.length > 0 && shadow.length === frozen.length && shadow.every(observation => byBoundary.has(observation.observedThroughOverallPick))
  const horizonsMatch = boundariesMatch && shadow.every(observation => {
    const picks = byBoundary.get(observation.observedThroughOverallPick)!.forecast.picks
    return picks.length === observation.forecast.horizon.length && picks.every((pick, index) =>
      pick.overallPick === observation.forecast.horizon[index]?.overallPick && pick.rosterIndex === observation.forecast.horizon[index]?.rosterIndex)
  })
  const knownTotal = params.shadowForecast.phaseProvenance.kind === "known_total"
    && shadow.every(observation => observation.phaseProvenance.kind === "known_total")
  const comparableObservationCount = knownTotal && horizonsMatch ? shadow.length : 0
  const status = (state: RunOnlyShadowCaptureStatus["state"], reasonCode: RunOnlyShadowCaptureStatus["reasonCode"], message: string) => ({
    state, reasonCode, message, frozenObservationCount: frozen.length, shadowObservationCount: shadow.length,
    comparableObservationCount, knownTotal, boundariesMatch, horizonsMatch,
  })
  if (!params.sessionId) return status("waiting", "no_session", "Waiting for a draft session before run-only shadow capture can start.")
  if (params.complete) return comparableObservationCount ? status("completed_usable", "completed_usable", "Draft complete. Run-only shadow labels are comparable for offline review.")
    : status("completed_unusable", "completed_unusable", "Draft complete. No comparable run-only shadow labels were captured.")
  if (!params.draftStarted) return status("waiting", "not_started", "Run-only shadow capture is ready and will begin when the draft starts.")
  if (params.historyAhead) return status("paused", "history_ahead", "Run-only shadow capture is waiting for the board state to catch up.")
  if (!knownTotal) return status("paused", "fallback_phase", "Run-only shadow capture is paused until the provider total is known.")
  if (!horizonsMatch && (frozen.length || shadow.length)) return status("paused", "mismatch", "Run-only shadow capture is paused because frozen and challenger horizons differ.")
  if (!params.frozenRecording) return status("paused", "frozen_capture_paused", "Run-only shadow capture is waiting for frozen capture to resume.")
  return status("recording", "recording", "Recording parallel frozen v1 and bounded-residual run labels locally.")
}
