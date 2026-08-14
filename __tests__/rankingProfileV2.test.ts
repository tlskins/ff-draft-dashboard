import fixture from "./fixtures/rankingProfileRebaseV1.json"
import {
  MAX_PROFILE_PLAYERS,
  RankingProfileV2ValidationError,
  adaptLegacyRankingsToProfileV2,
  adaptPortableV1ToProfileV2,
  playerUniverseFingerprint,
  previewProfileRebase,
  profileFingerprint,
  validateRankingProfileV2,
} from "../behavior/rankingProfileV2"

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

describe("ranking profile v2 fixture parity", () => {
  it("preserves user order and tiers when provider ranks change", () => {
    expect(MAX_PROFILE_PLAYERS).toBe(fixture.limits.max_total_players)
    const testCase = fixture.unchanged_rank_change
    const first = previewProfileRebase(testCase.profile, testCase.target)
    const second = previewProfileRebase(testCase.profile, testCase.target)

    expect(first.profile).toEqual(testCase.expected_profile)
    expect(first).toEqual(second)
    expect({
      input_profile_fingerprint: first.input_profile_fingerprint,
      output_profile_fingerprint: first.output_profile_fingerprint,
      preview_key: first.preview_key,
    }).toEqual(testCase.expected_fingerprints)
    expect(first.logically_idempotent).toBe(true)
    expect(first.input_profile_fingerprint).toMatch(/^[a-f0-9]{64}$/)
    expect(first.output_profile_fingerprint).toMatch(/^[a-f0-9]{64}$/)
    expect(first.preview_key).toMatch(/^[a-f0-9]{64}$/)
  })

  it("appends additions, compacts tiers, and retains tombstones", () => {
    const testCase = fixture.rebase
    const preview = previewProfileRebase(testCase.profile, testCase.target)

    expect(preview.profile).toEqual(testCase.expected_profile)
    expect(preview.player_ids).toEqual(testCase.expected_player_ids)
    expect(preview.counts).toEqual(testCase.expected_counts)
    expect(preview.would_change).toBe(true)
    expect(preview.profile.positions.RB.map(row => row.player_id)).toEqual([
      "r1", "r3", "r4",
    ])
    expect(preview.profile.unresolved_players[0].player_id).toBe("x")
    expect({
      input_profile_fingerprint: preview.input_profile_fingerprint,
      output_profile_fingerprint: preview.output_profile_fingerprint,
      preview_key: preview.preview_key,
    }).toEqual(testCase.expected_fingerprints)
  })

  it("computes the separate player-universe fingerprint", () => {
    expect(playerUniverseFingerprint(fixture.rebase.target.players)).toBe(
      fixture.rebase.target.player_universe_fingerprint,
    )
    expect(profileFingerprint(fixture.rebase.profile)).toMatch(/^[a-f0-9]{64}$/)
  })

  it("puts multiple same-position additions in one tail tier", () => {
    const testCase = fixture.unchanged_rank_change
    const target = copy(testCase.target)
    target.players.push(
      {player_id: "r3", position: "RB", overall_rank: 101},
      {player_id: "r4", position: "RB", overall_rank: 102},
    )
    const universe = playerUniverseFingerprint(target.players)
    target.player_universe_fingerprint = universe
    target.expected_player_universe_fingerprint = universe
    expect(previewProfileRebase(testCase.profile, target).profile.positions.RB.slice(-2))
      .toEqual([
        {player_id: "r3", user_tier: 3},
        {player_id: "r4", user_tier: 3},
      ])

    target.players[target.players.length - 1].overall_rank = 101
    expect(() => previewProfileRebase(testCase.profile, target))
      .toThrow(RankingProfileV2ValidationError)
  })

  it("binds target source metadata into the preview key", () => {
    const testCase = fixture.unchanged_rank_change
    const first = previewProfileRebase(testCase.profile, testCase.target)
    const changed = copy(testCase.target)
    changed.source_id = "different-source"
    expect(previewProfileRebase(testCase.profile, changed).preview_key)
      .not.toBe(first.preview_key)
  })

  it("binds rank-bearing targets whenever rank order changes output", () => {
    const testCase = fixture.unchanged_rank_change
    const target = copy(testCase.target)
    target.players.push(
      {player_id: "r3", position: "RB", overall_rank: 101},
      {player_id: "r4", position: "RB", overall_rank: 102},
    )
    const universe = playerUniverseFingerprint(target.players)
    target.player_universe_fingerprint = universe
    target.expected_player_universe_fingerprint = universe
    const first = previewProfileRebase(testCase.profile, target)
    target.players[target.players.length - 2].overall_rank = 102
    target.players[target.players.length - 1].overall_rank = 101
    const second = previewProfileRebase(testCase.profile, target)
    expect(first.profile).not.toEqual(second.profile)
    expect(first.preview_key).not.toBe(second.preview_key)
  })

  it("enforces one total 500-player bound on inputs and outputs", () => {
    const testCase = fixture.unchanged_rank_change
    const profile = copy(testCase.profile) as any
    profile.positions = {
      QB: Array.from({length: 500}, (_, index) => ({
        player_id: `q-${index}`, user_tier: 1,
      })),
      RB: [
        {player_id: "overflow-1", user_tier: 1},
        {player_id: "overflow-2", user_tier: 1},
      ],
      WR: [], TE: [],
    }
    profile.unresolved_players = []
    expect(() => validateRankingProfileV2(profile)).toThrow(/at most 500 total/)

    profile.positions.RB = []
    const target = copy(testCase.target) as any
    target.players = [
      ...Array.from({length: 499}, (_, index) => ({
        player_id: `q-${index}`, position: "QB", overall_rank: index + 1,
      })),
      {player_id: "q-new", position: "QB", overall_rank: 500},
    ]
    const universe = playerUniverseFingerprint(target.players)
    target.player_universe_fingerprint = universe
    target.expected_player_universe_fingerprint = universe
    expect(() => previewProfileRebase(profile, target)).toThrow(/at most 500 total/)
  })

  it("adapts portable v1 without source inference or silent skips", () => {
    const testCase = fixture.legacy_portable_v1
    const profile = adaptPortableV1ToProfileV2(
      testCase.snapshot,
      testCase.trusted_universe,
    )
    const active = Object.values(profile.positions).flat().map(row => row.player_id).sort()

    expect(active).toEqual([...testCase.expected_active_player_ids].sort())
    expect(profile.unresolved_players.map(row => row.player_id)).toEqual(
      testCase.expected_unresolved_player_ids,
    )
    expect(profile.provenance.binding_state).toBe(testCase.expected_binding_state)
    expect(profile.provenance.base_source_id).toBeNull()
    expect(profile.positions.RB).toEqual([{player_id: "r1", user_tier: 1}])
  })

  it("adapts a full legacy Rankings object using Custom order", () => {
    const rankings = {
      players: [
        {id: "r1", position: "RB", ranks: {Custom: {pprPositionRank: 2, pprPositionTier: {tierNumber: 2}}}},
        {id: "r2", position: "RB", ranks: {Custom: {pprPositionRank: 1, pprPositionTier: {tierNumber: 1}}}},
      ],
      rankingsSummaries: [], cachedAt: "x", editedAt: "", settings: {},
    }
    const profile = adaptLegacyRankingsToProfileV2(rankings, [
      {player_id: "r1", position: "RB", overall_rank: 1},
      {player_id: "r2", position: "WR", overall_rank: 2},
    ], "ppr")

    expect(profile.positions.RB).toEqual([{player_id: "r1", user_tier: 1}])
    expect(profile.unresolved_players).toEqual([{
      player_id: "r2", last_position: "RB", last_user_rank: 1,
      last_user_tier: 1, reason: "position_changed",
    }])
  })

  it.each([
    ["duplicate target", (target: any) => { target.players = fixture.errors.duplicate_target_player }],
    ["scoring conflict", (target: any) => { target.scoring_type = fixture.errors.scoring_conflict }],
    ["source fingerprint conflict", (target: any) => { target.expected_source_observation_fingerprint = fixture.errors.source_fingerprint_conflict }],
    ["universe fingerprint conflict", (target: any) => { target.expected_player_universe_fingerprint = fixture.errors.universe_fingerprint_conflict }],
  ])("rejects %s", (_name, mutate) => {
    const target = copy(fixture.unchanged_rank_change.target)
    mutate(target)
    expect(() => previewProfileRebase(fixture.unchanged_rank_change.profile, target))
      .toThrow(RankingProfileV2ValidationError)
  })

  it("fails closed for malformed v2 and hostile objects", () => {
    expect(() => adaptPortableV1ToProfileV2(
      {schema_version: 2, positions: {}}, [],
    )).toThrow(/must not fall back/)
    expect(() => validateRankingProfileV2(Object.create({schema_version: 2})))
      .toThrow(RankingProfileV2ValidationError)
    const accessor = copy(fixture.rebase.profile) as Record<string, unknown>
    Object.defineProperty(accessor, "scoring_type", {get: () => "ppr", enumerable: true})
    expect(() => validateRankingProfileV2(accessor)).toThrow(/accessors/)
    const proxy = new Proxy({}, {getPrototypeOf: () => { throw new Error("trap") }})
    expect(() => validateRankingProfileV2(proxy)).toThrow(RankingProfileV2ValidationError)
    expect(() => validateRankingProfileV2(JSON.parse(
      '{"schema_version":2,"__proto__":{},"rebase_version":"profile_rebase_v1","scoring_type":"ppr","positions":{},"unresolved_players":[],"provenance":{}}',
    ))).toThrow(RankingProfileV2ValidationError)
  })
})
