import {toolFailure} from "./draftyWebMcp"


const toolsByOwner = new Map<symbol, WebMCP.ModelContextTool[]>()

const allTools = (): WebMCP.ModelContextTool[] => {
  const byName = new Map<string, WebMCP.ModelContextTool>()
  toolsByOwner.forEach(tools => tools.forEach(tool => byName.set(tool.name, tool)))
  return Array.from(byName.values()).sort((left, right) => left.name.localeCompare(right.name))
}

const publishToolCount = () => {
  if (typeof document === "undefined") return
  document.documentElement.dataset.draftyChromeAgentToolCount = String(allTools().length)
}

export const registerChromeAgentTools = (
  owner: symbol,
  tools: WebMCP.ModelContextTool[],
): (() => void) => {
  toolsByOwner.set(owner, tools)
  publishToolCount()
  return () => {
    toolsByOwner.delete(owner)
    publishToolCount()
  }
}

export const chromeAgentToolDescriptors = () => allTools().map(tool => ({
  name: tool.name,
  title: tool.title,
  description: tool.description,
  inputSchema: tool.inputSchema,
  annotations: tool.annotations,
}))

export const executeChromeAgentTool = async (
  toolName: string,
  input: unknown = {},
): Promise<unknown> => {
  const tool = allTools().find(candidate => candidate.name === toolName)
  if (!tool) return toolFailure("not_found", `Unknown Drafty agent tool: ${toolName}.`)
  return tool.execute(input as Record<string, unknown>, {
    signal: new AbortController().signal,
  })
}
