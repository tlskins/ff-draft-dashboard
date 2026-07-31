import {
  OpenAIWebRTCTransport,
} from "../behavior/realtime/webrtcTransport"
import type {
  RealtimeTransportEvent,
} from "../behavior/realtime/transport"

interface TestMediaTrack {
  enabled: boolean
  stop(): void
}

interface TestMediaStream {
  getAudioTracks(): TestMediaTrack[]
  getTracks(): TestMediaTrack[]
}

class FakeDataChannel {
  readyState = "connecting"
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  sent: string[] = []
  closed = false

  send(data: string): void {
    this.sent.push(data)
  }

  close(): void {
    this.closed = true
    this.readyState = "closed"
  }

  open(): void {
    this.readyState = "open"
    this.onopen?.()
  }

  receive(event: unknown): void {
    this.onmessage?.({ data: JSON.stringify(event) })
  }
}

class FakePeerConnection {
  connectionState = "new"
  onconnectionstatechange: (() => void) | null = null
  ontrack: ((event: { streams: TestMediaStream[] }) => void) | null = null
  dataChannel = new FakeDataChannel()
  addedTracks: Array<{
    track: TestMediaTrack
    stream: TestMediaStream
  }> = []
  localDescription: unknown = null
  remoteDescription: unknown = null
  closed = false

  createDataChannel(label: string): FakeDataChannel {
    expect(label).toBe("oai-events")
    return this.dataChannel
  }

  addTrack(track: TestMediaTrack, stream: TestMediaStream): void {
    this.addedTracks.push({ track, stream })
  }

  async createOffer(): Promise<{ type: "offer"; sdp: string }> {
    return { type: "offer", sdp: "drafty-offer-sdp" }
  }

  async setLocalDescription(description: unknown): Promise<void> {
    this.localDescription = description
  }

  async setRemoteDescription(description: unknown): Promise<void> {
    this.remoteDescription = description
    this.connectionState = "connected"
    this.dataChannel.open()
  }

  close(): void {
    this.closed = true
    this.connectionState = "closed"
  }

  receiveTrack(stream: FakeMediaStream): void {
    this.ontrack?.({ streams: [stream] })
  }
}

class FakeMediaTrack {
  enabled = true
  stopped = false

  stop(): void {
    this.stopped = true
  }
}

class FakeMediaStream {
  constructor(readonly track = new FakeMediaTrack()) {}

  getAudioTracks(): FakeMediaTrack[] {
    return [this.track]
  }

  getTracks(): FakeMediaTrack[] {
    return [this.track]
  }
}

describe("OpenAI WebRTC transport", () => {
  it("connects with an ephemeral secret and exchanges text and tool events", async () => {
    const peer = new FakePeerConnection()
    const clientSecretLoader = jest.fn().mockResolvedValue({
      value: "ek_test",
      expires_at: 1785373200,
      draft_session_id: "espn-session",
      realtime_session_id: "sess_test",
      mode: "text",
      model: "gpt-realtime",
    })
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "openai-answer-sdp",
    })
    const events: RealtimeTransportEvent[] = []
    const transport = new OpenAIWebRTCTransport({
      draftSessionId: "espn-session",
      apiHost: "http://127.0.0.1:5000",
      clientSecretLoader,
      fetcher: fetcher as unknown as typeof fetch,
      peerConnectionFactory: () => peer,
    })
    transport.subscribe(event => events.push(event))

    await transport.connect()

    expect(clientSecretLoader).toHaveBeenCalledWith(
      "espn-session",
      "text",
      expect.objectContaining({
        apiHost: "http://127.0.0.1:5000",
      }),
    )
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.openai.com/v1/realtime/calls",
      expect.objectContaining({
        method: "POST",
        body: "drafty-offer-sdp",
        headers: {
          Authorization: "Bearer ek_test",
          "Content-Type": "application/sdp",
        },
      }),
    )
    expect(peer.remoteDescription).toEqual({
      type: "answer",
      sdp: "openai-answer-sdp",
    })
    expect(transport.status).toBe("connected")

    transport.sendUserText("Compare the top running backs")
    transport.sendToolOutput("call-1", {
      ok: true,
      players: [],
    })
    transport.cancelResponse()
    expect(peer.dataChannel.sent.map(serialized =>
      JSON.parse(serialized).type)).toEqual([
      "conversation.item.create",
      "response.create",
      "conversation.item.create",
      "response.create",
      "response.cancel",
    ])
    expect(JSON.parse(peer.dataChannel.sent[0])).toEqual({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{
          type: "input_text",
          text: "Compare the top running backs",
        }],
      },
    })
    expect(JSON.parse(peer.dataChannel.sent[2]).item).toEqual({
      type: "function_call_output",
      call_id: "call-1",
      output: JSON.stringify({ ok: true, players: [] }),
    })

    peer.dataChannel.receive({
      type: "response.created",
      response: {
        id: "response-1",
        status: "in_progress",
      },
    })
    peer.dataChannel.receive({
      type: "response.output_text.delta",
      response_id: "response-1",
      delta: "Take ",
    })
    peer.dataChannel.receive({
      type: "response.output_text.done",
      response_id: "response-1",
      text: "Take the running back.",
    })
    const toolEvent = {
      type: "response.output_item.done",
      item: {
        type: "function_call",
        call_id: "call-model-1",
        name: "get_recommendations",
        arguments: "{}",
      },
    }
    peer.dataChannel.receive(toolEvent)
    peer.dataChannel.receive(toolEvent)
    peer.dataChannel.receive({
      type: "response.done",
      response: {
        id: "response-1",
        status: "cancelled",
        output: [],
      },
    })

    expect(events).toEqual(expect.arrayContaining([
      {
        type: "assistant_text_delta",
        responseId: "response-1",
        text: "Take ",
      },
      {
        type: "assistant_text_done",
        responseId: "response-1",
        text: "Take the running back.",
      },
      {
        type: "tool_call",
        callId: "call-model-1",
        name: "get_recommendations",
        arguments: "{}",
      },
      {
        type: "response_started",
        responseId: "response-1",
      },
      {
        type: "response_finished",
        responseId: "response-1",
        status: "cancelled",
      },
    ]))
    expect(events.filter(event => event.type === "tool_call")).toHaveLength(1)

    transport.disconnect()
    expect(peer.closed).toBe(true)
    expect(peer.dataChannel.closed).toBe(true)
    expect(transport.status).toBe("disconnected")
  })

  it("fails closed and emits a sanitized connection error", async () => {
    const transport = new OpenAIWebRTCTransport({
      draftSessionId: "espn-session",
      clientSecretLoader: jest.fn().mockRejectedValue(
        new Error("OpenAI Realtime is not configured"),
      ),
      fetcher: jest.fn() as unknown as typeof fetch,
      peerConnectionFactory: () => new FakePeerConnection(),
    })
    const events: RealtimeTransportEvent[] = []
    transport.subscribe(event => events.push(event))

    await expect(transport.connect()).rejects.toThrow(
      "OpenAI Realtime is not configured",
    )
    expect(transport.status).toBe("disconnected")
    expect(events.at(-1)).toEqual({
      type: "error",
      message: "OpenAI Realtime is not configured",
    })
  })

  it("attaches voice media, streams transcripts, and releases devices", async () => {
    const peer = new FakePeerConnection()
    const localStream = new FakeMediaStream()
    const remoteStream = new FakeMediaStream()
    const audioElement = {
      autoplay: false,
      playsInline: false,
      srcObject: null as unknown,
      play: jest.fn().mockResolvedValue(undefined),
      pause: jest.fn(),
    }
    const clientSecretLoader = jest.fn().mockResolvedValue({
      value: "ek_voice",
      expires_at: 1785373200,
      draft_session_id: "espn-session",
      realtime_session_id: "sess_voice",
      mode: "voice",
      model: "gpt-realtime",
    })
    const events: RealtimeTransportEvent[] = []
    const transport = new OpenAIWebRTCTransport({
      draftSessionId: "espn-session",
      mode: "voice",
      clientSecretLoader,
      fetcher: jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => "voice-answer-sdp",
      }) as unknown as typeof fetch,
      peerConnectionFactory: () => peer,
      mediaStreamFactory: jest.fn().mockResolvedValue(localStream),
      audioElementFactory: () => audioElement,
    })
    transport.subscribe(event => events.push(event))

    await transport.connect()

    expect(clientSecretLoader).toHaveBeenCalledWith(
      "espn-session",
      "voice",
      expect.any(Object),
    )
    expect(peer.addedTracks).toEqual([{
      track: localStream.track,
      stream: localStream,
    }])
    expect(audioElement.autoplay).toBe(true)
    expect(audioElement.playsInline).toBe(true)

    peer.receiveTrack(remoteStream)
    expect(audioElement.srcObject).toBe(remoteStream)
    expect(audioElement.play).toHaveBeenCalledTimes(1)

    transport.sendUserText("Compare the current tier")
    expect(JSON.parse(peer.dataChannel.sent[1])).toEqual({
      type: "response.create",
      response: {
        output_modalities: ["audio"],
      },
    })

    transport.setMicrophoneEnabled(false)
    expect(localStream.track.enabled).toBe(false)
    transport.setMicrophoneEnabled(true)
    expect(localStream.track.enabled).toBe(true)

    peer.dataChannel.receive({
      type: "input_audio_buffer.speech_started",
    })
    peer.dataChannel.receive({
      type: "response.output_audio_transcript.delta",
      response_id: "response-voice",
      delta: "Take ",
    })
    peer.dataChannel.receive({
      type: "response.output_audio_transcript.done",
      response_id: "response-voice",
      transcript: "Take the receiver.",
    })
    peer.dataChannel.receive({
      type: "input_audio_buffer.speech_stopped",
    })

    expect(events).toEqual(expect.arrayContaining([
      { type: "user_speech_started" },
      {
        type: "assistant_text_delta",
        responseId: "response-voice",
        text: "Take ",
      },
      {
        type: "assistant_text_done",
        responseId: "response-voice",
        text: "Take the receiver.",
      },
      { type: "user_speech_stopped" },
    ]))

    transport.disconnect()
    expect(localStream.track.stopped).toBe(true)
    expect(audioElement.pause).toHaveBeenCalledTimes(1)
    expect(audioElement.srcObject).toBeNull()
  })

  it("cancels an in-flight connection without reopening resources", async () => {
    const deferred: {
      resolve?: (value: {
      value: string
      expires_at: number
      draft_session_id: string
      realtime_session_id: string
      mode: "text"
      model: string
      }) => void
    } = {}
    const clientSecretLoader = jest.fn().mockImplementation(() =>
      new Promise(resolve => {
        deferred.resolve = resolve
      }))
    const peerConnectionFactory = jest.fn(() =>
      new FakePeerConnection())
    const transport = new OpenAIWebRTCTransport({
      draftSessionId: "espn-session",
      clientSecretLoader,
      fetcher: jest.fn() as unknown as typeof fetch,
      peerConnectionFactory,
    })

    const connecting = transport.connect()
    transport.disconnect()
    deferred.resolve?.({
      value: "ek_test",
      expires_at: 1785373200,
      draft_session_id: "espn-session",
      realtime_session_id: "sess_test",
      mode: "text",
      model: "gpt-realtime",
    })
    await connecting

    expect(transport.status).toBe("disconnected")
    expect(peerConnectionFactory).not.toHaveBeenCalled()
  })
})
