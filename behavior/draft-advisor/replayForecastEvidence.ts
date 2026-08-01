import type {
  RecordedV1OpponentModelKind,
  ReplayForecastEvidence,
  ReplayForecastObservation,
  ReplayEmpiricalBaseShadowEvidence,
  ReplayEmpiricalBaseShadowObservation,
  ReplayRunOnlyShadowEvidence,
  ReplayRunOnlyShadowObservation,
} from "./completedDraftReplay"
import type { OpponentForecast, OpponentModelKind } from "./types"
import type { EmpiricalBaseShadowForecast } from "./empiricalBaseShadow"
import type { RunOnlyShadowForecast } from "./boundedResidualRunShadow"

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

export const createEmpiricalBaseShadowObservationFingerprint = (
  value: Pick<
    ReplayEmpiricalBaseShadowObservation,
    | "observedThroughOverallPick"
    | "modelIdentity"
    | "artifactId"
    | "trainingCorpusFingerprint"
    | "targetRosterIndex"
    | "phaseProvenance"
    | "forecast"
  >,
): string => createDeterministicFingerprint(value)

export const createRunOnlyShadowObservationFingerprint = (
  value: Pick<ReplayRunOnlyShadowObservation, "observedThroughOverallPick" | "modelIdentity" | "artifactId" | "artifactFingerprint" | "trainingCorpusFingerprint" | "targetRosterIndex" | "phaseProvenance" | "forecast">,
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

export interface RecordEmpiricalBaseShadowParams {
  sessionId: string
  observedThroughOverallPick: number
  forecast: EmpiricalBaseShadowForecast
  targetRosterIndex: number
  inputFingerprint: string
}

/** Parallel bounded storage for learned-base shadow observations only. */
export class ReplayEmpiricalBaseShadowEvidenceRecorder {
  private sessionId: string | null = null
  private observations = new Map<number, ReplayEmpiricalBaseShadowObservation>()

  reset(sessionId: string | null = null): void {
    this.sessionId = sessionId
    this.observations.clear()
  }

  record({
    sessionId,
    observedThroughOverallPick,
    forecast,
    targetRosterIndex,
    inputFingerprint,
  }: RecordEmpiricalBaseShadowParams): ReplayEmpiricalBaseShadowEvidence | undefined {
    if (this.sessionId !== sessionId) this.reset(sessionId)
    if (!sessionId || !Number.isInteger(observedThroughOverallPick)
      || observedThroughOverallPick < 0
      || forecast.targetRosterIndex !== targetRosterIndex
      || forecast.modelIdentity !== "empirical_opponent_base_shadow_v1"
      || forecast.artifactId !== "empirical_opponent_base_shadow_v1"
      || !/^[a-f0-9]{8}$/.test(inputFingerprint)
      || forecast.picks.length === 0
      || forecast.picks.some(pick => pick.overallPick <= observedThroughOverallPick)) {
      return this.snapshot()
    }
    const base = {
      observedThroughOverallPick,
      modelIdentity: forecast.modelIdentity,
      artifactId: forecast.artifactId,
      trainingCorpusFingerprint: forecast.trainingCorpusFingerprint,
      targetRosterIndex,
      phaseProvenance: forecast.phaseProvenance,
      forecast,
    } as const
    this.observations.set(observedThroughOverallPick, {
      ...base,
      inputFingerprint,
      observationFingerprint: createEmpiricalBaseShadowObservationFingerprint(base),
    })
    while (this.observations.size > MAX_REPLAY_FORECAST_OBSERVATIONS) {
      const oldest = this.observations.keys().next().value
      if (oldest === undefined) break
      this.observations.delete(oldest)
    }
    return this.snapshot()
  }

  snapshot(expectedSessionId?: string): ReplayEmpiricalBaseShadowEvidence | undefined {
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

export interface RecordRunOnlyShadowParams {
  sessionId: string
  observedThroughOverallPick: number
  forecast: RunOnlyShadowForecast
  targetRosterIndex: number
  inputFingerprint: string
}

/** Parallel bounded storage for immutable bounded-residual run observations. */
export class ReplayRunOnlyShadowEvidenceRecorder {
  private sessionId: string | null = null
  private observations = new Map<number, ReplayRunOnlyShadowObservation>()

  reset(sessionId: string | null = null): void { this.sessionId = sessionId; this.observations.clear() }

  record(params: RecordRunOnlyShadowParams): ReplayRunOnlyShadowEvidence | undefined {
    if (this.sessionId !== params.sessionId) this.reset(params.sessionId)
    const { sessionId, observedThroughOverallPick, forecast, targetRosterIndex, inputFingerprint } = params
    if (!sessionId || !Number.isInteger(observedThroughOverallPick) || observedThroughOverallPick < 0
      || forecast.targetRosterIndex !== targetRosterIndex
      || forecast.modelIdentity !== "bounded_residual_run_shadow_v1"
      || forecast.artifactId !== "bounded_residual_run_shadow_v1"
      || !/^[a-f0-9]{8}$/.test(inputFingerprint)
      || forecast.horizon.length === 0
      || forecast.horizon.some(slot => slot.overallPick <= observedThroughOverallPick)
      || forecast.frozenRunProbabilities.length !== 4 || forecast.challengerRunProbabilities.length !== 4) return this.snapshot()
    const base = { observedThroughOverallPick, modelIdentity: forecast.modelIdentity, artifactId: forecast.artifactId, artifactFingerprint: forecast.artifactFingerprint,
      trainingCorpusFingerprint: forecast.trainingCorpusFingerprint, targetRosterIndex,
      phaseProvenance: forecast.phaseProvenance, forecast } as const
    this.observations.set(observedThroughOverallPick, { ...base, inputFingerprint,
      observationFingerprint: createRunOnlyShadowObservationFingerprint(base) })
    while (this.observations.size > MAX_REPLAY_FORECAST_OBSERVATIONS) this.observations.delete(this.observations.keys().next().value!)
    return this.snapshot()
  }

  snapshot(expectedSessionId?: string): ReplayRunOnlyShadowEvidence | undefined {
    if (!this.sessionId || (expectedSessionId && expectedSessionId !== this.sessionId) || !this.observations.size) return undefined
    return { schemaVersion: REPLAY_FORECAST_EVIDENCE_VERSION, sessionId: this.sessionId,
      observations: Array.from(this.observations.values()).sort((a, b) => a.observedThroughOverallPick - b.observedThroughOverallPick) }
  }
}
