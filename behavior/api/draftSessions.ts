import type { components as ApiComponents } from "./schema"
import type {
  DraftRecommendationSet,
} from "../draft-advisor/recommendations"
import type { OpponentForecast } from "../draft-advisor/types"


type CanonicalDraftEvent =
  ApiComponents["schemas"]["CanonicalDraftEvent"]
type DraftSessionCreateRequest =
  ApiComponents["schemas"]["DraftSessionCreateRequest"]
type DraftEventBatchRequest =
  ApiComponents["schemas"]["DraftEventBatchRequest"]
type DraftRecommendationSnapshot =
  ApiComponents["schemas"]["DraftRecommendationSnapshot"]
type DraftRecommendationSnapshotResponse =
  ApiComponents["schemas"]["DraftRecommendationSnapshotResponse"]
type OpponentForecastSnapshot =
  ApiComponents["schemas"]["OpponentForecastSnapshot"]
type OpponentForecastSnapshotResponse =
  ApiComponents["schemas"]["OpponentForecastSnapshotResponse"]

interface PersistDraftEventsOptions {
  apiHost?: string
  fetcher?: typeof fetch
}

interface AdvisorSnapshotOptions extends PersistDraftEventsOptions {}

interface PersistAdvisorSnapshotsParams {
  sessionId: string | null
  sourceEventCount: number
  inputFingerprint: string
  recommendations: DraftRecommendationSet
  opponentForecast: OpponentForecast
  generatedAt?: string
}

const request = async (
  url: string,
  body: DraftSessionCreateRequest | DraftEventBatchRequest,
  fetcher: typeof fetch,
): Promise<void> => {
  const response = await fetcher(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    throw new Error(`Draft session API returned ${response.status}`)
  }
}

const jsonRequest = async <Response>(
  url: string,
  method: "GET" | "POST" | "PUT",
  fetcher: typeof fetch,
  body?: unknown,
): Promise<Response> => {
  const response = await fetcher(url, {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  if (!response.ok) {
    throw new Error(`Draft session API returned ${response.status}`)
  }
  return response.json() as Promise<Response>
}

export const persistDraftEvents = async (
  events: CanonicalDraftEvent[],
  {
    apiHost = process.env.NEXT_PUBLIC_API_HOST,
    fetcher,
  }: PersistDraftEventsOptions = {},
): Promise<void> => {
  if (!apiHost || events.length === 0) {
    return
  }

  const resolvedFetcher = fetcher || fetch
  const first = events[0]
  const session: DraftSessionCreateRequest = {
    id: first.draftId,
    platform_draft_id: first.draftId,
    title: first.draftTitle,
    platform: first.platform,
  }
  const host = apiHost.replace(/\/$/, "")
  const sessionPath = encodeURIComponent(first.draftId)

  await request(
    `${host}/v1/draft-sessions`,
    session,
    resolvedFetcher,
  )
  await request(
    `${host}/v1/draft-sessions/${sessionPath}/events`,
    { events },
    resolvedFetcher,
  )
}

const stableSerialize = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) =>
        `${JSON.stringify(key)}:${stableSerialize(child)}`)
      .join(",")}}`
  }
  return JSON.stringify(value)
}

export const createAdvisorInputFingerprint = (
  value: unknown,
): string => {
  const serialized = stableSerialize(value)
  let hash = 0x811c9dc5
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, "0")
}

export const toRecommendationSnapshot = (
  recommendations: DraftRecommendationSet,
  {
    sourceEventCount,
    inputFingerprint,
    generatedAt,
  }: {
    sourceEventCount: number
    inputFingerprint: string
    generatedAt: string
  },
): DraftRecommendationSnapshot => ({
  schema_version: 1,
  calculation_version: "deterministic_advisor_v1",
  source_event_count: sourceEventCount,
  input_fingerprint: inputFingerprint,
  generated_at: generatedAt,
  current_pick: Math.max(1, recommendations.currentPick),
  next_user_pick: recommendations.nextUserPick,
  preferred_view: recommendations.preferredView,
  view_explanation: recommendations.viewExplanation,
  candidates: recommendations.candidates.map(candidate => ({
    player_id: candidate.player.id,
    name: candidate.player.fullName,
    team: candidate.player.team,
    position: candidate.player.position as "QB" | "RB" | "WR" | "TE",
    position_rank: candidate.positionRank,
    score: candidate.score,
    evidence: {
      projected_floor: candidate.evidence.projectedFloor,
      projected_median: candidate.evidence.projectedMedian,
      projected_ceiling: candidate.evidence.projectedCeiling,
      replacement_level: candidate.evidence.replacementLevel,
      points_above_replacement:
        candidate.evidence.pointsAboveReplacement,
      marginal_lineup_points:
        candidate.evidence.marginalLineupPoints,
      bench_utility: candidate.evidence.benchUtility,
      tier_loss_if_deferred:
        candidate.evidence.tierLossIfDeferred,
      survival_probability:
        candidate.evidence.survivalProbability,
      positional_run_probability:
        candidate.evidence.positionalRunProbability,
      tier_boundary_probability:
        candidate.evidence.tierBoundaryProbability,
      user_tier: candidate.evidence.userTier,
      projection_tier: candidate.evidence.projectionTier,
      roster_role: candidate.evidence.rosterRole,
      flags: candidate.evidence.flags,
    },
  })),
})

export const toOpponentForecastSnapshot = (
  forecast: OpponentForecast,
  {
    sourceEventCount,
    inputFingerprint,
    generatedAt,
  }: {
    sourceEventCount: number
    inputFingerprint: string
    generatedAt: string
  },
): OpponentForecastSnapshot => ({
  schema_version: 1,
  calculation_version: "combined_opponent_v1",
  source_event_count: sourceEventCount,
  input_fingerprint: inputFingerprint,
  generated_at: generatedAt,
  model: forecast.model,
  target_roster_index: forecast.targetRosterIndex,
  picks: forecast.picks.map(pick => ({
    overall_pick: pick.overallPick,
    roster_index: pick.rosterIndex,
    position_probabilities: pick.positionProbabilities.map(position => ({
      position: position.position as "QB" | "RB" | "WR" | "TE",
      probability: position.probability,
    })),
    player_probabilities: pick.playerProbabilities.map(player => ({
      player_id: player.playerId,
      name: player.name,
      position: player.position as "QB" | "RB" | "WR" | "TE",
      conditional_probability: player.conditionalProbability,
      overall_probability: player.overallProbability,
    })),
  })),
  run_probabilities: forecast.runProbabilities.map(run => ({
    position: run.position as "QB" | "RB" | "WR" | "TE",
    minimum_picks: run.minimumPicks,
    probability: run.probability,
  })),
  tier_boundary_probabilities:
    forecast.tierBoundaryProbabilities.map(boundary => ({
      position: boundary.position as "QB" | "RB" | "WR" | "TE",
      user_tier: boundary.userTier,
      player_ids: boundary.playerIds,
      probability: boundary.probability,
    })),
})

export const persistAdvisorSnapshots = async (
  {
    sessionId,
    sourceEventCount,
    inputFingerprint,
    recommendations,
    opponentForecast,
    generatedAt = new Date().toISOString(),
  }: PersistAdvisorSnapshotsParams,
  {
    apiHost = process.env.NEXT_PUBLIC_API_HOST,
    fetcher,
  }: AdvisorSnapshotOptions = {},
): Promise<void> => {
  if (!apiHost || !sessionId) return
  const resolvedFetcher = fetcher || fetch
  const host = apiHost.replace(/\/$/, "")
  const sessionPath = encodeURIComponent(sessionId)
  const metadata = {
    sourceEventCount,
    inputFingerprint,
    generatedAt,
  }

  await jsonRequest(
    `${host}/v1/draft-sessions`,
    "POST",
    resolvedFetcher,
    { id: sessionId },
  )
  await Promise.all([
    jsonRequest(
      `${host}/v1/draft-sessions/${sessionPath}/recommendations`,
      "PUT",
      resolvedFetcher,
      toRecommendationSnapshot(recommendations, metadata),
    ),
    jsonRequest(
      `${host}/v1/draft-sessions/${sessionPath}/opponent-forecast`,
      "PUT",
      resolvedFetcher,
      toOpponentForecastSnapshot(opponentForecast, metadata),
    ),
  ])
}

const optionalSnapshot = async <Response>(
  url: string,
  fetcher: typeof fetch,
): Promise<Response | null> => {
  const response = await fetcher(url, { method: "GET" })
  if (response.status === 404) return null
  if (!response.ok) {
    throw new Error(`Draft session API returned ${response.status}`)
  }
  return response.json() as Promise<Response>
}

export const loadAdvisorSnapshots = async (
  sessionId: string,
  {
    apiHost = process.env.NEXT_PUBLIC_API_HOST,
    fetcher,
  }: AdvisorSnapshotOptions = {},
): Promise<{
  recommendations: DraftRecommendationSnapshotResponse | null
  opponentForecast: OpponentForecastSnapshotResponse | null
}> => {
  if (!apiHost) {
    return { recommendations: null, opponentForecast: null }
  }
  const resolvedFetcher = fetcher || fetch
  const host = apiHost.replace(/\/$/, "")
  const sessionPath = encodeURIComponent(sessionId)
  const [recommendations, opponentForecast] = await Promise.all([
    optionalSnapshot<DraftRecommendationSnapshotResponse>(
      `${host}/v1/draft-sessions/${sessionPath}/recommendations`,
      resolvedFetcher,
    ),
    optionalSnapshot<OpponentForecastSnapshotResponse>(
      `${host}/v1/draft-sessions/${sessionPath}/opponent-forecast`,
      resolvedFetcher,
    ),
  ])
  return { recommendations, opponentForecast }
}
