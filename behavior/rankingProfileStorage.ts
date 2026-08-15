import {
  adaptLegacyRankingsToProfileV2,
  adaptPortableV1ToProfileV2,
  ProfileScoringType,
  RankingProfileV2,
  validateRankingProfileV2,
} from "./rankingProfileV2"


export const LEGACY_RANKING_PROFILE_STORAGE_KEY = "ff-draft-custom-rankings"
export const RANKING_PROFILE_V2_STORAGE_KEY = "ff-draft-ranking-profile-v2"
export const RANKING_PROFILE_V2_BACKUP_KEY = "ff-draft-ranking-profile-v2-backup"

export type LegacyRankingProfileFormat = "portable_v1" | "full_rankings_v1"

export interface RankingProfileStorageAdapter {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface RankingProfileStorageMigrationEvidence {
  code:
    | "migration_ready"
    | "already_v2"
    | "corrupt_json"
    | "unsupported_schema_version"
    | "malformed_claimed_v2"
    | "invalid_legacy_v1"
    | "source_missing"
    | "trusted_universe_unavailable"
    | "storage_read_failed"
    | "destination_invalid"
    | "destination_conflict"
    | "backup_invalid"
    | "backup_conflict"
    | "backup_write_failed"
    | "destination_write_failed"
  source_format: LegacyRankingProfileFormat | "profile_v2" | null
  message: string
}

export type RankingProfileStorageMigrationPlan =
  | {
    status: "ready" | "already_v2"
    profile: RankingProfileV2
    serialized: string
    evidence: RankingProfileStorageMigrationEvidence
  }
  | {
    status: "rejected"
    evidence: RankingProfileStorageMigrationEvidence
  }

export type RankingProfileStorageMigrationResult =
  | {
    status: "migrated" | "already_current"
    profile: RankingProfileV2
    evidence: RankingProfileStorageMigrationEvidence
  }
  | {
    status: "unavailable"
    evidence: RankingProfileStorageMigrationEvidence
  }
  | {
    status: "rejected"
    evidence: RankingProfileStorageMigrationEvidence
  }

export interface RankingProfileStorageRollbackEvidence {
  code:
    | "rollback_restored"
    | "rollback_already_restored"
    | "rollback_not_found"
    | "rollback_invalid_backup"
    | "rollback_conflict"
    | "rollback_storage_read_failed"
    | "rollback_storage_write_failed"
  message: string
}

export type RankingProfileStorageRollbackResult =
  | {
    status: "restored" | "already_restored" | "not_found"
    evidence: RankingProfileStorageRollbackEvidence
  }
  | {
    status: "rejected"
    evidence: RankingProfileStorageRollbackEvidence
  }

export interface PlanRankingProfileStorageMigrationOptions {
  legacy_format: LegacyRankingProfileFormat
  trusted_universe: unknown
  scoring_type?: ProfileScoringType
}

export interface MigrateRankingProfileStorageOptions
  extends PlanRankingProfileStorageMigrationOptions {
  source_key?: string
  destination_key?: string
  backup_key?: string
}

interface RankingProfileStorageBackup {
  schema: "drafty.ranking-profile-v2-migration-backup"
  version: 2
  source_key: string
  source_value: string
  destination_key: string
  previous_destination_value: string | null
  expected_destination_value: string
}

const evidence = (
  code: RankingProfileStorageMigrationEvidence["code"],
  sourceFormat: RankingProfileStorageMigrationEvidence["source_format"],
  message: string,
): RankingProfileStorageMigrationEvidence => ({
  code,
  source_format: sourceFormat,
  message,
})

const rollbackEvidence = (
  code: RankingProfileStorageRollbackEvidence["code"],
  message: string,
): RankingProfileStorageRollbackEvidence => ({code, message})

const parsedRecord = (value: unknown): Record<string, unknown> | null => (
  value !== null
  && typeof value === "object"
  && !Array.isArray(value)
  && Object.getPrototypeOf(value) === Object.prototype
    ? value as Record<string, unknown>
    : null
)

export const serializeRankingProfileV2 = (value: unknown): string => (
  JSON.stringify(validateRankingProfileV2(value))
)

export const planRankingProfileStorageMigration = (
  storedValue: string,
  options: PlanRankingProfileStorageMigrationOptions,
): RankingProfileStorageMigrationPlan => {
  let parsed: unknown
  try {
    parsed = JSON.parse(storedValue) as unknown
  } catch {
    return {
      status: "rejected",
      evidence: evidence("corrupt_json", options.legacy_format, "Stored ranking profile is not valid JSON"),
    }
  }

  const root = parsedRecord(parsed)
  if (root && Object.prototype.hasOwnProperty.call(root, "schema_version")) {
    if (root.schema_version !== 2) {
      return {
        status: "rejected",
        evidence: evidence(
          "unsupported_schema_version",
          null,
          `Stored ranking profile claims unsupported schema_version ${String(root.schema_version)}`,
        ),
      }
    }
    try {
      const profile = validateRankingProfileV2(parsed)
      return {
        status: "already_v2",
        profile,
        serialized: JSON.stringify(profile),
        evidence: evidence("already_v2", "profile_v2", "Stored ranking profile is already canonical v2"),
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Malformed claimed profile v2"
      return {
        status: "rejected",
        evidence: evidence("malformed_claimed_v2", "profile_v2", message),
      }
    }
  }

  try {
    const profile = options.legacy_format === "portable_v1"
      ? adaptPortableV1ToProfileV2(parsed, options.trusted_universe)
      : adaptLegacyRankingsToProfileV2(
        parsed,
        options.trusted_universe,
        options.scoring_type,
      )
    return {
      status: "ready",
      profile,
      serialized: JSON.stringify(profile),
      evidence: evidence("migration_ready", options.legacy_format, "Legacy ranking profile validated for migration"),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Legacy ranking profile is invalid"
    return {
      status: "rejected",
      evidence: evidence("invalid_legacy_v1", options.legacy_format, message),
    }
  }
}

export const loadStoredRankingProfileV2 = (
  storage: RankingProfileStorageAdapter,
  key = RANKING_PROFILE_V2_STORAGE_KEY,
): RankingProfileV2 | null => {
  const value = storage.getItem(key)
  if (value === null) return null
  return validateRankingProfileV2(JSON.parse(value) as unknown)
}

const restoreDestination = (
  storage: RankingProfileStorageAdapter,
  key: string,
  priorValue: string | null,
) => {
  if (priorValue === null) storage.removeItem(key)
  else storage.setItem(key, priorValue)
}

export const migrateRankingProfileStorage = (
  storage: RankingProfileStorageAdapter,
  options: MigrateRankingProfileStorageOptions,
): RankingProfileStorageMigrationResult => {
  const sourceKey = options.source_key || LEGACY_RANKING_PROFILE_STORAGE_KEY
  const destinationKey = options.destination_key || RANKING_PROFILE_V2_STORAGE_KEY
  const backupKey = options.backup_key || RANKING_PROFILE_V2_BACKUP_KEY
  if (sourceKey === destinationKey || backupKey === sourceKey || backupKey === destinationKey) {
    return {
      status: "rejected",
      evidence: evidence("storage_read_failed", null, "Migration storage keys must be distinct"),
    }
  }

  let sourceValue: string | null
  let destinationValue: string | null
  let backupValue: string | null
  try {
    sourceValue = storage.getItem(sourceKey)
    destinationValue = storage.getItem(destinationKey)
    backupValue = storage.getItem(backupKey)
  } catch (error) {
    return {
      status: "rejected",
      evidence: evidence("storage_read_failed", null, error instanceof Error ? error.message : "Storage read failed"),
    }
  }
  const existingBackup = backupValue === null ? null : validateBackup(backupValue)
  if (backupValue !== null && !existingBackup) {
    return {
      status: "rejected",
      evidence: evidence("backup_invalid", null, "Migration backup is invalid"),
    }
  }
  if (sourceValue === null) {
    if (destinationValue !== null) {
      try {
        const profile = validateRankingProfileV2(JSON.parse(destinationValue) as unknown)
        return {
          status: "already_current",
          profile,
          evidence: evidence("already_v2", "profile_v2", "Canonical profile v2 is already stored"),
        }
      } catch (error) {
        return {
          status: "rejected",
          evidence: evidence("destination_invalid", "profile_v2", error instanceof Error ? error.message : "Stored v2 destination is invalid"),
        }
      }
    }
    return {
      status: "unavailable",
      evidence: evidence("source_missing", null, "Legacy ranking profile is not stored"),
    }
  }

  if (existingBackup && (
    existingBackup.source_key !== sourceKey
    || existingBackup.destination_key !== destinationKey
    || existingBackup.source_value !== sourceValue
  )) {
    return {
      status: "rejected",
      evidence: evidence("backup_conflict", "profile_v2", "Migration backup conflicts with current storage values"),
    }
  }

  const plan = planRankingProfileStorageMigration(sourceValue, options)
  if (plan.status === "rejected") return plan

  if (existingBackup && (
    existingBackup.source_key !== sourceKey
    || existingBackup.destination_key !== destinationKey
    || existingBackup.source_value !== sourceValue
    || existingBackup.expected_destination_value !== plan.serialized
    || (
      destinationValue !== existingBackup.previous_destination_value
      && destinationValue !== existingBackup.expected_destination_value
    )
  )) {
    return {
      status: "rejected",
      evidence: evidence("backup_conflict", plan.evidence.source_format, "Migration backup conflicts with current storage values"),
    }
  }

  if (destinationValue !== null) {
    let destination: RankingProfileV2
    try {
      destination = validateRankingProfileV2(JSON.parse(destinationValue) as unknown)
    } catch (error) {
      return {
        status: "rejected",
        evidence: evidence("destination_invalid", "profile_v2", error instanceof Error ? error.message : "Stored v2 destination is invalid"),
      }
    }
    if (JSON.stringify(destination) !== plan.serialized) {
      return {
        status: "rejected",
        evidence: evidence("destination_conflict", "profile_v2", "Stored v2 destination differs from the migration result"),
      }
    }
    return {status: "already_current", profile: destination, evidence: plan.evidence}
  }

  const backup: RankingProfileStorageBackup = {
    schema: "drafty.ranking-profile-v2-migration-backup",
    version: 2,
    source_key: sourceKey,
    source_value: sourceValue,
    destination_key: destinationKey,
    previous_destination_value: destinationValue,
    expected_destination_value: plan.serialized,
  }
  if (!existingBackup) {
    const serializedBackup = JSON.stringify(backup)
    try {
      storage.setItem(backupKey, serializedBackup)
      if (storage.getItem(backupKey) !== serializedBackup) {
        throw new Error("Migration backup did not read back identically")
      }
    } catch (error) {
      return {
        status: "rejected",
        evidence: evidence("backup_write_failed", plan.evidence.source_format, error instanceof Error ? error.message : "Migration backup write failed"),
      }
    }
  }

  try {
    storage.setItem(destinationKey, plan.serialized)
    const reloaded = loadStoredRankingProfileV2(storage, destinationKey)
    if (JSON.stringify(reloaded) !== plan.serialized) {
      throw new Error("Migrated profile did not reload identically")
    }
    return {status: "migrated", profile: reloaded!, evidence: plan.evidence}
  } catch (error) {
    try {
      const currentSource = storage.getItem(sourceKey)
      const currentDestination = storage.getItem(destinationKey)
      if (
        currentSource === sourceValue
        && currentDestination === plan.serialized
      ) {
        restoreDestination(storage, destinationKey, destinationValue)
      }
    } catch {
      // The retained backup and untouched source remain the recovery boundary.
    }
    return {
      status: "rejected",
      evidence: evidence("destination_write_failed", plan.evidence.source_format, error instanceof Error ? error.message : "Migrated profile write failed"),
    }
  }
}

const validateBackup = (
  serialized: string,
): RankingProfileStorageBackup | null => {
  let parsed: unknown
  try {
    parsed = JSON.parse(serialized) as unknown
  } catch {
    return null
  }
  const value = parsedRecord(parsed)
  if (!value) return null
  const expectedKeys = new Set([
    "schema",
    "version",
    "source_key",
    "source_value",
    "destination_key",
    "previous_destination_value",
    "expected_destination_value",
  ])
  if (
    Object.keys(value).length !== expectedKeys.size
    || Object.keys(value).some(key => !expectedKeys.has(key))
    || value.schema !== "drafty.ranking-profile-v2-migration-backup"
    || value.version !== 2
    || typeof value.source_key !== "string"
    || value.source_key.length === 0
    || typeof value.source_value !== "string"
    || typeof value.destination_key !== "string"
    || value.destination_key.length === 0
    || typeof value.expected_destination_value !== "string"
    || (value.previous_destination_value !== null
      && typeof value.previous_destination_value !== "string")
    || value.source_key === value.destination_key
  ) return null
  try {
    if (
      serializeRankingProfileV2(JSON.parse(value.expected_destination_value) as unknown)
      !== value.expected_destination_value
    ) return null
  } catch {
    return null
  }
  return value as unknown as RankingProfileStorageBackup
}

export const restoreRankingProfileStorageBackup = (
  storage: RankingProfileStorageAdapter,
  backupKey = RANKING_PROFILE_V2_BACKUP_KEY,
): RankingProfileStorageRollbackResult => {
  let serialized: string | null
  try {
    serialized = storage.getItem(backupKey)
  } catch (error) {
    return {
      status: "rejected",
      evidence: rollbackEvidence(
        "rollback_storage_read_failed",
        error instanceof Error ? error.message : "Migration backup read failed",
      ),
    }
  }
  if (serialized === null) {
    return {
      status: "not_found",
      evidence: rollbackEvidence("rollback_not_found", "Migration backup is not stored"),
    }
  }
  const backup = validateBackup(serialized)
  if (!backup) {
    return {
      status: "rejected",
      evidence: rollbackEvidence("rollback_invalid_backup", "Migration backup is invalid"),
    }
  }

  let currentSource: string | null
  let currentDestination: string | null
  try {
    currentSource = storage.getItem(backup.source_key)
    currentDestination = storage.getItem(backup.destination_key)
  } catch (error) {
    return {
      status: "rejected",
      evidence: rollbackEvidence(
        "rollback_storage_read_failed",
        error instanceof Error ? error.message : "Rollback state read failed",
      ),
    }
  }
  if (currentSource !== backup.source_value) {
    return {
      status: "rejected",
      evidence: rollbackEvidence("rollback_conflict", "Legacy source changed after migration"),
    }
  }
  if (currentDestination === backup.previous_destination_value) {
    return {
      status: "already_restored",
      evidence: rollbackEvidence("rollback_already_restored", "Migration destination is already restored"),
    }
  }
  if (currentDestination !== backup.expected_destination_value) {
    return {
      status: "rejected",
      evidence: rollbackEvidence("rollback_conflict", "Profile-v2 destination changed after migration"),
    }
  }

  try {
    restoreDestination(
      storage,
      backup.destination_key,
      backup.previous_destination_value,
    )
    if (storage.getItem(backup.destination_key) !== backup.previous_destination_value) {
      throw new Error("Restored destination did not read back identically")
    }
  } catch (error) {
    return {
      status: "rejected",
      evidence: rollbackEvidence(
        "rollback_storage_write_failed",
        error instanceof Error ? error.message : "Rollback destination write failed",
      ),
    }
  }
  return {
    status: "restored",
    evidence: rollbackEvidence("rollback_restored", "Migration destination was restored"),
  }
}

export interface RankingProfileStartupPlayer {
  id: string
  position: string
}

export const runRankingProfileStartupMigration = (
  storage: RankingProfileStorageAdapter,
  players: RankingProfileStartupPlayer[],
  scoringType: ProfileScoringType,
): RankingProfileStorageMigrationResult => {
  const trustedUniverse = players
    .filter(player => ["QB", "RB", "WR", "TE"].includes(player.position))
    .map((player, index) => ({
      player_id: player.id,
      position: player.position,
      overall_rank: index + 1,
    }))
  if (trustedUniverse.length === 0) {
    return {
      status: "unavailable",
      evidence: evidence(
        "trusted_universe_unavailable",
        null,
        "Trusted player universe is not available",
      ),
    }
  }
  return migrateRankingProfileStorage(storage, {
    legacy_format: "full_rankings_v1",
    trusted_universe: trustedUniverse,
    scoring_type: scoringType,
    // This is the production key written and read by useRanks. Keeping it
    // explicit prevents a helper default from silently becoming authority.
    source_key: "ff-draft-custom-rankings",
    destination_key: RANKING_PROFILE_V2_STORAGE_KEY,
    backup_key: RANKING_PROFILE_V2_BACKUP_KEY,
  })
}
