import fixture from "./fixtures/completed-draft-replay.json"
import {
  completedMockPutRequest,
  createCompletedMockArchive,
  readLocalCompletedMocks,
  storeLocalCompletedMock,
} from "../behavior/mockDraft/archive"
import type {RecordedCompletedDraftReplay} from "../behavior/draft-advisor/completedDraftReplay"


describe("completed mock archive", () => {
  beforeEach(() => localStorage.clear())

  it("captures season, targets, sources, and strips calibration evidence", () => {
    const replay = {
      ...(fixture as unknown as RecordedCompletedDraftReplay),
      forecastEvidence: {schemaVersion: 1, sessionId: "fixture", observations: []},
    } as RecordedCompletedDraftReplay
    const archive = createCompletedMockArchive({
      fixture: replay,
      season: 2026,
      rankingSource: "Harris",
      adpSource: "ESPN",
      targets: [{playerId: replay.players[0].id, targetAsEarlyAsRound: 2}],
      completedAt: "2026-08-30T18:00:00Z",
    })
    expect(archive.season).toBe(2026)
    expect(archive.targets).toHaveLength(1)
    expect(archive.replay).not.toHaveProperty("forecastEvidence")
    expect(completedMockPutRequest(archive)).not.toHaveProperty("mock_id")
    expect(completedMockPutRequest(archive)).not.toHaveProperty("season")
  })

  it("stores immutable mocks independently by season", () => {
    const replay = fixture as unknown as RecordedCompletedDraftReplay
    const first = createCompletedMockArchive({
      fixture: replay,
      season: 2026,
      rankingSource: "Harris",
      adpSource: "ESPN",
      targets: [],
      completedAt: "2026-08-30T18:00:00Z",
    })
    storeLocalCompletedMock(localStorage, first)
    expect(readLocalCompletedMocks(localStorage, 2026)).toEqual([first])
    expect(readLocalCompletedMocks(localStorage, 2027)).toEqual([])

    const conflicting = {...first, ranking_source: "FantasyPros"}
    expect(() => storeLocalCompletedMock(localStorage, conflicting)).toThrow(/immutable mock/)
  })
})
