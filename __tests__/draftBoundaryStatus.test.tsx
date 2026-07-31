import React from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import {
  DraftCaptureStatus,
  DraftPersistenceStatus,
} from "../components/DraftBoundaryStatus"
import DraftSourceHealthBadge from "../components/DraftSourceHealthBadge"
import RealtimeTextAdvisor from "../components/RealtimeTextAdvisor"

describe("draft boundary statuses", () => {
  it("keeps a selected draft visible while stale capture wins the status", () => {
    render(
      <DraftCaptureStatus
        activeDraftTitle="My ESPN Mock"
        state="stale"
      />,
    )

    const status = screen.getByRole("status")
    expect(status.textContent).toContain("capture is stale")
    expect(status.textContent).toContain("My ESPN Mock remains selected")
    expect(status.textContent).toContain("local board is preserved")
  })

  it("explains API failure without implying local draft loss and allows retry", () => {
    const onRetry = jest.fn()
    render(
      <DraftPersistenceStatus
        onRetry={onRetry}
        persistence={{
          state: "offline",
          pendingEventCount: 2,
          error: "API unavailable",
          canRetry: true,
        }}
      />,
    )

    expect(screen.getByRole("status").textContent).toContain(
      "local draft and deterministic recommendations are still safe",
    )
    fireEvent.click(screen.getByRole("button", { name: "Retry sync" }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it("distinguishes stale selector monitoring from selector degradation", () => {
    render(
      <DraftSourceHealthBadge
        freshness="stale"
        health={{
          selectorVersion: 1,
          platform: "ESPN",
          status: "degraded",
          mode: "live-history",
          checkedAt: 1,
          pickCount: 3,
          checks: [],
          issues: ["history-rows-unhealthy"],
        }}
      />,
    )

    expect(screen.getByRole("status").textContent).toContain(
      "selector health is stale",
    )
    expect(screen.queryByText(/capture degraded/)).toBeNull()
  })

  it("announces deterministic fallback and exposes a manual Realtime retry", () => {
    const onConnect = jest.fn().mockResolvedValue(undefined)
    render(
      <RealtimeTextAdvisor
        autoAdviceEnabled={true}
        error="Realtime disconnected after 3 reconnect attempts"
        isResponding={false}
        isUserSpeaking={false}
        messages={[]}
        microphoneEnabled={false}
        mode="text"
        onCancelResponse={() => false}
        onConnect={onConnect}
        onDisconnect={jest.fn()}
        onSendText={() => false}
        onSetAutoAdviceEnabled={jest.fn()}
        onSetMicrophoneEnabled={() => false}
        onSetMode={() => false}
        reconnectAttempt={0}
        status="disconnected"
      />,
    )

    expect(screen.getByText(/deterministic recommendations remain active/i)
      .getAttribute("role")).toBe("status")
    fireEvent.click(screen.getByRole("button", { name: "Retry Realtime" }))
    expect(onConnect).toHaveBeenCalledTimes(1)
  })

  it("calls an optional initial Realtime session disconnected, not unavailable", () => {
    render(
      <RealtimeTextAdvisor
        autoAdviceEnabled={true}
        error={null}
        isResponding={false}
        isUserSpeaking={false}
        messages={[]}
        microphoneEnabled={false}
        mode="text"
        onCancelResponse={() => false}
        onConnect={jest.fn().mockResolvedValue(undefined)}
        onDisconnect={jest.fn()}
        onSendText={() => false}
        onSetAutoAdviceEnabled={jest.fn()}
        onSetMicrophoneEnabled={() => false}
        onSetMode={() => false}
        reconnectAttempt={0}
        status="disconnected"
      />,
    )

    expect(screen.getByText(/Realtime is not connected/i)).toBeTruthy()
    expect(screen.queryByText(/Realtime is unavailable/i)).toBeNull()
  })
})
