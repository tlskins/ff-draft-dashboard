import {renderHook, waitFor} from "@testing-library/react"
import fixture from "./fixtures/completed-draft-replay.json"

import {
  DRAFTY_WEBMCP_MOCK_TOOL_NAMES,
  useDraftyMockReviewWebMcp,
} from "../behavior/hooks/useDraftyMockReviewWebMcp"
import {createCompletedMockArchive} from "../behavior/mockDraft/archive"
import type {RecordedCompletedDraftReplay} from "../behavior/draft-advisor/completedDraftReplay"


const installModelContext = () => {
  const registerTool = jest.fn().mockResolvedValue(undefined)
  Object.defineProperty(document, "modelContext", {
    configurable: true,
    value: {
      registerTool,
      getTools: jest.fn().mockResolvedValue([]),
      ontoolchange: null,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    } as unknown as WebMCP.ModelContext,
  })
  return registerTool
}

describe("completed mock WebMCP tools", () => {
  afterEach(() => {
    delete (document as {modelContext?: WebMCP.ModelContext}).modelContext
    localStorage.clear()
  })

  it("registers bounded list and deterministic review tools", async () => {
    const registerTool = installModelContext()
    const replay = fixture as unknown as RecordedCompletedDraftReplay
    const archive = createCompletedMockArchive({
      fixture: replay,
      season: 2026,
      rankingSource: "Harris",
      adpSource: "ESPN",
      targets: [],
      completedAt: "2026-08-30T18:00:00Z",
    })
    const onOpenReview = jest.fn()
    const {result, unmount} = renderHook(() => useDraftyMockReviewWebMcp({
      season: 2026,
      user: null,
      currentArchive: archive,
      onOpenReview,
    }))
    await waitFor(() => expect(result.current.status).toBe("ready"))
    expect(result.current.registeredToolCount).toBe(3)
    const tools = new Map(registerTool.mock.calls.map(call => [
      call[0].name,
      call[0] as WebMCP.ModelContextTool,
    ]))
    expect(Array.from(tools.keys())).toEqual(DRAFTY_WEBMCP_MOCK_TOOL_NAMES)
    const signal = new AbortController().signal
    await expect(tools.get("drafty_list_mock_drafts")!.execute({}, {signal}))
      .resolves.toMatchObject({
        ok: true,
        result: {
          season: 2026,
          count: 1,
          mocks: [{mock_id: replay.id, review_state: "unreviewed", reviewed_at: null}],
        },
      })
    const chromeExecute = tools.get("drafty_list_mock_drafts")!.execute as unknown as (
      input: Record<string, unknown>,
    ) => Promise<unknown>
    await expect(chromeExecute({}))
      .resolves.toMatchObject({ok: true, result: {season: 2026, count: 1}})
    await expect(tools.get("drafty_review_mock_draft")!.execute({
      mock_id: replay.id,
      max_alternatives: 5,
      preserve_picks_through: 1,
      max_changed_picks: 10,
    }, {signal})).resolves.toMatchObject({
      ok: true,
      result: {
        analysis_schema_version: 2,
        schemaVersion: 1,
        fixtureId: replay.id,
        captured_league_settings: replay.settings,
        observedAvailability: expect.any(Array),
        actual: {
          schemaVersion: 1,
          positionMetrics: expect.any(Object),
          totals: expect.any(Object),
          playerMetrics: expect.arrayContaining([expect.objectContaining({
            replacementPoints: expect.any(Number),
            projectedPointsAboveReplacement: expect.any(Number),
            lineupRole: expect.any(String),
          })]),
        },
        alternatives: expect.arrayContaining([expect.objectContaining({
          objective: expect.objectContaining({name: "starter_par_then_total_par_v1"}),
          decisionLedger: expect.arrayContaining([expect.objectContaining({
            latestSafeOverallPick: expect.any(Number),
            latestSafeUserPickNumber: expect.any(Number),
            turnsEarly: expect.any(Number),
          })]),
          replayFidelity: expect.any(Object),
        })]),
      },
    })
    await expect(tools.get("drafty_open_mock_review")!.execute({
      mock_id: replay.id,
      season: 2026,
    }, {signal})).resolves.toMatchObject({
      ok: true,
      code: "accepted",
      result: {mock_id: replay.id, season: 2026, open: true},
    })
    expect(onOpenReview).toHaveBeenCalledWith(archive)
    unmount()
  })

  it("rejects unknown fields and invalid position sequences", async () => {
    const registerTool = installModelContext()
    const {result, unmount} = renderHook(() => useDraftyMockReviewWebMcp({
      season: 2026,
      user: null,
      currentArchive: null,
    }))
    await waitFor(() => expect(result.current.status).toBe("ready"))
    const reviewTool = registerTool.mock.calls.find(call =>
      call[0].name === "drafty_review_mock_draft")![0] as WebMCP.ModelContextTool
    await expect(reviewTool.execute({mock_id: "mock", position_sequence: ["K"]}, {
      signal: new AbortController().signal,
    })).resolves.toMatchObject({ok: false, code: "invalid_input"})
    await expect(reviewTool.execute({
      mock_id: "mock",
      scoring_format: "ppr",
    }, {
      signal: new AbortController().signal,
    })).resolves.toMatchObject({ok: false, code: "invalid_input"})
    await expect(reviewTool.execute({
      mock_id: "mock",
      max_alternatives: 6,
    }, {
      signal: new AbortController().signal,
    })).resolves.toMatchObject({ok: false, code: "invalid_input"})
    await expect(reviewTool.execute({
      mock_id: "mock",
      player_overrides: [
        {pick_number: 1, player_id: "player-one"},
        {pick_number: 1, player_id: "player-two"},
      ],
    }, {
      signal: new AbortController().signal,
    })).resolves.toMatchObject({ok: false, code: "invalid_input"})
    unmount()
  })
})
