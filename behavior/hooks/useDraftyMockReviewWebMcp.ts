import {useMemo, useRef} from "react"
import type {User} from "firebase/auth"

import {getUserMockDraft, listUserMockDrafts} from "../api/userMockDrafts"
import {readLocalCompletedMocks, type LocalMockDraftArchive} from "../mockDraft/archive"
import {reviewCompletedMock, type ReviewPosition} from "../mockDraft/review"
import type {RecordedCompletedDraftReplay} from "../draft-advisor/completedDraftReplay"
import {FantasyPosition} from "../../types"
import {
  DraftyWebMcpInputError,
  toolFailure,
  toolSuccess,
  webMcpInputErrorResponse,
} from "../webmcp/draftyWebMcp"
import {useWebMcpToolRegistration, type WebMcpRegistrationState} from "./useDraftyWebMcp"


export const DRAFTY_WEBMCP_MOCK_TOOL_NAMES = [
  "drafty_list_mock_drafts",
  "drafty_review_mock_draft",
  "drafty_open_mock_review",
] as const

interface MockReviewContext {
  season: number
  user: User | null
  currentArchive: LocalMockDraftArchive | null
  onOpenReview?: (archive: LocalMockDraftArchive) => void
}

const inputRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DraftyWebMcpInputError("Tool input must be an object.")
  }
  return value as Record<string, unknown>
}

const parseSeason = (value: unknown, fallback: number): number => {
  if (value === undefined) return fallback
  if (!Number.isInteger(value) || (value as number) < 2000 || (value as number) > 2100) {
    throw new DraftyWebMcpInputError("season must be an integer from 2000 through 2100.")
  }
  return value as number
}

const localMocks = (context: MockReviewContext, season: number): LocalMockDraftArchive[] => {
  const current = context.currentArchive?.season === season ? context.currentArchive : null
  if (typeof localStorage === "undefined") return current ? [current] : []
  const stored = readLocalCompletedMocks(localStorage, season)
  return current && !stored.some(item => item.mock_id === current.mock_id)
    ? [current, ...stored]
    : stored
}

const listMocks = async (context: MockReviewContext, season: number) => {
  const local = localMocks(context, season)
  let cloud: Awaited<ReturnType<typeof listUserMockDrafts>>["mocks"] = []
  let cloudState: "not_authenticated" | "ready" | "unavailable" = context.user
    ? "unavailable"
    : "not_authenticated"
  if (context.user) {
    try {
      const token = await context.user.getIdToken()
      cloud = (await listUserMockDrafts({token, season})).mocks
      cloudState = "ready"
    } catch {
      cloudState = "unavailable"
    }
  }
  const items = [
    ...local.map(item => {
      const replay = item.replay as unknown as RecordedCompletedDraftReplay
      return {
        mock_id: item.mock_id,
        season: item.season,
        completed_at: item.completed_at,
        title: replay.source?.title || "Completed mock draft",
        team_count: replay.settings.numTeams,
        user_draft_slot: replay.targetRosterIndex + 1,
        ranking_source: item.ranking_source,
        adp_source: item.adp_source,
        storage: "local" as const,
      }
    }),
    ...cloud.filter(summary => !local.some(item => item.mock_id === summary.mock_id)).map(summary => ({
      mock_id: summary.mock_id,
      season: summary.season,
      completed_at: summary.completed_at,
      title: summary.title,
      team_count: summary.team_count,
      user_draft_slot: summary.user_draft_slot,
      ranking_source: summary.ranking_source,
      adp_source: summary.adp_source,
      storage: "cloud" as const,
    })),
  ].sort((left, right) => right.completed_at.localeCompare(left.completed_at)).slice(0, 20)
  return {schema_version: 1, season, cloud_state: cloudState, count: items.length, mocks: items}
}

const loadArchive = async (context: MockReviewContext, mockId: string, season: number) => {
  const local = localMocks(context, season).find(item => item.mock_id === mockId)
  if (local) return local
  if (!context.user) throw new DraftyWebMcpInputError("The requested mock is not stored in this browser and cloud access is not authenticated.")
  const token = await context.user.getIdToken()
  const record = await getUserMockDraft(mockId, {token, season})
  return {
    schema_version: 1 as const,
    season: record.season,
    mock_id: record.mock_id,
    completed_at: record.completed_at,
    ranking_source: record.ranking_source,
    adp_source: record.adp_source,
    targets: record.targets,
    replay: record.replay,
  }
}

const parseReviewInput = (value: unknown): {
  mockId: string
  season: number | null
  positions: ReviewPosition[]
  exactPlayerOverrides: Record<number, string>
} => {
  const input = inputRecord(value)
  const unknown = Object.keys(input).filter(key => ![
    "mock_id",
    "season",
    "position_sequence",
    "player_overrides",
  ].includes(key))
  if (unknown.length) throw new DraftyWebMcpInputError(`Unknown input field: ${unknown[0]}.`)
  if (typeof input.mock_id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(input.mock_id)) {
    throw new DraftyWebMcpInputError("mock_id must be a stable Drafty mock identifier.")
  }
  const rawPositions = input.position_sequence ?? []
  if (!Array.isArray(rawPositions) || rawPositions.length > 4) {
    throw new DraftyWebMcpInputError("position_sequence must contain at most four positions.")
  }
  const allowed = new Set<unknown>([
    FantasyPosition.QUARTERBACK,
    FantasyPosition.RUNNING_BACK,
    FantasyPosition.WIDE_RECEIVER,
    FantasyPosition.TIGHT_END,
  ])
  if (rawPositions.some(position => !allowed.has(position))) {
    throw new DraftyWebMcpInputError("position_sequence supports QB, RB, WR, and TE.")
  }
  const rawOverrides = input.player_overrides ?? []
  if (!Array.isArray(rawOverrides) || rawOverrides.length > 4) {
    throw new DraftyWebMcpInputError("player_overrides must contain at most four user-pick overrides.")
  }
  const exactPlayerOverrides: Record<number, string> = {}
  rawOverrides.forEach(value => {
    const override = inputRecord(value)
    const unknownOverride = Object.keys(override).filter(key => ![
      "pick_number",
      "player_id",
    ].includes(key))
    if (unknownOverride.length) {
      throw new DraftyWebMcpInputError(`Unknown player override field: ${unknownOverride[0]}.`)
    }
    if (typeof override.pick_number !== "number" || !Number.isInteger(override.pick_number) || override.pick_number < 1 || override.pick_number > 30) {
      throw new DraftyWebMcpInputError("Each player override pick_number must be an integer from 1 through 30.")
    }
    if (typeof override.player_id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(override.player_id)) {
      throw new DraftyWebMcpInputError("Each player override requires a stable player_id.")
    }
    const pickNumber = override.pick_number
    if (exactPlayerOverrides[pickNumber]) {
      throw new DraftyWebMcpInputError(`User pick ${pickNumber} may be overridden only once.`)
    }
    exactPlayerOverrides[pickNumber] = override.player_id
  })
  return {
    mockId: input.mock_id,
    season: input.season === undefined ? null : parseSeason(input.season, 0),
    positions: rawPositions as ReviewPosition[],
    exactPlayerOverrides,
  }
}

const parseMockReference = (
  value: unknown,
  defaultSeason: number,
): {mockId: string; season: number} => {
  const input = inputRecord(value)
  const unknown = Object.keys(input).filter(key => !["mock_id", "season"].includes(key))
  if (unknown.length) throw new DraftyWebMcpInputError(`Unknown input field: ${unknown[0]}.`)
  if (typeof input.mock_id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(input.mock_id)) {
    throw new DraftyWebMcpInputError("mock_id must be a stable Drafty mock identifier.")
  }
  return {mockId: input.mock_id, season: parseSeason(input.season, defaultSeason)}
}

export const useDraftyMockReviewWebMcp = (
  context: MockReviewContext,
): WebMcpRegistrationState => {
  const contextRef = useRef(context)
  contextRef.current = context
  const tools = useMemo<WebMCP.ModelContextTool[]>(() => [{
    name: DRAFTY_WEBMCP_MOCK_TOOL_NAMES[0],
    title: "List Drafty completed mocks",
    description: "List compact owner-scoped completed mock drafts for the active or requested fantasy season.",
    inputSchema: {
      type: "object",
      properties: {season: {type: "integer", minimum: 2000, maximum: 2100}},
      additionalProperties: false,
    },
    annotations: {readOnlyHint: true, untrustedContentHint: true},
    execute: async (input, options) => {
      if (options?.signal.aborted) return webMcpInputErrorResponse(new DOMException("Cancelled", "AbortError"))
      try {
        const parsed = inputRecord(input)
        const unknown = Object.keys(parsed).filter(key => key !== "season")
        if (unknown.length) throw new DraftyWebMcpInputError(`Unknown input field: ${unknown[0]}.`)
        const result = await listMocks(
          contextRef.current,
          parseSeason(parsed.season, contextRef.current.season),
        )
        return toolSuccess(result, `Found ${result.count} completed Drafty mocks for season ${result.season}.`)
      } catch (error) {
        return webMcpInputErrorResponse(error)
      }
    },
  }, {
    name: DRAFTY_WEBMCP_MOCK_TOOL_NAMES[1],
    title: "Review Drafty completed mock",
    description: "Return a deterministic actual-roster scorecard and up to three ADP-based counterfactual rosters, optionally constrained by an early position sequence.",
    inputSchema: {
      type: "object",
      properties: {
        mock_id: {type: "string", maxLength: 128},
        season: {type: "integer", minimum: 2000, maximum: 2100},
        position_sequence: {
          type: "array",
          items: {type: "string", enum: ["QB", "RB", "WR", "TE"]},
          maxItems: 4,
        },
        player_overrides: {
          type: "array",
          maxItems: 4,
          items: {
            type: "object",
            properties: {
              pick_number: {type: "integer", minimum: 1, maximum: 30},
              player_id: {type: "string", maxLength: 128},
            },
            required: ["pick_number", "player_id"],
            additionalProperties: false,
          },
        },
      },
      required: ["mock_id"],
      additionalProperties: false,
    },
    annotations: {readOnlyHint: true, untrustedContentHint: true},
    execute: async (input, options) => {
      if (options?.signal.aborted) return webMcpInputErrorResponse(new DOMException("Cancelled", "AbortError"))
      try {
        const parsed = parseReviewInput(input)
        const archive = await loadArchive(
          contextRef.current,
          parsed.mockId,
          parsed.season || contextRef.current.season,
        )
        const result = reviewCompletedMock({
          fixture: archive.replay as unknown as RecordedCompletedDraftReplay,
          targetPlayerIds: archive.targets.map(target => target.player_id),
          request: {
            positionSequence: parsed.positions,
            exactPlayerOverrides: parsed.exactPlayerOverrides,
            maxAlternatives: 3,
          },
        })
        return toolSuccess({
          ...result,
          season: archive.season,
          ranking_source: archive.ranking_source,
          adp_source: archive.adp_source,
        }, `Deterministic review completed for ${archive.mock_id}.`)
      } catch (error) {
        return webMcpInputErrorResponse(error)
      }
    },
  }, {
    name: DRAFTY_WEBMCP_MOCK_TOOL_NAMES[2],
    title: "Open Drafty mock review",
    description: "Open one completed mock in Drafty's visible scorecard dialog by stable mock ID and fantasy season.",
    inputSchema: {
      type: "object",
      properties: {
        mock_id: {type: "string", maxLength: 128},
        season: {type: "integer", minimum: 2000, maximum: 2100},
      },
      required: ["mock_id"],
      additionalProperties: false,
    },
    annotations: {untrustedContentHint: true},
    execute: async (input, options) => {
      if (options?.signal.aborted) return webMcpInputErrorResponse(new DOMException("Cancelled", "AbortError"))
      try {
        const parsed = parseMockReference(input, contextRef.current.season)
        const archive = await loadArchive(contextRef.current, parsed.mockId, parsed.season)
        if (!contextRef.current.onOpenReview) {
          return toolFailure(
            "not_available_in_layout",
            "The visible mock-review surface is not available in this layout.",
          )
        }
        contextRef.current.onOpenReview(archive)
        return toolSuccess({
          schema_version: 1,
          season: archive.season,
          mock_id: archive.mock_id,
          open: true,
        }, `Opened Drafty mock review ${archive.mock_id}.`, "accepted")
      } catch (error) {
        return webMcpInputErrorResponse(error)
      }
    },
  }], [])
  return useWebMcpToolRegistration(tools)
}
