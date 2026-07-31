import type {
  RecordedV1OpponentModelKind,
  ReplayForecastEvidence,
  ReplayForecastObservation,
} from "./completedDraftReplay"
import type { OpponentForecast, OpponentModelKind } from "./types"

export const REPLAY_FORECAST_EVIDENCE_VERSION = 1 as const
export const REPLAY_FORECAST_MODEL_IDENTITY =
  "deterministic_opponent_v1" as const
/** Enough for a 20-round, 12-team draft while making an accidental loop finite. */
export const MAX_REPLAY_FORECAST_OBSERVATIONS = 256

const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map(key =>
      `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`
  }
  return JSON.stringify(value)
}

/** Browser-safe deterministic identity; wall-clock time is intentionally absent. */
const createDeterministicFingerprint = (value: unknown): string => {
  const serialized = stableJson(value)
  let hash = 0x811c9dc5
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, "0")
}

/** Identifies exactly the deterministic context supplied to the live model. */
export const createReplayForecastInputFingerprint = (
  value: unknown,
): string => createDeterministicFingerprint(value)

/** Recomputable exported-observation integrity identity, distinct from inputs. */
export const createReplayForecastObservationFingerprint = (
  value: Pick<
    ReplayForecastObservation,
    | "observedThroughOverallPick"
    | "modelIdentity"
    | "model"
    | "targetRosterIndex"
    | "forecast"
  >,
): string => createDeterministicFingerprint(value)

export interface RecordReplayForecastParams {
  sessionId: string
  observedThroughOverallPick: number
  forecast: OpponentForecast
  model?: RecordedV1OpponentModelKind
  targetRosterIndex: number
  inputFingerprint: string
}

/**
 * Session-scoped local storage with replace-by-boundary semantics.  A React
 * render can re-run this safely; a later value for the same board boundary
 * replaces, rather than inflates, the observation count.
 */
export class ReplayForecastEvidenceRecorder {
  private sessionId: string | null = null
  private observations = new Map<number, ReplayForecastObservation>()

  reset(sessionId: string | null = null): void {
    this.sessionId = sessionId
    this.observations.clear()
  }

  record({
    sessionId,
    observedThroughOverallPick,
    forecast,
    model,
    targetRosterIndex,
    inputFingerprint,
  }: RecordReplayForecastParams): ReplayForecastEvidence | undefined {
    // Reset before validation so an invalid first render from a new session can
    // never expose observations captured under the preceding draft id.
    if (this.sessionId !== sessionId) this.reset(sessionId)
    const resolvedModel = model || forecast.model
    if (!sessionId || !Number.isInteger(observedThroughOverallPick)
      || observedThroughOverallPick < 0
      || forecast.targetRosterIndex !== targetRosterIndex
      || !["adp_only", "need_only", "combined"].includes(resolvedModel)
      || forecast.model !== resolvedModel
      || !/^[a-f0-9]{8}$/.test(inputFingerprint)
      || forecast.picks.length === 0
      || forecast.picks.some(pick => pick.overallPick <= observedThroughOverallPick)) {
      return this.snapshot()
    }
    const base = {
      observedThroughOverallPick,
      modelIdentity: REPLAY_FORECAST_MODEL_IDENTITY,
      model: resolvedModel as RecordedV1OpponentModelKind,
      targetRosterIndex,
      forecast,
    } as const
    this.observations.set(observedThroughOverallPick, {
      ...base,
      inputFingerprint,
      observationFingerprint: createReplayForecastObservationFingerprint(base),
    })
    while (this.observations.size > MAX_REPLAY_FORECAST_OBSERVATIONS) {
      const oldest = this.observations.keys().next().value
      if (oldest === undefined) break
      this.observations.delete(oldest)
    }
    return this.snapshot()
  }

  snapshot(expectedSessionId?: string): ReplayForecastEvidence | undefined {
    if (!this.sessionId || (expectedSessionId && expectedSessionId !== this.sessionId)
      || this.observations.size === 0) return undefined
    return {
      schemaVersion: REPLAY_FORECAST_EVIDENCE_VERSION,
      sessionId: this.sessionId,
      observations: Array.from(this.observations.values()).sort((left, right) =>
        left.observedThroughOverallPick - right.observedThroughOverallPick),
    }
  }
}
