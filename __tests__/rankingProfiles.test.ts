import {
  createRankingProfile,
  createRankingProfileRevision,
  previewRankingProfileRebase,
  RankingProfileApiError,
  redoRankingProfile,
  undoRankingProfile,
} from "../behavior/api/rankingProfiles"
import type {RankingProfileRebasePreviewRequest} from "../behavior/api/rankingProfiles"
import rebaseFixture from "./fixtures/rankingProfileRebaseV1.json"
import {
  applyRankingProfileSnapshot,
  createRankingProfileSnapshot,
} from "../behavior/hooks/useRankingProfiles"
import { PlayerRanks } from "../behavior/draft"
import { getProjectedTier } from "../behavior/draft"
import {
  DataRanker,
  FantasyPosition,
  FantasySettings,
  NFLTeam,
  Player,
  Rankings,
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

const player = (
  id: string,
  rank: number,
  tierNumber: number,
): Player => ({
  id,
  firstName: id,
  lastName: "Player",
  fullName: `${id} Player`,
  team: NFLTeam.ARI,
  position: FantasyPosition.RUNNING_BACK,
  ranks: {
    [ThirdPartyRanker.CUSTOM]: {
      playerId: id,
      ranker: ThirdPartyRanker.CUSTOM,
      position: FantasyPosition.RUNNING_BACK,
      standardPositionRank: rank,
      pprPositionRank: rank,
      pprPositionTier: {
        tierNumber,
        upperLimitPlayerIdx: 0,
        upperLimitValue: 20,
        lowerLimitPlayerIdx: 1,
        lowerLimitValue: 15,
      },
    },
  },
})

describe("ranking profile contract adapter", () => {
  it("calls create, revision, undo, and redo endpoints", async () => {
    const profile = {
      id: "home",
      current_revision: 1,
    }
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => profile,
    })
    const options = {
      apiHost: "http://127.0.0.1:5000/",
      fetcher: fetcher as unknown as typeof fetch,
    }
    const snapshot = {
      schema_version: 1 as const,
      positions: {QB: [], RB: [], WR: [], TE: []},
    }

    await createRankingProfile({
      name: "Home",
      scoring_profile: "ppr",
      snapshot,
    }, options)
    await createRankingProfileRevision("home", {
      expected_revision: 1,
      snapshot,
    }, options)
    await previewRankingProfileRebase("home/id", {
      expected_revision: 1,
      target: rebaseFixture.rebase.target,
    } as unknown as RankingProfileRebasePreviewRequest, options)
    await undoRankingProfile("home", 2, options)
    await redoRankingProfile("home", 1, options)

    expect(fetcher.mock.calls.map(call => call[0])).toEqual([
      "http://127.0.0.1:5000/v1/ranking-profiles",
      "http://127.0.0.1:5000/v1/ranking-profiles/home/revisions",
      "http://127.0.0.1:5000/v1/ranking-profiles/home%2Fid/rebase-preview",
      "http://127.0.0.1:5000/v1/ranking-profiles/home/undo",
      "http://127.0.0.1:5000/v1/ranking-profiles/home/redo",
    ])
  })

  it("preserves machine-readable preview error codes", async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: "Target does not match server evidence",
        code: "source_records_mismatch",
      }),
    })
    await expect(previewRankingProfileRebase("home", {
      expected_revision: 1,
      target: rebaseFixture.rebase.target,
    } as unknown as RankingProfileRebasePreviewRequest, {
      apiHost: "http://127.0.0.1:5000",
      fetcher: fetcher as unknown as typeof fetch,
    })).rejects.toMatchObject({
      name: "RankingProfileApiError",
      status: 400,
      code: "source_records_mismatch",
    } satisfies Partial<RankingProfileApiError>)
  })
})

describe("ranking profile snapshots", () => {
  it("normalizes user tiers and restores positional order", () => {
    const first = player("rb-1", 1, 2)
    const second = player("rb-2", 2, 4)
    const playerRanks = {
      QB: [],
      RB: [first, second],
      WR: [],
      TE: [],
      Purge: [],
      availPlayersByOverallRank: [],
      availPlayersByAdp: [],
    } as PlayerRanks

    const snapshot = createRankingProfileSnapshot(playerRanks, settings)
    expect(snapshot.positions.RB).toEqual([
      {player_id: "rb-1", rank: 1, user_tier: 1},
      {player_id: "rb-2", rank: 2, user_tier: 2},
    ])

    const rankings: Rankings = {
      players: [first, second],
      rankingsSummaries: [],
      cachedAt: "2026-07-30T00:00:00Z",
      editedAt: "",
      settings,
    }
    const restored = applyRankingProfileSnapshot({
      id: "home",
      name: "Home",
      scoring_profile: "ppr",
      source_ranker: "Custom",
      projection_tier_method: "standard_deviation_v1",
      current_revision: 1,
      max_revision: 1,
      can_undo: false,
      can_redo: false,
      snapshot: {
        ...snapshot,
        positions: {
          ...snapshot.positions,
          RB: [
            {player_id: "rb-2", rank: 1, user_tier: 1},
            {player_id: "rb-1", rank: 2, user_tier: 2},
          ],
        },
      },
      history: [],
      created_at: "2026-07-30T00:00:00Z",
      updated_at: "2026-07-30T00:00:00Z",
    }, rankings, settings)

    expect(
      restored.players.find(candidate => candidate.id === "rb-2")
        ?.ranks.Custom?.pprPositionRank,
    ).toBe(1)
    expect(
      restored.players.find(candidate => candidate.id === "rb-1")
        ?.ranks.Custom?.pprPositionTier?.tierNumber,
    ).toBe(2)
  })

  it("maps projection tiers by position rank, not user tier number", () => {
    const ranked = player("rb-2", 2, 7)
    const projected = getProjectedTier(
      ranked,
      ThirdPartyRanker.CUSTOM,
      DataRanker.LAST_SSN_PPG,
      settings,
      [{
        ranker: DataRanker.LAST_SSN_PPG,
        ppr: true,
        replacementLevels: {} as never,
        stdDevs: {} as never,
        tiers: {
          [FantasyPosition.RUNNING_BACK]: [{
            tierNumber: 2,
            upperLimitPlayerIdx: 1,
            upperLimitValue: 18,
            lowerLimitPlayerIdx: 2,
            lowerLimitValue: 15,
          }],
        } as never,
      }],
    )

    expect(projected?.tierNumber).toBe(2)
  })
})
