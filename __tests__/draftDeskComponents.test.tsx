import React from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

import DraftDeskAppBar from "../components/DraftDeskAppBar"
import DraftDock from "../components/DraftDock"
import {
  FantasyPosition,
  NFLTeam,
  ThirdPartyADPRanker,
  ThirdPartyRanker,
} from "../types"
import type { FantasySettings, Player } from "../types"
import type { Roster } from "../behavior/draft"

const settings: FantasySettings = {
  ppr: true,
  numTeams: 3,
  numStartingQbs: 1,
  numStartingRbs: 2,
  numStartingWrs: 2,
  numStartingTes: 1,
  numFlex: 1,
  numBenchPlayers: 5,
}

const player = (id: string, position: FantasyPosition): Player => ({
  id,
  firstName: id,
  lastName: "Player",
  fullName: `${id} Player`,
  position,
  team: NFLTeam.BUF,
  ranks: {},
})

const roster = (values: Partial<Roster>): Roster => ({
  picks: [], QB: [], RB: [], WR: [], TE: [], ...values,
})

describe("Phase 14A desk components", () => {
  it("uses an accessible settings drawer and retains draft locks", async () => {
    const view = render(
      <DraftDeskAppBar
        activeDraftListenerTitle={null}
        boardSettings={{ranker: ThirdPartyRanker.HARRIS, adpRanker: ThirdPartyADPRanker.ESPN}}
        draftCaptureState="disconnected"
        draftPersistence={{state: "local", pendingEventCount: 0, error: null, canRetry: false}}
        draftSourceHealth={null}
        draftSourceHealthFreshness="unknown"
        draftStarted={true}
        myPickNum={2}
        onRetryDraftPersistence={jest.fn()}
        onSetAdpRanker={jest.fn()}
        onSetRanker={jest.fn()}
        setIsPpr={jest.fn()}
        setMyPickNum={jest.fn()}
        setNumTeams={jest.fn()}
        settings={settings}
      />,
    )
    const opener = screen.getByRole("button", {name: "Settings"})
    opener.focus()
    fireEvent.click(opener)

    const dialog = screen.getByRole("dialog", {name: "Draft setup"})
    await waitFor(() => expect(document.activeElement).toBe(
      screen.getByRole("button", {name: "Close settings"}),
    ))
    expect(screen.getByLabelText("League size").hasAttribute("disabled")).toBe(true)
    expect(screen.getByLabelText("Your draft slot").hasAttribute("disabled")).toBe(true)
    expect(screen.getByLabelText("Scoring").hasAttribute("disabled")).toBe(true)
    expect(screen.getByLabelText("Ranking source").hasAttribute("disabled")).toBe(true)
    expect(screen.getByLabelText("ADP source").hasAttribute("disabled")).toBe(true)

    fireEvent.keyDown(dialog, {key: "Escape"})
    expect(view.queryByRole("dialog", {name: "Draft setup"})).toBeNull()
    expect(document.activeElement).toBe(opener)
  })

  it("keeps pick and next-pick tape visible across every dock mode", () => {
    const playerLib = {
      "qb-mine": player("qb-mine", FantasyPosition.QUARTERBACK),
      "rb-mine-1": player("rb-mine-1", FantasyPosition.RUNNING_BACK),
      "rb-mine-2": player("rb-mine-2", FantasyPosition.RUNNING_BACK),
      "rb-mine-3": player("rb-mine-3", FantasyPosition.RUNNING_BACK),
      "wr-mine-1": player("wr-mine-1", FantasyPosition.WIDE_RECEIVER),
      "wr-mine-2": player("wr-mine-2", FantasyPosition.WIDE_RECEIVER),
      "te-mine": player("te-mine", FantasyPosition.TIGHT_END),
    }
    render(
      <DraftDock
        currPick={4}
        currRound={["qb-mine", null, null]}
        currRoundPick={1}
        isEvenRound={false}
        myPickNum={2}
        myPicks={[2, 5, 8]}
        onRemovePick={jest.fn()}
        playerLib={playerLib}
        rosters={[
          roster({}),
          roster({
            QB: ["qb-mine"], RB: ["rb-mine-1", "rb-mine-2", "rb-mine-3"],
            WR: ["wr-mine-1", "wr-mine-2"], TE: ["te-mine"],
          }),
          roster({}),
        ]}
        roundIdx={1}
        setCurrPick={jest.fn()}
        setViewPlayerId={jest.fn()}
        settings={settings}
      />,
    )

    const tape = screen.getByTestId("draft-dock-tape")
    expect(tape.textContent).toContain("#4")
    expect(tape.textContent).toContain("#5 · 1 away")
    expect(screen.getByTestId("draft-dock-current-round")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", {name: "My roster"}))
    expect(screen.getByTestId("draft-dock-roster").textContent).toContain("Observed roster slots")
    expect(screen.getByTestId("draft-dock-roster").textContent).toContain("FLEX")
    expect(tape.textContent).toContain("#5 · 1 away")

    fireEvent.click(screen.getByRole("button", {name: "League needs"}))
    expect(screen.getByTestId("draft-dock-league-needs").textContent).toContain("Other teams")
    expect(screen.getByTestId("draft-dock-league-needs").textContent).toContain("FLEX")
    expect(tape.textContent).toContain("#5 · 1 away")
  })
})
