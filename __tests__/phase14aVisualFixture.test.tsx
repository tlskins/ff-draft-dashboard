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
    expect(screen.getByTestId("ranking-position-lane-RB")).toBeTruthy()
    expect(screen.getByTestId("ranking-position-lane-WR")).toBeTruthy()

    fireEvent.mouseEnter(screen.getByRole("group", {name: /Drake London, WR/}))
    expect(screen.getAllByRole("heading", {name: /Drake London/}).length).toBeGreaterThan(0)

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
