import { cloneDeep } from "lodash"

import {
  BoardSettings,
  DataRanker,
  FantasyPosition,
  FantasyRanker,
  FantasySettings,
  Player,
  PlayerRanking,
  PlayerTarget,
  Rankings,
  ThirdPartyADPRanker,
  ThirdPartyRanker,
  Tier,
} from "../types"
import {
  metricValueFor,
  positionRankFor,
  positionTierFor,
  scoringFormatFor,
} from "./scoringFormat"
import type { DraftPlanDocument } from "./realtime/contracts"
import {
  adaptPortableV1ToProfileV2,
  RankingProfileV2,
  validateRankingProfileV2,
} from "./rankingProfileV2"

/**
 * The portable file deliberately contains only user-authored state. It is not
 * a backup of a draft session, API response, or browser configuration.
 */
export const PORTABLE_DATA_SCHEMA = "drafty.local-data"
export const PORTABLE_DATA_V1_VERSION = 1 as const
export const PORTABLE_DATA_VERSION = 2 as const
export const PORTABLE_DATA_MAX_BYTES = 512 * 1024
export const PORTABLE_DATA_MAX_PLAYERS_PER_POSITION = 200
export const PORTABLE_DATA_MAX_TARGETS = 100
export const PORTABLE_DATA_MAX_PLAN_ENTRIES = 100
export const PORTABLE_DATA_MAX_TEXT_LENGTH = 500

const utf8ByteLength = (value: string) => (
  typeof TextEncoder !== "undefined"
    ? new TextEncoder().encode(value).length
    : unescape(encodeURIComponent(value)).length
)

const POSITIONS = [
  FantasyPosition.QUARTERBACK,
  FantasyPosition.RUNNING_BACK,
  FantasyPosition.WIDE_RECEIVER,
  FantasyPosition.TIGHT_END,
] as const

type PortablePosition = typeof POSITIONS[number]
type PortableScoring = "ppr" | "half_ppr" | "standard"

export interface PortableRankingEntry {
  player_id: string
  rank: number
  user_tier: number
}

export interface PortableRankingSnapshot {
  source_ranker: FantasyRanker
  scoring: PortableScoring
  positions: Record<PortablePosition, PortableRankingEntry[]>
}

export interface PortablePreferences {
  settings: FantasySettings
  board: BoardSettings
  my_pick_num: number
  player_targets: Array<{
    player_id: string
    target_as_early_as_round: number
  }>
}

export interface PortableDraftPlan {
  entries: string[]
}

export interface PortableDataPackageV1 {
  schema: typeof PORTABLE_DATA_SCHEMA
  version: typeof PORTABLE_DATA_V1_VERSION
  exported_at: string
  data: {
    preferences: PortablePreferences
    custom_rankings: PortableRankingSnapshot | null
    draft_plan: PortableDraftPlan | null
  }
}

export interface PortableDataPackageV2 {
  schema: typeof PORTABLE_DATA_SCHEMA
  version: typeof PORTABLE_DATA_VERSION
  exported_at: string
  data: {
    preferences: PortablePreferences
    ranking_profile: RankingProfileV2 | null
    draft_plan: PortableDraftPlan | null
  }
}

export type PortableDataPackage = PortableDataPackageV1 | PortableDataPackageV2

export interface PortableDataValidationContext {
  /** The current downloaded/embedded player library is the identity authority. */
  playersById: ReadonlyMap<string, Player>
  /** API-published expert names are authority for portable board references. */
  rankers?: ReadonlySet<string>
}

export class PortableDataValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PortableDataValidationError"
  }
}

const fail = (message: string): never => {
  throw new PortableDataValidationError(message)
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value)
  && typeof value === "object"
  && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype
    || Object.getPrototypeOf(value) === null)
)

const hasOnlyKeys = (
  value: Record<string, unknown>,
  keys: readonly string[],
  label: string,
): void => {
  const allowed = new Set(keys)
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(`${label} contains unsupported field "${key}"`)
  }
}

const recordValue = (value: unknown, label: string): Record<string, unknown> => {
  if (!isRecord(value)) fail(`${label} must be an object`)
  return value as Record<string, unknown>
}

const stringValue = (
  value: unknown,
  label: string,
  maxLength = 128,
): string => {
  if (typeof value !== "string" || !value || value.length > maxLength) {
    fail(`${label} must be a non-empty string up to ${maxLength} characters`)
  }
  return value as string
}

const integer = (
  value: unknown,
  label: string,
  min: number,
  max: number,
) => {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    fail(`${label} must be an integer from ${min} to ${max}`)
  }
  return value as number
}

const isPlayerId = (value: string) => /^[A-Za-z0-9:_-]+$/.test(value)

const legacySourceRankers = new Set<string>([
  ThirdPartyRanker.HARRIS,
  ThirdPartyRanker.ESPN,
  ThirdPartyRanker.FPROS,
])
const legacyBoardRankers = new Set<string>([
  ...Object.values(ThirdPartyRanker),
  ...Object.values(DataRanker),
])
const adpRankers = new Set<string>(Object.values(ThirdPartyADPRanker))

const validateSettings = (value: unknown): FantasySettings => {
  const record = recordValue(value, "preferences.settings")
  hasOnlyKeys(record, [
    "ppr", "scoringFormat", "numTeams", "numStartingQbs", "numStartingRbs", "numStartingWrs",
    "numStartingTes", "numFlex", "numBenchPlayers",
  ], "preferences.settings")
  if (typeof record.ppr !== "boolean") fail("preferences.settings.ppr must be boolean")
  if (
    record.scoringFormat !== undefined
    && record.scoringFormat !== "standard"
    && record.scoringFormat !== "half_ppr"
    && record.scoringFormat !== "ppr"
  ) fail("preferences.settings.scoringFormat is unsupported")
  const settings: FantasySettings = {
    ppr: record.ppr as boolean,
    ...(record.scoringFormat === undefined ? {} : {
      scoringFormat: record.scoringFormat as PortableScoring,
    }),
    numTeams: integer(record.numTeams, "preferences.settings.numTeams", 10, 14),
    numStartingQbs: integer(record.numStartingQbs, "preferences.settings.numStartingQbs", 0, 4),
    numStartingRbs: integer(record.numStartingRbs, "preferences.settings.numStartingRbs", 0, 6),
    numStartingWrs: integer(record.numStartingWrs, "preferences.settings.numStartingWrs", 0, 6),
    numStartingTes: integer(record.numStartingTes, "preferences.settings.numStartingTes", 0, 3),
    numFlex: integer(record.numFlex, "preferences.settings.numFlex", 0, 6),
    numBenchPlayers: integer(record.numBenchPlayers, "preferences.settings.numBenchPlayers", 0, 25),
  }
  if ((scoringFormatFor(settings) !== "standard") !== settings.ppr) {
    fail("preferences.settings.ppr must agree with scoringFormat")
  }
  if (![10, 12, 14].includes(settings.numTeams)) {
    fail("preferences.settings.numTeams must be one of 10, 12, or 14")
  }
  return settings
}

const validateBoardSettings = (
  value: unknown,
  context: PortableDataValidationContext,
): BoardSettings => {
  const record = recordValue(value, "preferences.board")
  hasOnlyKeys(record, ["ranker", "adpRanker"], "preferences.board")
  const ranker = stringValue(record.ranker, "preferences.board.ranker", 64)
  const adpRanker = stringValue(record.adpRanker, "preferences.board.adpRanker", 64)
  const supportedRankers = new Set([
    ...Array.from(legacyBoardRankers),
    ...Array.from(context.rankers || []),
  ])
  if (!supportedRankers.has(ranker)) fail("preferences.board.ranker is unsupported")
  if (!adpRankers.has(adpRanker)) fail("preferences.board.adpRanker is unsupported")
  return { ranker: ranker as FantasyRanker, adpRanker: adpRanker as ThirdPartyADPRanker }
}

const validateRankingSnapshot = (
  value: unknown,
  context: PortableDataValidationContext,
): PortableRankingSnapshot => {
  const record = recordValue(value, "custom_rankings")
  hasOnlyKeys(record, ["source_ranker", "scoring", "positions"], "custom_rankings")
  const sourceRanker = stringValue(record.source_ranker, "custom_rankings.source_ranker", 64)
  const supportedSourceRankers = new Set([
    ...Array.from(legacySourceRankers),
    ...Array.from(context.rankers || []),
  ])
  if (!supportedSourceRankers.has(sourceRanker)) {
    fail("custom_rankings.source_ranker is unsupported")
  }
  if (record.scoring !== "ppr" && record.scoring !== "half_ppr" && record.scoring !== "standard") {
    fail("custom_rankings.scoring must be ppr, half_ppr, or standard")
  }
  const positionRecord = recordValue(record.positions, "custom_rankings.positions")
  hasOnlyKeys(positionRecord, POSITIONS, "custom_rankings.positions")
  for (const position of POSITIONS) {
    if (!Array.isArray(positionRecord[position])) {
      fail(`custom_rankings.positions.${position} must be an array`)
    }
  }

  const seen = new Set<string>()
  const positions = {} as Record<PortablePosition, PortableRankingEntry[]>
  for (const position of POSITIONS) {
    const entries = positionRecord[position] as unknown[]
    if (entries.length > PORTABLE_DATA_MAX_PLAYERS_PER_POSITION) {
      fail(`custom_rankings.positions.${position} has too many players`)
    }
    let previousTier = 1
    positions[position] = entries.map((entry, index) => {
      const entryRecord = recordValue(entry, `custom_rankings.positions.${position}[${index}]`)
      hasOnlyKeys(entryRecord, ["player_id", "rank", "user_tier"], `custom_rankings.positions.${position}[${index}]`)
      const playerId = stringValue(entryRecord.player_id, `custom_rankings.positions.${position}[${index}].player_id`, 64)
      if (!isPlayerId(playerId)) fail(`custom_rankings.positions.${position}[${index}].player_id is invalid`)
      if (seen.has(playerId)) fail(`custom_rankings contains duplicate player ${playerId}`)
      seen.add(playerId)
      const player = context.playersById.get(playerId)
      if (!player) fail(`custom_rankings references unknown player ${playerId}`)
      if ((player as Player).position !== position) fail(`custom_rankings player ${playerId} is not a ${position}`)
      const rank = integer(entryRecord.rank, `custom_rankings.positions.${position}[${index}].rank`, 1, PORTABLE_DATA_MAX_PLAYERS_PER_POSITION)
      if (rank !== index + 1) fail(`custom_rankings.positions.${position} ranks must be consecutive`)
      const userTier = integer(entryRecord.user_tier, `custom_rankings.positions.${position}[${index}].user_tier`, 1, PORTABLE_DATA_MAX_PLAYERS_PER_POSITION)
      if (index === 0 && userTier !== 1) fail(`custom_rankings.positions.${position} must start at tier 1`)
      if (userTier < previousTier || userTier > previousTier + 1) {
        fail(`custom_rankings.positions.${position} tiers must be consecutive`)
      }
      previousTier = userTier
      return { player_id: playerId, rank, user_tier: userTier }
    })
  }
  return {
    source_ranker: sourceRanker,
    scoring: record.scoring as PortableScoring,
    positions,
  }
}

const validatePortableRankingProfileV2 = (
  value: unknown,
  context: PortableDataValidationContext,
): RankingProfileV2 => {
  let profile: RankingProfileV2
  try {
    profile = validateRankingProfileV2(value)
  } catch (error) {
    fail(error instanceof Error ? error.message : "ranking_profile is invalid")
  }
  for (const position of POSITIONS) {
    profile!.positions[position].forEach((entry, index) => {
      const player = context.playersById.get(entry.player_id)
      if (!player) {
        fail(`ranking_profile.positions.${position}[${index}] references unknown player ${entry.player_id}`)
        return
      }
      if (player.position !== position) {
        fail(`ranking_profile player ${entry.player_id} is not a ${position}`)
      }
    })
  }
  return profile!
}

const validatePreferences = (
  value: unknown,
  context: PortableDataValidationContext,
): PortablePreferences => {
  const record = recordValue(value, "preferences")
  hasOnlyKeys(record, ["settings", "board", "my_pick_num", "player_targets"], "preferences")
  const settings = validateSettings(record.settings)
  const board = validateBoardSettings(record.board, context)
  const myPickNum = integer(record.my_pick_num, "preferences.my_pick_num", 1, settings.numTeams)
  if (!Array.isArray(record.player_targets) || record.player_targets.length > PORTABLE_DATA_MAX_TARGETS) {
    fail("preferences.player_targets must be a bounded array")
  }
  const seen = new Set<string>()
  const rawTargets = record.player_targets as unknown[]
  const playerTargets = rawTargets.map((target: unknown, index: number) => {
    const targetRecord = recordValue(target, `preferences.player_targets[${index}]`)
    hasOnlyKeys(targetRecord, ["player_id", "target_as_early_as_round"], `preferences.player_targets[${index}]`)
    const playerId = stringValue(targetRecord.player_id, `preferences.player_targets[${index}].player_id`, 64)
    if (!isPlayerId(playerId) || !context.playersById.has(playerId)) {
      fail(`preferences.player_targets references unknown player ${playerId}`)
    }
    if (seen.has(playerId)) fail(`preferences.player_targets contains duplicate player ${playerId}`)
    seen.add(playerId)
    return {
      player_id: playerId,
      target_as_early_as_round: integer(
        targetRecord.target_as_early_as_round,
        `preferences.player_targets[${index}].target_as_early_as_round`,
        1,
        25,
      ),
    }
  })
  return { settings, board, my_pick_num: myPickNum, player_targets: playerTargets }
}

const validateDraftPlan = (value: unknown): PortableDraftPlan | null => {
  if (value === null) return null
  const record = recordValue(value, "draft_plan")
  hasOnlyKeys(record, ["entries"], "draft_plan")
  if (!Array.isArray(record.entries) || record.entries.length > PORTABLE_DATA_MAX_PLAN_ENTRIES) {
    fail("draft_plan.entries must be a bounded array")
  }
  return {
    entries: (record.entries as unknown[]).map((entry: unknown, index: number) => {
      const text = stringValue(entry, `draft_plan.entries[${index}]`, PORTABLE_DATA_MAX_TEXT_LENGTH).trim()
      if (!text) fail(`draft_plan.entries[${index}] must not be blank`)
      return text
    }),
  }
}

/** Parse and normalize a package before the UI is allowed to mutate anything. */
export const parsePortableDataPackage = (
  serialized: string,
  context: PortableDataValidationContext,
): PortableDataPackage => {
  if (utf8ByteLength(serialized) > PORTABLE_DATA_MAX_BYTES) {
    fail("Import file is larger than 512 KB")
  }
  let value: unknown
  try {
    value = JSON.parse(serialized) as unknown
  } catch {
    fail("Import file is not valid JSON")
  }
  const packageRecord = recordValue(value, "Import file")
  hasOnlyKeys(packageRecord, ["schema", "version", "exported_at", "data"], "package")
  if (packageRecord.schema !== PORTABLE_DATA_SCHEMA) fail("This is not a Drafty local-data package")
  if (
    packageRecord.version !== PORTABLE_DATA_V1_VERSION
    && packageRecord.version !== PORTABLE_DATA_VERSION
  ) {
    fail("This package version is unsupported; export again from a compatible Drafty version")
  }
  const exportedAt = stringValue(packageRecord.exported_at, "package.exported_at", 64)
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(exportedAt)
    || !Number.isFinite(Date.parse(exportedAt))
    || new Date(exportedAt).toISOString() !== exportedAt
  ) fail("package.exported_at must be a canonical ISO date")
  const dataRecord = recordValue(packageRecord.data, "package.data")
  const preferences = validatePreferences(dataRecord.preferences, context)
  const draftPlan = validateDraftPlan(dataRecord.draft_plan)
  if (packageRecord.version === PORTABLE_DATA_V1_VERSION) {
    hasOnlyKeys(dataRecord, ["preferences", "custom_rankings", "draft_plan"], "package.data")
    const customRankings = dataRecord.custom_rankings === null
      ? null
      : validateRankingSnapshot(dataRecord.custom_rankings, context)
    if (customRankings && customRankings.scoring !== scoringFormatFor(preferences.settings)) {
      fail("custom_rankings.scoring must match preferences.settings scoring format")
    }
    if (preferences.board.ranker === ThirdPartyRanker.CUSTOM && !customRankings) {
      fail("Custom board ranking requires custom_rankings")
    }
    return {
      schema: PORTABLE_DATA_SCHEMA,
      version: PORTABLE_DATA_V1_VERSION,
      exported_at: exportedAt,
      data: {preferences, custom_rankings: customRankings, draft_plan: draftPlan},
    }
  }

  // Version dispatch is final: malformed claimed-v2 data is never retried as
  // a portable-v1 snapshot.
  hasOnlyKeys(dataRecord, ["preferences", "ranking_profile", "draft_plan"], "package.data")
  const rankingProfile = dataRecord.ranking_profile === null
    ? null
    : validatePortableRankingProfileV2(dataRecord.ranking_profile, context)
  if (rankingProfile && rankingProfile.scoring_type !== scoringFormatFor(preferences.settings)) {
    fail("ranking_profile.scoring_type must match preferences.settings scoring format")
  }
  if (preferences.board.ranker === ThirdPartyRanker.CUSTOM && !rankingProfile) {
    fail("Custom board ranking requires ranking_profile")
  }
  return {
    schema: PORTABLE_DATA_SCHEMA,
    version: PORTABLE_DATA_VERSION,
    exported_at: exportedAt,
    data: {preferences, ranking_profile: rankingProfile, draft_plan: draftPlan},
  }
}

/**
 * Export is validated through the same canonical parser as import. This keeps
 * a stale browser profile from generating a package that this version would
 * later reject, while preserving deterministic pretty JSON field ordering.
 */
export const serializePortableDataPackage = (
  value: PortableDataPackage,
  context: PortableDataValidationContext,
): string => JSON.stringify(
  parsePortableDataPackage(JSON.stringify(value), context),
  null,
  2,
)

const tierFor = (
  entries: PortableRankingEntry[],
  tierNumber: number,
  players: Map<string, Player>,
  sourceRanker: FantasyRanker,
  scoring: PortableScoring,
): Tier => {
  const members = entries.filter(entry => entry.user_tier === tierNumber)
  const first = members[0]
  const last = members[members.length - 1]
  const valueOf = (entry: PortableRankingEntry) => {
    const rank = players.get(entry.player_id)?.ranks[sourceRanker]
    return metricValueFor(rank, scoring) || 0
  }
  return {
    tierNumber,
    upperLimitPlayerIdx: first.rank - 1,
    upperLimitValue: valueOf(first),
    lowerLimitPlayerIdx: last.rank - 1,
    lowerLimitValue: valueOf(last),
  }
}

/** Reconstruct lean positional ordering onto the current trusted player dataset. */
export const applyPortableRankingSnapshot = (
  rankings: Rankings,
  snapshot: PortableRankingSnapshot | null,
): Rankings => {
  const players = cloneDeep(rankings.players)
  const playersById = new Map(players.map(player => [player.id, player]))
  players.forEach(player => {
    delete player.ranks[ThirdPartyRanker.CUSTOM]
  })
  if (!snapshot) {
    return { ...rankings, players, copiedRanker: undefined, editedAt: new Date().toISOString() }
  }
  for (const position of POSITIONS) {
    const entries = snapshot.positions[position]
    const tiers = new Map<number, Tier>()
    entries.forEach(entry => {
      if (!tiers.has(entry.user_tier)) {
        tiers.set(entry.user_tier, tierFor(entries, entry.user_tier, playersById, snapshot.source_ranker, snapshot.scoring))
      }
    })
    entries.forEach(entry => {
      const player = playersById.get(entry.player_id)
      if (!player) return
      const source = player.ranks[snapshot.source_ranker]
        || Object.values(player.ranks)[0]
      if (!source) return
      const custom: PlayerRanking = {
        ...source,
        playerId: player.id,
        ranker: ThirdPartyRanker.CUSTOM,
        copiedRanker: snapshot.source_ranker,
        position,
        standardPositionRank: snapshot.scoring === "standard" ? entry.rank : source.standardPositionRank,
        halfPprPositionRank: snapshot.scoring === "half_ppr" ? entry.rank : source.halfPprPositionRank,
        pprPositionRank: snapshot.scoring === "ppr" ? entry.rank : source.pprPositionRank,
        standardPositionTier: snapshot.scoring === "standard" ? tiers.get(entry.user_tier) : source.standardPositionTier,
        halfPprPositionTier: snapshot.scoring === "half_ppr" ? tiers.get(entry.user_tier) : source.halfPprPositionTier,
        pprPositionTier: snapshot.scoring === "ppr" ? tiers.get(entry.user_tier) : source.pprPositionTier,
      }
      player.ranks[ThirdPartyRanker.CUSTOM] = custom
    })
  }
  return {
    ...rankings,
    players,
    copiedRanker: snapshot.source_ranker,
    editedAt: new Date().toISOString(),
  }
}

export const applyRankingProfileV2Snapshot = (
  rankings: Rankings,
  profile: RankingProfileV2 | null,
  sourceRanker: FantasyRanker = ThirdPartyRanker.HARRIS,
): Rankings => applyPortableRankingSnapshot(
  rankings,
  profile ? {
    source_ranker: sourceRanker,
    scoring: profile.scoring_type,
    positions: Object.fromEntries(POSITIONS.map(position => [
      position,
      profile.positions[position].map((entry, index) => ({
        ...entry,
        rank: index + 1,
      })),
    ])) as PortableRankingSnapshot["positions"],
  } : null,
)

const trustedUniverseFor = (context: PortableDataValidationContext) => (
  Array.from(context.playersById.values())
    .filter(player => POSITIONS.includes(player.position as PortablePosition))
    .map((player, index) => ({
      player_id: player.id,
      position: player.position,
      overall_rank: index + 1,
    }))
)

export const portableRankingProfile = (
  value: PortableDataPackage,
  context: PortableDataValidationContext,
): RankingProfileV2 | null => {
  if (value.version === PORTABLE_DATA_VERSION) {
    return value.data.ranking_profile
  }
  if (!value.data.custom_rankings) return null
  return adaptPortableV1ToProfileV2(
    value.data.custom_rankings,
    trustedUniverseFor(context),
  )
}

export const portableRankingSource = (
  value: PortableDataPackage,
): FantasyRanker => (
  value.version === PORTABLE_DATA_V1_VERSION && value.data.custom_rankings
    ? value.data.custom_rankings.source_ranker
    : ThirdPartyRanker.HARRIS
)

const customRankFor = (player: Player) => player.ranks[ThirdPartyRanker.CUSTOM]

export const createPortableDataPackage = ({
  rankings,
  rankingProfile = null,
  settings,
  boardSettings,
  myPickNum,
  playerTargets,
  plan,
  now = new Date().toISOString(),
}: {
  rankings: Rankings
  rankingProfile?: RankingProfileV2 | null
  settings: FantasySettings
  boardSettings: BoardSettings
  myPickNum: number
  playerTargets: PlayerTarget[]
  plan: DraftPlanDocument | null
  now?: string
}): PortableDataPackageV2 => {
  const hasCustomRanks = rankings.players.some(player => Boolean(customRankFor(player)))
  const shouldExportProfile = hasCustomRanks || rankingProfile !== null
  const scoring: PortableScoring = scoringFormatFor(settings)
  const positions = {} as Record<PortablePosition, PortableRankingEntry[]>
  for (const position of POSITIONS) {
    const positionPlayers = rankings.players
      .filter(player => player.position === position && Boolean(customRankFor(player)))
      .sort((left, right) => {
        const leftRank = positionRankFor(customRankFor(left), scoring)
        const rightRank = positionRankFor(customRankFor(right), scoring)
        return (leftRank || Number.MAX_SAFE_INTEGER) - (rightRank || Number.MAX_SAFE_INTEGER)
          || left.id.localeCompare(right.id)
      })
    let normalizedTier = 1
    let previousTier: number | undefined
    positions[position] = positionPlayers.map((player, index) => {
      const rawTier = positionTierFor(customRankFor(player), scoring)?.tierNumber
      if (index > 0 && rawTier !== undefined && rawTier !== previousTier) normalizedTier += 1
      previousTier = rawTier
      return { player_id: player.id, rank: index + 1, user_tier: normalizedTier }
    })
  }
  const baseProfile = rankingProfile
    ? validateRankingProfileV2(rankingProfile)
    : null
  const canonicalProfile = shouldExportProfile ? validateRankingProfileV2({
    schema_version: 2,
    rebase_version: "profile_rebase_v1",
    scoring_type: scoring,
    positions: Object.fromEntries(POSITIONS.map(position => [
      position,
      positions[position].map(({player_id, user_tier}) => ({
        player_id,
        user_tier,
      })),
    ])),
    unresolved_players: baseProfile?.scoring_type === scoring
      ? baseProfile.unresolved_players
      : [],
    provenance: baseProfile?.scoring_type === scoring
      ? baseProfile.provenance
      : {
        binding_state: "legacy_unbound",
        base_source_id: null,
        base_provider_id: null,
        source_observation_fingerprint: null,
        source_season: null,
        source_scoring_type: null,
        player_universe_fingerprint: null,
      },
  }) : null
  return {
    schema: PORTABLE_DATA_SCHEMA,
    version: PORTABLE_DATA_VERSION,
    exported_at: now,
    data: {
      preferences: {
        settings: { ...settings },
        board: { ...boardSettings },
        my_pick_num: myPickNum,
        player_targets: playerTargets.map(target => ({
          player_id: target.playerId,
          target_as_early_as_round: target.targetAsEarlyAsRound,
        })),
      },
      ranking_profile: canonicalProfile,
      draft_plan: plan ? { entries: plan.entries.map(entry => entry.text) } : null,
    },
  }
}

export const portableDataSummary = (value: PortableDataPackage): string[] => {
  const profile = value.version === PORTABLE_DATA_VERSION
    ? value.data.ranking_profile
    : value.data.custom_rankings
  const rankingCount = profile
    ? POSITIONS.reduce((count, position) => count + profile.positions[position].length, 0)
    : 0
  const parts = [
    `league and board preferences`,
    `${value.data.preferences.player_targets.length} player target${value.data.preferences.player_targets.length === 1 ? "" : "s"}`,
    profile
      ? `${rankingCount} custom positional rank${rankingCount === 1 ? "" : "s"}`
      : "no custom rankings (current custom rankings will be cleared)",
  ]
  if (!value.data.draft_plan || value.data.draft_plan.entries.length === 0) {
    parts.push("an empty draft plan (the current session plan will be cleared)")
  } else {
    parts.push(`${value.data.draft_plan.entries.length} draft plan statement${value.data.draft_plan.entries.length === 1 ? "" : "s"}`)
  }
  return parts
}

/** Build a current-session plan without copying any prior session identity. */
export const createImportedDraftPlan = (
  draftSessionId: string,
  sourceEventCount: number,
  entries: string[],
  previous: DraftPlanDocument | null,
  now = new Date().toISOString(),
): DraftPlanDocument => ({
  schema_version: 1,
  draft_session_id: draftSessionId,
  revision: (previous?.revision || 0) + 1,
  updated_at: now,
  entries: entries.map((text, index) => ({
    id: `portable-import:${now}:${index + 1}`,
    proposal_id: `portable-import:${index + 1}`,
    text,
    source_event_count: sourceEventCount,
    created_at: now,
  })),
})

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface StorageWrite {
  key: string
  value: string | null
}

/**
 * A small rollback transaction for localStorage. State callers run only after
 * this succeeds, so failed imports cannot make a partial browser profile.
 */
export const writeStorageTransaction = (
  storage: StorageLike,
  writes: StorageWrite[],
): void => {
  const unique = new Set<string>()
  writes.forEach(write => {
    if (unique.has(write.key)) throw new Error("Storage transaction has duplicate keys")
    unique.add(write.key)
  })
  const previous = writes.map(write => ({ key: write.key, value: storage.getItem(write.key) }))
  try {
    writes.forEach(write => {
      if (write.value === null) storage.removeItem(write.key)
      else storage.setItem(write.key, write.value)
    })
  } catch (error) {
    previous.slice().reverse().forEach(write => {
      try {
        if (write.value === null) storage.removeItem(write.key)
        else storage.setItem(write.key, write.value)
      } catch {
        // Best effort rollback is all localStorage can provide. The caller does
        // not update React state when a storage failure is reported.
      }
    })
    throw error
  }
}
