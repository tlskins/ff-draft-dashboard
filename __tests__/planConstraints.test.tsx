import React from "react"
import {render, screen, within} from "@testing-library/react"

import {buildPlanConstraintsPresentationModel} from "../behavior/insights/planConstraints"
import PlanConstraintsSurface from "../components/insight/PlanConstraintsSurface"
import {FantasyPosition} from "../types"
import type {FantasySettings} from "../types"
import type {Roster} from "../behavior/draft"
import type {DraftPlanDocument} from "../behavior/realtime/contracts"

const settings: FantasySettings = {
  ppr: true, numTeams: 3, numStartingQbs: 1, numStartingRbs: 2,
  numStartingWrs: 2, numStartingTes: 1, numFlex: 1, numBenchPlayers: 6,
}

const roster = ({qb = 0, rb = 0, wr = 0, te = 0}: {
  qb?: number, rb?: number, wr?: number, te?: number
} = {}): Roster => ({
  picks: Array.from({length: qb + rb + wr + te}, (_, index) => `p${index}`),
  [FantasyPosition.QUARTERBACK]: Array.from({length: qb}, (_, index) => `qb${index}`),
  [FantasyPosition.RUNNING_BACK]: Array.from({length: rb}, (_, index) => `rb${index}`),
  [FantasyPosition.WIDE_RECEIVER]: Array.from({length: wr}, (_, index) => `wr${index}`),
  [FantasyPosition.TIGHT_END]: Array.from({length: te}, (_, index) => `te${index}`),
})

const plan = (entries: DraftPlanDocument["entries"]): DraftPlanDocument => ({
  schema_version: 1,
  draft_session_id: "session-one",
  revision: 3,
  updated_at: "2026-08-20T12:00:00Z",
  entries,
})

describe("Phase 14C plan and constraints presentation", () => {
  it("distinguishes an unavailable roster from an empty confirmed plan", () => {
    const model = buildPlanConstraintsPresentationModel({
      userRoster: undefined,
      rosters: [roster()],
      myRosterIndex: 0,
      settings,
      draftPlan: plan([]),
    })

    expect(model.rosterState).toBe("unavailable")
    expect(model.userSlots).toEqual([])
    expect(model.plan.state).toBe("empty")
    expect(model.plan.entries).toEqual([])
    expect(model.fingerprint).toMatch(/^[a-f0-9]{8}$/)
  })

  it("does not render starter rows or league needs when those boundaries are unavailable", () => {
    const model = buildPlanConstraintsPresentationModel({
      userRoster: undefined,
      rosters: [roster()],
      myRosterIndex: 4,
      settings,
      draftPlan: null,
    })
    const view = render(<PlanConstraintsSurface model={model} />)

    expect(model.leagueNeedsState).toBe("unavailable")
    expect(screen.queryByRole("table", {name: "Your starter slot constraints"})).toBeNull()
    expect(screen.queryByRole("table", {name: "Other-team starter and FLEX needs"})).toBeNull()
    expect(screen.getByText(/starter slots are not confirmed empty/i)).toBeTruthy()
    expect(screen.getByText(/roster index is outside/i)).toBeTruthy()
    expect(view.container.textContent).not.toMatch(/\bOpen\b/)
  })

  it("fails closed for malformed plan data without throwing", () => {
    const malformed = {
      schema_version: 1,
      draft_session_id: "session-one",
      revision: "three",
      updated_at: "not-a-date",
      entries: [{id: "", text: 42, source_event_count: -1, created_at: ""}],
    } as unknown as DraftPlanDocument

    expect(() => buildPlanConstraintsPresentationModel({
      userRoster: roster(), rosters: [roster()], myRosterIndex: 0,
      settings, draftPlan: malformed,
    })).not.toThrow()
    const model = buildPlanConstraintsPresentationModel({
      userRoster: roster(), rosters: [roster()], myRosterIndex: 0,
      settings, draftPlan: malformed,
    })
    expect(model.plan).toMatchObject({state: "unavailable", entries: []})
    expect(model.plan.unavailableReason).toMatch(/malformed/i)
  })

  it("reuses direct starter and unallocated FLEX semantics while excluding the user from league needs", () => {
    const user = roster({qb: 1, rb: 3, wr: 2, te: 1})
    const opponentMissingQb = roster({rb: 2, wr: 2, te: 1})
    const opponentNeedsFlex = roster({qb: 1, rb: 2, wr: 2, te: 1})
    const model = buildPlanConstraintsPresentationModel({
      userRoster: user,
      rosters: [user, opponentMissingQb, opponentNeedsFlex],
      myRosterIndex: 0,
      settings,
      draftPlan: plan([{id: "plan-1", proposal_id: "proposal-1", text: "Prioritize RB before the next turn.", source_event_count: 4, created_at: "2026-08-20T12:00:00Z"}]),
    })

    expect(model.userSlots.find(slot => slot.id === "RB-2")?.filled).toBe(true)
    expect(model.userSlots.find(slot => slot.id === "FLEX-1")).toMatchObject({
      observed: 1, filled: true,
    })
    expect(model.leagueNeeds.find(need => need.id === "QB-1")?.teamsMissing).toBe(1)
    expect(model.leagueNeeds.find(need => need.id === "FLEX-1")?.teamsMissing).toBe(2)
    expect(model.plan).toMatchObject({state: "ready", revision: 3})
    expect(model.plan.entries[0]).toMatchObject({
      text: "Prioritize RB before the next turn.", sourceEventCount: 4,
    })
  })

  it("renders dense read-only semantic tables and confirmed entries without a live region", () => {
    const model = buildPlanConstraintsPresentationModel({
      userRoster: roster({qb: 1, rb: 3, wr: 2, te: 1}),
      rosters: [roster({qb: 1, rb: 3, wr: 2, te: 1}), roster({rb: 2, wr: 2, te: 1})],
      myRosterIndex: 0,
      settings,
      draftPlan: plan([{id: "plan-1", proposal_id: "proposal-1", text: "Hold the FLEX for value.", source_event_count: 3, created_at: "2026-08-20T12:00:00Z"}]),
    })
    const view = render(<PlanConstraintsSurface model={model} />)
    const region = screen.getByRole("region", {name: "Plan and roster constraints"})

    expect(within(region).getByRole("table", {name: "Your starter slot constraints"})).toBeTruthy()
    expect(within(region).getByRole("table", {name: "Other-team starter and FLEX needs"})).toBeTruthy()
    expect(within(region).getByRole("list", {name: "Confirmed plan entries"})).toBeTruthy()
    expect(within(region).getByText("Revision 3")).toBeTruthy()
    expect(within(region).getByText("Hold the FLEX for value.")).toBeTruthy()
    expect(within(region).queryByRole("button")).toBeNull()
    expect(view.container.querySelectorAll("[aria-live]")).toHaveLength(0)
  })
})
