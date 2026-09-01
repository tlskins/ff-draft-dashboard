import {act, fireEvent, render, screen, waitFor} from "@testing-library/react"

import {DraftyChromeAgentConsole} from "../components/DraftyChromeAgentConsole"
import {registerChromeAgentTools} from "../behavior/webmcp/chromeAgentRegistry"


describe("Drafty Codex Chrome agent console", () => {
  const originalUrl = window.location.href

  afterEach(() => {
    window.history.replaceState({}, "", originalUrl)
  })

  it("stays absent from the ordinary dashboard", () => {
    window.history.replaceState({}, "", "/")
    render(<DraftyChromeAgentConsole />)
    expect(screen.queryByRole("complementary", {name: "Drafty agent contract console"}))
      .toBeNull()
  })

  it("executes a registered WebMCP contract through accessible Chrome controls", async () => {
    window.history.replaceState({}, "", "/?agent-tools=1")
    const unregister = registerChromeAgentTools(Symbol("test-console"), [{
      name: "drafty_test_read",
      title: "Read test evidence",
      description: "Return deterministic test evidence.",
      inputSchema: {type: "object", properties: {value: {type: "integer"}}},
      annotations: {readOnlyHint: true},
      execute: async input => ({ok: true, code: "ok", message: "ready", result: input}),
    }])
    render(<DraftyChromeAgentConsole />)

    expect(await screen.findByRole("complementary", {
      name: "Drafty agent contract console",
    })).toBeTruthy()
    expect(screen.getByText(/1 shared WebMCP tools/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText("JSON input"), {
      target: {value: '{"value":7}'},
    })
    fireEvent.click(screen.getByRole("button", {name: "Execute Drafty agent tool"}))
    await waitFor(() => expect(screen.getByLabelText("Drafty agent tool result").textContent)
      .toContain('"value": 7'))
    act(() => unregister())
  })
})
