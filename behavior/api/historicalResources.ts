import {
  HistoricalComparisonResponse,
  LoadHistoricalComparisonOptions,
  loadHistoricalComparison,
} from "./historical"
import {
  AnalysisQuery,
  AnalysisQueryResponse,
  executeHistoricalAnalysis,
} from "./historicalAnalysis"
import {
  ReadApiCache,
  ReadApiResourceSnapshot,
  readApiOutcome,
} from "./readApiCache"


export const HISTORICAL_COMPARISON_TTL_MS = 60 * 60 * 1000
export const HISTORICAL_QUERY_TTL_MS = 60 * 60 * 1000

const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map(key => (
      `${JSON.stringify(key)}:${stableJson(record[key])}`
    )).join(",")}}`
  }
  return JSON.stringify(value)
}

const boundedPlayerIds = (playerIds: string[]): string[] => Array.from(new Set(
  playerIds.map(playerId => playerId.trim()).filter(Boolean),
)).slice(0, 3)

const boundedSeasons = (seasons: number[] | undefined): number[] | undefined => (
  seasons
    ? Array.from(new Set(seasons.filter(Number.isInteger))).sort((a, b) => a - b).slice(-5)
    : undefined
)

export const historicalComparisonResourceKey = (
  options: Pick<
    LoadHistoricalComparisonOptions,
    "playerIds" | "season" | "seasons" | "scoringProfile"
  >,
): string => `read-api:historical-comparison:${stableJson({
  playerIds: boundedPlayerIds(options.playerIds),
  season: options.season,
  seasons: boundedSeasons(options.seasons),
  scoringProfile: options.scoringProfile || "ppr",
})}`

export const historicalQueryResourceKey = (
  query: AnalysisQuery,
): string => `read-api:historical-query:${stableJson(query)}`

const comparisonFingerprint = (
  response: HistoricalComparisonResponse,
): string => stableJson({
  players: response.players.map(player => ({
    id: player.player_id,
    games: player.distribution.games,
    p10: player.distribution.p10,
    p50: player.distribution.p50,
    p90: player.distribution.p90,
    availability: player.availability?.map(item => [
      item.season,
      item.week,
      item.status,
      item.detail,
    ]),
  })),
  seasons: response.seasons,
  scoring: response.scoring_profile.id,
  sources: response.sources.map(source => source.sha256),
  availabilitySources: response.availability_sources?.map(source => source.sha256),
})

export const loadHistoricalComparisonResource = (
  cache: ReadApiCache,
  options: LoadHistoricalComparisonOptions,
  {force = false}: {force?: boolean} = {},
): Promise<ReadApiResourceSnapshot<HistoricalComparisonResponse>> => {
  const playerIds = boundedPlayerIds(options.playerIds)
  const seasons = boundedSeasons(options.seasons)
  const key = historicalComparisonResourceKey({...options, playerIds, seasons})
  return cache.load(key, async ({signal}) => {
    const response = await loadHistoricalComparison({
      ...options,
      playerIds,
      seasons,
      signal,
    })
    return readApiOutcome({
      data: response,
      state: response.players.length > 0 ? "ready" : "unavailable",
      fingerprint: `historical-comparison:${comparisonFingerprint(response)}`,
      ...(response.players.length === 0 ? {
        unavailableReason: "No historical games matched the selected players, seasons, and scoring profile.",
      } : {}),
    })
  }, {force, ttlMs: HISTORICAL_COMPARISON_TTL_MS})
}

export const loadHistoricalQueryResource = (
  cache: ReadApiCache,
  query: AnalysisQuery,
  {force = false}: {force?: boolean} = {},
): Promise<ReadApiResourceSnapshot<AnalysisQueryResponse>> => {
  const key = historicalQueryResourceKey(query)
  return cache.load(key, async ({signal}) => {
    const response = await executeHistoricalAnalysis(query, {signal})
    return readApiOutcome({
      data: response,
      state: response.row_count > 0 ? "ready" : "unavailable",
      fingerprint: `historical-query:${stableJson({
        query: response.query,
        rowCount: response.row_count,
        truncated: response.truncated,
        sources: response.sources.map(source => source.sha256),
      })}`,
      ...(response.row_count === 0 ? {
        unavailableReason: "No historical rows matched the selected query.",
      } : {}),
    })
  }, {force, ttlMs: HISTORICAL_QUERY_TTL_MS})
}
