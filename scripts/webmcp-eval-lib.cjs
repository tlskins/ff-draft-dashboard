const { Buffer } = require("node:buffer")

const isRecord = value => Boolean(value) && typeof value === "object" && !Array.isArray(value)

const valueAtPath = (value, path) => path.split(".").reduce((current, segment) => {
  if (current === null || current === undefined) return undefined
  return current[segment]
}, value)

const assertionPasses = (state, assertion) => {
  const actual = valueAtPath(state, assertion.path)
  if (assertion.op === "eq") return JSON.stringify(actual) === JSON.stringify(assertion.value)
  if (assertion.op === "gte") return typeof actual === "number" && actual >= assertion.value
  if (assertion.op === "includes") return Array.isArray(actual) && actual.includes(assertion.value)
  return false
}

const sequenceIsSubsequence = (required, actual) => {
  let cursor = 0
  for (const tool of actual) if (tool === required[cursor]) cursor += 1
  return cursor === required.length
}

const resultBytes = call => Number.isInteger(call.result_bytes)
  ? call.result_bytes
  : Buffer.byteLength(JSON.stringify(call.result ?? null), "utf8")

const validateCorpus = corpus => {
  if (!isRecord(corpus) || corpus.schema_version !== 1 || !Array.isArray(corpus.journeys)) {
    throw new Error("WebMCP corpus must use schema_version 1 and contain journeys")
  }
  const ids = new Set()
  for (const journey of corpus.journeys) {
    if (!isRecord(journey) || typeof journey.id !== "string" || ids.has(journey.id)) {
      throw new Error("WebMCP corpus journey IDs must be unique strings")
    }
    ids.add(journey.id)
    if (!Array.isArray(journey.required_tool_sequence) || journey.required_tool_sequence.length === 0) {
      throw new Error(`${journey.id} must declare a required tool sequence`)
    }
    if (!Array.isArray(journey.allowed_tools) || !journey.required_tool_sequence.every(tool => journey.allowed_tools.includes(tool))) {
      throw new Error(`${journey.id} must allow every required tool`)
    }
    if (!Array.isArray(journey.state_assertions)) {
      throw new Error(`${journey.id} must declare state assertions`)
    }
  }
  return corpus
}

const evaluateJourney = (specification, trace) => {
  const calls = Array.isArray(trace?.calls) ? trace.calls : []
  const toolNames = calls.map(call => call.tool)
  const wrongToolCalls = calls.filter(call => !specification.allowed_tools.includes(call.tool)).length
  const retries = calls.filter(call => call.retry === true).length
  const bytes = calls.reduce((total, call) => total + resultBytes(call), 0)
  const sequenceSuccess = sequenceIsSubsequence(specification.required_tool_sequence, toolNames)
  const toolFailures = calls.filter(call => call.result?.ok === false).length
  const observedStateSuccess = specification.state_assertions.every(assertion => (
    assertionPasses(trace?.observed_state, assertion)
  ))
  const humanVisibleAgreement = specification.state_assertions.every(assertion => (
    assertionPasses(trace?.agent_state, assertion)
    && JSON.stringify(valueAtPath(trace?.agent_state, assertion.path))
      === JSON.stringify(valueAtPath(trace?.observed_state, assertion.path))
  ))
  const withinBudgets = calls.length <= specification.max_tool_calls
    && retries <= specification.max_retries
    && bytes <= specification.max_result_bytes
  const taskSuccess = trace?.completed === true
    && sequenceSuccess
    && wrongToolCalls === 0
    && toolFailures === 0
    && observedStateSuccess
    && humanVisibleAgreement
    && withinBudgets
  return {
    id: specification.id,
    task_success: taskSuccess,
    sequence_success: sequenceSuccess,
    observed_state_success: observedStateSuccess,
    human_visible_agreement: humanVisibleAgreement,
    tool_calls: calls.length,
    wrong_tool_calls: wrongToolCalls,
    retries,
    tool_failures: toolFailures,
    result_bytes: bytes,
    within_budgets: withinBudgets,
    estimated_dom_actions: specification.estimated_dom_actions,
  }
}

const rate = (numerator, denominator) => denominator === 0 ? 0 : numerator / denominator

const evaluateWebMcpRun = (corpusValue, run) => {
  const corpus = validateCorpus(corpusValue)
  if (!isRecord(run) || run.schema_version !== 1 || !Array.isArray(run.journeys)) {
    throw new Error("WebMCP run must use schema_version 1 and contain journeys")
  }
  const traceById = new Map(run.journeys.map(trace => [trace.id, trace]))
  const journeys = corpus.journeys.map(specification => evaluateJourney(
    specification,
    traceById.get(specification.id),
  ))
  const totalCalls = journeys.reduce((sum, journey) => sum + journey.tool_calls, 0)
  const totalWrong = journeys.reduce((sum, journey) => sum + journey.wrong_tool_calls, 0)
  const totalRetries = journeys.reduce((sum, journey) => sum + journey.retries, 0)
  const estimatedDomActions = journeys.reduce((sum, journey) => sum + journey.estimated_dom_actions, 0)
  const metrics = {
    task_success_rate: rate(journeys.filter(journey => journey.task_success).length, journeys.length),
    correct_tool_rate: rate(totalCalls - totalWrong, totalCalls),
    sequence_success_rate: rate(journeys.filter(journey => journey.sequence_success).length, journeys.length),
    human_visible_agreement_rate: rate(journeys.filter(journey => journey.human_visible_agreement).length, journeys.length),
    retry_rate: rate(totalRetries, totalCalls),
    total_tool_calls: totalCalls,
    total_result_bytes: journeys.reduce((sum, journey) => sum + journey.result_bytes, 0),
    estimated_dom_actions: estimatedDomActions,
    estimated_interaction_reduction: estimatedDomActions === 0
      ? 0
      : 1 - totalCalls / estimatedDomActions,
  }
  const gates = corpus.aggregate_gates
  const overall = metrics.task_success_rate >= gates.minimum_task_success_rate
    && metrics.correct_tool_rate >= gates.minimum_correct_tool_rate
    && metrics.sequence_success_rate >= gates.minimum_sequence_success_rate
    && metrics.human_visible_agreement_rate >= gates.minimum_human_visible_agreement_rate
    && metrics.retry_rate <= gates.maximum_retry_rate
    && journeys.every(journey => journey.within_budgets)
    ? "passed"
    : "failed"
  return {
    report_version: 1,
    kind: "drafty-webmcp-agent-eval",
    corpus_id: corpus.corpus_id,
    run_id: run.run_id || null,
    agent: run.agent || null,
    browser: run.browser || null,
    overall,
    metrics,
    journeys,
    limitations: [
      "Estimated DOM actions are a declared interaction baseline, not observed browser telemetry.",
      "A passing report requires an actual compatible-agent trace and separately observed human-visible state.",
    ],
  }
}

module.exports = { assertionPasses, evaluateWebMcpRun, sequenceIsSubsequence, validateCorpus }
