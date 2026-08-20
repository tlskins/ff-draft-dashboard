import {
  act,
  renderHook,
  waitFor,
} from "@testing-library/react"

import {
  useRealtimeConversation,
} from "../behavior/hooks/useRealtimeConversation"
import {
  createRealtimeAdvisorState,
} from "../behavior/realtime/proposals"
import type {
  RealtimeToolContext,
} from "../behavior/realtime/toolDispatcher"
import {
  InMemoryRealtimeTransport,
} from "../behavior/realtime/transport"

class FailingRealtimeTransport extends InMemoryRealtimeTransport {
  async connect(): Promise<void> {
    throw new Error("Temporary Realtime connection failure")
  }
}

const toolContext = {
  draftSessionId: "espn-session",
  sourceEventCount: 12,
  advisorContext: {
    schemaVersion: 1,
    league: { numTeams: 12, ppr: true },
    currentPick: 13,
    upcomingSlots: [],
    teams: [],
    availablePlayers: [],
    recentPicks: [],
  },
  recommendations: {
    schemaVersion: 1,
    currentPick: 13,
    nextUserPick: 18,
    preferredView: "tier_landscape",
    viewExplanation: "A tier cliff is approaching.",
    candidates: [],
  },
  plan: createRealtimeAdvisorState(
    "espn-session",
    12,
    "2026-07-30T21:00:00Z",
  ).plan,
} satisfies RealtimeToolContext

describe("useRealtimeConversation", () => {
  it("does not create a transport when the deployment disables Realtime", async () => {
    const transportFactory = jest.fn(() => new InMemoryRealtimeTransport())
    const { result } = renderHook(() => useRealtimeConversation({
      draftSessionId: "espn-session",
      toolContext,
      onProposal: jest.fn(),
      enabled: false,
      transportFactory,
    }))

    await act(async () => {
      await result.current.connect()
    })

    expect(transportFactory).not.toHaveBeenCalled()
    expect(result.current.status).toBe("disconnected")
    expect(result.current.error).toBe(
      "Realtime advisor is disabled for this deployment",
    )
  })

  it("streams text and dispatches model tool calls through the app", async () => {
    const transport = new InMemoryRealtimeTransport()
    const onProposal = jest.fn()
    const { result } = renderHook(() => useRealtimeConversation({
      draftSessionId: "espn-session",
      toolContext,
      onProposal,
      transportFactory: () => transport,
    }))

    await act(async () => {
      await result.current.connect()
    })
    expect(result.current.status).toBe("connected")

    act(() => {
      expect(result.current.sendText("What should I focus on?")).toBe(true)
      transport.emit({
        type: "assistant_text_delta",
        responseId: "response-1",
        text: "Watch the ",
      })
      transport.emit({
        type: "assistant_text_delta",
        responseId: "response-1",
        text: "running back tier.",
      })
      transport.emit({
        type: "assistant_text_done",
        responseId: "response-1",
        text: "Watch the running back tier.",
      })
    })

    expect(transport.sentTexts).toEqual(["What should I focus on?"])
    expect(result.current.messages).toEqual([
      expect.objectContaining({
        role: "user",
        text: "What should I focus on?",
      }),
      {
        id: "assistant:response-1",
        role: "assistant",
        text: "Watch the running back tier.",
        streaming: false,
        interrupted: false,
      },
    ])

    act(() => {
      transport.emit({
        type: "tool_call",
        callId: "call-plan",
        name: "propose_draft_plan",
        arguments: JSON.stringify({
          text: "Prioritize the current running back tier.",
          explanation: "The tier is unlikely to reach the next pick.",
        }),
      })
    })

    await waitFor(() => {
      expect(onProposal).toHaveBeenCalledWith(expect.objectContaining({
        kind: "draft_plan",
        status: "pending",
      }))
      expect(transport.sentToolOutputs).toHaveLength(1)
    })
    expect(transport.sentToolOutputs[0]).toEqual({
      callId: "call-plan",
      output: expect.objectContaining({
        ok: true,
        status: "confirmation_required",
      }),
    })
  })

  it("does not send text while disconnected", () => {
    const transport = new InMemoryRealtimeTransport()
    const { result } = renderHook(() => useRealtimeConversation({
      draftSessionId: "espn-session",
      toolContext,
      onProposal: jest.fn(),
      transportFactory: () => transport,
    }))

    act(() => {
      expect(result.current.sendText("Should I draft a quarterback?"))
        .toBe(false)
    })
    expect(result.current.error).toBe(
      "Connect the Realtime advisor before sending a message",
    )
    expect(transport.sentTexts).toEqual([])
  })

  it("selects voice mode and reflects microphone and VAD state", async () => {
    const transport = new InMemoryRealtimeTransport("voice")
    const transportFactory = jest.fn(() => transport)
    const { result } = renderHook(() => useRealtimeConversation({
      draftSessionId: "espn-session",
      toolContext,
      onProposal: jest.fn(),
      transportFactory,
    }))

    act(() => {
      expect(result.current.setMode("voice")).toBe(true)
    })
    expect(result.current.mode).toBe("voice")

    await act(async () => {
      await result.current.connect()
    })
    expect(transportFactory).toHaveBeenCalledWith(
      "espn-session",
      "voice",
    )
    expect(result.current.microphoneEnabled).toBe(true)

    act(() => {
      transport.emit({
        type: "response_started",
        responseId: "response-voice",
      })
      transport.emit({
        type: "assistant_text_delta",
        responseId: "response-voice",
        text: "Take the ",
      })
      transport.emit({ type: "user_speech_started" })
    })

    expect(result.current.isUserSpeaking).toBe(true)
    expect(result.current.isResponding).toBe(false)
    expect(result.current.messages[0]).toMatchObject({
      role: "assistant",
      streaming: false,
      interrupted: true,
    })
    expect(transport.cancelledResponseCount).toBe(0)

    act(() => {
      expect(result.current.setMicrophoneEnabled(false)).toBe(true)
    })
    expect(transport.microphoneEnabled).toBe(false)
    expect(result.current.microphoneEnabled).toBe(false)
    expect(result.current.isUserSpeaking).toBe(false)

    act(() => {
      expect(result.current.setMode("text")).toBe(false)
    })
    expect(result.current.error).toBe(
      "Disconnect Realtime before changing input mode",
    )
  })

  it("cancels an in-progress response before sending newer input", async () => {
    const transport = new InMemoryRealtimeTransport()
    const { result } = renderHook(() => useRealtimeConversation({
      draftSessionId: "espn-session",
      toolContext,
      onProposal: jest.fn(),
      transportFactory: () => transport,
    }))
    await act(async () => {
      await result.current.connect()
    })
    act(() => {
      transport.emit({
        type: "response_started",
        responseId: "response-old",
      })
      transport.emit({
        type: "assistant_text_delta",
        responseId: "response-old",
        text: "The old recommendation",
      })
    })
    expect(result.current.isResponding).toBe(true)

    act(() => {
      result.current.sendText("Use the newest draft state.")
    })

    expect(transport.cancelledResponseCount).toBe(1)
    expect(result.current.isResponding).toBe(false)
    expect(result.current.messages[0]).toMatchObject({
      role: "assistant",
      streaming: false,
      interrupted: true,
    })
    expect(transport.sentTexts).toEqual(["Use the newest draft state."])
  })

  it("reconnects a previously healthy session with bounded backoff", async () => {
    jest.useFakeTimers()
    try {
      const transports = [
        new InMemoryRealtimeTransport(),
        new InMemoryRealtimeTransport(),
      ]
      const transportFactory = jest.fn(() => transports.shift()!)
      const { result } = renderHook(() => useRealtimeConversation({
        draftSessionId: "espn-session",
        toolContext,
        onProposal: jest.fn(),
        transportFactory,
        reconnectDelaysMs: [500, 1_500, 4_000],
      }))
      await act(async () => {
        await result.current.connect()
      })
      const first = transportFactory.mock.results[0].value

      act(() => {
        first.disconnect()
      })
      expect(result.current.status).toBe("reconnecting")
      expect(result.current.reconnectAttempt).toBe(1)

      await act(async () => {
        jest.advanceTimersByTime(500)
        await Promise.resolve()
      })

      expect(transportFactory).toHaveBeenCalledTimes(2)
      expect(result.current.status).toBe("connected")
      expect(result.current.adviceBoundaryState).toBe("realtime")
      expect(result.current.reconnectAttempt).toBe(0)
      expect(result.current.messages).toContainEqual(
        expect.objectContaining({
          role: "event",
          text: expect.stringContaining("model conversation restarted"),
        }),
      )

      act(() => {
        result.current.disconnect()
      })
      jest.advanceTimersByTime(10_000)
      expect(transportFactory).toHaveBeenCalledTimes(2)
    } finally {
      jest.useRealTimers()
    }
  })

  it("stops after three failed reconnect attempts", async () => {
    jest.useFakeTimers()
    try {
      const initial = new InMemoryRealtimeTransport()
      const transports = [
        initial,
        new FailingRealtimeTransport(),
        new FailingRealtimeTransport(),
        new FailingRealtimeTransport(),
      ]
      const transportFactory = jest.fn(() => transports.shift()!)
      const { result } = renderHook(() => useRealtimeConversation({
        draftSessionId: "espn-session",
        toolContext,
        onProposal: jest.fn(),
        transportFactory,
        reconnectDelaysMs: [500, 1_500, 4_000],
      }))
      await act(async () => {
        await result.current.connect()
      })
      act(() => {
        initial.disconnect()
      })

      for (const delay of [500, 1_500, 4_000]) {
        await act(async () => {
          jest.advanceTimersByTime(delay)
          await Promise.resolve()
        })
      }

      expect(transportFactory).toHaveBeenCalledTimes(4)
      expect(result.current.status).toBe("disconnected")
      expect(result.current.reconnectAttempt).toBe(0)
      expect(result.current.error).toBe(
        "Realtime disconnected after 3 reconnect attempts",
      )
      expect(result.current.adviceBoundaryState).toBe(
        "deterministic-fallback",
      )
      jest.advanceTimersByTime(30_000)
      expect(transportFactory).toHaveBeenCalledTimes(4)
    } finally {
      jest.useRealTimers()
    }
  })

  it("requests concise advice only for a material new draft event", async () => {
    const transport = new InMemoryRealtimeTransport()
    const onProposal = jest.fn()
    const { result, rerender } = renderHook(
      ({ context }) => useRealtimeConversation({
        draftSessionId: "espn-session",
        toolContext: context,
        onProposal,
        transportFactory: () => transport,
      }),
      {
        initialProps: {
          context: toolContext,
        },
      },
    )
    await act(async () => {
      await result.current.connect()
    })

    rerender({
      context: {
        ...toolContext,
        sourceEventCount: 13,
        recommendations: {
          ...toolContext.recommendations,
          currentPick: 15,
          nextUserPick: 18,
        },
      },
    })

    await waitFor(() => {
      expect(transport.sentTexts).toHaveLength(1)
    })
    expect(transport.sentTexts[0]).toContain(
      "Use get_draft_state and get_recommendations",
    )
    expect(result.current.messages).toContainEqual(
      expect.objectContaining({
        role: "event",
        text: "The user's pick is 3 picks away.",
      }),
    )
  })
})
