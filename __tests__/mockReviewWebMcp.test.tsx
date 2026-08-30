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
      .resolves.toMatchObject({ok: true, result: {season: 2026, count: 1}})
    const chromeExecute = tools.get("drafty_list_mock_drafts")!.execute as unknown as (
      input: Record<string, unknown>,
    ) => Promise<unknown>
    await expect(chromeExecute({}))
      .resolves.toMatchObject({ok: true, result: {season: 2026, count: 1}})
    await expect(tools.get("drafty_review_mock_draft")!.execute({
      mock_id: replay.id,
      position_sequence: ["RB", "WR"],
      player_overrides: [{pick_number: 1, player_id: replay.players[1].id}],
    }, {signal})).resolves.toMatchObject({
      ok: true,
      result: {
        schemaVersion: 1,
        fixtureId: replay.id,
        actual: {schemaVersion: 1},
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
