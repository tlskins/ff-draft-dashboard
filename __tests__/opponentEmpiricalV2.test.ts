import fixtureJson from "./fixtures/recorded-espn-2026-slot-9.json"
import {
  EMPIRICAL_OPPONENT_POSITIONS,
  fitEmpiricalOpponentSoftmax,
  empiricalShadowDecisions,
  predictEmpiricalOpponentProbabilities,
  prepareEmpiricalOpponentCorpus,
} from "../behavior/draft-advisor/opponentEmpiricalV2"
import type {
  EmpiricalGroupMetrics,
  EmpiricalModelMetrics,
  EmpiricalOpponentFold,
  EmpiricalOpponentExample,
} from "../behavior/draft-advisor/opponentEmpiricalV2"
import type { RecordedCompletedDraftReplay } from "../behavior/draft-advisor/completedDraftReplay"
import { FantasyPosition } from "../types"

const fixture = fixtureJson as unknown as RecordedCompletedDraftReplay

const syntheticExample = (
  label: EmpiricalOpponentExample["label"],
  fixtureId = "synthetic",
): EmpiricalOpponentExample => {
  const labelIndex = EMPIRICAL_OPPONENT_POSITIONS.indexOf(label)
  const signal = EMPIRICAL_OPPONENT_POSITIONS.map((_, index) =>
    index === labelIndex ? -0.01 : -4)
  return {
    fixtureId,
    leagueFormat: "10-team PPR",
    ppr: true,
    overallPick: 10,
    rosterIndex: 1,
    label,
    baselineProbabilities: [0.25, 0.25, 0.25, 0.25],
    adpLogProbabilities: signal,
    directNeedLogProbabilities: [0, 0, 0, 0],
    recentRunLogProbabilities: [0, 0, 0, 0],
    marginalScarcityResiduals: [0, 0, 0, 0],
    draftPhase: 0.2,
  }
}

describe("empirical opponent v2 corpus and softmax", () => {
  it("builds deterministic, leakage-safe canonical pre-pick examples", () => {
    const first = prepareEmpiricalOpponentCorpus([fixture])
    const repeated = prepareEmpiricalOpponentCorpus([fixture])
    expect(first.fixtures).toEqual(repeated.fixtures)
    expect(first.examples).toEqual(repeated.examples)
    expect(first.examples.length).toBeGreaterThan(0)

    const mutable = {
      ...fixture,
      actualPicks: fixture.actualPicks.map(pick => ({ ...pick })),
    }
    const candidates = mutable.actualPicks.filter(pick => pick.playerId)
    const left = candidates[candidates.length - 2]
    const right = candidates[candidates.length - 1]
    const leftId = left.playerId
    left.playerId = right.playerId
    right.playerId = leftId
    const mutated = prepareEmpiricalOpponentCorpus([mutable])
    const cutoff = Math.min(left.overallPick, right.overallPick)
    expect(mutated.examples.filter(example => example.overallPick < cutoff))
      .toEqual(first.examples.filter(example => example.overallPick < cutoff))
  })

  it("normalizes finite probabilities with zero or missing source signals", () => {
    const example: EmpiricalOpponentExample = {
      ...syntheticExample(FantasyPosition.QUARTERBACK),
      adpLogProbabilities: [Number.NEGATIVE_INFINITY, NaN, 0, 0],
      directNeedLogProbabilities: [NaN, 0, 0, 0],
      recentRunLogProbabilities: [0, 0, Number.NEGATIVE_INFINITY, 0],
      marginalScarcityResiduals: [NaN, 0, 0, 0],
    }
    const model = fitEmpiricalOpponentSoftmax([example], "format")
    const probabilities = predictEmpiricalOpponentProbabilities(model, example)
    expect(probabilities.every(Number.isFinite)).toBe(true)
    expect(probabilities.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1)
  })

  it("fits deterministically and learns a simple position signal", () => {
    const examples = EMPIRICAL_OPPONENT_POSITIONS.flatMap(position =>
      Array.from({ length: 8 }, () => syntheticExample(position)))
    const first = fitEmpiricalOpponentSoftmax(examples, "base")
    const repeated = fitEmpiricalOpponentSoftmax(examples, "base")
    expect(first.coefficients).toEqual(repeated.coefficients)
    expect(first.diagnostics.finalLoss).toBeLessThan(first.diagnostics.initialLoss)
    const hits = examples.filter(example => {
      const probabilities = predictEmpiricalOpponentProbabilities(first, example)
      const top = probabilities.reduce((best, probability, index) =>
        probability > probabilities[best] ? index : best, 0)
      return EMPIRICAL_OPPONENT_POSITIONS[top] === example.label
    })
    expect(hits.length / examples.length).toBeGreaterThan(0.9)
  })

  it("separates material learned-base evidence from numerical format edges", () => {
    const metrics = (brier: number, accuracy: number, logLoss: number) => ({
      evaluatedPicks: 100, positionBrierScore: brier, topPositionAccuracy: accuracy, logLoss,
    })
    const aggregate: EmpiricalModelMetrics = {
      frozenV1: metrics(0.7, 0.4, 1.3),
      learnedBase: metrics(0.6, 0.5, 1.1),
      // Better by far less than the fixed 1e-4 / 0.005 material threshold.
      learnedFormat: metrics(0.59998, 0.501, 1.09995),
    }
    const groups: EmpiricalGroupMetrics[] = [{
      leagueFormat: "synthetic", exampleCount: 100, metrics: aggregate,
    }]
    const folds = [-0.00002, -0.00001, -0.00003, 0.00001, 0.00002]
      .map((brier, index) => ({
        formatVsBase: { positionBrierScore: brier, topPositionAccuracy: 0, logLoss: brier },
        holdoutFixtureId: `fixture-${index}`,
      } as unknown as EmpiricalOpponentFold))
    const decisions = empiricalShadowDecisions(aggregate, groups, folds)
    expect(decisions.learnedBase.eligibleForShadowValidation).toBe(true)
    expect(decisions.learnedFormat.eligibleForShadowValidation).toBe(false)
    expect(decisions.learnedFormat.incrementalFoldWins).toEqual({
      brier: 3, logLoss: 3, required: 3, total: 5,
    })
    expect(decisions.learnedFormat.failedGates).toContain(
      "format feature has no material aggregate improvement versus learned base",
    )
  })
})
