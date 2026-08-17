import React from "react"
import {
  render,
  fireEvent,
  screen,
  waitFor,
} from "@testing-library/react"

import type {
  PlayerStatusEvent,
} from "../behavior/api/playerStatus"
import type {
  DraftRecommendationSet,
} from "../behavior/draft-advisor/recommendations"
import LiveAdvisorPanel from "../components/LiveAdvisorPanel"
import DraftDeskAdvisorDisclosure from "../components/draft-desk/DraftDeskAdvisorDisclosure"
import {
  createDraftPlanProposal,
  createRealtimeAdvisorState,
  queueProposal,
} from "../behavior/realtime/proposals"
import {
  FantasyPosition,
  NFLTeam,
  Player,
} from "../types"


const player: Player = {
  id: "101",
  firstName: "Alpha",
  lastName: "Runner",
  fullName: "Alpha Runner",
  team: NFLTeam.BUF,
  position: FantasyPosition.RUNNING_BACK,
  ranks: {},
}

const recommendations: DraftRecommendationSet = {
  schemaVersion: 1,
  currentPick: 6,
  nextUserPick: 8,
  preferredView: "cross_position",
  viewExplanation: "Compare the current options.",
  candidates: [{
    player,
    positionRank: 1,
    score: 10,
    evidence: {
      projectedFloor: 10,
      projectedMedian: 12,
      projectedCeiling: 14,
      replacementLevel: 8,
      pointsAboveReplacement: 4,
      marginalLineupPoints: 3,
      benchUtility: 0,
      tierLossIfDeferred: 2,
      survivalProbability: 0.4,
      positionalRunProbability: 0.2,
      tierBoundaryProbability: 0.3,
      userTier: 1,
      projectionTier: 1,
      rosterRole: "open_starter",
      flags: [],
    },
  }],
}

const statusEvent = (
  overrides: Partial<PlayerStatusEvent> = {},
): PlayerStatusEvent => ({
  schema_version: 1,
  id: "status_material",
  player_id: "101",
  type: "injury",
  status: "out",
  short_summary: "Out — hamstring.",
  source: "nflverse_injuries",
  source_url: "https://example.test/injuries.csv",
  source_published_at: "2026-09-09T20:00:00Z",
  fetched_at: "2026-09-10T08:00:00Z",
  confidence: 0.95,
  recommendation_impact: "material",
  stale: false,
  ...overrides,
})

describe("live advisor status evidence", () => {
  it("shows only current actionable evidence without changing candidates", () => {
    const view = render(
      <LiveAdvisorPanel
        draftStarted={true}
        onSelectPlayer={jest.fn()}
        recommendations={recommendations}
        playerStatus={{
          "101": {
            playerId: "101",
            state: "ready",
            loadedAt: Date.now(),
            response: {
              schema_version: 1,
              player_id: "101",
              last_updated_at: "2026-09-10T08:00:00Z",
              events: [
                statusEvent(),
                statusEvent({
                  id: "status_stale",
                  short_summary: "Old stale report.",
                  stale: true,
                }),
                statusEvent({
                  id: "status_none",
                  type: "profile_news",
                  short_summary: "General profile update.",
                  recommendation_impact: "none",
                }),
              ],
            },
          },
        }}
      />,
    )

    expect(view.getByText("Alpha Runner")).toBeTruthy()
    expect(view.getByLabelText("Alpha Runner status evidence"))
      .toBeTruthy()
    expect(view.getByText(/Out — hamstring\./)).toBeTruthy()
    expect(view.queryByText("Old stale report.")).toBeNull()
    expect(view.queryByText("General profile update.")).toBeNull()
    expect(view.getByRole("link", {
      name: "nflverse injury report",
    }).getAttribute("href")).toBe(
      "https://example.test/injuries.csv",
    )
    expect(view.getByText(/95% confidence/)).toBeTruthy()
    expect(view.getByText(/published 2026-09-09/)).toBeTruthy()
  })

  it("stays quiet when a recommendation status provider is unavailable", () => {
    const view = render(
      <LiveAdvisorPanel
        draftStarted={true}
        onSelectPlayer={jest.fn()}
        recommendations={recommendations}
        playerStatus={{
          "101": {
            playerId: "101",
            state: "unavailable",
            loadedAt: Date.now(),
            response: null,
          },
        }}
      />,
    )

    expect(view.getByText("Alpha Runner")).toBeTruthy()
    expect(view.queryByText("Current status evidence")).toBeNull()
    expect(view.queryByText(/unavailable/i)).toBeNull()
  })

  it("presents capture state and confirms, cancels, and escapes export preflight accessibly", async () => {
    const onExportReplay = jest.fn()
    const opener = document.createElement("button")
    opener.textContent = "Elsewhere"
    document.body.appendChild(opener)
    opener.focus()
    const view = render(
      <LiveAdvisorPanel
        draftStarted={true}
        onSelectPlayer={jest.fn()}
        recommendations={recommendations}
        onExportReplay={onExportReplay}
        replayCaptureStatus={{
          state: "recording",
          reasonCode: "recording",
          message: "Recording local pre-pick opponent forecasts.",
          observationCount: 2,
          latestObservedThroughOverallPick: 5,
        }}
        replayExportPreflight={{
          state: "warning",
          message: [
            "Roster replay is ready, but opponent metrics will be unavailable",
            "because no labeled forecasts were captured.",
          ].join(" "),
          totalPlatformPicks: 160,
          boardComplete: true,
          authoritativePlatformBoard: true,
          campaignEvidenceReady: false,
          sessionMatch: true,
          targetRosterMatch: true,
          evidencePresent: false,
          evidenceValid: true,
          canExportRosterOnly: false,
          labeledPickCount: 0,
          labeledWindowCount: 0,
          opponentMetricsAvailable: false,
        }}
      />,
    )
    expect(screen.getByText(/Recording local pre-pick/).textContent).toContain("2 observations")
    expect(document.activeElement).toBe(opener)
    fireEvent.click(screen.getByRole("button", { name: "Export replay fixture" }))
    const dialog = screen.getByRole("dialog")
    await waitFor(() => expect(document.activeElement?.textContent).toContain("Confirm download"))
    expect(
      screen.getByRole("list", { name: "Replay export checks" }).textContent,
    ).toContain("Campaign evidence ready: no")
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true })
    expect(document.activeElement?.textContent).toContain("Cancel")
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(screen.queryByRole("dialog")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Export replay fixture" }))
    const reopened = screen.getByRole("dialog")
    await waitFor(() => expect(document.activeElement?.textContent).toContain("Confirm download"))
    screen.getByRole("button", { name: "Cancel" }).focus()
    fireEvent.keyDown(reopened, { key: "Tab" })
    expect(document.activeElement?.textContent).toContain("Confirm download")
    fireEvent.keyDown(reopened, { key: "Escape" })
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Export replay fixture" }))
    fireEvent.click(screen.getByRole("button", { name: "Export replay fixture" }))
    fireEvent.click(screen.getByRole("button", { name: "Confirm download" }))
    expect(onExportReplay).toHaveBeenCalledTimes(1)
    view.unmount(); opener.remove()
  })

  it("offers roster-only recovery only for an evidence-only block", () => {
    const preflight = (canExportRosterOnly: boolean) => ({
      state: "blocked" as const,
      message: "Blocked",
      totalPlatformPicks: 160,
      boardComplete: canExportRosterOnly,
      authoritativePlatformBoard: true,
      campaignEvidenceReady: false,
      sessionMatch: false,
      targetRosterMatch: false,
      evidencePresent: true,
      evidenceValid: false,
      canExportRosterOnly,
      labeledPickCount: 0,
      labeledWindowCount: 0,
      opponentMetricsAvailable: false,
    })
    const view = render(
      <LiveAdvisorPanel
        draftStarted={true}
        onSelectPlayer={jest.fn()}
        recommendations={recommendations}
        onExportReplay={jest.fn()}
        onExportRosterOnly={jest.fn()}
        replayExportPreflight={preflight(true)}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Export replay fixture" }))
    expect(screen.getByRole("button", { name: "Export roster-only fixture" })).toBeTruthy()
    expect(
      screen.getByRole("list", { name: "Replay export checks" }).textContent,
    ).toContain("Board complete: yes")
    expect(
      screen.getByRole("list", { name: "Replay export checks" }).textContent,
    ).toContain("Authoritative ESPN board: yes")
    expect(
      screen.getByRole("list", { name: "Replay export checks" }).textContent,
    ).toContain("Campaign evidence ready: no")
    expect(
      screen.getByRole("list", { name: "Replay export checks" }).textContent,
    ).toContain("Session match: no; target roster match: no")
    expect(
      screen.getByRole("list", { name: "Replay export checks" }).textContent,
    ).toContain("Forecast evidence valid: no")
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    view.rerender(
      <LiveAdvisorPanel
        draftStarted={true}
        onSelectPlayer={jest.fn()}
        recommendations={recommendations}
        onExportReplay={jest.fn()}
        onExportRosterOnly={jest.fn()}
        replayExportPreflight={preflight(false)}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Export replay fixture" }))
    expect(screen.queryByRole("button", { name: "Export roster-only fixture" })).toBeNull()
  })

  it("shows paused and completed-unlabeled capture messages", () => {
    const view = render(
      <LiveAdvisorPanel
        draftStarted={true}
        onSelectPlayer={jest.fn()}
        recommendations={recommendations}
        replayCaptureStatus={{
          state: "paused",
          reasonCode: "provider_boundary_ahead",
          message: "Waiting for the advisor forecast to advance beyond the observed board.",
          observationCount: 0,
          latestObservedThroughOverallPick: null,
        }}
      />,
    )
    expect(screen.getByText(/Waiting for the advisor forecast/)).toBeTruthy()
    view.rerender(
      <LiveAdvisorPanel
        draftStarted={true}
        onSelectPlayer={jest.fn()}
        recommendations={recommendations}
        replayCaptureStatus={{
          state: "completed_without_labels",
          reasonCode: "completed",
          message: "Draft complete. No live forecast labels were captured.",
          observationCount: 0,
          latestObservedThroughOverallPick: null,
        }}
      />,
    )
    expect(screen.getByText(/No live forecast labels/)).toBeTruthy()
  })

  it("keeps non-voice advisor operations reachable from the Draft Desk desktop disclosure", () => {
    const proposal = createDraftPlanProposal({
      id: "desk-proposal",
      draftSessionId: "desk-session",
      sourceEventCount: 42,
      createdAt: "2026-08-16T20:00:00Z",
      text: "Prioritize the current running-back tier.",
      explanation: "The tier may clear before the next user pick.",
    })
    const advisor = queueProposal(
      createRealtimeAdvisorState(
        "desk-session",
        42,
        "2026-08-16T20:00:00Z",
      ),
      proposal,
    )
    const onAccept = jest.fn()
    const onReject = jest.fn()
    const onExportRosterOnly = jest.fn()
    const view = render(
      <DraftDeskAdvisorDisclosure
        draftPlan={advisor.plan}
        draftStarted
        onAcceptProposal={onAccept}
        onExportReplay={jest.fn()}
        onExportRosterOnly={onExportRosterOnly}
        onRejectProposal={onReject}
        onSelectPlayer={jest.fn()}
        realtimeError="Sync delayed"
        realtimeProposals={advisor.proposals}
        realtimeStatus="connected"
        recommendations={recommendations}
        replayExportPreflight={{
          state: "blocked",
          message: "Evidence is incomplete.",
          totalPlatformPicks: 160,
          boardComplete: true,
          authoritativePlatformBoard: true,
          campaignEvidenceReady: false,
          sessionMatch: true,
          targetRosterMatch: true,
          evidencePresent: true,
          evidenceValid: false,
          canExportRosterOnly: true,
          labeledPickCount: 0,
          labeledWindowCount: 0,
          opponentMetricsAvailable: false,
        }}
      />,
    )

    const disclosure = view.getByTestId("draft-desk-advisor-disclosure")
    const summary = view.getByLabelText("Advisor tools")
    expect(summary.tagName).toBe("SUMMARY")
    summary.focus()
    expect(document.activeElement).toBe(summary)
    fireEvent.click(summary)
    expect(disclosure.getAttribute("open")).not.toBeNull()
    expect(view.getByRole("region", {name: "Live draft plan"})).toBeTruthy()
    expect(view.getByText(/Advisor status: connected/)).toBeTruthy()
    expect(view.getByText(/Error: Sync delayed/)).toBeTruthy()

    fireEvent.click(view.getByRole("button", {name: "Accept"}))
    fireEvent.click(view.getByRole("button", {name: "Reject"}))
    expect(onAccept).toHaveBeenCalledWith("desk-proposal")
    expect(onReject).toHaveBeenCalledWith("desk-proposal")

    fireEvent.click(view.getByRole("button", {name: "Export replay fixture"}))
    fireEvent.click(view.getByRole("button", {name: "Export roster-only fixture"}))
    expect(onExportRosterOnly).toHaveBeenCalledTimes(1)
  })
})
