import React from "react"
import type {
  EmpiricalBaseShadowCaptureStatus,
} from "../behavior/draft-advisor/empiricalBaseShadowCaptureStatus"

interface EmpiricalBaseShadowCaptureReadinessProps {
  status: EmpiricalBaseShadowCaptureStatus
}

const labelForState = (state: EmpiricalBaseShadowCaptureStatus["state"]): string => ({
  waiting: "waiting",
  recording: "recording",
  paused: "paused",
  completed_usable: "ready for review",
  completed_without_comparable_labels: "not comparable",
}[state])

/** A compact, expandable explanation of local-only challenger capture health. */
const EmpiricalBaseShadowCaptureReadiness = ({
  status,
}: EmpiricalBaseShadowCaptureReadinessProps) => {
  const awaitingFirstLabels = status.frozenV1ObservationCount === 0
    && status.shadowObservationCount === 0
  const summaryLabel = status.reasonCode === "not_started" && status.knownTotalPhase
    ? "ready to start"
    : labelForState(status.state)
  return (
    <details className="mb-2 rounded-lg border border-violet-200 bg-white/70 px-2 py-1 text-xs text-violet-950">
      <summary className="cursor-pointer font-semibold marker:text-violet-500">
        <span aria-live="polite">
          Shadow capture: {summaryLabel}
          {status.comparableObservationCount > 0
            && ` · ${status.comparableObservationCount} matched label${
              status.comparableObservationCount === 1 ? "" : "s"
            }`}
        </span>
      </summary>
      <div
        aria-label="Shadow capture readiness details"
        className="mt-2 grid gap-1 sm:grid-cols-2"
      >
        <p>
          <span className="font-semibold">Frozen v1:</span>
          {" "}{status.frozenV1ObservationCount} local label
          {status.frozenV1ObservationCount === 1 ? "" : "s"}.
        </p>
        <p>
          <span className="font-semibold">Learned-base:</span>
          {" "}{status.shadowObservationCount} local label
          {status.shadowObservationCount === 1 ? "" : "s"}.
        </p>
        <p>
          <span className="font-semibold">Draft phase:</span>
          {" "}{status.knownTotalPhase ? "known total" : "fallback horizon"}
          {` (${status.phaseTotalDraftPicks} picks)`}.
        </p>
        <p>
          <span className="font-semibold">Observation boundaries:</span>
          {" "}{awaitingFirstLabels
            ? "awaiting first labels"
            : status.boundariesMatch ? "matched" : "not matched"};
          {" "}<span className="font-semibold">horizons:</span>
          {" "}{awaitingFirstLabels
            ? "awaiting first labels"
            : status.horizonsMatch ? "matched" : "not matched"}.
        </p>
        <p className="sm:col-span-2" role="status">
          {status.message}
        </p>
      </div>
    </details>
  )
}

export default EmpiricalBaseShadowCaptureReadiness
