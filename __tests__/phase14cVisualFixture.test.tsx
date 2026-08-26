import React from "react"
import {fireEvent, render, screen, waitFor, within} from "@testing-library/react"

import Phase14CVisualFixture, {
  phase14cVisualFixtureRouteResult,
} from "../pages/phase14c-visual-fixture"

const selectedSlotTitles = (): string[] => Array.from(
  document.querySelectorAll<HTMLSelectElement>("select[id^='insight-deck-'][id$='-view']"),
).map(element => element.selectedOptions[0]?.textContent || "")

describe("Phase 14C visual acceptance fixture", () => {
  it("is development-only", () => {
    expect(phase14cVisualFixtureRouteResult("production"))
      .toEqual({notFound: true})
    expect(phase14cVisualFixtureRouteResult("development"))
      .toEqual({props: {}})
  })

  it("renders the real two-view deck at the deterministic desktop pane width", async () => {
    render(<Phase14CVisualFixture />)

    await waitFor(() => expect(screen.getByRole("region", {name: "Draft insight deck"})).toBeTruthy())
    expect(screen.getByTestId("phase14c-viewport-1440")).toBeTruthy()
    const paneStyle = screen.getByTestId("phase14c-right-pane-500").getAttribute("style")
    expect(paneStyle).toContain("width: 500px")
    expect(paneStyle).toContain("height: 720px")
    expect(paneStyle).toContain("overflow: hidden")
    expect(document.querySelectorAll("[aria-live]")).toHaveLength(1)
    expect(selectedSlotTitles()).toEqual([
      "Current tier market",
      "Rank & tier disagreement",
    ])
    expect(new Set(selectedSlotTitles()).size).toBe(selectedSlotTitles().length)
  })

  it("provides deterministic material, evidence, Player Lab, and per-slot pin controls", async () => {
    render(<Phase14CVisualFixture />)
    const controls = screen.getByRole("region", {name: "Phase 14C fixture controls"})

    fireEvent.click(within(controls).getByTestId("phase14c-scenario-matrix"))
    await waitFor(() => expect(selectedSlotTitles()).toEqual([
      "Current tier market",
      "Two-round run matrix",
    ]))
    expect(screen.getByText("What can run before the next two turns?")).toBeTruthy()

    ;(["Decision view", "Supporting view"] as const).forEach(label => {
      const mode = screen.getByRole("group", {name: `${label} mode`})
      fireEvent.click(within(mode).getByRole("button", {name: "Pin"}))
      expect(within(mode).getByRole("button", {name: "Pin"}).getAttribute("aria-pressed"))
        .toBe("true")
      fireEvent.click(within(mode).getByRole("button", {name: "Auto"}))
      expect(within(mode).getByRole("button", {name: "Auto"}).getAttribute("aria-pressed"))
        .toBe("true")
    })

    fireEvent.change(screen.getByRole("combobox", {name: "Decision view view"}), {
      target: {value: "player_lab"},
    })
    await waitFor(() => expect(selectedSlotTitles()[0]).toBe("Player Lab"))
    expect(screen.getByRole("region", {name: "Automatic Player Lab"})).toBeTruthy()

    for (const state of ["loading", "stale", "unavailable"] as const) {
      fireEvent.click(within(controls).getByTestId(`phase14c-preview-${state}`))
      await waitFor(() => expect(screen.getByText(`Evidence: ${state.charAt(0).toUpperCase()}${state.slice(1)}`)).toBeTruthy())
      expect(screen.getByTestId("phase14c-evidence-preview").textContent).toContain(state)
      expect(document.querySelectorAll("[aria-live]")).toHaveLength(1)
      expect(new Set(selectedSlotTitles()).size).toBe(selectedSlotTitles().length)
    }
  })

  it("makes fail-closed evidence visibly unavailable without registering duplicate views", async () => {
    render(<Phase14CVisualFixture />)
    fireEvent.click(screen.getByTestId("phase14c-scenario-unavailable"))

    await waitFor(() => expect(screen.getAllByText("Evidence: Unavailable").length).toBeGreaterThan(0))
    expect(screen.getAllByText(/required supplied .* evidence is absent|no valid supplied/i).length)
      .toBeGreaterThan(0)
    expect(new Set(selectedSlotTitles()).size).toBe(selectedSlotTitles().length)
  })
})
