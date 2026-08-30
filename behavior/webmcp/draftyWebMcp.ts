import {getPlayerMetrics} from "../draft"
import {profileNoteAnalysts, profileNotes} from "../playerProfileNotes"
import type {
  BoardSettings,
  FantasyPosition,
  FantasySettings,
  Player,
  PlayerProfileNote,
  PlayerTarget,
  ScoringFormat,
} from "../../types"


export const DRAFTY_WEBMCP_HOME_TOOL_NAMES = [
  "drafty_get_workspace",
  "drafty_get_decision_context",
  "drafty_get_player_evidence",
  "drafty_search_players",
  "drafty_configure_workspace",
  "drafty_set_rankings_view",
  "drafty_show_player_profile",
  "drafty_set_player_target",
  "drafty_start_rank_editing",
  "drafty_move_player_rank",
  "drafty_save_rank_edits",
] as const

export const DRAFTY_WEBMCP_INSIGHT_TOOL_NAME = "drafty_set_insight_view"

export type DraftyWebMcpStatus =
  | "unsupported"
  | "registering"
  | "ready"
  | "error"

export type DraftyRankingsView = "position" | "adp_round" | "targets"
export type DraftyRankingsSort = "rank" | "adp"
export type DraftyProfileModule = "auto" | "draft_context" | "outlook" | "production"

export interface DraftyToolSuccess<T> {
  ok: true
  code: "ok" | "unchanged" | "accepted"
  message: string
  result: T
}

export interface DraftyToolFailure {
  ok: false
  code:
    | "invalid_input"
    | "not_found"
    | "not_allowed"
    | "not_available_in_layout"
    | "cancelled"
    | "internal_error"
  message: string
}

export type DraftyToolResponse<T> = DraftyToolSuccess<T> | DraftyToolFailure

export const toolSuccess = <T>(
  result: T,
  message: string,
  code: DraftyToolSuccess<T>["code"] = "ok",
): DraftyToolSuccess<T> => ({ok: true, code, message, result})

export const toolFailure = (
  code: DraftyToolFailure["code"],
  message: string,
): DraftyToolFailure => ({ok: false, code, message})

export interface DraftyInsightAgentState {
  available: boolean
  slots: Array<{
    slot: "decision" | "supporting"
    view: string | null
    mode: "auto" | "pinned"
    evidence: string | null
  }>
  expandedSlot: "decision" | "supporting" | null
}

export interface DraftyWorkspaceSnapshot {
  schemaVersion: 1
  draft: {
    started: boolean
    currentPick: number
    teamCount: number
    userDraftSlot: number
  }
  configuration: {
    scoringFormat: ScoringFormat
    starters: {
      qb: number
      rb: number
      wr: number
      te: number
      flex: number
      bench: number
    }
    rankingSource: string
    adpSource: string
    availableRankingSources: string[]
    availableAdpSources: string[]
  }
  rankings: {
    view: DraftyRankingsView
    visiblePositions: string[]
    sort: DraftyRankingsSort
    adpRoundPage: number
    adpRoundsVisible: number[]
    filterRankedBelowAdp: boolean
    editing: boolean
    editable: boolean
  }
  profile: {
    playerId: string | null
    playerName: string | null
    pinned: boolean
    module: DraftyProfileModule
    advancedDetailsOpen: boolean
  }
  insights: DraftyInsightAgentState
  targets: {count: number}
  persistence: {
    rankingsHydrated: boolean
    targetsHydrated: boolean
    localRankingProfileSaved: boolean
    cloudSyncEnabled: boolean
    authenticated: boolean
    cloudSyncState: string
  }
  capabilities: {
    configureWorkspace: {available: boolean; reason: string | null}
    setPlayerTarget: {available: boolean; reason: string | null}
    editRanks: {available: boolean; reason: string | null}
    saveRankEdits: {available: boolean; reason: string | null}
  }
}

export interface DraftyPlayerEvidenceInput { player_id: string }

export interface DraftyConfigureWorkspaceInput {
  team_count?: number
  user_draft_slot?: number
  scoring_format?: ScoringFormat
  starting_qbs?: number
  starting_rbs?: number
  starting_wrs?: number
  starting_tes?: number
  flex?: number
  bench?: number
  ranking_source?: string
  adp_source?: string
}

export interface DraftySetRankingsViewInput {
  view?: DraftyRankingsView
  positions?: FantasyPosition[]
  adp_round?: number
  sort?: DraftyRankingsSort
  filter_ranked_below_adp?: boolean
}

export interface DraftyShowPlayerProfileInput {
  player_id: string
  pin?: boolean
  module?: DraftyProfileModule
  advanced_details_open?: boolean
}

export interface DraftySetPlayerTargetInput {
  player_id: string
  target_round: number | null
}

export interface DraftyStartRankEditingInput {
  source_ranker?: string
}

export interface DraftyMovePlayerRankInput {
  player_id: string
  new_rank: number
}

export interface DraftyPlayerTargetMutationResult {
  playerId: string
  playerName: string
  previousTargetRound: number | null
  targetRound: number | null
  targetCount: number
  persistence: {
    local: "unchanged" | "scheduled"
    cloudSyncEnabled: boolean
    authenticated: boolean
    cloudSyncState: string
  }
}

export interface DraftyRankEditingResult {
  editing: boolean
  rankingSource: string
  copiedFrom: string | null
  editable: boolean
}

export interface DraftyPlayerRankMutationResult {
  playerId: string
  playerName: string
  position: FantasyPosition
  previousRank: number
  rank: number
  positionPlayerCount: number
  persistence: "unsaved"
}

export interface DraftyRankSaveResult {
  editing: false
  rankingSource: string
  localPersistence: "saved"
  cloudSync: {
    enabled: boolean
    authenticated: boolean
    state: string
  }
}

export interface DraftySearchPlayersInput {
  query?: string
  positions?: FantasyPosition[]
  teams?: string[]
  analysts?: string[]
  note_categories?: PlayerProfileNote["category"][]
  targeted_only?: boolean
  available_only?: boolean
  limit?: number
}

export interface DraftyPlayerSearchResult {
  count: number
  players: Array<{
    playerId: string
    name: string
    team: string
    position: FantasyPosition
    positionRank: number | null
    tier: number | null
    adp: number | null
    availability: string
    targetRound: number | null
    injuryStatus: string | null
    matchedFields: string[]
    outlookSnippet: string | null
    noteMatches: Array<{
      noteId: string
      category: PlayerProfileNote["category"]
      summary: string
      practicalImplication: string | null
      analysts: string[]
      source: string
      publishedAt: string
      sourceUrl: string
    }>
  }>
}

export interface DraftyHomeWebMcpAdapter {
  getWorkspace: () => DraftyWorkspaceSnapshot
  getDecisionContext: () => unknown
  getPlayerEvidence: (
    input: DraftyPlayerEvidenceInput,
  ) => DraftyToolResponse<unknown> | Promise<DraftyToolResponse<unknown>>
  searchPlayers: (input: DraftySearchPlayersInput) => DraftyPlayerSearchResult
  configureWorkspace: (
    input: DraftyConfigureWorkspaceInput,
  ) => DraftyToolResponse<DraftyWorkspaceSnapshot>
  setRankingsView: (
    input: DraftySetRankingsViewInput,
  ) => DraftyToolResponse<DraftyWorkspaceSnapshot["rankings"]>
  showPlayerProfile: (
    input: DraftyShowPlayerProfileInput,
  ) => DraftyToolResponse<DraftyWorkspaceSnapshot["profile"]>
  setPlayerTarget: (
    input: DraftySetPlayerTargetInput,
  ) => DraftyToolResponse<DraftyPlayerTargetMutationResult>
  startRankEditing: (
    input: DraftyStartRankEditingInput,
  ) => DraftyToolResponse<DraftyRankEditingResult>
  movePlayerRank: (
    input: DraftyMovePlayerRankInput,
  ) => DraftyToolResponse<DraftyPlayerRankMutationResult>
  saveRankEdits: () => DraftyToolResponse<DraftyRankSaveResult>
}

export class DraftyWebMcpInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "DraftyWebMcpInputError"
  }
}

const INPUT_LIMITS = {
  query: 240,
  filterItems: 12,
  searchResults: 8,
  noteMatches: 2,
  snippet: 180,
} as const

const ensureRecord = (input: unknown): Record<string, unknown> => {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new DraftyWebMcpInputError("Tool input must be an object.")
  }
  return input as Record<string, unknown>
}

const ensureKnownKeys = (
  input: Record<string, unknown>,
  keys: readonly string[],
) => {
  const unknown = Object.keys(input).filter(key => !keys.includes(key))
  if (unknown.length > 0) {
    throw new DraftyWebMcpInputError(`Unknown input field: ${unknown[0]}.`)
  }
}

const optionalString = (
  value: unknown,
  field: string,
  maximumLength: number = INPUT_LIMITS.query,
): string | undefined => {
  if (value === undefined) return undefined
  if (typeof value !== "string") {
    throw new DraftyWebMcpInputError(`${field} must be a string.`)
  }
  const trimmed = value.trim()
  if (trimmed.length > maximumLength) {
    throw new DraftyWebMcpInputError(`${field} is too long.`)
  }
  return trimmed
}

const optionalBoolean = (value: unknown, field: string): boolean | undefined => {
  if (value === undefined) return undefined
  if (typeof value !== "boolean") {
    throw new DraftyWebMcpInputError(`${field} must be true or false.`)
  }
  return value
}

const optionalInteger = (
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): number | undefined => {
  if (value === undefined) return undefined
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new DraftyWebMcpInputError(`${field} must be an integer from ${minimum} to ${maximum}.`)
  }
  return value as number
}

const optionalStringArray = <T extends string>(
  value: unknown,
  field: string,
  allowed?: readonly T[],
): T[] | undefined => {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length > INPUT_LIMITS.filterItems) {
    throw new DraftyWebMcpInputError(`${field} must be an array with at most ${INPUT_LIMITS.filterItems} items.`)
  }
  const result = value.map(item => {
    if (typeof item !== "string" || !item.trim()) {
      throw new DraftyWebMcpInputError(`${field} must contain non-empty strings.`)
    }
    const normalized = item.trim() as T
    if (allowed && !allowed.includes(normalized)) {
      throw new DraftyWebMcpInputError(`${field} contains an unsupported value: ${normalized}.`)
    }
    return normalized
  })
  return Array.from(new Set(result))
}

const RANKING_VIEWS = ["position", "adp_round", "targets"] as const
const RANKING_SORTS = ["rank", "adp"] as const
const PROFILE_MODULES = ["auto", "draft_context", "outlook", "production"] as const
const SCORING_FORMATS = ["standard", "half_ppr", "ppr"] as const
const SEARCH_POSITIONS = ["QB", "RB", "WR", "TE", "DST", "K"] as const
const NOTE_CATEGORIES = ["good", "bad", "watch"] as const

export const parseConfigureWorkspaceInput = (
  value: unknown,
): DraftyConfigureWorkspaceInput => {
  const input = ensureRecord(value)
  ensureKnownKeys(input, [
    "team_count", "user_draft_slot", "scoring_format", "starting_qbs",
    "starting_rbs", "starting_wrs", "starting_tes", "flex", "bench",
    "ranking_source", "adp_source",
  ])
  if (Object.keys(input).length === 0) {
    throw new DraftyWebMcpInputError("At least one workspace configuration field is required.")
  }
  const scoringFormat = optionalString(input.scoring_format, "scoring_format")
  if (scoringFormat && !SCORING_FORMATS.includes(scoringFormat as ScoringFormat)) {
    throw new DraftyWebMcpInputError("scoring_format is unsupported.")
  }
  return {
    team_count: optionalInteger(input.team_count, "team_count", 8, 16),
    user_draft_slot: optionalInteger(input.user_draft_slot, "user_draft_slot", 1, 16),
    scoring_format: scoringFormat as ScoringFormat | undefined,
    starting_qbs: optionalInteger(input.starting_qbs, "starting_qbs", 0, 3),
    starting_rbs: optionalInteger(input.starting_rbs, "starting_rbs", 0, 5),
    starting_wrs: optionalInteger(input.starting_wrs, "starting_wrs", 0, 6),
    starting_tes: optionalInteger(input.starting_tes, "starting_tes", 0, 3),
    flex: optionalInteger(input.flex, "flex", 0, 4),
    bench: optionalInteger(input.bench, "bench", 0, 12),
    ranking_source: optionalString(input.ranking_source, "ranking_source", 80),
    adp_source: optionalString(input.adp_source, "adp_source", 80),
  }
}

export const parseSetRankingsViewInput = (
  value: unknown,
): DraftySetRankingsViewInput => {
  const input = ensureRecord(value)
  ensureKnownKeys(input, [
    "view", "positions", "adp_round", "sort", "filter_ranked_below_adp",
  ])
  if (Object.keys(input).length === 0) {
    throw new DraftyWebMcpInputError("At least one rankings-view field is required.")
  }
  const view = optionalString(input.view, "view")
  const sort = optionalString(input.sort, "sort")
  if (view && !RANKING_VIEWS.includes(view as DraftyRankingsView)) {
    throw new DraftyWebMcpInputError("view is unsupported.")
  }
  if (sort && !RANKING_SORTS.includes(sort as DraftyRankingsSort)) {
    throw new DraftyWebMcpInputError("sort is unsupported.")
  }
  const positions = optionalStringArray(
    input.positions,
    "positions",
    SEARCH_POSITIONS.slice(0, 4),
  ) as FantasyPosition[] | undefined
  if (positions && positions.length === 0) {
    throw new DraftyWebMcpInputError("positions must contain at least one position.")
  }
  return {
    view: view as DraftyRankingsView | undefined,
    positions,
    adp_round: optionalInteger(input.adp_round, "adp_round", 1, 30),
    sort: sort as DraftyRankingsSort | undefined,
    filter_ranked_below_adp: optionalBoolean(
      input.filter_ranked_below_adp,
      "filter_ranked_below_adp",
    ),
  }
}

export const parseShowPlayerProfileInput = (
  value: unknown,
): DraftyShowPlayerProfileInput => {
  const input = ensureRecord(value)
  ensureKnownKeys(input, ["player_id", "pin", "module", "advanced_details_open"])
  const playerId = optionalString(input.player_id, "player_id", 120)
  if (!playerId) throw new DraftyWebMcpInputError("player_id is required.")
  const module = optionalString(input.module, "module")
  if (module && !PROFILE_MODULES.includes(module as DraftyProfileModule)) {
    throw new DraftyWebMcpInputError("module is unsupported.")
  }
  return {
    player_id: playerId,
    pin: optionalBoolean(input.pin, "pin"),
    module: module as DraftyProfileModule | undefined,
    advanced_details_open: optionalBoolean(
      input.advanced_details_open,
      "advanced_details_open",
    ),
  }
}

export const parseSetPlayerTargetInput = (
  value: unknown,
): DraftySetPlayerTargetInput => {
  const input = ensureRecord(value)
  ensureKnownKeys(input, ["player_id", "target_round"])
  const playerId = optionalString(input.player_id, "player_id", 120)
  if (!playerId) throw new DraftyWebMcpInputError("player_id is required.")
  if (!Object.prototype.hasOwnProperty.call(input, "target_round")) {
    throw new DraftyWebMcpInputError("target_round is required.")
  }
  const targetRound = input.target_round === null
    ? null
    : optionalInteger(input.target_round, "target_round", 1, 30)
  if (targetRound === undefined) {
    throw new DraftyWebMcpInputError("target_round must be null or an integer from 1 to 30.")
  }
  return {player_id: playerId, target_round: targetRound}
}

export const parseStartRankEditingInput = (
  value: unknown,
): DraftyStartRankEditingInput => {
  const input = ensureRecord(value)
  ensureKnownKeys(input, ["source_ranker"])
  return {
    source_ranker: optionalString(input.source_ranker, "source_ranker", 80),
  }
}

export const parseMovePlayerRankInput = (
  value: unknown,
): DraftyMovePlayerRankInput => {
  const input = ensureRecord(value)
  ensureKnownKeys(input, ["player_id", "new_rank"])
  const playerId = optionalString(input.player_id, "player_id", 120)
  if (!playerId) throw new DraftyWebMcpInputError("player_id is required.")
  const newRank = optionalInteger(input.new_rank, "new_rank", 1, 400)
  if (newRank === undefined) {
    throw new DraftyWebMcpInputError("new_rank is required.")
  }
  return {player_id: playerId, new_rank: newRank}
}

export const parseSearchPlayersInput = (
  value: unknown,
): DraftySearchPlayersInput => {
  const input = ensureRecord(value)
  ensureKnownKeys(input, [
    "query", "positions", "teams", "analysts", "note_categories",
    "targeted_only", "available_only", "limit",
  ])
  return {
    query: optionalString(input.query, "query"),
    positions: optionalStringArray(
      input.positions,
      "positions",
      SEARCH_POSITIONS,
    ) as FantasyPosition[] | undefined,
    teams: optionalStringArray(input.teams, "teams")?.map(team => team.toLocaleUpperCase()),
    analysts: optionalStringArray(input.analysts, "analysts"),
    note_categories: optionalStringArray(
      input.note_categories,
      "note_categories",
      NOTE_CATEGORIES,
    ) as PlayerProfileNote["category"][] | undefined,
    targeted_only: optionalBoolean(input.targeted_only, "targeted_only"),
    available_only: optionalBoolean(input.available_only, "available_only"),
    limit: optionalInteger(input.limit, "limit", 1, INPUT_LIMITS.searchResults),
  }
}

export const parsePlayerEvidenceInput = (
  value: unknown,
): DraftyPlayerEvidenceInput => {
  const input = ensureRecord(value)
  ensureKnownKeys(input, ["player_id"])
  const playerId = optionalString(input.player_id, "player_id", 120)
  if (!playerId) throw new DraftyWebMcpInputError("player_id is required.")
  return {player_id: playerId}
}

const normalizeSearchText = (value: string | null | undefined): string => (
  value || ""
).normalize("NFKD")
  .toLocaleLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim()

const boundedText = (value: string | null | undefined): string | null => {
  if (!value) return null
  const collapsed = value.replace(/\s+/g, " ").trim()
  return collapsed.length <= INPUT_LIMITS.snippet
    ? collapsed
    : `${collapsed.slice(0, INPUT_LIMITS.snippet - 1).trimEnd()}…`
}

const noteSearchText = (note: PlayerProfileNote): string => normalizeSearchText([
  note.summary,
  note.subject,
  note.evidence,
  note.counterweight,
  note.practicalImplication,
  note.episodeTitle,
  ...profileNoteAnalysts(note),
].filter(Boolean).join(" "))

const queryMatches = (value: string, tokens: string[]): boolean => (
  tokens.length === 0 || tokens.every(token => value.includes(token))
)

const queryTouches = (value: string, tokens: string[]): boolean => (
  tokens.length > 0 && tokens.some(token => value.includes(token))
)

export const searchDraftyPlayers = ({
  players,
  settings,
  boardSettings,
  playerTargets,
  availablePlayerIds,
  input,
}: {
  players: Player[]
  settings: FantasySettings
  boardSettings: BoardSettings
  playerTargets: PlayerTarget[]
  availablePlayerIds?: ReadonlySet<string>
  input: DraftySearchPlayersInput
}): DraftyPlayerSearchResult => {
  const normalizedQuery = normalizeSearchText(input.query)
  const queryTokens = normalizedQuery ? normalizedQuery.split(" ") : []
  const positions = new Set(input.positions || [])
  const teams = new Set((input.teams || []).map(team => team.toLocaleUpperCase()))
  const analysts = new Set((input.analysts || []).map(normalizeSearchText))
  const categories = new Set(input.note_categories || [])
  const targets = new Map(playerTargets.map(target => [target.playerId, target]))
  const availableOnly = input.available_only !== false

  const matches = players.flatMap(player => {
    if (positions.size > 0 && !positions.has(player.position)) return []
    if (teams.size > 0 && !teams.has(String(player.team).toLocaleUpperCase())) return []
    if (input.targeted_only && !targets.has(player.id)) return []
    if (availableOnly && availablePlayerIds && !availablePlayerIds.has(player.id)) return []
    if (availableOnly && player.availability?.state === "inactive_confirmed") return []

    const orderedNotes = profileNotes(player.profileNotes).filter(note => {
      const noteAnalysts = profileNoteAnalysts(note).map(normalizeSearchText)
      return (analysts.size === 0 || noteAnalysts.some(analyst => analysts.has(analyst)))
        && (categories.size === 0 || categories.has(note.category))
    })
    if ((analysts.size > 0 || categories.size > 0) && orderedNotes.length === 0) return []

    const identityText = normalizeSearchText(
      `${player.fullName} ${player.team} ${player.position}`,
    )
    const outlookText = normalizeSearchText(player.outlook?.text)
    const notesText = orderedNotes.map(noteSearchText).join(" ")
    const matchingNotes = orderedNotes.filter(note => queryTouches(
      noteSearchText(note),
      queryTokens,
    ))
    const identityMatches = queryTouches(identityText, queryTokens)
    const outlookMatches = queryTouches(outlookText, queryTokens)
    if (!queryMatches(`${identityText} ${outlookText} ${notesText}`, queryTokens)) {
      return []
    }

    const matchedFields: string[] = []
    if (queryTokens.length === 0 || identityMatches) matchedFields.push("identity")
    if (outlookMatches) matchedFields.push("outlook")
    if (matchingNotes.length > 0) matchedFields.push("analyst_notes")
    const metrics = getPlayerMetrics(player, settings, boardSettings)
    const noteMatches = (queryTokens.length > 0 ? matchingNotes : orderedNotes)
      .slice(0, INPUT_LIMITS.noteMatches)
      .map(note => ({
        noteId: note.noteId,
        category: note.category,
        summary: boundedText(note.summary) || "",
        practicalImplication: boundedText(note.practicalImplication),
        analysts: profileNoteAnalysts(note),
        source: note.sourceLabel,
        publishedAt: note.publishedAt,
        sourceUrl: note.sourceUrl,
      }))

    const relevance = (identityMatches ? 5 : 0)
      + (outlookMatches ? 3 : 0)
      + Math.min(3, matchingNotes.length) * 4
    return [{
      relevance,
      overallRank: metrics.overallRank || Number.MAX_SAFE_INTEGER,
      result: {
        playerId: player.id,
        name: player.fullName,
        team: String(player.team),
        position: player.position,
        positionRank: metrics.posRank < 9999 ? metrics.posRank : null,
        tier: metrics.tier?.tierNumber || null,
        adp: Number.isFinite(metrics.adp) && (metrics.adp || 9999) < 999
          ? metrics.adp || null
          : null,
        availability: player.availability?.state || "unknown",
        targetRound: targets.get(player.id)?.targetAsEarlyAsRound || null,
        injuryStatus: player.injuryStatus?.status || null,
        matchedFields,
        outlookSnippet: outlookMatches ? boundedText(player.outlook?.text) : null,
        noteMatches,
      },
    }]
  }).sort((left, right) => (
    right.relevance - left.relevance
    || left.overallRank - right.overallRank
    || left.result.name.localeCompare(right.result.name)
  ))

  const limited = matches.slice(0, input.limit || 5).map(match => match.result)
  return {count: limited.length, players: limited}
}

export const webMcpInputErrorResponse = (error: unknown): DraftyToolFailure => {
  if (error instanceof DraftyWebMcpInputError) {
    return toolFailure("invalid_input", error.message)
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return toolFailure("cancelled", "The tool call was cancelled.")
  }
  return toolFailure("internal_error", "Drafty could not complete the tool call.")
}
