import React from "react"
import { fireEvent, render } from "@testing-library/react"

import DraftPlanPanel from "../components/DraftPlanPanel"
import {
  createDraftPlanProposal,
  createRealtimeAdvisorState,
  queueProposal,
  resolveProposal,
} from "../behavior/realtime/proposals"

describe("live draft plan panel", () => {
  it("requires a manual decision before rendering a plan statement", () => {
    const now = "2026-07-30T20:00:00Z"
    const proposal = createDraftPlanProposal({
      id: "proposal-1",
      draftSessionId: "espn-session",
      sourceEventCount: 20,
      createdAt: now,
      text: "Prioritize running back before the next tier cliff.",
      explanation: "The current tier is unlikely to survive.",
    })
    const pending = queueProposal(
      createRealtimeAdvisorState("espn-session", 20, now),
      proposal,
    )
    const onAccept = jest.fn()
    const onReject = jest.fn()
    const first = render(
      <DraftPlanPanel
        plan={pending.plan}
        proposals={pending.proposals}
        onAcceptProposal={onAccept}
        onRejectProposal={onReject}
      />,
    )

    expect(first.getByText("Confirmation required")).toBeTruthy()
    expect(first.getByRole("alert").textContent).toContain(
      "Confirmation required: Add to live draft plan",
    )
    expect(first.getByText("No confirmed plan statements yet."))
      .toBeTruthy()
    fireEvent.click(first.getByRole("button", { name: "Accept" }))
    expect(onAccept).toHaveBeenCalledWith(proposal.id)
    first.unmount()

    const accepted = resolveProposal(
      pending,
      proposal.id,
      "accept",
      20,
      "2026-07-30T20:00:01Z",
    ).state
    const second = render(
      <DraftPlanPanel
        plan={accepted.plan}
        proposals={accepted.proposals}
        onAcceptProposal={onAccept}
        onRejectProposal={onReject}
      />,
    )
    expect(second.getByText(proposal.payload.text)).toBeTruthy()
    expect(second.queryByText("Confirmation required")).toBeNull()
  })
})
