import {
  REALTIME_ADVISOR_TOOL_DEFINITIONS,
  REALTIME_ADVISOR_TOOL_NAMES,
} from "../behavior/realtime/contracts"
import {
  InMemoryRealtimeTransport,
} from "../behavior/realtime/transport"

describe("realtime transport boundary", () => {
  it("exposes only read tools and proposal-only mutation intents", () => {
    expect(REALTIME_ADVISOR_TOOL_DEFINITIONS.map(tool => tool.name))
      .toEqual(REALTIME_ADVISOR_TOOL_NAMES)
    expect(REALTIME_ADVISOR_TOOL_NAMES.filter(name =>
      name.startsWith("propose_"))).toEqual([
      "propose_analysis_view",
      "propose_draft_plan",
    ])
    REALTIME_ADVISOR_TOOL_DEFINITIONS
      .filter(tool => tool.name.startsWith("propose_"))
      .forEach(tool => {
        expect(tool.description).toContain("unconfirmed")
        expect(tool.description).toContain("never")
      })
  })

  it("keeps the mocked text channel deterministic and fail-closed", async () => {
    const transport = new InMemoryRealtimeTransport()
    const events: string[] = []
    transport.subscribe(event => events.push(event.type))

    expect(() => transport.sendUserText("compare these players"))
      .toThrow("not connected")

    await transport.connect()
    transport.sendUserText("compare these players")
    transport.emit({
      type: "assistant_text_done",
      responseId: "response-1",
      text: "The deterministic comparison is ready.",
    })
    transport.disconnect()

    expect(transport.sentTexts).toEqual(["compare these players"])
    expect(events).toEqual([
      "status",
      "status",
      "assistant_text_done",
      "status",
    ])
  })
})
