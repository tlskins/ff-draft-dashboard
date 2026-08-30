import {
  cloudProfilePayloadsEqual,
  createCloudProfilePayload,
  decideCloudProfileSync,
  markerForRecord,
  readCloudProfileSyncMarker,
  writeCloudProfileSyncMarker,
  type UserDraftProfilePayload,
  type UserDraftProfileRecord,
} from "../behavior/cloudProfileSync"
import {validateRankingProfileV2} from "../behavior/rankingProfileV2"


const rankingProfile = (tier = 1) => validateRankingProfileV2({
  schema_version: 2,
  rebase_version: "profile_rebase_v1",
  scoring_type: "ppr",
  positions: {
    QB: [],
    RB: [{player_id: "rb-one", user_tier: tier}],
    WR: [],
    TE: [],
  },
  unresolved_players: [],
  provenance: {
    binding_state: "legacy_unbound",
    base_source_id: null,
    base_provider_id: null,
    source_observation_fingerprint: null,
    source_season: null,
    source_scoring_type: null,
    player_universe_fingerprint: null,
  },
})

const boundRankingProfile = () => validateRankingProfileV2({
  ...rankingProfile(),
  unresolved_players: [{
    player_id: "rb-missing",
    last_position: "RB",
    last_user_rank: 2,
    last_user_tier: 2,
    reason: "missing_from_target",
  }],
  provenance: {
    binding_state: "bound",
    base_source_id: "harris",
    base_provider_id: "harris-football",
    source_observation_fingerprint: "a".repeat(64),
    source_season: 2026,
    source_scoring_type: "ppr",
    player_universe_fingerprint: "b".repeat(64),
  },
})

const payload = (targetRound = 3): UserDraftProfilePayload =>
  createCloudProfilePayload({
    rankingProfile: rankingProfile(),
    targets: [{playerId: "rb-one", targetAsEarlyAsRound: targetRound}],
    sourceRanker: "Harris",
  })

const record = (
  profile: UserDraftProfilePayload,
  revision = 1,
  fingerprint = "a".repeat(64),
): UserDraftProfileRecord => ({
  schema_version: 1,
  season: 2026,
  revision,
  profile,
  content_fingerprint: fingerprint,
  last_mutation_id: `mutation-${revision}`,
  last_writer_device_id: "desktop",
  created_at: "2026-08-29T12:00:00Z",
  updated_at: "2026-08-29T12:00:00Z",
})

describe("cross-device cloud profile decisions", () => {
  it("retains conservative rank and tier authority for an adopted local profile", () => {
    const result = payload()
    expect(result.ranking_authority).toEqual({
      base_profile: null,
      rank_override_player_ids: ["rb-one"],
      tier_override_player_ids: ["rb-one"],
    })
    expect(result.targets).toEqual([{
      player_id: "rb-one",
      target_as_early_as_round: 3,
    }])
  })

  it("retains a valid baseline and every player for a bound local profile", () => {
    const profile = boundRankingProfile()
    const result = createCloudProfilePayload({
      rankingProfile: profile,
      targets: [],
      sourceRanker: "Harris",
    })

    expect(result.ranking_authority).toEqual({
      base_profile: profile,
      rank_override_player_ids: ["rb-missing", "rb-one"],
      tier_override_player_ids: ["rb-missing", "rb-one"],
    })
  })

  it("uploads the first device and adopts cloud state on an empty new device", () => {
    expect(decideCloudProfileSync({
      local: payload(), remote: null, marker: null,
    })).toEqual({action: "upload_local", expectedRevision: 0})

    const cloud = record(payload())
    const empty = createCloudProfilePayload({
      rankingProfile: null,
      targets: [],
      sourceRanker: "Harris",
    })
    expect(decideCloudProfileSync({local: empty, remote: cloud, marker: null})).toEqual({
      action: "apply_remote",
      record: cloud,
    })
  })

  it("does not silently replace two non-empty first-use profiles", () => {
    const cloud = record(payload(4))
    expect(decideCloudProfileSync({local: payload(3), remote: cloud, marker: null})).toEqual({
      action: "conflict",
      record: cloud,
    })
  })

  it("pushes a local-only edit and pulls a remote-only edit from a known base", () => {
    const baseRecord = record(payload(3), 1, "a".repeat(64))
    const marker = markerForRecord("alice", baseRecord)
    const unchangedRemote = record(payload(3), 1, "a".repeat(64))
    expect(decideCloudProfileSync({
      local: payload(2), remote: unchangedRemote, marker,
    })).toEqual({action: "upload_local", expectedRevision: 1})

    const changedRemote = record(payload(5), 2, "b".repeat(64))
    expect(decideCloudProfileSync({
      local: payload(3), remote: changedRemote, marker,
    })).toEqual({action: "apply_remote", record: changedRemote})
  })

  it("stops for explicit resolution when both devices changed", () => {
    const baseRecord = record(payload(3), 1, "a".repeat(64))
    const changedRemote = record(payload(5), 2, "b".repeat(64))
    expect(decideCloudProfileSync({
      local: payload(2),
      remote: changedRemote,
      marker: markerForRecord("alice", baseRecord),
    })).toEqual({action: "conflict", record: changedRemote})
  })

  it("stores only a validated per-user sync marker", () => {
    writeCloudProfileSyncMarker(localStorage, markerForRecord("alice", record(payload())))
    expect(readCloudProfileSyncMarker(localStorage, "alice")).toMatchObject({
      uid: "alice",
      revision: 1,
    })
    expect(readCloudProfileSyncMarker(localStorage, "bob")).toBeNull()
    localStorage.setItem("drafty.cloud-profile-sync.v1:alice:2026", "{")
    expect(readCloudProfileSyncMarker(localStorage, "alice")).toBeNull()
  })

  it("isolates markers by fantasy season", () => {
    writeCloudProfileSyncMarker(localStorage, markerForRecord("alice", record(payload())))
    expect(readCloudProfileSyncMarker(localStorage, "alice", 2026)).toMatchObject({season: 2026})
    expect(readCloudProfileSyncMarker(localStorage, "alice", 2027)).toBeNull()
  })

  it("compares payloads independently of object key order", () => {
    const original = payload()
    const reordered = JSON.parse(JSON.stringify(original)) as UserDraftProfilePayload
    reordered.targets = [...reordered.targets].reverse()
    expect(cloudProfilePayloadsEqual(original, reordered)).toBe(true)
  })
})
