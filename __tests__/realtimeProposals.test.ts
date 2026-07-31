import {
  advanceDraftRevision,
  createAnalysisViewProposal,
  createDraftPlanProposal,
  createRealtimeAdvisorState,
  interpretConfirmation,
  queueProposal,
  resolveProposal,
} from "../behavior/realtime/proposals"
import {
  loadDraftPlan,
  saveDraftPlan,
} from "../behavior/realtime/storage"

const now = "2026-07-30T20:00:00Z"

describe("realtime proposal confirmation protocol", () => {
  it("does not mutate the draft plan before explicit confirmation", () => {
    const initial = createRealtimeAdvisorState(
      "espn-session",
      20,
      now,
    )
    const proposal = createDraftPlanProposal({
      id: "proposal-1",
      draftSessionId: "espn-session",
      sourceEventCount: 20,
      createdAt: now,
      text: "Prioritize the final RB tier before adding a second QB.",
      explanation: "The RB tier is modeled to cross before pick 49.",
    })

    const pending = queueProposal(initial, proposal)

    expect(pending.proposals[0].status).toBe("pending")
    expect(pending.plan.entries).toEqual([])

    const result = resolveProposal(
      pending,
      proposal.id,
      "accept",
      20,
      "2026-07-30T20:00:01Z",
    )

    expect(result.reason).toBe("accepted")
    expect(result.state.proposals[0].status).toBe("accepted")
    expect(result.state.plan.entries).toEqual([
      expect.objectContaining({
        proposal_id: proposal.id,
        text: proposal.payload.text,
        source_event_count: 20,
      }),
    ])
    expect(result.effect).toEqual(expect.objectContaining({
      type: "draft_plan_appended",
    }))
  })

  it("fails safely on ambiguous confirmation language", () => {
    const initial = createRealtimeAdvisorState(
      "espn-session",
      20,
      now,
    )
    const proposal = createDraftPlanProposal({
      id: "proposal-ambiguous",
      draftSessionId: "espn-session",
      sourceEventCount: 20,
      createdAt: now,
      text: "Wait on quarterback.",
      explanation: "Several comparable quarterbacks remain.",
    })
    const pending = queueProposal(initial, proposal)

    expect(interpretConfirmation("yeah, maybe")).toBe("ambiguous")
    const result = resolveProposal(
      pending,
      proposal.id,
      interpretConfirmation("yeah, maybe"),
      20,
      now,
    )

    expect(result.reason).toBe("ambiguous")
    expect(result.state).toEqual(pending)
    expect(result.effect).toBeNull()
  })

  it("expires pending proposals when a new pick changes the revision", () => {
    const initial = createRealtimeAdvisorState(
      "espn-session",
      20,
      now,
    )
    const proposal = createAnalysisViewProposal({
      id: "proposal-view",
      draftSessionId: "espn-session",
      sourceEventCount: 20,
      createdAt: now,
      view: "cross_position",
      explanation: "The user is approaching the clock.",
    })
    const stale = advanceDraftRevision(
      queueProposal(initial, proposal),
      21,
    )

    expect(stale.proposals[0].status).toBe("stale")
    const result = resolveProposal(
      stale,
      proposal.id,
      "accept",
      21,
      now,
    )
    expect(result.reason).toBe("not_pending")
    expect(result.effect).toBeNull()
  })

  it("returns an effect for accepted view proposals without editing plan", () => {
    const initial = createRealtimeAdvisorState(
      "espn-session",
      20,
      now,
    )
    const proposal = createAnalysisViewProposal({
      id: "proposal-view",
      draftSessionId: "espn-session",
      sourceEventCount: 20,
      createdAt: now,
      view: "tier_landscape",
      explanation: "A positional run is developing.",
    })

    const result = resolveProposal(
      queueProposal(initial, proposal),
      proposal.id,
      "accept",
      20,
      now,
    )

    expect(result.effect).toEqual({
      type: "analysis_view",
      view: "tier_landscape",
    })
    expect(result.state.plan.entries).toEqual([])
  })

  it("persists only validated session-scoped plan documents", () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) || null,
      setItem: (key: string, value: string) => values.set(key, value),
    }
    const document = createRealtimeAdvisorState(
      "espn-session",
      20,
      now,
    ).plan

    saveDraftPlan(document, storage)

    expect(loadDraftPlan("espn-session", storage)).toEqual(document)
    expect(loadDraftPlan("different-session", storage)).toBeNull()
    values.set(
      "drafty:draft-plan:v1:espn-session",
      JSON.stringify({ ...document, schema_version: 2 }),
    )
    expect(loadDraftPlan("espn-session", storage)).toBeNull()
  })
})
