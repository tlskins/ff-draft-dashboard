import React from "react"
import {fireEvent, render, screen, within} from "@testing-library/react"

import Phase14AVisualFixture, {
  phase14aVisualFixtureRouteResult,
} from "../pages/phase14a-visual-fixture"

describe("Phase 14A visual acceptance fixture", () => {
  it("resolves as not found in production and remains available in development", () => {
    expect(phase14aVisualFixtureRouteResult("production"))
      .toEqual({notFound: true})
    expect(phase14aVisualFixtureRouteResult("development"))
      .toEqual({props: {}})
  })

  it("renders a deterministic populated shell and exercises every dock mode", () => {
    render(<Phase14AVisualFixture />)

    expect(screen.getByText("Home League")).toBeTruthy()
    expect(screen.getAllByText("De'Von Achane").length).toBeGreaterThan(0)
    expect(screen.getByText("Cross-position value")).toBeTruthy()
    const advisorSet = screen.getByRole("region", {name: "Advisor comparison set"})
    expect(within(advisorSet).getByRole("button", {name: "Auto"})
      .getAttribute("aria-pressed")).toBe("true")
    expect(within(advisorSet).getAllByText("Recommended now")).toHaveLength(3)
    expect(screen.getByText(/Explosive runner and receiver with weekly RB1 upside/))
      .toBeTruthy()
    expect(screen.getByLabelText("Player outlook provenance").textContent)
      .toContain("ESPN · 2026 season · observed 2026-08-16 12:00 UTC")
    fireEvent.click(within(advisorSet).getByRole("button", {name: "Pinned"}))
    expect(within(advisorSet).getByRole("button", {name: "Pinned"})
      .getAttribute("aria-pressed")).toBe("true")
    const decisionTable = screen.getByRole("table", {
      name: "Cross-position decision matrix",
    })
    expect(within(decisionTable).getAllByRole("row")).toHaveLength(4)
    expect(within(decisionTable).getAllByRole("rowheader")).toHaveLength(3)
    expect(within(decisionTable).getAllByText(/3\+ picks/)).toHaveLength(3)
    fireEvent.click(screen.getByText("Detailed recommendation evidence"))
    fireEvent.click(screen.getByText("Test positional scenarios"))
    const scenarios = screen.getByRole("group", {name: "Draft choice scenario"})
    expect(within(scenarios).getAllByRole("button")).toHaveLength(3)
    fireEvent.click(within(scenarios).getByRole("button", {name: /Test RB scenario/}))
    expect(screen.getByRole("heading", {name: /De'Von Achane · RB/})).toBeTruthy()
    fireEvent.click(screen.getByText("Test positional scenarios"))
    fireEvent.click(screen.getByText("Detailed recommendation evidence"))
    expect(screen.getByTestId("ranking-position-lane-RB")).toBeTruthy()
    expect(screen.getByTestId("ranking-position-lane-WR")).toBeTruthy()

    fireEvent.mouseEnter(screen.getByRole("group", {name: /Drake London, WR/}))
    expect(screen.getAllByRole("heading", {name: /Drake London/}).length).toBeGreaterThan(0)
    expect(screen.getByText("ESPN player outlook unavailable for this player."))
      .toBeTruthy()
    expect(within(advisorSet).getByText("De'Von Achane")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", {name: "QB + TE"}))
    expect(screen.getByTestId("ranking-position-lane-QB")).toBeTruthy()
    expect(screen.getByTestId("ranking-position-lane-TE")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", {name: "ADP round"}))
    const adpView = screen.getByTestId("draft-desk-adp-round-view")
    expect(within(adpView).getByText("Best by ADP round")).toBeTruthy()
    expect(within(adpView).getByText("YOUR TARGETS")).toBeTruthy()
    fireEvent.click(within(adpView).getAllByRole("button", {name: "Remove"})[0])
    expect(within(adpView).getAllByText("2 players").length).toBeGreaterThan(0)
    fireEvent.click(within(adpView).getByRole("button", {name: "View"}))
    expect(screen.getByRole("button", {name: /Back to ADP rounds/})).toBeTruthy()
    expect(screen.getByTestId("draft-desk-target-chart")).toBeTruthy()
    expect(screen.getByText("Targets by round")).toBeTruthy()
    expect(screen.getByTestId("target-round-group-4")).toBeTruthy()
    expect(screen.getByTestId("target-round-group-5")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", {name: /Back to ADP rounds/}))
    expect(screen.getByTestId("draft-desk-adp-round-view")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", {name: "Position"}))
    fireEvent.click(screen.getByRole("button", {name: "Edit"}))
    expect(screen.getByRole("heading", {name: "Create Custom Ranking"})).toBeTruthy()
    fireEvent.click(screen.getByRole("button", {name: "Yes"}))
    expect(screen.getByTestId("custom-ranking-editor")).toBeTruthy()
    expect(screen.getByRole("button", {name: "QB"}).getAttribute("aria-pressed")).toBe("true")
    fireEvent.click(screen.getByRole("button", {name: "RB"}))
    expect(screen.getByRole("button", {name: "RB"}).getAttribute("aria-pressed")).toBe("true")

    const recent = screen.getByTestId("draft-dock-recent-picks")
    expect(within(recent).getAllByRole("group")).toHaveLength(6)
    expect(screen.getByTestId("draft-dock-roster")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", {name: "Round"}))
    expect(screen.getByTestId("draft-dock-current-round")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", {name: "League needs"}))
    expect(screen.getByTestId("draft-dock-league-needs").textContent)
      .toContain("RB2")
  })
})
