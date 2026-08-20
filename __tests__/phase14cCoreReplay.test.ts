import {FantasyPosition} from "../types"
import {
  buildRoundMarketPresentationModel,
} from "../behavior/analysis/roundMarket"
import type {
  RoundMarketTierInput,
} from "../behavior/analysis/roundMarket"
import {
  createInsightDeckState,
  reconcileInsightDeck,
  setInsightDeckSlotPinned,
} from "../behavior/insights/insightDeck"
import type {
  InsightCandidate,
  InsightDeckState,
  MaterialInsightEvent,
} from "../behavior/insights/insightDeck"
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

const baseContext = (): DraftAdvisorContext => ({
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
    needs: positions.map(position => ({
      position,
      openStarterSpots: position === FantasyPosition.RUNNING_BACK
        && rosterIndex === 2 ? 1 : 0,
    })),
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

const frozenForecast = (): OpponentForecast => ({
  schemaVersion: 1,
  model: "combined",
  targetRosterIndex: 0,
  picks: [{
    overallPick: 11,
    rosterIndex: 1,
    positionProbabilities: [
      {position: FantasyPosition.QUARTERBACK, probability: .1},
      {position: FantasyPosition.RUNNING_BACK, probability: .6},
      {position: FantasyPosition.WIDE_RECEIVER, probability: .2},
      {position: FantasyPosition.TIGHT_END, probability: .1},
    ],
    playerProbabilities: [],
  }],
  runProbabilities: positions.map(position => ({
    position, minimumPicks: 3, probability: 0,
  })),
  tierBoundaryProbabilities: [],
})

const activeBoardTiers = (): RoundMarketTierInput[] => positions.map(position => ({
  authority: "active_board",
  position,
  tier: 1,
  playerIds: [`${position.toLowerCase()}-1`, `${position.toLowerCase()}-2`],
}))

const event = (draftKey: string): MaterialInsightEvent => ({
  streamId: "synthetic-phase14c-replay",
  draftKey,
})

const candidate = (
  viewId: InsightCandidate["viewId"],
  slot: InsightCandidate["slot"],
  score: number,
  fingerprint: string,
): InsightCandidate => ({
  viewId,
  slot,
  score,
  reasonCode: `${viewId}_evidence`,
  explanation: `${viewId} has deterministic evidence for this draft boundary.`,
  evidence: {state: "ready", fingerprint},
})

const candidatesFor = (
  phase: "initial" | "margin" | "replace" | "dwell" | "pinned",
): InsightCandidate[] => {
  const scores = {
    initial: {comparison: 10, market: 9},
    margin: {comparison: 10, market: 11},
    replace: {comparison: 10, market: 13},
    dwell: {comparison: 20, market: 13},
    pinned: {comparison: 30, market: 13},
  }[phase]
  return [
    candidate("candidate_comparison", "primary_decision", scores.comparison, `${phase}:comparison`),
    candidate("current_tier_market", "primary_decision", scores.market, `${phase}:market`),
    candidate("two_round_run_matrix", "market_watch", 8, `${phase}:run-matrix`),
    candidate("plan_constraints", "plan_constraints", 4, `${phase}:constraints`),
  ]
}

const contextFor = (
  playerId: string | null,
  position: FantasyPosition | null,
): DraftAdvisorContext => ({
  ...baseContext(),
  recentPicks: playerId && position ? [{
    overallPick: 11,
    playerId,
    name: playerId,
    position,
    team: "FA",
  }] : [],
})

interface ReplayTrace {
  buckets: string[]
  selectedViews: Array<Array<string | null>>
  materialEventCounts: number[]
  announcementIds: Array<string | null>
  sameEventQueueRefreshed: boolean
  pinnedWasRetained: boolean
  forecastAfterReplay: OpponentForecast
}

/**
 * Compact synthetic coverage: the existing recorded ESPN fixtures validate
 * completed-board replay, but do not carry the two-turn Phase 14C context plus
 * admitted frozen forecast boundary required by this pure presentation model.
 */
const runSyntheticCoreReplay = (): ReplayTrace => {
  const forecast = frozenForecast()
  const tiers = activeBoardTiers()
  let state: InsightDeckState = createInsightDeckState(
    "synthetic-phase14c-replay",
  )
  const buckets: string[] = []
  const selectedViews: Array<Array<string | null>> = []
  const materialEventCounts: number[] = []
  const announcementIds: Array<string | null> = []

  const record = (
    materialEvent: MaterialInsightEvent,
    phase: "initial" | "margin" | "replace" | "dwell" | "pinned",
    playerId: string | null,
    position: FantasyPosition | null,
  ) => {
    const market = buildRoundMarketPresentationModel({
      context: contextFor(playerId, position),
      opponentForecast: forecast,
      targetRosterIndex: 0,
      activeBoardTiers: tiers,
      runThreshold: 1,
    })
    buckets.push(JSON.stringify(market.buckets))
    const transition = reconcileInsightDeck(
      state,
      materialEvent,
      candidatesFor(phase),
      {significanceMargin: 2, minimumMaterialEventDwell: 2},
    )
    state = transition.state
    selectedViews.push([
      state.slots.primary_decision.selection?.viewId || null,
      state.slots.market_watch.selection?.viewId || null,
      state.slots.plan_constraints.selection?.viewId || null,
    ])
    materialEventCounts.push(state.materialEventCount)
    announcementIds.push(state.announcement?.id || null)
  }

  record(event("draft:empty"), "initial", null, null)
  record(event("draft:11:rb-one"), "margin", "rb-one", FantasyPosition.RUNNING_BACK)

  const evidenceOnly = reconcileInsightDeck(
    state,
    event("draft:11:rb-one"),
    candidatesFor("margin").map(item => item.viewId === "current_tier_market"
      ? {...item, score: 999, evidence: {state: "stale" as const, fingerprint: "same-event-only"}}
      : item),
    {significanceMargin: 2, minimumMaterialEventDwell: 2},
  )
  const sameEventQueueRefreshed = evidenceOnly.state !== state
    && evidenceOnly.changed
    && !evidenceOnly.selectionChanged
    && evidenceOnly.announcement === undefined
    && evidenceOnly.state.slots.primary_decision.queuedAlternatives.some(item => (
      item.evidence.fingerprint === "same-event-only"
    ))

  // Same overall pick correction, then a position replacement, are distinct
  // material boundaries even though the synthetic market remains display-only.
  record(event("draft:11:rb-two"), "replace", "rb-two", FantasyPosition.RUNNING_BACK)
  record(event("draft:11:wr-one"), "dwell", "wr-one", FantasyPosition.WIDE_RECEIVER)
  state = setInsightDeckSlotPinned(state, "primary_decision", true).state
  announcementIds.push(state.announcement?.id || null)
  record(event("draft:11:wr-one|12:te-one"), "pinned", "te-one", FantasyPosition.TIGHT_END)

  return {
    buckets,
    selectedViews,
    materialEventCounts,
    announcementIds,
    sameEventQueueRefreshed,
    pinnedWasRetained: state.slots.primary_decision.selection?.pinned === true
      && state.slots.primary_decision.selection.viewId === "current_tier_market",
    forecastAfterReplay: forecast,
  }
}

describe("Phase 14C pure synthetic core replay", () => {
  it("is replay-stable across material add/correction/replacement events without mutating frozen evidence", () => {
    const before = frozenForecast()
    const first = runSyntheticCoreReplay()
    const second = runSyntheticCoreReplay()

    expect(second.buckets).toEqual(first.buckets)
    expect(second.selectedViews).toEqual(first.selectedViews)
    expect(second.materialEventCounts).toEqual(first.materialEventCounts)
    expect(second.announcementIds).toEqual(first.announcementIds)
    expect(first.forecastAfterReplay).toEqual(before)
    expect(first.sameEventQueueRefreshed).toBe(true)
    expect(first.materialEventCounts).toEqual([1, 2, 3, 4, 5])

    // Initial fill is silent. Each later material boundary owns at most one
    // deck announcement: evidence refresh, view switch, or explicit pin.
    expect(first.announcementIds).toEqual([
      null,
      expect.stringMatching(/:primary_decision:evidence_updated:candidate_comparison:/),
      expect.stringMatching(/:primary_decision:auto_selected:current_tier_market:/),
      expect.stringMatching(/:primary_decision:evidence_updated:current_tier_market:/),
      expect.stringMatching(/:primary_decision:pinned:current_tier_market:/),
      expect.stringMatching(/:primary_decision:evidence_updated:current_tier_market:/),
    ])
    expect(first.pinnedWasRetained).toBe(true)
    expect(first.announcementIds.filter(Boolean)).toHaveLength(5)

    first.selectedViews.forEach(views => {
      const selected = views.filter((view): view is string => view !== null)
      expect(new Set(selected).size).toBe(selected.length)
    })
  })
})
