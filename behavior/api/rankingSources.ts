import type {components as ApiComponents} from "./schema"


export type RankingSourceStatus =
  ApiComponents["schemas"]["RankingSourceStatus"]
export type RankingSourceListResponse =
  ApiComponents["schemas"]["RankingSourceListResponse"]
export type RankingSourceRefreshPreviewRequest =
  ApiComponents["schemas"]["RankingSourceRefreshPreviewRequest"]
export type RankingSourceRefreshPreviewResponse =
  ApiComponents["schemas"]["RankingSourceRefreshPreviewResponse"]

interface RankingSourceApiOptions {
  apiHost?: string
  fetcher?: typeof fetch
}

export class RankingSourceApiError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message)
    this.name = "RankingSourceApiError"
  }
}

const request = async <ResponseBody>(
  path: string,
  {apiHost = process.env.NEXT_PUBLIC_API_HOST, fetcher}: RankingSourceApiOptions,
  init?: RequestInit,
): Promise<ResponseBody> => {
  if (!apiHost) {
    throw new RankingSourceApiError("Ranking source API is not configured")
  }
  const response = await (fetcher || fetch)(
    `${apiHost.replace(/\/$/, "")}${path}`,
    init,
  )
  if (!response.ok) {
    const error = await response.json().catch(() => null) as {
      error?: string
    } | null
    throw new RankingSourceApiError(
      error?.error || `Ranking source API returned ${response.status}`,
      response.status,
    )
  }
  return response.json() as Promise<ResponseBody>
}

export const listRankingSources = (
  options: RankingSourceApiOptions = {},
) => request<RankingSourceListResponse>("/v1/ranking-sources", options)

export const getRankingSource = (
  sourceId: string,
  options: RankingSourceApiOptions = {},
) => request<RankingSourceStatus>(
  `/v1/ranking-sources/${encodeURIComponent(sourceId)}`,
  options,
)

export const previewRankingSourceRefresh = (
  sourceId: string,
  body: RankingSourceRefreshPreviewRequest,
  options: RankingSourceApiOptions = {},
) => request<RankingSourceRefreshPreviewResponse>(
  `/v1/ranking-sources/${encodeURIComponent(sourceId)}/refresh-preview`,
  options,
  {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(body),
  },
)
