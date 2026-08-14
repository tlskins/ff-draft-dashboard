import {
  adaptLegacyRankingsToProfileV2,
  adaptPortableV1ToProfileV2,
  ProfileScoringType,
  RankingProfileV2,
  RankingProfileV2ValidationError,
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
    | "storage_read_failed"
    | "destination_invalid"
    | "destination_conflict"
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
    status: "rejected"
    evidence: RankingProfileStorageMigrationEvidence
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
  version: 1
  source_key: string
  source_value: string
  destination_key: string
  previous_destination_value: string | null
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
  try {
    sourceValue = storage.getItem(sourceKey)
    destinationValue = storage.getItem(destinationKey)
  } catch (error) {
    return {
      status: "rejected",
      evidence: evidence("storage_read_failed", null, error instanceof Error ? error.message : "Storage read failed"),
    }
  }
  if (sourceValue === null) {
    return {
      status: "rejected",
      evidence: evidence("storage_read_failed", null, "Legacy ranking profile is not stored"),
    }
  }

  const plan = planRankingProfileStorageMigration(sourceValue, options)
  if (plan.status === "rejected") return plan

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
    version: 1,
    source_key: sourceKey,
    source_value: sourceValue,
    destination_key: destinationKey,
    previous_destination_value: destinationValue,
  }
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

  try {
    storage.setItem(destinationKey, plan.serialized)
    const reloaded = loadStoredRankingProfileV2(storage, destinationKey)
    if (JSON.stringify(reloaded) !== plan.serialized) {
      throw new Error("Migrated profile did not reload identically")
    }
    return {status: "migrated", profile: reloaded!, evidence: plan.evidence}
  } catch (error) {
    try {
      restoreDestination(storage, destinationKey, destinationValue)
    } catch {
      // The retained backup and untouched source remain the recovery boundary.
    }
    return {
      status: "rejected",
      evidence: evidence("destination_write_failed", plan.evidence.source_format, error instanceof Error ? error.message : "Migrated profile write failed"),
    }
  }
}

export const restoreRankingProfileStorageBackup = (
  storage: RankingProfileStorageAdapter,
  backupKey = RANKING_PROFILE_V2_BACKUP_KEY,
): boolean => {
  const serialized = storage.getItem(backupKey)
  if (serialized === null) return false
  const value = JSON.parse(serialized) as RankingProfileStorageBackup
  if (
    value.schema !== "drafty.ranking-profile-v2-migration-backup"
    || value.version !== 1
    || typeof value.source_key !== "string"
    || typeof value.source_value !== "string"
    || typeof value.destination_key !== "string"
    || (value.previous_destination_value !== null
      && typeof value.previous_destination_value !== "string")
  ) {
    throw new RankingProfileV2ValidationError("Migration backup is invalid")
  }
  if (storage.getItem(value.source_key) !== value.source_value) {
    storage.setItem(value.source_key, value.source_value)
  }
  restoreDestination(
    storage,
    value.destination_key,
    value.previous_destination_value,
  )
  return true
}
