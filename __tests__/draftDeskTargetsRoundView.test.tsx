import React from "react"
import {fireEvent, render, screen} from "@testing-library/react"

import DraftDeskTargetsRoundView from "../components/draft-desk/DraftDeskTargetsRoundView"
import {FantasyPosition, NFLTeam, ThirdPartyRanker} from "../types"

const makePlayer = (id: string, overallRank: number, adp: number): any => ({
  id, firstName: id, lastName: "Runner", fullName: `${id} Runner`,
  position: FantasyPosition.RUNNING_BACK, team: NFLTeam.BUF,
  ranks: {
    [ThirdPartyRanker.HARRIS]: {
      playerId: id, ranker: ThirdPartyRanker.HARRIS,
      position: FantasyPosition.RUNNING_BACK,
      pprOverallRank: overallRank, standardOverallRank: overallRank,
      pprPositionRank: overallRank, standardPositionRank: overallRank,
    },
    ESPN: {
      playerId: id, ranker: "ESPN", position: FantasyPosition.RUNNING_BACK,
      adp, pprPositionRank: overallRank, standardPositionRank: overallRank,
    },
  },
})

const earlyAdp = makePlayer("Early", 13, 25)
const lateAdp = makePlayer("Late", 1, 40)
const players = [lateAdp, earlyAdp]
const baseProps: any = {
  boardSettings: {ranker: ThirdPartyRanker.HARRIS, adpRanker: "ESPN"},
  currPick: 1,
  fantasySettings: {ppr: true, numTeams: 12},
  onQueuePlayer: jest.fn(),
  playerLib: Object.fromEntries(players.map(player => [player.id, player])),
  playerRanks: {QB: [], RB: players, WR: [], TE: [], Purge: [], availPlayersByOverallRank: players, availPlayersByAdp: players},
  playerTargets: players.map(player => ({playerId: player.id, targetAsEarlyAsRound: 1})),
  removePlayerTarget: jest.fn(),
  setViewPlayerId: jest.fn(),
  viewPlayerId: null,
}

describe("Draft Desk targets round view", () => {
  it("renders only targets in ADP order and spans configured-rank through ADP rounds", () => {
    const view = render(<DraftDeskTargetsRoundView {...baseProps} />)
    const cards = Array.from(view.container.querySelectorAll("[data-target-player='true']"))
    expect(cards.map(card => card.textContent)).toEqual([
      expect.stringContaining("Early Runner"),
      expect.stringContaining("Late Runner"),
    ])
    expect(cards[0].getAttribute("data-range-start")).toBe("2")
    expect(cards[0].getAttribute("data-range-end")).toBe("3")
    expect(cards[0].getAttribute("style")).toContain("grid-column: 2 / 4")
    expect(cards[1].getAttribute("data-range-start")).toBe("1")
    expect(cards[1].getAttribute("data-range-end")).toBe("4")
  })

  it("keeps identity details visible when paging into the middle of a target window", () => {
    render(<DraftDeskTargetsRoundView {...baseProps} />)
    fireEvent.click(screen.getByRole("button", {name: "Next target rounds"}))
    expect(screen.getByText("Rounds 2–5")).toBeTruthy()
    expect(screen.getByText("Late Runner")).toBeTruthy()
    expect(screen.getByRole("group", {name: /Late Runner.*Rank R1 → ADP R4/})).toBeTruthy()
  })
})
