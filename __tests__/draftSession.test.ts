import fixture from "./fixtures/espn-cumulative-draft.json"
import {
  CanonicalDraftEvent,
  createDraftSessionReducerState,
  getRosterIndexForPick,
  reduceDraftSnapshot,
} from "../behavior/draft-feed/session"
import { DraftSnapshot } from "../behavior/draft-feed/types"

describe("draft session reducer", () => {
  it("replays cumulative ESPN snapshots without React or duplicate picks", () => {
    const snapshots = fixture.snapshots as DraftSnapshot[]
    const originalState = createDraftSessionReducerState()
    let state = originalState
    let events: CanonicalDraftEvent[] = []

    snapshots.forEach((snapshot) => {
      const result = reduceDraftSnapshot(state, snapshot, {
        numTeams: fixture.metadata.numTeams,
        playersByPositionAndTeam: {},
      })
      state = result.state
      events = [...events, ...result.events]
    })

    expect(originalState).toEqual(createDraftSessionReducerState())
    expect(events.map((event) => event.eventId)).toEqual(
      fixture.expected.eventIds,
    )
    expect(events.map((event) => event.pick.overallPick)).toEqual(
      fixture.expected.overallPicks,
    )
    expect(events.map((event) => event.pick.rosterIndex)).toEqual(
      fixture.expected.rosterIndexes,
    )
    expect(
      state.lastOverallPickByDraft[snapshots[0].id] + 1,
    ).toBe(fixture.expected.currentPick)

    const repeated = reduceDraftSnapshot(
      state,
      snapshots[snapshots.length - 1],
      {
        numTeams: fixture.metadata.numTeams,
        playersByPositionAndTeam: {},
      },
    )
    expect(repeated.events).toEqual([])
    expect(repeated.lastProcessedPick).toBeNull()
    expect(repeated.state).toEqual(state)
  })

  it("assigns snake-draft roster indexes across the turn", () => {
    expect(getRosterIndexForPick(1, 12)).toBe(0)
    expect(getRosterIndexForPick(12, 12)).toBe(11)
    expect(getRosterIndexForPick(13, 12)).toBe(11)
    expect(getRosterIndexForPick(24, 12)).toBe(0)
    expect(getRosterIndexForPick(25, 12)).toBe(0)
  })
})
