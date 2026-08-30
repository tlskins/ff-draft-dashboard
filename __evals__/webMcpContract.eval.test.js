const corpus = require("../behavior/webmcp/webmcp-task-corpus.json")
const {
  evaluateWebMcpRun,
  validateCorpus,
} = require("../scripts/webmcp-eval-lib.cjs")

const knownTools = new Set([
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
  "drafty_set_insight_view",
  "drafty_list_mock_drafts",
  "drafty_review_mock_draft",
  "drafty_open_mock_review",
])

const setPath = (target, path, value) => {
  const segments = path.split(".")
  let current = target
  segments.forEach((segment, index) => {
    const final = index === segments.length - 1
    if (final) current[segment] = value
    else {
      const nextIsArray = /^\d+$/.test(segments[index + 1])
      current[segment] ||= nextIsArray ? [] : {}
      current = current[segment]
    }
  })
}

const stateFor = journey => {
  const state = {}
  journey.state_assertions.forEach(assertion => setPath(state, assertion.path, assertion.value))
  return state
}

const referenceRun = () => ({
  schema_version: 1,
  run_id: "reference",
  agent: "deterministic-reference",
  browser: "contract",
  journeys: corpus.journeys.map(journey => {
    const state = stateFor(journey)
    return {
      id: journey.id,
      completed: true,
      calls: journey.required_tool_sequence.map(tool => ({
        tool,
        input: {},
        result: {ok: true},
        retry: false,
      })),
      observed_state: state,
      agent_state: JSON.parse(JSON.stringify(state)),
    }
  }),
})

describe("Phase 17C WebMCP agent-eval contract", () => {
  it("keeps the corpus bounded to the approved non-drafting tool surface", () => {
    expect(() => validateCorpus(corpus)).not.toThrow()
    const tools = corpus.journeys.flatMap(journey => journey.allowed_tools)
    expect(tools.every(tool => knownTools.has(tool))).toBe(true)
    expect(tools.some(tool => /draft_player|select_player|clear_all/.test(tool))).toBe(false)
  })

  it("passes a correct, retry-free, human-visible reference trace", () => {
    const report = evaluateWebMcpRun(corpus, referenceRun())
    expect(report.overall).toBe("passed")
    expect(report.metrics).toMatchObject({
      task_success_rate: 1,
      correct_tool_rate: 1,
      sequence_success_rate: 1,
      human_visible_agreement_rate: 1,
      retry_rate: 0,
    })
    expect(report.metrics.estimated_interaction_reduction).toBeGreaterThan(0.6)
  })

  it("fails wrong tools, retries, oversized output, and state disagreement", () => {
    const run = referenceRun()
    const trace = run.journeys.find(journey => journey.id === "configure_pre_draft_workspace")
    trace.calls.unshift({
      tool: "drafty_show_player_profile",
      input: {},
      result: {ok: true, payload: "x".repeat(7000)},
      retry: true,
    })
    trace.agent_state.draft.teamCount = 12

    const report = evaluateWebMcpRun(corpus, run)
    expect(report.overall).toBe("failed")
    expect(report.metrics.correct_tool_rate).toBeLessThan(1)
    expect(report.metrics.retry_rate).toBeGreaterThan(0)
    expect(report.journeys.find(journey => journey.id === "configure_pre_draft_workspace"))
      .toMatchObject({
      task_success: false,
      human_visible_agreement: false,
      wrong_tool_calls: 1,
      retries: 1,
      within_budgets: false,
      })
  })
})
