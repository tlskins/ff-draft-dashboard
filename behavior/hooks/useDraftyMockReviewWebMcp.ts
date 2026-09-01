import {useMemo, useRef} from "react"

import {
  createDraftReviewAgentContract,
  DRAFTY_DRAFT_REVIEW_TOOL_NAMES,
  type DraftReviewAgentContext,
} from "../mockDraft/agentContract"
import {webMcpInputErrorResponse} from "../webmcp/draftyWebMcp"
import {useWebMcpToolRegistration, type WebMcpRegistrationState} from "./useDraftyWebMcp"


export const DRAFTY_WEBMCP_MOCK_TOOL_NAMES = DRAFTY_DRAFT_REVIEW_TOOL_NAMES

const descriptors: Array<Omit<WebMCP.ModelContextTool, "execute">> = [{
  name: DRAFTY_WEBMCP_MOCK_TOOL_NAMES[0],
  title: "List Drafty completed drafts",
  description: "List compact owner-scoped completed fantasy drafts for the active or requested season, including both mocks and real drafts.",
  inputSchema: {
    type: "object",
    properties: {season: {type: "integer", minimum: 2000, maximum: 2100}},
    additionalProperties: false,
  },
  annotations: {readOnlyHint: true, untrustedContentHint: true},
}, {
  name: DRAFTY_WEBMCP_MOCK_TOOL_NAMES[1],
  title: "Analyze Drafty completed draft",
  description: "Analyze a completed draft using its captured format and observed pick deadlines. Returns per-player and lineup PAR, latest-safe pick timing, pick-level evidence, replay fidelity, and up to five starter-PAR-first alternate rosters. No hypothetical league-format reinterpretation is performed.",
  inputSchema: {
    type: "object",
    properties: {
      mock_id: {type: "string", maxLength: 128},
      season: {type: "integer", minimum: 2000, maximum: 2100},
      position_sequence: {
        type: "array",
        items: {type: "string", enum: ["QB", "RB", "WR", "TE"]},
        maxItems: 15,
      },
      player_overrides: {
        type: "array",
        maxItems: 15,
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
      max_alternatives: {type: "integer", minimum: 1, maximum: 5},
      preserve_picks_through: {
        type: "integer",
        minimum: 0,
        maximum: 30,
        description: "Keep the user's recorded selections through this user-pick number, then optimize later picks.",
      },
      max_changed_picks: {
        type: "integer",
        minimum: 1,
        maximum: 30,
        description: "Limit each returned alternate to this many selections that differ from the recorded roster.",
      },
    },
    required: ["mock_id"],
    additionalProperties: false,
  },
  annotations: {readOnlyHint: true, untrustedContentHint: true},
}, {
  name: DRAFTY_WEBMCP_MOCK_TOOL_NAMES[2],
  title: "Open Drafty draft scorecard",
  description: "Open one completed fantasy draft in Drafty's visible scorecard dialog by stable draft ID and season.",
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
}]

export const useDraftyMockReviewWebMcp = (
  context: DraftReviewAgentContext,
): WebMcpRegistrationState => {
  const contextRef = useRef(context)
  contextRef.current = context
  const tools = useMemo<WebMCP.ModelContextTool[]>(() => {
    const contract = createDraftReviewAgentContract(() => contextRef.current)
    return descriptors.map(descriptor => ({
      ...descriptor,
      execute: async (input, options) => {
        if (options?.signal.aborted) {
          return webMcpInputErrorResponse(new DOMException("Cancelled", "AbortError"))
        }
        return contract.executeTool(descriptor.name as typeof DRAFTY_WEBMCP_MOCK_TOOL_NAMES[number], input)
      },
    }))
  }, [])
  return useWebMcpToolRegistration(tools)
}
