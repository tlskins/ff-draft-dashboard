import {
  DraftReplayStrategy,
  RecordedCompletedDraftReplay,
  runCompletedDraftReplay,
} from "./completedDraftReplay"
import { validateCompletedDraftReplay } from "./replayFixtures"

const STRATEGIES: DraftReplayStrategy[] = [
  "combined",
  "adp_only",
  "need_only",
  "rank_only",
]

export const PHASE_4_CALIBRATION_THRESHOLDS = {
  minimumRecordedReplays: 5,
  minimumDistinctDraftSlots: 4,
  minimumStarterCompleteness: 1,
  maximumPositionalRankViolations: 0,
  maximumDecisionLatencyP95Ms: 150,
  minimumCombinedVsBestStarterRatio: 0.9,
  minimumCombinedVsBestBenchRatio: 0.9,
} as const

export interface CompletedDraftCalibrationScenario {
  id: string
  fixture: RecordedCompletedDraftReplay
}

export interface CompletedDraftCalibrationResult {
  scenarioCount: number
  recordedReplayCount: number
  distinctDraftSlots: number
  results: ReturnType<typeof runCompletedDraftReplay>[]
  combined: {
    legalRate: number
    minimumStarterCompleteness: number
    positionalRankViolations: number
    maximumDecisionLatencyP95Ms: number
    minimumVsBestStarterRatio: number
    minimumVsBestBenchRatio: number
  }
}

export interface Phase4CalibrationAudit {
  ready: boolean
  unmet: string[]
}

export const runCompletedDraftCalibrationMatrix = (
  scenarios: CompletedDraftCalibrationScenario[],
): CompletedDraftCalibrationResult => {
  scenarios.forEach(scenario => {
    const errors = validateCompletedDraftReplay(scenario.fixture)
    if (errors.length > 0) {
      throw new Error(
        `Invalid replay ${scenario.id}: ${errors.join("; ")}`,
      )
    }
  })
  const results = scenarios.flatMap(scenario =>
    STRATEGIES.map(strategy =>
      runCompletedDraftReplay(scenario.fixture, strategy)))
  const recordedScenarios = scenarios.filter(scenario =>
    scenario.fixture.provenance === "recorded")
  const recordedFixtureIds = new Set(recordedScenarios.map(scenario =>
    scenario.fixture.id))
  const combinedResults = results.filter(result => result.strategy === "combined")
  // Synthetic scenarios remain useful regression coverage, but no quality gate
  // may be satisfied by them.
  const evidenceCombinedResults = combinedResults.filter(result =>
    recordedFixtureIds.has(result.fixtureId))
  const ratios = evidenceCombinedResults.map(combined => {
    const sameFixture = results.filter(result =>
      result.fixtureId === combined.fixtureId)
    const bestStarterValue = Math.max(
      ...sameFixture.map(result =>
        result.quality.projectedStarterPoints),
    )
    return bestStarterValue > 0
      ? combined.quality.projectedStarterPoints / bestStarterValue
      : 1
  })
  const benchRatios = evidenceCombinedResults.map(combined => {
    const sameFixture = results.filter(result =>
      result.fixtureId === combined.fixtureId
      && result.quality.legal
      && result.quality.starterCompleteness === 1)
    const bestBenchCeiling = Math.max(
      ...sameFixture.map(result => result.quality.benchCeiling),
    )
    return bestBenchCeiling > 0
      ? combined.quality.benchCeiling / bestBenchCeiling
      : 1
  })

  return {
    scenarioCount: scenarios.length,
    recordedReplayCount: recordedScenarios.length,
    distinctDraftSlots: new Set(recordedScenarios.map(scenario =>
      scenario.fixture.targetRosterIndex)).size,
    results,
    combined: {
      legalRate: evidenceCombinedResults.length > 0
        ? evidenceCombinedResults.filter(result => result.quality.legal).length
          / evidenceCombinedResults.length
        : 0,
      minimumStarterCompleteness: evidenceCombinedResults.length > 0
        ? Math.min(...evidenceCombinedResults.map(result =>
          result.quality.starterCompleteness))
        : 0,
      positionalRankViolations: evidenceCombinedResults.reduce(
        (total, result) => total + result.positionalRankViolations,
        0,
      ),
      maximumDecisionLatencyP95Ms: evidenceCombinedResults.length > 0
        ? Math.max(...evidenceCombinedResults.map(result =>
          result.decisionLatencyP95Ms))
        : 0,
      minimumVsBestStarterRatio: ratios.length > 0
        ? Math.min(...ratios)
        : 0,
      minimumVsBestBenchRatio: benchRatios.length > 0
        ? Math.min(...benchRatios)
        : 0,
    },
  }
}

export const auditPhase4Calibration = (
  result: CompletedDraftCalibrationResult,
): Phase4CalibrationAudit => {
  const unmet: string[] = []
  if (
    result.recordedReplayCount
    < PHASE_4_CALIBRATION_THRESHOLDS.minimumRecordedReplays
  ) {
    unmet.push(
      `recorded replays ${result.recordedReplayCount}/${PHASE_4_CALIBRATION_THRESHOLDS.minimumRecordedReplays}`,
    )
  }
  if (
    result.distinctDraftSlots
    < PHASE_4_CALIBRATION_THRESHOLDS.minimumDistinctDraftSlots
  ) {
    unmet.push(
      `draft slots ${result.distinctDraftSlots}/${PHASE_4_CALIBRATION_THRESHOLDS.minimumDistinctDraftSlots}`,
    )
  }
  if (result.combined.legalRate < 1) {
    unmet.push("combined replay produced an illegal roster")
  }
  if (
    result.combined.minimumStarterCompleteness
    < PHASE_4_CALIBRATION_THRESHOLDS.minimumStarterCompleteness
  ) {
    unmet.push("combined replay left a starter slot incomplete")
  }
  if (
    result.combined.positionalRankViolations
    > PHASE_4_CALIBRATION_THRESHOLDS.maximumPositionalRankViolations
  ) {
    unmet.push("combined replay violated positional rank order")
  }
  if (
    result.combined.maximumDecisionLatencyP95Ms
    > PHASE_4_CALIBRATION_THRESHOLDS.maximumDecisionLatencyP95Ms
  ) {
    unmet.push("combined replay exceeded decision latency")
  }
  if (
    result.combined.minimumVsBestStarterRatio
    < PHASE_4_CALIBRATION_THRESHOLDS.minimumCombinedVsBestStarterRatio
  ) {
    unmet.push("combined replay fell below the starter-value floor")
  }
  if (
    result.combined.minimumVsBestBenchRatio
    < PHASE_4_CALIBRATION_THRESHOLDS.minimumCombinedVsBestBenchRatio
  ) {
    unmet.push("combined replay fell below the bench-upside floor")
  }
  return { ready: unmet.length === 0, unmet }
}
