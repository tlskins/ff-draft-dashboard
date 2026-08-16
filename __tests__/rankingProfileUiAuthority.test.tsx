import React from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { toast } from "react-toastify"

import RankingsBoard from "../components/RankingsBoard"
import { FantasyPosition, ThirdPartyRanker } from "../types"


jest.mock("react-toastify", () => ({
  toast: {
    error: jest.fn(),
    info: jest.fn(),
    success: jest.fn(),
    warn: jest.fn(),
  },
}))

const rankingProfileControls = () => ({
  profiles: [],
  activeProfile: null,
  isLoading: false,
  isSaving: false,
  error: null,
  apiConfigured: false,
  refresh: jest.fn(),
  save: jest.fn(),
  select: jest.fn(),
  startNew: jest.fn(),
  clearLocal: jest.fn(),
  undo: jest.fn(),
  redo: jest.fn(),
})

const props = (controls = rankingProfileControls()): any => ({
  playerRanks: {
    QB: [], RB: [], WR: [], TE: [], Purge: [],
    availPlayersByOverallRank: [], availPlayersByAdp: [],
  },
  predictedPicks: {},
  myPickNum: 1,
  noPlayers: false,
  fantasySettings: {
    ppr: true, numTeams: 12, numStartingQbs: 1, numStartingRbs: 2,
    numStartingWrs: 2, numStartingTes: 1, numFlex: 1, numBenchPlayers: 6,
  },
  boardSettings: {ranker: ThirdPartyRanker.CUSTOM, adpRanker: "ESPN"},
  currPick: 1,
  predNextTiers: {},
  rankingSummaries: [],
  onSelectPlayer: jest.fn(),
  onPurgePlayer: jest.fn(),
  setViewPlayerId: jest.fn(),
  draftView: "Edit Rankings",
  setDraftView: jest.fn(),
  sortOption: "Ranks",
  setSortOption: jest.fn(),
  highlightOption: "None",
  setHighlightOption: jest.fn(),
  isEditingCustomRanking: true,
  hasCustomRanking: true,
  canEditCustomRankings: true,
  onReorderPlayer: jest.fn(),
  onStartCustomRanking: jest.fn(),
  onFinishCustomRanking: jest.fn(),
  onUpdateTierBoundary: jest.fn(),
  onCancelCustomRanking: jest.fn(),
  rosters: [],
  playerLib: {},
  draftStarted: false,
  getDraftRoundForPickNum: jest.fn(() => [null]),
  viewPlayerId: null,
  draftHistory: [],
  viewRosterIdx: 0,
  draftCaptureState: "idle",
  activeDraftListenerTitle: null,
  draftSourceHealth: null,
  draftSourceHealthFreshness: "unknown",
  draftPersistence: {state: "idle"},
  onRetryDraftPersistence: jest.fn(),
  loadCurrentRankings: jest.fn(),
  rankings: {
    players: [], rankingsSummaries: [], cachedAt: "2026-08-15T00:00:00Z",
    editedAt: "", copiedRanker: ThirdPartyRanker.HARRIS,
  },
  latestRankings: null,
  removePlayerTargets: jest.fn(),
  replacePlayerTargets: jest.fn(),
  myPicks: [1, 24, 25],
  playerTargets: [],
  customAndLatestRankingsDiffs: {},
  onSyncPendingRankings: jest.fn(),
  onRevertPlayerToPreSync: jest.fn(),
  addPlayerTarget: jest.fn(),
  removePlayerTarget: jest.fn(),
  rankingProfileControls: controls,
})

describe("ranking profile visible authority controls", () => {
  beforeEach(() => jest.clearAllMocks())

  it("removes desktop and mobile legacy Save/Load/Delete controls and exposes canonical profile save", () => {
    render(<RankingsBoard {...props()} />)

    expect(screen.getByRole("button", {name: "Create profile"})).not.toBeNull()
    expect(screen.queryByRole("button", {name: "Save"})).toBeNull()
    expect(screen.queryByText("Manage Saved Rankings")).toBeNull()
    expect(screen.queryByText("Load Saved Rankings")).toBeNull()
    expect(screen.queryByText("Delete Saved Rankings")).toBeNull()

    fireEvent.click(screen.getByRole("button", {name: /Edits/}))
    expect(screen.queryByRole("button", {name: "Save"})).toBeNull()
    expect(screen.getAllByRole("button", {name: "Clear"})).toHaveLength(2)
  })

  it("routes desktop and mobile Clear through the same canonical-empty callback", () => {
    const controls = rankingProfileControls()
    const values = props(controls)
    render(<RankingsBoard {...values} />)

    fireEvent.click(screen.getByRole("button", {name: "Clear"}))
    fireEvent.click(screen.getByRole("button", {name: /Edits/}))
    fireEvent.click(screen.getAllByRole("button", {name: "Clear"})[1])

    expect(controls.clearLocal).toHaveBeenCalledTimes(2)
    expect(values.loadCurrentRankings).toHaveBeenCalledTimes(2)
    expect(toast.success).toHaveBeenCalledTimes(2)
  })

  it("does not reload or display success when canonical Clear fails", () => {
    const controls = rankingProfileControls()
    controls.clearLocal.mockImplementation(() => { throw new Error("storage denied") })
    const values = props(controls)
    render(<RankingsBoard {...values} />)

    fireEvent.click(screen.getByRole("button", {name: "Clear"}))

    expect(values.loadCurrentRankings).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith("storage denied")
  })
})
