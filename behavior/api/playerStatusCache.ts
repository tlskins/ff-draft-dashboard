import {
  loadPlayerStatus,
  PlayerStatusLoader,
  PlayerStatusResponse,
} from "./playerStatus"


export const PLAYER_STATUS_CACHE_TTL_MS = 5 * 60 * 1000

export type PlayerStatusCacheState =
  | "loading"
  | "ready"
  | "unavailable"

export interface PlayerStatusCacheEntry {
  playerId: string
  state: PlayerStatusCacheState
  response: PlayerStatusResponse | null
  loadedAt: number | null
  /** Full shared-resource provenance retained alongside the legacy state. */
  resourceState?: "idle" | "loading" | "ready" | "stale" | "unavailable" | "error"
  error?: string | null
  staleReason?: string
  unavailableReason?: string
}

export type PlayerStatusCacheSnapshot = Record<
  string,
  PlayerStatusCacheEntry
>

interface PlayerStatusCacheOptions {
  loader?: PlayerStatusLoader
  ttlMs?: number
  now?: () => number
}

export class PlayerStatusCache {
  private readonly loader: PlayerStatusLoader
  private readonly ttlMs: number
  private readonly now: () => number
  private readonly entries = new Map<string, PlayerStatusCacheEntry>()
  private readonly pending = new Map<
    string,
    Promise<PlayerStatusCacheEntry>
  >()

  constructor({
    loader = loadPlayerStatus,
    ttlMs = PLAYER_STATUS_CACHE_TTL_MS,
    now = Date.now,
  }: PlayerStatusCacheOptions = {}) {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      throw new Error("Player status cache TTL must be positive")
    }
    this.loader = loader
    this.ttlMs = ttlMs
    this.now = now
  }

  peek(playerId: string): PlayerStatusCacheEntry | undefined {
    return this.entries.get(playerId.trim())
  }

  snapshot(): PlayerStatusCacheSnapshot {
    return Object.fromEntries(this.entries)
  }

  load(
    playerId: string,
    { force = false }: { force?: boolean } = {},
  ): Promise<PlayerStatusCacheEntry> {
    const resolvedPlayerId = playerId.trim()
    if (!resolvedPlayerId) {
      return Promise.reject(
        new Error("Player status cache requires a player ID"),
      )
    }
    const pending = this.pending.get(resolvedPlayerId)
    if (pending) return pending

    const current = this.entries.get(resolvedPlayerId)
    if (
      !force
      && current
      && current.loadedAt !== null
      && this.now() - current.loadedAt < this.ttlMs
    ) {
      return Promise.resolve(current)
    }

    this.entries.set(resolvedPlayerId, {
      playerId: resolvedPlayerId,
      state: "loading",
      response: null,
      loadedAt: null,
    })
    const request = (async (): Promise<PlayerStatusCacheEntry> => {
      try {
        const response = await this.loader(resolvedPlayerId)
        const entry: PlayerStatusCacheEntry = {
          playerId: resolvedPlayerId,
          state: "ready",
          response,
          loadedAt: this.now(),
        }
        this.entries.set(resolvedPlayerId, entry)
        return entry
      } catch {
        const entry: PlayerStatusCacheEntry = {
          playerId: resolvedPlayerId,
          state: "unavailable",
          response: null,
          loadedAt: this.now(),
        }
        this.entries.set(resolvedPlayerId, entry)
        return entry
      } finally {
        this.pending.delete(resolvedPlayerId)
      }
    })()
    this.pending.set(resolvedPlayerId, request)
    return request
  }
}
