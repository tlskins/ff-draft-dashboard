import {useEffect} from "react"

import {
  chromeAgentToolDescriptors,
  executeChromeAgentTool,
} from "../webmcp/chromeAgentRegistry"


export interface DraftyChromeAgentBridge {
  readonly version: 1
  readonly surface: "codex_chrome"
  getTools: () => ReturnType<typeof chromeAgentToolDescriptors>
  executeTool: (toolName: string, input?: unknown) => Promise<unknown>
}

declare global {
  interface Window {
    draftyAgentBridge?: DraftyChromeAgentBridge
  }
}

/**
 * Chrome does not currently expose the page's WebMCP registry to Codex. This
 * first-party bridge mirrors the same bounded tool names, inputs, and results
 * on a stable window property so the Codex Chrome surface can invoke the
 * deterministic contract without scraping the scorecard UI.
 */
export const useDraftyChromeAgentBridge = (
): void => {
  useEffect(() => {
    const bridge: DraftyChromeAgentBridge = Object.freeze({
      version: 1,
      surface: "codex_chrome",
      getTools: chromeAgentToolDescriptors,
      executeTool: executeChromeAgentTool,
    })
    window.draftyAgentBridge = bridge
    document.documentElement.dataset.draftyChromeAgentBridge = "ready"
    return () => {
      if (window.draftyAgentBridge === bridge) delete window.draftyAgentBridge
      delete document.documentElement.dataset.draftyChromeAgentBridge
      delete document.documentElement.dataset.draftyChromeAgentToolCount
    }
  }, [])
}
