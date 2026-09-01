import {useCallback, useEffect, useState} from "react"
import Link from "next/link"

import {
  chromeAgentToolDescriptors,
  DRAFTY_CHROME_AGENT_TOOLS_CHANGED,
  executeChromeAgentTool,
} from "../behavior/webmcp/chromeAgentRegistry"


interface AgentToolDescriptor {
  name: string
  title: string
  description: string
}

const availableTools = (): AgentToolDescriptor[] => chromeAgentToolDescriptors()
  .map(tool => ({
    name: tool.name,
    title: tool.title || tool.name,
    description: tool.description,
  }))

/**
 * Chrome's extension-controlled JavaScript world cannot directly access page
 * globals. This opt-in console gives Codex Chrome a stable accessible control
 * surface for the exact same registered tool executors and JSON envelopes.
 */
export const DraftyChromeAgentConsole = () => {
  const [enabled, setEnabled] = useState(false)
  const [tools, setTools] = useState<AgentToolDescriptor[]>([])
  const [toolName, setToolName] = useState("")
  const [input, setInput] = useState("{}")
  const [result, setResult] = useState("")
  const [running, setRunning] = useState(false)

  const refreshTools = useCallback(() => {
    const next = availableTools()
    setTools(next)
    setToolName(current => current && next.some(tool => tool.name === current)
      ? current
      : next.find(tool => tool.name === "drafty_get_workspace")?.name || next[0]?.name || "")
  }, [])

  useEffect(() => {
    const active = new URLSearchParams(window.location.search).get("agent-tools") === "1"
    setEnabled(active)
    if (!active) return
    refreshTools()
    window.addEventListener(DRAFTY_CHROME_AGENT_TOOLS_CHANGED, refreshTools)
    return () => window.removeEventListener(DRAFTY_CHROME_AGENT_TOOLS_CHANGED, refreshTools)
  }, [refreshTools])

  const execute = useCallback(async () => {
    setRunning(true)
    try {
      const parsed = JSON.parse(input) as unknown
      const response = await executeChromeAgentTool(toolName, parsed)
      setResult(JSON.stringify(response, null, 2))
    } catch (error) {
      setResult(JSON.stringify({
        ok: false,
        code: "invalid_input",
        message: error instanceof Error ? error.message : "Agent input is not valid JSON.",
      }, null, 2))
    } finally {
      setRunning(false)
    }
  }, [input, toolName])

  if (!enabled) return null
  const selected = tools.find(tool => tool.name === toolName)
  return (
    <aside
      aria-label="Drafty agent contract console"
      className="fixed inset-4 z-50 flex flex-col overflow-hidden rounded border-2 border-blue-500 bg-gray-100 text-left text-gray-900 shadow-2xl"
      data-drafty-agent-console="ready"
      style={{zIndex: 2000}}
    >
      <header className="flex items-start justify-between gap-4 border-b border-gray-400 bg-gray-900 px-4 py-3 text-white">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-300">Codex Chrome bridge</p>
          <h1 className="text-lg font-bold">Drafty agent contract</h1>
          <p className="text-xs text-gray-300">{tools.length} shared WebMCP tools · same inputs and structured results</p>
        </div>
        <Link className="rounded border border-gray-400 px-3 py-1.5 text-sm font-semibold" href="/">Close console</Link>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-3 p-3">
        <section className="flex min-h-0 flex-col gap-2">
          <label className="text-sm font-bold" htmlFor="drafty-agent-tool">Tool</label>
          <select
            className="rounded border border-gray-400 bg-white px-3 py-2 font-mono text-sm"
            id="drafty-agent-tool"
            onChange={event => setToolName(event.target.value)}
            value={toolName}
          >
            {tools.map(tool => <option key={tool.name} value={tool.name}>{tool.name}</option>)}
          </select>
          <p className="min-h-[3rem] text-sm text-gray-700">{selected?.title}: {selected?.description}</p>
          <label className="text-sm font-bold" htmlFor="drafty-agent-input">JSON input</label>
          <textarea
            className="min-h-0 flex-1 resize-none rounded border border-gray-400 bg-white p-3 font-mono text-sm"
            id="drafty-agent-input"
            onChange={event => setInput(event.target.value)}
            spellCheck={false}
            value={input}
          />
          <button
            className="rounded bg-blue-700 px-4 py-2 text-sm font-bold text-white disabled:bg-gray-500"
            disabled={!toolName || running}
            onClick={() => void execute()}
            type="button"
          >
            {running ? "Running…" : "Execute Drafty agent tool"}
          </button>
        </section>
        <section className="flex min-h-0 flex-col gap-2">
          <h2 className="text-sm font-bold">Structured result</h2>
          <pre
            aria-label="Drafty agent tool result"
            className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap rounded border border-gray-400 bg-white p-3 font-mono text-xs"
          >
            {result || "Run a tool to return its Drafty response envelope."}
          </pre>
        </section>
      </div>
    </aside>
  )
}
