import React from "react"
import {fireEvent, render, screen, within} from "@testing-library/react"

import {buildDraftDeskTargetChartModel} from "../behavior/draftDeskTargetChart"
import DraftDeskTargetChart from "../components/draft-desk/DraftDeskTargetChart"
import {
  FantasyPosition,
  NFLTeam,
  ThirdPartyADPRanker,
  ThirdPartyRanker,
} from "../types"

const makePlayer = (
  id: string,
  fullName: string,
  position: FantasyPosition,
  adp?: number,
): any => ({
  id,
  firstName: fullName.split(" ")[0],
  lastName: fullName.split(" ").slice(1).join(" "),
  fullName,
  position,
  team: NFLTeam.BUF,
  ranks: {
    [ThirdPartyRanker.HARRIS]: {
      playerId: id,
      ranker: ThirdPartyRanker.HARRIS,
      position,
      pprOverallRank: 8,
      pprPositionRank: 4,
      pprPositionTier: {tierNumber: 1},
    },
    ...(adp === undefined ? {} : {
      [ThirdPartyRanker.ESPN]: {
        playerId: id,
        ranker: ThirdPartyRanker.ESPN,
        position,
        adp,
      },
    }),
  },
})

const alpha = makePlayer("alpha", "Alpha Runner", FantasyPosition.RUNNING_BACK, 31.5)
const bravo = makePlayer("bravo", "Bravo Runner", FantasyPosition.RUNNING_BACK, 31.5)
const earlier = makePlayer("earlier", "Early Runner", FantasyPosition.RUNNING_BACK, 19.5)
const unavailable = makePlayer("unavailable", "No Adp Runner", FantasyPosition.RUNNING_BACK)
const receiver = makePlayer("receiver", "Charlie Receiver", FantasyPosition.WIDE_RECEIVER, 52.4)
const players = [alpha, bravo, earlier, unavailable, receiver]
const fantasySettings: any = {ppr: true, numTeams: 12}
const boardSettings: any = {
  ranker: ThirdPartyRanker.HARRIS,
  adpRanker: ThirdPartyADPRanker.ESPN,
}
const playerRanks: any = {
  QB: [],
  RB: [alpha, bravo, earlier, unavailable],
  WR: [receiver],
  TE: [],
  Purge: [],
  availPlayersByOverallRank: players,
  availPlayersByAdp: players,
}
const baseProps = {
  playerTargets: [
    {playerId: alpha.id, targetAsEarlyAsRound: 3},
    {playerId: unavailable.id, targetAsEarlyAsRound: 3},
    {playerId: bravo.id, targetAsEarlyAsRound: 3},
    {playerId: earlier.id, targetAsEarlyAsRound: 3},
    {playerId: receiver.id, targetAsEarlyAsRound: 5},
  ],
  playerLib: Object.fromEntries(players.map(player => [player.id, player])),
  playerRanks,
  fantasySettings,
  boardSettings,
  currPick: 43,
  positionFilter: "All" as const,
  setPositionFilter: jest.fn(),
  onBack: jest.fn(),
}

describe("Draft Desk target chart", () => {
  it("groups targets round-first with exact ranges and stable ADP/identity ordering", () => {
    const model = buildDraftDeskTargetChartModel(baseProps)

    expect(model.groups.map(group => group.targetRound)).toEqual([3, 5])
    expect(model.groups[0]).toMatchObject({
      targetRound: 3,
      targetStartPick: 25,
      targetEndPick: 36,
      currentPickRelationship: "passed",
    })
    expect(model.groups[0].players.map(item => item.player.id))
      .toEqual(["earlier", "alpha", "bravo", "unavailable"])
    expect(model.groups[1]).toMatchObject({
      targetRound: 5,
      targetStartPick: 49,
      targetEndPick: 60,
      currentPickRelationship: "ahead",
    })
  })

  it("aligns shared round-window, ADP, and current-pick semantics", () => {
    render(<DraftDeskTargetChart {...baseProps} />)

    const roundThree = screen.getByTestId("target-round-group-3")
    expect(within(roundThree).getByText("ROUND 3 · PICKS 25–36")).toBeTruthy()
    expect(within(roundThree).getByText(/4 players · Current pick 43 · target round passed/)).toBeTruthy()
    expect(within(roundThree).getByLabelText(/Early Runner.*Target round 3, picks 25 through 36.*ADP 19.5.*Current pick 43/)).toBeTruthy()
    expect(within(roundThree).getByText("19.5")).toBeTruthy()
    expect(screen.getByLabelText("Target chart legend").textContent)
      .toContain("Round windowPlayer ADPCurrent pick")
  })

  it("keeps unavailable ADP understandable within its target-round group", () => {
    render(<DraftDeskTargetChart {...baseProps} />)
    const unavailableRow = screen.getByLabelText(/No Adp Runner.*ADP unavailable/)
    expect(unavailableRow.textContent).toContain("RB · BUF · ADP unavailable")
    expect(within(unavailableRow).getByText("ADP unavailable")).toBeTruthy()
  })

  it("keeps compact navigation and position filtering accessible", () => {
    const onBack = jest.fn()
    const setPositionFilter = jest.fn()
    render(<DraftDeskTargetChart {...baseProps} onBack={onBack} setPositionFilter={setPositionFilter} />)
    fireEvent.click(screen.getByRole("button", {name: /Back to ADP rounds/}))
    expect(onBack).toHaveBeenCalledTimes(1)
    fireEvent.change(screen.getByLabelText("Target position filter"), {target: {value: "RB"}})
    expect(setPositionFilter).toHaveBeenCalledWith("RB")
  })

  it("filters the round groups by position", () => {
    render(<DraftDeskTargetChart {...baseProps} positionFilter="WR" />)
    expect(screen.queryByTestId("target-round-group-3")).toBeNull()
    expect(screen.getByTestId("target-round-group-5")).toBeTruthy()
    expect(screen.getByText("Charlie Receiver")).toBeTruthy()
  })

  it("provides a concise empty state for an unmatched position", () => {
    render(<DraftDeskTargetChart {...baseProps} positionFilter="TE" />)
    expect(screen.getByRole("status").textContent)
      .toContain("No available targets match this position")
  })
})
