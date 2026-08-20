import type { components as ApiComponents } from "./schema"


export type HistoricalComparisonResponse =
  ApiComponents["schemas"]["HistoricalComparisonResponse"]
export type ScoringProfileId =
  ApiComponents["schemas"]["ScoringProfileId"]

export interface LoadHistoricalComparisonOptions {
  playerIds: string[]
  season?: number
  seasons?: number[]
  scoringProfile?: ScoringProfileId
  apiHost?: string
  fetcher?: typeof fetch
  signal?: AbortSignal
}

export const loadHistoricalComparison = async ({
  playerIds,
  season,
  seasons,
  scoringProfile = "ppr",
  apiHost = process.env.NEXT_PUBLIC_API_HOST,
  fetcher,
  signal,
}: LoadHistoricalComparisonOptions): Promise<
  HistoricalComparisonResponse
> => {
  if (!apiHost) {
    throw new Error("Historical API is not configured")
  }
  if (!seasons?.length && season === undefined) {
    throw new Error("Historical seasons are unavailable")
  }
  const params = new URLSearchParams({
    player_ids: playerIds.join(","),
    scoring_profile: scoringProfile,
  })
  if (seasons?.length) {
    params.set("seasons", seasons.join(","))
  } else if (season !== undefined) {
    params.set("season", String(season))
  }
  const request = fetcher || fetch
  const url = `${apiHost.replace(/\/$/, "")}/v1/historical/comparison?${params}`
  const response = signal
    ? await request(url, {signal})
    : await request(url)
  if (!response.ok) {
    throw new Error(
      `Historical comparison API returned ${response.status}`,
    )
  }
  return response.json() as Promise<HistoricalComparisonResponse>
}
