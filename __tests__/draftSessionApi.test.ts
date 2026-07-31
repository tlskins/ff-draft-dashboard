import {
  createAdvisorInputFingerprint,
  loadAdvisorSnapshots,
  persistAdvisorSnapshots,
  persistDraftEvents,
  toOpponentForecastSnapshot,
} from "../behavior/api/draftSessions"
import type { CanonicalDraftEvent } from "../behavior/draft-feed/session"
import type {
  DraftRecommendationSet,
} from "../behavior/draft-advisor/recommendations"
import type { OpponentForecast } from "../behavior/draft-advisor/types"


const event: CanonicalDraftEvent = {
  version: 1,
  kind: "draft-pick-recorded",
  eventId: "ESPN:Replay Mock:pick:1",
  draftId: "ESPN:Replay Mock",
  draftTitle: "Replay Mock",
  platform: "ESPN",
  capturedAt: 100,
  pick: {
    playerId: "4362628",
    overallPick: 1,
    rosterIndex: 0,
    name: "Ja'Marr Chase",
    team: "CIN",
    position: "WR",
  },
}

describe("draft session API adapter", () => {
  it("creates the session before appending generated canonical events", async () => {
    const fetcher = jest.fn()
      .mockResolvedValue({ ok: true, status: 201 })

    await persistDraftEvents([event], {
      apiHost: "http://127.0.0.1:5000/",
      fetcher: fetcher as unknown as typeof fetch,
    })

    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(fetcher.mock.calls[0]).toEqual([
      "http://127.0.0.1:5000/v1/draft-sessions",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          id: event.draftId,
          platform_draft_id: event.draftId,
          title: event.draftTitle,
          platform: event.platform,
        }),
      }),
    ])
    expect(fetcher.mock.calls[1]).toEqual([
      "http://127.0.0.1:5000/v1/draft-sessions/ESPN%3AReplay%20Mock/events",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ events: [event] }),
      }),
    ])
  })

  it("is a no-op when local API persistence is not configured", async () => {
    const fetcher = jest.fn()

    await persistDraftEvents([event], {
      apiHost: "",
      fetcher: fetcher as unknown as typeof fetch,
    })

    expect(fetcher).not.toHaveBeenCalled()
  })

  it("publishes typed advisor snapshots against one session", async () => {
    const recommendations: DraftRecommendationSet = {
      schemaVersion: 1,
      currentPick: 2,
      nextUserPick: 8,
      preferredView: "cross_position",
      viewExplanation: "Compare positions.",
      candidates: [],
    }
    const opponentForecast: OpponentForecast = {
      schemaVersion: 1,
      model: "combined",
      targetRosterIndex: 0,
      picks: [],
      runProbabilities: [],
      tierBoundaryProbabilities: [],
    }
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    })

    await persistAdvisorSnapshots({
      sessionId: event.draftId,
      sourceEventCount: 1,
      inputFingerprint: "1234abcd",
      generatedAt: "2026-07-30T12:00:00Z",
      recommendations,
      opponentForecast,
    }, {
      apiHost: "http://127.0.0.1:5000/",
      fetcher: fetcher as unknown as typeof fetch,
    })

    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(fetcher.mock.calls[1][0]).toBe(
      "http://127.0.0.1:5000/v1/draft-sessions/ESPN%3AReplay%20Mock/recommendations",
    )
    expect(fetcher.mock.calls[1][1]).toEqual(expect.objectContaining({
      method: "PUT",
    }))
    const recommendationBody = JSON.parse(fetcher.mock.calls[1][1].body)
    const forecastBody = JSON.parse(fetcher.mock.calls[2][1].body)
    expect(recommendationBody).toMatchObject({
      calculation_version: "deterministic_advisor_v1",
      source_event_count: 1,
      input_fingerprint: "1234abcd",
      current_pick: 2,
    })
    expect(forecastBody).toMatchObject({
      calculation_version: "combined_opponent_v1",
      source_event_count: 1,
      model: "combined",
    })
  })

  it("refuses to serialize the offline v2 challenger as a live v1 snapshot", () => {
    const offlineV2: OpponentForecast = {
      schemaVersion: 1,
      model: "combined_v2",
      targetRosterIndex: 0,
      picks: [],
      runProbabilities: [],
      tierBoundaryProbabilities: [],
    }

    expect(() => toOpponentForecastSnapshot(offlineV2, {
      sourceEventCount: 1,
      inputFingerprint: "1234abcd",
      generatedAt: "2026-07-30T12:00:00Z",
    })).toThrow("Offline opponent model combined_v2 cannot be persisted")
  })

  it("loads nullable advisor snapshots and fingerprints inputs stably", async () => {
    const response = {
      session_id: event.draftId,
      snapshot: { schema_version: 1 },
    }
    const fetcher = jest.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => response,
      })

    const loaded = await loadAdvisorSnapshots(event.draftId, {
      apiHost: "http://127.0.0.1:5000",
      fetcher: fetcher as unknown as typeof fetch,
    })

    expect(loaded.recommendations).toBeNull()
    expect(loaded.opponentForecast).toEqual(response)
    expect(createAdvisorInputFingerprint({b: 2, a: 1})).toBe(
      createAdvisorInputFingerprint({a: 1, b: 2}),
    )
    expect(createAdvisorInputFingerprint({a: 1})).not.toBe(
      createAdvisorInputFingerprint({a: 2}),
    )
  })
})
