import slotOneFixtureJson from "../__tests__/fixtures/recorded-espn-2026-07-31-league-1788370838-slot-1.json"
import slotEightFixtureJson from "../__tests__/fixtures/recorded-espn-2026-07-31-league-510719609-slot-8.json"
import slotThreeFixtureJson from "../__tests__/fixtures/recorded-espn-2026-slot-3-12-team-standard.json"
import slotSixFixtureJson from "../__tests__/fixtures/recorded-espn-2026-slot-6-10-team-standard.json"
import slotNineFixtureJson from "../__tests__/fixtures/recorded-espn-2026-slot-9.json"
import {
  EMPIRICAL_OPPONENT_CONFIG,
  runEmpiricalOpponentV2Evaluation,
} from "../behavior/draft-advisor/opponentEmpiricalV2"
import type { RecordedCompletedDraftReplay } from "../behavior/draft-advisor/completedDraftReplay"

const fixtures = [
  slotOneFixtureJson,
  slotThreeFixtureJson,
  slotSixFixtureJson,
  slotEightFixtureJson,
  slotNineFixtureJson,
] as unknown as RecordedCompletedDraftReplay[]

describe("opponent empirical v2 LODO evaluation", () => {
  it("fits only on other whole drafts and remains offline-only", () => {
    const report = runEmpiricalOpponentV2Evaluation(fixtures)
    if (process.env.EMPIRICAL_OPPONENT_V2_REPORT === "1") {
      console.log(JSON.stringify({
        corpus: {
          fixtureCount: report.corpus.fixtures.length,
          exampleCount: report.corpus.examples.length,
          fixtures: report.corpus.fixtures,
          skippedFixtures: report.corpus.skippedFixtures,
          preparationMs: report.corpus.preparationMs,
        },
        config: {
          training: EMPIRICAL_OPPONENT_CONFIG,
          // The model diagnostics expose iterations/loss/runtime; feature names
          // and coefficients are emitted per fold below for auditability.
          baseFeatureNames: report.fullDataModels.baseModel.featureNames,
          formatFeatureNames: report.fullDataModels.formatModel.featureNames,
          baseParameterCount: report.fullDataModels.baseModel.coefficients
            .reduce((count, row) => count + row.length, 0),
          formatParameterCount: report.fullDataModels.formatModel.coefficients
            .reduce((count, row) => count + row.length, 0),
        },
        folds: report.folds.map(fold => ({
          holdoutFixtureId: fold.holdoutFixtureId,
          holdoutLeagueFormat: fold.holdoutLeagueFormat,
          trainingFixtureIds: fold.trainingFixtureIds,
          trainingExampleCount: fold.trainingExampleCount,
          holdoutExampleCount: fold.holdoutExampleCount,
          holdout: fold.holdout,
          baseVsFrozen: fold.baseVsFrozen,
          formatVsFrozen: fold.formatVsFrozen,
          formatVsBase: fold.formatVsBase,
          baseModel: fold.baseModel,
          formatModel: fold.formatModel,
          inferenceEvaluationMs: fold.inferenceEvaluationMs,
        })),
        aggregateHoldout: report.aggregateHoldout,
        aggregateDeltas: report.aggregateDeltas,
        byFixture: report.byFixture,
        byLeagueFormat: report.byLeagueFormat,
        fullDataModels: report.fullDataModels,
        runtimes: report.runtimes,
        runWindowEvaluation: report.runWindowEvaluation,
        promotion: report.promotion,
      }, null, 2))
    }

    expect(report.corpus.fixtures).toHaveLength(5)
    expect(report.corpus.skippedFixtures).toEqual([])
    expect(report.folds).toHaveLength(5)
    expect(report.folds.every(fold => fold.trainingFixtureIds.length === 4)).toBe(true)
    expect(report.folds.every(fold => !fold.trainingFixtureIds.includes(fold.holdoutFixtureId)))
      .toBe(true)
    expect(report.aggregateHoldout.frozenV1.evaluatedPicks)
      .toBe(report.corpus.examples.length)
    expect(report.promotion.promoted).toBe(false)
    expect(report.runWindowEvaluation.evaluated).toBe(false)
  })
})
