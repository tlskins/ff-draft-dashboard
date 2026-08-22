import type {components as ApiComponents} from "./schema"
import {useCallback} from "react"
import {useReadApiResource} from "./readApiContext"
import {
  readApiOutcome,
  type ReadApiLoader,
  type ReadApiResourceSnapshot,
} from "./readApiCache"


export type RankingSourceStatus =
  ApiComponents["schemas"]["RankingSourceStatus"]
export type RankingSourceListResponse =
  ApiComponents["schemas"]["RankingSourceListResponse"]
export type RankingSourceRefreshPreviewRequest =
  ApiComponents["schemas"]["RankingSourceRefreshPreviewRequest"]
export type RankingSourceRefreshPreviewResponse =
  ApiComponents["schemas"]["RankingSourceRefreshPreviewResponse"]

export const RANKING_SOURCES_RESOURCE_KEY = "read-api:ranking-sources:v1"
export const RANKING_SOURCES_TTL_MS = 30 * 60 * 1000

interface RankingSourceApiOptions {
  apiHost?: string
  fetcher?: typeof fetch
  signal?: AbortSignal
}

export class RankingSourceApiError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message)
    this.name = "RankingSourceApiError"
  }
}

const request = async <ResponseBody>(
  path: string,
  {apiHost = process.env.NEXT_PUBLIC_API_HOST, fetcher, signal}: RankingSourceApiOptions,
  init?: RequestInit,
): Promise<ResponseBody> => {
  if (!apiHost) {
    throw new RankingSourceApiError("Ranking source API is not configured")
  }
  const response = await (fetcher || fetch)(
    `${apiHost.replace(/\/$/, "")}${path}`,
    signal ? {...init, signal} : init,
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

const rankingSourcesLoader: ReadApiLoader<RankingSourceListResponse> = async (
  {signal},
) => {
  const response = await listRankingSources({signal})
  const sourceFingerprint = response.sources.map(source => [
    source.id,
    source.availability,
    source.metadata_status,
    source.storage_transport,
    source.is_stale,
    source.fingerprint,
    source.retrieved_at,
    source.record_count,
    source.failure_reason,
    source.source_updated_at,
    source.tier_method,
    source.ranker,
    source.catalog_status,
    source.ingestion_mode,
    source.scoring_formats,
    source.tier_policy,
    source.source_url,
    source.source_native_tier_count,
  ])
  if (
    response.sources.length === 0
    || response.sources.every(source => source.availability === "unavailable")
  ) {
    return readApiOutcome({
      data: response,
      state: "unavailable",
      fingerprint: `ranking-sources:${JSON.stringify(sourceFingerprint)}`,
      unavailableReason: response.sources.length === 0
        ? "No ranking sources are configured in the published API."
        : "Ranking source freshness metadata has not been recorded yet.",
    })
  }
  const staleSources = response.sources.filter(source => (
    source.availability === "stale" || source.is_stale
  ))
  return readApiOutcome({
    data: response,
    state: staleSources.length > 0 ? "stale" : "ready",
    fingerprint: `ranking-sources:${JSON.stringify(sourceFingerprint)}`,
    ...(staleSources.length > 0 ? {
      staleReason: `${staleSources.map(source => source.provider_name).join(", ")} source metadata is stale.`,
    } : {}),
  })
}

export const useRankingSources = (): ReadApiResourceSnapshot<RankingSourceListResponse> => {
  const configured = Boolean(process.env.NEXT_PUBLIC_API_HOST)
  const resource = useReadApiResource({
    enabled: configured,
    key: RANKING_SOURCES_RESOURCE_KEY,
    loader: rankingSourcesLoader,
    ttlMs: RANKING_SOURCES_TTL_MS,
  })
  return configured ? resource : {
    ...resource,
    state: "unavailable",
    fingerprint: `${RANKING_SOURCES_RESOURCE_KEY}:unavailable:not-configured`,
    unavailableReason: "Ranking source API is not configured.",
  }
}

export const useRankingSourceDetail = (
  sourceId: string,
  enabled: boolean,
): ReadApiResourceSnapshot<RankingSourceStatus> => {
  const configured = Boolean(process.env.NEXT_PUBLIC_API_HOST)
  const key = `read-api:ranking-source:${sourceId || "unselected"}`
  const loader = useCallback<ReadApiLoader<RankingSourceStatus>>(async ({signal}) => {
    const source = await getRankingSource(sourceId, {signal})
    return readApiOutcome({
      data: source,
      state: source.availability === "available"
        ? "ready"
        : source.availability === "stale" || source.is_stale
          ? "stale"
          : "unavailable",
      fingerprint: `ranking-source:${JSON.stringify([
        source.id,
        source.availability,
        source.metadata_status,
        source.storage_transport,
        source.fingerprint,
        source.retrieved_at,
        source.record_count,
        source.failure_reason,
        source.source_updated_at,
        source.tier_method,
        source.ranker,
        source.catalog_status,
        source.ingestion_mode,
        source.scoring_formats,
        source.tier_policy,
        source.source_url,
        source.source_native_tier_count,
      ])}`,
      ...(source.availability === "stale" || source.is_stale ? {
        staleReason: `${source.provider_name} source metadata is stale.`,
      } : {}),
      ...(source.availability === "unavailable" ? {
        unavailableReason: source.failure_reason
          || `${source.provider_name} freshness metadata has not been recorded.`,
      } : {}),
    })
  }, [sourceId])
  const resource = useReadApiResource({
    enabled: configured && enabled && Boolean(sourceId),
    key,
    loader,
    ttlMs: RANKING_SOURCES_TTL_MS,
  })
  return configured ? resource : {
    ...resource,
    state: "unavailable",
    fingerprint: `${key}:unavailable:not-configured`,
    unavailableReason: "Ranking source API is not configured.",
  }
}
