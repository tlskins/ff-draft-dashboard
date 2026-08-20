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
  it("renders all three named slots with native per-slot controls and session-local copy", () => {
    const deck = controller()
    render(<InsightDeck controller={deck} renderView={renderer} />)

    expect(screen.getByText("Primary decision")).toBeTruthy()
    expect(screen.getByText("Market watch")).toBeTruthy()
    expect(screen.getByText("Plan & constraints")).toBeTruthy()
    expect(screen.getByText("Pins stay in this draft session only.")).toBeTruthy()
    const primaryMode = screen.getByRole("group", {name: "Primary decision mode"})
    const auto = within(primaryMode).getByRole("button", {name: "Auto"})
    const pin = within(primaryMode).getByRole("button", {name: "Pin"})
    expect(auto.tagName).toBe("BUTTON")
    expect(pin.tagName).toBe("BUTTON")
    auto.focus()
    expect(document.activeElement).toBe(auto)
    expect(auto.getAttribute("aria-pressed")).toBe("true")
    expect(pin.getAttribute("aria-pressed")).toBe("false")
  })

  it("keeps pin and Auto controls independent for each slot", () => {
    const deck = controller()
    render(<InsightDeck controller={deck} renderView={renderer} />)

    fireEvent.click(within(screen.getByRole("group", {
      name: "Market watch mode",
    })).getByRole("button", {name: "Pin"}))
    fireEvent.click(within(screen.getByRole("group", {
      name: "Primary decision mode",
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

  it("discloses queued alternatives and their blocked reasons", () => {
    const current = state()
    current.slots.primary_decision.queuedAlternatives = [
      {...selection("current_tier_market"), evidence: {state: "ready", fingerprint: "pinned"}, blockedBy: "pinned"},
      {...selection("current_tier_market"), evidence: {state: "ready", fingerprint: "margin"}, blockedBy: "margin"},
      {...selection("current_tier_market"), evidence: {state: "ready", fingerprint: "dwell"}, blockedBy: "dwell"},
      {...selection("current_tier_market"), evidence: {state: "ready", fingerprint: "duplicate"}, blockedBy: "duplicate"},
      {...selection("current_tier_market"), evidence: {state: "loading", fingerprint: "evidence"}, blockedBy: "evidence"},
    ]
    render(<InsightDeck controller={controller(current)} renderView={renderer} />)

    fireEvent.click(screen.getByText("Alternatives (5)"))
    expect(screen.getByText("Pinned view preserved")).toBeTruthy()
    expect(screen.getByText("Below significance margin")).toBeTruthy()
    expect(screen.getByText("Waiting for material-event dwell")).toBeTruthy()
    expect(screen.getByText("Already shown in another slot")).toBeTruthy()
    expect(screen.getByText("Evidence is not ready for Auto")).toBeTruthy()
  })

  it("fails closed when a registered renderer is missing", () => {
    render(<InsightDeck controller={controller()} renderView={() => null} />)
    expect(screen.getAllByText("Registered view renderer is unavailable for this slot."))
      .toHaveLength(3)
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
