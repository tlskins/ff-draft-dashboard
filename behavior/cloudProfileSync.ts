import type {components as ApiComponents} from "./api/schema"
import type {RankingProfileV2} from "./rankingProfileV2"
import {validateRankingProfileV2} from "./rankingProfileV2"
import type {PlayerTarget} from "../types"


export type UserDraftProfilePayload =
  ApiComponents["schemas"]["UserDraftProfilePayload"]
export type UserDraftProfileRecord =
  ApiComponents["schemas"]["UserDraftProfileRecord"]
export type UserDraftProfileRankingAuthority =
  ApiComponents["schemas"]["UserDraftProfileRankingAuthority"]

export const CLOUD_PROFILE_SYNC_MARKER_PREFIX = "drafty.cloud-profile-sync.v1:"
export const CLOUD_PROFILE_DEVICE_STORAGE_KEY = "drafty.cloud-profile-device.v1"

export interface CloudProfileSyncMarker {
  schema: "drafty.cloud-profile-sync-marker"
  version: 1
  uid: string
  revision: number
  content_fingerprint: string
  profile: UserDraftProfilePayload
}

export type CloudProfileSyncDecision =
  | {action: "ready"; record: UserDraftProfileRecord}
  | {action: "apply_remote"; record: UserDraftProfileRecord}
  | {action: "upload_local"; expectedRevision: number}
  | {action: "conflict"; record: UserDraftProfileRecord}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null
  && typeof value === "object"
  && !Array.isArray(value)
  && Object.getPrototypeOf(value) === Object.prototype
)

export const stableJson = (value: unknown): string => JSON.stringify(value, (_, nested) => {
  if (!isRecord(nested)) return nested
  return Object.fromEntries(
    Object.entries(nested).sort(([left], [right]) => left.localeCompare(right)),
  )
})

export const cloudProfilePayloadsEqual = (
  left: UserDraftProfilePayload,
  right: UserDraftProfilePayload,
): boolean => stableJson(left) === stableJson(right)

const profileEntries = (profile: RankingProfileV2) => (
  [
    ...Object.values(profile.positions).flat(),
    ...profile.unresolved_players,
  ]
)

const conservativeAuthority = (
  profile: RankingProfileV2 | null,
): UserDraftProfileRankingAuthority => {
  if (!profile) return {
    base_profile: null,
    rank_override_player_ids: [],
    tier_override_player_ids: [],
  }
  const playerIds = profileEntries(profile)
    .map(entry => entry.player_id)
    .sort()
  return {
    // A bound local profile does not retain its original provider baseline.
    // Preserve it without inventing authority: use the current profile as the
    // initial baseline and conservatively mark every retained player as owned.
    base_profile: profile.provenance.binding_state === "bound" ? profile : null,
    rank_override_player_ids: playerIds,
    tier_override_player_ids: playerIds,
  }
}

const authorityAgainstBase = (
  profile: RankingProfileV2,
  baseValue: unknown,
): UserDraftProfileRankingAuthority | null => {
  if (!baseValue) return null
  let base: RankingProfileV2
  try {
    base = validateRankingProfileV2(baseValue)
  } catch {
    return null
  }
  if (
    base.provenance.binding_state !== "bound"
    || profile.scoring_type !== base.scoring_type
    || stableJson(profile.provenance) !== stableJson(base.provenance)
  ) return null

  const rankOverrides = new Set<string>()
  const tierOverrides = new Set<string>()
  for (const position of Object.keys(profile.positions) as Array<keyof RankingProfileV2["positions"]>) {
    const current = profile.positions[position]
    const baseline = base.positions[position]
    const baselineById = new Map(
      baseline.map((entry, index) => [entry.player_id, {entry, index}]),
    )
    current.forEach((entry, index) => {
      const prior = baselineById.get(entry.player_id)
      if (!prior || prior.index !== index) rankOverrides.add(entry.player_id)
      if (!prior || prior.entry.user_tier !== entry.user_tier) {
        tierOverrides.add(entry.player_id)
      }
    })
  }
  return {
    base_profile: base,
    rank_override_player_ids: Array.from(rankOverrides).sort(),
    tier_override_player_ids: Array.from(tierOverrides).sort(),
  }
}

export const createCloudProfilePayload = ({
  rankingProfile,
  targets,
  sourceRanker,
  priorAuthority,
}: {
  rankingProfile: RankingProfileV2 | null
  targets: PlayerTarget[]
  sourceRanker: string | null
  priorAuthority?: UserDraftProfileRankingAuthority | null
}): UserDraftProfilePayload => {
  const canonical = rankingProfile ? validateRankingProfileV2(rankingProfile) : null
  const authority = canonical
    ? authorityAgainstBase(canonical, priorAuthority?.base_profile)
      || conservativeAuthority(canonical)
    : conservativeAuthority(null)
  return {
    schema_version: 1,
    source_ranker: sourceRanker || null,
    ranking_profile: canonical,
    ranking_authority: authority,
    targets: [...targets]
      .map(target => ({
        player_id: target.playerId,
        target_as_early_as_round: target.targetAsEarlyAsRound,
      }))
      .sort((left, right) => left.player_id.localeCompare(right.player_id)),
  }
}

export const cloudProfileIsEmpty = (profile: UserDraftProfilePayload): boolean => (
  profile.ranking_profile === null && profile.targets.length === 0
)

export const decideCloudProfileSync = ({
  local,
  remote,
  marker,
}: {
  local: UserDraftProfilePayload
  remote: UserDraftProfileRecord | null
  marker: CloudProfileSyncMarker | null
}): CloudProfileSyncDecision => {
  if (!remote) return {action: "upload_local", expectedRevision: 0}
  if (cloudProfilePayloadsEqual(local, remote.profile)) {
    return {action: "ready", record: remote}
  }
  if (!marker) {
    return cloudProfileIsEmpty(local)
      ? {action: "apply_remote", record: remote}
      : {action: "conflict", record: remote}
  }

  const localChanged = !cloudProfilePayloadsEqual(local, marker.profile)
  const remoteChanged = remote.content_fingerprint !== marker.content_fingerprint
  if (!localChanged && remoteChanged) return {action: "apply_remote", record: remote}
  if (localChanged && !remoteChanged) {
    return {action: "upload_local", expectedRevision: remote.revision}
  }
  if (!localChanged && !remoteChanged) return {action: "ready", record: remote}
  return {action: "conflict", record: remote}
}

export const markerForRecord = (
  uid: string,
  record: UserDraftProfileRecord,
): CloudProfileSyncMarker => ({
  schema: "drafty.cloud-profile-sync-marker",
  version: 1,
  uid,
  revision: record.revision,
  content_fingerprint: record.content_fingerprint,
  profile: record.profile,
})

export const readCloudProfileSyncMarker = (
  storage: Pick<Storage, "getItem">,
  uid: string,
): CloudProfileSyncMarker | null => {
  try {
    const serialized = storage.getItem(`${CLOUD_PROFILE_SYNC_MARKER_PREFIX}${uid}`)
    if (!serialized) return null
    const value = JSON.parse(serialized) as unknown
    if (!isRecord(value)) return null
    if (
      value.schema !== "drafty.cloud-profile-sync-marker"
      || value.version !== 1
      || value.uid !== uid
      || !Number.isInteger(value.revision)
      || Number(value.revision) < 1
      || typeof value.content_fingerprint !== "string"
      || !isRecord(value.profile)
    ) return null
    return value as unknown as CloudProfileSyncMarker
  } catch {
    return null
  }
}

export const writeCloudProfileSyncMarker = (
  storage: Pick<Storage, "setItem">,
  marker: CloudProfileSyncMarker,
) => storage.setItem(
  `${CLOUD_PROFILE_SYNC_MARKER_PREFIX}${marker.uid}`,
  JSON.stringify(marker),
)

export const getOrCreateCloudProfileDeviceId = (
  storage: Pick<Storage, "getItem" | "setItem">,
): string => {
  const existing = storage.getItem(CLOUD_PROFILE_DEVICE_STORAGE_KEY)
  if (existing && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(existing)) {
    return existing
  }
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replaceAll("-", "")
    : Math.random().toString(36).slice(2)
  const created = `device-${random}`.slice(0, 128)
  storage.setItem(CLOUD_PROFILE_DEVICE_STORAGE_KEY, created)
  return created
}
