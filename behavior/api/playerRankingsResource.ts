import type {Rankings} from "../../types"
import {
  getEmbeddedPlayerData,
  loadPublishedPlayerData,
  type LoadPlayerDataOptions,
  rankingsAgeInDays,
  rankingsAreStale,
} from "../playerData"
import {
  ReadApiCache,
  ReadApiResourceSnapshot,
  readApiOutcome,
} from "./readApiCache"


export const PLAYER_RANKINGS_RESOURCE_KEY = "read-api:player-rankings:latest"
export const PLAYER_RANKINGS_TTL_MS = 60 * 60 * 1000

export const loadPlayerRankingsResource = (
  cache: ReadApiCache,
  {
    force = false,
    ...loadOptions
  }: LoadPlayerDataOptions & {force?: boolean} = {},
): Promise<ReadApiResourceSnapshot<Rankings>> => cache.load(
  PLAYER_RANKINGS_RESOURCE_KEY,
  async ({signal}) => {
    try {
      const rankings = await loadPublishedPlayerData({...loadOptions, signal})
      const stale = rankingsAreStale(rankings)
      return readApiOutcome({
        data: rankings,
        state: stale ? "stale" : "ready",
        fingerprint: `player-rankings:${rankings.season}:${rankings.cachedAt}:${rankings.players.length}`,
        ...(stale ? {
          staleReason: `Published rankings are ${Math.floor(rankingsAgeInDays(rankings) || 0)} days old.`,
        } : {}),
      })
    } catch (error) {
      const embedded = getEmbeddedPlayerData()
      return readApiOutcome({
        data: embedded,
        state: "unavailable",
        fingerprint: `player-rankings:embedded:${embedded.season}:${embedded.cachedAt}:${embedded.players.length}`,
        unavailableReason: error instanceof Error
          ? `${error.message}. Using the embedded rankings snapshot.`
          : "Published rankings are unavailable. Using the embedded rankings snapshot.",
      })
    }
  },
  {force, ttlMs: PLAYER_RANKINGS_TTL_MS},
)
