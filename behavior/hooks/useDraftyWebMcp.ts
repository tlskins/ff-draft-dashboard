import {useEffect, useMemo, useRef, useState} from "react"

import {
  DRAFTY_WEBMCP_HOME_TOOL_NAMES,
  DraftyHomeWebMcpAdapter,
  DraftyWebMcpInputError,
  DraftyWebMcpStatus,
  parseConfigureWorkspaceInput,
  parseMovePlayerRankInput,
  parseSearchPlayersInput,
  parseSetPlayerTargetInput,
  parseSetRankingsViewInput,
  parseShowPlayerProfileInput,
  parseStartRankEditingInput,
  toolSuccess,
  webMcpInputErrorResponse,
} from "../webmcp/draftyWebMcp"


export interface WebMcpRegistrationState {
  status: DraftyWebMcpStatus
  registeredToolCount: number
  errorName: string | null
}

const initialRegistrationState = (): WebMcpRegistrationState => ({
  status: typeof document !== "undefined" && document.modelContext
    ? "registering"
    : "unsupported",
  registeredToolCount: 0,
  errorName: null,
})

const checkedExecute = async <T>(
  signal: AbortSignal,
  execute: () => T | Promise<T>,
) => {
  if (signal.aborted) {
    return webMcpInputErrorResponse(new DOMException("Cancelled", "AbortError"))
  }
  try {
    return await execute()
  } catch (error) {
    return webMcpInputErrorResponse(error)
  }
}

const emptyInput = (input: Record<string, unknown>) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new DraftyWebMcpInputError("Tool input must be an object.")
  }
  if (Object.keys(input).length > 0) {
    throw new DraftyWebMcpInputError("drafty_get_workspace does not accept input fields.")
  }
}

export const useWebMcpToolRegistration = (
  tools: WebMCP.ModelContextTool[],
): WebMcpRegistrationState => {
  const [state, setState] = useState<WebMcpRegistrationState>(initialRegistrationState)

  useEffect(() => {
    const modelContext = document.modelContext
    if (!modelContext) {
      setState({status: "unsupported", registeredToolCount: 0, errorName: null})
      return
    }
    const controller = new AbortController()
    let active = true
    setState({status: "registering", registeredToolCount: 0, errorName: null})
    Promise.all(tools.map(tool => modelContext.registerTool(tool, {
      signal: controller.signal,
    }))).then(() => {
      if (!active) return
      setState({status: "ready", registeredToolCount: tools.length, errorName: null})
    }).catch(error => {
      controller.abort()
      if (!active) return
      setState({
        status: "error",
        registeredToolCount: 0,
        errorName: error instanceof Error ? error.name : "UnknownError",
      })
    })
    return () => {
      active = false
      controller.abort()
    }
  }, [tools])

  return state
}

export const useDraftyWebMcp = (
  adapter: DraftyHomeWebMcpAdapter,
): WebMcpRegistrationState => {
  const adapterRef = useRef(adapter)
  adapterRef.current = adapter

  const tools = useMemo<WebMCP.ModelContextTool[]>(() => [{
    name: DRAFTY_WEBMCP_HOME_TOOL_NAMES[0],
    title: "Get Drafty workspace",
    description: "Read the compact current Drafty configuration, rankings view, focused profile, insight deck, editability, and target count.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: {readOnlyHint: true},
    execute: async (input, {signal}) => checkedExecute(signal, () => {
      emptyInput(input)
      return toolSuccess(
        adapterRef.current.getWorkspace(),
        "Drafty workspace state is current.",
      )
    }),
  }, {
    name: DRAFTY_WEBMCP_HOME_TOOL_NAMES[1],
    title: "Search Drafty players",
    description: "Search the current Drafty player universe, ESPN outlook snippets, and licensed analyst notes. Returns stable player IDs for later actions.",
    inputSchema: {
      type: "object",
      properties: {
        query: {type: "string", maxLength: 240},
        positions: {
          type: "array",
          items: {type: "string", enum: ["QB", "RB", "WR", "TE", "DST", "K"]},
          maxItems: 12,
          uniqueItems: true,
        },
        teams: {type: "array", items: {type: "string"}, maxItems: 12, uniqueItems: true},
        analysts: {type: "array", items: {type: "string"}, maxItems: 12, uniqueItems: true},
        note_categories: {
          type: "array",
          items: {type: "string", enum: ["good", "bad", "watch"]},
          maxItems: 3,
          uniqueItems: true,
        },
        targeted_only: {type: "boolean"},
        available_only: {type: "boolean", default: true},
        limit: {type: "integer", minimum: 1, maximum: 8, default: 5},
      },
      additionalProperties: false,
    },
    annotations: {readOnlyHint: true, untrustedContentHint: true},
    execute: async (input, {signal}) => checkedExecute(signal, () => {
      const parsed = parseSearchPlayersInput(input)
      const result = adapterRef.current.searchPlayers(parsed)
      return toolSuccess(result, `Found ${result.count} matching Drafty players.`)
    }),
  }, {
    name: DRAFTY_WEBMCP_HOME_TOOL_NAMES[2],
    title: "Configure Drafty workspace",
    description: "Apply a validated partial league, lineup, ranking-source, or ADP-source configuration before the draft starts.",
    inputSchema: {
      type: "object",
      properties: {
        team_count: {type: "integer", minimum: 8, maximum: 16},
        user_draft_slot: {type: "integer", minimum: 1, maximum: 16},
        scoring_format: {type: "string", enum: ["standard", "half_ppr", "ppr"]},
        starting_qbs: {type: "integer", minimum: 0, maximum: 3},
        starting_rbs: {type: "integer", minimum: 0, maximum: 5},
        starting_wrs: {type: "integer", minimum: 0, maximum: 6},
        starting_tes: {type: "integer", minimum: 0, maximum: 3},
        flex: {type: "integer", minimum: 0, maximum: 4},
        bench: {type: "integer", minimum: 0, maximum: 12},
        ranking_source: {type: "string", maxLength: 80},
        adp_source: {type: "string", maxLength: 80},
      },
      additionalProperties: false,
      minProperties: 1,
    },
    execute: async (input, {signal}) => checkedExecute(signal, () => (
      adapterRef.current.configureWorkspace(parseConfigureWorkspaceInput(input))
    )),
  }, {
    name: DRAFTY_WEBMCP_HOME_TOOL_NAMES[3],
    title: "Set Drafty rankings view",
    description: "Select the position, ADP-round, or targets rankings view and optionally set positions, an ADP round, sorting, or the below-ADP filter.",
    inputSchema: {
      type: "object",
      properties: {
        view: {type: "string", enum: ["position", "adp_round", "targets"]},
        positions: {
          type: "array",
          items: {type: "string", enum: ["QB", "RB", "WR", "TE"]},
          minItems: 1,
          maxItems: 4,
          uniqueItems: true,
        },
        adp_round: {type: "integer", minimum: 1, maximum: 30},
        sort: {type: "string", enum: ["rank", "adp"]},
        filter_ranked_below_adp: {type: "boolean"},
      },
      additionalProperties: false,
      minProperties: 1,
    },
    execute: async (input, {signal}) => checkedExecute(signal, () => (
      adapterRef.current.setRankingsView(parseSetRankingsViewInput(input))
    )),
  }, {
    name: DRAFTY_WEBMCP_HOME_TOOL_NAMES[4],
    title: "Show Drafty player profile",
    description: "Focus a player by stable ID, optionally pin the focus, select Auto, Draft value, Outlook, or Production, and open or close advanced evidence.",
    inputSchema: {
      type: "object",
      properties: {
        player_id: {type: "string", maxLength: 120},
        pin: {type: "boolean", default: true},
        module: {type: "string", enum: ["auto", "draft_context", "outlook", "production"]},
        advanced_details_open: {type: "boolean"},
      },
      required: ["player_id"],
      additionalProperties: false,
    },
    annotations: {untrustedContentHint: true},
    execute: async (input, {signal}) => checkedExecute(signal, () => (
      adapterRef.current.showPlayerProfile(parseShowPlayerProfileInput(input))
    )),
  }, {
    name: DRAFTY_WEBMCP_HOME_TOOL_NAMES[5],
    title: "Set Drafty player target",
    description: "Add or update one player's earliest target round, or remove that player's target by passing null. Use a stable player ID from search.",
    inputSchema: {
      type: "object",
      properties: {
        player_id: {type: "string", maxLength: 120},
        target_round: {
          anyOf: [
            {type: "integer", minimum: 1, maximum: 30},
            {type: "null"},
          ],
        },
      },
      required: ["player_id", "target_round"],
      additionalProperties: false,
    },
    annotations: {destructiveHint: false, idempotentHint: true},
    execute: async (input, {signal}) => checkedExecute(signal, () => (
      adapterRef.current.setPlayerTarget(parseSetPlayerTargetInput(input))
    )),
  }, {
    name: DRAFTY_WEBMCP_HOME_TOOL_NAMES[6],
    title: "Start Drafty rank editing",
    description: "Start or resume bounded custom positional-rank editing before any player has been drafted or purged.",
    inputSchema: {
      type: "object",
      properties: {
        source_ranker: {type: "string", maxLength: 80},
      },
      additionalProperties: false,
    },
    annotations: {destructiveHint: false, idempotentHint: true},
    execute: async (input, {signal}) => checkedExecute(signal, () => (
      adapterRef.current.startRankEditing(parseStartRankEditingInput(input))
    )),
  }, {
    name: DRAFTY_WEBMCP_HOME_TOOL_NAMES[7],
    title: "Move Drafty player rank",
    description: "Move one player to a validated one-based rank within that player's position while custom rank editing is active.",
    inputSchema: {
      type: "object",
      properties: {
        player_id: {type: "string", maxLength: 120},
        new_rank: {type: "integer", minimum: 1, maximum: 400},
      },
      required: ["player_id", "new_rank"],
      additionalProperties: false,
    },
    annotations: {destructiveHint: false, idempotentHint: true},
    execute: async (input, {signal}) => checkedExecute(signal, () => (
      adapterRef.current.movePlayerRank(parseMovePlayerRankInput(input))
    )),
  }, {
    name: DRAFTY_WEBMCP_HOME_TOOL_NAMES[8],
    title: "Save Drafty rank edits",
    description: "Save the active custom ranking board to Drafty's canonical browser profile, queue authenticated cloud sync when available, and finish editing.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: {destructiveHint: false, idempotentHint: false},
    execute: async (input, {signal}) => checkedExecute(signal, () => {
      emptyInput(input)
      return adapterRef.current.saveRankEdits()
    }),
  }], [])

  return useWebMcpToolRegistration(tools)
}
