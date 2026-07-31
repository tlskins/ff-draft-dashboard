import { FantasyPosition } from "../../types"
import {
  createRecordedDraftAdvisorContextAtBoundary,
} from "./completedDraftReplay"
import type {
  RecordedCompletedDraftReplay,
  ReplayForecastObservation,
} from "./completedDraftReplay"
import {
  createOpponentForecast,
  hasLeagueAwareOpponentConfig,
  INITIAL_V2_OPPONENT_CONFIG,
  V1_EQUIVALENT_OPPONENT_CONFIG,
} from "./opponentModel"
import type { OpponentModelBlendConfig } from "./opponentModel"
import {
  leagueFormatFor,
  scoreOpponentForecast,
  validateRecordedOpponentForecastEvidence,
} from "./replayMetrics"
import type {
  ActualOpponentPick,
  OpponentForecastMetricDeltas,
  OpponentForecastMetrics,
  RecordedOpponentModelFixtureResult,
} from "./replayMetrics"
import type { DraftAdvisorContext, OpponentForecast } from "./types"

const TUNABLE_POSITIONS = new Set<FantasyPosition>([
  FantasyPosition.QUARTERBACK,
  FantasyPosition.RUNNING_BACK,
  FantasyPosition.WIDE_RECEIVER,
  FantasyPosition.TIGHT_END,
])

export interface PreparedOpponentWindow {
  observedThroughOverallPick: number
  terminalPick: number
  /** Saved v1 window slots, retained for exact challenger reconstruction. */
  expectedPicks: Array<{ overallPick: number; rosterIndex: number }>
  context: DraftAdvisorContext
}

/** A scoped, immutable-by-convention replay cache. Never stored globally. */
export interface PreparedOpponentFixture {
  fixtureId: string
  leagueFormat: string
  ppr: boolean
  targetRosterIndex: number
  actualPicks: ActualOpponentPick[]
  windows: PreparedOpponentWindow[]
}

export interface PreparedOpponentReplay {
  fixtures: PreparedOpponentFixture[]
  preparationMs: number
}

export interface TunedOpponentCandidate {
  id: string
  config: OpponentModelBlendConfig
}

export interface CandidateEvaluation {
  candidate: TunedOpponentCandidate
  result: RecordedOpponentModelFixtureResult
}

export interface CandidateAggregateEvaluation {
  candidate: TunedOpponentCandidate
  labeledFixtureCount: number
  labeledWindowCount: number
  labeledPickCount: number
  metrics: OpponentForecastMetrics
  byFixture: RecordedOpponentModelFixtureResult[]
}

export interface CandidateSelection {
  selected: CandidateAggregateEvaluation
  baseline: CandidateAggregateEvaluation
  considered: Array<CandidateAggregateEvaluation & {
    deltas: OpponentForecastMetricDeltas
    trainingEligible: boolean
  }>
}

export const OPPONENT_V2_ABLATION_CANDIDATES: TunedOpponentCandidate[] = [
  {
    id: "ablation_adp",
    config: { id: "ablation_adp", adpWeight: 1, directNeedWeight: 0, formatFlexPressureWeight: 0, recentRunWeight: 0 },
  },
  {
    id: "ablation_direct_need",
    config: { id: "ablation_direct_need", adpWeight: 0, directNeedWeight: 1, formatFlexPressureWeight: 0, recentRunWeight: 0 },
  },
  {
    id: "ablation_format_pressure",
    config: { id: "ablation_format_pressure", adpWeight: 0, directNeedWeight: 0, formatFlexPressureWeight: 1, recentRunWeight: 0 },
  },
  {
    id: "ablation_recent_run",
    config: { id: "ablation_recent_run", adpWeight: 0, directNeedWeight: 0, formatFlexPressureWeight: 0, recentRunWeight: 1 },
  },
]

/** Residual-only ablations retain the frozen v1 blend and vary no constants. */
export const OPPONENT_V2_RESIDUAL_ABLATION_CANDIDATES: TunedOpponentCandidate[] = [
  {
    id: "marginal_scarcity_light",
    config: {
      ...V1_EQUIVALENT_OPPONENT_CONFIG,
      id: "marginal_scarcity_light",
      formatAdjustment: { kind: "marginal_scarcity_v1", strength: 0.1 },
    },
  },
  {
    id: "marginal_scarcity_balanced",
    config: {
      ...V1_EQUIVALENT_OPPONENT_CONFIG,
      id: "marginal_scarcity_balanced",
      formatAdjustment: { kind: "marginal_scarcity_v1", strength: 0.25 },
    },
  },
  {
    id: "marginal_scarcity_capped",
    config: {
      ...V1_EQUIVALENT_OPPONENT_CONFIG,
      id: "marginal_scarcity_capped",
      formatAdjustment: { kind: "marginal_scarcity_v1", strength: 0.5 },
    },
  },
]

/**
 * This intentionally small grid searches blend weights, not PPR/standard
 * multipliers. The format-pressure source remains interpretable and fixed.
 */
export const OPPONENT_V2_LEGACY_SEARCH_CANDIDATES: TunedOpponentCandidate[] = [
  { id: "v1_equivalent", config: V1_EQUIVALENT_OPPONENT_CONFIG },
  { id: "initial_v2", config: INITIAL_V2_OPPONENT_CONFIG },
  {
    id: "format_light",
    config: { id: "format_light", adpWeight: 0.55, directNeedWeight: 0.3, formatFlexPressureWeight: 0.05, recentRunWeight: 0.1 },
  },
  {
    id: "format_balanced",
    config: { id: "format_balanced", adpWeight: 0.5, directNeedWeight: 0.3, formatFlexPressureWeight: 0.1, recentRunWeight: 0.1 },
  },
  {
    id: "format_conservative",
    config: { id: "format_conservative", adpWeight: 0.55, directNeedWeight: 0.25, formatFlexPressureWeight: 0.1, recentRunWeight: 0.1 },
  },
  {
    id: "format_pressure",
    config: { id: "format_pressure", adpWeight: 0.5, directNeedWeight: 0.25, formatFlexPressureWeight: 0.15, recentRunWeight: 0.1 },
  },
]

/** Fixed bounded grid; PPR/Standard allocations are feature hypotheses, not tuned. */
export const OPPONENT_V2_SEARCH_CANDIDATES: TunedOpponentCandidate[] = [
  ...OPPONENT_V2_LEGACY_SEARCH_CANDIDATES,
  ...OPPONENT_V2_RESIDUAL_ABLATION_CANDIDATES,
]

export const V1_EQUIVALENT_CANDIDATE = OPPONENT_V2_SEARCH_CANDIDATES[0]

const mean = (values: number[]): number => values.length
  ? values.reduce((sum, value) => sum + value, 0) / values.length
  : 0

const expectedOpponentPicks = (
  fixture: RecordedCompletedDraftReplay,
  observation: ReplayForecastObservation,
): Array<{ overallPick: number; rosterIndex: number }> => {
  const expected: Array<{ overallPick: number; rosterIndex: number }> = []
  for (let overallPick = observation.observedThroughOverallPick + 1;
    overallPick <= fixture.actualPicks.length;
    overallPick += 1) {
    const rosterIndex = fixture.actualPicks[overallPick - 1]?.rosterIndex
    if (rosterIndex === observation.targetRosterIndex) {
      if (expected.length > 0) break
      continue
    }
    expected.push({ overallPick, rosterIndex })
  }
  return expected
}

const actualOpponentPicks = (
  fixture: RecordedCompletedDraftReplay,
): ActualOpponentPick[] => fixture.actualPicks.flatMap(actual => {
  if (!actual.playerId || actual.rosterIndex === fixture.targetRosterIndex) return []
  const player = fixture.players.find(candidate => candidate.id === actual.playerId)
  return player && TUNABLE_POSITIONS.has(player.position)
    ? [{ overallPick: actual.overallPick, playerId: actual.playerId, position: player.position }]
    : []
})

/** Build each canonical boundary exactly once; labels are never passed in. */
export const prepareRecordedOpponentReplay = (
  fixtures: RecordedCompletedDraftReplay[],
): PreparedOpponentReplay => {
  const startedAt = performance.now()
  const prepared = fixtures.map(fixture => {
    if (!fixture.forecastEvidence) {
      throw new Error(`${fixture.id} has no live forecast boundaries`)
    }
    const errors = validateRecordedOpponentForecastEvidence(fixture)
    if (errors.length) throw new Error(`${fixture.id} has invalid evidence: ${errors.join("; ")}`)
    const windows = fixture.forecastEvidence.observations.map(observation => {
      const terminalPick = Math.max(...observation.forecast.picks.map(pick => pick.overallPick))
      const expected = expectedOpponentPicks(fixture, observation)
        .filter(pick => pick.overallPick <= terminalPick)
      const currentPick = expected[0]?.overallPick
      if (!currentPick) throw new Error(`${fixture.id} has an empty opponent window`)
      const context = createRecordedDraftAdvisorContextAtBoundary(
        fixture,
        observation.observedThroughOverallPick,
        terminalPick - currentPick + 2,
        currentPick,
      )
      return {
        observedThroughOverallPick: observation.observedThroughOverallPick,
        terminalPick,
        expectedPicks: expected,
        context,
      }
    })
    return {
      fixtureId: fixture.id,
      leagueFormat: leagueFormatFor(fixture),
      ppr: fixture.settings.ppr,
      targetRosterIndex: fixture.targetRosterIndex,
      actualPicks: actualOpponentPicks(fixture),
      windows,
    }
  })
  return { fixtures: prepared, preparationMs: performance.now() - startedAt }
}

const emptyMetrics = (): OpponentForecastMetrics => ({
  evaluatedPicks: 0,
  positionBrierScore: 0,
  topPositionAccuracy: 0,
  playerTopThreeAccuracy: 0,
  runPrecision: 0,
  runRecall: 0,
  tierCrossingBrierScore: 0,
})

/** Same count-correct aggregation denominators as the recorded challenger. */
export const aggregateOpponentTuningMetrics = (
  results: Array<{ labeledPickCount: number; labeledWindowCount: number; metrics: OpponentForecastMetrics }>,
): OpponentForecastMetrics => {
  const totalPicks = results.reduce((total, result) => total + result.labeledPickCount, 0)
  const totalWindows = results.reduce((total, result) => total + result.labeledWindowCount, 0)
  const pickWeighted = (key: "positionBrierScore" | "topPositionAccuracy" | "playerTopThreeAccuracy") =>
    totalPicks ? results.reduce((total, result) => total + result.metrics[key] * result.labeledPickCount, 0) / totalPicks : 0
  const windowWeighted = (key: "runPrecision" | "runRecall" | "tierCrossingBrierScore") =>
    totalWindows ? results.reduce((total, result) => total + result.metrics[key] * result.labeledWindowCount, 0) / totalWindows : 0
  return {
    evaluatedPicks: totalPicks,
    positionBrierScore: pickWeighted("positionBrierScore"),
    topPositionAccuracy: pickWeighted("topPositionAccuracy"),
    playerTopThreeAccuracy: pickWeighted("playerTopThreeAccuracy"),
    runPrecision: windowWeighted("runPrecision"),
    runRecall: windowWeighted("runRecall"),
    tierCrossingBrierScore: windowWeighted("tierCrossingBrierScore"),
  }
}

export const opponentMetricDeltas = (
  baseline: OpponentForecastMetrics,
  challenger: OpponentForecastMetrics,
): OpponentForecastMetricDeltas => ({
  positionBrierScore: challenger.positionBrierScore - baseline.positionBrierScore,
  topPositionAccuracy: challenger.topPositionAccuracy - baseline.topPositionAccuracy,
  playerTopThreeAccuracy: challenger.playerTopThreeAccuracy - baseline.playerTopThreeAccuracy,
  runPrecision: challenger.runPrecision - baseline.runPrecision,
  runRecall: challenger.runRecall - baseline.runRecall,
  tierCrossingBrierScore: challenger.tierCrossingBrierScore - baseline.tierCrossingBrierScore,
})

export const evaluatePreparedOpponentFixture = (
  prepared: PreparedOpponentFixture,
  candidate: TunedOpponentCandidate,
): CandidateEvaluation => {
  const forecasts = prepared.windows.map(window => ({
    ...window,
    forecast: createOpponentForecast(window.context, {
      model: "combined_v2",
      targetRosterIndex: prepared.targetRosterIndex,
      combinedV2Config: candidate.config,
    }),
  }))
  forecasts.forEach(item => {
    if (item.forecast.picks.length !== item.expectedPicks.length
      || item.forecast.picks.some((pick, index) =>
        pick.overallPick !== item.expectedPicks[index].overallPick
        || pick.rosterIndex !== item.expectedPicks[index].rosterIndex)) {
      throw new Error(`${prepared.fixtureId} forecast did not reconstruct its saved opponent window`)
    }
  })
  const pickScores = prepared.actualPicks.flatMap(actual => {
    const owner = forecasts.filter(candidate =>
      candidate.observedThroughOverallPick < actual.overallPick
      && candidate.terminalPick >= actual.overallPick,
    ).sort((left, right) => right.observedThroughOverallPick - left.observedThroughOverallPick)[0]
    return owner ? [scoreOpponentForecast(owner.forecast, [actual])] : []
  })
  const representatives = new Map<number, typeof forecasts[number]>()
  forecasts.forEach(candidate => {
    const existing = representatives.get(candidate.terminalPick)
    if (!existing || candidate.observedThroughOverallPick < existing.observedThroughOverallPick) {
      representatives.set(candidate.terminalPick, candidate)
    }
  })
  const windowScores = Array.from(representatives.values()).map(candidate =>
    scoreOpponentForecast(candidate.forecast, prepared.actualPicks.filter(actual =>
      actual.overallPick > candidate.observedThroughOverallPick
      && actual.overallPick <= candidate.terminalPick,
    )))
  const pickMetrics = aggregateOpponentTuningMetrics(pickScores.map(metrics => ({
    labeledPickCount: metrics.evaluatedPicks,
    labeledWindowCount: 0,
    metrics,
  })))
  return {
    candidate,
    result: {
      available: true,
      fixtureId: prepared.fixtureId,
      leagueFormat: prepared.leagueFormat,
      labeledWindowCount: windowScores.length,
      labeledPickCount: pickMetrics.evaluatedPicks,
      metrics: {
        ...pickMetrics,
        runPrecision: mean(windowScores.map(metric => metric.runPrecision)),
        runRecall: mean(windowScores.map(metric => metric.runRecall)),
        tierCrossingBrierScore: mean(windowScores.map(metric => metric.tierCrossingBrierScore)),
      },
    },
  }
}

export const evaluatePreparedOpponentCandidate = (
  prepared: PreparedOpponentReplay | PreparedOpponentFixture[],
  candidate: TunedOpponentCandidate,
): CandidateAggregateEvaluation => {
  const fixtures = Array.isArray(prepared) ? prepared : prepared.fixtures
  const byFixture = fixtures.map(fixture =>
    evaluatePreparedOpponentFixture(fixture, candidate).result)
  return {
    candidate,
    labeledFixtureCount: byFixture.length,
    labeledWindowCount: byFixture.reduce((total, result) => total + result.labeledWindowCount, 0),
    labeledPickCount: byFixture.reduce((total, result) => total + result.labeledPickCount, 0),
    metrics: byFixture.length ? aggregateOpponentTuningMetrics(byFixture) : emptyMetrics(),
    byFixture,
  }
}

// These deliberately modest training tolerances only decide whether a
// candidate may compete with abstention; promotion gates below are stricter.
const trainingEligible = (deltas: OpponentForecastMetricDeltas): boolean =>
  deltas.positionBrierScore <= 0.01
  && deltas.topPositionAccuracy >= -0.02
  && deltas.runPrecision >= -0.05
  && deltas.runRecall >= -0.05

/** Stable ordering makes equal candidates select the same id every time. */
export const selectOpponentV2Candidate = (
  prepared: PreparedOpponentReplay | PreparedOpponentFixture[],
  candidates = OPPONENT_V2_SEARCH_CANDIDATES,
): CandidateSelection => {
  const baseline = evaluatePreparedOpponentCandidate(prepared, V1_EQUIVALENT_CANDIDATE)
  const considered = candidates.map(candidate => {
    const evaluation = candidate.id === V1_EQUIVALENT_CANDIDATE.id
      ? baseline
      : evaluatePreparedOpponentCandidate(prepared, candidate)
    const deltas = opponentMetricDeltas(baseline.metrics, evaluation.metrics)
    return { ...evaluation, deltas, trainingEligible: trainingEligible(deltas) }
  })
  const selected = [...considered]
    .filter(candidate => candidate.trainingEligible)
    .sort((left, right) =>
      left.deltas.positionBrierScore - right.deltas.positionBrierScore
      || right.deltas.topPositionAccuracy - left.deltas.topPositionAccuracy
      || right.deltas.runPrecision - left.deltas.runPrecision
      || right.deltas.runRecall - left.deltas.runRecall
      || left.candidate.id.localeCompare(right.candidate.id))[0]
  if (!selected) throw new Error("v1-equivalent candidate must permit abstention")
  return { selected, baseline, considered }
}

export interface OpponentV2TuningFold {
  trainingFormat: "STANDARD" | "PPR"
  holdoutFormat: "STANDARD" | "PPR"
  selection: CandidateSelection
  holdout: CandidateAggregateEvaluation
  holdoutBaseline: CandidateAggregateEvaluation
  holdoutDeltas: OpponentForecastMetricDeltas
}

export interface OpponentV2PromotionDecision {
  promoted: false
  reason: string
  gates: {
    selectionsAgreeOnOneCandidate: boolean
    selectedCandidateIsLeagueAware: boolean
    everyFoldPositionBrierNonRegressing: boolean
    everyFoldTopPositionNonRegressing: boolean
    everyFoldRunPrecisionTolerance: boolean
    everyFoldRunRecallTolerance: boolean
    aggregatePositionBrierNonRegressing: boolean
    aggregateTopPositionNonRegressing: boolean
    aggregateRunPrecisionTolerance: boolean
    aggregateRunRecallTolerance: boolean
  }
}

export interface OpponentV2TuningReport {
  available: true
  preparationMs: number
  evaluationMs: number
  searchCandidateCount: number
  legacySearchCandidateCount: number
  residualSearchCandidateCount: number
  ablations: CandidateAggregateEvaluation[]
  residualAblations: CandidateAggregateEvaluation[]
  folds: OpponentV2TuningFold[]
  aggregateHoldout: OpponentForecastMetrics
  aggregateHoldoutBaseline: OpponentForecastMetrics
  aggregateHoldoutDeltas: OpponentForecastMetricDeltas
  fullDataSelection: CandidateSelection
  descriptiveFullData: CandidateAggregateEvaluation
  promotion: OpponentV2PromotionDecision
}

/**
 * Two-fold Standard/PPR replay. This is cross-format holdout accounting, not
 * strong validation: it contains exactly two labeled fixtures today.
 */
export const runOpponentV2Tuning = (
  fixtures: RecordedCompletedDraftReplay[],
): OpponentV2TuningReport => {
  const prepared = prepareRecordedOpponentReplay(fixtures)
  const startedAt = performance.now()
  const standard = prepared.fixtures.filter(fixture => !fixture.ppr)
  const ppr = prepared.fixtures.filter(fixture => fixture.ppr)
  if (!standard.length || !ppr.length) {
    throw new Error("v2 tuning requires at least one labeled Standard and PPR fixture")
  }
  const foldInputs: Array<{
    trainingFormat: "STANDARD" | "PPR"
    holdoutFormat: "STANDARD" | "PPR"
    training: PreparedOpponentFixture[]
    holdout: PreparedOpponentFixture[]
  }> = [
    { trainingFormat: "STANDARD", holdoutFormat: "PPR", training: standard, holdout: ppr },
    { trainingFormat: "PPR", holdoutFormat: "STANDARD", training: ppr, holdout: standard },
  ]
  const folds: OpponentV2TuningFold[] = foldInputs.map(({ trainingFormat, holdoutFormat, training, holdout }) => {
    const selection = selectOpponentV2Candidate(training)
    const holdoutEvaluation = evaluatePreparedOpponentCandidate(
      holdout,
      selection.selected.candidate,
    )
    const holdoutBaseline = evaluatePreparedOpponentCandidate(
      holdout,
      V1_EQUIVALENT_CANDIDATE,
    )
    return {
      trainingFormat,
      holdoutFormat,
      selection,
      holdout: holdoutEvaluation,
      holdoutBaseline,
      holdoutDeltas: opponentMetricDeltas(holdoutBaseline.metrics, holdoutEvaluation.metrics),
    }
  })
  const aggregateHoldout = aggregateOpponentTuningMetrics(folds.map(fold => ({
    labeledPickCount: fold.holdout.labeledPickCount,
    labeledWindowCount: fold.holdout.labeledWindowCount,
    metrics: fold.holdout.metrics,
  })))
  const aggregateHoldoutBaseline = aggregateOpponentTuningMetrics(folds.map(fold => ({
    labeledPickCount: fold.holdoutBaseline.labeledPickCount,
    labeledWindowCount: fold.holdoutBaseline.labeledWindowCount,
    metrics: fold.holdoutBaseline.metrics,
  })))
  const aggregateHoldoutDeltas = opponentMetricDeltas(
    aggregateHoldoutBaseline,
    aggregateHoldout,
  )
  const selectionIds = new Set(folds.map(fold => fold.selection.selected.candidate.id))
  const selectedCandidate = folds[0].selection.selected.candidate
  const everyFold = (predicate: (deltas: OpponentForecastMetricDeltas) => boolean) =>
    folds.every(fold => predicate(fold.holdoutDeltas))
  const gates = {
    selectionsAgreeOnOneCandidate: selectionIds.size === 1,
    selectedCandidateIsLeagueAware: selectionIds.size === 1
      && hasLeagueAwareOpponentConfig(selectedCandidate.config),
    everyFoldPositionBrierNonRegressing: everyFold(deltas =>
      deltas.positionBrierScore <= 0),
    everyFoldTopPositionNonRegressing: everyFold(deltas =>
      deltas.topPositionAccuracy >= 0),
    everyFoldRunPrecisionTolerance: everyFold(deltas =>
      deltas.runPrecision >= -0.02),
    everyFoldRunRecallTolerance: everyFold(deltas =>
      deltas.runRecall >= -0.02),
    aggregatePositionBrierNonRegressing: aggregateHoldoutDeltas.positionBrierScore <= 0,
    aggregateTopPositionNonRegressing: aggregateHoldoutDeltas.topPositionAccuracy >= 0,
    aggregateRunPrecisionTolerance: aggregateHoldoutDeltas.runPrecision >= -0.02,
    aggregateRunRecallTolerance: aggregateHoldoutDeltas.runRecall >= -0.02,
  }
  const passed = Object.values(gates).every(Boolean)
  const failedGateNames = Object.entries(gates)
    .filter(([, passedGate]) => !passedGate)
    .map(([gate]) => gate)
  const promotionReason = !gates.selectedCandidateIsLeagueAware
    && gates.selectionsAgreeOnOneCandidate
    && selectedCandidate.id === V1_EQUIVALENT_CANDIDATE.id
    ? "no promotion: both folds selected the v1-equivalent abstention; no league-aware candidate met the training selection rule"
    : passed
      ? "offline policy never promotes directly; require shadow validation"
      : `no promotion: failed gates: ${failedGateNames.join(", ")}`
  const fullDataSelection = selectOpponentV2Candidate(prepared)
  const ablations = OPPONENT_V2_ABLATION_CANDIDATES.map(candidate =>
    evaluatePreparedOpponentCandidate(prepared, candidate))
  const residualAblations = OPPONENT_V2_RESIDUAL_ABLATION_CANDIDATES.map(candidate =>
    evaluatePreparedOpponentCandidate(prepared, candidate))
  const evaluationMs = performance.now() - startedAt
  return {
    available: true,
    preparationMs: prepared.preparationMs,
    evaluationMs,
    searchCandidateCount: OPPONENT_V2_SEARCH_CANDIDATES.length,
    legacySearchCandidateCount: OPPONENT_V2_LEGACY_SEARCH_CANDIDATES.length,
    residualSearchCandidateCount: OPPONENT_V2_RESIDUAL_ABLATION_CANDIDATES.length,
    ablations,
    residualAblations,
    folds,
    aggregateHoldout,
    aggregateHoldoutBaseline,
    aggregateHoldoutDeltas,
    fullDataSelection,
    descriptiveFullData: fullDataSelection.selected,
    promotion: {
      promoted: false,
      reason: promotionReason,
      gates,
    },
  }
}
