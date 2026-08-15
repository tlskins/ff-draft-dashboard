import {
  createRankingProfileV2,
  createRankingProfileV2Revision,
  createRankingProfile,
  createRankingProfileRevision,
  listRankingProfilesV2,
  previewRankingProfileRebase,
  RankingProfileApiError,
  redoRankingProfile,
  redoRankingProfileV2,
  undoRankingProfile,
  undoRankingProfileV2,
} from "../behavior/api/rankingProfiles"
import type {
  RankingProfileRebasePreviewRequest,
  RankingProfileV2CreateRequest,
} from "../behavior/api/rankingProfiles"
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
  it("serializes canonical v2 create/list/read/revision/undo/redo without v1 snapshots", async () => {
    const snapshot: RankingProfileV2CreateRequest["snapshot"] = {
      schema_version: 2,
      rebase_version: "profile_rebase_v1",
      scoring_type: "ppr",
      positions: {QB: [], RB: [], WR: [], TE: []},
      unresolved_players: [{
        player_id: "missing-rb",
        last_position: "RB",
        last_user_rank: 1,
        last_user_tier: 1,
        reason: "missing_from_target",
      }],
      provenance: {
        binding_state: "bound",
        base_source_id: "espn",
        base_provider_id: "espn",
        source_observation_fingerprint: "a".repeat(64),
        source_season: 2026,
        source_scoring_type: "ppr",
        player_universe_fingerprint: "b".repeat(64),
      },
    }
    const profile = {id: "home", current_revision: 1, snapshot}
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => profile,
    })
    const options = {
      apiHost: "http://127.0.0.1:5000",
      fetcher: fetcher as unknown as typeof fetch,
    }
    const snapshotForRequest = profile.snapshot
    await createRankingProfileV2({name: "Home", snapshot: snapshotForRequest}, options)
    await listRankingProfilesV2(options)
    await createRankingProfileV2Revision("home", {
      expected_revision: 1,
      snapshot: snapshotForRequest,
    }, options)
    await undoRankingProfileV2("home", 2, options)
    await redoRankingProfileV2("home", 1, options)

    expect(fetcher.mock.calls.map(call => call[0])).toEqual([
      "http://127.0.0.1:5000/v1/ranking-profiles-v2",
      "http://127.0.0.1:5000/v1/ranking-profiles-v2",
      "http://127.0.0.1:5000/v1/ranking-profiles-v2/home/revisions",
      "http://127.0.0.1:5000/v1/ranking-profiles-v2/home/undo",
      "http://127.0.0.1:5000/v1/ranking-profiles-v2/home/redo",
    ])
    expect(JSON.stringify(fetcher.mock.calls[0][1])).not.toContain("schema_version\\\":1")
    expect(fetcher.mock.calls[2][1]?.body).toContain("missing-rb")
  })

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
