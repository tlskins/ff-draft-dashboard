import { FantasyPosition } from "../types"
import {
  buildRoundMarketPresentationModel,
  createRoundMarketInputFingerprint,
} from "../behavior/analysis/roundMarket"
import type { RoundMarketTierInput } from "../behavior/analysis/roundMarket"
import type {
  DraftAdvisorContext,
  OpponentForecast,
} from "../behavior/draft-advisor/types"

const positions = [
  FantasyPosition.QUARTERBACK,
  FantasyPosition.RUNNING_BACK,
  FantasyPosition.WIDE_RECEIVER,
  FantasyPosition.TIGHT_END,
] as const

const context = (): DraftAdvisorContext => ({
  schemaVersion: 1,
  league: {numTeams: 3, ppr: true},
  rosterFormat: {
    startingQbs: 1, startingRbs: 2, startingWrs: 2, startingTes: 1,
    flex: 1, bench: 6,
  },
  currentPick: 11,
  upcomingSlots: [
    {overallPick: 11, rosterIndex: 1},
    {overallPick: 12, rosterIndex: 0},
    {overallPick: 13, rosterIndex: 2},
    {overallPick: 14, rosterIndex: 1},
    {overallPick: 15, rosterIndex: 0},
  ],
  teams: [0, 1, 2].map(rosterIndex => ({
    rosterIndex,
    draftedPlayerIds: [],
    draftedPositionCounts: [
      {position: FantasyPosition.QUARTERBACK, count: 1},
      {position: FantasyPosition.RUNNING_BACK, count: rosterIndex === 1 ? 3 : 2},
      {position: FantasyPosition.WIDE_RECEIVER, count: 2},
      {position: FantasyPosition.TIGHT_END, count: 1},
    ],
    needs: [
      {position: FantasyPosition.QUARTERBACK, openStarterSpots: 0},
      {position: FantasyPosition.RUNNING_BACK, openStarterSpots: rosterIndex === 2 ? 1 : 0},
      {position: FantasyPosition.WIDE_RECEIVER, openStarterSpots: 0},
      {position: FantasyPosition.TIGHT_END, openStarterSpots: 0},
    ],
  })),
  availablePlayers: positions.flatMap(position => [1, 2].map(index => ({
    id: `${position.toLowerCase()}-${index}`,
    name: `${position} ${index}`,
    position,
    team: "FA",
    adp: index * 10,
    positionRank: index,
    userTier: 1,
  }))),
  recentPicks: [],
})

const vector = (rb: number) => [
  {position: FantasyPosition.QUARTERBACK, probability: (1 - rb) / 3},
  {position: FantasyPosition.RUNNING_BACK, probability: rb},
  {position: FantasyPosition.WIDE_RECEIVER, probability: (1 - rb) / 3},
  {position: FantasyPosition.TIGHT_END, probability: (1 - rb) / 3},
]

const forecast = (rb = 0.6): OpponentForecast => ({
  schemaVersion: 1,
  model: "combined",
  targetRosterIndex: 0,
  picks: [{
    overallPick: 11,
    rosterIndex: 1,
    positionProbabilities: vector(rb),
    playerProbabilities: [],
  }],
  runProbabilities: positions.map(position => ({position, minimumPicks: 3, probability: 0})),
  tierBoundaryProbabilities: [],
})

const activeTiers = (): RoundMarketTierInput[] => positions.map(position => ({
  authority: "active_board" as const,
  position,
  tier: 1,
  playerIds: [`${position.toLowerCase()}-1`, `${position.toLowerCase()}-2`],
}))

describe("round-aware market presentation", () => {
  it("creates exactly two user-turn buckets with frozen then static-board provenance", () => {
    const model = buildRoundMarketPresentationModel({
      context: context(), opponentForecast: forecast(), targetRosterIndex: 0,
      activeBoardTiers: activeTiers(), runThreshold: 1,
    })

    expect(model.buckets.map(bucket => bucket.id)).toEqual([
      "next_user_turn", "following_user_turn",
    ])
    expect(model.buckets[0]).toMatchObject({
      targetOverallPick: 12, opponentPickCount: 1, provenance: "frozen_v1_window",
      staticBoardAssumption: false,
    })
    expect(model.buckets[1]).toMatchObject({
      targetOverallPick: 15, opponentPickCount: 2, provenance: "static_board_derived_v1",
      staticBoardAssumption: true,
    })
    expect(model.buckets[0].positions.map(lane => lane.position)).toEqual(positions)
    expect(model.buckets[0].positions[0].tiers[0]).toMatchObject({
      provenance: "static_board_derived_v1",
    })
    expect(model.buckets[1].positions[0].tiers[0]).toMatchObject({
      provenance: "static_board_derived_v1",
    })
  })

  it("uses slot sums and the Poisson-binomial threshold probability", () => {
    const model = buildRoundMarketPresentationModel({
      context: context(), opponentForecast: forecast(0.6), targetRosterIndex: 0,
      activeBoardTiers: activeTiers(), runThreshold: 1,
    })
    const rb = model.buckets[0].positions.find(lane => lane.position === "RB")!
    const qb = model.buckets[0].positions.find(lane => lane.position === "QB")!

    expect(rb.expectedPositionalPicks).toBeCloseTo(0.6)
    expect(rb.probabilityAtLeastThreshold).toBeCloseTo(0.6)
    expect(qb.expectedPositionalPicks).toBeCloseTo((1 - 0.6) / 3)
    expect(model.buckets[0].positions.reduce((sum, lane) =>
      sum + (lane.expectedPositionalPicks || 0), 0)).toBeCloseTo(1)
  })

  it("samples without replacement, so a tier cannot be depleted more than its unique members", () => {
    const model = buildRoundMarketPresentationModel({
      context: context(), opponentForecast: forecast(1), targetRosterIndex: 0,
      activeBoardTiers: activeTiers(), runThreshold: 1,
    })
    const first = model.buckets[0].positions.find(lane => lane.position === "RB")!.tiers[0]
    const second = model.buckets[1].positions.find(lane => lane.position === "RB")!.tiers[0]

    expect((first.expectedUniquePlayersTakenInBucket || 0)
      + (second.expectedUniquePlayersTakenInBucket || 0)).toBeLessThanOrEqual(2)
    expect(second.exhaustionProbabilityByEndOfBucket).toBeGreaterThanOrEqual(0)
    expect(second.exhaustionProbabilityByEndOfBucket).toBeLessThanOrEqual(1)
  })

  it("keeps custom tiers out of frozen active-board probabilities and fails closed for incomplete membership", () => {
    const custom: RoundMarketTierInput[] = activeTiers()
    custom[1] = {...custom[1], authority: "custom_user"}
    const customModel = buildRoundMarketPresentationModel({
      context: context(), opponentForecast: forecast(), targetRosterIndex: 0,
      activeBoardTiers: custom,
    })
    expect(customModel.buckets[0].positions.find(lane => lane.position === "RB")!.tiers[0])
      .toMatchObject({status: "authority_mismatch", exhaustionProbabilityByEndOfBucket: null})

    const incomplete = activeTiers()
    incomplete[1] = {...incomplete[1], playerIds: ["rb-1", "missing-rb"]}
    const incompleteModel = buildRoundMarketPresentationModel({
      context: context(), opponentForecast: forecast(), targetRosterIndex: 0,
      activeBoardTiers: incomplete,
    })
    expect(incompleteModel.buckets[0].positions.find(lane => lane.position === "RB")!.tiers[0])
      .toMatchObject({status: "pool_incomplete", exhaustionProbabilityByEndOfBucket: null})
  })

  it("keeps at most the next two active tiers in stable order and fails conflicting duplicates", () => {
    const baseline = buildRoundMarketPresentationModel({
      context: context(), opponentForecast: forecast(), targetRosterIndex: 0,
      activeBoardTiers: activeTiers(),
    })
    const identicalDuplicate = activeTiers()
    identicalDuplicate.push({...identicalDuplicate[1]})
    const deduped = buildRoundMarketPresentationModel({
      context: context(), opponentForecast: forecast(), targetRosterIndex: 0,
      activeBoardTiers: identicalDuplicate,
    })
    expect(deduped).toEqual(baseline)

    const tiers = activeTiers()
    tiers.push({authority: "active_board", position: FantasyPosition.RUNNING_BACK,
      tier: 2, playerIds: ["rb-1"]})
    tiers.push({authority: "active_board", position: FantasyPosition.RUNNING_BACK,
      tier: 3, playerIds: ["rb-2"]})
    tiers.push({authority: "active_board", position: FantasyPosition.RUNNING_BACK,
      tier: 2, playerIds: ["rb-1"]})
    const model = buildRoundMarketPresentationModel({
      context: context(), opponentForecast: forecast(), targetRosterIndex: 0,
      activeBoardTiers: tiers,
    })
    expect(model.buckets[0].positions.find(lane => lane.position === "RB")!.tiers
      .map(tier => tier.tier)).toEqual([1, 2])

    const conflicting = activeTiers()
    conflicting.push({authority: "active_board", position: FantasyPosition.RUNNING_BACK,
      tier: 2, playerIds: ["rb-1"]})
    conflicting.push({authority: "active_board", position: FantasyPosition.RUNNING_BACK,
      tier: 2, playerIds: ["rb-2"]})
    const conflictModel = buildRoundMarketPresentationModel({
      context: context(), opponentForecast: forecast(), targetRosterIndex: 0,
      activeBoardTiers: conflicting,
    })
    expect(conflictModel.buckets[0].positions.find(lane => lane.position === "RB")!.tiers[1])
      .toMatchObject({status: "unavailable", unavailableReason: expect.stringMatching(/conflicting/i)})

    const overlapping = activeTiers()
    overlapping.push({authority: "active_board", position: FantasyPosition.RUNNING_BACK,
      tier: 2, playerIds: ["rb-1"]})
    const overlapModel = buildRoundMarketPresentationModel({
      context: context(), opponentForecast: forecast(), targetRosterIndex: 0,
      activeBoardTiers: overlapping,
    })
    expect(overlapModel.buckets[0].positions.find(lane => lane.position === "RB")!.tiers)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({status: "pool_incomplete", unavailableReason: expect.stringMatching(/aligned/i)}),
      ]))
  })

  it("reports observed direct and unallocated FLEX evidence separately", () => {
    const model = buildRoundMarketPresentationModel({
      context: context(), opponentForecast: forecast(), targetRosterIndex: 0,
      activeBoardTiers: activeTiers(),
    })
    const rbNeed = model.buckets[0].positions.find(lane => lane.position === "RB")!.observedNeed

    expect(rbNeed).toMatchObject({
      status: "observed",
      otherTeamsOpenStarterSlots: 1,
      otherTeamsWithOpenStarter: 1,
      otherTeamsOpenFlexSlots: 1,
      otherTeamsWithOpenFlex: 1,
    })
  })

  it("fails closed for FLEX evidence when a legacy roster omits drafted position counts", () => {
    const legacy = context()
    delete legacy.teams[1].draftedPositionCounts
    const model = buildRoundMarketPresentationModel({
      context: legacy, opponentForecast: forecast(), targetRosterIndex: 0,
      activeBoardTiers: activeTiers(),
    })
    const rbNeed = model.buckets[0].positions.find(lane => lane.position === "RB")!.observedNeed

    expect(rbNeed).toMatchObject({
      otherTeamsOpenStarterSlots: 1,
      otherTeamsWithOpenStarter: 1,
      otherTeamsOpenFlexSlots: null,
      otherTeamsWithOpenFlex: null,
      status: "unavailable",
    })
    expect(rbNeed.unavailableReason).toMatch(/FLEX need is unavailable/i)
  })

  it("admits only the requested frozen combined forecast", () => {
    const wrongTarget = forecast()
    wrongTarget.targetRosterIndex = 2
    const wrongTargetModel = buildRoundMarketPresentationModel({
      context: context(), opponentForecast: wrongTarget, targetRosterIndex: 0,
      activeBoardTiers: activeTiers(),
    })
    expect(wrongTargetModel.buckets).toEqual(expect.arrayContaining([
      expect.objectContaining({provenance: "unavailable", unavailableReason: expect.stringMatching(/target roster/i)}),
    ]))

    const v2 = forecast()
    v2.model = "combined_v2"
    const v2Model = buildRoundMarketPresentationModel({
      context: context(), opponentForecast: v2, targetRosterIndex: 0,
      activeBoardTiers: activeTiers(),
    })
    expect(v2Model.buckets[0]).toMatchObject({
      provenance: "unavailable",
      unavailableReason: expect.stringMatching(/frozen combined/i),
    })
    expect(v2Model.buckets[1]).toMatchObject({
      provenance: "unavailable",
      unavailableReason: expect.stringMatching(/not admitted/i),
    })
  })

  it("keeps malformed frozen input and a missing second turn explicitly unavailable", () => {
    const malformed = forecast() as any
    malformed.picks[0].positionProbabilities = [{position: "RB", probability: 1}]
    const missingSecond = context()
    missingSecond.upcomingSlots = missingSecond.upcomingSlots.slice(0, 2)
    const model = buildRoundMarketPresentationModel({
      context: missingSecond, opponentForecast: malformed, targetRosterIndex: 0,
      activeBoardTiers: activeTiers(),
    })

    expect(model.buckets[0]).toMatchObject({provenance: "unavailable"})
    expect(model.buckets[0].unavailableReason).toMatch(/invalid positional probability vector/i)
    expect(model.buckets[1]).toMatchObject({provenance: "unavailable"})
    expect(model.buckets[1].unavailableReason).toMatch(/following user turn/i)

    const firstOnly = buildRoundMarketPresentationModel({
      context: missingSecond, opponentForecast: forecast(), targetRosterIndex: 0,
      activeBoardTiers: activeTiers(),
    })
    expect(firstOnly.buckets[0].positions.find(lane => lane.position === "RB")!.tiers[0]
      .expectedUniquePlayersTakenInBucket).not.toBeNull()
  })

  it("is repeatable, uses a stable fingerprint, and never mutates the frozen v1 snapshot", () => {
    const source = forecast()
    const before = JSON.parse(JSON.stringify(source))
    const params = {context: context(), opponentForecast: source, targetRosterIndex: 0,
      activeBoardTiers: activeTiers()}
    const first = buildRoundMarketPresentationModel(params)
    const second = buildRoundMarketPresentationModel(params)

    expect(first).toEqual(second)
    expect(source).toEqual(before)
    expect(first.inputFingerprint).toMatch(/^[a-f0-9]{8}$/)
    expect(createRoundMarketInputFingerprint({b: 2, a: [3, 1]}))
      .toBe(createRoundMarketInputFingerprint({a: [3, 1], b: 2}))
  })

  it("canonicalizes set-like input order without changing output or cache identity", () => {
    const originalContext = context()
    const originalForecast = forecast()
    const originalTiers = activeTiers()
    const reorderedContext: DraftAdvisorContext = {
      ...originalContext,
      teams: [...originalContext.teams].reverse().map(team => ({
        ...team,
        draftedPlayerIds: [...team.draftedPlayerIds].reverse(),
        draftedPositionCounts: [...(team.draftedPositionCounts || [])].reverse(),
        needs: [...team.needs].reverse(),
      })),
      availablePlayers: [...originalContext.availablePlayers].reverse(),
    }
    const reorderedForecast: OpponentForecast = {
      ...originalForecast,
      picks: originalForecast.picks.map(pick => ({
        ...pick,
        positionProbabilities: [...pick.positionProbabilities].reverse(),
        playerProbabilities: [...pick.playerProbabilities].reverse(),
      })),
      runProbabilities: [...originalForecast.runProbabilities].reverse(),
    }
    const original = buildRoundMarketPresentationModel({
      context: originalContext, opponentForecast: originalForecast, targetRosterIndex: 0,
      activeBoardTiers: originalTiers,
    })
    const reordered = buildRoundMarketPresentationModel({
      context: reorderedContext, opponentForecast: reorderedForecast, targetRosterIndex: 0,
      activeBoardTiers: [...originalTiers].reverse().map(tier => ({
        ...tier, playerIds: [...tier.playerIds].reverse(),
      })),
    })
    expect(reordered).toEqual(original)
  })

  it("remains bounded at a 12-team, 455-player material-event scale", () => {
    const scaled = context()
    scaled.league = {numTeams: 12, ppr: true}
    scaled.teams = Array.from({length: 12}, (_, rosterIndex) => ({
      ...context().teams[0], rosterIndex,
    }))
    scaled.upcomingSlots = Array.from({length: 24}, (_, index) => ({
      overallPick: index + 1,
      rosterIndex: (index + 1) % 12,
    }))
    scaled.availablePlayers = [
      ...scaled.availablePlayers,
      ...Array.from({length: 447}, (_, index) => ({
        id: `depth-${index}`,
        name: `Depth ${index}`,
        position: positions[index % positions.length],
        team: "FA",
        adp: index + 20,
        positionRank: index + 3,
        userTier: Math.floor(index / 12) + 2,
      })),
    ]
    const firstSlots = scaled.upcomingSlots.slice(0, 11)
    const scaledForecast: OpponentForecast = {
      ...forecast(),
      picks: firstSlots.map(slot => ({
        ...slot,
        positionProbabilities: vector(0.4),
        playerProbabilities: [],
      })),
    }
    const startedAt = performance.now()
    const model = buildRoundMarketPresentationModel({
      context: scaled, opponentForecast: scaledForecast, targetRosterIndex: 0,
      activeBoardTiers: activeTiers(),
    })

    expect(model.buckets.map(bucket => bucket.opponentPickCount)).toEqual([11, 11])
    expect(performance.now() - startedAt).toBeLessThan(1000)
  })
})
