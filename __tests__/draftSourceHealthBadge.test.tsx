import { render, screen } from "@testing-library/react"
import DraftSourceHealthBadge from "../components/DraftSourceHealthBadge"
import type {
  DraftSourceHealth,
} from "../behavior/draft-feed/types"


const health = (
  status: DraftSourceHealth["status"],
): DraftSourceHealth => ({
  selectorVersion: 1,
  platform: "ESPN",
  status,
  mode: status === "unavailable" ? "unavailable" : "live-history",
  checkedAt: 100,
  pickCount: 0,
  checks: [],
  issues: status === "healthy" ? [] : ["pick-source-unhealthy"],
})

describe("DraftSourceHealthBadge", () => {
  it("stays quiet while selectors are healthy", () => {
    render(<DraftSourceHealthBadge health={health("healthy")} />)
    expect(screen.queryByRole("status")).toBeNull()
  })

  it("surfaces degraded capture as a polite status", () => {
    render(<DraftSourceHealthBadge health={health("degraded")} />)
    const status = screen.getByRole("status")
    expect(status.textContent).toContain("ESPN capture degraded")
    expect(status.getAttribute("title")).toBe(
      "pick-source-unhealthy",
    )
  })

  it("distinguishes an unavailable layout", () => {
    render(<DraftSourceHealthBadge health={health("unavailable")} />)
    expect(screen.getByRole("status").textContent).toContain(
      "ESPN capture unavailable",
    )
  })
})
