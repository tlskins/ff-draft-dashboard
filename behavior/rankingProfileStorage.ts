import {
  adaptLegacyRankingsToProfileV2,
  adaptPortableV1ToProfileV2,
  ProfileScoringType,
  RankingProfileV2,
  profileFingerprint,
  validateRankingProfileV2,
} from "./rankingProfileV2"


export const LEGACY_RANKING_PROFILE_STORAGE_KEY = "ff-draft-custom-rankings"
export const RANKING_PROFILE_V2_STORAGE_KEY = "ff-draft-ranking-profile-v2"
export const RANKING_PROFILE_V2_BACKUP_KEY = "ff-draft-ranking-profile-v2-backup"
export const RANKING_PROFILE_V2_AUTHORITY_KEY = "ff-draft-ranking-profile-v2-authority"
export const RANKING_PROFILE_V2_COMMIT_KEY = "ff-draft-ranking-profile-v2-commit"

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
    | "authority_invalid"
    | "authority_conflict"
    | "authority_missing"
    | "authority_recovered"
    | "commit_invalid"
    | "commit_conflict"
    | "commit_write_failed"
    | "commit_recovery_required"
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

export type RankingProfileStartupResult =
  | {
    status: "migrated" | "already_current"
    profile: RankingProfileV2 | null
    evidence: RankingProfileStorageMigrationEvidence
  }
  | {
    status: "unavailable" | "rejected"
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

interface RankingProfileAuthority {
  schema: "drafty.ranking-profile-v2-authority"
  version: 1
  state: "canonical_v2" | "canonical_empty"
  profile_fingerprint: string | null
}

interface RankingProfileCommitWrite {
  key: string
  previous_value: string | null
  next_value: string | null
}

interface RankingProfileCommitJournal {
  schema: "drafty.ranking-profile-v2-commit"
  version: 1
  writes: RankingProfileCommitWrite[]
}

export interface RankingProfileAdditionalStorageWrite {
  key: string
  value: string | null
}

export type RankingProfileCommitResult =
  | {status: "committed" | "already_current"; profile: RankingProfileV2 | null}
  | {status: "rejected"; code: "authority_invalid" | "authority_conflict" | "authority_missing" | "backup_invalid" | "commit_invalid" | "commit_conflict" | "commit_write_failed" | "commit_recovery_required" | "storage_read_failed"; message: string}

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

const serializeAuthority = (profile: RankingProfileV2 | null): string => JSON.stringify({
  schema: "drafty.ranking-profile-v2-authority",
  version: 1,
  state: profile === null ? "canonical_empty" : "canonical_v2",
  profile_fingerprint: profile === null ? null : profileFingerprint(profile),
} satisfies RankingProfileAuthority)

const validateAuthority = (serialized: string): RankingProfileAuthority | null => {
  let parsed: unknown
  try {
    parsed = JSON.parse(serialized) as unknown
  } catch {
    return null
  }
  const value = parsedRecord(parsed)
  if (!value) return null
  const keys = Object.keys(value)
  if (
    keys.length !== 4
    || !["schema", "version", "state", "profile_fingerprint"].every(key => keys.includes(key))
    || value.schema !== "drafty.ranking-profile-v2-authority"
    || value.version !== 1
    || !["canonical_v2", "canonical_empty"].includes(String(value.state))
  ) return null
  if (value.state === "canonical_empty") {
    return value.profile_fingerprint === null ? value as unknown as RankingProfileAuthority : null
  }
  return typeof value.profile_fingerprint === "string" && /^[a-f0-9]{64}$/.test(value.profile_fingerprint)
    ? value as unknown as RankingProfileAuthority
    : null
}

const authorityMatchesProfile = (
  authority: RankingProfileAuthority,
  profile: RankingProfileV2 | null,
): boolean => authority.state === (profile === null ? "canonical_empty" : "canonical_v2")
  && authority.profile_fingerprint === (profile === null ? null : profileFingerprint(profile))

const readCanonicalValue = (serialized: string | null): RankingProfileV2 | null => {
  if (serialized === null) return null
  return validateRankingProfileV2(JSON.parse(serialized) as unknown)
}

const validateCommitJournal = (serialized: string): RankingProfileCommitJournal | null => {
  let parsed: unknown
  try {
    parsed = JSON.parse(serialized) as unknown
  } catch {
    return null
  }
  const root = parsedRecord(parsed)
  if (!root || Object.keys(root).length !== 3 || root.schema !== "drafty.ranking-profile-v2-commit" || root.version !== 1 || !Array.isArray(root.writes)) return null
  if (root.writes.length < 2 || root.writes.length > 8) return null
  const writes: RankingProfileCommitWrite[] = []
  const keys = new Set<string>()
  for (const raw of root.writes) {
    const value = parsedRecord(raw)
    if (!value || Object.keys(value).length !== 3 || typeof value.key !== "string" || value.key.length === 0 || value.key.length > 200) return null
    if ((value.previous_value !== null && typeof value.previous_value !== "string") || (value.next_value !== null && typeof value.next_value !== "string")) return null
    if (keys.has(value.key) || value.key === RANKING_PROFILE_V2_COMMIT_KEY) return null
    keys.add(value.key)
    writes.push(value as unknown as RankingProfileCommitWrite)
  }
  if (!keys.has(RANKING_PROFILE_V2_STORAGE_KEY) || !keys.has(RANKING_PROFILE_V2_AUTHORITY_KEY)) return null
  const destination = writes.find(write => write.key === RANKING_PROFILE_V2_STORAGE_KEY)!
  const authorityWrite = writes.find(write => write.key === RANKING_PROFILE_V2_AUTHORITY_KEY)!
  if (authorityWrite.next_value === null) return null
  const authority = validateAuthority(authorityWrite.next_value)
  if (!authority) return null
  try {
    const profile = readCanonicalValue(destination.next_value)
    if (!authorityMatchesProfile(authority, profile)) return null
  } catch {
    return null
  }
  return {schema: "drafty.ranking-profile-v2-commit", version: 1, writes}
}

const writeExact = (
  storage: RankingProfileStorageAdapter,
  key: string,
  value: string | null,
) => {
  if (value === null) storage.removeItem(key)
  else storage.setItem(key, value)
  if (storage.getItem(key) !== value) throw new Error(`Storage value ${key} did not read back identically`)
}

const rejectCommit = (
  code: Extract<RankingProfileCommitResult, {status: "rejected"}>["code"],
  error: unknown,
): RankingProfileCommitResult => ({
  status: "rejected",
  code,
  message: error instanceof Error ? error.message : String(error),
})

export const recoverRankingProfileCommit = (
  storage: RankingProfileStorageAdapter,
): RankingProfileCommitResult | null => {
  let serialized: string | null
  try {
    serialized = storage.getItem(RANKING_PROFILE_V2_COMMIT_KEY)
  } catch (error) {
    return rejectCommit("storage_read_failed", error)
  }
  if (serialized === null) return null
  const journal = validateCommitJournal(serialized)
  if (!journal) return rejectCommit("commit_invalid", "Canonical commit journal is invalid")

  try {
    for (const write of journal.writes) {
      const current = storage.getItem(write.key)
      if (current !== write.previous_value && current !== write.next_value) {
        return rejectCommit("commit_conflict", `Canonical commit conflicts at ${write.key}`)
      }
    }
    for (const write of journal.writes) writeExact(storage, write.key, write.next_value)
    writeExact(storage, RANKING_PROFILE_V2_COMMIT_KEY, null)
    const destination = journal.writes.find(write => write.key === RANKING_PROFILE_V2_STORAGE_KEY)!
    return {status: "committed", profile: readCanonicalValue(destination.next_value)}
  } catch (error) {
    return rejectCommit("commit_recovery_required", error)
  }
}

const readCommittedAuthority = (
  storage: RankingProfileStorageAdapter,
): RankingProfileCommitResult | null => {
  let authorityValue: string | null
  let destinationValue: string | null
  try {
    authorityValue = storage.getItem(RANKING_PROFILE_V2_AUTHORITY_KEY)
    destinationValue = storage.getItem(RANKING_PROFILE_V2_STORAGE_KEY)
  } catch (error) {
    return rejectCommit("storage_read_failed", error)
  }
  if (authorityValue === null) return null
  const authority = validateAuthority(authorityValue)
  if (!authority) return rejectCommit("authority_invalid", "Canonical authority record is invalid")
  try {
    const profile = readCanonicalValue(destinationValue)
    if (!authorityMatchesProfile(authority, profile)) {
      return rejectCommit("authority_conflict", "Canonical profile does not match its authority record")
    }
    return {status: "already_current", profile}
  } catch (error) {
    return rejectCommit("authority_conflict", error)
  }
}

export const commitCanonicalRankingProfile = (
  storage: RankingProfileStorageAdapter,
  profileValue: RankingProfileV2 | null,
  additionalWrites: RankingProfileAdditionalStorageWrite[] = [],
  allowUncommittedDestination = false,
): RankingProfileCommitResult => {
  const recovered = recoverRankingProfileCommit(storage)
  if (recovered?.status === "rejected") return recovered
  const profile = profileValue === null ? null : validateRankingProfileV2(profileValue)
  const destinationValue = profile === null ? null : serializeRankingProfileV2(profile)
  const authorityValue = serializeAuthority(profile)
  const reserved = new Set([RANKING_PROFILE_V2_STORAGE_KEY, RANKING_PROFILE_V2_AUTHORITY_KEY, RANKING_PROFILE_V2_COMMIT_KEY])
  if (additionalWrites.length > 5 || additionalWrites.some(write => reserved.has(write.key)) || new Set(additionalWrites.map(write => write.key)).size !== additionalWrites.length) {
    return rejectCommit("commit_invalid", "Canonical commit keys are invalid or duplicated")
  }

  const currentAuthority = readCommittedAuthority(storage)
  if (currentAuthority?.status === "rejected") return currentAuthority
  let previousDestination: string | null
  let previousAuthority: string | null
  let legacySource: string | null
  let backupValue: string | null
  try {
    previousDestination = storage.getItem(RANKING_PROFILE_V2_STORAGE_KEY)
    previousAuthority = storage.getItem(RANKING_PROFILE_V2_AUTHORITY_KEY)
    legacySource = storage.getItem(LEGACY_RANKING_PROFILE_STORAGE_KEY)
    backupValue = storage.getItem(RANKING_PROFILE_V2_BACKUP_KEY)
  } catch (error) {
    return rejectCommit("storage_read_failed", error)
  }
  if (backupValue !== null && !validateBackup(backupValue)) return rejectCommit("backup_invalid", "Migration backup is invalid")
  if (previousAuthority === null && previousDestination !== null) {
    let destinationMatches = previousDestination === destinationValue
    if (allowUncommittedDestination && !destinationMatches) {
      try {
        const previousProfile = readCanonicalValue(previousDestination)
        destinationMatches = previousProfile !== null
          && profile !== null
          && profileFingerprint(previousProfile) === profileFingerprint(profile)
      } catch {
        destinationMatches = false
      }
    }
    if (!allowUncommittedDestination || !destinationMatches) {
      return rejectCommit("authority_missing", "Canonical destination exists without established authority")
    }
  }
  if (previousAuthority === null && legacySource !== null && !allowUncommittedDestination) {
    return rejectCommit("authority_missing", "Legacy migration must establish authority before a canonical commit")
  }

  const writes: RankingProfileCommitWrite[] = [
    {key: RANKING_PROFILE_V2_STORAGE_KEY, previous_value: previousDestination, next_value: destinationValue},
  ]
  try {
    for (const write of additionalWrites) {
      writes.push({key: write.key, previous_value: storage.getItem(write.key), next_value: write.value})
    }
  } catch (error) {
    return rejectCommit("storage_read_failed", error)
  }
  writes.push({key: RANKING_PROFILE_V2_AUTHORITY_KEY, previous_value: previousAuthority, next_value: authorityValue})
  if (writes.every(write => write.previous_value === write.next_value)) return {status: "already_current", profile}
  const journal = JSON.stringify({schema: "drafty.ranking-profile-v2-commit", version: 1, writes} satisfies RankingProfileCommitJournal)

  try {
    writeExact(storage, RANKING_PROFILE_V2_COMMIT_KEY, journal)
    for (const write of writes) writeExact(storage, write.key, write.next_value)
    writeExact(storage, RANKING_PROFILE_V2_COMMIT_KEY, null)
    return {status: "committed", profile}
  } catch (error) {
    let rollbackFailed = false
    for (const write of [...writes].reverse()) {
      try {
        const current = storage.getItem(write.key)
        if (current !== write.previous_value && current !== write.next_value) {
          rollbackFailed = true
          continue
        }
        writeExact(storage, write.key, write.previous_value)
      } catch {
        rollbackFailed = true
      }
    }
    if (!rollbackFailed) {
      try {
        writeExact(storage, RANKING_PROFILE_V2_COMMIT_KEY, null)
      } catch {
        rollbackFailed = true
      }
    }
    return rejectCommit(rollbackFailed ? "commit_recovery_required" : "commit_write_failed", error)
  }
}

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
  let currentAuthority: string | null
  try {
    currentSource = storage.getItem(backup.source_key)
    currentDestination = storage.getItem(backup.destination_key)
    currentAuthority = storage.getItem(RANKING_PROFILE_V2_AUTHORITY_KEY)
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
    if (currentAuthority !== null) {
      const authority = validateAuthority(currentAuthority)
      try {
        if (!authority || !authorityMatchesProfile(authority, readCanonicalValue(backup.expected_destination_value))) {
          return {status: "rejected", evidence: rollbackEvidence("rollback_conflict", "Canonical authority changed after migration")}
        }
        storage.removeItem(RANKING_PROFILE_V2_AUTHORITY_KEY)
        if (storage.getItem(RANKING_PROFILE_V2_AUTHORITY_KEY) !== null) throw new Error("Restored authority did not read back identically")
      } catch (error) {
        return {status: "rejected", evidence: rollbackEvidence("rollback_storage_write_failed", error instanceof Error ? error.message : "Rollback authority write failed")}
      }
    }
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
  if (currentAuthority !== null) {
    const authority = validateAuthority(currentAuthority)
    try {
      const expectedProfile = readCanonicalValue(backup.expected_destination_value)
      if (!authority || !authorityMatchesProfile(authority, expectedProfile)) {
        return {
          status: "rejected",
          evidence: rollbackEvidence("rollback_conflict", "Canonical authority changed after migration"),
        }
      }
    } catch {
      return {
        status: "rejected",
        evidence: rollbackEvidence("rollback_conflict", "Canonical authority changed after migration"),
      }
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
    if (currentAuthority !== null) {
      storage.removeItem(RANKING_PROFILE_V2_AUTHORITY_KEY)
      if (storage.getItem(RANKING_PROFILE_V2_AUTHORITY_KEY) !== null) {
        throw new Error("Restored authority did not read back identically")
      }
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
): RankingProfileStartupResult => {
  const recovered = recoverRankingProfileCommit(storage)
  if (recovered?.status === "rejected") {
    return {status: "rejected", evidence: evidence(recovered.code, "profile_v2", recovered.message)}
  }
  const committed = readCommittedAuthority(storage)
  if (committed?.status === "rejected") {
    return {status: "rejected", evidence: evidence(committed.code, "profile_v2", committed.message)}
  }
  if (committed) {
    let backupValue: string | null
    try {
      backupValue = storage.getItem(RANKING_PROFILE_V2_BACKUP_KEY)
    } catch (error) {
      return {status: "rejected", evidence: evidence("storage_read_failed", "profile_v2", error instanceof Error ? error.message : "Storage read failed")}
    }
    if (backupValue !== null && !validateBackup(backupValue)) {
      return {status: "rejected", evidence: evidence("backup_invalid", "profile_v2", "Migration backup is invalid")}
    }
    return {
      status: "already_current",
      profile: committed.profile,
      evidence: evidence("already_v2", "profile_v2", "Committed canonical browser authority is current"),
    }
  }
  try {
    const sourceValue = storage.getItem(LEGACY_RANKING_PROFILE_STORAGE_KEY)
    const destinationValue = storage.getItem(RANKING_PROFILE_V2_STORAGE_KEY)
    if (sourceValue === null && destinationValue !== null) {
      let profile: RankingProfileV2
      try {
        const canonical = readCanonicalValue(destinationValue)
        if (canonical === null) throw new Error("Canonical destination is empty")
        profile = canonical
      } catch (error) {
        return {status: "rejected", evidence: evidence("destination_invalid", "profile_v2", error instanceof Error ? error.message : "Canonical destination is invalid")}
      }
      const authorityCommit = commitCanonicalRankingProfile(storage, profile, [], true)
      if (authorityCommit.status === "rejected") {
        return {status: "rejected", evidence: evidence(authorityCommit.code, "profile_v2", authorityCommit.message)}
      }
      return {
        status: "migrated",
        profile,
        evidence: evidence(
          "authority_recovered",
          "profile_v2",
          "Validated canonical profile v2 and established its browser authority record",
        ),
      }
    }
  } catch (error) {
    return {status: "rejected", evidence: evidence("storage_read_failed", null, error instanceof Error ? error.message : "Storage read failed")}
  }
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
  const migration = migrateRankingProfileStorage(storage, {
    legacy_format: "full_rankings_v1",
    trusted_universe: trustedUniverse,
    scoring_type: scoringType,
    // This is the production key written and read by useRanks. Keeping it
    // explicit prevents a helper default from silently becoming authority.
    source_key: "ff-draft-custom-rankings",
    destination_key: RANKING_PROFILE_V2_STORAGE_KEY,
    backup_key: RANKING_PROFILE_V2_BACKUP_KEY,
  })
  if (migration.status !== "migrated" && migration.status !== "already_current") return migration
  const authorityCommit = commitCanonicalRankingProfile(storage, migration.profile, [], true)
  if (authorityCommit.status === "rejected") {
    return {status: "rejected", evidence: evidence(authorityCommit.code, "profile_v2", authorityCommit.message)}
  }
  return {status: migration.status, profile: migration.profile, evidence: migration.evidence}
}
