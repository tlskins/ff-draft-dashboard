import {fireEvent, render, screen} from "@testing-library/react"
import fixture from "./fixtures/completed-draft-replay.json"

import {MockDraftReviewPanel} from "../components/MockDraftReviewPanel"
import {createCompletedMockArchive} from "../behavior/mockDraft/archive"
import type {RecordedCompletedDraftReplay} from "../behavior/draft-advisor/completedDraftReplay"


const archive = createCompletedMockArchive({
  fixture: fixture as unknown as RecordedCompletedDraftReplay,
  season: 2026,
  rankingSource: "Harris",
  adpSource: "ESPN",
  targets: [],
  completedAt: "2026-08-30T18:00:00Z",
})

describe("completed mock review panel", () => {
  beforeEach(() => localStorage.clear())

  it("opens a dense scorecard and recalculates a position path", () => {
    render(<MockDraftReviewPanel currentArchive={archive} season={2026} user={null} />)
    fireEvent.click(screen.getByRole("button", {name: /Mock review/}))
    expect(screen.getByRole("dialog", {name: "Season 2026 mock draft review"})).toBeTruthy()
    expect(screen.getByText("Tier capital")).toBeTruthy()
    expect(screen.getByText("Starter quality")).toBeTruthy()
    expect(screen.getByText("Best alternate")).toBeTruthy()
    const selectors = screen.getAllByLabelText(/Pick \d position/)
    fireEvent.change(selectors[0], {target: {value: "RB"}})
    fireEvent.change(selectors[1], {target: {value: "WR"}})
    expect(screen.getByText(/opponent collision replacements/)).toBeTruthy()
  })

  it("closes from the dialog control", () => {
    render(<MockDraftReviewPanel currentArchive={archive} season={2026} user={null} />)
    fireEvent.click(screen.getByRole("button", {name: /Mock review/}))
    fireEvent.click(screen.getByRole("button", {name: "Close"}))
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("surfaces a completed-scorecard build failure instead of an empty history", () => {
    render(
      <MockDraftReviewPanel
        currentArchive={null}
        currentArchiveError="Opponent projection is unavailable"
        season={2026}
        user={null}
      />,
    )
    fireEvent.click(screen.getByRole("button", {name: /Mock review/}))

    expect(screen.getByRole("status").textContent).toContain(
      "Scorecard could not be created: Opponent projection is unavailable",
    )
    expect(screen.queryByText("Complete a mock to create the first scorecard."))
      .toBeNull()
  })
})
