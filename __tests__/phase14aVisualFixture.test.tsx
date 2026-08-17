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
