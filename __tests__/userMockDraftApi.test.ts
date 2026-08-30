import {
  getUserMockDraft,
  listUserMockDrafts,
  putUserMockDraft,
  UserMockDraftApiError,
  type UserMockDraftPutRequest,
} from "../behavior/api/userMockDrafts"


const body: UserMockDraftPutRequest = {
  schema_version: 1,
  completed_at: "2026-08-30T18:00:00Z",
  ranking_source: "Harris",
  adp_source: "ESPN",
  targets: [],
  replay: {fixtureVersion: 1, id: "mock-one"},
}

const options = (fetcher: jest.Mock) => ({
  apiHost: "https://drafty.example/",
  token: "firebase-token",
  season: 2026,
  fetcher: fetcher as unknown as typeof fetch,
})

describe("authenticated completed mock API", () => {
  it("lists one explicit season with bearer ownership", async () => {
    const response = {schema_version: 1, season: 2026, mocks: []}
    const fetcher = jest.fn().mockResolvedValue({ok: true, json: async () => response})
    await expect(listUserMockDrafts(options(fetcher))).resolves.toEqual(response)
    expect(fetcher).toHaveBeenCalledWith(
      "https://drafty.example/v1/me/mock-drafts?season=2026",
      {headers: {Authorization: "Bearer firebase-token"}},
    )
  })

  it("gets and puts a stable encoded mock ID", async () => {
    const record = {...body, season: 2026, mock_id: "mock:one"}
    const fetcher = jest.fn().mockResolvedValue({ok: true, json: async () => record})
    await getUserMockDraft("mock:one", options(fetcher))
    expect(fetcher.mock.calls[0][0]).toBe(
      "https://drafty.example/v1/me/mock-drafts/mock%3Aone?season=2026",
    )
    await putUserMockDraft("mock:one", body, options(fetcher))
    expect(fetcher.mock.calls[1]).toEqual([
      "https://drafty.example/v1/me/mock-drafts/mock%3Aone?season=2026",
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer firebase-token",
        },
        body: JSON.stringify(body),
      },
    ])
  })

  it("retains bounded API error evidence", async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({error: "Different immutable mock", code: "immutable_mock_conflict"}),
    })
    await expect(putUserMockDraft("mock-one", body, options(fetcher))).rejects.toEqual(
      new UserMockDraftApiError("Different immutable mock", 409, "immutable_mock_conflict"),
    )
  })
})
