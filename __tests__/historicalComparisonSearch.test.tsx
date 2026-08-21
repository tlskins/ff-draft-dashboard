import React from "react"
import {fireEvent, render, screen} from "@testing-library/react"

import HistoricalComparison from "../components/HistoricalComparison"
import {
  FantasyPosition,
  NFLTeam,
  type FantasySettings,
  type Player,
} from "../types"

const settings: FantasySettings = {
  ppr: true,
  numTeams: 12,
  numStartingQbs: 1,
  numStartingRbs: 2,
  numStartingWrs: 2,
  numStartingTes: 1,
  numFlex: 1,
  numBenchPlayers: 6,
}

const player = (id: string, name: string): Player => ({
  id,
  firstName: name.split(" ")[0],
  lastName: name.split(" ").slice(1).join(" "),
  fullName: name,
  position: FantasyPosition.RUNNING_BACK,
  team: NFLTeam.BUF,
  ranks: {},
})

describe("HistoricalComparison searchable selectors", () => {
  const previousEnabled = process.env.NEXT_PUBLIC_HISTORICAL_COMPARISON_ENABLED

  beforeEach(() => {
    process.env.NEXT_PUBLIC_HISTORICAL_COMPARISON_ENABLED = "true"
  })

  afterAll(() => {
    process.env.NEXT_PUBLIC_HISTORICAL_COMPARISON_ENABLED = previousEnabled
  })

  it("uses text search inputs and accepts a player name", () => {
    const players = [
      player("one", "Alpha Runner"),
      player("two", "Beta Runner"),
      player("three", "Gamma Runner"),
    ]
    render(<HistoricalComparison player={players[0]} players={players} settings={settings} />)

    const primary = screen.getByRole("combobox", {name: "Primary comparison player"})
    const comparison = screen.getByRole("combobox", {name: "Comparison player"})
    expect(primary.tagName).toBe("INPUT")
    expect(comparison.getAttribute("type")).toBe("search")
    expect(primary.getAttribute("list")).toBeTruthy()
    expect(comparison.getAttribute("list")).toBeTruthy()

    fireEvent.change(comparison, {target: {value: "Gamma Runner"}})
    expect((comparison as HTMLInputElement).value).toBe("Gamma Runner (RB · BUF)")
  })
})
