import {
  createRealtimeClientSecret,
} from "../api/realtime"
import type { RealtimeMode } from "./contracts"
import type {
  RealtimeAdvisorTransport,
  RealtimeTransportEvent,
  RealtimeTransportStatus,
} from "./transport"

const OPENAI_REALTIME_CALLS_URL =
  "https://api.openai.com/v1/realtime/calls"

interface DataChannelLike {
  readyState: string
  onopen: (() => void) | null
  onclose: (() => void) | null
  onerror: (() => void) | null
  onmessage: ((event: { data: unknown }) => void) | null
  send(data: string): void
  close(): void
}

interface PeerConnectionLike {
  connectionState?: string
  onconnectionstatechange: (() => void) | null
  ontrack: ((event: { streams: MediaStreamLike[] }) => void) | null
  createDataChannel(label: string): DataChannelLike
  addTrack(track: MediaTrackLike, stream: MediaStreamLike): unknown
  createOffer(): Promise<{ type: "offer"; sdp?: string }>
  setLocalDescription(
    description: { type: "offer"; sdp?: string },
  ): Promise<void>
  setRemoteDescription(
    description: { type: "answer"; sdp: string },
  ): Promise<void>
  close(): void
}

interface MediaTrackLike {
  enabled: boolean
  stop(): void
}

interface MediaStreamLike {
  getAudioTracks(): MediaTrackLike[]
  getTracks(): MediaTrackLike[]
}

interface AudioElementLike {
  autoplay: boolean
  playsInline: boolean
  srcObject: unknown
  play(): Promise<void>
  pause(): void
}

interface OpenAIWebRTCTransportOptions {
  draftSessionId: string
  mode?: RealtimeMode
  apiHost?: string
  fetcher?: typeof fetch
  clientSecretLoader?: typeof createRealtimeClientSecret
  peerConnectionFactory?: () => PeerConnectionLike
  mediaStreamFactory?: () => Promise<MediaStreamLike>
  audioElementFactory?: () => AudioElementLike
  connectTimeoutMs?: number
}

interface RealtimeServerEvent {
  type?: unknown
  response_id?: unknown
  item_id?: unknown
  delta?: unknown
  text?: unknown
  transcript?: unknown
  call_id?: unknown
  name?: unknown
  arguments?: unknown
  item?: unknown
  response?: unknown
  error?: unknown
}

interface FunctionCallItem {
  type?: unknown
  call_id?: unknown
  name?: unknown
  arguments?: unknown
}

const safeErrorMessage = (error: unknown): string =>
  error instanceof Error && error.message
    ? error.message
    : "Realtime connection failed"

const parseFunctionCall = (
  value: unknown,
): {
  callId: string
  name: string
  arguments: string
} | null => {
  if (!value || typeof value !== "object") return null
  const item = value as FunctionCallItem
  if (
    item.type !== "function_call"
    || typeof item.call_id !== "string"
    || typeof item.name !== "string"
    || typeof item.arguments !== "string"
  ) {
    return null
  }
  return {
    callId: item.call_id,
    name: item.name,
    arguments: item.arguments,
  }
}

export class OpenAIWebRTCTransport
implements RealtimeAdvisorTransport {
  readonly mode: RealtimeMode
  status: RealtimeTransportStatus = "disconnected"

  private readonly draftSessionId: string
  private readonly apiHost?: string
  private readonly fetcher: typeof fetch
  private readonly clientSecretLoader: typeof createRealtimeClientSecret
  private readonly peerConnectionFactory: () => PeerConnectionLike
  private readonly mediaStreamFactory: () => Promise<MediaStreamLike>
  private readonly audioElementFactory: () => AudioElementLike
  private readonly connectTimeoutMs: number
  private readonly listeners = new Set<
    (event: RealtimeTransportEvent) => void
  >()
  private readonly completedToolCalls = new Set<string>()
  private peerConnection: PeerConnectionLike | null = null
  private dataChannel: DataChannelLike | null = null
  private localMediaStream: MediaStreamLike | null = null
  private localAudioTrack: MediaTrackLike | null = null
  private remoteAudioElement: AudioElementLike | null = null
  private dataChannelTimeout: ReturnType<typeof setTimeout> | null = null
  private rejectDataChannelOpen: ((error: Error) => void) | null = null
  private connectionGeneration = 0

  constructor({
    draftSessionId,
    mode = "text",
    apiHost,
    fetcher = fetch,
    clientSecretLoader = createRealtimeClientSecret,
    peerConnectionFactory = () =>
      new RTCPeerConnection() as unknown as PeerConnectionLike,
    mediaStreamFactory = async () =>
      navigator.mediaDevices.getUserMedia({
        audio: true,
      }) as unknown as MediaStreamLike,
    audioElementFactory = () =>
      document.createElement("audio") as unknown as AudioElementLike,
    connectTimeoutMs = 10_000,
  }: OpenAIWebRTCTransportOptions) {
    this.draftSessionId = draftSessionId
    this.mode = mode
    this.apiHost = apiHost
    this.fetcher = fetcher
    this.clientSecretLoader = clientSecretLoader
    this.peerConnectionFactory = peerConnectionFactory
    this.mediaStreamFactory = mediaStreamFactory
    this.audioElementFactory = audioElementFactory
    this.connectTimeoutMs = connectTimeoutMs
  }

  async connect(): Promise<void> {
    if (this.status !== "disconnected") {
      throw new Error(`Realtime transport is already ${this.status}`)
    }
    const generation = ++this.connectionGeneration
    this.setStatus("connecting")

    try {
      const secret = await this.clientSecretLoader(
        this.draftSessionId,
        this.mode,
        {
          apiHost: this.apiHost,
          fetcher: this.fetcher,
        },
      )
      if (generation !== this.connectionGeneration) return
      const peerConnection = this.peerConnectionFactory()
      const dataChannel = peerConnection.createDataChannel("oai-events")
      this.peerConnection = peerConnection
      this.dataChannel = dataChannel

      if (this.mode === "voice") {
        const stream = await this.mediaStreamFactory()
        if (generation !== this.connectionGeneration) {
          stream.getTracks().forEach(track => track.stop())
          return
        }
        const audioTrack = stream.getAudioTracks()[0]
        if (!audioTrack) {
          stream.getTracks().forEach(track => track.stop())
          throw new Error("No microphone audio track is available")
        }
        const audioElement = this.audioElementFactory()
        audioElement.autoplay = true
        audioElement.playsInline = true
        peerConnection.ontrack = event => {
          const [remoteStream] = event.streams
          if (!remoteStream) return
          audioElement.srcObject = remoteStream
          void audioElement.play().catch(() => {
            // Autoplay policies can reject play even after mic permission.
          })
        }
        this.localMediaStream = stream
        this.localAudioTrack = audioTrack
        this.remoteAudioElement = audioElement
        peerConnection.addTrack(audioTrack, stream)
      }

      const opened = new Promise<void>((resolve, reject) => {
        this.rejectDataChannelOpen = reject
        this.dataChannelTimeout = setTimeout(() => {
          this.rejectDataChannelOpen = null
          reject(new Error("Realtime data channel timed out"))
        }, this.connectTimeoutMs)
        dataChannel.onopen = () => {
          this.clearDataChannelTimeout()
          this.rejectDataChannelOpen = null
          resolve()
        }
        dataChannel.onerror = () => {
          this.clearDataChannelTimeout()
          this.rejectDataChannelOpen = null
          reject(new Error("Realtime data channel failed"))
        }
      })
      void opened.catch(() => {
        // connect() awaits the same promise after SDP negotiation. Attaching
        // this handler immediately prevents an early channel failure from
        // becoming an unhandled rejection while the SDP request is pending.
      })
      dataChannel.onmessage = event => this.handleMessage(event.data)
      dataChannel.onclose = () => this.handleDisconnected()
      peerConnection.onconnectionstatechange = () => {
        if (["closed", "disconnected", "failed"].includes(
          peerConnection.connectionState || "",
        )) {
          this.handleDisconnected()
        }
      }

      const offer = await peerConnection.createOffer()
      if (generation !== this.connectionGeneration) return
      await peerConnection.setLocalDescription(offer)
      if (!offer.sdp) {
        throw new Error("Realtime WebRTC offer did not contain SDP")
      }
      const response = await this.fetcher(OPENAI_REALTIME_CALLS_URL, {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${secret.value}`,
          "Content-Type": "application/sdp",
        },
      })
      if (generation !== this.connectionGeneration) return
      if (!response.ok) {
        throw new Error(
          `OpenAI Realtime connection returned ${response.status}`,
        )
      }
      const answerSdp = await response.text()
      if (generation !== this.connectionGeneration) return
      if (!answerSdp) {
        throw new Error("OpenAI Realtime returned an empty SDP answer")
      }
      await peerConnection.setRemoteDescription({
        type: "answer",
        sdp: answerSdp,
      })
      await opened
      if (generation !== this.connectionGeneration) return
      this.setStatus("connected")
    } catch (error) {
      if (generation !== this.connectionGeneration) return
      const message = safeErrorMessage(error)
      this.closeResources()
      this.setStatus("disconnected")
      this.emit({ type: "error", message })
      throw new Error(message)
    }
  }

  disconnect(): void {
    this.connectionGeneration += 1
    this.closeResources()
    this.setStatus("disconnected")
  }

  sendUserText(text: string): void {
    const value = text.trim()
    if (!value) {
      throw new Error("Realtime message cannot be empty")
    }
    this.sendEvent({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{
          type: "input_text",
          text: value,
        }],
      },
    })
    this.sendEvent({
      type: "response.create",
      response: {
        output_modalities: [this.mode === "voice" ? "audio" : "text"],
      },
    })
  }

  sendToolOutput(callId: string, output: unknown): void {
    this.sendEvent({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: callId,
        output: JSON.stringify(output),
      },
    })
    this.sendEvent({
      type: "response.create",
      response: {
        output_modalities: [this.mode === "voice" ? "audio" : "text"],
      },
    })
  }

  cancelResponse(): void {
    this.sendEvent({
      type: "response.cancel",
    })
  }

  setMicrophoneEnabled(enabled: boolean): void {
    if (
      this.status !== "connected"
      || this.mode !== "voice"
      || !this.localAudioTrack
    ) {
      throw new Error("Realtime microphone is not available")
    }
    this.localAudioTrack.enabled = enabled
  }

  subscribe(
    listener: (event: RealtimeTransportEvent) => void,
  ): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private sendEvent(event: Record<string, unknown>): void {
    if (
      this.status !== "connected"
      || !this.dataChannel
      || this.dataChannel.readyState !== "open"
    ) {
      throw new Error("Realtime transport is not connected")
    }
    this.dataChannel.send(JSON.stringify(event))
  }

  private handleMessage(data: unknown): void {
    if (typeof data !== "string") return
    let event: RealtimeServerEvent
    try {
      event = JSON.parse(data) as RealtimeServerEvent
    } catch {
      return
    }
    if (typeof event.type !== "string") return

    if (event.type === "response.created") {
      const response = event.response
      if (
        response
        && typeof response === "object"
        && typeof (response as { id?: unknown }).id === "string"
      ) {
        this.emit({
          type: "response_started",
          responseId: (response as { id: string }).id,
        })
      }
      return
    }
    if (
      (
        event.type === "response.output_text.delta"
        || event.type === "response.output_audio_transcript.delta"
      )
      && typeof event.delta === "string"
    ) {
      this.emit({
        type: "assistant_text_delta",
        responseId: this.responseId(event),
        text: event.delta,
      })
      return
    }
    if (
      (
        event.type === "response.output_text.done"
        || event.type === "response.output_audio_transcript.done"
      )
    ) {
      const text = typeof event.text === "string"
        ? event.text
        : typeof event.transcript === "string"
          ? event.transcript
          : null
      if (text === null) return
      this.emit({
        type: "assistant_text_done",
        responseId: this.responseId(event),
        text,
      })
      return
    }
    if (event.type === "input_audio_buffer.speech_started") {
      this.emit({ type: "user_speech_started" })
      return
    }
    if (event.type === "input_audio_buffer.speech_stopped") {
      this.emit({ type: "user_speech_stopped" })
      return
    }
    if (event.type === "response.function_call_arguments.done") {
      this.emitFunctionCall({
        type: "function_call",
        call_id: event.call_id,
        name: event.name,
        arguments: event.arguments,
      })
      return
    }
    if (event.type === "response.output_item.done") {
      this.emitFunctionCall(event.item)
      return
    }
    if (event.type === "response.done") {
      const response = event.response
      if (response && typeof response === "object") {
        const typedResponse = response as {
          id?: unknown
          status?: unknown
          output?: unknown
        }
        const output = typedResponse.output
        if (Array.isArray(output)) {
          output.forEach(item => this.emitFunctionCall(item))
        }
        this.emit({
          type: "response_finished",
          responseId: typeof typedResponse.id === "string"
            ? typedResponse.id
            : "current-response",
          status: typeof typedResponse.status === "string"
            ? typedResponse.status
            : "completed",
        })
      }
      return
    }
    if (event.type === "error") {
      const error = event.error
      const message = error && typeof error === "object"
        && typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
        : "OpenAI Realtime reported an error"
      this.emit({ type: "error", message })
    }
  }

  private responseId(event: RealtimeServerEvent): string {
    if (typeof event.response_id === "string") return event.response_id
    if (typeof event.item_id === "string") return event.item_id
    return "current-response"
  }

  private emitFunctionCall(value: unknown): void {
    const call = parseFunctionCall(value)
    if (!call || this.completedToolCalls.has(call.callId)) return
    this.completedToolCalls.add(call.callId)
    this.emit({
      type: "tool_call",
      ...call,
    })
  }

  private handleDisconnected(): void {
    this.connectionGeneration += 1
    this.closeResources()
    this.setStatus("disconnected")
  }

  private closeResources(): void {
    this.cancelDataChannelWait()
    const dataChannel = this.dataChannel
    const peerConnection = this.peerConnection
    const localMediaStream = this.localMediaStream
    const remoteAudioElement = this.remoteAudioElement
    this.dataChannel = null
    this.peerConnection = null
    this.localMediaStream = null
    this.localAudioTrack = null
    this.remoteAudioElement = null
    this.completedToolCalls.clear()
    if (dataChannel) {
      dataChannel.onclose = null
      dataChannel.onerror = null
      dataChannel.onmessage = null
      dataChannel.onopen = null
      dataChannel.close()
    }
    if (peerConnection) {
      peerConnection.onconnectionstatechange = null
      peerConnection.ontrack = null
      peerConnection.close()
    }
    localMediaStream?.getTracks().forEach(track => track.stop())
    if (remoteAudioElement) {
      remoteAudioElement.pause()
      remoteAudioElement.srcObject = null
    }
  }

  private clearDataChannelTimeout(): void {
    if (this.dataChannelTimeout) {
      clearTimeout(this.dataChannelTimeout)
      this.dataChannelTimeout = null
    }
  }

  private cancelDataChannelWait(): void {
    const reject = this.rejectDataChannelOpen
    this.rejectDataChannelOpen = null
    this.clearDataChannelTimeout()
    reject?.(new Error("Realtime connection was cancelled"))
  }

  private setStatus(status: RealtimeTransportStatus): void {
    if (this.status === status) return
    this.status = status
    this.emit({ type: "status", status })
  }

  private emit(event: RealtimeTransportEvent): void {
    this.listeners.forEach(listener => listener(event))
  }
}
