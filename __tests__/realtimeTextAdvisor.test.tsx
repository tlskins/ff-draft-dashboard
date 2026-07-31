import React from "react"
import {
  fireEvent,
  render,
} from "@testing-library/react"

import RealtimeTextAdvisor from "../components/RealtimeTextAdvisor"

describe("Realtime text advisor", () => {
  it("requires a connection before sending and renders streamed messages", () => {
    const onConnect = jest.fn().mockResolvedValue(undefined)
    const onDisconnect = jest.fn()
    const onSendText = jest.fn().mockReturnValue(true)
    const onSetAutoAdviceEnabled = jest.fn()
    const view = render(
      <RealtimeTextAdvisor
        error={null}
        isResponding={false}
        messages={[]}
        reconnectAttempt={0}
        autoAdviceEnabled={true}
        mode="text"
        microphoneEnabled={false}
        isUserSpeaking={false}
        onCancelResponse={jest.fn().mockReturnValue(true)}
        onConnect={onConnect}
        onDisconnect={onDisconnect}
        onSetAutoAdviceEnabled={onSetAutoAdviceEnabled}
        onSetMode={jest.fn().mockReturnValue(true)}
        onSetMicrophoneEnabled={jest.fn().mockReturnValue(true)}
        onSendText={onSendText}
        status="disconnected"
      />,
    )

    expect(view.getByRole("button", { name: "Send" })
      .hasAttribute("disabled")).toBe(true)
    fireEvent.click(view.getByRole("button", { name: "Connect" }))
    expect(onConnect).toHaveBeenCalledTimes(1)

    view.rerender(
      <RealtimeTextAdvisor
        error={null}
        isResponding={true}
        messages={[
          {
            id: "user-1",
            role: "user",
            text: "Compare the top running backs.",
            streaming: false,
          },
          {
            id: "assistant-1",
            role: "assistant",
            text: "The first player has the stronger tier outlook.",
            streaming: true,
          },
        ]}
        reconnectAttempt={0}
        autoAdviceEnabled={true}
        mode="text"
        microphoneEnabled={false}
        isUserSpeaking={false}
        onCancelResponse={jest.fn().mockReturnValue(true)}
        onConnect={onConnect}
        onDisconnect={onDisconnect}
        onSetAutoAdviceEnabled={onSetAutoAdviceEnabled}
        onSetMode={jest.fn().mockReturnValue(true)}
        onSetMicrophoneEnabled={jest.fn().mockReturnValue(true)}
        onSendText={onSendText}
        status="connected"
      />,
    )

    fireEvent.change(
      view.getByLabelText("Ask Drafty about the draft"),
      { target: { value: "Will this tier reach my next pick?" } },
    )
    fireEvent.click(view.getByRole("button", { name: "Send" }))

    expect(onSendText).toHaveBeenCalledWith(
      "Will this tier reach my next pick?",
    )
    expect(view.getByLabelText("Responding")).toBeTruthy()
    expect(view.getByRole("status").textContent).toContain("Live")
    expect(view.getByRole("button", { name: "Stop response" }))
      .toBeTruthy()
    fireEvent.click(view.getByRole("checkbox"))
    expect(onSetAutoAdviceEnabled).toHaveBeenCalledWith(false)
    expect(view.getByText(
      "The first player has the stronger tier outlook.",
    )).toBeTruthy()
  })

  it("shows broker failures without exposing configuration controls", () => {
    const view = render(
      <RealtimeTextAdvisor
        error="OpenAI Realtime is not configured"
        isResponding={false}
        messages={[]}
        reconnectAttempt={0}
        autoAdviceEnabled={true}
        mode="text"
        microphoneEnabled={false}
        isUserSpeaking={false}
        onCancelResponse={jest.fn().mockReturnValue(false)}
        onConnect={jest.fn().mockResolvedValue(undefined)}
        onDisconnect={jest.fn()}
        onSetAutoAdviceEnabled={jest.fn()}
        onSetMode={jest.fn().mockReturnValue(true)}
        onSetMicrophoneEnabled={jest.fn().mockReturnValue(true)}
        onSendText={jest.fn().mockReturnValue(false)}
        status="disconnected"
      />,
    )

    expect(view.getByRole("alert").textContent).toContain(
      "OpenAI Realtime is not configured",
    )
    expect(view.queryByLabelText(/model/i)).toBeNull()
  })

  it("shows voice listening state and microphone controls", () => {
    const onSetMicrophoneEnabled = jest.fn().mockReturnValue(true)
    const view = render(
      <RealtimeTextAdvisor
        error={null}
        isResponding={false}
        isUserSpeaking={true}
        messages={[]}
        microphoneEnabled={true}
        mode="voice"
        reconnectAttempt={0}
        autoAdviceEnabled={true}
        onCancelResponse={jest.fn().mockReturnValue(false)}
        onConnect={jest.fn().mockResolvedValue(undefined)}
        onDisconnect={jest.fn()}
        onSetAutoAdviceEnabled={jest.fn()}
        onSetMicrophoneEnabled={onSetMicrophoneEnabled}
        onSetMode={jest.fn().mockReturnValue(false)}
        onSendText={jest.fn().mockReturnValue(true)}
        status="connected"
      />,
    )

    expect(view.getByText("Listening")).toBeTruthy()
    expect(view.getByRole("button", { name: "Voice" })
      .hasAttribute("disabled")).toBe(true)
    fireEvent.click(view.getByRole("button", {
      name: "Mute microphone",
    }))
    expect(onSetMicrophoneEnabled).toHaveBeenCalledWith(false)
    expect(view.getByPlaceholderText(
      "Type a fallback question; Drafty will answer aloud…",
    )).toBeTruthy()
  })
})
