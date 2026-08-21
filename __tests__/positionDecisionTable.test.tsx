import React from "react"
import {render, screen} from "@testing-library/react"

import PositionDecisionTable from "../components/insight/PositionDecisionTable"


const positions = ["QB", "RB", "WR", "TE"] as const
const candidate = (position: typeof positions[number], median: number, survival: number) => ({
  player: {
    id: position.toLowerCase(),
    fullName: `${position} Leader`,
    team: "BUF",
    position,
  },
  positionRank: 1,
  score: median,
  evidence: {
    projectedFloor: median - 3,
    projectedMedian: median,
    projectedCeiling: median + 3,
    survivalProbability: survival,
    userTier: 1,
    projectionTier: 1,
  },
})

describe("PositionDecisionTable", () => {
  it("shows one leader per position and chooses the best survival-weighted next target", () => {
    const positionCandidates = [
      candidate("QB", 20, .2),
      candidate("RB", 18, .9),
      candidate("WR", 17, .8),
      candidate("TE", 16, .7),
    ]
    render(<PositionDecisionTable
      onInspectPlayer={jest.fn()}
      recommendations={{positionCandidates} as never}
    />)

    expect(screen.getAllByRole("row")).toHaveLength(5)
    positions.forEach(position => expect(
      screen.getByRole("rowheader", {name: position}),
    ).toBeTruthy())
    const qbRow = screen.getByRole("rowheader", {name: "QB"}).closest("tr")!
    expect(qbRow.textContent).toContain("RB Leader")
    expect(qbRow.textContent).toContain("90% chance available")
  })
})
