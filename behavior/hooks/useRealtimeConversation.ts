import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"

import type {
  AdvisorProposal,
  RealtimeMode,
} from "../realtime/contracts"
import {
  createDraftAdviceSnapshot,
  decideDraftEventAdvice,
  DraftAdviceSnapshot,
} from "../realtime/eventAdvice"
import {
  executeRealtimeToolCall,
  RealtimeToolContext,
} from "../realtime/toolDispatcher"
import type {
  RealtimeAdvisorTransport,
  RealtimeTransportEvent,
  RealtimeTransportStatus,
} from "../realtime/transport"
import {
  OpenAIWebRTCTransport,
} from "../realtime/webrtcTransport"
import {
  getRealtimeAdviceBoundaryState,
} from "../boundaryState"

export interface RealtimeChatMessage {
  id: string
  role: "user" | "assistant" | "event"
  text: string
  streaming: boolean
  interrupted?: boolean
}

interface UseRealtimeConversationProps {
  draftSessionId: string | null
  toolContext: RealtimeToolContext | null
  onProposal: (proposal: AdvisorProposal) => void
  transportFactory?: (
    draftSessionId: string,
    mode: RealtimeMode,
  ) => RealtimeAdvisorTransport
  reconnectDelaysMs?: number[]
}

const defaultTransportFactory = (
  draftSessionId: string,
  mode: RealtimeMode,
): RealtimeAdvisorTransport => new OpenAIWebRTCTransport({
  draftSessionId,
  mode,
})

const DEFAULT_RECONNECT_DELAYS_MS = [500, 1_500, 4_000]

let localMessageSequence = 0

const nextMessageId = (
  role: RealtimeChatMessage["role"],
): string => {
  localMessageSequence += 1
  return `${role}-local-${localMessageSequence}`
}

export const useRealtimeConversation = ({
  draftSessionId,
  toolContext,
  onProposal,
  transportFactory = defaultTransportFactory,
  reconnectDelaysMs = DEFAULT_RECONNECT_DELAYS_MS,
}: UseRealtimeConversationProps) => {
  const [status, setStatus] =
    useState<RealtimeTransportStatus>("disconnected")
  const [messages, setMessages] = useState<RealtimeChatMessage[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isResponding, setIsResponding] = useState(false)
  const [reconnectAttempt, setReconnectAttempt] = useState(0)
  const [autoAdviceEnabled, setAutoAdviceEnabled] = useState(true)
  const [mode, setModeState] = useState<RealtimeMode>("text")
  const [microphoneEnabled, setMicrophoneEnabledState] = useState(false)
  const [isUserSpeaking, setIsUserSpeaking] = useState(false)

  const transportRef = useRef<RealtimeAdvisorTransport | null>(null)
  const unsubscribeRef = useRef<(() => void) | null>(null)
  const reconnectTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(null)
  const startConnectionRef = useRef<
    ((reconnecting: boolean) => Promise<void>) | null
  >(null)
  const contextRef = useRef(toolContext)
  const proposalRef = useRef(onProposal)
  const draftSessionIdRef = useRef(draftSessionId)
  const modeRef = useRef(mode)
  const microphonePreferenceRef = useRef(true)
  const reconnectDelaysRef = useRef(reconnectDelaysMs)
  const wantsConnectionRef = useRef(false)
  const hasConnectedRef = useRef(false)
  const reconnectingRef = useRef(false)
  const reconnectAttemptRef = useRef(0)
  const connectionGenerationRef = useRef(0)
  const activeResponseIdRef = useRef<string | null>(null)
  const adviceSnapshotRef = useRef<DraftAdviceSnapshot | null>(null)
  const lastAdviceEventRef = useRef<number | null>(null)

  contextRef.current = toolContext
  proposalRef.current = onProposal
  draftSessionIdRef.current = draftSessionId
  modeRef.current = mode
  reconnectDelaysRef.current = reconnectDelaysMs

  const setResponding = useCallback((
    value: boolean,
    responseId: string | null = null,
  ) => {
    activeResponseIdRef.current = value ? responseId : null
    setIsResponding(value)
  }, [])

  const finishStreamingMessages = useCallback((
    interrupted: boolean,
  ) => {
    setMessages(current => current.map(message =>
      message.streaming
        ? {
            ...message,
            streaming: false,
            interrupted,
          }
        : message))
  }, [])

  const appendAssistantDelta = useCallback((
    responseId: string,
    text: string,
  ) => {
    activeResponseIdRef.current = responseId
    setIsResponding(true)
    const id = `assistant:${responseId}`
    setMessages(current => {
      const existing = current.find(message => message.id === id)
      if (!existing) {
        return [...current, {
          id,
          role: "assistant",
          text,
          streaming: true,
        }]
      }
      return current.map(message => message.id === id
        ? {
            ...message,
            text: `${message.text}${text}`,
            streaming: true,
            interrupted: false,
          }
        : message)
    })
  }, [])

  const finishAssistantMessage = useCallback((
    responseId: string,
    text: string,
  ) => {
    const id = `assistant:${responseId}`
    setMessages(current => {
      const existing = current.find(message => message.id === id)
      if (!existing) {
        return [...current, {
          id,
          role: "assistant",
          text,
          streaming: false,
        }]
      }
      return current.map(message => message.id === id
        ? {
            ...message,
            text: text || message.text,
            streaming: false,
            interrupted: false,
          }
        : message)
    })
  }, [])

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
  }, [])

  const releaseTransport = useCallback(() => {
    unsubscribeRef.current?.()
    unsubscribeRef.current = null
    transportRef.current?.disconnect()
    transportRef.current = null
  }, [])

  const scheduleReconnect = useCallback(() => {
    if (
      !wantsConnectionRef.current
      || !hasConnectedRef.current
      || reconnectTimerRef.current
    ) {
      return
    }
    const delays = reconnectDelaysRef.current
    const attempt = reconnectAttemptRef.current + 1
    if (attempt > delays.length) {
      wantsConnectionRef.current = false
      reconnectingRef.current = false
      setStatus("disconnected")
      setReconnectAttempt(0)
      setError(
        `Realtime disconnected after ${delays.length} reconnect attempts`,
      )
      return
    }
    reconnectAttemptRef.current = attempt
    reconnectingRef.current = true
    setReconnectAttempt(attempt)
    setStatus("reconnecting")
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null
      if (wantsConnectionRef.current) {
        void startConnectionRef.current?.(true)
      }
    }, delays[attempt - 1])
  }, [])

  const handleTransportEvent = useCallback((
    event: RealtimeTransportEvent,
    transport: RealtimeAdvisorTransport,
  ) => {
    if (event.type === "status") {
      if (event.status === "connected") {
        const wasReconnecting = reconnectingRef.current
        hasConnectedRef.current = true
        reconnectingRef.current = false
        reconnectAttemptRef.current = 0
        setReconnectAttempt(0)
        setStatus("connected")
        setError(null)
        if (transport.mode === "voice") {
          try {
            transport.setMicrophoneEnabled(
              microphonePreferenceRef.current,
            )
            setMicrophoneEnabledState(
              microphonePreferenceRef.current,
            )
          } catch (microphoneError) {
            setMicrophoneEnabledState(false)
            setError(microphoneError instanceof Error
              ? microphoneError.message
              : "Realtime microphone could not be configured")
          }
        } else {
          setMicrophoneEnabledState(false)
        }
        if (wasReconnecting) {
          setMessages(current => [...current, {
            id: nextMessageId("event"),
            role: "event",
            text: (
              "Realtime connection restored. Draft state was preserved; "
              + "the model conversation restarted."
            ),
            streaming: false,
          }])
        }
        return
      }
      if (event.status === "connecting") {
        setStatus(reconnectingRef.current
          ? "reconnecting"
          : "connecting")
        return
      }
      setResponding(false)
      setMicrophoneEnabledState(false)
      setIsUserSpeaking(false)
      finishStreamingMessages(true)
      setStatus("disconnected")
      scheduleReconnect()
      return
    }
    if (event.type === "response_started") {
      setResponding(true, event.responseId)
      return
    }
    if (event.type === "response_finished") {
      if (
        !activeResponseIdRef.current
        || activeResponseIdRef.current === event.responseId
        || event.responseId === "current-response"
      ) {
        setResponding(false)
        if (event.status !== "completed") {
          finishStreamingMessages(true)
        }
      }
      return
    }
    if (event.type === "assistant_text_delta") {
      appendAssistantDelta(event.responseId, event.text)
      return
    }
    if (event.type === "assistant_text_done") {
      finishAssistantMessage(event.responseId, event.text)
      return
    }
    if (event.type === "user_speech_started") {
      setIsUserSpeaking(true)
      if (activeResponseIdRef.current) {
        setResponding(false)
        finishStreamingMessages(true)
      }
      return
    }
    if (event.type === "user_speech_stopped") {
      setIsUserSpeaking(false)
      return
    }
    if (event.type === "error") {
      setError(event.message)
      return
    }
    const context = contextRef.current
    if (!context) {
      try {
        transport.sendToolOutput(event.callId, {
          ok: false,
          error: "Draft context is unavailable",
        })
      } catch {
        setError("Realtime tool result could not be returned")
      }
      return
    }
    void executeRealtimeToolCall(event, context)
      .then(result => {
        if (result.proposal) {
          proposalRef.current(result.proposal)
        }
        transport.sendToolOutput(event.callId, result.output)
      })
      .catch(() => {
        setError("Realtime tool execution failed")
        try {
          transport.sendToolOutput(event.callId, {
            ok: false,
            error: "Realtime tool execution failed",
          })
        } catch {
          // The disconnected state already communicates the failure.
        }
      })
  }, [
    appendAssistantDelta,
    finishAssistantMessage,
    finishStreamingMessages,
    scheduleReconnect,
    setResponding,
  ])

  const startConnection = useCallback(async (
    reconnecting: boolean,
  ) => {
    const sessionId = draftSessionIdRef.current
    if (!sessionId || !wantsConnectionRef.current) return
    const generation = ++connectionGenerationRef.current
    releaseTransport()
    reconnectingRef.current = reconnecting
    setStatus(reconnecting ? "reconnecting" : "connecting")
    const transport = transportFactory(sessionId, modeRef.current)
    transportRef.current = transport
    unsubscribeRef.current = transport.subscribe(event =>
      handleTransportEvent(event, transport))
    try {
      await transport.connect()
    } catch (connectError) {
      if (generation !== connectionGenerationRef.current) return
      setError(connectError instanceof Error
        ? connectError.message
        : "Realtime connection failed")
      if (!hasConnectedRef.current) {
        wantsConnectionRef.current = false
        releaseTransport()
        setStatus("disconnected")
      } else {
        scheduleReconnect()
      }
    }
  }, [
    handleTransportEvent,
    releaseTransport,
    scheduleReconnect,
    transportFactory,
  ])
  startConnectionRef.current = startConnection

  const disconnect = useCallback(() => {
    wantsConnectionRef.current = false
    hasConnectedRef.current = false
    reconnectingRef.current = false
    reconnectAttemptRef.current = 0
    connectionGenerationRef.current += 1
    clearReconnectTimer()
    releaseTransport()
    setResponding(false)
    setMicrophoneEnabledState(false)
    setIsUserSpeaking(false)
    finishStreamingMessages(true)
    setReconnectAttempt(0)
    setStatus("disconnected")
  }, [
    clearReconnectTimer,
    finishStreamingMessages,
    releaseTransport,
    setResponding,
  ])

  const connect = useCallback(async () => {
    if (!draftSessionIdRef.current) {
      setError("Start or connect a draft before using Realtime")
      return
    }
    clearReconnectTimer()
    reconnectAttemptRef.current = 0
    hasConnectedRef.current = false
    wantsConnectionRef.current = true
    setReconnectAttempt(0)
    setError(null)
    await startConnection(false)
  }, [clearReconnectTimer, startConnection])

  const cancelResponse = useCallback(() => {
    const transport = transportRef.current
    if (
      !transport
      || transport.status !== "connected"
      || !activeResponseIdRef.current
    ) {
      return false
    }
    try {
      transport.cancelResponse()
      setResponding(false)
      finishStreamingMessages(true)
      return true
    } catch (cancelError) {
      setError(cancelError instanceof Error
        ? cancelError.message
        : "Realtime response cancellation failed")
      return false
    }
  }, [finishStreamingMessages, setResponding])

  const setMode = useCallback((nextMode: RealtimeMode) => {
    if (status !== "disconnected") {
      setError("Disconnect Realtime before changing input mode")
      return false
    }
    modeRef.current = nextMode
    microphonePreferenceRef.current = true
    setModeState(nextMode)
    setMicrophoneEnabledState(false)
    setIsUserSpeaking(false)
    setError(null)
    return true
  }, [status])

  const setMicrophoneEnabled = useCallback((enabled: boolean) => {
    const transport = transportRef.current
    if (
      !transport
      || transport.status !== "connected"
      || transport.mode !== "voice"
    ) {
      setError("Connect a voice session before changing the microphone")
      return false
    }
    try {
      transport.setMicrophoneEnabled(enabled)
      microphonePreferenceRef.current = enabled
      setMicrophoneEnabledState(enabled)
      if (!enabled) setIsUserSpeaking(false)
      setError(null)
      return true
    } catch (microphoneError) {
      setError(microphoneError instanceof Error
        ? microphoneError.message
        : "Realtime microphone could not be configured")
      return false
    }
  }, [])

  const sendPrompt = useCallback((
    prompt: string,
    role: "user" | "event",
    displayText = prompt,
  ) => {
    const value = prompt.trim()
    if (!value) return false
    const transport = transportRef.current
    if (!transport || transport.status !== "connected") {
      if (role === "user") {
        setError("Connect the Realtime advisor before sending a message")
      }
      return false
    }
    try {
      if (activeResponseIdRef.current) {
        transport.cancelResponse()
        setResponding(false)
        finishStreamingMessages(true)
      }
      transport.sendUserText(value)
      setMessages(current => [...current, {
        id: nextMessageId(role),
        role,
        text: displayText,
        streaming: false,
      }])
      setError(null)
      return true
    } catch (sendError) {
      setError(sendError instanceof Error
        ? sendError.message
        : "Realtime message failed")
      return false
    }
  }, [finishStreamingMessages, setResponding])

  const sendText = useCallback((text: string) =>
    sendPrompt(text, "user"), [sendPrompt])

  useEffect(() => {
    const current = toolContext
      ? createDraftAdviceSnapshot(toolContext)
      : null
    const previous = adviceSnapshotRef.current
    adviceSnapshotRef.current = current
    if (
      !current
      || !previous
      || !autoAdviceEnabled
      || status !== "connected"
      || isUserSpeaking
    ) {
      return
    }
    const decision = decideDraftEventAdvice({
      previous,
      current,
      lastPromptEventCount: lastAdviceEventRef.current,
    })
    if (!decision) return
    if (sendPrompt(decision.prompt, "event", decision.reason)) {
      lastAdviceEventRef.current = decision.sourceEventCount
    }
  }, [
    autoAdviceEnabled,
    isUserSpeaking,
    sendPrompt,
    status,
    toolContext,
  ])

  useEffect(() => {
    adviceSnapshotRef.current = null
    lastAdviceEventRef.current = null
    setMessages([])
    setError(null)
    setAutoAdviceEnabled(true)
    return disconnect
  }, [disconnect, draftSessionId])

  return {
    status,
    adviceBoundaryState: getRealtimeAdviceBoundaryState(status),
    messages,
    error,
    isResponding,
    reconnectAttempt,
    autoAdviceEnabled,
    setAutoAdviceEnabled,
    mode,
    setMode,
    microphoneEnabled,
    setMicrophoneEnabled,
    isUserSpeaking,
    connect,
    disconnect,
    cancelResponse,
    sendText,
  }
}
