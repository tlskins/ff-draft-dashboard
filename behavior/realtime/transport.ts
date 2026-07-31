import type { RealtimeMode } from "./contracts"

export type RealtimeTransportStatus =
  | "disconnected"
  | "connecting"
  | "reconnecting"
  | "connected"

export type RealtimeTransportEvent =
  | {
      type: "status"
      status: RealtimeTransportStatus
    }
  | {
      type: "tool_call"
      callId: string
      name: string
      arguments: string
    }
  | {
      type: "assistant_text_delta"
      responseId: string
      text: string
    }
  | {
      type: "assistant_text_done"
      responseId: string
      text: string
    }
  | {
      type: "response_started"
      responseId: string
    }
  | {
      type: "response_finished"
      responseId: string
      status: string
    }
  | {
      type: "user_speech_started"
    }
  | {
      type: "user_speech_stopped"
    }
  | {
      type: "error"
      message: string
    }

export interface RealtimeAdvisorTransport {
  readonly mode: RealtimeMode
  readonly status: RealtimeTransportStatus
  connect(): Promise<void>
  disconnect(): void
  sendUserText(text: string): void
  sendToolOutput(callId: string, output: unknown): void
  cancelResponse(): void
  setMicrophoneEnabled(enabled: boolean): void
  subscribe(listener: (event: RealtimeTransportEvent) => void): () => void
}

export class InMemoryRealtimeTransport
implements RealtimeAdvisorTransport {
  readonly mode: RealtimeMode
  status: RealtimeTransportStatus = "disconnected"
  microphoneEnabled = false
  readonly sentTexts: string[] = []
  readonly sentToolOutputs: Array<{
    callId: string
    output: unknown
  }> = []
  cancelledResponseCount = 0
  private listeners = new Set<(event: RealtimeTransportEvent) => void>()

  constructor(mode: RealtimeMode = "text") {
    this.mode = mode
  }

  async connect(): Promise<void> {
    this.setStatus("connecting")
    this.microphoneEnabled = this.mode === "voice"
    this.setStatus("connected")
  }

  disconnect(): void {
    this.microphoneEnabled = false
    this.setStatus("disconnected")
  }

  sendUserText(text: string): void {
    if (this.status !== "connected") {
      throw new Error("Realtime transport is not connected")
    }
    this.sentTexts.push(text)
  }

  sendToolOutput(callId: string, output: unknown): void {
    if (this.status !== "connected") {
      throw new Error("Realtime transport is not connected")
    }
    this.sentToolOutputs.push({ callId, output })
  }

  cancelResponse(): void {
    if (this.status !== "connected") {
      throw new Error("Realtime transport is not connected")
    }
    this.cancelledResponseCount += 1
  }

  setMicrophoneEnabled(enabled: boolean): void {
    if (this.status !== "connected" || this.mode !== "voice") {
      throw new Error("Realtime microphone is not available")
    }
    this.microphoneEnabled = enabled
  }

  subscribe(
    listener: (event: RealtimeTransportEvent) => void,
  ): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  emit(event: RealtimeTransportEvent): void {
    this.listeners.forEach(listener => listener(event))
  }

  private setStatus(status: RealtimeTransportStatus): void {
    this.status = status
    this.emit({ type: "status", status })
  }
}
