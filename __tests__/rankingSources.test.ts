import {
  getRankingSource,
  listRankingSources,
  previewRankingSourceRefresh,
  RankingSourceApiError,
} from "../behavior/api/rankingSources"


const unavailableSource = {
  schema_version: 1 as const,
  id: "espn",
  provider_id: "espn",
  provider_name: "ESPN",
  storage_transport: "sqlite" as const,
  availability: "unavailable" as const,
  is_stale: false,
  last_attempt_at: null,
  last_success_at: null,
  last_success_provider_id: null,
  failure_reason: null,
  retrieved_at: null,
  season: null,
  scoring_type: null,
  fingerprint: null,
  record_count: null,
}

describe("ranking source contract adapter", () => {
  it("lists and gets visible source status", async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({sources: [unavailableSource]}),
    })
    const options = {
      apiHost: "http://127.0.0.1:5000/",
      fetcher: fetcher as unknown as typeof fetch,
    }

    await expect(listRankingSources(options)).resolves.toEqual({
      sources: [unavailableSource],
    })
    fetcher.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => unavailableSource,
    })
    await expect(getRankingSource("espn", options)).resolves.toEqual(
      unavailableSource,
    )
    expect(fetcher.mock.calls.map(call => call[0])).toEqual([
      "http://127.0.0.1:5000/v1/ranking-sources",
      "http://127.0.0.1:5000/v1/ranking-sources/espn",
    ])
  })

  it("posts only the bounded inline candidate to refresh-preview", async () => {
    const preview = {
      schema_version: 1 as const,
      source: unavailableSource,
      candidate_fingerprint: "a".repeat(64),
      idempotency_key: "a".repeat(64),
      logically_idempotent: true as const,
      repeated_candidate: false,
      would_change: true,
      candidate_record_count: 1,
      differences: {
        season_changed: false,
        scoring_type_changed: false,
        retrieval_time_changed: false,
        added_player_ids: ["rb-1"],
        removed_player_ids: [],
        changed: [],
      },
      affected_profile_player_ids: ["rb-1"],
    }
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => preview,
    })
    const candidate = {
      retrieved_at: "2026-08-12T12:00:00Z",
      season: 2026,
      scoring_type: "ppr" as const,
      players: [{player_id: "rb-1", overall_rank: 1}],
    }

    await expect(previewRankingSourceRefresh("espn/frozen", candidate, {
      apiHost: "http://127.0.0.1:5000",
      fetcher: fetcher as unknown as typeof fetch,
    })).resolves.toEqual(preview)

    expect(fetcher).toHaveBeenCalledWith(
      "http://127.0.0.1:5000/v1/ranking-sources/espn%2Ffrozen/refresh-preview",
      {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(candidate),
      },
    )
    expect(candidate).not.toHaveProperty("path")
    expect(candidate).not.toHaveProperty("url")
  })

  it("surfaces bounded API errors and requires configuration", async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({error: "players: too many items"}),
    })
    await expect(previewRankingSourceRefresh("espn", {
      retrieved_at: "2026-08-12T12:00:00Z",
      season: 2026,
      scoring_type: "ppr",
      players: [{player_id: "rb-1", overall_rank: 1}],
    }, {
      apiHost: "http://127.0.0.1:5000",
      fetcher: fetcher as unknown as typeof fetch,
    })).rejects.toEqual(new RankingSourceApiError(
      "players: too many items", 400,
    ))

    await expect(listRankingSources({apiHost: ""})).rejects.toThrow(
      "Ranking source API is not configured",
    )
  })
})
