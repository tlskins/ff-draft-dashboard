import {
  useEffect,
  useState,
} from "react"

import {
  PlayerStatusCacheSnapshot,
  PLAYER_STATUS_CACHE_TTL_MS,
} from "../api/playerStatusCache"
import {
  loadPlayerStatus,
  PlayerStatusLoader,
} from "../api/playerStatus"
import {useReadApiCache} from "../api/readApiContext"
import type {ReadApiResourceSnapshot} from "../api/readApiCache"


interface UsePlayerStatusCacheOptions {
  loader?: PlayerStatusLoader
  ttlMs?: number
}

const loaderIds = new WeakMap<PlayerStatusLoader, number>()
let nextLoaderId = 1

const loaderId = (loader: PlayerStatusLoader): number => {
  const current = loaderIds.get(loader)
  if (current) return current
  const id = nextLoaderId++
  loaderIds.set(loader, id)
  return id
}

const legacyEntry = (
  playerId: string,
  resource: ReadApiResourceSnapshot<Awaited<ReturnType<PlayerStatusLoader>>>,
) => ({
  playerId,
  state: resource.state === "idle" || resource.state === "loading"
    ? "loading" as const
    : resource.state === "ready" || (resource.data && resource.state === "stale")
      ? "ready" as const
      : "unavailable" as const,
  response: resource.data,
  loadedAt: resource.updatedAt,
  resourceState: resource.state,
  error: resource.error,
  ...(resource.staleReason ? {staleReason: resource.staleReason} : {}),
  ...(resource.unavailableReason
    ? {unavailableReason: resource.unavailableReason}
    : {}),
})

export const usePlayerStatusCache = (
  playerIds: string[],
  {
    loader = loadPlayerStatus,
    ttlMs = PLAYER_STATUS_CACHE_TTL_MS,
  }: UsePlayerStatusCacheOptions = {},
): PlayerStatusCacheSnapshot => {
  const cache = useReadApiCache()
  const [entries, setEntries] = useState<PlayerStatusCacheSnapshot>({})
  const playerKey = Array.from(new Set(
    playerIds.map(playerId => playerId.trim()).filter(Boolean),
  )).sort().join("\u001f")

  useEffect(() => {
    let active = true
    const ids = playerKey ? playerKey.split("\u001f") : []
    const loaderNamespace = loaderId(loader)
    const keyFor = (playerId: string) => (
      `read-api:player-status:${loaderNamespace}:${playerId}`
    )

    const snapshot = (): PlayerStatusCacheSnapshot => Object.fromEntries(
      ids.map(playerId => [
        playerId,
        legacyEntry(playerId, cache.getSnapshot(keyFor(playerId))),
      ]),
    )
    const update = () => {
      if (active) setEntries(snapshot())
    }
    const unsubscribers = ids.map(playerId => (
      cache.subscribe(keyFor(playerId), update)
    ))

    const load = () => {
      const requests = ids.map(playerId => cache.load(
        keyFor(playerId),
        ({signal}) => loader === loadPlayerStatus
          ? loadPlayerStatus(playerId, {signal})
          : loader(playerId),
        {ttlMs},
      ))
      update()
      void Promise.all(requests).then(() => {
        update()
      })
    }

    load()
    const refreshTimer = ids.length > 0
      ? window.setInterval(load, ttlMs)
      : null
    return () => {
      active = false
      unsubscribers.forEach(unsubscribe => unsubscribe())
      if (refreshTimer !== null) window.clearInterval(refreshTimer)
    }
  }, [cache, loader, playerKey, ttlMs])

  return entries
}
