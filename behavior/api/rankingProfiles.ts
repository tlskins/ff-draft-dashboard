import type { components as ApiComponents } from "./schema"


export type RankingProfile =
  ApiComponents["schemas"]["RankingProfile"]
export type RankingProfileSnapshot =
  ApiComponents["schemas"]["RankingProfileSnapshot"]
export type RankingProfileCreateRequest =
  ApiComponents["schemas"]["RankingProfileCreateRequest"]
export type RankingProfileRevisionRequest =
  ApiComponents["schemas"]["RankingProfileRevisionRequest"]
export type RankingProfileRebasePreviewRequest =
  ApiComponents["schemas"]["RankingProfileRebasePreviewRequest"]
export type RankingProfileRebasePreviewResponse =
  ApiComponents["schemas"]["RankingProfileRebasePreviewResponse"]
export type RankingProfileV2Record =
  ApiComponents["schemas"]["RankingProfileV2Record"]
export type RankingProfileV2CreateRequest =
  ApiComponents["schemas"]["RankingProfileV2CreateRequest"]
export type RankingProfileV2RevisionRequest =
  ApiComponents["schemas"]["RankingProfileV2RevisionRequest"]

interface RankingProfileApiOptions {
  apiHost?: string
  fetcher?: typeof fetch
}

export class RankingProfileApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: string,
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
  let response: Response
  try {
    response = await (fetcher || fetch)(
      `${apiHost.replace(/\/$/, "")}${path}`,
      init,
    )
  } catch (error) {
    throw new RankingProfileApiError(
      error instanceof Error ? error.message : "Ranking profile API is unavailable",
    )
  }
  if (!response.ok) {
    const error = await response.json().catch(() => null) as {
      error?: string
      code?: string
    } | null
    throw new RankingProfileApiError(
      error?.error || `Ranking profile API returned ${response.status}`,
      response.status,
      error?.code,
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

export const previewRankingProfileRebase = (
  profileId: string,
  body: RankingProfileRebasePreviewRequest,
  options: RankingProfileApiOptions = {},
) => post<RankingProfileRebasePreviewResponse>(
  `/v1/ranking-profiles/${encodeURIComponent(profileId)}/rebase-preview`,
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

export const listRankingProfilesV2 = (
  options: RankingProfileApiOptions = {},
) => request<{profiles: RankingProfileV2Record[]}>(
  "/v1/ranking-profiles-v2",
  options,
)

export const getRankingProfileV2 = (
  profileId: string,
  options: RankingProfileApiOptions = {},
) => request<RankingProfileV2Record>(
  `/v1/ranking-profiles-v2/${encodeURIComponent(profileId)}`,
  options,
)

export const createRankingProfileV2 = (
  body: RankingProfileV2CreateRequest,
  options: RankingProfileApiOptions = {},
) => post<RankingProfileV2Record>(
  "/v1/ranking-profiles-v2",
  body,
  options,
)

export const createRankingProfileV2Revision = (
  profileId: string,
  body: RankingProfileV2RevisionRequest,
  options: RankingProfileApiOptions = {},
) => post<RankingProfileV2Record>(
  `/v1/ranking-profiles-v2/${encodeURIComponent(profileId)}/revisions`,
  body,
  options,
)

export const undoRankingProfileV2 = (
  profileId: string,
  expectedRevision: number,
  options: RankingProfileApiOptions = {},
) => post<RankingProfileV2Record>(
  `/v1/ranking-profiles-v2/${encodeURIComponent(profileId)}/undo`,
  {expected_revision: expectedRevision},
  options,
)

export const redoRankingProfileV2 = (
  profileId: string,
  expectedRevision: number,
  options: RankingProfileApiOptions = {},
) => post<RankingProfileV2Record>(
  `/v1/ranking-profiles-v2/${encodeURIComponent(profileId)}/redo`,
  {expected_revision: expectedRevision},
  options,
)
