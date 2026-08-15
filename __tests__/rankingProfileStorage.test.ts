import fixture from "./fixtures/rankingProfileRebaseV1.json"
import {
  LEGACY_RANKING_PROFILE_STORAGE_KEY,
  loadStoredRankingProfileV2,
  migrateRankingProfileStorage,
  planRankingProfileStorageMigration,
  RANKING_PROFILE_V2_BACKUP_KEY,
  RANKING_PROFILE_V2_STORAGE_KEY,
  RankingProfileStorageAdapter,
  restoreRankingProfileStorageBackup,
} from "../behavior/rankingProfileStorage"


class MemoryStorage implements RankingProfileStorageAdapter {
  constructor(
    protected readonly values: Map<string, string> = new Map(),
  ) {}

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }

  removeItem(key: string) {
    this.values.delete(key)
  }

  sharedValues() {
    return this.values
  }
}

class InterruptingStorage extends MemoryStorage {
  private interrupted = false

  setItem(key: string, value: string) {
    super.setItem(key, value)
    if (key === RANKING_PROFILE_V2_STORAGE_KEY && !this.interrupted) {
      this.interrupted = true
      throw new Error("simulated interrupted destination write")
    }
  }
}

class FailingReadStorage extends MemoryStorage {
  constructor(values: Map<string, string>, private readonly failingKey: string) {
    super(values)
  }

  getItem(key: string) {
    if (key === this.failingKey) throw new Error("simulated rollback read failure")
    return super.getItem(key)
  }
}

class FailingRollbackWriteStorage extends MemoryStorage {
  removeItem(key: string) {
    if (key === RANKING_PROFILE_V2_STORAGE_KEY) {
      throw new Error("simulated rollback write failure")
    }
    super.removeItem(key)
  }
}

const portableOptions = {
  legacy_format: "portable_v1" as const,
  trusted_universe: fixture.legacy_portable_v1.trusted_universe,
}

describe("restart-safe ranking profile v2 browser migration", () => {
  it("migrates valid portable v1 without losing order, tiers, tombstones, or provenance", () => {
    const legacyValue = JSON.stringify(fixture.legacy_portable_v1.snapshot)
    const storage = new MemoryStorage(new Map([
      [LEGACY_RANKING_PROFILE_STORAGE_KEY, legacyValue],
    ]))

    const result = migrateRankingProfileStorage(storage, portableOptions)

    expect(result.status).toBe("migrated")
    if (result.status !== "migrated") throw new Error("expected migration")
    expect(result.profile.positions.QB).toEqual([{player_id: "q1", user_tier: 1}])
    expect(result.profile.positions.RB).toEqual([{player_id: "r1", user_tier: 1}])
    expect(result.profile.positions.WR).toEqual([{player_id: "w1", user_tier: 1}])
    expect(result.profile.unresolved_players).toEqual([{
      player_id: "unknown-rb",
      last_position: "RB",
      last_user_rank: 1,
      last_user_tier: 1,
      reason: "legacy_unknown",
    }])
    expect(result.profile.provenance).toEqual({
      binding_state: "legacy_unbound",
      base_source_id: null,
      base_provider_id: null,
      source_observation_fingerprint: null,
      source_season: null,
      source_scoring_type: null,
      player_universe_fingerprint: null,
    })
    expect(storage.getItem(LEGACY_RANKING_PROFILE_STORAGE_KEY)).toBe(legacyValue)
    expect(storage.getItem(RANKING_PROFILE_V2_BACKUP_KEY)).not.toBeNull()

    // A new adapter over the same durable values simulates a browser restart.
    const restarted = new MemoryStorage(storage.sharedValues())
    expect(loadStoredRankingProfileV2(restarted)).toEqual(result.profile)

    const repeated = migrateRankingProfileStorage(restarted, portableOptions)
    expect(repeated.status).toBe("already_current")
    if (repeated.status !== "already_current") throw new Error("expected idempotency")
    expect(repeated.profile).toEqual(result.profile)
  })

  it("migrates the full legacy browser Rankings shape using Custom order", () => {
    const legacyRankings = {
      players: [
        {id: "r1", position: "RB", ranks: {Custom: {pprPositionRank: 2, pprPositionTier: {tierNumber: 2}}}},
        {id: "moved", position: "RB", ranks: {Custom: {pprPositionRank: 1, pprPositionTier: {tierNumber: 1}}}},
        {id: "r3", position: "RB", ranks: {Custom: {pprPositionRank: 3, pprPositionTier: {tierNumber: 2}}}},
      ],
      rankingsSummaries: [], cachedAt: "x", editedAt: "y", settings: {}, copiedRanker: "Harris",
    }
    const plan = planRankingProfileStorageMigration(JSON.stringify(legacyRankings), {
      legacy_format: "full_rankings_v1",
      scoring_type: "ppr",
      trusted_universe: [
        {player_id: "r1", position: "RB", overall_rank: 1},
        {player_id: "moved", position: "WR", overall_rank: 2},
        {player_id: "r3", position: "RB", overall_rank: 3},
      ],
    })

    expect(plan.status).toBe("ready")
    if (plan.status !== "ready") throw new Error("expected migration plan")
    expect(plan.profile.positions.RB).toEqual([
      {player_id: "r1", user_tier: 1},
      {player_id: "r3", user_tier: 1},
    ])
    expect(plan.profile.unresolved_players).toEqual([{
      player_id: "moved",
      last_position: "RB",
      last_user_rank: 1,
      last_user_tier: 1,
      reason: "position_changed",
    }])
  })

  it("rejects malformed claimed v2 without retrying it as legacy", () => {
    const claimedV2 = {
      ...fixture.legacy_portable_v1.snapshot,
      schema_version: 2,
    }
    const plan = planRankingProfileStorageMigration(
      JSON.stringify(claimedV2),
      portableOptions,
    )

    expect(plan).toMatchObject({
      status: "rejected",
      evidence: {code: "malformed_claimed_v2", source_format: "profile_v2"},
    })
  })

  it("fails closed for corrupt or unsupported source data without any write", () => {
    for (const source of ["{bad", JSON.stringify({schema_version: 3})]) {
      const storage = new MemoryStorage(new Map([
        [LEGACY_RANKING_PROFILE_STORAGE_KEY, source],
      ]))
      const result = migrateRankingProfileStorage(storage, portableOptions)

      expect(result.status).toBe("rejected")
      expect(storage.getItem(LEGACY_RANKING_PROFILE_STORAGE_KEY)).toBe(source)
      expect(storage.getItem(RANKING_PROFILE_V2_STORAGE_KEY)).toBeNull()
      expect(storage.getItem(RANKING_PROFILE_V2_BACKUP_KEY)).toBeNull()
    }
  })

  it("preserves the prior value across an interrupted destination write", () => {
    const source = JSON.stringify(fixture.legacy_portable_v1.snapshot)
    const storage = new InterruptingStorage(new Map([
      [LEGACY_RANKING_PROFILE_STORAGE_KEY, source],
    ]))

    const result = migrateRankingProfileStorage(storage, portableOptions)

    expect(result).toMatchObject({
      status: "rejected",
      evidence: {code: "destination_write_failed"},
    })
    expect(storage.getItem(LEGACY_RANKING_PROFILE_STORAGE_KEY)).toBe(source)
    expect(storage.getItem(RANKING_PROFILE_V2_STORAGE_KEY)).toBeNull()
    expect(storage.getItem(RANKING_PROFILE_V2_BACKUP_KEY)).not.toBeNull()
  })

  it("refuses to replace corrupt or divergent existing v2 data", () => {
    const source = JSON.stringify(fixture.legacy_portable_v1.snapshot)
    const corrupt = "not-json"
    const storage = new MemoryStorage(new Map([
      [LEGACY_RANKING_PROFILE_STORAGE_KEY, source],
      [RANKING_PROFILE_V2_STORAGE_KEY, corrupt],
    ]))

    const result = migrateRankingProfileStorage(storage, portableOptions)

    expect(result).toMatchObject({
      status: "rejected",
      evidence: {code: "destination_invalid"},
    })
    expect(storage.getItem(RANKING_PROFILE_V2_STORAGE_KEY)).toBe(corrupt)
    expect(storage.getItem(RANKING_PROFILE_V2_BACKUP_KEY)).toBeNull()
  })

  it("retains a usable rollback boundary after a successful migration", () => {
    const source = JSON.stringify(fixture.legacy_portable_v1.snapshot)
    const storage = new MemoryStorage(new Map([
      [LEGACY_RANKING_PROFILE_STORAGE_KEY, source],
    ]))
    expect(migrateRankingProfileStorage(storage, portableOptions).status).toBe("migrated")

    expect(restoreRankingProfileStorageBackup(storage)).toMatchObject({
      status: "restored",
      evidence: {code: "rollback_restored"},
    })
    expect(storage.getItem(LEGACY_RANKING_PROFILE_STORAGE_KEY)).toBe(source)
    expect(storage.getItem(RANKING_PROFILE_V2_STORAGE_KEY)).toBeNull()

    expect(restoreRankingProfileStorageBackup(storage)).toMatchObject({
      status: "already_restored",
      evidence: {code: "rollback_already_restored"},
    })
  })

  it("rejects rollback after the legacy source changes and makes zero writes", () => {
    const source = JSON.stringify(fixture.legacy_portable_v1.snapshot)
    const storage = new MemoryStorage(new Map([
      [LEGACY_RANKING_PROFILE_STORAGE_KEY, source],
    ]))
    expect(migrateRankingProfileStorage(storage, portableOptions).status).toBe("migrated")
    storage.setItem(LEGACY_RANKING_PROFILE_STORAGE_KEY, "newer-user-source")
    const before = new Map(storage.sharedValues())

    expect(restoreRankingProfileStorageBackup(storage)).toMatchObject({
      status: "rejected",
      evidence: {code: "rollback_conflict"},
    })
    expect(storage.sharedValues()).toEqual(before)
  })

  it("rejects rollback after the v2 destination changes and makes zero writes", () => {
    const source = JSON.stringify(fixture.legacy_portable_v1.snapshot)
    const storage = new MemoryStorage(new Map([
      [LEGACY_RANKING_PROFILE_STORAGE_KEY, source],
    ]))
    expect(migrateRankingProfileStorage(storage, portableOptions).status).toBe("migrated")
    storage.setItem(RANKING_PROFILE_V2_STORAGE_KEY, "newer-user-destination")
    const before = new Map(storage.sharedValues())

    expect(restoreRankingProfileStorageBackup(storage)).toMatchObject({
      status: "rejected",
      evidence: {code: "rollback_conflict"},
    })
    expect(storage.sharedValues()).toEqual(before)
  })

  it("rejects malformed rollback evidence without touching stored data", () => {
    for (const malformed of [
      "{bad",
      JSON.stringify({
        schema: "drafty.ranking-profile-v2-migration-backup",
        version: 1,
      }),
    ]) {
      const storage = new MemoryStorage(new Map([
        [LEGACY_RANKING_PROFILE_STORAGE_KEY, "current-source"],
        [RANKING_PROFILE_V2_STORAGE_KEY, "current-destination"],
        [RANKING_PROFILE_V2_BACKUP_KEY, malformed],
      ]))
      const before = new Map(storage.sharedValues())

      expect(restoreRankingProfileStorageBackup(storage)).toMatchObject({
        status: "rejected",
        evidence: {code: "rollback_invalid_backup"},
      })
      expect(storage.sharedValues()).toEqual(before)
    }
  })

  it("fails closed on rollback storage reads and writes without losing data", () => {
    const source = JSON.stringify(fixture.legacy_portable_v1.snapshot)
    const migrated = new MemoryStorage(new Map([
      [LEGACY_RANKING_PROFILE_STORAGE_KEY, source],
    ]))
    expect(migrateRankingProfileStorage(migrated, portableOptions).status).toBe("migrated")

    const readValues = new Map(migrated.sharedValues())
    const readFailure = new FailingReadStorage(
      readValues,
      LEGACY_RANKING_PROFILE_STORAGE_KEY,
    )
    const beforeRead = new Map(readValues)
    expect(restoreRankingProfileStorageBackup(readFailure)).toMatchObject({
      status: "rejected",
      evidence: {code: "rollback_storage_read_failed"},
    })
    expect(readValues).toEqual(beforeRead)

    const writeValues = new Map(migrated.sharedValues())
    const writeFailure = new FailingRollbackWriteStorage(writeValues)
    const beforeWrite = new Map(writeValues)
    expect(restoreRankingProfileStorageBackup(writeFailure)).toMatchObject({
      status: "rejected",
      evidence: {code: "rollback_storage_write_failed"},
    })
    expect(writeValues).toEqual(beforeWrite)
  })

  it("enforces the shared 500-player active-plus-unresolved ceiling", () => {
    const snapshot = {
      source_ranker: "Harris",
      scoring: "ppr",
      positions: {
        QB: Array.from({length: 499}, (_, index) => ({
          player_id: `q${index}`,
          rank: index + 1,
          user_tier: 1,
        })),
        RB: [{player_id: "unknown-rb", rank: 1, user_tier: 1}],
        WR: [],
        TE: [],
      },
    }
    const trustedUniverse = Array.from({length: 499}, (_, index) => ({
      player_id: `q${index}`,
      position: "QB",
      overall_rank: index + 1,
    }))
    const atLimit = planRankingProfileStorageMigration(JSON.stringify(snapshot), {
      legacy_format: "portable_v1",
      trusted_universe: trustedUniverse,
    })
    expect(atLimit.status).toBe("ready")

    snapshot.positions.RB.push({player_id: "unknown-rb-2", rank: 2, user_tier: 1})
    const overLimit = planRankingProfileStorageMigration(JSON.stringify(snapshot), {
      legacy_format: "portable_v1",
      trusted_universe: trustedUniverse,
    })
    expect(overLimit).toMatchObject({
      status: "rejected",
      evidence: {code: "invalid_legacy_v1"},
    })
  })
})
