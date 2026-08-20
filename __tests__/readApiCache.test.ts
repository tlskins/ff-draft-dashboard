import {
  ReadApiCache,
  readApiOutcome,
} from "../behavior/api/readApiCache"


const deferred = <Value,>() => {
  let resolve!: (value: Value) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return {promise, reject, resolve}
}

describe("shared read API cache", () => {
  it("deduplicates concurrent requests and reuses a fresh response", async () => {
    let now = 100
    const cache = new ReadApiCache({now: () => now})
    const response = deferred<{value: number}>()
    const loader = jest.fn(() => response.promise)

    const first = cache.load("readiness", loader, {ttlMs: 50})
    const second = cache.load("readiness", loader, {ttlMs: 50})
    expect(first).toBe(second)
    expect(loader).toHaveBeenCalledTimes(1)
    expect(cache.getSnapshot("readiness").state).toBe("loading")

    response.resolve({value: 7})
    await expect(first).resolves.toMatchObject({
      data: {value: 7},
      state: "ready",
      updatedAt: 100,
      expiresAt: 150,
    })

    now = 120
    await cache.load("readiness", loader, {ttlMs: 50})
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it("retains matching stale data while a refresh is in flight", async () => {
    let now = 10
    const cache = new ReadApiCache({now: () => now})
    await cache.load("history:a", async () => ({version: 1}), {ttlMs: 5})
    now = 20
    const refresh = deferred<{version: number}>()
    const request = cache.load("history:a", () => refresh.promise, {ttlMs: 5})

    expect(cache.getSnapshot("history:a")).toMatchObject({
      state: "stale",
      data: {version: 1},
      staleReason: "Refreshing published API evidence.",
    })
    refresh.resolve({version: 2})
    await expect(request).resolves.toMatchObject({
      state: "ready",
      data: {version: 2},
    })
  })

  it("prevents an invalidated obsolete response from becoming current", async () => {
    const cache = new ReadApiCache()
    const response = deferred<{value: string}>()
    const request = cache.load(
      "comparison:a",
      () => response.promise,
      {ttlMs: 100},
    )
    cache.invalidate("comparison:a", "The selected player set changed.")
    response.resolve({value: "obsolete"})
    await request

    expect(cache.getSnapshot("comparison:a")).toMatchObject({
      state: "unavailable",
      data: null,
      unavailableReason: "The selected player set changed.",
    })
  })

  it("preserves explicit provider provenance", async () => {
    const cache = new ReadApiCache({now: () => 500})
    await cache.load("ranking-sources", async () => readApiOutcome({
      data: {sources: []},
      state: "unavailable",
      fingerprint: "ranking-sources:none",
      unavailableReason: "No published source manifests are available.",
    }), {ttlMs: 100})

    expect(cache.getSnapshot("ranking-sources")).toEqual({
      key: "ranking-sources",
      state: "unavailable",
      data: {sources: []},
      error: null,
      updatedAt: 500,
      expiresAt: 600,
      fingerprint: "ranking-sources:none",
      unavailableReason: "No published source manifests are available.",
    })

    const loader = jest.fn(async () => ({sources: ["unexpected"]}))
    await cache.load("ranking-sources", loader, {ttlMs: 100})
    expect(loader).not.toHaveBeenCalled()
  })

  it("retains the last matching payload with an explicit error state", async () => {
    let now = 1
    const cache = new ReadApiCache({now: () => now})
    await cache.load("status:1", async () => ({events: ["ready"]}), {ttlMs: 1})
    now = 3
    await cache.load("status:1", async () => {
      throw new Error("provider timeout")
    }, {ttlMs: 10})

    expect(cache.getSnapshot("status:1")).toMatchObject({
      state: "error",
      data: {events: ["ready"]},
      error: "provider timeout",
      staleReason: "The last published response is retained after a refresh failure.",
    })
  })
})
