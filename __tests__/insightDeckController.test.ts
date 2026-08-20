import {act, renderHook, waitFor} from "@testing-library/react"

import {
  createInsightDeckState,
  InsightCandidate,
  materialInsightEventId,
  reconcileInsightDeck,
  restoreInsightDeckSlotAuto,
  selectInsightDeckView,
  setInsightDeckSlotPinned,
} from "../behavior/insights/insightDeck"
import {useInsightDeckController} from "../behavior/hooks/useInsightDeckController"

const event = (draftKey: string, streamId = "draft-one") => ({streamId, draftKey})

const candidate = (
  viewId: InsightCandidate["viewId"],
  slot: InsightCandidate["slot"],
  score: number,
  overrides: Partial<InsightCandidate> = {},
): InsightCandidate => ({
  viewId,
  slot,
  score,
  reasonCode: `${viewId}_reason`,
  explanation: `${viewId} is useful now.`,
  evidence: {state: "ready", fingerprint: `${viewId}:${score}`},
  ...overrides,
})

const baseCandidates = (): InsightCandidate[] => [
  candidate("candidate_comparison", "primary_decision", 10),
  candidate("current_tier_market", "market_watch", 8),
  candidate("plan_constraints", "plan_constraints", 4),
]

describe("Phase 14C1 InsightDeck controller", () => {
  it("creates a session-scoped material identity", () => {
    expect(materialInsightEventId(event("draft:1:alpha"))).toBe(
      '["draft-one","draft:1:alpha"]',
    )
    expect(materialInsightEventId(event("draft:1:alpha", "draft-two"))).not.toBe(
      materialInsightEventId(event("draft:1:alpha")),
    )
  })

  it("fills the three slots deterministically from registered, distinct views", () => {
    const outcome = reconcileInsightDeck(
      createInsightDeckState("draft-one"),
      event("draft:empty"),
      baseCandidates(),
    )

    expect(outcome.selectionChanged).toBe(true)
    expect(outcome.state.materialEventCount).toBe(1)
    expect(Object.values(outcome.state.slots).map(slot => slot.selection?.viewId)).toEqual([
      "candidate_comparison",
      "current_tier_market",
      "plan_constraints",
    ])
    expect(new Set(Object.values(outcome.state.slots).map(slot => slot.selection?.viewId)).size)
      .toBe(3)
    expect(outcome.announcement).toBeUndefined()
  })

  it("uses score, registry priority, and ID as a stable tie-break", () => {
    const outcome = reconcileInsightDeck(
      createInsightDeckState("draft-one"),
      event("draft:empty"),
      [
        candidate("candidate_comparison", "primary_decision", 5),
        candidate("current_tier_market", "primary_decision", 5),
        candidate("plan_constraints", "plan_constraints", 1),
      ],
    )

    expect(outcome.state.slots.primary_decision.selection?.viewId)
      .toBe("candidate_comparison")
  })

  it("does not switch or announce when non-material evidence changes", () => {
    const first = reconcileInsightDeck(
      createInsightDeckState("draft-one"), event("draft:empty"), baseCandidates(),
    ).state
    const evidenceOnly = baseCandidates().map(item => (
      item.viewId === "candidate_comparison"
        ? {...item, score: 999, evidence: {state: "stale" as const, fingerprint: "new"}}
        : item
    ))

    const unchanged = reconcileInsightDeck(first, event("draft:empty"), evidenceOnly)

    expect(unchanged.changed).toBe(false)
    expect(unchanged.selectionChanged).toBe(false)
    expect(unchanged.announcement).toBeUndefined()
    expect(unchanged.state).toBe(first)
  })

  it("announces one selected evidence refresh on a new material event without moving views", () => {
    const initial = reconcileInsightDeck(
      createInsightDeckState("draft-one"), event("draft:empty"), baseCandidates(),
    ).state
    const refreshed = reconcileInsightDeck(initial, event("draft:1:a"), [
      candidate("candidate_comparison", "primary_decision", 10, {
        explanation: "Comparison evidence refreshed.",
        evidence: {state: "ready", fingerprint: "comparison:new"},
      }),
      candidate("current_tier_market", "market_watch", 8, {
        evidence: {state: "ready", fingerprint: "market:new"},
      }),
      candidate("plan_constraints", "plan_constraints", 4, {
        evidence: {state: "ready", fingerprint: "plan:new"},
      }),
    ])

    expect(refreshed.selectionChanged).toBe(false)
    expect(refreshed.announcement).toMatchObject({
      kind: "evidence_updated",
      slot: "primary_decision",
    })
    expect(refreshed.announcement?.text).toContain("evidence updated")
  })

  it("lets a view switch beat same-event evidence refresh announcements", () => {
    const initial = reconcileInsightDeck(
      createInsightDeckState("draft-one"), event("draft:empty"), [
        candidate("candidate_comparison", "primary_decision", 10),
        candidate("current_tier_market", "primary_decision", 1),
        candidate("plan_constraints", "plan_constraints", 1),
      ],
    ).state
    const switched = reconcileInsightDeck(initial, event("draft:1:a"), [
      candidate("candidate_comparison", "primary_decision", 10, {
        evidence: {state: "ready", fingerprint: "comparison:new"},
      }),
      candidate("current_tier_market", "primary_decision", 20),
      candidate("plan_constraints", "plan_constraints", 1, {
        evidence: {state: "ready", fingerprint: "plan:new"},
      }),
    ])

    expect(switched.state.slots.primary_decision.selection?.viewId)
      .toBe("current_tier_market")
    expect(switched.announcement?.kind).toBe("auto_selected")
  })

  it.each(["loading", "stale", "unavailable"] as const)(
    "prefers ready evidence over a higher-scored %s fallback during initial Auto fill",
    evidenceState => {
      const initial = reconcileInsightDeck(
        createInsightDeckState("draft-one"), event("draft:empty"), [
          candidate("candidate_comparison", "primary_decision", 1),
          candidate("current_tier_market", "primary_decision", 999, {
            evidence: {state: evidenceState, fingerprint: `${evidenceState}:high`},
          }),
          candidate("plan_constraints", "plan_constraints", 1),
        ],
      )
      expect(initial.state.slots.primary_decision.selection?.viewId)
        .toBe("candidate_comparison")
      expect(initial.announcement).toBeUndefined()
    },
  )

  it("uses an explicit non-ready fallback only when an empty slot has no ready view", () => {
    const initial = reconcileInsightDeck(
      createInsightDeckState("draft-one"), event("draft:empty"), [
        candidate("current_tier_market", "market_watch", 999, {
          evidence: {state: "loading", fingerprint: "market-loading"},
        }),
        candidate("plan_constraints", "plan_constraints", 1),
      ],
    )
    expect(initial.state.slots.market_watch.selection).toMatchObject({
      viewId: "current_tier_market",
      evidence: {state: "loading"},
    })
  })

  it.each(["loading", "stale", "unavailable"] as const)(
    "does not let high-scored %s evidence displace a ready incumbent at a later event",
    evidenceState => {
    const initial = reconcileInsightDeck(
      createInsightDeckState("draft-one"), event("draft:empty"), [
        candidate("candidate_comparison", "primary_decision", 10),
        candidate("current_tier_market", "primary_decision", 1),
        candidate("plan_constraints", "plan_constraints", 1),
      ],
    ).state
    const later = reconcileInsightDeck(initial, event("draft:1:a"), [
      candidate("candidate_comparison", "primary_decision", 10),
      candidate("current_tier_market", "primary_decision", 999, {
        evidence: {state: evidenceState, fingerprint: `market-${evidenceState}`},
      }),
      candidate("plan_constraints", "plan_constraints", 1),
    ])
    const repeated = reconcileInsightDeck(later.state, event("draft:1:a"), [
      candidate("candidate_comparison", "primary_decision", 10),
      candidate("current_tier_market", "primary_decision", 1000, {
        evidence: {state: evidenceState, fingerprint: `market-${evidenceState}-changed`},
      }),
      candidate("plan_constraints", "plan_constraints", 1),
    ])

    expect(later.state.slots.primary_decision.selection?.viewId)
      .toBe("candidate_comparison")
    expect(later.state.slots.primary_decision.queuedAlternatives).toMatchObject([
      {viewId: "current_tier_market", blockedBy: "evidence"},
    ])
    expect(later.announcement).toBeUndefined()
    expect(repeated.changed).toBe(false)
    expect(repeated.announcement).toBeUndefined()
    },
  )

  it("allows a user to pin an explicit non-ready view", () => {
    const initial = reconcileInsightDeck(
      createInsightDeckState("draft-one"), event("draft:empty"), [
        candidate("candidate_comparison", "primary_decision", 10),
        candidate("current_tier_market", "primary_decision", 999, {
          evidence: {state: "unavailable", fingerprint: "manual-unavailable"},
        }),
        candidate("plan_constraints", "plan_constraints", 1),
      ],
    ).state
    const manual = selectInsightDeckView(initial, "primary_decision", "current_tier_market", [
      candidate("candidate_comparison", "primary_decision", 10),
      candidate("current_tier_market", "primary_decision", 999, {
        evidence: {state: "unavailable", fingerprint: "manual-unavailable"},
      }),
    ])

    expect(manual.state.slots.primary_decision.selection).toMatchObject({
      viewId: "current_tier_market",
      pinned: true,
      evidence: {state: "unavailable"},
    })
    expect(manual.announcement?.kind).toBe("manual_selected")
  })

  it("retains explicit ready, stale, loading, and unavailable evidence states", () => {
    const state = reconcileInsightDeck(
      createInsightDeckState("draft-one"), event("draft:empty"), [
        candidate("candidate_comparison", "primary_decision", 10),
        candidate("current_tier_market", "market_watch", 8, {
          evidence: {state: "stale", fingerprint: "market-stale", staleReason: "Forecast is old."},
        }),
        candidate("plan_constraints", "plan_constraints", 4, {
          evidence: {state: "loading", fingerprint: "plan-loading"},
        }),
      ],
    ).state
    const pinned = setInsightDeckSlotPinned(state, "primary_decision", true).state
    const unavailable = reconcileInsightDeck(pinned, event("draft:1:a"), [
      candidate("current_tier_market", "market_watch", 8, {
        evidence: {state: "stale", fingerprint: "market-stale-2", staleReason: "Forecast is old."},
      }),
      candidate("plan_constraints", "plan_constraints", 4, {
        evidence: {state: "loading", fingerprint: "plan-loading-2"},
      }),
    ]).state

    expect(state.slots.primary_decision.selection?.evidence.state).toBe("ready")
    expect(state.slots.market_watch.selection?.evidence.state).toBe("stale")
    expect(state.slots.plan_constraints.selection?.evidence.state).toBe("loading")
    expect(unavailable.slots.primary_decision.selection?.evidence.state).toBe("unavailable")
  })

  it("resets all transient selections when the draft session changes", () => {
    const first = reconcileInsightDeck(
      createInsightDeckState("draft-one"), event("draft:empty"), baseCandidates(),
    ).state
    const second = reconcileInsightDeck(first, event("draft:empty", "draft-two"), [
      candidate("current_tier_market", "primary_decision", 10),
      candidate("plan_constraints", "plan_constraints", 1),
    ])

    expect(second.state.streamId).toBe("draft-two")
    expect(second.state.materialEventCount).toBe(1)
    expect(second.state.slots.primary_decision.selection?.viewId)
      .toBe("current_tier_market")
    expect(second.state.slots.market_watch.selection).toBeNull()
  })

  it("requires a significance margin and material-event dwell before auto replacement", () => {
    const initial = reconcileInsightDeck(
      createInsightDeckState("draft-one"),
      event("draft:empty"),
      [
        candidate("candidate_comparison", "primary_decision", 10),
        candidate("current_tier_market", "primary_decision", 9),
        candidate("plan_constraints", "plan_constraints", 1),
      ],
      {significanceMargin: 2, minimumMaterialEventDwell: 2},
    ).state
    const insufficientMargin = reconcileInsightDeck(initial, event("draft:1:a"), [
      candidate("candidate_comparison", "primary_decision", 10),
      candidate("current_tier_market", "primary_decision", 11),
      candidate("plan_constraints", "plan_constraints", 1),
    ], {significanceMargin: 2, minimumMaterialEventDwell: 2})
    expect(insufficientMargin.state.slots.primary_decision.selection?.viewId)
      .toBe("candidate_comparison")
    expect(insufficientMargin.state.slots.primary_decision.queuedAlternatives[0]?.blockedBy)
      .toBe("margin")

    const dwellBlocked = reconcileInsightDeck(insufficientMargin.state, event("draft:2:b"), [
      candidate("candidate_comparison", "primary_decision", 10),
      candidate("current_tier_market", "primary_decision", 13),
      candidate("plan_constraints", "plan_constraints", 1),
    ], {significanceMargin: 2, minimumMaterialEventDwell: 3})
    expect(dwellBlocked.state.slots.primary_decision.selection?.viewId)
      .toBe("candidate_comparison")
    expect(dwellBlocked.state.slots.primary_decision.queuedAlternatives[0]?.blockedBy)
      .toBe("dwell")

    const replaced = reconcileInsightDeck(dwellBlocked.state, event("draft:3:c"), [
      candidate("candidate_comparison", "primary_decision", 10),
      candidate("current_tier_market", "primary_decision", 13),
      candidate("plan_constraints", "plan_constraints", 1),
    ], {significanceMargin: 2, minimumMaterialEventDwell: 3})
    expect(replaced.state.slots.primary_decision.selection?.viewId)
      .toBe("current_tier_market")
    expect(replaced.announcement?.slot).toBe("primary_decision")
  })

  it("keeps a pinned unavailable view while queuing the latest alternative", () => {
    const initial = reconcileInsightDeck(
      createInsightDeckState("draft-one"), event("draft:empty"), baseCandidates(),
    ).state
    const pinned = setInsightDeckSlotPinned(initial, "primary_decision", true).state
    const next = reconcileInsightDeck(pinned, event("draft:1:a"), [
      candidate("current_tier_market", "primary_decision", 20),
      candidate("current_tier_market", "market_watch", 8),
      candidate("plan_constraints", "plan_constraints", 4, {
        evidence: {state: "loading", fingerprint: "plan-loading"},
      }),
    ])

    expect(next.state.slots.primary_decision.selection).toMatchObject({
      viewId: "candidate_comparison",
      pinned: true,
      evidence: {state: "unavailable"},
    })
    expect(next.state.slots.primary_decision.queuedAlternatives).toMatchObject([
      {viewId: "current_tier_market", blockedBy: "pinned"},
    ])
    expect(next.state.slots.plan_constraints.selection?.evidence.state).toBe("loading")
  })

  it("reserves a later pinned market view before evaluating an earlier Auto slot", () => {
    const initial = reconcileInsightDeck(
      createInsightDeckState("draft-one"), event("draft:empty"), baseCandidates(),
    ).state
    const pinned = setInsightDeckSlotPinned(initial, "market_watch", true).state
    const next = reconcileInsightDeck(pinned, event("draft:1:a"), [
      candidate("candidate_comparison", "primary_decision", 10),
      candidate("current_tier_market", "primary_decision", 30),
      candidate("current_tier_market", "market_watch", 8),
      candidate("plan_constraints", "plan_constraints", 4),
    ])

    expect(next.state.slots.market_watch.selection).toMatchObject({
      viewId: "current_tier_market",
      pinned: true,
    })
    expect(next.state.slots.primary_decision.selection?.viewId)
      .toBe("candidate_comparison")
    expect(next.state.slots.primary_decision.queuedAlternatives).toMatchObject([
      {viewId: "current_tier_market", blockedBy: "duplicate"},
    ])
    expect(new Set(Object.values(next.state.slots)
      .flatMap(slot => slot.selection ? [slot.selection.viewId] : [])).size).toBe(3)
  })

  it("clears an unpinned incumbent that conflicts with an earlier Auto assignment", () => {
    const initial = reconcileInsightDeck(
      createInsightDeckState("draft-one"), event("draft:empty"), baseCandidates(),
    ).state
    const next = reconcileInsightDeck(initial, event("draft:1:a"), [
      candidate("candidate_comparison", "primary_decision", 10),
      candidate("current_tier_market", "primary_decision", 30),
      candidate("current_tier_market", "market_watch", 8),
      candidate("plan_constraints", "plan_constraints", 4),
    ])

    expect(next.state.slots.primary_decision.selection?.viewId)
      .toBe("current_tier_market")
    expect(next.state.slots.market_watch.selection).toBeNull()
    expect(next.state.slots.market_watch.queuedAlternatives).toMatchObject([
      {viewId: "current_tier_market", blockedBy: "duplicate"},
    ])
    expect(new Set(Object.values(next.state.slots)
      .flatMap(slot => slot.selection ? [slot.selection.viewId] : [])).size).toBe(2)
  })

  it("rejects a manual duplicate and lets explicit Auto override dwell/margin", () => {
    const duplicateInitial = reconcileInsightDeck(
      createInsightDeckState("draft-one"), event("draft:empty"), [
        candidate("current_tier_market", "primary_decision", 10),
        candidate("current_tier_market", "market_watch", 20),
        candidate("plan_constraints", "plan_constraints", 1),
      ],
    ).state
    const duplicate = selectInsightDeckView(
      duplicateInitial,
      "market_watch",
      "current_tier_market",
      [candidate("current_tier_market", "market_watch", 20)],
    )
    expect(duplicate.changed).toBe(false)
    expect(duplicate.blockedReason).toContain("already shown")

    const initial = reconcileInsightDeck(
      createInsightDeckState("draft-one"), event("draft:empty"), [
        candidate("candidate_comparison", "primary_decision", 10),
        candidate("current_tier_market", "primary_decision", 5),
        candidate("plan_constraints", "plan_constraints", 1),
      ],
    ).state
    const pinned = setInsightDeckSlotPinned(initial, "primary_decision", true).state
    const auto = restoreInsightDeckSlotAuto(pinned, "primary_decision", [
      candidate("candidate_comparison", "primary_decision", 1),
      candidate("current_tier_market", "primary_decision", 100),
    ])
    expect(auto.state.slots.primary_decision.selection?.viewId)
      .toBe("current_tier_market")
    expect(auto.state.slots.primary_decision.selection?.pinned).toBe(false)
  })

  it("exposes the same material boundary through the hook", async () => {
    const {result, rerender} = renderHook((props: {
      materialEvent: ReturnType<typeof event>
      candidates: InsightCandidate[]
    }) => useInsightDeckController(props), {
      initialProps: {materialEvent: event("draft:empty"), candidates: baseCandidates()},
    })
    await waitFor(() => expect(result.current.state.slots.primary_decision.selection?.viewId)
      .toBe("candidate_comparison"))
    const firstAnnouncement = result.current.state.announcement?.id

    rerender({
      materialEvent: event("draft:empty"),
      candidates: [
        candidate("current_tier_market", "primary_decision", 99),
        candidate("current_tier_market", "market_watch", 8),
        candidate("plan_constraints", "plan_constraints", 4),
      ],
    })
    await waitFor(() => expect(result.current.state.slots.primary_decision.selection?.viewId)
      .toBe("candidate_comparison"))
    expect(result.current.state.announcement?.id).toBe(firstAnnouncement)

    act(() => result.current.pinSlot("primary_decision"))
    expect(result.current.state.slots.primary_decision.selection?.pinned).toBe(true)
  })
})
