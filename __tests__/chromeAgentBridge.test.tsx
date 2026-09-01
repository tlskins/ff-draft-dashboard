import {act, renderHook} from "@testing-library/react"
import fixture from "./fixtures/completed-draft-replay.json"

import {useDraftyChromeAgentBridge} from "../behavior/hooks/useDraftyChromeAgentBridge"
import {useDraftyMockReviewWebMcp} from "../behavior/hooks/useDraftyMockReviewWebMcp"
import {createCompletedMockArchive} from "../behavior/mockDraft/archive"
import type {RecordedCompletedDraftReplay} from "../behavior/draft-advisor/completedDraftReplay"


describe("Codex Chrome draft-analysis bridge", () => {
  afterEach(() => {
    delete window.draftyAgentBridge
    delete document.documentElement.dataset.draftyChromeAgentBridge
    localStorage.clear()
  })

  it("mirrors the completed-draft WebMCP contract without UI scraping", async () => {
    const replay = fixture as unknown as RecordedCompletedDraftReplay
    const archive = createCompletedMockArchive({
      fixture: replay,
      season: 2026,
      rankingSource: "Harris",
      adpSource: "ESPN",
      targets: [],
      completedAt: "2026-08-30T18:00:00Z",
    })
    const {unmount} = renderHook(() => {
      useDraftyMockReviewWebMcp({
        season: 2026,
        user: null,
        currentArchive: archive,
      })
      useDraftyChromeAgentBridge()
    })

    expect(document.documentElement.dataset.draftyChromeAgentBridge).toBe("ready")
    expect(document.documentElement.dataset.draftyChromeAgentToolCount).toBe("3")
    expect(window.draftyAgentBridge?.getTools().map(tool => tool.name)).toEqual([
      "drafty_list_mock_drafts",
      "drafty_open_mock_review",
      "drafty_review_mock_draft",
    ])
    await expect(window.draftyAgentBridge?.executeTool(
      "drafty_review_mock_draft",
      {
        mock_id: replay.id,
        preserve_picks_through: 1,
        max_changed_picks: 2,
      },
    )).resolves.toMatchObject({
      ok: true,
      result: {
        fixtureId: replay.id,
        analysis_schema_version: 2,
        captured_league_settings: replay.settings,
      },
    })

    act(() => unmount())
    expect(window.draftyAgentBridge).toBeUndefined()
    expect(document.documentElement.dataset.draftyChromeAgentBridge).toBeUndefined()
  })
})
