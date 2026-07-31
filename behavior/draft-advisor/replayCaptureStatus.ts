import type {
  RecordedCompletedDraftReplay,
  ReplayForecastEvidence,
} from "./completedDraftReplay"
import {
  scoreRecordedOpponentForecastEvidence,
  validateRecordedOpponentForecastEvidence,
} from "./replayMetrics"
import { validateCompletedDraftReplay } from "./replayFixtures"
import type { OpponentForecast } from "./types"

export type ReplayCaptureReasonCode =
  | "no_session"
  | "not_started"
  | "completed"
  | "no_future_opponent_picks"
  | "provider_boundary_ahead"
  | "invalid_target_or_model"
  | "invalid_input"
  | "history_ahead"
  | "recording"
export type ReplayCaptureState =
  | "waiting"
  | "recording"
  | "paused"
  | "completed_preserved"
  | "completed_without_labels"
export interface ReplayCaptureStatus {
  state: ReplayCaptureState
  reasonCode: ReplayCaptureReasonCode
  message: string
  observationCount: number
  latestObservedThroughOverallPick: number | null
}

const summary = (evidence?: ReplayForecastEvidence) => ({
  observationCount: evidence?.observations.length || 0,
  latestObservedThroughOverallPick: evidence?.observations.length
    ? Math.max(...evidence.observations.map(item => item.observedThroughOverallPick))
    : null,
})

interface ReplayCaptureStatusParams {
  sessionId?: string | null
  draftStarted: boolean
  complete: boolean
  rawBoundary: number
  evidence?: ReplayForecastEvidence
  forecast: OpponentForecast
  targetRosterIndex: number
  inputFingerprint: string
  historyAhead?: boolean
}

export const deriveReplayCaptureStatus = ({
  sessionId, draftStarted, complete, rawBoundary, evidence, forecast,
  targetRosterIndex, inputFingerprint, historyAhead = false,
}: ReplayCaptureStatusParams): ReplayCaptureStatus => {
  const counts = summary(evidence?.sessionId === sessionId ? evidence : undefined)
  const status = (
    state: ReplayCaptureState,
    reasonCode: ReplayCaptureReasonCode,
    message: string,
  ): ReplayCaptureStatus => ({ state, reasonCode, message, ...counts })
  if (!sessionId) return status("waiting", "no_session", "Waiting for a draft session to record forecast evidence.")
  if (!draftStarted) return status("waiting", "not_started", "Forecast evidence will begin when the draft starts.")
  if (complete) return status(
    counts.observationCount ? "completed_preserved" : "completed_without_labels",
    "completed",
    counts.observationCount
      ? "Draft complete. Local forecast evidence is preserved for export."
      : "Draft complete. No live forecast labels were captured.",
  )
  if (forecast.targetRosterIndex !== targetRosterIndex || forecast.model !== "combined") return status(
    "paused", "invalid_target_or_model",
    "Forecast capture is paused because the target or model changed.",
  )
  if (!/^[a-f0-9]{8}$/.test(inputFingerprint)) return status(
    "paused", "invalid_input",
    "Forecast capture is paused until deterministic inputs are ready.",
  )
  if (!forecast.picks.length) return status(
    "paused", "no_future_opponent_picks",
    "No future opponent picks are available to label yet.",
  )
  if (historyAhead) return status(
    "paused", "history_ahead",
    "Waiting for the advisor state to catch up to the observed board.",
  )
  if (forecast.picks.some(pick => pick.overallPick <= rawBoundary)) return status(
    "paused", "provider_boundary_ahead",
    "Waiting for the advisor forecast to advance beyond the observed board.",
  )
  return status("recording", "recording", "Recording local pre-pick opponent forecasts.")
}

export interface ReplayExportPreflight {
  state: "ready" | "warning" | "blocked"
  message: string
  totalPlatformPicks: number
  boardComplete: boolean
  authoritativePlatformBoard: boolean
  campaignEvidenceReady: boolean
  sessionMatch: boolean
  targetRosterMatch: boolean
  evidencePresent: boolean
  evidenceValid: boolean
  canExportRosterOnly: boolean
  labeledPickCount: number
  labeledWindowCount: number
  opponentMetricsAvailable: boolean
}

export const preflightReplayExport = (
  fixture: RecordedCompletedDraftReplay,
): ReplayExportPreflight => {
  const baseErrors = validateCompletedDraftReplay(fixture)
  const totalPlatformPicks = fixture.source?.totalPicks || fixture.actualPicks.length
  const sessionMatch = !fixture.forecastEvidence || fixture.forecastEvidence.sessionId === fixture.id
  const targetRosterMatch = !fixture.forecastEvidence
    || fixture.forecastEvidence.observations.every(item =>
      item.targetRosterIndex === fixture.targetRosterIndex)
  const authoritativePlatformBoard = fixture.source?.platform === "ESPN"
    && fixture.source.totalPicks === fixture.actualPicks.length
    && fixture.source.numRounds * fixture.settings.numTeams === fixture.source.totalPicks
    && fixture.source.platformRosterSize === fixture.source.numRounds
    && fixture.source.title.trim().length > 0
    && Number.isFinite(fixture.source.capturedAt) && fixture.source.capturedAt > 0
    && Array.isArray(fixture.source.excludedPositions)
  const campaignEvidenceReady = authoritativePlatformBoard && fixture.provenance === "recorded"
  if (baseErrors.length) return {
    state: "blocked", message: `Replay is incomplete: ${baseErrors.join("; ")}`,
    totalPlatformPicks, boardComplete: false, authoritativePlatformBoard,
    campaignEvidenceReady: false, sessionMatch, targetRosterMatch,
    evidencePresent: Boolean(fixture.forecastEvidence), evidenceValid: false,
    canExportRosterOnly: false, labeledPickCount: 0, labeledWindowCount: 0,
    opponentMetricsAvailable: false,
  }
  const evidenceErrors = validateRecordedOpponentForecastEvidence(fixture)
  if (evidenceErrors.length) return {
    state: "blocked", message: `Forecast evidence is invalid: ${evidenceErrors.join("; ")}`,
    totalPlatformPicks, boardComplete: true, authoritativePlatformBoard,
    campaignEvidenceReady: false, sessionMatch, targetRosterMatch,
    evidencePresent: true, evidenceValid: false, canExportRosterOnly: true,
    labeledPickCount: 0, labeledWindowCount: 0, opponentMetricsAvailable: false,
  }
  const result = scoreRecordedOpponentForecastEvidence(fixture)
  if (!result.available || !authoritativePlatformBoard) return {
    state: "warning",
    message: !authoritativePlatformBoard
      ? "Roster replay is exportable, but it is not an authoritative completed ESPN board."
      : "Roster replay is ready, but opponent metrics will be unavailable because no labeled forecasts were captured.",
    totalPlatformPicks, boardComplete: true, authoritativePlatformBoard,
    campaignEvidenceReady: false, sessionMatch, targetRosterMatch,
    evidencePresent: Boolean(fixture.forecastEvidence), evidenceValid: true,
    canExportRosterOnly: false,
    labeledPickCount: result.available ? result.labeledPickCount : 0,
    labeledWindowCount: result.available ? result.labeledWindowCount : 0,
    opponentMetricsAvailable: result.available,
  }
  return {
    state: "ready", message: "Replay and local opponent forecast evidence are ready to export.",
    totalPlatformPicks, boardComplete: true, authoritativePlatformBoard,
    campaignEvidenceReady, sessionMatch, targetRosterMatch, evidencePresent: true,
    evidenceValid: true, canExportRosterOnly: false,
    labeledPickCount: result.labeledPickCount,
    labeledWindowCount: result.labeledWindowCount,
    opponentMetricsAvailable: true,
  }
}

/** Rebuild at the click boundary so an opened preflight can never authorize stale data. */
export const validateReplayExportAtConfirmation = (
  buildFixture: (rosterOnly: boolean) => RecordedCompletedDraftReplay,
  rosterOnly = false,
): { fixture: RecordedCompletedDraftReplay; preflight: ReplayExportPreflight } => {
  const fixture = buildFixture(rosterOnly)
  const preflight = preflightReplayExport(fixture)
  if (preflight.state === "blocked") throw new Error(preflight.message)
  return { fixture, preflight }
}
