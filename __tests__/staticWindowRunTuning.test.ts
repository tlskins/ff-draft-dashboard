import { FantasyPosition } from "../types"
import {
  NESTED_RUN_CANDIDATES,
  blendRunProbabilities,
  evaluateNestedRunGate,
  runProbabilityFromSlotProbabilities,
  scoreNestedRunCandidate,
  selectNestedRunCandidate,
  summarizeRunEvents,
} from "../behavior/draft-advisor/staticWindowRunTuning"
import type {
  StaticWindowRunMetrics,
  StaticWindowRunOnlyGroup,
  RunPosition,
} from "../behavior/draft-advisor/staticWindowRunTuning"

const positions: RunPosition[] = [
  FantasyPosition.QUARTERBACK,
  FantasyPosition.RUNNING_BACK,
  FantasyPosition.WIDE_RECEIVER,
  FantasyPosition.TIGHT_END,
]

const metrics = (brierScore: number, actualPositives = 5): StaticWindowRunMetrics => ({
  evaluatedEvents: 10,
  brierScore,
  logLoss: 0.2,
  thresholds: [{
    threshold: 0.5, truePositives: 4, falsePositives: 1, falseNegatives: 1,
    predictedPositives: 5, actualPositives, precision: 0.8, recall: 0.8, f1: 0.8,
  }],
})

const group = (key: string, brierScore: number, actualPositives = 5): StaticWindowRunOnlyGroup => ({
  key, fixtureCount: 1, canonicalWindowCount: 1, runMetrics: metrics(brierScore, actualPositives),
})

describe("pure static-window run tuning", () => {
  it("keeps identity fixed, bounds probability math, and chooses deterministic fallbacks", () => {
    expect(NESTED_RUN_CANDIDATES.map(candidate => candidate.id)).toEqual([
      "frozen_v1_run_identity", "learned_base_run", "bounded_residual_run",
      "v1_learned_base_half_blend", "v1_bounded_residual_half_blend",
    ])
    const probabilities = [
      runProbabilityFromSlotProbabilities([]),
      runProbabilityFromSlotProbabilities([0, 1, 0.5]),
      runProbabilityFromSlotProbabilities([-1, 2, Number.NaN, Number.POSITIVE_INFINITY]),
      blendRunProbabilities(Number.NaN, Number.POSITIVE_INFINITY),
    ]
    probabilities.forEach(probability => {
      expect(Number.isFinite(probability)).toBe(true)
      expect(probability).toBeGreaterThanOrEqual(0)
      expect(probability).toBeLessThanOrEqual(1)
    })
    const identity = scoreNestedRunCandidate("frozen_v1_run_identity", [], {
      brierScore: 0, logLoss: 0, precisionAtHalf: 0, recallAtHalf: 0, f1AtHalf: 0,
      evaluatedEvents: 0, positiveEvents: 0,
      perPosition: positions.map(position => ({
        position, evaluatedEvents: 0, positiveEvents: 0, brierScore: 0, recallAtHalf: null,
      })),
    })
    expect(identity.eligible).toBe(true)
    expect(selectNestedRunCandidate([identity])).toBe("frozen_v1_run_identity")
    const tie = (candidateId: string) => ({ ...identity, candidateId, eligible: true })
    expect(selectNestedRunCandidate([tie("z"), tie("a"), identity])).toBe("a")
  })

  it("keeps zero-positive recall null and exposes per-position Brier/recall guards", () => {
    const score = scoreNestedRunCandidate("bounded_residual_run", positions.map(position => ({
      position, probability: 0, actual: position === FantasyPosition.QUARTERBACK,
    })), {
      brierScore: 0.1, logLoss: 0.2, precisionAtHalf: 1, recallAtHalf: 1, f1AtHalf: 1,
      evaluatedEvents: 4, positiveEvents: 1,
      perPosition: positions.map(position => ({
        position, evaluatedEvents: 1, positiveEvents: position === FantasyPosition.QUARTERBACK ? 1 : 0,
        brierScore: 0, recallAtHalf: position === FantasyPosition.QUARTERBACK ? 1 : null,
      })),
    })
    expect(score.perPosition.find(item => item.position === FantasyPosition.TIGHT_END)?.recallAtHalf).toBeNull()
    const baseline = positions.map(position => group(position, 0.1,
      position === FantasyPosition.TIGHT_END ? 0 : 5))
    const challenger = positions.map(position => group(position,
      position === FantasyPosition.QUARTERBACK ? 0.13 : 0.09,
      position === FantasyPosition.TIGHT_END ? 0 : 5))
    const gate = evaluateNestedRunGate({ runMetrics: metrics(0.1) }, group("aggregate", 0.09), challenger, baseline)
    const qb = gate.perPosition.find(item => item.position === FantasyPosition.QUARTERBACK)!
    const te = gate.perPosition.find(item => item.position === FantasyPosition.TIGHT_END)!
    expect(qb.brierDelta).toBeCloseTo(0.03)
    expect(te.recallAtHalfDelta).toBeNull()
    expect(gate.failures).toContain("QB nested run Brier regressed by more than 0.02")
  })

  it("summarizes direct run events without synthetic backtest samples", () => {
    const summary = summarizeRunEvents([
      { position: FantasyPosition.QUARTERBACK, probability: 0.8, actual: true },
      { position: FantasyPosition.RUNNING_BACK, probability: 0.2, actual: false },
    ])
    expect(summary.evaluatedEvents).toBe(2)
    expect(summary.thresholds.find(item => item.threshold === 0.5)).toEqual(expect.objectContaining({
      truePositives: 1, falsePositives: 0, falseNegatives: 0,
    }))
  })
})
