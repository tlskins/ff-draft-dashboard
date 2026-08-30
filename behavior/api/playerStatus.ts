import type { components as ApiComponents } from "./schema"


export type PlayerStatusType =
  ApiComponents["schemas"]["PlayerStatusType"]
export type PlayerStatusImpact =
  ApiComponents["schemas"]["PlayerStatusImpact"]
export type PlayerStatusEvent =
  ApiComponents["schemas"]["PlayerStatusEvent"]
export type PlayerStatusResponse =
  ApiComponents["schemas"]["PlayerStatusResponse"]

interface LoadPlayerStatusOptions {
  limit?: number
  apiHost?: string
  fetcher?: typeof fetch
  signal?: AbortSignal
}

export type PlayerStatusLoader = (
  playerId: string,
) => Promise<PlayerStatusResponse>

const PLAYER_STATUS_SOURCE_LABELS: Record<string, string> = {
  espn_profile_news: "ESPN player news",
  espn_fantasy_status: "ESPN fantasy status",
  nflverse_injuries: "nflverse injury report",
  nflverse_weekly_rosters: "nflverse weekly roster",
  nflverse_trades: "nflverse trade ledger",
}

export const playerStatusSourceLabel = (source: string): string =>
  PLAYER_STATUS_SOURCE_LABELS[source] || source

export const loadPlayerStatus = async (
  playerId: string,
  {
    limit = 20,
    apiHost = process.env.NEXT_PUBLIC_API_HOST,
    fetcher,
    signal,
  }: LoadPlayerStatusOptions = {},
): Promise<PlayerStatusResponse> => {
  const resolvedPlayerId = playerId.trim()
  if (!resolvedPlayerId) {
    throw new Error("Player status requires a player ID")
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new Error("Player status limit must be between 1 and 50")
  }
  if (!apiHost) {
    throw new Error("Player status API is not configured")
  }
  const params = new URLSearchParams({ limit: String(limit) })
  const request = fetcher || fetch
  const url = `${apiHost.replace(/\/$/, "")}/v1/players/${
    encodeURIComponent(resolvedPlayerId)
  }/status?${params}`
  const response = signal
    ? await request(url, {signal})
    : await request(url)
  if (!response.ok) {
    throw new Error(`Player status API returned ${response.status}`)
  }
  return response.json() as Promise<PlayerStatusResponse>
}

export const currentPlayerStatus = (
  events: PlayerStatusEvent[],
): PlayerStatusEvent[] => {
  const latestByChannel = new Map<string, PlayerStatusEvent>()
  events.forEach(event => {
    const channel = `${event.type}:${event.source}`
    const current = latestByChannel.get(channel)
    if (!current || event.fetched_at > current.fetched_at) {
      latestByChannel.set(channel, event)
    }
  })
  return Array.from(latestByChannel.values()).sort((left, right) =>
    right.fetched_at.localeCompare(left.fetched_at))
}

export const actionablePlayerStatus = (
  events: PlayerStatusEvent[],
): PlayerStatusEvent[] => currentPlayerStatus(events).filter(event =>
  !event.stale && event.recommendation_impact !== "none")

const impactPriority: Record<PlayerStatusImpact, number> = {
  none: 0,
  review: 1,
  material: 2,
}

export const recommendationPlayerStatusEvidence = (
  events: PlayerStatusEvent[],
): PlayerStatusEvent[] => [...actionablePlayerStatus(events)]
  .sort((left, right) =>
    impactPriority[right.recommendation_impact]
    - impactPriority[left.recommendation_impact]
    || right.fetched_at.localeCompare(left.fetched_at))
  .slice(0, 2)
