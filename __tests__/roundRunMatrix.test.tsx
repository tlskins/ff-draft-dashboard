import React from "react"
import {render} from "@testing-library/react"

import RoundRunMatrix from "../components/insight/RoundRunMatrix"
import type {RoundMarketPresentationModel} from "../behavior/analysis/roundMarket"

const positions = ["QB", "RB", "WR", "TE"] as const

const model = (): RoundMarketPresentationModel => ({
  schemaVersion: 1,
  id: "round_market_v1",
  inputFingerprint: "1234abcd",
  modelIdentity: "deterministic_opponent_v1",
  targetRosterIndex: 0,
  buckets: ["next_user_turn", "following_user_turn"].map((id, bucketIndex) => ({
    id: id as "next_user_turn" | "following_user_turn",
    targetOverallPick: bucketIndex === 0 ? 12 : 24,
    firstOpponentOverallPick: bucketIndex === 0 ? 8 : 13,
    lastOpponentOverallPick: bucketIndex === 0 ? 11 : 23,
    opponentPickCount: bucketIndex === 0 ? 4 : 11,
    provenance: bucketIndex === 0 ? "frozen_v1_window" as const : "static_board_derived_v1" as const,
    staticBoardAssumption: bucketIndex === 1,
    unavailableReason: null,
    positions: positions.map(position => ({
      position,
      expectedPositionalPicks: position === "RB" ? 1.4 : 0.8,
      runThreshold: 3,
      probabilityAtLeastThreshold: position === "RB" ? 0.61 : 0.2,
      observedNeed: {
        position,
        otherTeamsOpenStarterSlots: position === "RB" ? 2 : 0,
        otherTeamsWithOpenStarter: position === "RB" ? 2 : 0,
        otherTeamsOpenFlexSlots: bucketIndex === 0 ? null : 1,
        otherTeamsWithOpenFlex: bucketIndex === 0 ? null : 1,
        status: bucketIndex === 0 ? "unavailable" as const : "observed" as const,
        unavailableReason: bucketIndex === 0 ? "Observed FLEX need is unavailable." : null,
      },
      tiers: position === "RB" ? [
        {
          id: "active_board:RB:tier:1", authority: "active_board" as const, position,
          tier: 1, playerIds: ["rb-1", "rb-2"], availablePlayerCount: 2,
          expectedUniquePlayersTakenInBucket: 0.7,
          exhaustionProbabilityByEndOfBucket: 0.33,
          probabilityMethod: "deterministic_without_replacement_simulation_v1" as const,
          provenance: "static_board_derived_v1" as const,
          assumption: "Static-board full-pool estimate.", status: "available" as const,
          unavailableReason: null,
        },
        {
          id: "active_board:RB:tier:2", authority: "active_board" as const, position,
          tier: 2, playerIds: ["rb-3"], availablePlayerCount: 1,
          expectedUniquePlayersTakenInBucket: 0.3,
          exhaustionProbabilityByEndOfBucket: 0.1,
          probabilityMethod: "deterministic_without_replacement_simulation_v1" as const,
          provenance: "static_board_derived_v1" as const,
          assumption: "Static-board full-pool estimate.", status: "available" as const,
          unavailableReason: null,
        },
      ] : [{
        id: `active_board:${position}:tier:1`, authority: "active_board" as const, position,
        tier: 1, playerIds: [], availablePlayerCount: 0,
        expectedUniquePlayersTakenInBucket: null, exhaustionProbabilityByEndOfBucket: null,
        probabilityMethod: "unavailable" as const, provenance: "unavailable" as const,
        assumption: null, status: "pool_incomplete" as const,
        unavailableReason: "The bounded forecast pool is incomplete.",
      }],
    })),
  })) as RoundMarketPresentationModel["buckets"],
})

describe("RoundRunMatrix", () => {
  it("renders an accessible two-turn matrix with explicit threshold and provenance", () => {
    const view = render(<RoundRunMatrix model={model()} />)

    expect(view.getByRole("table")).toBeTruthy()
    expect(view.getAllByRole("columnheader")).toHaveLength(3)
    expect(view.getAllByRole("rowheader")).toHaveLength(4)
    expect(view.getAllByText(/61% chance of 3\+ RB picks/)).toHaveLength(2)
    expect(view.getByText(/frozen positional evidence/i)).toBeTruthy()
    expect(view.getByText(/provisional static-board estimate/i)).toBeTruthy()
    expect(view.queryByRole("status")).toBeNull()
    expect(view.container.querySelector("[aria-live]")).toBeNull()
    expect(view.getByText(/Scroll horizontally to compare both turns/i)).toBeTruthy()
  })

  it("keeps tier-local depletion and cumulative exhaustion copy distinct", () => {
    const view = render(<RoundRunMatrix model={model()} />)

    expect(view.getAllByText(/0.7 unique players expected gone this turn/)).toHaveLength(2)
    expect(view.getAllByText(/33% exhausted by end of/)).toHaveLength(2)
    expect(view.getAllByText(/Static-board-derived tier estimate · Static-board full-pool estimate/)).toHaveLength(4)
    expect(view.getAllByText("Tier 2 · 1 available")).toHaveLength(2)
  })

  it("retains observed starter need when FLEX evidence is unavailable", () => {
    const view = render(<RoundRunMatrix model={model()} />)

    expect(view.getAllByText("2 slots across 2 teams")).toHaveLength(2)
    expect(view.getAllByText("Unavailable")).toHaveLength(4)
    expect(view.getAllByText(/Tier pool incomplete/).length).toBeGreaterThan(0)
  })

  it("renders a clear unavailable state without inventing zeroes", () => {
    const view = render(<RoundRunMatrix model={null} />)

    expect(view.getByRole("heading", {name: "Two-turn run market unavailable"})).toBeTruthy()
    expect(view.queryByText(/0\.0 expected positional picks/)).toBeNull()
  })

  it("does not claim frozen or static evidence for an unavailable bucket", () => {
    const unavailable = model()
    unavailable.buckets[0] = {
      ...unavailable.buckets[0],
      provenance: "unavailable",
      unavailableReason: "Frozen forecast was not admitted.",
    }
    const view = render(<RoundRunMatrix model={unavailable} />)

    expect(view.getByRole("columnheader", {name: "Next turn market unavailable"})).toBeTruthy()
    expect(view.queryByRole("columnheader", {name: /frozen positional evidence/i})).toBeNull()
    expect(view.getAllByText("Market unavailable").length).toBeGreaterThan(0)
  })

  it("fails closed when an available tier lacks static-board provenance or an assumption", () => {
    const malformed = model()
    malformed.buckets[0].positions.find(lane => lane.position === "RB")!.tiers[0] = {
      ...malformed.buckets[0].positions.find(lane => lane.position === "RB")!.tiers[0],
      provenance: "unavailable",
      assumption: null,
    }
    const view = render(<RoundRunMatrix model={malformed} />)

    expect(view.getByText(/Tier provenance unavailable/)).toBeTruthy()
    expect(view.getByText(/without a static-board provenance and assumption/i)).toBeTruthy()
  })

  it("uses explicit null run-probability copy", () => {
    const unavailableProbability = model()
    unavailableProbability.buckets[0].positions.find(lane => lane.position === "RB")!
      .probabilityAtLeastThreshold = null
    const view = render(<RoundRunMatrix model={unavailableProbability} />)

    expect(view.getByText("Run probability unavailable for 3+ RB picks")).toBeTruthy()
    expect(view.queryByText(/Unavailable chance of 3\+ RB picks/)).toBeNull()
  })
})
