export const PROFILE_REBASE_VERSION = "profile_rebase_v1" as const

const POSITIONS = ["QB", "RB", "WR", "TE"] as const
export const MAX_PROFILE_PLAYERS = 500
const MAX_PLAYERS = MAX_PROFILE_PLAYERS
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/
const HASH_PATTERN = /^[a-f0-9]{64}$/

export type ProfilePosition = typeof POSITIONS[number]
export type ProfileScoringType = "ppr" | "half_ppr" | "standard"
export type UnresolvedReason =
  | "missing_from_target"
  | "position_changed"
  | "legacy_unknown"

export interface RankingProfileV2 {
  schema_version: 2
  rebase_version: typeof PROFILE_REBASE_VERSION
  scoring_type: ProfileScoringType
  positions: Record<ProfilePosition, Array<{player_id: string; user_tier: number}>>
  unresolved_players: Array<{
    player_id: string
    last_position: ProfilePosition
    last_user_rank: number
    last_user_tier: number
    reason: UnresolvedReason
  }>
  provenance: {
    binding_state: "bound" | "legacy_unbound"
    base_source_id: string | null
    base_provider_id: string | null
    source_observation_fingerprint: string | null
    source_season: number | null
    source_scoring_type: ProfileScoringType | null
    player_universe_fingerprint: string | null
  }
}

export interface TargetPlayerUniverse {
  source_id: string
  provider_id: string
  season: number
  scoring_type: ProfileScoringType
  source_observation_fingerprint: string
  expected_source_observation_fingerprint: string
  player_universe_fingerprint: string
  expected_player_universe_fingerprint: string
  players: Array<{
    player_id: string
    position: ProfilePosition
    overall_rank: number
  }>
}

export interface RankingProfileRebasePreview {
  schema_version: 1
  rebase_version: typeof PROFILE_REBASE_VERSION
  input_profile_fingerprint: string
  output_profile_fingerprint: string
  target_source_observation_fingerprint: string
  target_player_universe_fingerprint: string
  preview_key: string
  logically_idempotent: true
  would_change: boolean
  counts: {added: number; removed: number; position_conflicts: number; unresolved: number}
  player_ids: {added: string[]; removed: string[]; position_conflicts: string[]; unresolved: string[]}
  profile: RankingProfileV2
}

export class RankingProfileV2ValidationError extends Error {
  constructor(message: string, public readonly code = "invalid_profile") {
    super(message)
    this.name = "RankingProfileV2ValidationError"
  }
}

const fail = (message: string, code?: string): never => {
  throw new RankingProfileV2ValidationError(message, code)
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== "object") return false
  try {
    if (Array.isArray(value)) return false
    const prototype = Object.getPrototypeOf(value)
    return prototype === Object.prototype || prototype === null
  } catch {
    return false
  }
}

const record = (value: unknown, label: string): Record<string, unknown> => {
  if (!isRecord(value)) fail(`${label}: expected a plain object`)
  let descriptors: PropertyDescriptorMap
  let symbols: symbol[]
  try {
    descriptors = Object.getOwnPropertyDescriptors(value as object)
    symbols = Object.getOwnPropertySymbols(value as object)
  } catch {
    fail(`${label}: object properties could not be inspected`)
  }
  const detached: Record<string, unknown> = Object.create(null) as Record<string, unknown>
  if (symbols!.length) fail(`${label}: symbol properties are not supported`)
  for (const [key, descriptor] of Object.entries(descriptors!)) {
    if (key === "__proto__" || key === "prototype" || key === "constructor") {
      fail(`${label}: prototype-shaped fields are not supported`)
    }
    if (descriptor.get || descriptor.set || !("value" in descriptor)) {
      fail(`${label}: accessors are not supported`)
    }
    detached[key] = descriptor.value
  }
  return detached
}

const safeArray = (
  value: unknown,
  label: string,
  maximum = MAX_PLAYERS,
  minimum = 0,
): unknown[] => {
  let descriptors: PropertyDescriptorMap
  let symbols: symbol[]
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
      fail(`${label}: expected an array`)
    }
    descriptors = Object.getOwnPropertyDescriptors(value as object)
    symbols = Object.getOwnPropertySymbols(value as object)
  } catch (error) {
    if (error instanceof RankingProfileV2ValidationError) throw error
    fail(`${label}: array properties could not be inspected`)
  }
  if (symbols!.length) fail(`${label}: symbol properties are not supported`)
  const length = descriptors!.length?.value
  if (!Number.isInteger(length) || length < minimum || length > maximum) {
    fail(`${label}: invalid array length`)
  }
  const result: unknown[] = []
  const expectedKeys = new Set(["length", ...Array.from({length}, (_, index) => String(index))])
  if (Object.keys(descriptors!).some(key => !expectedKeys.has(key))) {
    fail(`${label}: custom array properties are not supported`)
  }
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors![String(index)]
    if (!descriptor || descriptor.get || descriptor.set || !("value" in descriptor)) {
      fail(`${label}: sparse arrays and accessors are not supported`)
    }
    result.push(descriptor.value)
  }
  return result
}

const exactKeys = (
  value: Record<string, unknown>,
  keys: readonly string[],
  label: string,
) => {
  const actual = Object.keys(value)
  const allowed = new Set(keys)
  if (actual.length !== keys.length || actual.some(key => !allowed.has(key))) {
    fail(`${label}: expected exactly ${keys.join(", ")}`)
  }
}

const nonempty = (value: unknown, label: string, max = 80): string => {
  if (typeof value !== "string") {
    return fail(`${label}: expected a non-empty string up to ${max} characters`)
  }
  if (!value || value.length > max) {
    return fail(`${label}: expected a non-empty string up to ${max} characters`)
  }
  return value
}

const playerId = (value: unknown, label: string): string => {
  const id = nonempty(value, label)
  if (!ID_PATTERN.test(id)) fail(`${label}: invalid player ID`)
  return id
}

const integer = (value: unknown, label: string, min: number, max: number): number => {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    return fail(`${label}: expected an integer from ${min} to ${max}`)
  }
  return value
}

const position = (value: unknown, label: string): ProfilePosition => {
  if (!POSITIONS.includes(value as ProfilePosition)) fail(`${label}: unsupported position`)
  return value as ProfilePosition
}

const scoring = (value: unknown, label: string): ProfileScoringType => {
  if (value !== "ppr" && value !== "half_ppr" && value !== "standard") {
    return fail(`${label}: unsupported scoring type`)
  }
  return value
}

const hash = (value: unknown, label: string): string => {
  if (typeof value !== "string" || !HASH_PATTERN.test(value)) return fail(`${label}: invalid SHA-256`)
  return value
}

const nullableString = (value: unknown, label: string): string | null => (
  value === null ? null : nonempty(value, label)
)

const unresolvedReason = (value: unknown, label: string): UnresolvedReason => {
  if (value !== "missing_from_target" && value !== "position_changed" && value !== "legacy_unknown") {
    return fail(`${label}: unsupported reason`)
  }
  return value
}

const canonicalJson = (value: unknown): string => {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value)
  }
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map(key => (
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`
    )).join(",")}}`
  }
  return fail("fingerprint input: unsupported JSON value")
}

const utf8 = (value: string): Uint8Array => {
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(value)
  const encoded = unescape(encodeURIComponent(value))
  return Uint8Array.from(encoded, character => character.charCodeAt(0))
}

const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]

const rotateRight = (value: number, shift: number) => (value >>> shift) | (value << (32 - shift))

const sha256 = (text: string): string => {
  const source = utf8(text)
  const bitLength = source.length * 8
  const paddedLength = Math.ceil((source.length + 9) / 64) * 64
  const bytes = new Uint8Array(paddedLength)
  bytes.set(source)
  bytes[source.length] = 0x80
  const view = new DataView(bytes.buffer)
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false)
  view.setUint32(paddedLength - 4, bitLength >>> 0, false)
  const state = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]
  const words = new Uint32Array(64)
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4, false)
    for (let index = 16; index < 64; index += 1) {
      const s0 = rotateRight(words[index - 15], 7) ^ rotateRight(words[index - 15], 18) ^ (words[index - 15] >>> 3)
      const s1 = rotateRight(words[index - 2], 17) ^ rotateRight(words[index - 2], 19) ^ (words[index - 2] >>> 10)
      words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0
    }
    let [a, b, c, d, e, f, g, h] = state
    for (let index = 0; index < 64; index += 1) {
      const s1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25)
      const choice = (e & f) ^ (~e & g)
      const temp1 = (h + s1 + choice + SHA256_K[index] + words[index]) >>> 0
      const s0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22)
      const majority = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (s0 + majority) >>> 0
      h = g; g = f; f = e; e = (d + temp1) >>> 0
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0
    }
    state[0] = (state[0] + a) >>> 0; state[1] = (state[1] + b) >>> 0
    state[2] = (state[2] + c) >>> 0; state[3] = (state[3] + d) >>> 0
    state[4] = (state[4] + e) >>> 0; state[5] = (state[5] + f) >>> 0
    state[6] = (state[6] + g) >>> 0; state[7] = (state[7] + h) >>> 0
  }
  return state.map(value => value.toString(16).padStart(8, "0")).join("")
}

const fingerprint = (value: unknown) => sha256(canonicalJson(value))
const compareCanonicalId = (left: string, right: string) => (
  left < right ? -1 : left > right ? 1 : 0
)

export const validateRankingProfileV2 = (value: unknown): RankingProfileV2 => {
  const root = record(value, "profile")
  exactKeys(root, ["schema_version", "rebase_version", "scoring_type", "positions", "unresolved_players", "provenance"], "profile")
  if (root.schema_version !== 2) fail("profile.schema_version: expected 2")
  if (root.rebase_version !== PROFILE_REBASE_VERSION) fail("profile.rebase_version: unsupported")
  const scoringType = scoring(root.scoring_type, "profile.scoring_type")
  const positionRecord = record(root.positions, "profile.positions")
  exactKeys(positionRecord, POSITIONS, "profile.positions")
  const seen = new Set<string>()
  const normalizedPositions = {} as RankingProfileV2["positions"]
  for (const pos of POSITIONS) {
    const values = safeArray(positionRecord[pos], `profile.positions.${pos}`)
    let priorTier = 1
    normalizedPositions[pos] = values.map((entry, index) => {
      const item = record(entry, `profile.positions.${pos}[${index}]`)
      exactKeys(item, ["player_id", "user_tier"], `profile.positions.${pos}[${index}]`)
      const id = playerId(item.player_id, `profile.positions.${pos}[${index}].player_id`)
      if (seen.has(id)) fail(`profile: duplicate player ${id}`, "duplicate_player")
      seen.add(id)
      const tier = integer(item.user_tier, `profile.positions.${pos}[${index}].user_tier`, 1, MAX_PLAYERS)
      if ((index === 0 && tier !== 1) || tier < priorTier || tier > priorTier + 1) {
        fail(`profile.positions.${pos}: tiers must be contiguous nondecreasing groups`)
      }
      priorTier = tier
      return {player_id: id, user_tier: tier}
    })
  }
  const unresolvedValues = safeArray(root.unresolved_players, "profile.unresolved_players")
  const unresolved = unresolvedValues.map((entry, index) => {
    const item = record(entry, `profile.unresolved_players[${index}]`)
    exactKeys(item, ["player_id", "last_position", "last_user_rank", "last_user_tier", "reason"], `profile.unresolved_players[${index}]`)
    const id = playerId(item.player_id, `profile.unresolved_players[${index}].player_id`)
    if (seen.has(id)) fail(`profile: duplicate player ${id}`, "duplicate_player")
    seen.add(id)
    return {
      player_id: id,
      last_position: position(item.last_position, `profile.unresolved_players[${index}].last_position`),
      last_user_rank: integer(item.last_user_rank, `profile.unresolved_players[${index}].last_user_rank`, 1, MAX_PLAYERS),
      last_user_tier: integer(item.last_user_tier, `profile.unresolved_players[${index}].last_user_tier`, 1, MAX_PLAYERS),
      reason: unresolvedReason(item.reason, `profile.unresolved_players[${index}].reason`),
    }
  })
  if (seen.size > MAX_PROFILE_PLAYERS) {
    fail(
      `profile may contain at most ${MAX_PROFILE_PLAYERS} total players`,
      "profile_capacity_exceeded",
    )
  }
  const provenance = record(root.provenance, "profile.provenance")
  exactKeys(provenance, ["binding_state", "base_source_id", "base_provider_id", "source_observation_fingerprint", "source_season", "source_scoring_type", "player_universe_fingerprint"], "profile.provenance")
  if (provenance.binding_state !== "bound" && provenance.binding_state !== "legacy_unbound") {
    fail("profile.provenance.binding_state: unsupported")
  }
  const isBound = provenance.binding_state === "bound"
  if (!isBound && [provenance.base_source_id, provenance.base_provider_id, provenance.source_observation_fingerprint, provenance.source_season, provenance.source_scoring_type, provenance.player_universe_fingerprint].some(field => field !== null)) {
    fail("profile.provenance: legacy_unbound values must be null")
  }
  if (isBound && [provenance.base_source_id, provenance.base_provider_id, provenance.source_observation_fingerprint, provenance.source_season, provenance.source_scoring_type, provenance.player_universe_fingerprint].some(field => field === null)) {
    fail("profile.provenance: bound values are required")
  }
  const sourceScoring = provenance.source_scoring_type === null ? null : scoring(provenance.source_scoring_type, "profile.provenance.source_scoring_type")
  if (sourceScoring !== null && sourceScoring !== scoringType) fail("profile.provenance: scoring conflict", "scoring_conflict")
  return {
    schema_version: 2,
    rebase_version: PROFILE_REBASE_VERSION,
    scoring_type: scoringType,
    positions: normalizedPositions,
    unresolved_players: unresolved,
    provenance: {
      binding_state: provenance.binding_state as "bound" | "legacy_unbound",
      base_source_id: nullableString(provenance.base_source_id, "profile.provenance.base_source_id"),
      base_provider_id: nullableString(provenance.base_provider_id, "profile.provenance.base_provider_id"),
      source_observation_fingerprint: provenance.source_observation_fingerprint === null ? null : hash(provenance.source_observation_fingerprint, "profile.provenance.source_observation_fingerprint"),
      source_season: provenance.source_season === null ? null : integer(provenance.source_season, "profile.provenance.source_season", 2000, 2100),
      source_scoring_type: sourceScoring,
      player_universe_fingerprint: provenance.player_universe_fingerprint === null ? null : hash(provenance.player_universe_fingerprint, "profile.provenance.player_universe_fingerprint"),
    },
  }
}

const validateUniverseRows = (value: unknown, label: string, minimum = 0) => {
  const values = safeArray(value, label, MAX_PLAYERS, minimum)
  const seenIds = new Set<string>()
  const seenRanks = new Set<number>()
  return values.map((entry, index) => {
    const item = record(entry, `${label}[${index}]`)
    exactKeys(item, ["player_id", "position", "overall_rank"], `${label}[${index}]`)
    const id = playerId(item.player_id, `${label}[${index}].player_id`)
    const rank = integer(item.overall_rank, `${label}[${index}].overall_rank`, 1, 10000)
    if (seenIds.has(id)) fail(`${label}: duplicate player ${id}`, "duplicate_target_player")
    if (seenRanks.has(rank)) fail(`${label}: duplicate overall rank ${rank}`, "ambiguous_target")
    seenIds.add(id); seenRanks.add(rank)
    return {player_id: id, position: position(item.position, `${label}[${index}].position`), overall_rank: rank}
  })
}

export const playerUniverseFingerprint = (players: unknown): string => {
  const rows = validateUniverseRows(players, "players")
    .map(({player_id, position: pos}) => ({player_id, position: pos}))
    .sort((left, right) => compareCanonicalId(left.player_id, right.player_id))
  return fingerprint(rows)
}

export const profileFingerprint = (profile: unknown): string => fingerprint(validateRankingProfileV2(profile))

const validateTarget = (value: unknown): TargetPlayerUniverse => {
  if (value === null || value === undefined) fail("target source is unavailable", "target_unavailable")
  const target = record(value, "target")
  exactKeys(target, ["source_id", "provider_id", "season", "scoring_type", "source_observation_fingerprint", "expected_source_observation_fingerprint", "player_universe_fingerprint", "expected_player_universe_fingerprint", "players"], "target")
  const players = validateUniverseRows(target.players, "target.players", 1)
  const normalized: TargetPlayerUniverse = {
    source_id: nonempty(target.source_id, "target.source_id"),
    provider_id: nonempty(target.provider_id, "target.provider_id"),
    season: integer(target.season, "target.season", 2000, 2100),
    scoring_type: scoring(target.scoring_type, "target.scoring_type"),
    source_observation_fingerprint: hash(target.source_observation_fingerprint, "target.source_observation_fingerprint"),
    expected_source_observation_fingerprint: hash(target.expected_source_observation_fingerprint, "target.expected_source_observation_fingerprint"),
    player_universe_fingerprint: hash(target.player_universe_fingerprint, "target.player_universe_fingerprint"),
    expected_player_universe_fingerprint: hash(target.expected_player_universe_fingerprint, "target.expected_player_universe_fingerprint"),
    players,
  }
  if (normalized.source_observation_fingerprint !== normalized.expected_source_observation_fingerprint) {
    fail("target: source observation fingerprint mismatch", "source_fingerprint_conflict")
  }
  if (normalized.player_universe_fingerprint !== normalized.expected_player_universe_fingerprint
      || playerUniverseFingerprint(normalized.players) !== normalized.player_universe_fingerprint) {
    fail("target: player universe fingerprint mismatch", "universe_fingerprint_conflict")
  }
  return normalized
}

const compactTiers = (rows: Array<{player_id: string; user_tier: number}>) => {
  const mapping = new Map<number, number>()
  return rows.map(row => {
    if (!mapping.has(row.user_tier)) mapping.set(row.user_tier, mapping.size + 1)
    return {player_id: row.player_id, user_tier: mapping.get(row.user_tier)!}
  })
}

/** Pure preview over target data already verified by its server-side authority. */
export const previewProfileRebase = (profileValue: unknown, targetValue: unknown): RankingProfileRebasePreview => {
  const profile = validateRankingProfileV2(profileValue)
  const target = validateTarget(targetValue)
  if (profile.scoring_type !== target.scoring_type) fail("target: scoring conflict", "scoring_conflict")
  const targetById = new Map(target.players.map(row => [row.player_id, row]))
  const originalIds = new Set<string>()
  const unresolvedIds = new Set(profile.unresolved_players.map(row => row.player_id))
  const outputPositions = {} as RankingProfileV2["positions"]
  const newUnresolved = profile.unresolved_players.map(row => ({...row}))
  const removed: string[] = []
  const positionConflicts: string[] = []
  for (const pos of POSITIONS) {
    const retained: Array<{player_id: string; user_tier: number}> = []
    profile.positions[pos].forEach((row, index) => {
      originalIds.add(row.player_id)
      const candidate = targetById.get(row.player_id)
      if (!candidate) {
        removed.push(row.player_id)
        newUnresolved.push({player_id: row.player_id, last_position: pos, last_user_rank: index + 1, last_user_tier: row.user_tier, reason: "missing_from_target"})
      } else if (candidate.position !== pos) {
        positionConflicts.push(row.player_id)
        newUnresolved.push({player_id: row.player_id, last_position: pos, last_user_rank: index + 1, last_user_tier: row.user_tier, reason: "position_changed"})
      } else {
        retained.push({...row})
      }
    })
    outputPositions[pos] = compactTiers(retained)
  }
  const additions = target.players
    .filter(row => !originalIds.has(row.player_id) && !unresolvedIds.has(row.player_id))
    .sort((left, right) => left.overall_rank - right.overall_rank || compareCanonicalId(left.player_id, right.player_id))
  for (const pos of POSITIONS) {
    const positional = additions.filter(row => row.position === pos)
    if (!positional.length) continue
    const tailTier = outputPositions[pos].length
      ? outputPositions[pos][outputPositions[pos].length - 1].user_tier + 1 : 1
    outputPositions[pos].push(...positional.map(row => ({player_id: row.player_id, user_tier: tailTier})))
  }
  const output = validateRankingProfileV2({
    schema_version: 2,
    rebase_version: PROFILE_REBASE_VERSION,
    scoring_type: profile.scoring_type,
    positions: outputPositions,
    unresolved_players: newUnresolved,
    provenance: {
      binding_state: "bound",
      base_source_id: target.source_id,
      base_provider_id: target.provider_id,
      source_observation_fingerprint: target.source_observation_fingerprint,
      source_season: target.season,
      source_scoring_type: target.scoring_type,
      player_universe_fingerprint: target.player_universe_fingerprint,
    },
  })
  const inputFingerprint = profileFingerprint(profile)
  const outputFingerprint = profileFingerprint(output)
  const targetRankFingerprint = fingerprint({
    source_id: target.source_id,
    provider_id: target.provider_id,
    season: target.season,
    scoring_type: target.scoring_type,
    source_observation_fingerprint: target.source_observation_fingerprint,
    players: [...target.players].sort((left, right) => (
      compareCanonicalId(left.player_id, right.player_id)
    )),
  })
  const added = additions.map(row => row.player_id).sort()
  removed.sort(); positionConflicts.sort()
  const unresolved = newUnresolved.map(row => row.player_id).sort()
  return {
    schema_version: 1,
    rebase_version: PROFILE_REBASE_VERSION,
    input_profile_fingerprint: inputFingerprint,
    output_profile_fingerprint: outputFingerprint,
    target_source_observation_fingerprint: target.source_observation_fingerprint,
    target_player_universe_fingerprint: target.player_universe_fingerprint,
    preview_key: fingerprint({
      input_profile_fingerprint: inputFingerprint,
      target_source_metadata: {
        source_id: target.source_id,
        provider_id: target.provider_id,
        season: target.season,
        scoring_type: target.scoring_type,
        source_observation_fingerprint: target.source_observation_fingerprint,
      },
      target_rank_fingerprint: targetRankFingerprint,
      target_player_universe_fingerprint: target.player_universe_fingerprint,
      output_profile_fingerprint: outputFingerprint,
      rebase_version: PROFILE_REBASE_VERSION,
    }),
    logically_idempotent: true,
    would_change: inputFingerprint !== outputFingerprint,
    counts: {added: added.length, removed: removed.length, position_conflicts: positionConflicts.length, unresolved: unresolved.length},
    player_ids: {added, removed, position_conflicts: positionConflicts, unresolved},
    profile: output,
  }
}

const legacyUnbound = (scoringType: ProfileScoringType, positions: RankingProfileV2["positions"], unresolved: RankingProfileV2["unresolved_players"]): RankingProfileV2 => validateRankingProfileV2({
  schema_version: 2,
  rebase_version: PROFILE_REBASE_VERSION,
  scoring_type: scoringType,
  positions,
  unresolved_players: unresolved,
  provenance: {binding_state: "legacy_unbound", base_source_id: null, base_provider_id: null, source_observation_fingerprint: null, source_season: null, source_scoring_type: null, player_universe_fingerprint: null},
})

const adaptLegacyPositions = (positionsValue: unknown, trustedUniverse: unknown, scoringType: ProfileScoringType): RankingProfileV2 => {
  const universe = validateUniverseRows(trustedUniverse, "trusted_universe")
  const universeById = new Map(universe.map(row => [row.player_id, row]))
  const positionsRecord = record(positionsValue, "legacy.positions")
  exactKeys(positionsRecord, POSITIONS, "legacy.positions")
  const output = {} as RankingProfileV2["positions"]
  const unresolved: RankingProfileV2["unresolved_players"] = []
  const seen = new Set<string>()
  for (const pos of POSITIONS) {
    const entries = safeArray(positionsRecord[pos], `legacy.positions.${pos}`)
    const active: Array<{player_id: string; user_tier: number}> = []
    let previousTier = 0
    entries.forEach((entry, index) => {
      const item = record(entry, `legacy.positions.${pos}[${index}]`)
      exactKeys(item, ["player_id", "rank", "user_tier"], `legacy.positions.${pos}[${index}]`)
      const id = playerId(item.player_id, `legacy.positions.${pos}[${index}].player_id`)
      if (seen.has(id)) fail(`legacy: duplicate player ${id}`, "duplicate_player")
      seen.add(id)
      const rank = integer(item.rank, `legacy.positions.${pos}[${index}].rank`, 1, MAX_PLAYERS)
      const tier = integer(item.user_tier, `legacy.positions.${pos}[${index}].user_tier`, 1, MAX_PLAYERS)
      if (rank !== index + 1) fail(`legacy.positions.${pos}: ranks must be consecutive`)
      if ((index === 0 && tier !== 1) || tier < previousTier || tier > previousTier + 1) {
        fail(`legacy.positions.${pos}: tiers must be contiguous nondecreasing groups`)
      }
      previousTier = tier
      const target = universeById.get(id)
      if (!target || target.position !== pos) {
        unresolved.push({player_id: id, last_position: pos, last_user_rank: rank, last_user_tier: tier, reason: target ? "position_changed" : "legacy_unknown"})
      } else active.push({player_id: id, user_tier: tier})
    })
    output[pos] = compactTiers(active)
  }
  return legacyUnbound(scoringType, output, unresolved)
}

export const adaptPortableV1ToProfileV2 = (input: unknown, trustedUniverse: unknown): RankingProfileV2 => {
  const root = record(input, "portable")
  if (root.schema_version === 2) return fail("portable: malformed v2 must not fall back", "malformed_v2")
  exactKeys(root, ["source_ranker", "scoring", "positions"], "portable")
  nonempty(root.source_ranker, "portable.source_ranker", 64)
  return adaptLegacyPositions(root.positions, trustedUniverse, scoring(root.scoring, "portable.scoring"))
}

export const adaptLegacyRankingsToProfileV2 = (input: unknown, trustedUniverse: unknown, scoringValue: unknown): RankingProfileV2 => {
  const scoringType = scoring(scoringValue, "scoring_type")
  const root = record(input, "rankings")
  if (root.schema_version === 2) return fail("rankings: malformed v2 must not fall back", "malformed_v2")
  const allowedRoot = ["players", "rankingsSummaries", "cachedAt", "season", "editedAt", "copiedRanker", "settings"]
  if (Object.keys(root).some(key => !allowedRoot.includes(key))) fail("rankings: unsupported field")
  const legacyPlayers = safeArray(root.players, "rankings.players")
  const byPosition: Record<ProfilePosition, Array<{player_id: string; rank: number; user_tier: number}>> = {
    QB: [],
    RB: [],
    WR: [],
    TE: [],
  }
  const seen = new Set<string>()
  legacyPlayers.forEach((value, index) => {
    const item = record(value, `rankings.players[${index}]`)
    const id = playerId(item.id, `rankings.players[${index}].id`)
    if (seen.has(id)) fail(`rankings: duplicate player ${id}`, "duplicate_player")
    seen.add(id)
    if (!POSITIONS.includes(item.position as ProfilePosition)) return
    const ranks = record(item.ranks, `rankings.players[${index}].ranks`)
    const custom = ranks.Custom
    if (custom === undefined) return
    const customRank = record(custom, `rankings.players[${index}].ranks.Custom`)
    const rankField = scoringType === "ppr" ? "pprPositionRank" : "standardPositionRank"
    const tierField = scoringType === "ppr" ? "pprPositionTier" : "standardPositionTier"
    const rankValue = integer(customRank[rankField], `rankings.players[${index}].ranks.Custom.${rankField}`, 1, MAX_PLAYERS)
    const tierRecord = record(customRank[tierField], `rankings.players[${index}].ranks.Custom.${tierField}`)
    const tierValue = integer(tierRecord.tierNumber, `rankings.players[${index}].ranks.Custom.${tierField}.tierNumber`, 1, MAX_PLAYERS)
    byPosition[item.position as ProfilePosition].push({player_id: id, rank: rankValue, user_tier: tierValue})
  })
  for (const pos of POSITIONS) {
    byPosition[pos].sort((left, right) => left.rank - right.rank || compareCanonicalId(left.player_id, right.player_id))
    if (byPosition[pos].some((row, index) => row.rank !== index + 1)) fail(`rankings ${pos}: Custom ranks are ambiguous`)
  }
  return adaptLegacyPositions(byPosition, trustedUniverse, scoringType)
}
