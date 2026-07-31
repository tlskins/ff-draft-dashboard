import {
  useEffect,
  useMemo,
  useState,
} from "react"

import {
  PlayerStatusCache,
  PlayerStatusCacheSnapshot,
  PLAYER_STATUS_CACHE_TTL_MS,
} from "../api/playerStatusCache"
import {
  loadPlayerStatus,
  PlayerStatusLoader,
} from "../api/playerStatus"


interface UsePlayerStatusCacheOptions {
  loader?: PlayerStatusLoader
  ttlMs?: number
}

export const usePlayerStatusCache = (
  playerIds: string[],
  {
    loader = loadPlayerStatus,
    ttlMs = PLAYER_STATUS_CACHE_TTL_MS,
  }: UsePlayerStatusCacheOptions = {},
): PlayerStatusCacheSnapshot => {
  const cache = useMemo(
    () => new PlayerStatusCache({ loader, ttlMs }),
    [loader, ttlMs],
  )
  const [entries, setEntries] = useState<PlayerStatusCacheSnapshot>({})
  const playerKey = Array.from(new Set(
    playerIds.map(playerId => playerId.trim()).filter(Boolean),
  )).sort().join("\u001f")

  useEffect(() => {
    let active = true
    const ids = playerKey ? playerKey.split("\u001f") : []

    const load = () => {
      const requests = ids.map(playerId => cache.load(playerId))
      setEntries(cache.snapshot())
      void Promise.all(requests).then(() => {
        if (active) setEntries(cache.snapshot())
      })
    }

    load()
    const refreshTimer = ids.length > 0
      ? window.setInterval(load, ttlMs)
      : null
    return () => {
      active = false
      if (refreshTimer !== null) window.clearInterval(refreshTimer)
    }
  }, [cache, playerKey, ttlMs])

  return entries
}
