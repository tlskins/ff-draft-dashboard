import {act, renderHook, waitFor} from "@testing-library/react"

import {
  useDraftyWebMcp,
} from "../behavior/hooks/useDraftyWebMcp"
import {
  useDraftyInsightWebMcp,
} from "../behavior/hooks/useDraftyInsightWebMcp"
import {
  DRAFTY_WEBMCP_HOME_TOOL_NAMES,
  DRAFTY_WEBMCP_INSIGHT_TOOL_NAME,
  DraftyHomeWebMcpAdapter,
  DraftyInsightAgentState,
  DraftyWorkspaceSnapshot,
  parseConfigureWorkspaceInput,
  parseMovePlayerRankInput,
  parseSearchPlayersInput,
  parseSetPlayerTargetInput,
  parseStartRankEditingInput,
  searchDraftyPlayers,
  toolSuccess,
} from "../behavior/webmcp/draftyWebMcp"
import {
  FantasyPosition,
  NFLTeam,
  ThirdPartyADPRanker,
  ThirdPartyRanker,
  type Player,
} from "../types"


const settings = {
  ppr: false,
  scoringFormat: "standard" as const,
  numTeams: 12,
  numStartingQbs: 1,
  numStartingRbs: 2,
  numStartingWrs: 2,
  numStartingTes: 1,
  numFlex: 1,
  numBenchPlayers: 6,
}

const tier = {
  tierNumber: 2,
  upperLimitPlayerIdx: 0,
  lowerLimitPlayerIdx: 4,
  upperLimitValue: 14,
  lowerLimitValue: 10,
}

const player = (overrides: Partial<Player> = {}): Player => ({
  id: "kraft",
  firstName: "Tucker",
  lastName: "Kraft",
  fullName: "Tucker Kraft",
  team: NFLTeam.GB,
  position: FantasyPosition.TIGHT_END,
  ranks: {
    [ThirdPartyRanker.HARRIS]: {
      playerId: "kraft",
      ranker: ThirdPartyRanker.HARRIS,
      position: FantasyPosition.TIGHT_END,
      standardPositionRank: 7,
      standardOverallRank: 72,
      standardPositionTier: tier,
    },
    [ThirdPartyADPRanker.ESPN]: {
      playerId: "kraft",
      ranker: ThirdPartyADPRanker.ESPN,
      position: FantasyPosition.TIGHT_END,
      adp: 96.5,
    },
  },
  outlook: {
    text: "Kraft can earn more routes if his pass protection remains reliable.",
    source: "espn",
    season: 2026,
    observedAt: "2026-08-20T00:00:00Z",
  },
  profileNotes: [{
    noteId: "kraft-note",
    subject: "Tucker Kraft",
    scope: "player",
    category: "watch",
    sentiment: "mixed",
    actionType: "monitor",
    actionQualifier: null,
    summary: "Blocking concerns could reduce high-value routes.",
    evidence: "The analyst compared his assignment risk with other tight ends.",
    counterweight: "His yards after catch remain a strength.",
    practicalImplication: "Do not pay ahead of the middle-round tight-end tier.",
    speakers: ["Christopher Harris"],
    source: "harris_football_podcast",
    sourceLabel: "Harris Football",
    sourceUrl: "https://example.com/kraft",
    episodeId: "episode-1",
    episodeTitle: "Tight End Ranks",
    coverage: "full-transcript",
    confidence: "high",
    publishedAt: "2026-08-22T00:00:00Z",
  }],
  injuryStatus: {
    status: "QUESTIONABLE",
    injured: true,
    source: "espn",
    observedAt: "2026-08-21T00:00:00Z",
  },
  ...overrides,
})

const insightState: DraftyInsightAgentState = {
  available: true,
  slots: [
    {slot: "decision", view: "current_tier_market", mode: "auto", evidence: "ready"},
    {slot: "supporting", view: "candidate_comparison", mode: "auto", evidence: "ready"},
  ],
  expandedSlot: "decision",
}

const workspace: DraftyWorkspaceSnapshot = {
  draft: {started: false, currentPick: 1, teamCount: 12, userDraftSlot: 6},
  configuration: {
    scoringFormat: "standard",
    starters: {qb: 1, rb: 2, wr: 2, te: 1, flex: 1, bench: 6},
    rankingSource: "Harris",
    adpSource: "ESPN",
    availableRankingSources: ["Harris", "FantasyPros"],
    availableAdpSources: ["ESPN", "FantasyPros"],
  },
  rankings: {
    view: "position",
    visiblePositions: ["RB", "WR"],
    sort: "rank",
    adpRoundPage: 1,
    adpRoundsVisible: [1, 2, 3],
    filterRankedBelowAdp: false,
    editing: false,
    editable: true,
  },
  profile: {
    playerId: null,
    playerName: null,
    pinned: false,
    module: "production",
    advancedDetailsOpen: true,
  },
  insights: insightState,
  targets: {count: 0},
  persistence: {
    rankingsHydrated: true,
    targetsHydrated: true,
    localRankingProfileSaved: false,
    cloudSyncEnabled: true,
    authenticated: true,
    cloudSyncState: "synced",
  },
}

const adapter = (getWorkspace = jest.fn(() => workspace)): DraftyHomeWebMcpAdapter => ({
  getWorkspace,
  searchPlayers: jest.fn(() => ({count: 0, players: []})),
  configureWorkspace: jest.fn(() => toolSuccess(workspace, "configured", "accepted")),
  setRankingsView: jest.fn(() => toolSuccess(workspace.rankings, "view", "accepted")),
  showPlayerProfile: jest.fn(() => toolSuccess(workspace.profile, "profile", "accepted")),
  setPlayerTarget: jest.fn(input => toolSuccess({
    playerId: input.player_id,
    playerName: "Tucker Kraft",
    previousTargetRound: null,
    targetRound: input.target_round,
    targetCount: input.target_round === null ? 0 : 1,
    persistence: {
      local: "scheduled",
      cloudSyncEnabled: true,
      authenticated: true,
      cloudSyncState: "synced",
    },
  }, "target", "accepted")),
  startRankEditing: jest.fn(() => toolSuccess({
    editing: true,
    rankingSource: "Custom",
    copiedFrom: "Harris",
    editable: true,
  }, "started", "accepted")),
  movePlayerRank: jest.fn(input => toolSuccess({
    playerId: input.player_id,
    playerName: "Tucker Kraft",
    position: FantasyPosition.TIGHT_END,
    previousRank: 7,
    rank: input.new_rank,
    positionPlayerCount: 24,
    persistence: "unsaved",
  }, "moved", "accepted")),
  saveRankEdits: jest.fn(() => toolSuccess({
    editing: false,
    rankingSource: "Custom",
    localPersistence: "saved",
    cloudSync: {enabled: true, authenticated: true, state: "synced"},
  }, "saved", "accepted")),
})

const installModelContext = () => {
  const registerTool = jest.fn().mockResolvedValue(undefined)
  const modelContext = {
    registerTool,
    getTools: jest.fn().mockResolvedValue([]),
    ontoolchange: null,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  } as unknown as WebMCP.ModelContext
  Object.defineProperty(document, "modelContext", {
    configurable: true,
    value: modelContext,
  })
  return {modelContext, registerTool}
}

describe("Phase 17A WebMCP", () => {
  afterEach(() => {
    delete (document as {modelContext?: WebMCP.ModelContext}).modelContext
    jest.restoreAllMocks()
  })

  it("validates strict workspace and search inputs", () => {
    expect(parseConfigureWorkspaceInput({
      team_count: 12,
      scoring_format: "half_ppr",
      starting_rbs: 3,
    })).toMatchObject({
      team_count: 12,
      scoring_format: "half_ppr",
      starting_rbs: 3,
    })
    expect(() => parseConfigureWorkspaceInput({unknown: true})).toThrow(
      "Unknown input field",
    )
    expect(() => parseSearchPlayersInput({limit: 9})).toThrow(
      "limit must be an integer from 1 to 8",
    )
    expect(parseSetPlayerTargetInput({
      player_id: "kraft",
      target_round: null,
    })).toEqual({player_id: "kraft", target_round: null})
    expect(() => parseSetPlayerTargetInput({player_id: "kraft"})).toThrow(
      "target_round is required",
    )
    expect(parseStartRankEditingInput({source_ranker: "Harris"})).toEqual({
      source_ranker: "Harris",
    })
    expect(parseMovePlayerRankInput({player_id: "kraft", new_rank: 3})).toEqual({
      player_id: "kraft",
      new_rank: 3,
    })
    expect(() => parseMovePlayerRankInput({player_id: "kraft", new_rank: 0})).toThrow(
      "new_rank must be an integer from 1 to 400",
    )
  })

  it("searches bounded identity, outlook, and analyst-note evidence", () => {
    const inactive = player({
      id: "inactive",
      fullName: "Inactive Tight End",
      availability: {
        state: "inactive_confirmed",
        automaticRecommendationEligible: false,
        source: "test",
        reason: "inactive",
      },
    })
    const result = searchDraftyPlayers({
      players: [player(), inactive],
      settings,
      boardSettings: {
        ranker: ThirdPartyRanker.HARRIS,
        adpRanker: ThirdPartyADPRanker.ESPN,
      },
      playerTargets: [{playerId: "kraft", targetAsEarlyAsRound: 7}],
      input: {
        query: "blocking concerns",
        analysts: ["Christopher Harris"],
        note_categories: ["watch"],
        limit: 5,
      },
    })

    expect(result.count).toBe(1)
    expect(result.players[0]).toMatchObject({
      playerId: "kraft",
      positionRank: 7,
      tier: 2,
      adp: 96.5,
      targetRound: 7,
      injuryStatus: "QUESTIONABLE",
      matchedFields: ["analyst_notes"],
      noteMatches: [{
        noteId: "kraft-note",
        category: "watch",
        analysts: ["Christopher Harris"],
      }],
    })
    expect(result.players[0].noteMatches[0].summary.length).toBeLessThanOrEqual(180)
  })

  it("keeps the maximum player-search envelope within its agent-eval byte budget", () => {
    const players = Array.from({length: 12}, (_, index) => player({
      id: `kraft-${index}`,
      fullName: `Tucker Kraft ${index}`,
    }))
    const result = searchDraftyPlayers({
      players,
      settings,
      boardSettings: {
        ranker: ThirdPartyRanker.HARRIS,
        adpRanker: ThirdPartyADPRanker.ESPN,
      },
      playerTargets: [],
      input: {available_only: false, limit: 8},
    })
    const envelope = toolSuccess(result, `Found ${result.count} matching Drafty players.`)

    expect(result.count).toBe(8)
    expect(Buffer.byteLength(JSON.stringify(envelope), "utf8")).toBeLessThanOrEqual(12000)
  })

  it("registers the stable Phase 17B home catalog, uses the latest adapter, and unregisters", async () => {
    const {registerTool} = installModelContext()
    const firstGet = jest.fn(() => workspace)
    const secondGet = jest.fn(() => ({
      ...workspace,
      draft: {...workspace.draft, currentPick: 8},
    }))
    const view = renderHook(
      ({value}) => useDraftyWebMcp(value),
      {initialProps: {value: adapter(firstGet)}},
    )
    await waitFor(() => expect(view.result.current.status).toBe("ready"))
    expect(registerTool).toHaveBeenCalledTimes(9)
    expect(registerTool.mock.calls.map(call => call[0].name)).toEqual(
      DRAFTY_WEBMCP_HOME_TOOL_NAMES,
    )
    registerTool.mock.calls.forEach(([tool]) => {
      expect(tool.name.length).toBeLessThanOrEqual(30)
      expect(tool.description.length).toBeLessThanOrEqual(500)
      expect(Object.keys(tool.inputSchema.properties || {}).every(
        parameter => parameter.length <= 30,
      )).toBe(true)
    })
    const registrationSignals = registerTool.mock.calls.map(call => call[1].signal)
    view.rerender({value: adapter(secondGet)})
    const getWorkspaceTool = registerTool.mock.calls[0][0] as WebMCP.ModelContextTool
    const response = await getWorkspaceTool.execute({}, {signal: new AbortController().signal}) as {
      ok: boolean
      result: DraftyWorkspaceSnapshot
    }
    expect(response.result.draft.currentPick).toBe(8)
    expect(firstGet).not.toHaveBeenCalled()
    expect(secondGet).toHaveBeenCalledTimes(1)
    view.unmount()
    expect(registrationSignals.every(signal => signal.aborted)).toBe(true)
  })

  it("routes bounded target and positional-rank writes through the current adapter", async () => {
    const {registerTool} = installModelContext()
    const currentAdapter = adapter()
    const {result, unmount} = renderHook(() => useDraftyWebMcp(currentAdapter))
    await waitFor(() => expect(result.current.status).toBe("ready"))

    const tools = new Map(registerTool.mock.calls.map(call => [
      call[0].name,
      call[0] as WebMCP.ModelContextTool,
    ]))
    const signal = new AbortController().signal
    await expect(tools.get("drafty_set_player_target")!.execute({
      player_id: "kraft",
      target_round: 6,
    }, {signal})).resolves.toMatchObject({ok: true, result: {targetRound: 6}})
    await expect(tools.get("drafty_start_rank_editing")!.execute({
      source_ranker: "Harris",
    }, {signal})).resolves.toMatchObject({ok: true, result: {editing: true}})
    await expect(tools.get("drafty_move_player_rank")!.execute({
      player_id: "kraft",
      new_rank: 3,
    }, {signal})).resolves.toMatchObject({ok: true, result: {rank: 3}})
    await expect(tools.get("drafty_save_rank_edits")!.execute({}, {signal}))
      .resolves.toMatchObject({ok: true, result: {localPersistence: "saved"}})

    expect(currentAdapter.setPlayerTarget).toHaveBeenCalledWith({
      player_id: "kraft",
      target_round: 6,
    })
    expect(currentAdapter.startRankEditing).toHaveBeenCalledWith({
      source_ranker: "Harris",
    })
    expect(currentAdapter.movePlayerRank).toHaveBeenCalledWith({
      player_id: "kraft",
      new_rank: 3,
    })
    expect(currentAdapter.saveRankEdits).toHaveBeenCalledTimes(1)
    unmount()
  })

  it("stays inert when the browser does not support WebMCP", () => {
    const {result} = renderHook(() => useDraftyWebMcp(adapter()))
    expect(result.current).toEqual({
      status: "unsupported",
      registeredToolCount: 0,
      errorName: null,
    })
  })

  it("registers and invokes the bounded insight tool", async () => {
    const {registerTool} = installModelContext()
    const setInsightView = jest.fn(() => toolSuccess(
      insightState,
      "selected",
      "accepted",
    ))
    const {result, unmount} = renderHook(() => useDraftyInsightWebMcp({
      setInsightView,
    }))
    await waitFor(() => expect(result.current.status).toBe("ready"))
    expect(registerTool).toHaveBeenCalledTimes(1)
    const tool = registerTool.mock.calls[0][0] as WebMCP.ModelContextTool
    expect(tool.name).toBe(DRAFTY_WEBMCP_INSIGHT_TOOL_NAME)
    await act(async () => {
      const response = await tool.execute({
        slot: "supporting",
        view: "two_round_run_matrix",
        expanded: true,
      }, {signal: new AbortController().signal})
      expect(response).toMatchObject({ok: true, code: "accepted"})
    })
    expect(setInsightView).toHaveBeenCalledWith({
      slot: "supporting",
      view: "two_round_run_matrix",
      expanded: true,
    })
    unmount()
  })
})
