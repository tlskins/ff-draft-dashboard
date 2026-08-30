import {useMemo, useRef} from "react"
import type {User} from "firebase/auth"

import {getUserMockDraft, listUserMockDrafts} from "../api/userMockDrafts"
import {readLocalCompletedMocks, type LocalMockDraftArchive} from "../mockDraft/archive"
import {reviewCompletedMock, type ReviewPosition} from "../mockDraft/review"
import type {RecordedCompletedDraftReplay} from "../draft-advisor/completedDraftReplay"
import {FantasyPosition} from "../../types"
import {
  DraftyWebMcpInputError,
  toolSuccess,
  webMcpInputErrorResponse,
} from "../webmcp/draftyWebMcp"
import {useWebMcpToolRegistration, type WebMcpRegistrationState} from "./useDraftyWebMcp"


export const DRAFTY_WEBMCP_MOCK_TOOL_NAMES = [
  "drafty_list_mock_drafts",
  "drafty_review_mock_draft",
] as const

interface MockReviewContext {
  season: number
  user: User | null
  currentArchive: LocalMockDraftArchive | null
}

const inputRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DraftyWebMcpInputError("Tool input must be an object.")
  }
  return value as Record<string, unknown>
}

const localMocks = (context: MockReviewContext): LocalMockDraftArchive[] => {
  if (typeof localStorage === "undefined") return context.currentArchive ? [context.currentArchive] : []
  const stored = readLocalCompletedMocks(localStorage, context.season)
  return context.currentArchive && !stored.some(item => item.mock_id === context.currentArchive?.mock_id)
    ? [context.currentArchive, ...stored]
    : stored
}

const listMocks = async (context: MockReviewContext) => {
  const local = localMocks(context)
  let cloud: Awaited<ReturnType<typeof listUserMockDrafts>>["mocks"] = []
  let cloudState: "not_authenticated" | "ready" | "unavailable" = context.user
    ? "unavailable"
    : "not_authenticated"
  if (context.user) {
    try {
      const token = await context.user.getIdToken()
      cloud = (await listUserMockDrafts({token, season: context.season})).mocks
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
  return {schema_version: 1, season: context.season, cloud_state: cloudState, count: items.length, mocks: items}
}

const loadArchive = async (context: MockReviewContext, mockId: string) => {
  const local = localMocks(context).find(item => item.mock_id === mockId)
  if (local) return local
  if (!context.user) throw new DraftyWebMcpInputError("The requested mock is not stored in this browser and cloud access is not authenticated.")
  const token = await context.user.getIdToken()
  const record = await getUserMockDraft(mockId, {token, season: context.season})
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
  positions: ReviewPosition[]
  exactPlayerOverrides: Record<number, string>
} => {
  const input = inputRecord(value)
  const unknown = Object.keys(input).filter(key => ![
    "mock_id",
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
    positions: rawPositions as ReviewPosition[],
    exactPlayerOverrides,
  }
}

export const useDraftyMockReviewWebMcp = (
  context: MockReviewContext,
): WebMcpRegistrationState => {
  const contextRef = useRef(context)
  contextRef.current = context
  const tools = useMemo<WebMCP.ModelContextTool[]>(() => [{
    name: DRAFTY_WEBMCP_MOCK_TOOL_NAMES[0],
    title: "List Drafty completed mocks",
    description: "List compact owner-scoped completed mock drafts for Drafty's active fantasy season.",
    inputSchema: {type: "object", properties: {}, additionalProperties: false},
    annotations: {readOnlyHint: true},
    execute: async (input, {signal}) => {
      if (signal.aborted) return webMcpInputErrorResponse(new DOMException("Cancelled", "AbortError"))
      try {
        const parsed = inputRecord(input)
        if (Object.keys(parsed).length) throw new DraftyWebMcpInputError("drafty_list_mock_drafts accepts no fields.")
        const result = await listMocks(contextRef.current)
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
    annotations: {readOnlyHint: true},
    execute: async (input, {signal}) => {
      if (signal.aborted) return webMcpInputErrorResponse(new DOMException("Cancelled", "AbortError"))
      try {
        const parsed = parseReviewInput(input)
        const archive = await loadArchive(contextRef.current, parsed.mockId)
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
  }], [])
  return useWebMcpToolRegistration(tools)
}
