import { FantasyPosition } from "../../types"
import {
  EMPIRICAL_BALANCED_RESIDUAL_CONFIG,
  EMPIRICAL_OPPONENT_POSITIONS,
  createEmpiricalOpponentFeatureSurface,
  empiricalDraftPhaseProvenance,
  predictEmpiricalBalancedResidualProbabilities,
} from "./opponentEmpiricalV2"
import { probabilityOfAtLeast } from "./opponentModel"
import type { DraftAdvisorContext, OpponentForecast, PositionProbability } from "./types"
import type { EmpiricalBalancedResidualModel, EmpiricalDraftPhaseProvenance } from "./opponentEmpiricalV2"

/**
 * Fixed full-five-fixture residual fit used only for prospective run shadow
 * capture. It is not a LODO result and is never consulted by live advice.
 */
export const BOUNDED_RESIDUAL_RUN_SHADOW_ARTIFACT = {
  schemaVersion: 1,
  id: "bounded_residual_run_shadow_v1",
  /** FNV-1a of this immutable payload excluding this field. */
  artifactFingerprint: "ce1f07b2",
  trainingCorpusFingerprint: "d43e0754c60937794fabcf3fbf89cf7cad43fea6133274255d56008271f6c652",
  featureSet: "base" as const,
  featureNames: ["intercept", "adp_log_probability", "direct_need_log_probability", "recent_run_log_probability", "draft_phase"],
  config: {
    correctionStrength: 1,
    classBalanceExponent: 1,
    residualLogitBound: EMPIRICAL_BALANCED_RESIDUAL_CONFIG.residualLogitBound,
  },
  classWeights: [1.8636363636363573, 0.7961165048543662, 0.5985401459853995, 1.8636363636363573],
  coefficients: [
    [0.028256916231275058, 0.1314765231896274, 0.19470045079891346, 0.015978536486706628, 0.10782819446708557],
    [0.04637461115441637, 0.09756632492018852, 0.012329437361403918, 0.10269928909870449, -0.11987180797216661],
    [-0.047247272558122076, 0.005117733413696758, 0.13999312537571648, 0.08975724808339072, -0.06015426862238594],
    [0.06452175995800002, 0.13308988797779742, 0.13858342677545657, 0.05589967815706186, 0.09450968422297798],
  ],
} as const

const stableJson = (value: unknown): string => Array.isArray(value) ? `[${value.map(stableJson).join(",")}]`
  : value && typeof value === "object" ? `{${Object.keys(value as Record<string, unknown>).sort().map(key => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`).join(",")}}`
    : JSON.stringify(value)
export const createBoundedResidualRunShadowArtifactFingerprint = (): string => {
  const { artifactFingerprint: _ignored, ...payload } = BOUNDED_RESIDUAL_RUN_SHADOW_ARTIFACT
  let hash = 0x811c9dc5
  for (const character of stableJson(payload)) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 0x01000193) }
  return (hash >>> 0).toString(16).padStart(8, "0")
}

export interface RunOnlyShadowForecast {
  schemaVersion: 1
  modelIdentity: "bounded_residual_run_shadow_v1"
  artifactId: typeof BOUNDED_RESIDUAL_RUN_SHADOW_ARTIFACT.id
  artifactFingerprint: typeof BOUNDED_RESIDUAL_RUN_SHADOW_ARTIFACT.artifactFingerprint
  trainingCorpusFingerprint: typeof BOUNDED_RESIDUAL_RUN_SHADOW_ARTIFACT.trainingCorpusFingerprint
  targetRosterIndex: number
  phaseProvenance: EmpiricalDraftPhaseProvenance
  minimumPicks: 3
  horizon: Array<{ overallPick: number, rosterIndex: number }>
  frozenRunProbabilities: Array<{ position: FantasyPosition, probability: number }>
  challengerRunProbabilities: Array<{ position: FantasyPosition, probability: number }>
}

const artifactModel: EmpiricalBalancedResidualModel = {
  featureNames: [...BOUNDED_RESIDUAL_RUN_SHADOW_ARTIFACT.featureNames],
  coefficients: BOUNDED_RESIDUAL_RUN_SHADOW_ARTIFACT.coefficients.map(row => [...row]),
  classWeights: [...BOUNDED_RESIDUAL_RUN_SHADOW_ARTIFACT.classWeights],
  correctionStrength: BOUNDED_RESIDUAL_RUN_SHADOW_ARTIFACT.config.correctionStrength,
  classBalanceExponent: BOUNDED_RESIDUAL_RUN_SHADOW_ARTIFACT.config.classBalanceExponent,
  diagnostics: { examples: 656, initialLoss: 1.2207944401007258, finalLoss: 1.1901644211035836, iterations: 250, runtimeMs: 0 },
}

const probabilityFor = (values: PositionProbability[], position: FantasyPosition): number =>
  values.find(value => value.position === position)?.probability || 0

/** Mirrors frozen v1's exact slots and stores only parallel run probabilities. */
export const createBoundedResidualRunShadowForecast = (
  context: DraftAdvisorContext,
  frozenForecast: OpponentForecast,
  totalDraftPicks?: number,
): RunOnlyShadowForecast => {
  const minimumPicks = 3
  const horizon = frozenForecast.picks.map(pick => ({ overallPick: pick.overallPick, rosterIndex: pick.rosterIndex }))
  const challengerSlots = frozenForecast.picks.map(pick => predictEmpiricalBalancedResidualProbabilities(
    artifactModel,
    EMPIRICAL_OPPONENT_POSITIONS.map(position => probabilityFor(pick.positionProbabilities, position)),
    createEmpiricalOpponentFeatureSurface(context, pick.overallPick, pick.rosterIndex, totalDraftPicks),
  ))
  return {
    schemaVersion: 1,
    modelIdentity: "bounded_residual_run_shadow_v1",
    artifactId: BOUNDED_RESIDUAL_RUN_SHADOW_ARTIFACT.id,
    artifactFingerprint: BOUNDED_RESIDUAL_RUN_SHADOW_ARTIFACT.artifactFingerprint,
    trainingCorpusFingerprint: BOUNDED_RESIDUAL_RUN_SHADOW_ARTIFACT.trainingCorpusFingerprint,
    targetRosterIndex: frozenForecast.targetRosterIndex,
    phaseProvenance: empiricalDraftPhaseProvenance(context, totalDraftPicks),
    minimumPicks,
    horizon,
    frozenRunProbabilities: EMPIRICAL_OPPONENT_POSITIONS.map(position => ({
      position,
      probability: frozenForecast.runProbabilities.find(run => run.position === position)?.probability || 0,
    })),
    challengerRunProbabilities: EMPIRICAL_OPPONENT_POSITIONS.map((position, index) => ({
      position,
      probability: probabilityOfAtLeast(challengerSlots.map(values => values[index]), minimumPicks),
    })),
  }
}
