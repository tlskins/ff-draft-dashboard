import React from "react"
import {fireEvent, render, screen} from "@testing-library/react"

import DraftDeskPlayerCard from "../components/shared/DraftDeskPlayerCard"
import {
  FantasyPosition,
  NFLTeam,
  ThirdPartyADPRanker,
  ThirdPartyRanker,
} from "../types"
import type {FantasySettings, Player} from "../types"

const settings: FantasySettings = {
  ppr: true, numTeams: 12, numStartingQbs: 1, numStartingRbs: 2,
  numStartingWrs: 2, numStartingTes: 1, numFlex: 1, numBenchPlayers: 5,
}

const player: Player = {
  id: "runner", firstName: "Alpha", lastName: "Runner",
  fullName: "Alpha Runner", position: FantasyPosition.RUNNING_BACK,
  team: NFLTeam.BUF,
  ranks: {
    [ThirdPartyRanker.HARRIS]: {
      playerId: "runner", ranker: ThirdPartyRanker.HARRIS,
      position: FantasyPosition.RUNNING_BACK, pprOverallRank: 12,
      standardOverallRank: 14, pprPositionRank: 5, standardPositionRank: 6,
      pprPositionTier: {tierNumber: 2, upperLimitPlayerIdx: 4, lowerLimitPlayerIdx: 8, upperLimitValue: 16, lowerLimitValue: 13},
    },
    [ThirdPartyRanker.ESPN]: {
      playerId: "runner", ranker: ThirdPartyRanker.ESPN,
      position: FantasyPosition.RUNNING_BACK, adp: 17.4,
      pprPositionRank: 5, standardPositionRank: 6,
    },
  },
}

describe("Draft Desk shared player card", () => {
  it("keeps position identity, rank, tier, ADP, target, and urgency in one dense row", () => {
    const onFocusPlayer = jest.fn()
    const onPinPlayer = jest.fn()
    render(
      <DraftDeskPlayerCard
        boardSettings={{ranker: ThirdPartyRanker.HARRIS, adpRanker: ThirdPartyADPRanker.ESPN}}
        compact
        fantasySettings={settings}
        leadingRank={5}
        onFocusPlayer={onFocusPlayer}
        onPinPlayer={onPinPlayer}
        player={player}
        currentPick={1}
        rankContext="RB5 · #12"
        target={{playerId: "runner", targetAsEarlyAsRound: 3}}
        urgency="At risk before your following pick"
        urgencyCue="RISK NEXT+1"
      />,
    )

    expect(screen.getByRole("group").getAttribute("aria-label")).toContain("Tier 2")
    expect(screen.getByText("Alpha Runner")).toBeTruthy()
    expect(screen.getByText("T2").className).toContain("tierFlag2")
    expect(screen.getByText("ADP 2.5")).toBeTruthy()
    expect(screen.getByText("Target R3")).toBeTruthy()
    expect(screen.getByText("RISK NEXT+1").getAttribute("title"))
      .toBe("At risk before your following pick")
    expect(screen.getByRole("group").getAttribute("aria-label"))
      .toContain("At risk before your following pick")
    expect(screen.getByLabelText("1.4 rounds before ESPN ADP").textContent)
      .toBe("1.4 RD EARLY")
    fireEvent.click(screen.getByRole("button", {name: "Lock Alpha Runner in player profile"}))
    expect(onPinPlayer).toHaveBeenCalledWith("runner")
    expect(onFocusPlayer).not.toHaveBeenCalled()
    expect(screen.queryByText("At risk before your following pick")).toBeNull()
    fireEvent.click(screen.getByRole("group"))
    expect(onFocusPlayer).toHaveBeenCalledWith("runner")
  })
})
