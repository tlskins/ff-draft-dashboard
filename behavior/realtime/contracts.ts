import type { components } from "../api/schema"
import type { AnalysisViewId } from "../analysis/viewState"

type ApiSchemas = components["schemas"]

export type RealtimeMode = ApiSchemas["RealtimeMode"]
export type RealtimeClientSecretRequest =
  ApiSchemas["RealtimeClientSecretRequest"]
export type RealtimeClientSecretResponse =
  ApiSchemas["RealtimeClientSecretResponse"]
export type DraftPlanEntry = ApiSchemas["DraftPlanEntry"]
export type DraftPlanDocument = ApiSchemas["DraftPlanDocument"]
export type AdvisorProposalStatus = ApiSchemas["AdvisorProposalStatus"]

type ProposalBase = Omit<
  ApiSchemas["AdvisorProposal"],
  "kind" | "payload"
>

export type AnalysisViewProposal = ProposalBase & {
  kind: "analysis_view"
  payload: { view: AnalysisViewId }
}

export type DraftPlanProposal = ProposalBase & {
  kind: "draft_plan"
  payload: {
    operation: "append"
    text: string
  }
}

export type AdvisorProposal =
  | AnalysisViewProposal
  | DraftPlanProposal

export const REALTIME_ADVISOR_TOOL_NAMES = [
  "get_draft_state",
  "get_recommendations",
  "compare_players",
  "propose_analysis_view",
  "propose_draft_plan",
] as const

export type RealtimeAdvisorToolName =
  typeof REALTIME_ADVISOR_TOOL_NAMES[number]

export interface RealtimeFunctionToolDefinition {
  type: "function"
  name: RealtimeAdvisorToolName
  description: string
  parameters: Record<string, unknown>
}

export const REALTIME_ADVISOR_TOOL_DEFINITIONS:
RealtimeFunctionToolDefinition[] = [
  {
    type: "function",
    name: "get_draft_state",
    description:
      "Read the current versioned draft state without changing it.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
  },
  {
    type: "function",
    name: "get_recommendations",
    description:
      "Read Drafty's deterministic recommendation set without changing it.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
  },
  {
    type: "function",
    name: "compare_players",
    description:
      "Compare two to four players without changing draft state.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["player_ids"],
      properties: {
        player_ids: {
          type: "array",
          minItems: 2,
          maxItems: 4,
          uniqueItems: true,
          items: {
            type: "string",
            minLength: 1,
          },
        },
      },
    },
  },
  {
    type: "function",
    name: "propose_analysis_view",
    description:
      "Create an unconfirmed analysis-view proposal; never change the view directly.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["view", "explanation"],
      properties: {
        view: {
          type: "string",
          enum: [
            "tier_landscape",
            "positional_bests",
            "cross_position",
            "intra_position",
          ],
        },
        explanation: {
          type: "string",
          minLength: 1,
          maxLength: 500,
        },
      },
    },
  },
  {
    type: "function",
    name: "propose_draft_plan",
    description:
      "Create an unconfirmed draft-plan proposal; never edit the plan directly.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["text", "explanation"],
      properties: {
        text: {
          type: "string",
          minLength: 1,
          maxLength: 500,
        },
        explanation: {
          type: "string",
          minLength: 1,
          maxLength: 500,
        },
      },
    },
  },
]
