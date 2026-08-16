import React from "react"
import { fireEvent, render, screen } from "@testing-library/react"

import RankingsBoard from "../components/RankingsBoard"
import { ThirdPartyRanker } from "../types"

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
  removePlayerTargets: jest.fn(), playerTargets: [], customAndLatestRankingsDiffs: {},
  onSyncPendingRankings: jest.fn(), onRevertPlayerToPreSync: jest.fn(),
  addPlayerTarget: jest.fn(), removePlayerTarget: jest.fn(),
  rankingProfileControls: {
    profiles: [], activeProfile: null, isLoading: false, isSaving: false,
    error: null, apiConfigured: false, refresh: jest.fn(), save: jest.fn(),
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

    expect(screen.getByTestId("rankings-board").className).toContain("p-2")
    expect(screen.getAllByTestId("rankings-board")).toHaveLength(1)
  })
})
