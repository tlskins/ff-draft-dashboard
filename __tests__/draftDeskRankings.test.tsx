import React from "react"
import { fireEvent, render, screen } from "@testing-library/react"

import RankingsBoard from "../components/RankingsBoard"
import { FantasyPosition, NFLTeam, ThirdPartyRanker } from "../types"

const props = (setDraftView = jest.fn()): any => ({
  playerRanks: {QB: [], RB: [], WR: [], TE: [], Purge: [], availPlayersByOverallRank: [], availPlayersByAdp: []},
  predictedPicks: {}, myPickNum: 1, noPlayers: false,
  fantasySettings: {ppr: true, numTeams: 12, numStartingQbs: 1, numStartingRbs: 2, numStartingWrs: 2, numStartingTes: 1, numFlex: 1, numBenchPlayers: 5},
  boardSettings: {ranker: ThirdPartyRanker.HARRIS, adpRanker: "ESPN"},
  currPick: 1, predNextTiers: {}, rankingSummaries: [],
  onSelectPlayer: jest.fn(), onPurgePlayer: jest.fn(), setViewPlayerId: jest.fn(),
  draftView: "Rankings By Position", setDraftView,
  sortOption: "Sort By Ranks", setSortOption: jest.fn(),
  highlightOption: "None", setHighlightOption: jest.fn(),
  isEditingCustomRanking: false, hasCustomRanking: false, canEditCustomRankings: true,
  onReorderPlayer: jest.fn(), onStartCustomRanking: jest.fn(), onFinishCustomRanking: jest.fn(),
  onUpdateTierBoundary: jest.fn(), onCancelCustomRanking: jest.fn(), rosters: [],
  playerLib: {}, draftStarted: false, getDraftRoundForPickNum: jest.fn(() => [null]),
  viewPlayerId: null, draftHistory: [], viewRosterIdx: 0,
  draftCaptureState: "disconnected", activeDraftListenerTitle: null,
  draftSourceHealth: null, draftSourceHealthFreshness: "unknown",
  draftPersistence: {state: "local", pendingEventCount: 0, error: null, canRetry: false},
  onRetryDraftPersistence: jest.fn(), loadCurrentRankings: jest.fn(),
  rankings: {players: [], rankingsSummaries: [], cachedAt: "", editedAt: ""}, latestRankings: null,
  removePlayerTargets: jest.fn(), replacePlayerTargets: jest.fn(), myPicks: [1, 24, 25], playerTargets: [], customAndLatestRankingsDiffs: {},
  onSyncPendingRankings: jest.fn(), onRevertPlayerToPreSync: jest.fn(),
  addPlayerTarget: jest.fn(), removePlayerTarget: jest.fn(),
  rankingProfileControls: {
    profiles: [], activeProfile: null, isLoading: false, isSaving: false,
    error: null, apiConfigured: false, serverPersistenceEnabled: true,
    refresh: jest.fn(), save: jest.fn(),
    select: jest.fn(), startNew: jest.fn(), clearLocal: jest.fn(), undo: jest.fn(), redo: jest.fn(),
  },
})

describe("Phase 14A unified rankings pane", () => {
  it("uses one visible rankings mode control and never mounts duplicate boards", () => {
    const setDraftView = jest.fn()
    render(<RankingsBoard {...props(setDraftView)} />)

    expect(screen.getAllByTestId("rankings-board")).toHaveLength(1)
    fireEvent.change(screen.getByLabelText("Rankings mode"), {
      target: {value: "Best Available By Round"},
    })
    expect(setDraftView).toHaveBeenCalledWith("Best Available By Round")
    expect(screen.getAllByTestId("rankings-board")).toHaveLength(1)
  })

  it("uses the candidate compact presentation without changing board ownership", () => {
    render(<RankingsBoard {...props()} compact />)

    expect(screen.getByTestId("rankings-board").className)
      .toContain("rankingsBoardCompact")
    expect(screen.getAllByTestId("rankings-board")).toHaveLength(1)
  })

  it("makes Position and ADP round mutually exclusive in the desk mode switch", () => {
    const setDraftView = jest.fn()
    render(<RankingsBoard {...props(setDraftView)} compact />)

    expect(screen.getByRole("button", {name: "Position"}).getAttribute("aria-pressed")).toBe("true")
    expect(screen.getByRole("button", {name: "ADP round"}).getAttribute("aria-pressed")).toBe("false")
    fireEvent.click(screen.getByRole("button", {name: "ADP round"}))
    expect(setDraftView).toHaveBeenCalledWith("Best By ADP Round")
  })

  it("retains the ADP round page while the user visits position rankings", () => {
    const base = props()
    const view = render(<RankingsBoard {...base} compact draftView="Best By ADP Round" />)
    expect(screen.getByText("ADP rounds 1–3")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", {name: "Next ADP rounds"}))
    expect(screen.getByText("ADP rounds 2–4")).toBeTruthy()

    view.rerender(<RankingsBoard {...base} compact draftView="Rankings By Position" />)
    view.rerender(<RankingsBoard {...base} compact draftView="Best By ADP Round" />)
    expect(screen.getByText("ADP rounds 2–4")).toBeTruthy()
  })

  it("shows two positional lanes and switches between the approved pairs", () => {
    const onVisiblePositionsChange = jest.fn()
    render(<RankingsBoard
      {...props()}
      compact
      onVisiblePositionsChange={onVisiblePositionsChange}
    />)

    expect(screen.getByTestId("ranking-position-lane-RB")).toBeTruthy()
    expect(screen.getByTestId("ranking-position-lane-WR")).toBeTruthy()
    expect(onVisiblePositionsChange).toHaveBeenLastCalledWith([
      FantasyPosition.RUNNING_BACK,
      FantasyPosition.WIDE_RECEIVER,
    ])
    fireEvent.click(screen.getByRole("button", {name: "QB + TE"}))
    expect(screen.getByTestId("ranking-position-lane-QB")).toBeTruthy()
    expect(screen.getByTestId("ranking-position-lane-TE")).toBeTruthy()
    expect(onVisiblePositionsChange).toHaveBeenLastCalledWith([
      FantasyPosition.QUARTERBACK,
      FantasyPosition.TIGHT_END,
    ])
  })

  it("follows the shared position authority when another pane changes the pair", () => {
    render(<RankingsBoard
      {...props()}
      compact
      visiblePositions={[
        FantasyPosition.QUARTERBACK,
        FantasyPosition.TIGHT_END,
      ]}
    />)

    expect(screen.getByRole("button", {name: "QB + TE"}).getAttribute("aria-pressed"))
      .toBe("true")
    expect(screen.getByTestId("ranking-position-lane-QB")).toBeTruthy()
    expect(screen.getByTestId("ranking-position-lane-TE")).toBeTruthy()
    expect(screen.queryByTestId("ranking-position-lane-RB")).toBeNull()
  })

  it("retains interactive tier-boundary placement in custom-ranking mode", () => {
    const makePlayer = (id: string, positionRank: number, tierNumber: number): any => ({
      id, firstName: id, lastName: "Runner", fullName: `${id} Runner`,
      position: FantasyPosition.RUNNING_BACK, team: NFLTeam.BUF,
      ranks: {
        [ThirdPartyRanker.HARRIS]: {
          playerId: id, ranker: ThirdPartyRanker.HARRIS,
          position: FantasyPosition.RUNNING_BACK,
          pprOverallRank: positionRank, standardOverallRank: positionRank,
          pprPositionRank: positionRank, standardPositionRank: positionRank,
          pprPositionTier: {tierNumber, upperLimitPlayerIdx: tierNumber - 1, lowerLimitPlayerIdx: tierNumber - 1, upperLimitValue: 20 - tierNumber, lowerLimitValue: 19 - tierNumber},
          standardPositionTier: {tierNumber, upperLimitPlayerIdx: tierNumber - 1, lowerLimitPlayerIdx: tierNumber - 1, upperLimitValue: 20 - tierNumber, lowerLimitValue: 19 - tierNumber},
        },
      },
    })
    const players = [makePlayer("Alpha", 1, 1), makePlayer("Beta", 2, 2), makePlayer("Gamma", 3, 2)]
    const onUpdateTierBoundary = jest.fn()
    const onFinishCustomRanking = jest.fn()
    const base = props()
    const view = render(<RankingsBoard
      {...base}
      compact
      isEditingCustomRanking
      onFinishCustomRanking={onFinishCustomRanking}
      onUpdateTierBoundary={onUpdateTierBoundary}
      playerLib={Object.fromEntries(players.map(player => [player.id, player]))}
      playerRanks={{
        QB: [], RB: players, WR: [], TE: [], Purge: [],
        availPlayersByOverallRank: players, availPlayersByAdp: players,
      }}
      rankings={{...base.rankings, players, settings: base.fantasySettings}}
    />)

    expect(screen.getByRole("button", {name: "QB"}).getAttribute("aria-pressed")).toBe("true")
    fireEvent.click(screen.getByRole("button", {name: "RB"}))
    expect(screen.getByRole("button", {name: "RB"}).getAttribute("aria-pressed")).toBe("true")
    expect(view.container.querySelector('[data-column-title="QB"]')).toBeNull()
    expect(view.container.querySelector('[data-column-title="RB"]')).toBeTruthy()
    const editableCard = screen.getByRole("group", {name: /Alpha Runner, RB, BUF/})
    expect(editableCard.className).toContain("editablePlayerCard")
    expect(editableCard.className).not.toMatch(/bg-yellow|bg-purple/)
    expect(screen.getByText(/RB1 · User T1/)).toBeTruthy()
    expect(screen.getByRole("button", {name: "View Alpha Runner history"})).toBeTruthy()
    const divider = view.container.querySelector('[title="Click to move Tier 1"]')
    expect(divider).toBeTruthy()
    fireEvent.click(divider as Element)
    expect((divider as HTMLElement).getAttribute("aria-pressed")).toBe("true")
    const placement = view.container.querySelector('[title="Place Tier 1 here"]')
    expect(placement).toBeTruthy()
    fireEvent.click(placement as Element)
    expect(onUpdateTierBoundary).toHaveBeenCalledWith("RB", 1, expect.any(Number))
    fireEvent.click(screen.getByRole("button", {name: "Finish"}))
    expect(onFinishCustomRanking).toHaveBeenCalledTimes(1)
  })

  it("keeps mouse reordering enabled in the compact desktop editor", () => {
    const makePlayer = (id: string, positionRank: number): any => ({
      id, firstName: id, lastName: "Runner", fullName: `${id} Runner`,
      position: FantasyPosition.RUNNING_BACK, team: NFLTeam.BUF,
      ranks: {
        [ThirdPartyRanker.HARRIS]: {
          playerId: id, ranker: ThirdPartyRanker.HARRIS,
          position: FantasyPosition.RUNNING_BACK,
          pprOverallRank: positionRank, standardOverallRank: positionRank,
          pprPositionRank: positionRank, standardPositionRank: positionRank,
          pprPositionTier: {tierNumber: 1, upperLimitPlayerIdx: 0, lowerLimitPlayerIdx: 1, upperLimitValue: 20, lowerLimitValue: 18},
          standardPositionTier: {tierNumber: 1, upperLimitPlayerIdx: 0, lowerLimitPlayerIdx: 1, upperLimitValue: 20, lowerLimitValue: 18},
        },
      },
    })
    const players = [makePlayer("Alpha", 1), makePlayer("Beta", 2)]
    const onReorderPlayer = jest.fn()
    const loadCurrentRankings = jest.fn()
    const onFinishCustomRanking = jest.fn()
    const onCancelCustomRanking = jest.fn()
    const base = props()
    const view = render(<RankingsBoard
      {...base}
      compact
      isEditingCustomRanking
      loadCurrentRankings={loadCurrentRankings}
      onCancelCustomRanking={onCancelCustomRanking}
      onFinishCustomRanking={onFinishCustomRanking}
      onReorderPlayer={onReorderPlayer}
      playerLib={Object.fromEntries(players.map(player => [player.id, player]))}
      playerRanks={{QB: [], RB: players, WR: [], TE: [], Purge: [], availPlayersByOverallRank: players, availPlayersByAdp: players}}
      rankings={{...base.rankings, players, settings: base.fantasySettings}}
    />)

    fireEvent.click(screen.getByRole("button", {name: "RB"}))
    const cards = Array.from(view.container.querySelectorAll('[data-column-title="RB"]'))
    expect(cards).toHaveLength(2)
    expect(cards[0].getAttribute("draggable")).toBe("true")
    const dataTransfer = {
      effectAllowed: "none",
      dropEffect: "none",
      setData: jest.fn(),
      getData: jest.fn(),
    }
    fireEvent.dragStart(cards[0], {dataTransfer})
    fireEvent.dragOver(cards[1], {dataTransfer})
    fireEvent.drop(cards[1], {dataTransfer})
    expect(onReorderPlayer).toHaveBeenCalledWith("Alpha", "RB", 1)
    fireEvent.click(screen.getByRole("button", {name: "Cancel"}))
    expect(loadCurrentRankings).toHaveBeenCalledTimes(1)
    expect(onFinishCustomRanking).toHaveBeenCalledTimes(1)
    expect(onCancelCustomRanking).toHaveBeenCalledTimes(1)
  })
})
