import React from "react"
import {fireEvent, render, screen} from "@testing-library/react"

import DraftDeskAdpRoundView from "../components/draft-desk/DraftDeskAdpRoundView"
import {
  FantasyPosition,
  NFLTeam,
  ThirdPartyADPRanker,
  ThirdPartyRanker,
} from "../types"
import type {FantasySettings, Player} from "../types"

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

const player: Player = {
  id: "early-value",
  firstName: "Early",
  lastName: "Value",
  fullName: "Early Value",
  position: FantasyPosition.RUNNING_BACK,
  team: NFLTeam.BUF,
  ranks: {
    [ThirdPartyRanker.HARRIS]: {
      playerId: "early-value",
      ranker: ThirdPartyRanker.HARRIS,
      position: FantasyPosition.RUNNING_BACK,
      pprOverallRank: 1,
      standardOverallRank: 1,
      pprPositionRank: 1,
      standardPositionRank: 1,
      pprPositionTier: {
        tierNumber: 1,
        upperLimitPlayerIdx: 0,
        lowerLimitPlayerIdx: 0,
        upperLimitValue: 20,
        lowerLimitValue: 18,
      },
    },
    [ThirdPartyRanker.ESPN]: {
      playerId: "early-value",
      ranker: ThirdPartyRanker.ESPN,
      position: FantasyPosition.RUNNING_BACK,
      adp: 25,
      pprPositionRank: 10,
      standardPositionRank: 10,
    },
  },
}

describe("Draft Desk ADP-round rank value", () => {
  it("shows a positive two-round cue when configured rank is two rounds earlier", () => {
    const playerRanks = {
      QB: [],
      RB: [player],
      WR: [],
      TE: [],
      Purge: [],
      availPlayersByOverallRank: [player],
      availPlayersByAdp: [player],
    }
    render(<DraftDeskAdpRoundView
      addPlayerTarget={jest.fn()}
      boardSettings={{
        ranker: ThirdPartyRanker.HARRIS,
        adpRanker: ThirdPartyADPRanker.ESPN,
      }}
      fantasySettings={settings}
      myPicks={[1, 24, 25]}
      onSwitchToTargetsView={jest.fn()}
      playerLib={{[player.id]: player}}
      playerRanks={playerRanks}
      playerTargets={[]}
      removePlayerTarget={jest.fn()}
      removePlayerTargets={jest.fn()}
      replacePlayerTargets={jest.fn()}
      setViewPlayerId={jest.fn()}
      viewPlayerId={null}
    />)

    const cue = screen.getByLabelText("Ranked 2 rounds earlier than ESPN ADP")
    expect(cue.textContent).toContain("+2")
    expect(cue.getAttribute("title")).toBe("Configured rank R1 · ESPN ADP R3")
    expect(screen.getByText("T1").className).toContain("tierFlag1")
  })

  it("can navigate to the final occupied ranked ADP round", () => {
    const latePlayer: Player = {
      ...player,
      id: "late-ranked",
      firstName: "Late",
      lastName: "Ranked",
      fullName: "Late Ranked",
      ranks: {
        ...player.ranks,
        [ThirdPartyRanker.HARRIS]: {
          ...player.ranks![ThirdPartyRanker.HARRIS]!,
          playerId: "late-ranked",
          pprOverallRank: 160,
          standardOverallRank: 160,
        },
        [ThirdPartyRanker.ESPN]: {
          ...player.ranks![ThirdPartyRanker.ESPN]!,
          playerId: "late-ranked",
          adp: 169.48,
        },
      },
    }
    const playerRanks = {
      QB: [], RB: [latePlayer], WR: [], TE: [], Purge: [],
      availPlayersByOverallRank: [latePlayer],
      availPlayersByAdp: [latePlayer],
    }
    render(<DraftDeskAdpRoundView
      addPlayerTarget={jest.fn()}
      boardSettings={{ranker: ThirdPartyRanker.HARRIS, adpRanker: ThirdPartyADPRanker.ESPN}}
      fantasySettings={settings}
      myPicks={[1, 24, 25]}
      onSwitchToTargetsView={jest.fn()}
      playerLib={{[latePlayer.id]: latePlayer}}
      playerRanks={playerRanks}
      playerTargets={[]}
      removePlayerTarget={jest.fn()}
      removePlayerTargets={jest.fn()}
      replacePlayerTargets={jest.fn()}
      setViewPlayerId={jest.fn()}
      viewPlayerId={null}
    />)

    const next = screen.getByRole("button", {name: "Next ADP rounds"})
    for (let page = 0; page < 12; page += 1) fireEvent.click(next)

    expect(screen.getByText("ADP rounds 13–15")).toBeTruthy()
    expect(screen.getByText("Late Ranked")).toBeTruthy()
    expect(next.hasAttribute("disabled")).toBe(true)
  })
})
