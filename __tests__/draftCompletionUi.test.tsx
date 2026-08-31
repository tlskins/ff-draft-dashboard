import React from "react"
import {fireEvent, render, screen} from "@testing-library/react"

import fixture from "./fixtures/completed-draft-replay.json"
import {
  materializeCompletedDraftReplay,
  type RecordedCompletedDraftReplay,
} from "../behavior/draft-advisor/completedDraftReplay"
import DraftDeskAppBar from "../components/DraftDeskAppBar"
import DraftDock from "../components/DraftDock"


const recorded = fixture as unknown as RecordedCompletedDraftReplay
const materialized = materializeCompletedDraftReplay(recorded)

describe("completed draft workspace presentation", () => {
  it("lets completion take precedence over a still-live extension heartbeat", () => {
    render(
      <DraftDeskAppBar
        activeDraftListenerTitle="Completed ESPN mock"
        boardSettings={materialized.boardSettings}
        draftCaptureState="live"
        draftComplete
        draftPersistence={{
          state: "local",
          pendingEventCount: 0,
          error: null,
          canRetry: false,
        }}
        draftSourceHealth={null}
        draftSourceHealthFreshness="unknown"
        draftStarted
        myPickNum={1}
        onRetryDraftPersistence={jest.fn()}
        onSetAdpRanker={jest.fn()}
        onSetRanker={jest.fn()}
        setIsPpr={jest.fn()}
        setMyPickNum={jest.fn()}
        setNumTeams={jest.fn()}
        settings={materialized.settings}
      />,
    )

    expect(screen.getByText("Draft complete")).toBeTruthy()
    expect(screen.queryByText("Draft live")).toBeNull()
    fireEvent.click(screen.getByRole("button", {name: "Settings"}))
    expect(screen.getByText("Draft complete — final board captured."))
      .toBeTruthy()
    expect(screen.queryByText("Listening to: Completed ESPN mock")).toBeNull()
  })

  it("replaces the stale on-clock state with final-board evidence", () => {
    render(
      <DraftDock
        activity={[]}
        boardSettings={materialized.boardSettings}
        connected
        currPick={191}
        currRound={Array(12).fill(null)}
        currRoundPick={11}
        draftComplete
        draftHistory={[]}
        isEvenRound={false}
        myPickNum={8}
        myPicks={[]}
        onIgnoreDraft={jest.fn()}
        onRemovePick={jest.fn()}
        playerLib={materialized.playerLib}
        rosters={[]}
        roundIdx={15}
        setCurrPick={jest.fn()}
        setViewPlayerId={jest.fn()}
        settings={materialized.settings}
        totalPicks={192}
      />,
    )

    expect(screen.getByText("Draft complete")).toBeTruthy()
    expect(screen.getByText("192 picks captured")).toBeTruthy()
    expect(screen.getByText("No remaining picks")).toBeTruthy()
    expect(screen.queryByText(/On the clock/)).toBeNull()
  })
})
