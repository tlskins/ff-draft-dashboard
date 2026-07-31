import { FantasyPosition } from "../../types"
import {
  EMPIRICAL_OPPONENT_CONFIG,
  EMPIRICAL_OPPONENT_POSITIONS,
  createEmpiricalOpponentFeatureSurface,
  empiricalDraftPhaseProvenance,
  predictEmpiricalOpponentProbabilities,
} from "./opponentEmpiricalV2"
import { probabilityOfAtLeast } from "./opponentModel"
import type { DraftAdvisorContext, OpponentForecast, PositionProbability } from "./types"
import type { EmpiricalSoftmaxModel } from "./opponentEmpiricalV2"
import type { EmpiricalDraftPhaseProvenance } from "./opponentEmpiricalV2"

/**
 * Immutable, audited full-data base fit from the five-fixture campaign. This
 * is an observation-only artifact: clients never fit, update, or promote it.
 */
export const EMPIRICAL_BASE_SHADOW_ARTIFACT = {
  schemaVersion: 1,
  id: "empirical_opponent_base_shadow_v1",
  trainingCorpusFingerprint:
    "d43e0754c60937794fabcf3fbf89cf7cad43fea6133274255d56008271f6c652",
  featureSet: "base" as const,
  featureNames: [
    "intercept",
    "adp_log_probability",
    "direct_need_log_probability",
    "recent_run_log_probability",
    "draft_phase",
  ],
  training: EMPIRICAL_OPPONENT_CONFIG,
  coefficients: [
    [-0.16943491706498381, 0.5392750307493197, 0.5662875041799802, 0.2896185789680056, 0.11043488992449911],
    [0.20301908871052363, 0.5424788546765406, 0.1921964481810583, 0.21972879499298903, -0.18105187787099458],
    [0.06820592945769165, 0.246526355744981, 0.37265005162337306, 0.10663375021484733, -0.037542479154735],
    [-0.10179010110323157, 0.5942297317078128, 0.49050566861880307, 0.2959637208594564, 0.1081594671012303],
  ],
} as const

export const EMPIRICAL_BASE_SHADOW_MODEL_IDENTITY =
  EMPIRICAL_BASE_SHADOW_ARTIFACT.id

export interface EmpiricalBaseShadowPick {
  overallPick: number
  rosterIndex: number
  positionProbabilities: PositionProbability[]
}

export interface EmpiricalBaseShadowForecast {
  schemaVersion: 1
  modelIdentity: typeof EMPIRICAL_BASE_SHADOW_MODEL_IDENTITY
  artifactId: typeof EMPIRICAL_BASE_SHADOW_ARTIFACT.id
  trainingCorpusFingerprint: typeof EMPIRICAL_BASE_SHADOW_ARTIFACT.trainingCorpusFingerprint
  targetRosterIndex: number
  phaseProvenance: EmpiricalDraftPhaseProvenance
  picks: EmpiricalBaseShadowPick[]
  runProbabilities: Array<{
    position: FantasyPosition
    minimumPicks: number
    probability: number
  }>
}

const artifactModel: EmpiricalSoftmaxModel = {
  featureSet: EMPIRICAL_BASE_SHADOW_ARTIFACT.featureSet,
  featureNames: [...EMPIRICAL_BASE_SHADOW_ARTIFACT.featureNames],
  coefficients: EMPIRICAL_BASE_SHADOW_ARTIFACT.coefficients.map(row => [...row]),
  diagnostics: {
    examples: 656,
    initialLoss: 1.386294361119894,
    finalLoss: 1.1486788988036833,
    iterations: EMPIRICAL_BASE_SHADOW_ARTIFACT.training.iterations,
    runtimeMs: 0,
  },
}

const positionProbabilitiesFor = (
  context: DraftAdvisorContext,
  overallPick: number,
  rosterIndex: number,
  totalDraftPicks?: number,
): PositionProbability[] => {
  const surface = createEmpiricalOpponentFeatureSurface(
    context,
    overallPick,
    rosterIndex,
    totalDraftPicks,
  )
  const probabilities = predictEmpiricalOpponentProbabilities(artifactModel, surface)
  return EMPIRICAL_OPPONENT_POSITIONS.map((position, index) => ({
    position,
    probability: probabilities[index],
  }))
}

/**
 * Mirrors exactly the frozen forecast's opponent window, but stores only the
 * learned-base positional/running signals. It is never supplied to advice.
 */
export const createEmpiricalBaseShadowForecast = (
  context: DraftAdvisorContext,
  frozenForecast: OpponentForecast,
  totalDraftPicks?: number,
): EmpiricalBaseShadowForecast => {
  const phaseProvenance = empiricalDraftPhaseProvenance(context, totalDraftPicks)
  const picks = frozenForecast.picks.map(pick => ({
    overallPick: pick.overallPick,
    rosterIndex: pick.rosterIndex,
    positionProbabilities: positionProbabilitiesFor(
      context,
      pick.overallPick,
      pick.rosterIndex,
      totalDraftPicks,
    ),
  }))
  const runLength = frozenForecast.runProbabilities[0]?.minimumPicks || 3
  return {
    schemaVersion: 1,
    modelIdentity: EMPIRICAL_BASE_SHADOW_MODEL_IDENTITY,
    artifactId: EMPIRICAL_BASE_SHADOW_ARTIFACT.id,
    trainingCorpusFingerprint: EMPIRICAL_BASE_SHADOW_ARTIFACT.trainingCorpusFingerprint,
    targetRosterIndex: frozenForecast.targetRosterIndex,
    phaseProvenance,
    picks,
    runProbabilities: EMPIRICAL_OPPONENT_POSITIONS.map(position => ({
      position,
      minimumPicks: runLength,
      probability: probabilityOfAtLeast(picks.map(pick =>
        pick.positionProbabilities.find(candidate => candidate.position === position)
          ?.probability || 0), runLength),
    })),
  }
}
