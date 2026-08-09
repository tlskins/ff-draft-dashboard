import {
  acknowledgeAnalysisViewEvent,
  arbitrateAnalysisViewEventsByLayout,
  createAnalysisViewEventArbitrationState,
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
