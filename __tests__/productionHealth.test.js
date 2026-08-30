const {runProductionHealth} = require("../scripts/production-health-lib.cjs")
const manifest = require("../public/manifest.json")

const token = "A".repeat(100)
const json = (body, status = 200) => response(JSON.stringify(body), status, "application/json")
const response = (body, status = 200, contentType = "text/html") => ({
  ok: status >= 200 && status < 300,
  status,
  headers: {get: name => name.toLowerCase() === "content-type" ? contentType : null},
  text: async () => body,
})

const fixtures = overrides => async input => {
  const url = new URL(input)
  const key = `${url.origin}${url.pathname}${url.search}`
  if (overrides?.[key]) return overrides[key]
  if (url.origin === "https://drafty.example") {
    if (url.pathname === "/") return response(`<title>Drafty</title><meta http-equiv="origin-trial" content="${token}">`)
    if (url.pathname === "/manifest.json") return json(manifest)
    if (url.pathname === "/extension-privacy") return response('Chrome Web Store User Data Policy Limited Use requirements <a href="/extension-support">Support</a>')
    if (url.pathname === "/extension-support") return response('<a href="/extension-privacy">Privacy</a>')
  }
  if (url.pathname === "/health") return json({
    status: "ok", rankings_source: "gcs", rankings_active_source: "gcs_cache",
    rankings_source_error: null, rankings_season: 2026, player_count: 455,
    rankings_cached_at: "2026-08-29T12:00:00Z",
  })
  if (url.pathname === "/v1/data-readiness") return json({
    current_fantasy_season: 2026,
    completed_seasons: [2021, 2022, 2023, 2024, 2025],
    imported_weekly_seasons: [2021, 2022, 2023, 2024, 2025]
      .map(season => ({season, classification: "completed"})),
    rankings: {season: 2026, player_count: 455},
    status_sources: [{provider: "nflverse", dataset: "injuries", availability: "unavailable", freshness: "unknown", reason: "not published"}],
  })
  if (url.pathname === "/v1/ranking-sources") return json({sources: [
    {id: "harris", availability: "available", season: 2026, record_count: 246, is_stale: false, tier_method: "derived"},
    {id: "fantasypros", availability: "available", season: 2026, record_count: 391, is_stale: false, tier_method: "derived"},
  ]})
  if (url.pathname.startsWith("/v1/me/")) return json({code: "authentication_required"}, 401)
  return response("not found", 404)
}

const options = overrides => ({
  dashboardBaseUrl: "https://drafty.example",
  apiBaseUrl: "https://api.example",
  expectedManifest: manifest,
  fetchImpl: fixtures(overrides),
  now: Date.parse("2026-08-30T12:00:00Z"),
})

describe("consolidated production health", () => {
  it("passes the public release boundary while preserving status warnings", async () => {
    const report = await runProductionHealth(options())
    expect(report.overall).toBe("passed")
    expect(report.gates).toHaveLength(6)
    expect(report.warnings).toEqual([expect.objectContaining({dataset: "injuries"})])
    expect(JSON.stringify(report)).not.toContain(token)
  })

  it("fails stale rankings, missing source tiers, auth leakage, and duplicate trial tags", async () => {
    const report = await runProductionHealth(options({
      "https://drafty.example/": response(`<title>Drafty</title><meta http-equiv="origin-trial" content="${token}"><meta http-equiv="origin-trial" content="${token}">`),
      "https://api.example/health": json({status: "ok", rankings_source: "gcs", rankings_active_source: "gcs", rankings_source_error: null, rankings_season: 2026, player_count: 455, rankings_cached_at: "2026-08-01T00:00:00Z"}),
      "https://api.example/v1/ranking-sources": json({sources: [
        {id: "harris", availability: "available", season: 2026, record_count: 246, is_stale: false, tier_method: null},
      ]}),
      "https://api.example/v1/me/mock-drafts?season=2026": json({mocks: []}, 200),
    }))
    expect(report.overall).toBe("failed")
    expect(report.gates.filter(item => item.status === "failed").map(item => item.name))
      .toEqual(expect.arrayContaining([
        "webmcp-origin-trial-boundary",
        "read-api-health-and-freshness",
        "required-ranking-sources",
        "authenticated-boundaries-fail-closed",
      ]))
  })

  it("refuses non-HTTPS production origins", async () => {
    await expect(runProductionHealth({...options(), apiBaseUrl: "http://api.example"}))
      .rejects.toThrow("must use HTTPS")
  })

  it("warns before origin-trial expiry and fails after it", async () => {
    const warning = await runProductionHealth({
      ...options(),
      now: Date.parse("2026-11-01T00:00:00Z"),
    })
    expect(warning.overall).toBe("failed")
    expect(warning.warnings).toContainEqual(expect.objectContaining({
      kind: "webmcp_origin_trial_renewal",
    }))

    const expired = await runProductionHealth({
      ...options(),
      now: Date.parse("2026-11-17T00:00:00Z"),
    })
    expect(expired.gates.find(item => item.name === "webmcp-origin-trial-boundary"))
      .toMatchObject({status: "failed"})
  })
})
