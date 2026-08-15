import { act, renderHook, waitFor } from "@testing-library/react"

import fixture from "./fixtures/rankingProfileRebaseV1.json"
import {
  RankingProfileApiError,
  createRankingProfileV2Revision,
  listRankingProfilesV2,
  redoRankingProfileV2,
  undoRankingProfileV2,
} from "../behavior/api/rankingProfiles"
import { useRankingProfiles } from "../behavior/hooks/useRankingProfiles"
import {
  LEGACY_RANKING_PROFILE_STORAGE_KEY,
  RANKING_PROFILE_V2_AUTHORITY_KEY,
  RANKING_PROFILE_V2_STORAGE_KEY,
  runRankingProfileStartupMigration,
} from "../behavior/rankingProfileStorage"
import { validateRankingProfileV2 } from "../behavior/rankingProfileV2"
import { FantasyPosition, ThirdPartyRanker } from "../types"


jest.mock("../behavior/api/rankingProfiles", () => {
  const actual = jest.requireActual("../behavior/api/rankingProfiles")
  return {
    ...actual,
    createRankingProfileV2: jest.fn(),
    createRankingProfileV2Revision: jest.fn(),
    listRankingProfilesV2: jest.fn(),
    redoRankingProfileV2: jest.fn(),
    undoRankingProfileV2: jest.fn(),
  }
})

const apiList = listRankingProfilesV2 as jest.MockedFunction<typeof listRankingProfilesV2>
const apiRevision = createRankingProfileV2Revision as jest.MockedFunction<typeof createRankingProfileV2Revision>
const apiUndo = undoRankingProfileV2 as jest.MockedFunction<typeof undoRankingProfileV2>
const apiRedo = redoRankingProfileV2 as jest.MockedFunction<typeof redoRankingProfileV2>

const snapshot = validateRankingProfileV2(fixture.rebase.expected_profile)
const priorSnapshot = validateRankingProfileV2(fixture.rebase.profile)
const profile = (revision: number, value = snapshot) => ({
  id: "home",
  name: "Home",
  source_ranker: "Harris",
  current_revision: revision,
  max_revision: 3,
  can_undo: revision > 1,
  can_redo: revision < 3,
  snapshot: value,
  history: [],
  created_at: "2026-08-15T00:00:00Z",
  updated_at: `2026-08-15T00:00:0${revision}Z`,
}) as never

const options = (): any => ({
  playerRanks: {
    QB: [], RB: [], WR: [], TE: [], Purge: [],
    availPlayersByOverallRank: [], availPlayersByAdp: [],
  } as never,
  rankings: {
    players: [], rankingsSummaries: [], cachedAt: "2026-08-15T00:00:00Z",
    editedAt: "", copiedRanker: ThirdPartyRanker.HARRIS,
    settings: {
      ppr: true, numTeams: 12, numStartingQbs: 1, numStartingRbs: 2,
      numStartingWrs: 2, numStartingTes: 1, numFlex: 1, numBenchPlayers: 6,
    },
  },
  settings: {
    ppr: true, numTeams: 12, numStartingQbs: 1, numStartingRbs: 2,
    numStartingWrs: 2, numStartingTes: 1, numFlex: 1, numBenchPlayers: 6,
  },
  boardSettings: {ranker: ThirdPartyRanker.HARRIS, adpRanker: "ESPN"},
  onLoadPlayers: jest.fn(),
  onSetRanker: jest.fn(),
  onLocalProfileCommitted: jest.fn(),
})

const canonicalBytes = () => ({
  profile: localStorage.getItem(RANKING_PROFILE_V2_STORAGE_KEY),
  authority: localStorage.getItem(RANKING_PROFILE_V2_AUTHORITY_KEY),
})

describe("useRankingProfiles canonical browser commits", () => {
  const originalApiHost = process.env.NEXT_PUBLIC_API_HOST

  beforeEach(() => {
    localStorage.clear()
    jest.clearAllMocks()
    process.env.NEXT_PUBLIC_API_HOST = "http://127.0.0.1:5000"
    apiList.mockResolvedValue({profiles: [profile(1)]})
  })

  afterAll(() => {
    process.env.NEXT_PUBLIC_API_HOST = originalApiHost
  })

  it("commits selection, undo, and redo responses before applying them", async () => {
    apiUndo.mockResolvedValue(profile(2, priorSnapshot))
    apiRedo.mockResolvedValue(profile(3, snapshot))
    const callbacks = options()
    const {result} = renderHook(() => useRankingProfiles(callbacks))
    await waitFor(() => expect(result.current.profiles).toHaveLength(1))

    act(() => result.current.select("home"))
    expect(runRankingProfileStartupMigration(localStorage, [], "ppr"))
      .toMatchObject({status: "already_current", profile: snapshot})

    await act(async () => { await result.current.undo() })
    expect(runRankingProfileStartupMigration(localStorage, [], "ppr"))
      .toMatchObject({status: "already_current", profile: priorSnapshot})

    await act(async () => { await result.current.redo() })
    expect(runRankingProfileStartupMigration(localStorage, [], "ppr"))
      .toMatchObject({status: "already_current", profile: snapshot})
    expect(callbacks.onLoadPlayers).toHaveBeenCalledTimes(3)
  })

  it.each([409, 422])("leaves browser authority byte-identical after API rejection %s", async status => {
    apiRevision.mockRejectedValue(new RankingProfileApiError("rejected", status, "revision_conflict"))
    const {result} = renderHook(() => useRankingProfiles(options()))
    await waitFor(() => expect(result.current.profiles).toHaveLength(1))
    act(() => result.current.select("home"))
    const before = canonicalBytes()

    await expect(act(async () => { await result.current.save("Home") })).rejects.toMatchObject({status})
    expect(canonicalBytes()).toEqual(before)
  })

  it("commits the exact canonical revision returned by a successful API save", async () => {
    apiRevision.mockResolvedValue(profile(2, priorSnapshot))
    const {result} = renderHook(() => useRankingProfiles(options()))
    await waitFor(() => expect(result.current.profiles).toHaveLength(1))
    act(() => result.current.select("home"))

    await act(async () => { await result.current.save("Home") })

    expect(runRankingProfileStartupMigration(localStorage, [], "ppr"))
      .toMatchObject({status: "already_current", profile: priorSnapshot})
    expect(result.current.activeProfile).toMatchObject({current_revision: 2, snapshot: priorSnapshot})
  })

  it("surfaces browser commit failure after an API undo and does not apply the response", async () => {
    apiUndo.mockResolvedValue(profile(2, priorSnapshot))
    const callbacks = options()
    const {result} = renderHook(() => useRankingProfiles(callbacks))
    await waitFor(() => expect(result.current.profiles).toHaveLength(1))
    act(() => result.current.select("home"))
    const before = canonicalBytes()
    const originalSetItem = Storage.prototype.setItem
    const setItem = jest.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      if (key === RANKING_PROFILE_V2_AUTHORITY_KEY) throw new Error("quota denied")
      return originalSetItem.call(this, key, value)
    })

    await expect(act(async () => { await result.current.undo() })).rejects.toThrow("Browser canonical commit failed")
    setItem.mockRestore()
    expect(canonicalBytes()).toEqual(before)
    expect(callbacks.onLoadPlayers).toHaveBeenCalledTimes(1)
  })

  it("uses canonical storage for local fallback without rewriting retained legacy evidence", async () => {
    process.env.NEXT_PUBLIC_API_HOST = ""
    const legacy = JSON.stringify({
      players: [{id: "rb-1", position: FantasyPosition.RUNNING_BACK, ranks: {Custom: {pprPositionRank: 1, pprPositionTier: {tierNumber: 1}}}}],
      rankingsSummaries: [], cachedAt: "x", editedAt: "y", copiedRanker: "Harris", settings: {},
    })
    localStorage.setItem(LEGACY_RANKING_PROFILE_STORAGE_KEY, legacy)
    const migrated = runRankingProfileStartupMigration(localStorage, [{id: "rb-1", position: "RB"}], "ppr")
    if (migrated.status !== "migrated") throw new Error("expected migration")
    const callbacks = options() as any
    callbacks.localProfile = migrated.profile
    const {result} = renderHook(() => useRankingProfiles(callbacks))

    await expect(act(async () => { await result.current.save("Local") })).rejects.toThrow("Saved in this browser")
    expect(localStorage.getItem(LEGACY_RANKING_PROFILE_STORAGE_KEY)).toBe(legacy)
    expect(runRankingProfileStartupMigration(localStorage, [], "ppr").status).toBe("already_current")
  })
})
