import {act, renderHook, waitFor} from "@testing-library/react"
import type {User} from "firebase/auth"
import fixture from "./fixtures/completed-draft-replay.json"

import {putUserMockDraft} from "../behavior/api/userMockDrafts"
import {useCompletedMockArchive} from "../behavior/hooks/useCompletedMockArchive"
import {
  createCompletedMockArchive,
  storeLocalCompletedMock,
} from "../behavior/mockDraft/archive"
import type {RecordedCompletedDraftReplay} from "../behavior/draft-advisor/completedDraftReplay"


jest.mock("../behavior/api/userMockDrafts", () => ({
  putUserMockDraft: jest.fn(),
}))

const putMock = putUserMockDraft as jest.MockedFunction<typeof putUserMockDraft>
const archive = createCompletedMockArchive({
  fixture: fixture as unknown as RecordedCompletedDraftReplay,
  season: 2026,
  rankingSource: "Harris",
  adpSource: "ESPN",
  targets: [],
  completedAt: "2026-08-30T18:00:00Z",
})
const user = {
  getIdToken: jest.fn().mockResolvedValue("firebase-token"),
} as unknown as User

describe("completed mock archive synchronization", () => {
  beforeEach(() => {
    localStorage.clear()
    jest.clearAllMocks()
    putMock.mockResolvedValue({} as never)
  })

  it("recovers a prior local archive after authentication without requiring a live draft", async () => {
    storeLocalCompletedMock(localStorage, archive)
    const {result} = renderHook(() => useCompletedMockArchive({
      enabled: true,
      archive: null,
      season: 2026,
      user,
    }))

    await waitFor(() => expect(result.current.state).toBe("synced"))
    expect(putMock).toHaveBeenCalledWith(
      archive.mock_id,
      expect.objectContaining({completed_at: archive.completed_at}),
      {token: "firebase-token", season: 2026},
    )
  })

  it("retries the bounded local queue when the browser comes back online", async () => {
    storeLocalCompletedMock(localStorage, archive)
    putMock.mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({} as never)
    const {result} = renderHook(() => useCompletedMockArchive({
      enabled: true,
      archive: null,
      season: 2026,
      user,
    }))

    await waitFor(() => expect(result.current.state).toBe("offline"))
    act(() => window.dispatchEvent(new Event("online")))
    await waitFor(() => expect(result.current.state).toBe("synced"))
    expect(putMock).toHaveBeenCalledTimes(2)
  })
})
