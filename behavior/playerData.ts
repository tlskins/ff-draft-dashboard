import { FantasyPosition, Rankings } from "types";
import ranks from "./playerData.json";
import { toCamelCase } from "./presenters";


export const getEmbeddedPlayerData = (): Rankings => {
  const skiplist = Object.values(FantasyPosition);
  return toCamelCase(ranks, skiplist) as Rankings;
}

interface LoadPlayerDataOptions {
  apiHost?: string
  fetcher?: typeof fetch
}

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1_000

export const rankingsAgeInDays = (
  rankings: Rankings,
  now = Date.now(),
): number | null => {
  const cachedAt = Date.parse(rankings.cachedAt)
  if (Number.isNaN(cachedAt)) {
    return null
  }

  return Math.max(0, (now - cachedAt) / MILLISECONDS_PER_DAY)
}

export const rankingsAreStale = (
  rankings: Rankings,
  maxAgeDays = 14,
  now = Date.now(),
): boolean => {
  const ageInDays = rankingsAgeInDays(rankings, now)
  return ageInDays !== null && ageInDays > maxAgeDays
}

export const loadPlayerData = async ({
  apiHost = process.env.NEXT_PUBLIC_API_HOST,
  fetcher = fetch,
}: LoadPlayerDataOptions = {}): Promise<Rankings> => {
  if (!apiHost) {
    return getEmbeddedPlayerData()
  }

  try {
    const response = await fetcher(
      `${apiHost.replace(/\/$/, "")}/players/latest`,
    )
    if (!response.ok) {
      throw new Error(`Rankings API returned ${response.status}`)
    }

    const rankings = await response.json()
    return toCamelCase(
      rankings,
      Object.values(FantasyPosition),
    ) as Rankings
  } catch (error) {
    console.warn("Using embedded rankings because the API is unavailable", error)
    return getEmbeddedPlayerData()
  }
}
