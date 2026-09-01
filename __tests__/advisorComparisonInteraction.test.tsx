import React from "react"
import {fireEvent, render, waitFor, within} from "@testing-library/react"

import type {AdvisorComparisonItem} from "../behavior/advisorComparisonSet"
import {useAdvisorComparisonController} from "../behavior/hooks/useAdvisorComparisonController"
import AdvisorComparisonSurface from "../components/AdvisorComparisonSurface"
import {FantasyPosition, NFLTeam} from "../types"
import type {Player} from "../types"

const player = (id: string, position = FantasyPosition.RUNNING_BACK): Player => ({
  id, firstName: id, lastName: "Player", fullName: `${id} Player`,
  team: NFLTeam.BUF, position, ranks: {},
})
const players = [
  player("alpha"), player("bravo", FantasyPosition.WIDE_RECEIVER),
  player("charlie", FantasyPosition.TIGHT_END), player("delta", FantasyPosition.QUARTERBACK),
]
const set = (...ids: string[]): AdvisorComparisonItem[] => ids.map(id => ({
  player: players.find(item => item.id === id)!,
  reasonCode: "recommended_now",
  reasonLabel: "Recommended now",
}))

const Harness = ({
  automaticSet,
  materialEventKey,
  profileFocus = "alpha",
}: {
  automaticSet: AdvisorComparisonItem[]
  materialEventKey: string
  profileFocus?: string
}) => {
  const controller = useAdvisorComparisonController({automaticSet, materialEventKey})
  return <>
    <p data-testid="profile-focus">{profileFocus}</p>
    <button onClick={() => controller.setPinnedPlayers?.([
      players[3], players[1], players[0], players[2],
    ])} type="button">Apply player queue</button>
    <button onClick={() => controller.setPinnedPlayers?.([])} type="button">Clear player queue</button>
    <AdvisorComparisonSurface availablePlayers={players} controller={controller} />
  </>
}

describe("Phase 14B Auto and Pinned interaction", () => {
  it("starts useful and keeps an equivalent rerender silent", () => {
    const view = render(<Harness automaticSet={set("alpha", "bravo", "charlie")} materialEventKey="draft:empty" />)
    const region = view.getByRole("region", {name: "Advisor comparison set"})
    expect(within(region).getByText("alpha Player")).toBeTruthy()
    expect(view.getByRole("button", {name: "Auto"}).getAttribute("aria-pressed"))
      .toBe("true")
    view.rerender(<Harness automaticSet={set("alpha", "bravo", "charlie")} materialEventKey="draft:empty" profileFocus="bravo" />)
    expect(view.getByTestId("advisor-comparison-live-region").textContent).toBe("")
  })

  it("updates on one material event and announces the changed set once", async () => {
    const view = render(<Harness automaticSet={set("alpha", "bravo", "charlie")} materialEventKey="draft:empty" />)
    view.rerender(<Harness automaticSet={set("bravo", "charlie", "delta")} materialEventKey="draft:1:alpha" />)
    await waitFor(() => expect(view.getByTestId("advisor-comparison-live-region").textContent)
      .toContain("after a draft pick"))
    expect(view.getByTestId("advisor-comparison-live-region").textContent)
      .toContain("Update 1")
    view.rerender(<Harness automaticSet={set("bravo", "charlie", "delta")} materialEventKey="draft:1:alpha" />)
    expect(view.getByTestId("advisor-comparison-live-region").textContent)
      .toContain("Update 1")
  })

  it("holds the committed Auto set through non-material evidence churn", async () => {
    const view = render(<Harness automaticSet={set("alpha", "bravo", "charlie")} materialEventKey="draft:empty" />)

    view.rerender(<Harness automaticSet={set("bravo", "charlie", "delta")} materialEventKey="draft:empty" />)
    let list = view.getByRole("list")
    expect(within(list).getByText("alpha Player")).toBeTruthy()
    expect(within(list).queryByText("delta Player")).toBeNull()
    expect(view.getByTestId("advisor-comparison-live-region").textContent).toBe("")

    view.rerender(<Harness automaticSet={set("bravo", "charlie", "delta")} materialEventKey="draft:1:alpha" />)
    await waitFor(() => expect(view.getByTestId("advisor-comparison-live-region").textContent)
      .toContain("after a draft pick"))
    list = view.getByRole("list")
    expect(within(list).queryByText("alpha Player")).toBeNull()
    expect(within(list).getByText("delta Player")).toBeTruthy()
  })

  it("silently bootstraps an empty Auto set once at the same material boundary", async () => {
    const view = render(<Harness automaticSet={[]} materialEventKey="draft:empty" />)
    expect(view.getByText("No valid available comparison players.")).toBeTruthy()

    view.rerender(<Harness
      automaticSet={set("alpha", "bravo", "charlie")}
      materialEventKey="draft:empty"
    />)
    await waitFor(() => expect(view.getByText("alpha Player")).toBeTruthy())
    expect(view.getByTestId("advisor-comparison-live-region").textContent).toBe("")

    view.rerender(<Harness
      automaticSet={set("bravo", "charlie", "delta")}
      materialEventKey="draft:empty"
    />)
    const list = view.getByRole("list")
    expect(within(list).getByText("alpha Player")).toBeTruthy()
    expect(within(list).queryByText("delta Player")).toBeNull()
    expect(view.getByTestId("advisor-comparison-live-region").textContent).toBe("")
  })

  it("reconciles same-identity Auto evidence at a material boundary without announcing it", async () => {
    const view = render(<Harness automaticSet={set("alpha", "bravo", "charlie")} materialEventKey="draft:empty" />)
    const refreshed = set("alpha", "bravo", "charlie").map((item, index) => (
      index === 0 ? {...item, reasonLabel: "Updated material rationale"} : item
    ))

    view.rerender(<Harness automaticSet={refreshed} materialEventKey="draft:1:alpha" />)
    await waitFor(() => expect(view.getByText("Updated material rationale")).toBeTruthy())
    expect(view.getByTestId("advisor-comparison-live-region").textContent).toBe("")
  })

  it("keeps pins through material events and restores the latest committed Auto set once", async () => {
    const view = render(<Harness automaticSet={set("alpha", "bravo", "charlie")} materialEventKey="draft:empty" />)
    fireEvent.click(view.getByRole("button", {name: "Pinned"}))

    view.rerender(<Harness automaticSet={set("bravo", "charlie", "delta")} materialEventKey="draft:1:alpha" />)
    let list = view.getByRole("list")
    expect(within(list).getByText("alpha Player")).toBeTruthy()
    expect(within(list).queryByText("delta Player")).toBeNull()
    expect(view.getByTestId("advisor-comparison-live-region").textContent).toBe("")

    fireEvent.click(view.getByRole("button", {name: "Auto"}))
    await waitFor(() => expect(view.getByText("delta Player")).toBeTruthy())
    list = view.getByRole("list")
    expect(within(list).queryByText("alpha Player")).toBeNull()
    expect(view.getByTestId("advisor-comparison-live-region").textContent)
      .toContain("Automatic comparison restored")
  })

  it("freezes Pinned, preserves manual edits and profile focus isolation, then reconciles to Auto", async () => {
    const view = render(<Harness automaticSet={set("alpha", "bravo", "charlie")} materialEventKey="draft:empty" />)
    fireEvent.click(view.getByRole("button", {name: "Pinned"}))
    fireEvent.click(view.getByRole("button", {name: "Unpin bravo Player"}))
    expect(view.getByTestId("advisor-comparison-live-region").textContent)
      .toContain("Pinned comparison updated: alpha Player, charlie Player. Update 1.")
    fireEvent.change(view.getByLabelText("Add player"), {target: {value: "delta"}})
    fireEvent.click(view.getByRole("button", {name: "Add"}))
    expect(view.getByTestId("advisor-comparison-live-region").textContent)
      .toContain("Pinned comparison updated: alpha Player, charlie Player, delta Player. Update 2.")
    let list = view.getByRole("list")
    expect(within(list).queryByText("bravo Player")).toBeNull()
    expect(within(list).getByText("delta Player")).toBeTruthy()

    view.rerender(<Harness automaticSet={set("bravo", "charlie")} materialEventKey="draft:1:alpha" profileFocus="charlie" />)
    expect(view.getByTestId("profile-focus").textContent).toBe("charlie")
    list = view.getByRole("list")
    expect(within(list).getByText("alpha Player")).toBeTruthy()
    expect(within(list).getByText("delta Player")).toBeTruthy()
    expect(within(list).queryByText("bravo Player")).toBeNull()

    fireEvent.click(view.getByRole("button", {name: "Auto"}))
    await waitFor(() => expect(view.getByText("bravo Player")).toBeTruthy())
    list = view.getByRole("list")
    expect(within(list).queryByText("alpha Player")).toBeNull()
    expect(within(list).queryByText("delta Player")).toBeNull()
    expect(view.getByTestId("advisor-comparison-live-region").textContent)
      .toContain("Automatic comparison restored")
  })

  it("uses an ordered three-player queue and restores Auto when it empties", async () => {
    const view = render(<Harness automaticSet={set("alpha", "bravo", "charlie")} materialEventKey="draft:empty" />)
    fireEvent.click(view.getByRole("button", {name: "Apply player queue"}))
    let list = view.getByRole("list")
    expect(within(list).getAllByRole("listitem").map(item => item.textContent)).toEqual([
      expect.stringContaining("delta Player"),
      expect.stringContaining("bravo Player"),
      expect.stringContaining("alpha Player"),
    ])
    expect(view.getByRole("button", {name: "Pinned"}).getAttribute("aria-pressed")).toBe("true")

    fireEvent.click(view.getByRole("button", {name: "Clear player queue"}))
    await waitFor(() => expect(view.getByText("charlie Player")).toBeTruthy())
    list = view.getByRole("list")
    expect(within(list).queryByText("delta Player")).toBeNull()
    expect(view.getByRole("button", {name: "Auto"}).getAttribute("aria-pressed")).toBe("true")
  })
})
