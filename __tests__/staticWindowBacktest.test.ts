import slotOneFixtureJson from "./fixtures/recorded-espn-2026-07-31-league-1788370838-slot-1.json"
import slotSixFixtureJson from "./fixtures/recorded-espn-2026-slot-6-10-team-standard.json"
import {
  createRecordedDraftAdvisorContextAtBoundary,
} from "../behavior/draft-advisor/completedDraftReplay"
import {
  EMPIRICAL_BASE_SHADOW_ARTIFACT,
} from "../behavior/draft-advisor/empiricalBaseShadow"
import {
  applyBoundedOpponentResidual,
  createEmpiricalOpponentFeatureSurface,
  EMPIRICAL_BALANCED_RESIDUAL_CONFIG,
  EMPIRICAL_OPPONENT_POSITIONS,
  predictEmpiricalBalancedResidualProbabilities,
  predictEmpiricalOpponentProbabilities,
} from "../behavior/draft-advisor/opponentEmpiricalV2"
import {
  canonicalStaticWindowBoundaries,
  evaluateNestedRunGate,
  evaluateStaticWindowResidualGate,
  NESTED_RESIDUAL_CANDIDATES,
  NESTED_RUN_CANDIDATES,
  blendRunProbabilities,
  offlinePromotionReason,
  runProbabilityFromSlotProbabilities,
  runStaticWindowBacktest,
  selectNestedResidualCandidate,
  selectNestedRunCandidate,
  scoreNestedRunCandidate,
  STATIC_WINDOW_CALIBRATION_EDGES,
  STATIC_WINDOW_RUN_THRESHOLDS,
} from "../behavior/draft-advisor/staticWindowBacktest"
import { createOpponentForecast } from "../behavior/draft-advisor/opponentModel"
import type { RecordedCompletedDraftReplay } from "../behavior/draft-advisor/completedDraftReplay"
import type { StaticWindowRunMetrics, StaticWindowRunOnlyGroup } from "../behavior/draft-advisor/staticWindowBacktest"

const fixtures = [slotOneFixtureJson, slotSixFixtureJson] as unknown as RecordedCompletedDraftReplay[]
const [QB, RB, WR, TE] = EMPIRICAL_OPPONENT_POSITIONS

const withBrokenOpponentSlot = (
  fixture: RecordedCompletedDraftReplay,
): RecordedCompletedDraftReplay => {
  const broken = JSON.parse(JSON.stringify(fixture)) as RecordedCompletedDraftReplay
  broken.id = `${fixture.id}:broken-window`
  const pick = broken.actualPicks.find(candidate =>
    candidate.rosterIndex !== broken.targetRosterIndex)!
  let replacement = (pick.rosterIndex + 1) % broken.settings.numTeams
  if (replacement === broken.targetRosterIndex) {
    replacement = (replacement + 1) % broken.settings.numTeams
  }
  pick.rosterIndex = replacement
  return broken
}

describe("canonical static-window opponent backtest", () => {
  it("uses non-overlapping earliest boundaries and scores each eligible opponent pick once", () => {
    expect(canonicalStaticWindowBoundaries(fixtures[0])).toHaveLength(8)
    expect(canonicalStaticWindowBoundaries(fixtures[1])).toHaveLength(16)
    fixtures.forEach(fixture => {
      const windows = canonicalStaticWindowBoundaries(fixture)
      expect(windows).toEqual([...windows].sort((left, right) =>
        left.terminalTargetPick - right.terminalTargetPick))
      // A target drafting first has an empty start-to-first-target horizon,
      // which is intentionally omitted rather than counted as an all-negative run.
      expect(windows[0].observedThroughOverallPick).toBeLessThanOrEqual(1)
      windows.slice(1).forEach((window, index) => {
        expect(window.observedThroughOverallPick)
          .toBeGreaterThanOrEqual(windows[index].terminalTargetPick)
      })
      const labels = windows.flatMap(window => fixture.actualPicks.filter(pick =>
        pick.overallPick > window.observedThroughOverallPick
        && pick.overallPick < window.terminalTargetPick
        && pick.rosterIndex !== fixture.targetRosterIndex
        && pick.playerId
        && fixture.players.some(player => player.id === pick.playerId
          && ["QB", "RB", "WR", "TE"].includes(player.position))))
      expect(new Set(labels.map(label => label.overallPick)).size).toBe(labels.length)
    })
  })

  it("does not look ahead when a future recorded pick changes", () => {
    const fixture = fixtures[0]
    const window = canonicalStaticWindowBoundaries(fixture)[0]
    const later = fixture.actualPicks.find(pick =>
      pick.overallPick > window.observedThroughOverallPick
      && pick.overallPick < window.terminalTargetPick
      && pick.playerId
      && fixture.players.some(player => player.id === pick.playerId
        && ["QB", "RB", "WR", "TE"].includes(player.position)))!
    const changed = JSON.parse(JSON.stringify(fixture)) as RecordedCompletedDraftReplay
    changed.actualPicks.find(pick => pick.overallPick === later.overallPick)!.playerId = null
    const before = createRecordedDraftAdvisorContextAtBoundary(
      fixture, window.observedThroughOverallPick,
    )
    const after = createRecordedDraftAdvisorContextAtBoundary(
      changed, window.observedThroughOverallPick,
    )
    expect(after).toEqual(before)
    const afterForecast = createOpponentForecast(after, {
      model: "combined", targetRosterIndex: changed.targetRosterIndex,
    })
    const beforeForecast = createOpponentForecast(before, {
      model: "combined", targetRosterIndex: fixture.targetRosterIndex,
    })
    expect(afterForecast).toEqual(beforeForecast)
    const first = beforeForecast.picks[0]
    const beforeSurface = createEmpiricalOpponentFeatureSurface(
      before, first.overallPick, first.rosterIndex, before.totalDraftPicks,
    )
    const afterSurface = createEmpiricalOpponentFeatureSurface(
      after, first.overallPick, first.rosterIndex, after.totalDraftPicks,
    )
    expect(afterSurface).toEqual(beforeSurface)
    const immutableArtifactModel = {
      featureSet: "base" as const,
      featureNames: [...EMPIRICAL_BASE_SHADOW_ARTIFACT.featureNames],
      coefficients: EMPIRICAL_BASE_SHADOW_ARTIFACT.coefficients.map(row => [...row]),
      diagnostics: { examples: 656, initialLoss: 0, finalLoss: 0, iterations: 350, runtimeMs: 0 },
    }
    expect(predictEmpiricalOpponentProbabilities(immutableArtifactModel, afterSurface))
      .toEqual(predictEmpiricalOpponentProbabilities(immutableArtifactModel, beforeSurface))
    const frozenPositions = beforeForecast.picks[0].positionProbabilities.map(item => item.probability)
    const zeroResidualModel = {
      featureNames: ["intercept", "adp_log_probability", "direct_need_log_probability", "recent_run_log_probability", "draft_phase"],
      coefficients: Array.from({ length: 4 }, () => Array(5).fill(0)),
      classWeights: [1, 1, 1, 1],
      diagnostics: { examples: 0, initialLoss: 0, finalLoss: 0, iterations: 0, runtimeMs: 0 },
    }
    expect(predictEmpiricalBalancedResidualProbabilities(
      zeroResidualModel, frozenPositions, afterSurface,
    )).toEqual(predictEmpiricalBalancedResidualProbabilities(
      zeroResidualModel, frozenPositions, beforeSurface,
    ))
  })

  it("anchors bounded residuals to frozen v1 and limits their relative odds", () => {
    const baseline = [0.4, 0.3, 0.2, 0.1]
    applyBoundedOpponentResidual(baseline, [0, 0, 0, 0]).forEach((value, index) => {
      expect(value).toBeCloseTo(baseline[index])
    })
    const corrected = applyBoundedOpponentResidual(baseline, [100, -100, 0, 0])
    expect(corrected.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1)
    expect(corrected.every(value => value > 0 && value < 1)).toBe(true)
    const relativeOdds = (corrected[0] / corrected[1]) / (baseline[0] / baseline[1])
    expect(relativeOdds).toBeCloseTo(Math.exp(2
      * EMPIRICAL_BALANCED_RESIDUAL_CONFIG.residualLogitBound
      * EMPIRICAL_BALANCED_RESIDUAL_CONFIG.correctionStrength))
  })

  it("keeps model labels and horizons identical, aggregates pick metrics by count, and excludes the holdout fit", () => {
    const report = runStaticWindowBacktest(fixtures)
    expect(report.available).toBe(true)
    expect(report.coverage.repeatedPickLabels).toBe(0)
    expect(report.coverage.independentRepresentativeRunWindows)
      .toBe(report.coverage.canonicalWindowCount)
    expect(report.primary.frozenV1.pickMetrics.evaluatedPicks)
      .toBe(report.primary.learnedBaseLodo.pickMetrics.evaluatedPicks)
    expect(report.primary.learnedBaseLodo.pickMetrics.evaluatedPicks)
      .toBe(report.primary.fullDataArtifactDescriptive.pickMetrics.evaluatedPicks)
    expect(report.primary.learnedResidualLodo.pickMetrics.evaluatedPicks)
      .toBe(report.primary.frozenV1.pickMetrics.evaluatedPicks)
    // Two fixtures cannot supply inner whole-draft folds, so nested tuning
    // must use its exact frozen-v1 fallback rather than leak or fit anyway.
    expect(report.primary.nestedTunedResidualLodo).toEqual(report.primary.frozenV1)
    expect(report.nestedRunTuning.primary.runMetrics).toEqual(report.primary.frozenV1.runMetrics)
    report.byFixture.forEach(fixture => {
      expect(fixture.lodoTrainingFixtureIds).not.toContain(fixture.fixtureId)
      expect(fixture.frozenV1.pickMetrics.evaluatedPicks)
        .toBe(fixture.learnedBaseLodo.pickMetrics.evaluatedPicks)
    })
    const total = report.byFixture.reduce((sum, fixture) =>
      sum + fixture.frozenV1.pickMetrics.evaluatedPicks, 0)
    const weightedBrier = report.byFixture.reduce((sum, fixture) => sum
      + fixture.frozenV1.pickMetrics.positionBrierScore
        * fixture.frozenV1.pickMetrics.evaluatedPicks, 0) / total
    expect(report.primary.frozenV1.pickMetrics.positionBrierScore).toBeCloseTo(weightedBrier)
  })

  it("predeclares fixed thresholds and calibration bins and fails closed for absent or malformed fixtures", () => {
    expect(STATIC_WINDOW_RUN_THRESHOLDS).toEqual([0.25, 0.5, 0.75])
    expect(STATIC_WINDOW_CALIBRATION_EDGES).toEqual([0, 0.25, 0.5, 0.75, 1])
    const report = runStaticWindowBacktest([])
    expect(report.available).toBe(false)
    const malformed = runStaticWindowBacktest([{ id: "broken" }])
    expect(malformed.available).toBe(false)
    expect(malformed.skippedFixtures[0]).toEqual({
      fixtureId: "broken", reason: "fixture settings are malformed",
    })
  })

  it("requires two successfully reconstructed holdouts after a canonical-window failure", () => {
    const report = runStaticWindowBacktest([fixtures[0], withBrokenOpponentSlot(fixtures[1])])
    expect(report.available).toBe(false)
    expect(report.skippedFixtures.some(skipped =>
      skipped.fixtureId === `${fixtures[1].id}:broken-window`
      && skipped.reason.includes("canonical horizon mismatch"))).toBe(true)
  })

  it("does not read frozen or shadow evidence envelopes", () => {
    const baseline = runStaticWindowBacktest(fixtures)
    const withoutEvidence = fixtures.map((fixture, index) => {
      const clone = JSON.parse(JSON.stringify(fixture)) as RecordedCompletedDraftReplay
      if (index === 0) {
        ;(clone as unknown as { forecastEvidence: unknown }).forecastEvidence = { invalid: true }
      } else {
        delete (clone as unknown as { forecastEvidence?: unknown }).forecastEvidence
      }
      delete (clone as unknown as { empiricalBaseShadowEvidence?: unknown }).empiricalBaseShadowEvidence
      return clone
    })
    const replayed = runStaticWindowBacktest(withoutEvidence)
    expect(replayed.primary).toEqual(baseline.primary)
    expect(replayed.byFixture.map(fixture => ({
      fixtureId: fixture.fixtureId,
      canonicalWindows: fixture.canonicalWindows,
    }))).toEqual(baseline.byFixture.map(fixture => ({
      fixtureId: fixture.fixtureId,
      canonicalWindows: fixture.canonicalWindows,
    })))
  })

  it("fails the class gate when a challenger collapses QB and TE recall", () => {
    const report = runStaticWindowBacktest(fixtures)
    const collapsedPrimary = {
      ...report.primary,
      learnedResidualLodo: report.primary.learnedBaseLodo,
    }
    const collapsedByPosition = report.byActualPosition.map(group => ({
      ...group,
      learnedResidualLodo: group.learnedBaseLodo,
    }))
    const gate = evaluateStaticWindowResidualGate(collapsedPrimary, collapsedByPosition)
    expect(gate.eligibleForShadow).toBe(false)
    expect(gate.failures).toEqual(expect.arrayContaining([
      "QB recall regressed by more than 0.05",
      "TE recall regressed by more than 0.05",
    ]))
  })

  it("selects nested candidates deterministically and falls back to frozen v1", () => {
    expect(NESTED_RESIDUAL_CANDIDATES.map(candidate => candidate.id)).toEqual([
      "frozen_v1_identity",
      "residual_half_unweighted",
      "residual_half_sqrt_balance",
      "residual_full_balanced_reference",
    ])
    const score = (candidateId: string, eligible: boolean) => ({
      candidateId,
      positionBrierScore: 0.6,
      logLoss: 1.1,
      topPositionAccuracy: 0.4,
      macroRecall: 0.4,
      perPositionRecall: { QB: 0.4, RB: 0.4, WR: 0.4, TE: 0.4 },
      eligible,
      failures: eligible ? [] : ["guard failed"],
    })
    expect(selectNestedResidualCandidate([
      score("residual_b", true),
      score("residual_a", true),
      score("frozen_v1_identity", true),
    ])).toBe("residual_a")
    expect(selectNestedResidualCandidate([
      score("residual_a", false),
      score("frozen_v1_identity", true),
    ])).toBe("frozen_v1_identity")
  })

  it("keeps run identity exact and rejects a supported per-position collapse", () => {
    expect(NESTED_RUN_CANDIDATES.map(candidate => candidate.id)).toEqual([
      "frozen_v1_run_identity", "learned_base_run", "bounded_residual_run",
      "v1_learned_base_half_blend", "v1_bounded_residual_half_blend",
    ])
    const baseline = {
      brierScore: 0.1, logLoss: 0.3, precisionAtHalf: 1, recallAtHalf: 1, f1AtHalf: 1,
      evaluatedEvents: 4, positiveEvents: 3,
      perPosition: [
        { position: QB, evaluatedEvents: 1, positiveEvents: 1, brierScore: 0, recallAtHalf: 1 },
        { position: RB, evaluatedEvents: 1, positiveEvents: 1, brierScore: 0, recallAtHalf: 1 },
        { position: WR, evaluatedEvents: 1, positiveEvents: 1, brierScore: 0, recallAtHalf: 1 },
        { position: TE, evaluatedEvents: 1, positiveEvents: 0, brierScore: 0, recallAtHalf: null },
      ],
    }
    const collapse = scoreNestedRunCandidate("bounded_residual_run", [
      { position: QB, probability: 0, actual: true },
      { position: RB, probability: 0, actual: true },
      { position: WR, probability: 0, actual: true },
      { position: TE, probability: 0, actual: false },
    ], baseline)
    expect(collapse.eligible).toBe(false)
    expect(collapse.failures).toEqual(expect.arrayContaining([
      "inner QB run recall regressed by more than 0.10",
      "inner RB run recall regressed by more than 0.10",
    ]))
    const score = (candidateId: string, eligible: boolean) => ({
      candidateId, ...baseline, eligible, failures: eligible ? [] : ["guard failed"],
    })
    expect(selectNestedRunCandidate([
      score("learned_base_run", true), score("bounded_residual_run", true),
      score("frozen_v1_run_identity", true),
    ])).toBe("bounded_residual_run")
    expect(selectNestedRunCandidate([
      score("learned_base_run", false), score("frozen_v1_run_identity", true),
    ])).toBe("frozen_v1_run_identity")
  })

  it("bounds run-event probabilities for every candidate input", () => {
    const probabilities = [
      runProbabilityFromSlotProbabilities([]),
      runProbabilityFromSlotProbabilities([0, 1, 0.5]),
      runProbabilityFromSlotProbabilities([-1, 2, Number.NaN, Number.POSITIVE_INFINITY]),
      blendRunProbabilities(0.2, 0.6),
      blendRunProbabilities(Number.NaN, Number.POSITIVE_INFINITY),
    ]
    probabilities.forEach(probability => {
      expect(Number.isFinite(probability)).toBe(true)
      expect(probability).toBeGreaterThanOrEqual(0)
      expect(probability).toBeLessThanOrEqual(1)
    })
    expect(blendRunProbabilities(0.2, 0.6)).toBeCloseTo(0.4)
  })

  it("reports and rejects an outer supported per-position run Brier regression", () => {
    const metrics = (brierScore: number): StaticWindowRunMetrics => ({
      evaluatedEvents: 10,
      brierScore,
      logLoss: 0.2,
      thresholds: [{
        threshold: 0.5, truePositives: 4, falsePositives: 1, falseNegatives: 1,
        predictedPositives: 5, actualPositives: 5, precision: 0.8, recall: 0.8, f1: 0.8,
      }],
    })
    const group = (key: string, brierScore: number): StaticWindowRunOnlyGroup => ({
      key, fixtureCount: 1, canonicalWindowCount: 1, runMetrics: metrics(brierScore),
    })
    const baselineByPosition = [QB, RB, WR, TE].map(position => group(position, 0.1))
    const challengerByPosition = [
      group(QB, 0.13), group(RB, 0.09), group(WR, 0.09), group(TE, 0.09),
    ]
    const gate = evaluateNestedRunGate(
      { runMetrics: metrics(0.1) },
      group("aggregate", 0.09),
      challengerByPosition,
      baselineByPosition,
    )
    expect(gate.eligibleForShadow).toBe(false)
    const qb = gate.perPosition.find(position => position.position === QB)!
    expect(qb).toEqual(expect.objectContaining({
      support: 10, positiveEvents: 5,
      frozenV1RecallAtHalf: 0.8, challengerRecallAtHalf: 0.8, recallAtHalfDelta: 0,
    }))
    expect(qb.brierDelta).toBeCloseTo(0.03)
    expect(gate.failures).toContain("QB nested run Brier regressed by more than 0.02")
    expect(offlinePromotionReason(false, true)).toBe(
      "Run-only offline gates passed; pick-position prediction remains frozen v1. Prospective shadow validation is still required; no live promotion has occurred.",
    )
  })
})
