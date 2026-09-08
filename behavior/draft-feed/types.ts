export const DRAFT_FEED_VERSION = 1 as const

export type DraftPlatform = "ESPN" | "NFL"

export interface EspnDraftPick {
  imgUrl: string
  name: string
  team: string
  position: string
  pick: string
}

export interface NflDraftPick {
  name: string
  team: string
  position: string
  pick: number
}

export type RawDraftPick = EspnDraftPick | NflDraftPick

export interface DraftSnapshot {
  id: string
  title: string
  platform: DraftPlatform
  picks: RawDraftPick[]
  capturedAt: number
  sourceUrl?: string
  numTeams?: number
  targetRosterIndex?: number | null
  scoringFormat?: "STANDARD" | "HALF_PPR" | "PPR" | null
  rosterSettings?: DraftRosterSettings | null
  completion?: {
    complete: boolean
    totalPicks: number
    numRounds: number
    numTeams: number
    platformRosterSize: number
    targetRosterIndex: number | null
    excludedPositions: string[]
    scoringFormat: "STANDARD" | "HALF_PPR" | "PPR" | null
  }
}

export interface DraftRosterSettings {
  numStartingQbs: number
  numStartingRbs: number
  numStartingWrs: number
  numStartingTes: number
  numFlex: number
  numBenchPlayers: number
  unsupportedLineupSlots: string[]
  source: "espn_league_settings" | "user_confirmed"
}

export interface DraftConnectionConfirmation {
  numTeams: number
  targetRosterIndex: number
  scoringFormat: "STANDARD" | "HALF_PPR" | "PPR"
  rosterSettings: DraftRosterSettings
}

export type DraftSourceHealthStatus =
  | "healthy"
  | "degraded"
  | "unavailable"

export type DraftSourceHealthMode =
  | "live-history"
  | "live-board"
  | "completed-board"
  | "waiting"
  | "unavailable"

export interface DraftSourceSelectorCheck {
  name: string
  selector: string
  matched: number
  required: boolean
  healthy: boolean
}

export interface DraftSourceHealth {
  /** v2 adds the scheduled-board completion contract; v1 remains accepted
   * while a locally unpacked extension is waiting to be reloaded. */
  selectorVersion: 1 | 2
  platform: DraftPlatform
  status: DraftSourceHealthStatus
  mode: DraftSourceHealthMode
  checkedAt: number
  pickCount: number
  checks: DraftSourceSelectorCheck[]
  issues: string[]
}

export type DraftFeedEvent =
  | {
      version: typeof DRAFT_FEED_VERSION
      kind: "heartbeat"
      sentAt: number
    }
  | {
      version: typeof DRAFT_FEED_VERSION
      kind: "source-health"
      sentAt: number
      health: DraftSourceHealth
    }
  | {
      version: typeof DRAFT_FEED_VERSION
      kind: "draft-snapshot"
      sentAt: number
      draft: DraftSnapshot
    }

export interface DraftFeedWindowMessage {
  type: "FF_DRAFT_DASHBOARD"
  payload: DraftFeedEvent
}

interface LegacyDraftData {
  draftPicks: RawDraftPick[]
  draftTitle: string
  platform: DraftPlatform
}

interface LegacyWindowMessage {
  type: "FROM_EXT"
  draftData: true | LegacyDraftData
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const isPlatform = (value: unknown): value is DraftPlatform =>
  value === "ESPN" || value === "NFL"

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  value > 0

const espnTeamCount = (draft: Record<string, unknown>): number | null => {
  if (isPositiveInteger(draft.numTeams)) return draft.numTeams

  if (isRecord(draft.completion) && isPositiveInteger(draft.completion.numTeams)) {
    return draft.completion.numTeams
  }

  const title = typeof draft.title === "string" ? draft.title : ""
  const match = title.match(/\b(\d+)-Team\b/i)
  const parsed = match ? Number.parseInt(match[1], 10) : Number.NaN
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

const normalizeDraftSnapshot = (
  draft: Record<string, unknown>,
): DraftSnapshot => {
  if (draft.platform !== "ESPN") {
    return draft as unknown as DraftSnapshot
  }

  return {
    ...draft,
    // ESPN's URL `teamId` identifies the fantasy team, not its randomized
    // draft-order slot. Require an explicit user confirmation instead of
    // silently treating team 1 as pick 1.
    targetRosterIndex: null,
    ...(isRecord(draft.completion) ? {
      completion: {...draft.completion, targetRosterIndex: null},
    } : {}),
    rosterSettings: normalizeRosterSettings(draft.rosterSettings),
  } as unknown as DraftSnapshot
}

const normalizeRosterSettings = (value: unknown): DraftRosterSettings | null => {
  if (!isRecord(value) || value.source !== "espn_league_settings") return null
  const countFields = [
    "numStartingQbs",
    "numStartingRbs",
    "numStartingWrs",
    "numStartingTes",
    "numFlex",
    "numBenchPlayers",
  ] as const
  if (countFields.some(field => !Number.isSafeInteger(value[field])
    || Number(value[field]) < 0 || Number(value[field]) > 30)) return null
  if (!Array.isArray(value.unsupportedLineupSlots)
    || value.unsupportedLineupSlots.some(slot => typeof slot !== "string" || !/^\d{1,2}$/.test(slot))) {
    return null
  }
  return {
    numStartingQbs: Number(value.numStartingQbs),
    numStartingRbs: Number(value.numStartingRbs),
    numStartingWrs: Number(value.numStartingWrs),
    numStartingTes: Number(value.numStartingTes),
    numFlex: Number(value.numFlex),
    numBenchPlayers: Number(value.numBenchPlayers),
    unsupportedLineupSlots: value.unsupportedLineupSlots,
    source: "espn_league_settings",
  }
}

const isSourceHealthStatus = (
  value: unknown,
): value is DraftSourceHealthStatus =>
  value === "healthy" ||
  value === "degraded" ||
  value === "unavailable"

const isSourceHealthMode = (
  value: unknown,
): value is DraftSourceHealthMode =>
  value === "live-history" ||
  value === "live-board" ||
  value === "completed-board" ||
  value === "waiting" ||
  value === "unavailable"

const isSelectorCheck = (
  value: unknown,
): value is DraftSourceSelectorCheck =>
  isRecord(value) &&
  typeof value.name === "string" &&
  typeof value.selector === "string" &&
  typeof value.matched === "number" &&
  value.matched >= 0 &&
  typeof value.required === "boolean" &&
  typeof value.healthy === "boolean"

const isSourceHealth = (
  value: unknown,
): value is DraftSourceHealth =>
  isRecord(value) &&
  (value.selectorVersion === 1 || value.selectorVersion === 2) &&
  isPlatform(value.platform) &&
  isSourceHealthStatus(value.status) &&
  isSourceHealthMode(value.mode) &&
  typeof value.checkedAt === "number" &&
  typeof value.pickCount === "number" &&
  value.pickCount >= 0 &&
  Array.isArray(value.checks) &&
  value.checks.every(isSelectorCheck) &&
  Array.isArray(value.issues) &&
  value.issues.every(issue => typeof issue === "string")

const draftId = (platform: DraftPlatform, title: string): string =>
  `${platform}:${title}`

const normalizeLegacyMessage = (
  message: LegacyWindowMessage,
  receivedAt: number,
): DraftFeedEvent | null => {
  if (message.draftData === true) {
    return {
      version: DRAFT_FEED_VERSION,
      kind: "heartbeat",
      sentAt: receivedAt,
    }
  }

  const { draftPicks, draftTitle, platform } = message.draftData
  if (
    !Array.isArray(draftPicks) ||
    typeof draftTitle !== "string" ||
    !isPlatform(platform)
  ) {
    return null
  }

  return {
    version: DRAFT_FEED_VERSION,
    kind: "draft-snapshot",
    sentAt: receivedAt,
    draft: {
      id: draftId(platform, draftTitle),
      title: draftTitle,
      platform,
      picks: draftPicks,
      capturedAt: receivedAt,
    },
  }
}

export const normalizeDraftFeedMessage = (
  value: unknown,
  receivedAt = Date.now(),
): DraftFeedEvent | null => {
  if (!isRecord(value) || typeof value.type !== "string") {
    return null
  }

  if (value.type === "FROM_EXT" && "draftData" in value) {
    return normalizeLegacyMessage(value as unknown as LegacyWindowMessage, receivedAt)
  }

  if (value.type !== "FF_DRAFT_DASHBOARD" || !isRecord(value.payload)) {
    return null
  }

  const payload = value.payload
  if (
    payload.version !== DRAFT_FEED_VERSION ||
    typeof payload.sentAt !== "number"
  ) {
    return null
  }

  if (payload.kind === "heartbeat") {
    return payload as unknown as DraftFeedEvent
  }

  if (
    payload.kind === "source-health" &&
    isSourceHealth(payload.health)
  ) {
    return payload as unknown as DraftFeedEvent
  }

  if (payload.kind !== "draft-snapshot" || !isRecord(payload.draft)) {
    return null
  }

  const draft = payload.draft
  if (
    typeof draft.id !== "string" ||
    typeof draft.title !== "string" ||
    !isPlatform(draft.platform) ||
    !Array.isArray(draft.picks) ||
    typeof draft.capturedAt !== "number"
  ) {
    return null
  }

  return {
    ...payload,
    draft: normalizeDraftSnapshot(draft),
  } as DraftFeedEvent
}
