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
  it("renders the configured starting quarterback count", () => {
    render(
      <DraftDeskAppBar
        activeDraftListenerTitle="Two-quarterback league"
        boardSettings={{ranker: ThirdPartyRanker.HARRIS, adpRanker: ThirdPartyADPRanker.ESPN}}
        draftCaptureState="live"
        draftPersistence={{state: "local", pendingEventCount: 0, error: null, canRetry: false}}
        draftSourceHealth={null}
        draftSourceHealthFreshness="fresh"
        draftStarted={false}
        myPickNum={2}
        onRetryDraftPersistence={jest.fn()}
        onSetAdpRanker={jest.fn()}
        onSetRanker={jest.fn()}
        setIsPpr={jest.fn()}
        setMyPickNum={jest.fn()}
        setNumTeams={jest.fn()}
        settings={{...settings, numStartingQbs: 2}}
      />,
    )

    expect(screen.getByText("3 team · PPR · 2QB")).toBeTruthy()
  })

  it("renders and selects API-published expert boards without enum changes", () => {
    const onSetRanker = jest.fn()
    const setScoringFormat = jest.fn()
    render(
      <DraftDeskAppBar
        activeDraftListenerTitle={null}
        boardSettings={{ranker: ThirdPartyRanker.HARRIS, adpRanker: ThirdPartyADPRanker.ESPN}}
        draftCaptureState="disconnected"
        draftPersistence={{state: "local", pendingEventCount: 0, error: null, canRetry: false}}
        draftSourceHealth={null}
        draftSourceHealthFreshness="unknown"
        draftStarted={false}
        myPickNum={2}
        onRetryDraftPersistence={jest.fn()}
        onSetAdpRanker={jest.fn()}
        onSetRanker={onSetRanker}
        rankingSources={["Harris", "Matt Harmon", "Custom"]}
        setScoringFormat={setScoringFormat}
        setIsPpr={jest.fn()}
        setMyPickNum={jest.fn()}
        setNumTeams={jest.fn()}
        settings={settings}
      />,
    )
    fireEvent.click(screen.getByRole("button", {name: "Settings"}))
    const selector = screen.getByLabelText("Ranking source")

    expect(Array.from((selector as HTMLSelectElement).options).map(
      option => option.value,
    )).toEqual(["Harris", "Matt Harmon", "Custom"])
    fireEvent.change(selector, {target: {value: "Matt Harmon"}})
    expect(onSetRanker).toHaveBeenCalledWith("Matt Harmon")
    const scoring = screen.getByLabelText("Scoring") as HTMLSelectElement
    expect(Array.from(scoring.options).map(option => option.value)).toEqual([
      "standard", "half_ppr", "ppr",
    ])
    fireEvent.change(scoring, {target: {value: "half_ppr"}})
    expect(setScoringFormat).toHaveBeenCalledWith("half_ppr")
  })

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
        activity={[{
          id: "alert-1", label: "Tier pressure", detail: "Three RBs may go before your pick",
          tone: "warning", occurredAt: 1,
        }]}
        currPick={4}
        currRound={["qb-mine", null, null]}
        currRoundPick={1}
        draftHistory={["qb-mine", null, null, null]}
        boardSettings={{ranker: ThirdPartyRanker.HARRIS, adpRanker: ThirdPartyADPRanker.ESPN}}
        isEvenRound={false}
        myPickNum={2}
        myPicks={[2, 5, 8]}
        onAcceptDraft={jest.fn()}
        onIgnoreDraft={jest.fn()}
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
        pendingDraftTitle="ESPN Mock 123"
        setCurrPick={jest.fn()}
        setViewPlayerId={jest.fn()}
        settings={settings}
      />,
    )

    const tape = screen.getByTestId("draft-dock-tape")
    expect(tape.textContent).toContain("#4")
    expect(tape.textContent).toContain("#5 · 1 away")
    expect(screen.getByTestId("draft-dock-roster")).toBeTruthy()
    expect(screen.getByRole("list", {name: "Draft activity ticker"}).textContent)
      .toContain("Three RBs may go before your pick")
    expect(screen.getByRole("button", {name: "Connect"})).toBeTruthy()
    expect(screen.getByText("ESPN Mock 123")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", {name: "Your roster"}))
    expect(screen.getByTestId("draft-dock-roster").textContent).toContain("Observed roster slots")
    expect(screen.getByTestId("draft-dock-roster").textContent).toContain("DST")
    expect(tape.textContent).toContain("#5 · 1 away")
    fireEvent.click(screen.getByRole("button", {name: "League needs"}))
    expect(screen.getByTestId("draft-dock-league-needs").textContent).toContain("Teams missing each positional roster slot")
    expect(screen.getByTestId("draft-dock-league-needs").textContent).toContain("DST")
    expect(screen.getAllByRole("row")).toHaveLength(5)
    expect(tape.textContent).toContain("#5 · 1 away")
  })

  it("reports the measured dock height so the desktop shell can reserve every mode", () => {
    const onHeightChange = jest.fn()
    let measuredHeight = 144
    const getBoundingClientRect = jest.spyOn(
      HTMLElement.prototype,
      "getBoundingClientRect",
    ).mockImplementation(() => ({
      bottom: measuredHeight, height: measuredHeight, left: 0, right: 320,
      top: 0, width: 320, x: 0, y: 0, toJSON: () => ({}),
    }))
    const originalResizeObserver = (global as typeof globalThis & {
      ResizeObserver?: typeof ResizeObserver
    }).ResizeObserver
    class ResizeObserverMock {
      static callback: ((entries: Array<{contentRect: {height: number}}>) => void) | null = null
      constructor(callback: (entries: Array<{contentRect: {height: number}}>) => void) {
        ResizeObserverMock.callback = callback
      }
      observe() {}
      disconnect() {}
    }
    ;(global as typeof globalThis & {ResizeObserver?: typeof ResizeObserver}).ResizeObserver =
      ResizeObserverMock as unknown as typeof ResizeObserver

    try {
      render(
        <DraftDock
          currPick={1}
          currRound={[null, null, null]}
          currRoundPick={1}
          draftHistory={[null, null, null]}
          boardSettings={{ranker: ThirdPartyRanker.HARRIS, adpRanker: ThirdPartyADPRanker.ESPN}}
          isEvenRound={false}
          myPickNum={2}
          myPicks={[2, 5, 8]}
          onHeightChange={onHeightChange}
          onRemovePick={jest.fn()}
          playerLib={{}}
          rosters={[roster({}), roster({}), roster({})]}
          roundIdx={0}
          setCurrPick={jest.fn()}
          setViewPlayerId={jest.fn()}
          settings={settings}
        />,
      )

      expect(onHeightChange).toHaveBeenCalledWith(144)
      measuredHeight = 232
      ResizeObserverMock.callback?.([{contentRect: {height: 232}}])
      expect(onHeightChange).toHaveBeenLastCalledWith(232)
    } finally {
      getBoundingClientRect.mockRestore()
      ;(global as typeof globalThis & {ResizeObserver?: typeof ResizeObserver}).ResizeObserver =
        originalResizeObserver
    }
  })
})
