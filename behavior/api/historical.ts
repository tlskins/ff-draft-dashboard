import type { components as ApiComponents } from "./schema"


export type HistoricalComparisonResponse =
  ApiComponents["schemas"]["HistoricalComparisonResponse"]
export type ScoringProfileId =
  ApiComponents["schemas"]["ScoringProfileId"]

interface LoadHistoricalComparisonOptions {
  playerIds: string[]
  season?: number
  seasons?: number[]
  scoringProfile?: ScoringProfileId
  apiHost?: string
  fetcher?: typeof fetch
}

export const loadHistoricalComparison = async ({
  playerIds,
  season = 2025,
  seasons,
  scoringProfile = "ppr",
  apiHost = process.env.NEXT_PUBLIC_API_HOST,
  fetcher,
}: LoadHistoricalComparisonOptions): Promise<
  HistoricalComparisonResponse
> => {
  if (!apiHost) {
    throw new Error("Historical API is not configured")
  }
  const params = new URLSearchParams({
    player_ids: playerIds.join(","),
    scoring_profile: scoringProfile,
  })
  if (seasons?.length) {
    params.set("seasons", seasons.join(","))
  } else {
    params.set("season", String(season))
  }
  const response = await (fetcher || fetch)(
    `${apiHost.replace(/\/$/, "")}/v1/historical/comparison?${params}`,
  )
  if (!response.ok) {
    throw new Error(
      `Historical comparison API returned ${response.status}`,
    )
  }
  return response.json() as Promise<HistoricalComparisonResponse>
}
