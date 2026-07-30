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
}

export type DraftFeedEvent =
  | {
      version: typeof DRAFT_FEED_VERSION
      kind: "heartbeat"
      sentAt: number
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

  return payload as unknown as DraftFeedEvent
}
