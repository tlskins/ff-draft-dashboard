import {
  getUserDraftProfile,
  putUserDraftProfile,
  UserDraftProfileApiError,
} from "../behavior/api/userDraftProfile"
import {createCloudProfilePayload} from "../behavior/cloudProfileSync"


const profile = createCloudProfilePayload({
  rankingProfile: null,
  targets: [],
  sourceRanker: "Harris",
})

const record = {
  schema_version: 1 as const,
  season: 2026,
  revision: 1,
  profile,
  content_fingerprint: "a".repeat(64),
  last_mutation_id: "mutation-one",
  last_writer_device_id: "device-one",
  created_at: "2026-08-29T12:00:00Z",
  updated_at: "2026-08-29T12:00:00Z",
}

describe("authenticated user draft profile API", () => {
  it("scopes reads to the bearer token", async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => record,
    })
    await expect(getUserDraftProfile({
      apiHost: "https://drafty.example/",
      token: "firebase-token",
      fetcher: fetcher as unknown as typeof fetch,
    })).resolves.toEqual(record)
    expect(fetcher).toHaveBeenCalledWith(
      "https://drafty.example/v1/me/draft-profile?season=2026",
      {headers: {Authorization: "Bearer firebase-token"}},
    )
  })

  it("sends the bounded optimistic write contract", async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => record,
    })
    const body = {
      expected_revision: 0,
      mutation_id: "device-one:mutation-one",
      device_id: "device-one",
      profile,
    }
    await putUserDraftProfile(body, {
      apiHost: "https://drafty.example",
      token: "firebase-token",
      fetcher: fetcher as unknown as typeof fetch,
    })
    expect(fetcher).toHaveBeenCalledWith(
      "https://drafty.example/v1/me/draft-profile?season=2026",
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer firebase-token",
        },
        body: JSON.stringify(body),
      },
    )
  })

  it("retains stale-revision evidence without exposing response internals", async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        error: "Expected revision 1 but found 2",
        code: "stale_revision",
        current_revision: 2,
      }),
    })
    await expect(getUserDraftProfile({
      apiHost: "https://drafty.example",
      token: "firebase-token",
      fetcher: fetcher as unknown as typeof fetch,
    })).rejects.toEqual(new UserDraftProfileApiError(
      "Expected revision 1 but found 2",
      409,
      "stale_revision",
      2,
    ))
  })
})
