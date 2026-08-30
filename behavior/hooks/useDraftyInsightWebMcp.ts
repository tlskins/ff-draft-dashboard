import {useMemo, useRef} from "react"

import {
  INSIGHT_VIEW_IDS,
  InsightViewId,
} from "../insights/insightDeck"
import {
  DRAFTY_WEBMCP_INSIGHT_TOOL_NAME,
  DraftyInsightAgentState,
  DraftyToolResponse,
  DraftyWebMcpInputError,
  toolFailure,
  webMcpInputErrorResponse,
} from "../webmcp/draftyWebMcp"
import {
  useWebMcpToolRegistration,
  WebMcpRegistrationState,
} from "./useDraftyWebMcp"


export interface DraftySetInsightViewInput {
  slot: "decision" | "supporting"
  view: "auto" | InsightViewId
  expanded?: boolean
}

export interface DraftyInsightWebMcpAdapter {
  setInsightView: (
    input: DraftySetInsightViewInput,
  ) => DraftyToolResponse<DraftyInsightAgentState>
}

const parseInput = (value: unknown): DraftySetInsightViewInput => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DraftyWebMcpInputError("Tool input must be an object.")
  }
  const input = value as Record<string, unknown>
  const unknown = Object.keys(input).filter(key => ![
    "slot", "view", "expanded",
  ].includes(key))
  if (unknown.length > 0) {
    throw new DraftyWebMcpInputError(`Unknown input field: ${unknown[0]}.`)
  }
  if (!['decision', 'supporting'].includes(String(input.slot))) {
    throw new DraftyWebMcpInputError("slot must be decision or supporting.")
  }
  if (input.view !== "auto" && !INSIGHT_VIEW_IDS.includes(input.view as InsightViewId)) {
    throw new DraftyWebMcpInputError("view is not a registered Drafty insight.")
  }
  if (input.expanded !== undefined && typeof input.expanded !== "boolean") {
    throw new DraftyWebMcpInputError("expanded must be true or false.")
  }
  return {
    slot: input.slot as DraftySetInsightViewInput["slot"],
    view: input.view as DraftySetInsightViewInput["view"],
    expanded: input.expanded as boolean | undefined,
  }
}

export const useDraftyInsightWebMcp = (
  adapter: DraftyInsightWebMcpAdapter,
): WebMcpRegistrationState => {
  const adapterRef = useRef(adapter)
  adapterRef.current = adapter
  const tools = useMemo<WebMCP.ModelContextTool[]>(() => [{
    name: DRAFTY_WEBMCP_INSIGHT_TOOL_NAME,
    title: "Set Drafty insight view",
    description: "Select Auto or a registered Drafty insight in the Decision or Supporting slot, and optionally expand or split that slot.",
    inputSchema: {
      type: "object",
      properties: {
        slot: {type: "string", enum: ["decision", "supporting"]},
        view: {type: "string", enum: ["auto", ...INSIGHT_VIEW_IDS]},
        expanded: {type: "boolean"},
      },
      required: ["slot", "view"],
      additionalProperties: false,
    },
    execute: async (input, options) => {
      if (options?.signal.aborted) return toolFailure("cancelled", "The tool call was cancelled.")
      try {
        return adapterRef.current.setInsightView(parseInput(input))
      } catch (error) {
        return webMcpInputErrorResponse(error)
      }
    },
  }], [])
  return useWebMcpToolRegistration(tools)
}
