const {runProductionSmoke} = require("./extension-production-smoke-lib.cjs")

const DEFAULT_REQUIRED_SOURCES = ["harris", "fantasypros"]
const ORIGIN_TRIAL_TOKEN = /^[A-Za-z0-9+/_=-]{80,4096}$/

const canonicalOrigin = (value, label) => {
  const url = new URL(value)
  if (url.protocol !== "https:") throw new Error(`${label} must use HTTPS`)
  return url.origin
}

const responseText = async (fetchImpl, url) => {
  const response = await fetchImpl(url)
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`)
  return response.text()
}

const responseJson = async (fetchImpl, url) => JSON.parse(await responseText(fetchImpl, url))

const originTrialEvidence = html => {
  const tags = html.match(/<meta\b[^>]*>/gi) || []
  const trialTags = tags.filter(tag => /http-equiv\s*=\s*["']origin-trial["']/i.test(tag))
  const tokens = trialTags.map(tag => tag.match(/content\s*=\s*["']([^"']+)["']/i)?.[1]?.trim() || "")
  return {count: tokens.length, shape_valid: tokens.length === 1 && ORIGIN_TRIAL_TOKEN.test(tokens[0])}
}

const gate = (name, passed, evidence, error) => ({
  name,
  status: passed ? "passed" : "failed",
  evidence,
  ...(error ? {error} : {}),
})

const runProductionHealth = async ({
  dashboardBaseUrl,
  apiBaseUrl,
  expectedManifest,
  fetchImpl,
  expectedSeason = 2026,
  expectedCompletedSeasons = [2021, 2022, 2023, 2024, 2025],
  requiredSources = DEFAULT_REQUIRED_SOURCES,
  maximumRankingAgeHours = 72,
  now = Date.now(),
}) => {
  const dashboardOrigin = canonicalOrigin(dashboardBaseUrl, "Dashboard production origin")
  const apiOrigin = canonicalOrigin(apiBaseUrl, "API production origin")
  const gates = []
  const warnings = []

  const settleGate = async (name, work) => {
    try {
      const result = await work()
      gates.push(gate(name, result.passed, result.evidence, result.error))
    } catch (error) {
      gates.push(gate(name, false, null, error instanceof Error ? error.message : String(error)))
    }
  }

  await Promise.all([
    settleGate("extension-and-public-policy-boundary", async () => ({
      passed: true,
      evidence: await runProductionSmoke({
        baseUrl: dashboardOrigin,
        expectedManifest,
        fetchImpl,
      }),
    })),
    settleGate("webmcp-origin-trial-boundary", async () => {
      const html = await responseText(fetchImpl, `${dashboardOrigin}/`)
      const evidence = originTrialEvidence(html)
      return {passed: evidence.count === 1 && evidence.shape_valid, evidence}
    }),
    settleGate("read-api-health-and-freshness", async () => {
      const health = await responseJson(fetchImpl, `${apiOrigin}/health`)
      const cachedAt = Date.parse(health.rankings_cached_at)
      const ageHours = Number.isFinite(cachedAt) ? (now - cachedAt) / 3_600_000 : null
      const passed = health.status === "ok"
        && health.rankings_season === expectedSeason
        && Number.isInteger(health.player_count)
        && health.player_count > 0
        && ageHours !== null
        && ageHours >= 0
        && ageHours <= maximumRankingAgeHours
      return {passed, evidence: {
        status: health.status,
        rankings_season: health.rankings_season,
        player_count: health.player_count,
        rankings_cached_at: health.rankings_cached_at,
        ranking_age_hours: ageHours === null ? null : Number(ageHours.toFixed(2)),
        maximum_ranking_age_hours: maximumRankingAgeHours,
      }}
    }),
    settleGate("readiness-and-historical-window", async () => {
      const readiness = await responseJson(fetchImpl, `${apiOrigin}/v1/data-readiness`)
      const completed = [...(readiness.completed_seasons || [])].sort((left, right) => left - right)
      const importedCompleted = (readiness.imported_weekly_seasons || [])
        .filter(item => item.classification === "completed")
        .map(item => item.season)
        .sort((left, right) => left - right)
      for (const source of readiness.status_sources || []) {
        if (source.availability !== "available" || source.freshness !== "fresh") {
          warnings.push({
            kind: "status_source",
            provider: source.provider,
            dataset: source.dataset,
            availability: source.availability,
            freshness: source.freshness,
            reason: source.reason,
          })
        }
      }
      const passed = readiness.current_fantasy_season === expectedSeason
        && readiness.rankings?.season === expectedSeason
        && JSON.stringify(completed) === JSON.stringify(expectedCompletedSeasons)
        && JSON.stringify(importedCompleted) === JSON.stringify(expectedCompletedSeasons)
      return {passed, evidence: {
        current_fantasy_season: readiness.current_fantasy_season,
        rankings_season: readiness.rankings?.season,
        rankings_player_count: readiness.rankings?.player_count,
        completed_seasons: completed,
        imported_completed_seasons: importedCompleted,
        status_source_warning_count: warnings.length,
      }}
    }),
    settleGate("required-ranking-sources", async () => {
      const response = await responseJson(fetchImpl, `${apiOrigin}/v1/ranking-sources`)
      const evidence = requiredSources.map(sourceId => {
        const source = response.sources?.find(candidate => candidate.id === sourceId)
        return {
          id: sourceId,
          availability: source?.availability || "missing",
          season: source?.season ?? null,
          record_count: source?.record_count ?? null,
          is_stale: source?.is_stale ?? null,
          tier_method: source?.tier_method ?? null,
        }
      })
      return {passed: evidence.every(source => (
        source.availability === "available"
        && source.season === expectedSeason
        && Number.isInteger(source.record_count)
        && source.record_count > 0
        && source.is_stale === false
        && typeof source.tier_method === "string"
        && source.tier_method.length > 0
      )), evidence}
    }),
    settleGate("authenticated-boundaries-fail-closed", async () => {
      const paths = [
        `/v1/me/draft-profile?season=${expectedSeason}`,
        `/v1/me/mock-drafts?season=${expectedSeason}`,
      ]
      const evidence = await Promise.all(paths.map(async path => {
        const response = await fetchImpl(`${apiOrigin}${path}`)
        return {path, status: response.status}
      }))
      return {passed: evidence.every(item => item.status === 401), evidence}
    }),
  ])
  gates.sort((left, right) => left.name.localeCompare(right.name))
  return {
    report_version: 1,
    kind: "drafty-production-health",
    overall: gates.every(item => item.status === "passed") ? "passed" : "failed",
    inputs: {
      dashboard_origin: dashboardOrigin,
      api_origin: apiOrigin,
      expected_season: expectedSeason,
      expected_completed_seasons: expectedCompletedSeasons,
      required_ranking_sources: requiredSources,
    },
    gates,
    warnings,
    limitations: [
      "This report performs only unauthenticated reads and cannot validate signed-in cross-device state.",
      "Status-source warnings remain visible but do not fail the rankings/history release boundary.",
      "Origin-trial evidence verifies one bounded public token shape; Chrome remains the expiry and feature-activation authority.",
    ],
  }
}

module.exports = {originTrialEvidence, runProductionHealth}
