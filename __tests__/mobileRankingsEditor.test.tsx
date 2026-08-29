import React, {useState} from "react"
import {act, fireEvent, render, screen, within} from "@testing-library/react"

import type {PlayerRanks} from "../behavior/draft"
import MobileRankingsEditor from "../components/mobile/MobileRankingsEditor"
import {
  FantasyPosition,
  NFLTeam,
  ThirdPartyADPRanker,
  ThirdPartyRanker,
  type Player,
  type PlayerTarget,
} from "../types"


const tier = (tierNumber: number) => ({
  tierNumber,
  upperLimitPlayerIdx: 0,
  lowerLimitPlayerIdx: 3,
  upperLimitValue: 20,
  lowerLimitValue: 10,
})

const player = ({
  id,
  name,
  position,
  positionRank,
  overallRank,
  adp,
}: {
  id: string
  name: string
  position: FantasyPosition
  positionRank: number
  overallRank: number
  adp: number
}): Player => ({
  id,
  firstName: name.split(" ")[0],
  lastName: name.split(" ").slice(1).join(" "),
  fullName: name,
  team: NFLTeam.BUF,
  position,
  ranks: {
    [ThirdPartyRanker.HARRIS]: {
      playerId: id,
      ranker: ThirdPartyRanker.HARRIS,
      position,
      standardPositionRank: positionRank,
      standardOverallRank: overallRank,
      standardPositionTier: tier(positionRank === 1 ? 1 : 2),
    },
    [ThirdPartyADPRanker.ESPN]: {
      playerId: id,
      ranker: ThirdPartyADPRanker.ESPN,
      position,
      adp,
    },
  },
})

const alpha = player({
  id: "alpha",
  name: "Alpha Runner",
  position: FantasyPosition.RUNNING_BACK,
  positionRank: 1,
  overallRank: 5,
  adp: 14,
})
const beta = player({
  id: "beta",
  name: "Beta Runner",
  position: FantasyPosition.RUNNING_BACK,
  positionRank: 2,
  overallRank: 15,
  adp: 4,
})
const receiver = player({
  id: "receiver",
  name: "Gamma Receiver",
  position: FantasyPosition.WIDE_RECEIVER,
  positionRank: 1,
  overallRank: 8,
  adp: 8,
})

const ranks: PlayerRanks = {
  QB: [],
  RB: [alpha, beta],
  WR: [receiver],
  TE: [],
  Purge: [],
  availPlayersByOverallRank: [alpha, receiver, beta],
  availPlayersByAdp: [beta, receiver, alpha],
}

const settings = {
  ppr: false,
  scoringFormat: "standard" as const,
  numTeams: 12,
  numStartingQbs: 1,
  numStartingRbs: 2,
  numStartingWrs: 2,
  numStartingTes: 1,
  numFlex: 1,
  numBenchPlayers: 6,
}

describe("mobile rankings editor", () => {
  it("keeps only the three ranking views and edits ranks and targets in place", async () => {
    const reorder = jest.fn()
    const save = jest.fn()
    const Harness = () => {
      const [editing, setEditing] = useState(false)
      const [targets, setTargets] = useState<PlayerTarget[]>([{
        playerId: beta.id,
        targetAsEarlyAsRound: 1,
      }])
      return (
        <MobileRankingsEditor
          addPlayerTarget={(selected, round) => setTargets(current => [
            ...current,
            {playerId: selected.id, targetAsEarlyAsRound: round},
          ])}
          boardSettings={{ranker: ThirdPartyRanker.HARRIS, adpRanker: ThirdPartyADPRanker.ESPN}}
          canEditRankings
          isEditingRankings={editing}
          onBeginRankEdits={() => { setEditing(true); return true }}
          onReorderPlayer={reorder}
          onSaveRankEdits={() => { save(); setEditing(false) }}
          playerLib={{alpha, beta, receiver}}
          playerRanks={ranks}
          playerTargets={targets}
          removePlayerTarget={playerId => setTargets(current => current.filter(target => target.playerId !== playerId))}
          replacePlayerTargets={setTargets}
          settings={settings}
        />
      )
    }
    const {container} = render(<Harness />)

    expect(screen.getByRole("navigation", {name: "Mobile rankings views"}))
      .toBeTruthy()
    expect(screen.getAllByRole("button", {name: /Position|ADP round|Targets 1/})).toHaveLength(3)
    expect(screen.queryByText("Overview")).toBeNull()
    expect(screen.queryByText("Analysis")).toBeNull()

    fireEvent.click(screen.getByRole("button", {name: "Edit ranks"}))
    fireEvent.change(screen.getByLabelText("Move Alpha Runner to RB rank"), {
      target: {value: "2"},
    })
    expect(reorder).toHaveBeenCalledWith("alpha", FantasyPosition.RUNNING_BACK, 1)
    await act(async () => {
      fireEvent.click(screen.getByRole("button", {name: "Save ranks"}))
    })
    expect(save).toHaveBeenCalledTimes(1)

    const alphaCard = container.querySelector('[data-player-id="alpha"]') as HTMLElement
    fireEvent.click(within(alphaCard).getByRole("button", {name: "◎ Target"}))
    expect(screen.getByRole("button", {name: "Targets 2"})).toBeTruthy()

    fireEvent.click(screen.getByRole("button", {name: "Targets 2"}))
    const targetCards = Array.from(container.querySelectorAll("[data-player-id]"))
      .map(card => card.getAttribute("data-player-id"))
    expect(targetCards).toEqual(["beta", "alpha"])
    fireEvent.change(screen.getByLabelText("Move Beta Runner target round"), {
      target: {value: "3"},
    })
    expect(screen.getByLabelText("Beta Runner, RB rank 2, target round 3"))
      .toBeTruthy()
  })

  it("groups ranked players by configured ADP round", () => {
    render(
      <MobileRankingsEditor
        addPlayerTarget={jest.fn()}
        boardSettings={{ranker: ThirdPartyRanker.HARRIS, adpRanker: ThirdPartyADPRanker.ESPN}}
        canEditRankings
        isEditingRankings={false}
        onBeginRankEdits={() => true}
        onReorderPlayer={jest.fn()}
        onSaveRankEdits={jest.fn()}
        playerLib={{alpha, beta, receiver}}
        playerRanks={ranks}
        playerTargets={[]}
        removePlayerTarget={jest.fn()}
        replacePlayerTargets={jest.fn()}
        settings={settings}
      />,
    )

    fireEvent.click(screen.getByRole("button", {name: "ADP round"}))
    expect(screen.getByLabelText("Beta Runner, RB rank 2")).toBeTruthy()
    expect(screen.getByLabelText("Gamma Receiver, WR rank 1")).toBeTruthy()
    expect(screen.queryByLabelText("Alpha Runner, RB rank 1")).toBeNull()

    fireEvent.click(screen.getByRole("button", {name: "R2"}))
    expect(screen.getByLabelText("Alpha Runner, RB rank 1")).toBeTruthy()
    expect(screen.queryByLabelText("Beta Runner, RB rank 2")).toBeNull()
  })
})
