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

  it("freezes Pinned, preserves manual edits and profile focus isolation, then reconciles to Auto", async () => {
    const view = render(<Harness automaticSet={set("alpha", "bravo", "charlie")} materialEventKey="draft:empty" />)
    fireEvent.click(view.getByRole("button", {name: "Pinned"}))
    fireEvent.click(view.getByRole("button", {name: "Unpin bravo Player"}))
    fireEvent.change(view.getByLabelText("Add player"), {target: {value: "delta"}})
    fireEvent.click(view.getByRole("button", {name: "Add"}))
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
})
