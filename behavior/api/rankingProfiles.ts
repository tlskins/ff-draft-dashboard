import type { components as ApiComponents } from "./schema"


export type RankingProfile =
  ApiComponents["schemas"]["RankingProfile"]
export type RankingProfileSnapshot =
  ApiComponents["schemas"]["RankingProfileSnapshot"]
export type RankingProfileCreateRequest =
  ApiComponents["schemas"]["RankingProfileCreateRequest"]
export type RankingProfileRevisionRequest =
  ApiComponents["schemas"]["RankingProfileRevisionRequest"]

interface RankingProfileApiOptions {
  apiHost?: string
  fetcher?: typeof fetch
}

export class RankingProfileApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message)
    this.name = "RankingProfileApiError"
  }
}

const request = async <ResponseBody>(
  path: string,
  {
    apiHost = process.env.NEXT_PUBLIC_API_HOST,
    fetcher,
  }: RankingProfileApiOptions,
  init?: RequestInit,
): Promise<ResponseBody> => {
  if (!apiHost) {
    throw new RankingProfileApiError(
      "Ranking profile API is not configured",
    )
  }
  const response = await (fetcher || fetch)(
    `${apiHost.replace(/\/$/, "")}${path}`,
    init,
  )
  if (!response.ok) {
    const error = await response.json().catch(() => null) as {
      error?: string
    } | null
    throw new RankingProfileApiError(
      error?.error || `Ranking profile API returned ${response.status}`,
      response.status,
    )
  }
  return response.json() as Promise<ResponseBody>
}

const post = <ResponseBody>(
  path: string,
  body: object,
  options: RankingProfileApiOptions = {},
) => request<ResponseBody>(
  path,
  options,
  {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(body),
  },
)

export const listRankingProfiles = (
  options: RankingProfileApiOptions = {},
) => request<{profiles: RankingProfile[]}>(
  "/v1/ranking-profiles",
  options,
)

export const createRankingProfile = (
  body: RankingProfileCreateRequest,
  options: RankingProfileApiOptions = {},
) => post<RankingProfile>("/v1/ranking-profiles", body, options)

export const createRankingProfileRevision = (
  profileId: string,
  body: RankingProfileRevisionRequest,
  options: RankingProfileApiOptions = {},
) => post<RankingProfile>(
  `/v1/ranking-profiles/${encodeURIComponent(profileId)}/revisions`,
  body,
  options,
)

export const undoRankingProfile = (
  profileId: string,
  expectedRevision: number,
  options: RankingProfileApiOptions = {},
) => post<RankingProfile>(
  `/v1/ranking-profiles/${encodeURIComponent(profileId)}/undo`,
  {expected_revision: expectedRevision},
  options,
)

export const redoRankingProfile = (
  profileId: string,
  expectedRevision: number,
  options: RankingProfileApiOptions = {},
) => post<RankingProfile>(
  `/v1/ranking-profiles/${encodeURIComponent(profileId)}/redo`,
  {expected_revision: expectedRevision},
  options,
)
