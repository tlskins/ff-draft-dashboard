import slotSixFixtureJson from "../__tests__/fixtures/recorded-espn-2026-slot-6-10-team-standard.json"
import slotOneFixtureJson from "../__tests__/fixtures/recorded-espn-2026-07-31-league-1788370838-slot-1.json"
import {
  opponentMetricDeltas,
  runOpponentV2Tuning,
} from "../behavior/draft-advisor/opponentModelTuning"
import type { RecordedCompletedDraftReplay } from "../behavior/draft-advisor/completedDraftReplay"

const fixtures = [slotSixFixtureJson, slotOneFixtureJson] as unknown as RecordedCompletedDraftReplay[]

describe("opponent-model v2 tuning", () => {
  it("reports bounded cross-format challenger selection without live promotion", () => {
    const report = runOpponentV2Tuning(fixtures)
    if (process.env.V2_OPPONENT_TUNING_REPORT === "1") {
      console.log(JSON.stringify({
        runtimeMs: {
          preparation: report.preparationMs,
          candidateEvaluation: report.evaluationMs,
          total: report.preparationMs + report.evaluationMs,
        },
        searchCandidateCount: report.searchCandidateCount,
        ablations: report.ablations.map(result => ({
          id: result.candidate.id,
          metrics: result.metrics,
        })),
        folds: report.folds.map(fold => ({
          trainingFormat: fold.trainingFormat,
          holdoutFormat: fold.holdoutFormat,
          selectedCandidate: fold.selection.selected.candidate.id,
          trainingDeltas: opponentMetricDeltas(
            fold.selection.baseline.metrics,
            fold.selection.selected.metrics,
          ),
          holdoutMetrics: fold.holdout.metrics,
          holdoutDeltas: fold.holdoutDeltas,
        })),
        aggregateHoldout: report.aggregateHoldout,
        aggregateHoldoutBaseline: report.aggregateHoldoutBaseline,
        aggregateHoldoutDeltas: report.aggregateHoldoutDeltas,
        descriptiveFullData: {
          selectedCandidate: report.descriptiveFullData.candidate.id,
          metrics: report.descriptiveFullData.metrics,
          deltas: opponentMetricDeltas(
            report.fullDataSelection.baseline.metrics,
            report.descriptiveFullData.metrics,
          ),
        },
        promotion: report.promotion,
      }, null, 2))
    }
    expect(report.searchCandidateCount).toBe(6)
    expect(report.ablations).toHaveLength(4)
    expect(report.folds).toHaveLength(2)
    expect(report.folds.map(fold => fold.holdout.labeledPickCount).reduce((a, b) => a + b, 0))
      .toBe(191)
    expect(report.promotion.promoted).toBe(false)
  })
})
