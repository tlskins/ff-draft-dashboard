import type {CrossPositionPresentationModel} from "../behavior/analysis/crossPosition"
import type {RoundMarketPresentationModel} from "../behavior/analysis/roundMarket"
import type {TierLandscapePresentationModel} from "../behavior/analysis/tierLandscape"
import {
  buildInsightCandidates,
  InsightCandidateInputs,
} from "../behavior/insights/insightCandidates"
import {INSIGHT_VIEW_IDS} from "../behavior/insights/insightDeck"

const cross = (overrides: Record<string, unknown> = {}): CrossPositionPresentationModel => ({
  explanation: "Supplied comparison.",
  candidates: [{
    player: {id: "first"},
    metricValues: {
      tierLossIfDeferred: 2,
      survivalProbability: .4,
      positionalRunProbability: .3,
    },
  }, {
    player: {id: "second"},
    metricValues: {
      tierLossIfDeferred: 1,
      survivalProbability: .7,
      positionalRunProbability: .2,
    },
  }],
  ...overrides,
} as unknown as CrossPositionPresentationModel)

const tier = (lanes: unknown[]): TierLandscapePresentationModel => ({
  lanes,
} as unknown as TierLandscapePresentationModel)

const round = (buckets: unknown[]): RoundMarketPresentationModel => ({
  buckets,
} as unknown as RoundMarketPresentationModel)

const baseInputs = (): InsightCandidateInputs => ({
  crossPosition: cross(),
  tierLandscape: tier([{
    position: "QB", run: {probability: .2},
    currentTopAvailableTier: {exhaustionProbability: .3},
    players: [{survivalProbability: .8}],
  }, {
    position: "WR", run: {probability: .8},
    currentTopAvailableTier: {exhaustionProbability: .6},
    players: [{survivalProbability: .3}],
  }]),
  roundMarket: round([{
    id: "next_user_turn",
    provenance: "frozen_v1_window",
    positions: [{
      position: "WR", probabilityAtLeastThreshold: .7,
      tiers: [{
        status: "available", provenance: "static_board_derived_v1", assumption: "static board",
        availablePlayerCount: 2, expectedUniquePlayersTakenInBucket: 1,
        exhaustionProbabilityByEndOfBucket: .4,
      }],
    }],
  }, {
    id: "following_user_turn",
    provenance: "static_board_derived_v1",
    positions: [{
      position: "RB", probabilityAtLeastThreshold: .6,
      tiers: [{
        status: "available", provenance: "static_board_derived_v1", assumption: "static board",
        availablePlayerCount: 2, expectedUniquePlayersTakenInBucket: 2,
        exhaustionProbabilityByEndOfBucket: .8,
      }],
    }],
  }]),
  planConstraints: {
    fingerprint: "plan-1",
    summary: "Need one RB starter and preserve target flexibility.",
    state: "ready",
  },
})

describe("insight candidate scoring", () => {
  it("produces a candidate contract for every registered Phase 16 view", () => {
    const candidates = buildInsightCandidates({
      ...baseInputs(),
      intraPosition: null,
      historical: null,
      playerStatus: null,
      rankTierDisagreement: null,
      sourceReadiness: null,
    })
    expect(Array.from(new Set(candidates.map(item => item.viewId))).sort())
      .toEqual([...INSIGHT_VIEW_IDS].sort())
  })

  it("emits every registered view with finite bounded presentation scores for null inputs", () => {
    const result = buildInsightCandidates({
      crossPosition: null,
      tierLandscape: null,
      roundMarket: null,
      planConstraints: null,
    })

    expect(result.map(item => `${item.slot}:${item.viewId}`)).toEqual([
      "primary_decision:candidate_comparison",
      "primary_decision:player_lab",
      "primary_decision:current_board_projection",
      "primary_decision:current_tier_market",
      "market_watch:current_tier_market",
      "market_watch:two_round_run_matrix",
      "plan_constraints:plan_constraints",
    ])
    result.forEach(item => {
      expect(Number.isFinite(item.score)).toBe(true)
      expect(item.score).toBeGreaterThanOrEqual(0)
      expect(item.score).toBeLessThanOrEqual(100)
      expect(item.evidence.state).toBe("unavailable")
      expect(item.evidence.unavailableReason).toBeTruthy()
    })
  })

  it("rejects malformed probabilities rather than scoring them as current evidence", () => {
    const result = buildInsightCandidates({
      ...baseInputs(),
      tierLandscape: tier([{
        position: "RB", run: {probability: 1.2},
        currentTopAvailableTier: {exhaustionProbability: -0.1},
        players: [{survivalProbability: Number.NaN}],
      }]),
      roundMarket: round([{
        id: "next_user_turn",
        provenance: "frozen_v1_window",
        positions: [{
          position: "RB", probabilityAtLeastThreshold: 3,
          tiers: [{
            status: "available", provenance: "static_board_derived_v1", assumption: "static board",
            availablePlayerCount: 0, expectedUniquePlayersTakenInBucket: 4,
            exhaustionProbabilityByEndOfBucket: -1,
          }],
        }],
      }, {id: "following_user_turn", provenance: "static_board_derived_v1", positions: []}]),
    })

    expect(result.find(item => item.viewId === "current_tier_market")?.evidence.state)
      .toBe("unavailable")
    expect(result.find(item => item.viewId === "two_round_run_matrix")?.evidence.state)
      .toBe("unavailable")
  })

  it("rejects unavailable or provenance-mismatched buckets with numeric remnants", () => {
    const numericLane = {
      position: "WR", probabilityAtLeastThreshold: .9,
      tiers: [{
        status: "available", provenance: "static_board_derived_v1", assumption: "static board",
        availablePlayerCount: 2, expectedUniquePlayersTakenInBucket: 2,
        exhaustionProbabilityByEndOfBucket: .9,
      }],
    }
    const unavailable = buildInsightCandidates({
      ...baseInputs(),
      roundMarket: round([
        {id: "next_user_turn", provenance: "unavailable", positions: [numericLane]},
        {id: "following_user_turn", provenance: "unavailable", positions: [numericLane]},
      ]),
    })
    const mismatched = buildInsightCandidates({
      ...baseInputs(),
      roundMarket: round([
        {id: "next_user_turn", provenance: "static_board_derived_v1", positions: [numericLane]},
        {id: "following_user_turn", provenance: "frozen_v1_window", positions: [numericLane]},
      ]),
    })

    expect(unavailable.find(item => item.viewId === "two_round_run_matrix")?.evidence.state)
      .toBe("unavailable")
    expect(mismatched.find(item => item.viewId === "two_round_run_matrix")?.evidence.state)
      .toBe("unavailable")
  })

  it("rejects pool-incomplete and unavailable tier remnants in an otherwise valid bucket", () => {
    const invalidTier = (status: string) => ({
      status, provenance: "static_board_derived_v1", assumption: "static board",
      availablePlayerCount: 2, expectedUniquePlayersTakenInBucket: 2,
      exhaustionProbabilityByEndOfBucket: .9,
    })
    const result = buildInsightCandidates({
      ...baseInputs(),
      roundMarket: round([
        {
          id: "next_user_turn", provenance: "frozen_v1_window",
          positions: [{position: "WR", probabilityAtLeastThreshold: .9, tiers: [
            invalidTier("pool_incomplete"), invalidTier("unavailable"),
          ]}],
        },
        {id: "following_user_turn", provenance: "static_board_derived_v1", positions: []},
      ]),
    })

    expect(result.find(item => item.viewId === "two_round_run_matrix")?.evidence.state)
      .toBe("unavailable")
  })

  it("fails malformed comparison placeholders without identity plus current evidence", () => {
    const result = buildInsightCandidates({
      ...baseInputs(),
      crossPosition: cross({
        candidates: [
          {player: {id: ""}, metricValues: {tierLossIfDeferred: 8}},
          {player: {id: "has-name"}, metricValues: {tierLossIfDeferred: Number.NaN}},
          {player: {id: "   "}, statusState: "ready"},
        ],
      }),
    })
    const comparison = result.find(item => item.viewId === "candidate_comparison")

    expect(comparison).toMatchObject({
      score: 0,
      reasonCode: "comparison_unavailable",
      evidence: {state: "unavailable"},
    })
  })

  it("explains the strongest supplied current-tier position with stable QB/RB/WR/TE ties", () => {
    const result = buildInsightCandidates({
      ...baseInputs(),
      tierLandscape: tier([{
        position: "RB", run: {probability: .9},
        currentTopAvailableTier: {exhaustionProbability: .1}, players: [],
      }, {
        position: "WR", run: {probability: .9},
        currentTopAvailableTier: {exhaustionProbability: .1}, players: [],
      }]),
    })
    const market = result.find(item => (
      item.slot === "market_watch" && item.viewId === "current_tier_market"
    ))

    expect(market?.explanation).toContain("RB has the strongest current market pressure")
    expect(market?.reasonCode).toBe("supplied_current_tier_pressure")
  })

  it("is deterministic, does not mutate prepared models, and leaves comparison order untouched", () => {
    const inputs = baseInputs()
    const before = JSON.stringify(inputs)
    const first = buildInsightCandidates(inputs)
    const second = buildInsightCandidates(inputs)

    expect(second).toEqual(first)
    expect(JSON.stringify(inputs)).toBe(before)
    expect(inputs.crossPosition?.candidates.map(item => item.player.id)).toEqual([
      "first", "second",
    ])
  })

  it("changes scores only when supplied evidence changes", () => {
    const inputs = baseInputs()
    const first = buildInsightCandidates(inputs)
    const sameEvidence = buildInsightCandidates({
      ...inputs,
      tierLandscape: {...inputs.tierLandscape, unrelated: "ignored"} as unknown as TierLandscapePresentationModel,
    })
    const changedEvidence = buildInsightCandidates({
      ...inputs,
      tierLandscape: tier([{
        position: "WR", run: {probability: .1},
        currentTopAvailableTier: {exhaustionProbability: .1}, players: [],
      }]),
    })
    const current = (items: typeof first) => items.find(item => (
      item.slot === "market_watch" && item.viewId === "current_tier_market"
    ))

    expect(current(sameEvidence)).toEqual(current(first))
    expect(current(changedEvidence)?.score).not.toBe(current(first)?.score)
  })

  it("fingerprints materially displayed comparison identity and round need/tier evidence", () => {
    const inputs = baseInputs()
    const first = buildInsightCandidates(inputs)
    const identityChanged = buildInsightCandidates({
      ...inputs,
      crossPosition: cross({
        candidates: [{
          player: {id: "first", fullName: "First Player", team: "BUF", position: "WR"},
          metricValues: {tierLossIfDeferred: 2, survivalProbability: .4, positionalRunProbability: .3},
        }, {
          player: {id: "second", fullName: "Second Player", team: "MIA", position: "RB"},
          metricValues: {tierLossIfDeferred: 1, survivalProbability: .7, positionalRunProbability: .2},
        }],
      }),
    })
    const changedRound = JSON.parse(JSON.stringify(inputs.roundMarket)) as RoundMarketPresentationModel
    changedRound.buckets[0].positions[0].observedNeed = {
      position: "WR" as never,
      otherTeamsOpenStarterSlots: 4,
      otherTeamsWithOpenStarter: 3,
      otherTeamsOpenFlexSlots: 2,
      otherTeamsWithOpenFlex: 2,
      status: "observed",
      unavailableReason: null,
    }
    changedRound.buckets[0].positions[0].tiers[0].availablePlayerCount = 3
    const marketChanged = buildInsightCandidates({...inputs, roundMarket: changedRound})
    const find = (items: typeof first, viewId: string) => items.find(item => item.viewId === viewId)

    expect(find(identityChanged, "candidate_comparison")?.evidence.fingerprint)
      .not.toBe(find(first, "candidate_comparison")?.evidence.fingerprint)
    expect(find(marketChanged, "two_round_run_matrix")?.evidence.fingerprint)
      .not.toBe(find(first, "two_round_run_matrix")?.evidence.fingerprint)
  })

  it("labels second-turn market evidence as provisional and keeps plan constraints read-only", () => {
    const result = buildInsightCandidates(baseInputs())
    const twoRound = result.find(item => item.viewId === "two_round_run_matrix")
    const plan = result.find(item => item.viewId === "plan_constraints")

    expect(twoRound?.explanation).toContain("Following-user-turn evidence is provisional")
    expect(twoRound?.score).toBeGreaterThan(0)
    expect(plan).toMatchObject({
      reasonCode: "read_only_plan_constraints",
      score: 20,
    })
  })

  it("does not score stale plan constraints as current evidence", () => {
    const result = buildInsightCandidates({
      ...baseInputs(),
      planConstraints: {
        fingerprint: "plan-stale",
        summary: "Old plan.",
        state: "stale",
        staleReason: "Plan must be reviewed.",
      },
    })
    const plan = result.find(item => item.viewId === "plan_constraints")

    expect(plan).toMatchObject({score: 0, evidence: {state: "stale"}})
    expect(plan?.evidence.staleReason).toBe("Plan must be reviewed.")
  })
})
