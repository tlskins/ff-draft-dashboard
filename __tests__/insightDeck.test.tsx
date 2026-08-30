import React from "react"
import {fireEvent, render, screen, within} from "@testing-library/react"

import type {InsightDeckController} from "../behavior/hooks/useInsightDeckController"
import {
  createInsightDeckState,
  InsightDeckSelection,
  InsightDeckSlotId,
  InsightDeckState,
  InsightEvidenceState,
  InsightViewId,
} from "../behavior/insights/insightDeck"
import InsightDeck from "../components/insight/InsightDeck"

const selection = (
  viewId: InsightViewId,
  evidenceState: InsightEvidenceState = "ready",
  pinned = false,
): InsightDeckSelection => ({
  viewId,
  slot: viewId === "plan_constraints" ? "plan_constraints" : viewId === "current_tier_market"
    ? "market_watch" : "primary_decision",
  score: 10,
  reasonCode: "test",
  explanation: `${viewId} explanation.`,
  evidence: {
    state: evidenceState,
    fingerprint: `${viewId}:${evidenceState}`,
    ...(evidenceState === "stale" ? {staleReason: "Forecast is old."} : {}),
    ...(evidenceState === "unavailable" ? {unavailableReason: "Source is unavailable."} : {}),
  },
  source: pinned ? "manual" : "auto",
  pinned,
  selectedAtMaterialEvent: 1,
})

const state = (overrides: Partial<InsightDeckState> = {}): InsightDeckState => ({
  ...createInsightDeckState("draft-one"),
  materialEventCount: 1,
  slots: {
    primary_decision: {selection: selection("candidate_comparison"), queuedAlternatives: []},
    market_watch: {selection: selection("current_tier_market"), queuedAlternatives: []},
    plan_constraints: {selection: selection("plan_constraints"), queuedAlternatives: []},
  },
  ...overrides,
})

const controller = (deckState = state()): InsightDeckController => ({
  state: deckState,
  pinSlot: jest.fn(),
  restoreSlotAuto: jest.fn(),
  selectView: jest.fn(),
})

const renderer = (viewId: InsightViewId) => (
  <div data-testid={`rendered-${viewId}`}>Rendered {viewId}</div>
)

describe("InsightDeck", () => {
  it("renders two named slots with a closed view catalog and native per-slot controls", () => {
    const deck = controller()
    render(<InsightDeck controller={deck} renderView={renderer} />)

    expect(screen.getByRole("region", {name: "Decision view"})).toBeTruthy()
    expect(screen.getByRole("region", {name: "Supporting view"})).toBeTruthy()
    expect(screen.getAllByRole("combobox")).toHaveLength(2)
    expect(screen.getAllByRole("option", {name: "Player Lab"})).toHaveLength(2)
    const primaryMode = screen.getByRole("group", {name: "Decision view mode"})
    const auto = within(primaryMode).getByRole("button", {name: "Auto"})
    const pin = within(primaryMode).getByRole("button", {name: "Pin"})
    expect(auto.tagName).toBe("BUTTON")
    expect(pin.tagName).toBe("BUTTON")
    auto.focus()
    expect(document.activeElement).toBe(auto)
    expect(auto.getAttribute("aria-pressed")).toBe("true")
    expect(pin.getAttribute("aria-pressed")).toBe("false")
    expect(screen.queryByRole("heading", {name: "Insight deck"})).toBeNull()
  })

  it("keeps pin and Auto controls independent for each slot", () => {
    const deck = controller()
    render(<InsightDeck controller={deck} renderView={renderer} />)

    fireEvent.click(within(screen.getByRole("group", {
      name: "Supporting view mode",
    })).getByRole("button", {name: "Pin"}))
    fireEvent.click(within(screen.getByRole("group", {
      name: "Decision view mode",
    })).getByRole("button", {name: "Auto"}))

    expect(deck.pinSlot).toHaveBeenCalledWith("market_watch")
    expect(deck.pinSlot).not.toHaveBeenCalledWith("primary_decision")
    expect(deck.restoreSlotAuto).toHaveBeenCalledWith("primary_decision")
    expect(deck.restoreSlotAuto).not.toHaveBeenCalledWith("market_watch")
  })

  it("has exactly one initially silent deck-owned live region and announces one transition", () => {
    const initial = controller()
    const view = render(<InsightDeck controller={initial} renderView={renderer} />)
    expect(screen.getAllByRole("status")).toHaveLength(1)
    expect(screen.getByRole("status").textContent).toBe("")

    const transitioned = controller(state({
      announcement: {
        id: "draft-one:2:market_watch:auto_selected:two_round_run_matrix",
        slot: "market_watch",
        kind: "auto_selected",
        text: "Two-round run matrix auto selected for market watch.",
      },
    }))
    view.rerender(<InsightDeck controller={transitioned} renderView={renderer} />)

    expect(screen.getAllByRole("status")).toHaveLength(1)
    expect(screen.getByRole("status").textContent)
      .toBe("Two-round run matrix auto selected for market watch.")
  })

  it.each(["ready", "loading", "stale", "unavailable"] as const)(
    "renders explicit %s evidence state",
    evidenceState => {
      const deckState = state({
        slots: {
          ...state().slots,
          primary_decision: {
            selection: selection("candidate_comparison", evidenceState),
            queuedAlternatives: [],
          },
        },
      })
      render(<InsightDeck controller={controller(deckState)} renderView={renderer} />)
      expect(screen.getAllByText(
        `Evidence: ${evidenceState.charAt(0).toUpperCase()}${evidenceState.slice(1)}`,
      ).length).toBeGreaterThan(0)
    },
  )

  it("lets a user select any registered view from either visible slot", () => {
    const deck = controller()
    render(<InsightDeck controller={deck} renderView={renderer} />)

    fireEvent.change(screen.getByRole("combobox", {name: "Supporting view view"}), {
      target: {value: "two_round_run_matrix"},
    })
    expect(deck.selectView).toHaveBeenCalledWith(
      "market_watch",
      "two_round_run_matrix",
    )
  })

  it("reveals a manually selected compact view when the other pane was expanded", () => {
    const deckState = state({
      slots: {
        ...state().slots,
        market_watch: {
          selection: {...selection("two_round_run_matrix"), slot: "market_watch"},
          queuedAlternatives: [],
        },
      },
    })
    const deck = controller(deckState)
    render(<InsightDeck controller={deck} renderView={renderer} />)

    expect(screen.queryByTestId("rendered-candidate_comparison")).toBeNull()
    fireEvent.change(screen.getByRole("combobox", {name: "Decision view view"}), {
      target: {value: "current_board_projection"},
    })

    expect(deck.selectView).toHaveBeenCalledWith(
      "primary_decision",
      "current_board_projection",
    )
    expect(screen.getByTestId("rendered-candidate_comparison")).toBeTruthy()
    expect(screen.getByTestId("rendered-two_round_run_matrix")).toBeTruthy()
  })

  it("expands one view to both rows and restores the split layout", () => {
    render(<InsightDeck controller={controller()} renderView={renderer} />)

    fireEvent.click(screen.getByRole("button", {name: "Expand Position decision table"}))
    expect(screen.queryByTestId("rendered-current_tier_market")).toBeNull()
    fireEvent.click(screen.getByRole("button", {
      name: "Restore two insight views from Position decision table",
    }))
    expect(screen.getByTestId("rendered-current_tier_market")).toBeTruthy()
  })

  it("accepts a page-owned expanded slot and reports requested layout changes", () => {
    const onExpandedSlotChange = jest.fn()
    render(<InsightDeck
      controller={controller()}
      expandedSlot="primary_decision"
      onExpandedSlotChange={onExpandedSlotChange}
      renderView={renderer}
    />)

    expect(screen.queryByTestId("rendered-current_tier_market")).toBeNull()
    fireEvent.click(screen.getByRole("region", {name: "Supporting view"}))
    expect(onExpandedSlotChange).toHaveBeenLastCalledWith("market_watch")
  })

  it("restores a collapsed view when its visible slot is clicked", () => {
    render(<InsightDeck controller={controller()} renderView={renderer} />)

    fireEvent.click(screen.getByRole("button", {name: "Expand Position decision table"}))
    expect(screen.queryByTestId("rendered-current_tier_market")).toBeNull()

    fireEvent.click(screen.getByRole("region", {name: "Supporting view"}))
    expect(screen.getByTestId("rendered-current_tier_market")).toBeTruthy()
  })

  it("fails closed when a registered renderer is missing", () => {
    render(<InsightDeck controller={controller()} renderView={() => null} />)
    expect(screen.getAllByText("Registered view renderer is unavailable for this slot."))
      .toHaveLength(2)
  })

  it("suppresses duplicate registered view rendering in malformed input", () => {
    const malformed = state()
    malformed.slots.market_watch.selection = {
      ...selection("current_tier_market"),
      slot: "market_watch",
    }
    malformed.slots.primary_decision.selection = {
      ...selection("current_tier_market"),
      slot: "primary_decision",
    }
    const calls = jest.fn(renderer)
    render(<InsightDeck controller={controller(malformed)} renderView={calls} />)

    expect(calls.mock.calls.filter(([viewId]) => viewId === "current_tier_market"))
      .toHaveLength(1)
    expect(screen.getByText("Duplicate registered view suppressed; choose Auto to reconcile this slot."))
      .toBeTruthy()
  })
})
