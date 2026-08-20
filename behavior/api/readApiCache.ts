export type ReadApiResourceState =
  | "idle"
  | "loading"
  | "ready"
  | "stale"
  | "unavailable"
  | "error"

export interface ReadApiResourceSnapshot<Data> {
  key: string
  state: ReadApiResourceState
  data: Data | null
  error: string | null
  updatedAt: number | null
  expiresAt: number | null
  fingerprint: string
  staleReason?: string
  unavailableReason?: string
}

export interface ReadApiLoadOutcome<Data> {
  kind: "read-api-outcome"
  data: Data | null
  state?: "ready" | "stale" | "unavailable"
  fingerprint?: string
  staleReason?: string
  unavailableReason?: string
}

export interface ReadApiLoaderContext {
  signal: AbortSignal
}

export type ReadApiLoader<Data> = (
  context: ReadApiLoaderContext,
) => Promise<Data | ReadApiLoadOutcome<Data>>

interface PendingRead<Data> {
  controller: AbortController
  generation: number
  promise: Promise<ReadApiResourceSnapshot<Data>>
}

interface ReadApiCacheOptions {
  maxEntries?: number
  now?: () => number
}

interface LoadOptions {
  force?: boolean
  ttlMs: number
}

const isLoadOutcome = <Data>(
  value: Data | ReadApiLoadOutcome<Data>,
): value is ReadApiLoadOutcome<Data> => Boolean(
  value
  && typeof value === "object"
  && "kind" in value
  && (value as ReadApiLoadOutcome<Data>).kind === "read-api-outcome",
)

export const readApiOutcome = <Data>(
  outcome: Omit<ReadApiLoadOutcome<Data>, "kind">,
): ReadApiLoadOutcome<Data> => ({kind: "read-api-outcome", ...outcome})

const errorMessage = (error: unknown): string => (
  error instanceof Error ? error.message : "Read API request failed"
)

const idleSnapshot = <Data>(key: string): ReadApiResourceSnapshot<Data> => ({
  key,
  state: "idle",
  data: null,
  error: null,
  updatedAt: null,
  expiresAt: null,
  fingerprint: `${key}:idle`,
})

/**
 * Shared bounded cache for the public, read-only API. The cache owns request
 * deduplication and response races; endpoint adapters continue to own schema
 * validation and the meaning of stale/unavailable provider evidence.
 */
export class ReadApiCache {
  private readonly maxEntries: number
  private readonly now: () => number
  private readonly entries = new Map<string, ReadApiResourceSnapshot<unknown>>()
  private readonly listeners = new Map<string, Set<() => void>>()
  private readonly pending = new Map<string, PendingRead<unknown>>()
  private readonly generations = new Map<string, number>()

  constructor({maxEntries = 128, now = Date.now}: ReadApiCacheOptions = {}) {
    if (!Number.isInteger(maxEntries) || maxEntries < 1) {
      throw new Error("Read API cache maxEntries must be a positive integer")
    }
    this.maxEntries = maxEntries
    this.now = now
  }

  getSnapshot<Data>(key: string): ReadApiResourceSnapshot<Data> {
    const normalized = key.trim()
    if (!normalized) throw new Error("Read API cache requires a resource key")
    const current = this.entries.get(normalized)
    if (current) return current as ReadApiResourceSnapshot<Data>
    const idle = idleSnapshot<Data>(normalized)
    this.entries.set(normalized, idle)
    this.prune()
    return idle
  }

  subscribe(key: string, listener: () => void): () => void {
    const normalized = key.trim()
    if (!normalized) throw new Error("Read API cache requires a resource key")
    const listeners = this.listeners.get(normalized) || new Set<() => void>()
    listeners.add(listener)
    this.listeners.set(normalized, listeners)
    return () => {
      listeners.delete(listener)
      if (listeners.size === 0) this.listeners.delete(normalized)
    }
  }

  load<Data>(
    key: string,
    loader: ReadApiLoader<Data>,
    {force = false, ttlMs}: LoadOptions,
  ): Promise<ReadApiResourceSnapshot<Data>> {
    const normalized = key.trim()
    if (!normalized) return Promise.reject(
      new Error("Read API cache requires a resource key"),
    )
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) return Promise.reject(
      new Error("Read API cache TTL must be positive"),
    )

    const inFlight = this.pending.get(normalized) as PendingRead<Data> | undefined
    if (inFlight) return inFlight.promise

    const current = this.getSnapshot<Data>(normalized)
    if (
      !force
      && ["ready", "stale", "unavailable", "error"].includes(current.state)
      && current.expiresAt !== null
      && current.expiresAt > this.now()
    ) {
      return Promise.resolve(current)
    }

    const generation = (this.generations.get(normalized) || 0) + 1
    this.generations.set(normalized, generation)
    const controller = new AbortController()
    this.set(normalized, {
      ...current,
      state: current.data === null ? "loading" : "stale",
      error: null,
      staleReason: current.data === null
        ? undefined
        : "Refreshing published API evidence.",
      fingerprint: `${normalized}:${current.data === null ? "loading" : "stale"}:${generation}`,
    })

    const promise = (async (): Promise<ReadApiResourceSnapshot<Data>> => {
      try {
        const loaded = await loader({signal: controller.signal})
        if (this.generations.get(normalized) !== generation) {
          return this.getSnapshot<Data>(normalized)
        }
        const outcome: ReadApiLoadOutcome<Data> = isLoadOutcome(loaded)
          ? loaded
          : {kind: "read-api-outcome", data: loaded, state: "ready"}
        const timestamp = this.now()
        const next: ReadApiResourceSnapshot<Data> = {
          key: normalized,
          state: outcome.state || "ready",
          data: outcome.data,
          error: null,
          updatedAt: timestamp,
          expiresAt: timestamp + ttlMs,
          fingerprint: outcome.fingerprint
            || `${normalized}:${outcome.state || "ready"}:${timestamp}`,
          ...(outcome.staleReason
            ? {staleReason: outcome.staleReason}
            : {}),
          ...(outcome.unavailableReason
            ? {unavailableReason: outcome.unavailableReason}
            : {}),
        }
        this.set(normalized, next)
        return next
      } catch (error) {
        if (this.generations.get(normalized) !== generation) {
          return this.getSnapshot<Data>(normalized)
        }
        const timestamp = this.now()
        const next: ReadApiResourceSnapshot<Data> = {
          ...current,
          key: normalized,
          state: "error",
          error: errorMessage(error),
          updatedAt: timestamp,
          expiresAt: timestamp + ttlMs,
          fingerprint: `${normalized}:error:${timestamp}:${errorMessage(error)}`,
          staleReason: current.data === null
            ? undefined
            : "The last published response is retained after a refresh failure.",
        }
        this.set(normalized, next)
        return next
      } finally {
        const pending = this.pending.get(normalized)
        if (pending?.generation === generation) this.pending.delete(normalized)
      }
    })()

    this.pending.set(normalized, {controller, generation, promise} as PendingRead<unknown>)
    return promise
  }

  invalidate(key: string, reason = "Published API evidence was invalidated."): void {
    const normalized = key.trim()
    if (!normalized) return
    this.abort(normalized)
    const current = this.getSnapshot<unknown>(normalized)
    this.set(normalized, {
      ...current,
      state: "unavailable",
      error: null,
      expiresAt: null,
      fingerprint: `${normalized}:unavailable:${this.generations.get(normalized) || 0}`,
      unavailableReason: reason,
    })
  }

  abort(key: string): void {
    const normalized = key.trim()
    const pending = this.pending.get(normalized)
    this.generations.set(normalized, (this.generations.get(normalized) || 0) + 1)
    pending?.controller.abort()
    this.pending.delete(normalized)
  }

  clear(): void {
    Array.from(this.pending.keys()).forEach(key => this.abort(key))
    const keys = Array.from(this.entries.keys())
    this.entries.clear()
    keys.forEach(key => this.emit(key))
  }

  private set<Data>(key: string, entry: ReadApiResourceSnapshot<Data>): void {
    this.entries.delete(key)
    this.entries.set(key, entry as ReadApiResourceSnapshot<unknown>)
    this.prune()
    this.emit(key)
  }

  private emit(key: string): void {
    this.listeners.get(key)?.forEach(listener => listener())
  }

  private prune(): void {
    if (this.entries.size <= this.maxEntries) return
    for (const key of Array.from(this.entries.keys())) {
      if (this.entries.size <= this.maxEntries) break
      if (this.pending.has(key) || this.listeners.has(key)) continue
      this.entries.delete(key)
    }
  }
}
