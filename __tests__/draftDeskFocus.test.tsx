import React from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

import AnalysisWorkspace from "../components/analysis/AnalysisWorkspace"
import DraftDeskProfilePane from "../components/DraftDeskProfilePane"
import { useDataReadiness } from "../behavior/api/dataReadiness"
import {
  completedDataReadinessState,
} from "../test-support/dataReadiness"
import {
  FantasyPosition,
  NFLTeam,
  ThirdPartyADPRanker,
  ThirdPartyRanker,
} from "../types"
import type { FantasySettings, Player } from "../types"

jest.mock("../behavior/api/dataReadiness", () => ({
  ...jest.requireActual("../behavior/api/dataReadiness"),
  useDataReadiness: jest.fn(),
}))

const mockedReadiness = jest.mocked(useDataReadiness)

const settings: FantasySettings = {
  ppr: true,
  numTeams: 12,
  numStartingQbs: 1,
  numStartingRbs: 2,
  numStartingWrs: 2,
  numStartingTes: 1,
  numFlex: 1,
  numBenchPlayers: 5,
}

const players: Player[] = ["One", "Two", "Three"].map((lastName, index) => ({
  id: `rb-${index + 1}`,
  firstName: "Runner",
  lastName,
  fullName: `Runner ${lastName}`,
  position: FantasyPosition.RUNNING_BACK,
  team: NFLTeam.BUF,
  ranks: {},
}))

describe("Phase 14A profile focus boundary", () => {
  beforeEach(() => {
    localStorage.clear()
    mockedReadiness.mockReturnValue(completedDataReadinessState)
  })

  it("updates the profile focus without changing the manual comparison selection", async () => {
    const view = render(
      <>
        <DraftDeskProfilePane
          boardSettings={{ranker: ThirdPartyRanker.HARRIS, adpRanker: ThirdPartyADPRanker.ESPN}}
          player={players[0]}
          players={players}
          playerStatus={{}}
          rankingSummaries={[]}
          settings={settings}
        />
        <AnalysisWorkspace
          activePlayer={null}
          availablePlayers={players}
          boardSettings={{ranker: ThirdPartyRanker.HARRIS, adpRanker: ThirdPartyADPRanker.ESPN}}
          followActivePlayer={false}
          players={players}
          rankingSummaries={[]}
          settings={settings}
        />
      </>,
    )
    fireEvent.click(screen.getByRole("button", {name: "Player lab"}))
    const primary = await screen.findByLabelText("Analysis primary player")
    fireEvent.change(primary, {target: {value: "rb-3"}})
    await waitFor(() => expect((primary as HTMLSelectElement).value).toBe("rb-3"))

    view.rerender(
      <>
        <DraftDeskProfilePane
          boardSettings={{ranker: ThirdPartyRanker.HARRIS, adpRanker: ThirdPartyADPRanker.ESPN}}
          player={players[1]}
          players={players}
          playerStatus={{}}
          rankingSummaries={[]}
          settings={settings}
        />
        <AnalysisWorkspace
          activePlayer={null}
          availablePlayers={players}
          boardSettings={{ranker: ThirdPartyRanker.HARRIS, adpRanker: ThirdPartyADPRanker.ESPN}}
          followActivePlayer={false}
          players={players}
          rankingSummaries={[]}
          settings={settings}
        />
      </>,
    )

    expect(screen.getAllByRole("heading", {name: "Runner Two"}).length).toBeGreaterThan(0)
    expect((screen.getByLabelText("Analysis primary player") as HTMLSelectElement).value)
      .toBe("rb-3")
  })
})
