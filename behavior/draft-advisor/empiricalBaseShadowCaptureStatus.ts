import type {
  ReplayEmpiricalBaseShadowEvidence,
  ReplayForecastEvidence,
} from "./completedDraftReplay"
import type { EmpiricalBaseShadowForecast } from "./empiricalBaseShadow"
import type { ReplayCaptureStatus } from "./replayCaptureStatus"
import type { OpponentForecast } from "./types"

export type EmpiricalBaseShadowCaptureState =
  | "waiting"
  | "recording"
  | "paused"
  | "completed_usable"
  | "completed_without_comparable_labels"

export type EmpiricalBaseShadowCaptureReasonCode =
  | "no_session"
  | "not_started"
  | "fallback_phase"
  | "history_ahead"
  | "frozen_capture_paused"
  | "mismatch"
  | "recording"
  | "completed_usable"
  | "completed_without_comparable_labels"

export interface EmpiricalBaseShadowCaptureStatus {
  state: EmpiricalBaseShadowCaptureState
  reasonCode: EmpiricalBaseShadowCaptureReasonCode
  message: string
  frozenV1ObservationCount: number
  shadowObservationCount: number
  comparableObservationCount: number
  phaseProvenance: EmpiricalBaseShadowForecast["phaseProvenance"]["kind"]
  phaseTotalDraftPicks: number
  knownTotalPhase: boolean
  boundariesMatch: boolean
  horizonsMatch: boolean
}

interface EmpiricalBaseShadowCaptureStatusParams {
  sessionId?: string | null
  draftStarted: boolean
  complete: boolean
  historyAhead: boolean
  frozenEvidence?: ReplayForecastEvidence
  shadowEvidence?: ReplayEmpiricalBaseShadowEvidence
  frozenForecast: OpponentForecast
  shadowForecast: EmpiricalBaseShadowForecast
  frozenCaptureStatus: ReplayCaptureStatus
}

const evidenceForSession = <Evidence extends { sessionId: string }>(
  evidence: Evidence | undefined,
  sessionId: string | null | undefined,
): Evidence | undefined => evidence?.sessionId === sessionId ? evidence : undefined

const matchingCurrentForecasts = (
  frozen: OpponentForecast,
  shadow: EmpiricalBaseShadowForecast,
): boolean => frozen.targetRosterIndex === shadow.targetRosterIndex
  && frozen.picks.length === shadow.picks.length
  && frozen.picks.every((pick, index) =>
    pick.overallPick === shadow.picks[index]?.overallPick
    && pick.rosterIndex === shadow.picks[index]?.rosterIndex)

/**
 * Determines whether the two local evidence streams can later be evaluated
 * together. It is presentation-only: recording and forecast outputs remain
 * entirely owned by usePredictions and the existing recorders.
 */
export const deriveEmpiricalBaseShadowCaptureStatus = ({
  sessionId,
  draftStarted,
  complete,
  historyAhead,
  frozenEvidence,
  shadowEvidence,
  frozenForecast,
  shadowForecast,
  frozenCaptureStatus,
}: EmpiricalBaseShadowCaptureStatusParams): EmpiricalBaseShadowCaptureStatus => {
  const frozen = evidenceForSession(frozenEvidence, sessionId)
  const shadow = evidenceForSession(shadowEvidence, sessionId)
  const frozenObservations = frozen?.observations || []
  const shadowObservations = shadow?.observations || []
  const frozenByBoundary = new Map(frozenObservations.map(observation => [
    observation.observedThroughOverallPick,
    observation,
  ]))
  const boundaryPairs = shadowObservations.flatMap(observation => {
    const frozenObservation = frozenByBoundary.get(
      observation.observedThroughOverallPick,
    )
    if (!frozenObservation) return []
    return [[frozenObservation, observation] as const]
  })
  const structuralBoundariesMatch = frozenObservations.length > 0
    && frozenObservations.length === shadowObservations.length
    && boundaryPairs.length === shadowObservations.length
  const structuralHorizonsMatch = structuralBoundariesMatch
    && boundaryPairs.every(([frozenObservation, observation]) =>
      frozenObservation.forecast.picks.length
      === observation.forecast.picks.length
      && frozenObservation.forecast.picks.every((pick, index) =>
        pick.overallPick === observation.forecast.picks[index]?.overallPick
        && pick.rosterIndex === observation.forecast.picks[index]?.rosterIndex)
    )
  const knownTotalPhase = shadowForecast.phaseProvenance.kind === "known_total"
  const allStoredShadowPhasesKnown = shadowObservations.every(observation =>
    observation.phaseProvenance.kind === "known_total")
  // A structurally matching fallback observation is still not comparable: its
  // learned phase feature was derived from a different horizon. Keep the
  // public match flags semantic, so the UI cannot accidentally imply it is
  // ready for an apples-to-apples offline evaluation.
  const phaseComparable = knownTotalPhase && allStoredShadowPhasesKnown
  const boundariesMatch = phaseComparable && structuralBoundariesMatch
  const horizonsMatch = phaseComparable && structuralHorizonsMatch
  const comparableObservationCount = phaseComparable && structuralHorizonsMatch
    ? boundaryPairs.length
    : 0
  const status = (
    state: EmpiricalBaseShadowCaptureState,
    reasonCode: EmpiricalBaseShadowCaptureReasonCode,
    message: string,
  ): EmpiricalBaseShadowCaptureStatus => ({
    state,
    reasonCode,
    message,
    frozenV1ObservationCount: frozenObservations.length,
    shadowObservationCount: shadowObservations.length,
    comparableObservationCount,
    phaseProvenance: shadowForecast.phaseProvenance.kind,
    phaseTotalDraftPicks: shadowForecast.phaseProvenance.totalDraftPicks,
    knownTotalPhase,
    boundariesMatch,
    horizonsMatch,
  })

  if (!sessionId) return status(
    "waiting", "no_session", "Waiting for a draft session before shadow capture can start.",
  )
  if (complete) {
    if (comparableObservationCount > 0 && boundariesMatch && horizonsMatch) {
      return status(
        "completed_usable", "completed_usable",
        "Draft complete. Frozen v1 and learned-base shadow labels are comparable for offline review.",
      )
    }
    return status(
      "completed_without_comparable_labels",
      "completed_without_comparable_labels",
      !knownTotalPhase || !allStoredShadowPhasesKnown
        ? "Draft complete. Shadow labels used fallback draft-phase data and are not comparable."
        : "Draft complete. No comparable learned-base shadow labels were captured.",
    )
  }
  if (!draftStarted) return status(
    "waiting", "not_started", knownTotalPhase
      ? "Shadow capture is ready and will begin when the draft starts."
      : "Waiting for the draft provider total; shadow capture will stay paused until it arrives.",
  )
  if (historyAhead) return status(
    "paused", "history_ahead",
    "Shadow capture is waiting for the advisor state to catch up to the observed board.",
  )
  if (!knownTotalPhase) return status(
    "paused", "fallback_phase",
    "Shadow capture is paused until the draft provider supplies the total pick count.",
  )
  if (!matchingCurrentForecasts(frozenForecast, shadowForecast)
    || (frozenObservations.length || shadowObservations.length)
      && (!boundariesMatch || !horizonsMatch)) {
    return status(
      "paused", "mismatch",
      "Shadow capture is paused because frozen v1 and learned-base labels do not share the same boundary and horizon.",
    )
  }
  if (frozenCaptureStatus.state !== "recording") return status(
    "paused", "frozen_capture_paused",
    "Shadow capture is waiting for frozen v1 capture to resume.",
  )
  return status(
    "recording", "recording",
    "Recording parallel frozen v1 and learned-base shadow labels locally.",
  )
}
