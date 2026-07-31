import {
  runCompletedDraftReplay,
} from "../behavior/draft-advisor/completedDraftReplay"
import {
  createDraftSessionReducerState,
  reduceDraftSnapshot,
} from "../behavior/draft-feed/session"
import {
  normalizeDraftFeedMessage,
} from "../behavior/draft-feed/types"
import {
  recordedEspnCanonicalEvents,
  recordedEspnReplay,
  recordedEspnSnapshot,
} from "../test-support/recordedEspnDraft"


describe("Phase 7 recorded ESPN mock acceptance", () => {
  it("replays the complete extension snapshot without loss or duplicates", () => {
    const snapshot = recordedEspnSnapshot()
    const normalized = normalizeDraftFeedMessage({
      type: "FF_DRAFT_DASHBOARD",
      payload: {
        version: 1,
        kind: "draft-snapshot",
        sentAt: snapshot.capturedAt,
        draft: snapshot,
      },
    })
    expect(normalized?.kind).toBe("draft-snapshot")
    if (!normalized || normalized.kind !== "draft-snapshot") {
      throw new Error("Recorded ESPN snapshot did not normalize")
    }

    const first = reduceDraftSnapshot(
      createDraftSessionReducerState(),
      normalized.draft,
      {
        numTeams: recordedEspnReplay.settings.numTeams,
        playersByPositionAndTeam: {},
      },
    )
    const expected = recordedEspnReplay.actualPicks.filter(pick =>
      pick.advisorEligible !== false)

    expect(snapshot.completion).toMatchObject({
      complete: true,
      totalPicks: 160,
      numTeams: 10,
      targetRosterIndex: 8,
    })
    expect(first.events).toHaveLength(139)
    expect(first.events.map(event => event.pick.playerId)).toEqual(
      expected.map(pick => pick.playerId),
    )
    expect(first.events.map(event => event.pick.overallPick)).toEqual(
      expected.map(pick => pick.overallPick),
    )
    expect(first.events.map(event => event.pick.rosterIndex)).toEqual(
      expected.map(pick => pick.rosterIndex),
    )
    expect(new Set(first.events.map(event => event.eventId)).size)
      .toBe(first.events.length)

    const repeated = reduceDraftSnapshot(
      first.state,
      normalized.draft,
      {
        numTeams: recordedEspnReplay.settings.numTeams,
        playersByPositionAndTeam: {},
      },
    )
    expect(repeated.events).toEqual([])
    expect(repeated.state).toEqual(first.state)
  })

  it("produces a deterministic legal roster from the same full replay", () => {
    const first = runCompletedDraftReplay(
      recordedEspnReplay,
      "combined",
    )
    const repeated = runCompletedDraftReplay(
      recordedEspnReplay,
      "combined",
    )

    expect({
      ...first,
      decisionLatencyP95Ms: 0,
    }).toEqual({
      ...repeated,
      decisionLatencyP95Ms: 0,
    })
    expect(first.quality.legal).toBe(true)
    expect(first.quality.starterCompleteness).toBe(1)
    expect(first.selectedPlayerIds).toHaveLength(14)
    expect(first.positionalRankViolations).toBe(0)
  })

  it("fails closed on malformed and duplicate rows in one snapshot", () => {
    const snapshot = recordedEspnSnapshot()
    const firstPick = snapshot.picks[0]
    const conflictingPick = snapshot.picks[1]
    const corruptedSnapshot = {
      ...snapshot,
      picks: [
        firstPick,
        {
          ...conflictingPick,
          pick: firstPick.pick,
        },
        firstPick,
        {
          ...firstPick,
          pick: "Drafting soon",
        },
      ],
    }

    const result = reduceDraftSnapshot(
      createDraftSessionReducerState(),
      corruptedSnapshot,
      {
        numTeams: recordedEspnReplay.settings.numTeams,
        playersByPositionAndTeam: {},
      },
    )

    expect(result.events).toHaveLength(1)
    expect(result.events[0].pick).toMatchObject({
      playerId: recordedEspnReplay.actualPicks[0].playerId,
      overallPick: 1,
    })
    expect(result.state.processedEventIds).toEqual([
      "ESPN:36954084:pick:1",
    ])
  })

  it("builds the same canonical boundary used by the live API harness", () => {
    const { snapshot, events } = recordedEspnCanonicalEvents()

    expect(snapshot.id).toBe("ESPN:36954084")
    expect(events[0]).toMatchObject({
      eventId: "ESPN:36954084:pick:1",
      draftId: "ESPN:36954084",
      platform: "ESPN",
      pick: {
        overallPick: 1,
        rosterIndex: 0,
      },
    })
    expect(events.at(-1)?.pick.overallPick).toBe(159)
  })
})
