import React from "react"
import {
  fireEvent,
  render,
  waitFor,
} from "@testing-library/react"

import {
  isEditableKeyboardTarget,
  shouldIgnoreGlobalDraftShortcut,
} from "../behavior/accessibility"
import PlayerSearchModal from "../components/PlayerSearchModal"
import PlayerComparisonDrawer from "../components/analysis/PlayerComparisonDrawer"
import Dropdown from "../components/dropdown"
import {
  FantasyPosition,
  FantasySettings,
  NFLTeam,
  Player,
  ThirdPartyADPRanker,
  ThirdPartyRanker,
} from "../types"

const settings: FantasySettings = {
  ppr: true,
  numTeams: 12,
  numStartingQbs: 1,
  numStartingRbs: 2,
  numStartingWrs: 2,
  numStartingTes: 1,
  numFlex: 1,
  numBenchPlayers: 6,
}

const player: Player = {
  id: "player-1",
  firstName: "Alpha",
  lastName: "Runner",
  fullName: "Alpha Runner",
  position: FantasyPosition.RUNNING_BACK,
  team: NFLTeam.BUF,
  ranks: {},
}

const searchProps = {
  playerLib: { [player.id]: player },
  fantasySettings: settings,
  boardSettings: {
    ranker: ThirdPartyRanker.HARRIS,
    adpRanker: ThirdPartyADPRanker.ESPN,
  },
  rankingSummaries: [],
  playerTargets: [],
  addPlayerTarget: jest.fn(),
  removePlayerTarget: jest.fn(),
  myPickNum: 1,
  currPick: 1,
}

describe("Phase 7 keyboard and focus accessibility", () => {
  it("does not let global draft shortcuts hijack editable controls or Cmd shortcuts", () => {
    const input = document.createElement("input")
    const button = document.createElement("button")
    const menuitem = document.createElement("div")
    menuitem.setAttribute("role", "menuitem")

    expect(isEditableKeyboardTarget(input)).toBe(true)
    expect(shouldIgnoreGlobalDraftShortcut({
      target: input,
      code: "ArrowDown",
      ctrlKey: false,
      altKey: false,
      metaKey: false,
    })).toBe(true)
    expect(shouldIgnoreGlobalDraftShortcut({
      target: button,
      code: "ArrowDown",
      ctrlKey: false,
      altKey: false,
      metaKey: false,
    })).toBe(true)
    expect(shouldIgnoreGlobalDraftShortcut({
      target: menuitem,
      code: "ArrowDown",
      ctrlKey: false,
      altKey: false,
      metaKey: false,
    })).toBe(true)
    expect(shouldIgnoreGlobalDraftShortcut({
      target: button,
      code: "KeyZ",
      ctrlKey: false,
      altKey: false,
      metaKey: true,
    })).toBe(true)
    expect(shouldIgnoreGlobalDraftShortcut({
      target: button,
      code: "MetaLeft",
      ctrlKey: false,
      altKey: false,
      metaKey: true,
    })).toBe(true)
    expect(shouldIgnoreGlobalDraftShortcut({
      target: document.body,
      code: "ArrowDown",
      ctrlKey: false,
      altKey: false,
      metaKey: false,
    })).toBe(false)
    expect(shouldIgnoreGlobalDraftShortcut({
      target: document.body,
      code: "MetaLeft",
      ctrlKey: false,
      altKey: false,
      metaKey: true,
    })).toBe(false)
  })

  it("focuses an opened player search, supports keyboard result selection, and returns focus", async () => {
    const onClose = jest.fn()
    const opener = document.createElement("button")
    opener.textContent = "Open player search"
    document.body.appendChild(opener)
    opener.focus()

    const view = render(
      <PlayerSearchModal {...searchProps} isOpen={false} onClose={onClose} />,
    )
    view.rerender(
      <PlayerSearchModal {...searchProps} isOpen={true} onClose={onClose} />,
    )

    const search = view.getByPlaceholderText("Search for a player...")
    await waitFor(() => expect(document.activeElement).toBe(search))
    fireEvent.change(search, { target: { value: "alpha" } })
    const result = view.getByRole("option", {
      name: "Select Alpha Runner, RB, BUF",
    })
    expect(view.getByRole("listbox", {
      name: "Player search results",
    })).toBeTruthy()
    fireEvent.click(result)
    expect(view.getByText("Alpha Runner")).toBeTruthy()

    fireEvent.keyDown(view.getByRole("dialog"), { key: "Escape" })
    expect(onClose).toHaveBeenCalledTimes(1)
    view.rerender(
      <PlayerSearchModal {...searchProps} isOpen={false} onClose={onClose} />,
    )
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })

  it("keeps player-comparison focus contained and returns it after Escape", async () => {
    const onClose = jest.fn()
    const opener = document.createElement("button")
    opener.textContent = "Inspect Alpha Runner"
    document.body.appendChild(opener)
    opener.focus()
    const view = render(
      <PlayerComparisonDrawer
        boardSettings={{
          ranker: ThirdPartyRanker.HARRIS,
          adpRanker: ThirdPartyADPRanker.ESPN,
        }}
        onClose={onClose}
        player={player}
        rankingSummaries={[]}
        response={null}
        settings={settings}
      />,
    )
    const dialog = view.getByRole("dialog")
    const close = view.getByRole("button", { name: "Close player comparison" })
    await waitFor(() => expect(document.activeElement).toBe(close))
    fireEvent.keyDown(dialog, { key: "Escape" })
    expect(onClose).toHaveBeenCalledTimes(1)
    view.unmount()
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })

  it("offers keyboard menu navigation and returns focus after a selection", async () => {
    const onSelect = jest.fn()
    const view = render(
      <Dropdown
        options={[{ title: "Load rankings", callback: onSelect }]}
        title="Manage rankings"
      />,
    )
    const trigger = view.getByRole("button", { name: "Manage rankings" })
    trigger.focus()
    fireEvent.keyDown(trigger, { key: "ArrowDown" })

    const option = view.getByRole("menuitem", { name: "Load rankings" })
    await waitFor(() => expect(document.activeElement).toBe(option))
    fireEvent.click(option)
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(document.activeElement).toBe(trigger)

    fireEvent.keyDown(trigger, { key: "ArrowDown" })
    fireEvent.keyDown(view.getByRole("menu"), { key: "Escape" })
    expect(view.queryByRole("menu")).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })
})
