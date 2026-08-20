import {
  DEFAULT_DRAFT_DESK_PANE_PLACEMENT,
  buildDraftDeskLeagueNeeds,
  buildDraftDeskRosterSlots,
  createDraftDeskInsightMaterialEvent,
  isDraftDeskEnabled,
  isPhase14CInsightDeckEnabled,
  resolveDraftDeskInsightPaneMode,
  restoreDraftDeskPanePlacement,
  swapDraftDeskPanePlacement,
} from "../behavior/draftDesk"
import type { FantasySettings } from "../types"
import type { Roster } from "../behavior/draft"

const settings: FantasySettings = {
  ppr: true,
  numTeams: 3,
  numStartingQbs: 1,
  numStartingRbs: 2,
  numStartingWrs: 2,
  numStartingTes: 1,
  numFlex: 1,
  numBenchPlayers: 5,
}

const roster = (values: Partial<Roster>): Roster => ({
  picks: [], QB: [], RB: [], WR: [], TE: [], ...values,
})

describe("Phase 14A draft desk presentation state", () => {
  it("uses the accepted default placement and supports one bounded pane swap", () => {
    expect(DEFAULT_DRAFT_DESK_PANE_PLACEMENT).toEqual([
      "rankings", "profile", "insight",
    ])
    expect(swapDraftDeskPanePlacement(DEFAULT_DRAFT_DESK_PANE_PLACEMENT))
      .toEqual(["rankings", "insight", "profile"])
  })

  it("falls back to default placement for malformed persisted state", () => {
    expect(restoreDraftDeskPanePlacement(["profile", "profile", "insight"]))
      .toEqual(DEFAULT_DRAFT_DESK_PANE_PLACEMENT)
    expect(restoreDraftDeskPanePlacement({placement: ["rankings"]}))
      .toEqual(DEFAULT_DRAFT_DESK_PANE_PLACEMENT)
    expect(restoreDraftDeskPanePlacement(["insight", "rankings", "profile"]))
      .toEqual(["insight", "rankings", "profile"])
  })

  it("keeps own observed starter slots horizontal and FLEX unallocated", () => {
    const slots = buildDraftDeskRosterSlots(roster({
      QB: ["qb"], RB: ["rb-1", "rb-2", "rb-3"], WR: ["wr-1", "wr-2"],
      TE: ["te"],
    }), settings)

    expect(slots.map(slot => slot.label)).toEqual([
      "QB", "RB1", "RB2", "WR1", "WR2", "TE", "FLEX",
    ])
    expect(slots.find(slot => slot.label === "FLEX")).toMatchObject({
      position: "FLEX", filled: true,
    })
  })

  it("counts only other teams' explicit starter needs and keeps FLEX distinct", () => {
    const needs = buildDraftDeskLeagueNeeds([
      roster({QB: ["mine-qb"], RB: ["mine-rb-1", "mine-rb-2"], WR: ["mine-wr-1", "mine-wr-2"], TE: ["mine-te"]}),
      roster({QB: ["one-qb"], RB: ["one-rb"], WR: ["one-wr-1", "one-wr-2"], TE: ["one-te"]}),
      roster({QB: [], RB: ["two-rb-1", "two-rb-2", "two-rb-3"], WR: ["two-wr-1", "two-wr-2"], TE: ["two-te"]}),
    ], 0, settings)

    expect(needs.find(need => need.label === "QB")?.teamsMissing).toBe(1)
    expect(needs.find(need => need.label === "RB2")?.teamsMissing).toBe(1)
    expect(needs.find(need => need.label === "FLEX")).toMatchObject({
      position: "FLEX", teamsMissing: 1,
    })
    expect(needs.find(need => need.label === "FLEX")?.description)
      .toMatch(/not assigned to RB or WR/)
  })

  it("leaves the candidate off when the feature flag is absent or false", () => {
    expect(isDraftDeskEnabled()).toBe(false)
    expect(isDraftDeskEnabled("false")).toBe(false)
    expect(isDraftDeskEnabled("true")).toBe(true)
  })

  it("enables the Phase 14C deck unless it is explicitly rolled back", () => {
    expect(isPhase14CInsightDeckEnabled()).toBe(true)
    expect(isPhase14CInsightDeckEnabled("false")).toBe(false)
    expect(isPhase14CInsightDeckEnabled("true")).toBe(true)
  })

  it("keeps one desktop insight pane and scopes its material identity to the draft", () => {
    expect(resolveDraftDeskInsightPaneMode(true, false)).toBe("deck")
    expect(resolveDraftDeskInsightPaneMode(true, true)).toBe("workspace")
    expect(resolveDraftDeskInsightPaneMode(false, false)).toBe("workspace")

    expect(createDraftDeskInsightMaterialEvent("draft-42", "pick:18"))
      .toEqual({streamId: "draft-42", draftKey: "pick:18"})
    expect(createDraftDeskInsightMaterialEvent(null, "pick:18"))
      .toEqual({streamId: "unscoped-draft", draftKey: "pick:18"})
  })
})
