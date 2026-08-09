import {
  acknowledgeAnalysisViewEvent,
  arbitrateAnalysisViewEventsByLayout,
  createAnalysisViewEventArbitrationState,
  MAX_ACKNOWLEDGED_CONFIRMED_EVENT_IDS,
  queueConfirmedAnalysisViewEvent,
} from "../behavior/analysis/viewEventArbitration"
import type {
  AutomaticAnalysisViewEvent,
} from "../behavior/analysis/viewState"


const automatic = (
  revision: number,
  view: AutomaticAnalysisViewEvent["view"] = "cross_position",
): AutomaticAnalysisViewEvent => ({
  kind: "automatic",
  streamId: "draft-one",
  view,
  explanation: `Automatic revision ${revision}.`,
  revision,
})

describe("analysis view event arbitration", () => {
  it("shares one resolved event across desktop and mobile and acknowledges it once", () => {
    const initial = createAnalysisViewEventArbitrationState("draft-one")
    const layouts = arbitrateAnalysisViewEventsByLayout(
      initial,
      automatic(10),
    )

    expect(layouts.desktop).toBe(layouts.mobile)
    expect(layouts.desktop).toMatchObject({
      kind: "automatic",
      revision: 10,
    })

    const acknowledged = acknowledgeAnalysisViewEvent(
      initial,
      layouts.desktop!,
    )
    expect(arbitrateAnalysisViewEventsByLayout(
      acknowledged,
      automatic(10),
    )).toEqual({desktop: null, mobile: null})
    expect(acknowledgeAnalysisViewEvent(
      acknowledged,
      layouts.desktop!,
    )).toBe(acknowledged)
  })

  it("lets a confirmed manual event supersede the current automatic revision", () => {
    const afterAutomatic = acknowledgeAnalysisViewEvent(
      createAnalysisViewEventArbitrationState("draft-one"),
      automatic(10),
    )
    const queued = queueConfirmedAnalysisViewEvent(
      afterAutomatic,
      "draft-one",
      {
        eventId: "proposal-view-1",
        view: "intra_position",
        explanation: "Compare the confirmed pair.",
        supersedesAutomaticRevision: 10,
      },
    )
    const layouts = arbitrateAnalysisViewEventsByLayout(
      queued,
      automatic(10),
    )

    expect(layouts.desktop).toBe(layouts.mobile)
    expect(layouts.desktop).toMatchObject({
      kind: "confirmed_manual",
      eventId: "proposal-view-1",
      sequence: 1,
      supersedesAutomaticRevision: 10,
    })

    const consumed = acknowledgeAnalysisViewEvent(queued, layouts.mobile!)
    expect(consumed.pendingConfirmedEvent).toBeNull()
    expect(arbitrateAnalysisViewEventsByLayout(
      consumed,
      automatic(10),
    )).toEqual({desktop: null, mobile: null})
    expect(arbitrateAnalysisViewEventsByLayout(
      consumed,
      automatic(11, "positional_bests"),
    ).desktop).toMatchObject({
      kind: "automatic",
      revision: 11,
      view: "positional_bests",
    })
  })

  it("does not requeue a consumed confirmed proposal or replay on remount", () => {
    const queued = queueConfirmedAnalysisViewEvent(
      createAnalysisViewEventArbitrationState("draft-one"),
      "draft-one",
      {
        eventId: "proposal-view-1",
        view: "tier_landscape",
        explanation: "Inspect the confirmed tier cliff.",
        supersedesAutomaticRevision: 12,
      },
    )
    const event = arbitrateAnalysisViewEventsByLayout(
      queued,
      automatic(12),
    ).desktop!
    const consumed = acknowledgeAnalysisViewEvent(queued, event)
    const duplicate = queueConfirmedAnalysisViewEvent(
      consumed,
      "draft-one",
      {
        eventId: "proposal-view-1",
        view: "tier_landscape",
        explanation: "Inspect the confirmed tier cliff.",
        supersedesAutomaticRevision: 12,
      },
    )

    expect(duplicate).toBe(consumed)
    expect(arbitrateAnalysisViewEventsByLayout(
      duplicate,
      automatic(12),
    )).toEqual({desktop: null, mobile: null})
  })

  it("keeps A idempotent after acknowledging B and makes old acknowledgements no-ops", () => {
    const initial = createAnalysisViewEventArbitrationState("draft-one")
    const queuedA = queueConfirmedAnalysisViewEvent(
      initial,
      "draft-one",
      {
        eventId: "proposal-a",
        view: "tier_landscape",
        explanation: "Confirmed proposal A.",
        supersedesAutomaticRevision: 20,
      },
    )
    const eventA = queuedA.pendingConfirmedEvent!
    const acknowledgedA = acknowledgeAnalysisViewEvent(queuedA, eventA)
    const queuedB = queueConfirmedAnalysisViewEvent(
      acknowledgedA,
      "draft-one",
      {
        eventId: "proposal-b",
        view: "cross_position",
        explanation: "Confirmed proposal B.",
        supersedesAutomaticRevision: 20,
      },
    )
    const acknowledgedB = acknowledgeAnalysisViewEvent(
      queuedB,
      queuedB.pendingConfirmedEvent!,
    )

    expect(acknowledgedB.acknowledgedConfirmedEventIds).toEqual([
      "proposal-a",
      "proposal-b",
    ])
    expect(queueConfirmedAnalysisViewEvent(
      acknowledgedB,
      "draft-one",
      {
        eventId: "proposal-a",
        view: "tier_landscape",
        explanation: "Proposal A must not replay.",
        supersedesAutomaticRevision: 20,
      },
    )).toBe(acknowledgedB)
    expect(acknowledgeAnalysisViewEvent(
      acknowledgedB,
      eventA,
    )).toBe(acknowledgedB)
  })

  it("bounds acknowledged confirmed-event identities to the newest 50", () => {
    let state = createAnalysisViewEventArbitrationState("draft-one")
    for (
      let index = 0;
      index <= MAX_ACKNOWLEDGED_CONFIRMED_EVENT_IDS;
      index += 1
    ) {
      state = queueConfirmedAnalysisViewEvent(
        state,
        "draft-one",
        {
          eventId: `proposal-${index}`,
          view: "tier_landscape",
          explanation: `Confirmed proposal ${index}.`,
          supersedesAutomaticRevision: 30,
        },
      )
      state = acknowledgeAnalysisViewEvent(
        state,
        state.pendingConfirmedEvent!,
      )
    }

    expect(state.acknowledgedConfirmedEventIds).toHaveLength(
      MAX_ACKNOWLEDGED_CONFIRMED_EVENT_IDS,
    )
    expect(state.acknowledgedConfirmedEventIds[0]).toBe("proposal-1")
    expect(state.acknowledgedConfirmedEventIds.at(-1)).toBe("proposal-50")
    expect(state.acknowledgedConfirmedEventIds).not.toContain("proposal-0")
  })

  it("clears acknowledged confirmed identities when the stream changes", () => {
    const queued = queueConfirmedAnalysisViewEvent(
      createAnalysisViewEventArbitrationState("draft-one"),
      "draft-one",
      {
        eventId: "proposal-a",
        view: "tier_landscape",
        explanation: "Confirmed in draft one.",
        supersedesAutomaticRevision: 4,
      },
    )
    const acknowledged = acknowledgeAnalysisViewEvent(
      queued,
      queued.pendingConfirmedEvent!,
    )
    const nextStream = queueConfirmedAnalysisViewEvent(
      acknowledged,
      "draft-two",
      {
        eventId: "proposal-b",
        view: "cross_position",
        explanation: "Confirmed in draft two.",
        supersedesAutomaticRevision: 1,
      },
    )

    expect(nextStream.streamId).toBe("draft-two")
    expect(nextStream.acknowledgedConfirmedEventIds).toEqual([])
    expect(nextStream.pendingConfirmedEvent?.eventId).toBe("proposal-b")
  })

  it("allows the same confirmed event ID in a genuinely different stream", () => {
    const firstQueued = queueConfirmedAnalysisViewEvent(
      createAnalysisViewEventArbitrationState("draft-one"),
      "draft-one",
      {
        eventId: "proposal-shared",
        view: "tier_landscape",
        explanation: "Confirmed in draft one.",
        supersedesAutomaticRevision: 8,
      },
    )
    const firstAcknowledged = acknowledgeAnalysisViewEvent(
      firstQueued,
      firstQueued.pendingConfirmedEvent!,
    )
    const secondQueued = queueConfirmedAnalysisViewEvent(
      firstAcknowledged,
      "draft-two",
      {
        eventId: "proposal-shared",
        view: "positional_bests",
        explanation: "Confirmed independently in draft two.",
        supersedesAutomaticRevision: 2,
      },
    )

    expect(secondQueued.pendingConfirmedEvent).toMatchObject({
      streamId: "draft-two",
      eventId: "proposal-shared",
      sequence: 1,
    })
  })

  it("resets independent clocks when the draft event stream changes", () => {
    const oldDraft = acknowledgeAnalysisViewEvent(
      createAnalysisViewEventArbitrationState("draft-one"),
      automatic(50),
    )
    const newDraftEvent: AutomaticAnalysisViewEvent = {
      ...automatic(1),
      streamId: "draft-two",
    }

    expect(arbitrateAnalysisViewEventsByLayout(
      oldDraft,
      newDraftEvent,
    ).desktop).toEqual(newDraftEvent)
  })
})
