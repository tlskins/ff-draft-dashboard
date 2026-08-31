import {fireEvent, render, screen, waitFor} from "@testing-library/react"
import fixture from "./fixtures/completed-draft-replay.json"

import {MockDraftReviewPanel} from "../components/MockDraftReviewPanel"
import {createCompletedMockArchive} from "../behavior/mockDraft/archive"
import {readLocalCompletedMocks} from "../behavior/mockDraft/archive"
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
    expect(screen.getAllByText("Tier capital").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Starter quality").length).toBeGreaterThan(0)
    expect(screen.getByText(/Best alternate/)).toBeTruthy()
    const selectors = screen.getAllByLabelText(/Pick \d position/)
    fireEvent.change(selectors[0], {target: {value: "RB"}})
    fireEvent.change(selectors[1], {target: {value: "WR"}})
    expect(screen.getByText(/replay fidelity/i)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", {name: "Position capital"}))
    expect(screen.getByText("Raw position capital")).toBeTruthy()
    expect(screen.getByText(/PAR means projected median points above/)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", {name: "Pick decisions"}))
    expect(screen.getByText("Actual versus best-alternate decisions")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", {name: "Alternate paths"}))
    expect(screen.getByText("Path 1")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", {name: "Method"}))
    expect(screen.getByText("Deterministic replay method")).toBeTruthy()
  })

  it("offers a durable review reminder without interrupting the completed draft", async () => {
    const view = render(
      <MockDraftReviewPanel
        currentArchive={null}
        season={2026}
        showTrigger={false}
        showUnreviewedBanner
        user={null}
      />,
    )
    expect(screen.queryByRole("dialog")).toBeNull()

    view.rerender(
      <MockDraftReviewPanel
        archiveSyncState="synced"
        currentArchive={archive}
        season={2026}
        showTrigger={false}
        showUnreviewedBanner
        user={null}
      />,
    )

    expect(screen.queryByRole("dialog")).toBeNull()
    expect(screen.getByRole("complementary", {name: "Unreviewed mock draft results"}))
      .toBeTruthy()
    fireEvent.click(screen.getByRole("button", {name: "Review"}))
    expect(await screen.findByRole("dialog", {name: "Season 2026 mock draft review"})).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole("complementary", {
      name: "Unreviewed mock draft results",
    })).toBeNull())
    expect(screen.getByRole("status").textContent)
      .toBe("Completed mocks saved and synced.")
  })

  it("renders an opaque, two-column review surface with supported palette utilities", () => {
    render(<MockDraftReviewPanel currentArchive={archive} season={2026} user={null} />)
    fireEvent.click(screen.getByRole("button", {name: /Mock review/}))

    const dialog = screen.getByRole("dialog", {name: "Season 2026 mock draft review"})
    expect(dialog.className).toContain("bg-gray-100")
    expect(dialog.className).toContain("text-gray-900")
    expect(dialog.className).not.toContain("slate")
    expect(dialog.parentElement?.className).toContain("bg-gray-900")
    expect(dialog.parentElement?.className).toContain("bg-opacity-75")

    const reviewLayout = screen.getByText("Mock history").closest("aside")?.parentElement
    expect(reviewLayout?.style.gridTemplateColumns).toBe("250px minmax(0, 1fr)")
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

  it("imports a validated recovered archive into local mock history", async () => {
    render(<MockDraftReviewPanel season={2026} user={null} />)
    fireEvent.click(screen.getByRole("button", {name: /Mock review/}))
    const file = new File(
      [JSON.stringify(archive)],
      "recovered-mock.json",
      {type: "application/json"},
    )
    fireEvent.change(screen.getByLabelText("Import completed mock"), {
      target: {files: [file]},
    })

    await waitFor(() => expect(screen.getByRole("status").textContent)
      .toBe("Imported locally."))
    expect(readLocalCompletedMocks(localStorage, 2026)).toEqual([archive])
    expect(screen.getByText("Actual roster")).toBeTruthy()
  })
})
