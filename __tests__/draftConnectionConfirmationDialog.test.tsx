import {fireEvent, render, screen} from "@testing-library/react"

import {DraftConnectionConfirmationDialog} from "../components/DraftConnectionConfirmationDialog"
import type {DraftSnapshot} from "../behavior/draft-feed/types"
import type {FantasySettings} from "../types"


const settings: FantasySettings = {
  ppr: false,
  scoringFormat: "standard",
  numTeams: 12,
  numStartingQbs: 1,
  numStartingRbs: 2,
  numStartingWrs: 2,
  numStartingTes: 1,
  numFlex: 1,
  numBenchPlayers: 5,
}

const draft: DraftSnapshot = {
  id: "ESPN:league-1",
  title: "10-Team PPR Draft",
  platform: "ESPN",
  picks: [],
  capturedAt: 1,
  sourceUrl: "https://fantasy.espn.com/football/draft?teamId=1",
  numTeams: 10,
  targetRosterIndex: null,
  scoringFormat: "PPR",
  rosterSettings: {
    numStartingQbs: 1,
    numStartingRbs: 2,
    numStartingWrs: 3,
    numStartingTes: 1,
    numFlex: 2,
    numBenchPlayers: 6,
    unsupportedLineupSlots: [],
    source: "espn_league_settings",
  },
}

describe("Draft connection confirmation", () => {
  it("uses the configured slot instead of ESPN teamId and submits reviewed format", () => {
    const onConfirm = jest.fn()
    render(
      <DraftConnectionConfirmationDialog
        currentDraftSlot={7}
        currentSettings={settings}
        draft={draft}
        onConfirm={onConfirm}
        onIgnore={jest.fn()}
      />,
    )

    expect(screen.getByRole("dialog", {name: "Confirm your draft setup"}))
      .toBeTruthy()
    expect((screen.getByLabelText("Your draft position") as HTMLSelectElement).value).toBe("7")
    expect((screen.getByLabelText("League size") as HTMLSelectElement).value).toBe("10")
    expect((screen.getByLabelText("Scoring") as HTMLSelectElement).value).toBe("ppr")
    expect((screen.getByLabelText("WR") as HTMLInputElement).value).toBe("3")
    expect((screen.getByLabelText("Flex") as HTMLInputElement).value).toBe("2")

    fireEvent.change(screen.getByLabelText("Your draft position"), {
      target: {value: "9"},
    })
    fireEvent.change(screen.getByLabelText("Scoring"), {
      target: {value: "half_ppr"},
    })
    fireEvent.click(screen.getByRole("button", {name: "Confirm and connect"}))

    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({
      numTeams: 10,
      targetRosterIndex: 8,
      scoringFormat: "HALF_PPR",
      rosterSettings: expect.objectContaining({
        numStartingWrs: 3,
        numFlex: 2,
        source: "user_confirmed",
      }),
    }))
  })

  it("clamps the selected draft slot when league size shrinks", () => {
    render(
      <DraftConnectionConfirmationDialog
        currentDraftSlot={10}
        currentSettings={settings}
        draft={draft}
        onConfirm={jest.fn()}
        onIgnore={jest.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText("League size"), {
      target: {value: "8"},
    })
    expect((screen.getByLabelText("Your draft position") as HTMLSelectElement).value).toBe("8")
  })
})
