import type {HistoricalComparisonResponse} from "../api/historical"
import {
  recommendationPlayerStatusEvidence,
} from "../api/playerStatus"
import type {PlayerStatusCacheSnapshot} from "../api/playerStatusCache"
import type {
  RankingSourceListResponse,
} from "../api/rankingSources"
import type {
  ReadApiResourceSnapshot,
  ReadApiResourceState,
} from "../api/readApiCache"
import type {DataReadinessState} from "../api/dataReadiness"
import {ThirdPartyRanker} from "../../types"
import type {FantasySettings, Player} from "../../types"


export interface HistoricalInsightModel {
  state: ReadApiResourceState
  fingerprint: string
  error: string | null
  staleReason?: string
  unavailableReason?: string
  seasons: number[]
  scoringProfile: string | null
  players: HistoricalComparisonResponse["players"]
  riskScore: number
  trendScore: number
}

export interface RankTierDisagreementPlayer {
  id: string
  name: string
  position: string
  minimumRank: number
  maximumRank: number
  rankSpread: number
  ranks: {source: string; rank: number; tier: number | null}[]
}

export interface RankTierDisagreementModel {
  state: "ready" | "unavailable"
  fingerprint: string
  players: RankTierDisagreementPlayer[]
  maximumSpread: number
  unavailableReason?: string
}

export interface PlayerStatusInsightItem {
  player: Player
  state: string
  events: NonNullable<PlayerStatusCacheSnapshot[string]["response"]>["events"]
  reason: string | null
}

export interface PlayerStatusInsightModel {
  state: "ready" | "loading" | "stale" | "unavailable"
  fingerprint: string
  items: PlayerStatusInsightItem[]
  maximumImpact: "material" | "review" | "none"
  unavailableReason?: string
  staleReason?: string
}

export interface SourceReadinessInsightModel {
  state: ReadApiResourceState
  fingerprint: string
  rankingSources: RankingSourceListResponse["sources"]
  statusSources: NonNullable<DataReadinessState["data"]>["status_sources"]
  historicalSeasons: number[]
  rankingsCachedAt: string | null
  error: string | null
  staleReason?: string
  unavailableReason?: string
}

const finitePositiveInteger = (value: unknown): value is number => (
  typeof value === "number" && Number.isInteger(value) && value > 0
)

export const buildHistoricalInsightModel = (
  resource: ReadApiResourceSnapshot<HistoricalComparisonResponse>,
): HistoricalInsightModel => {
  const players = resource.data?.players || []
  const riskScore = players.reduce((maximum, player) => (
    Math.max(maximum, player.distribution.std_dev)
  ), 0)
  const trendScore = players.reduce((maximum, player) => {
    const means = player.season_distributions.map(item => item.distribution.mean)
    return Math.max(maximum, means.length > 1
      ? Math.max(...means) - Math.min(...means)
      : 0)
  }, 0)
  return {
    state: resource.state,
    fingerprint: resource.fingerprint,
    error: resource.error,
    staleReason: resource.staleReason,
    unavailableReason: resource.unavailableReason,
    seasons: resource.data?.seasons || [],
    scoringProfile: resource.data?.scoring_profile.id || null,
    players,
    riskScore,
    trendScore,
  }
}

export const buildRankTierDisagreementModel = (
  players: Player[],
  settings: FantasySettings,
): RankTierDisagreementModel => {
  const publishedSources = new Set<string>([
    ThirdPartyRanker.ESPN,
    ThirdPartyRanker.FPROS,
    ThirdPartyRanker.HARRIS,
    ThirdPartyRanker.CUSTOM,
  ])
  const compared = players.slice(0, 3).flatMap(player => {
    const ranks = Object.entries(player.ranks || {})
      .filter(([source]) => publishedSources.has(source))
      .flatMap(([source, rank]) => {
      const positionRank = settings.ppr
        ? rank?.pprPositionRank
        : rank?.standardPositionRank
      const tier = settings.ppr
        ? rank?.pprPositionTier?.tierNumber
        : rank?.standardPositionTier?.tierNumber
      return finitePositiveInteger(positionRank) ? [{
        source,
        rank: positionRank,
        tier: finitePositiveInteger(tier) ? tier : null,
      }] : []
      }).sort((left, right) => left.rank - right.rank || left.source.localeCompare(right.source))
    if (ranks.length < 2) return []
    const minimumRank = ranks[0].rank
    const maximumRank = ranks[ranks.length - 1].rank
    return [{
      id: player.id,
      name: player.fullName,
      position: player.position,
      minimumRank,
      maximumRank,
      rankSpread: maximumRank - minimumRank,
      ranks,
    }]
  }).sort((left, right) => right.rankSpread - left.rankSpread || left.name.localeCompare(right.name))
  const maximumSpread = compared.reduce((maximum, player) => (
    Math.max(maximum, player.rankSpread)
  ), 0)
  return {
    state: compared.length > 0 ? "ready" : "unavailable",
    fingerprint: `rank-tier-disagreement:${JSON.stringify(compared)}`,
    players: compared,
    maximumSpread,
    ...(compared.length === 0 ? {
      unavailableReason: "The current comparison set does not have two positional ranking sources per player.",
    } : {}),
  }
}

const impactOrder = {none: 0, review: 1, material: 2}

export const buildPlayerStatusInsightModel = (
  players: Player[],
  playerStatus: PlayerStatusCacheSnapshot,
): PlayerStatusInsightModel => {
  const items = players.slice(0, 3).map(player => {
    const entry = playerStatus[player.id]
    const events = recommendationPlayerStatusEvidence(entry?.response?.events || [])
    return {
      player,
      state: entry?.resourceState || entry?.state || "loading",
      events,
      reason: entry?.error || entry?.staleReason || entry?.unavailableReason || null,
    }
  })
  const events = items.flatMap(item => item.events)
  const maximumImpact = events.reduce<"material" | "review" | "none">(
    (current, event) => impactOrder[event.recommendation_impact] > impactOrder[current]
      ? event.recommendation_impact
      : current,
    "none",
  )
  const loading = items.length > 0 && items.every(item => (
    item.state === "idle" || item.state === "loading"
  ))
  const stale = items.some(item => item.state === "stale")
  const state = events.length > 0
    ? stale ? "stale" as const : "ready" as const
    : loading ? "loading" as const : "unavailable" as const
  return {
    state,
    fingerprint: `player-status:${JSON.stringify(items.map(item => ({
      id: item.player.id,
      state: item.state,
      reason: item.reason,
      events: item.events.map(event => ({
        id: event.id,
        impact: event.recommendation_impact,
        summary: event.short_summary,
        stale: event.stale,
        fetchedAt: event.fetched_at,
      })),
    })))}`,
    items,
    maximumImpact,
    ...(state === "unavailable" ? {
      unavailableReason: "No fresh actionable status evidence is published for the current comparison set.",
    } : {}),
    ...(state === "stale" ? {
      staleReason: "At least one displayed player-status source is stale.",
    } : {}),
  }
}

export const buildSourceReadinessInsightModel = (
  rankingSources: ReadApiResourceSnapshot<RankingSourceListResponse>,
  readiness: DataReadinessState,
): SourceReadinessInsightModel => {
  const state = readiness.error
    ? "error" as const
    : rankingSources.state === "idle" || rankingSources.state === "loading"
      || readiness.loading
      ? "loading" as const
      : rankingSources.state
  return {
    state,
    fingerprint: `source-readiness:${JSON.stringify({
      ranking: rankingSources.fingerprint,
      readinessGeneratedAt: readiness.data?.generated_at,
      rankingsCachedAt: readiness.data?.rankings.cached_at,
      status: readiness.data?.status_sources.map(source => [
        source.provider,
        source.dataset,
        source.availability,
        source.freshness,
        source.fingerprint,
      ]),
    })}`,
    rankingSources: rankingSources.data?.sources || [],
    statusSources: readiness.data?.status_sources || [],
    historicalSeasons: readiness.data?.completed_seasons || [],
    rankingsCachedAt: readiness.data?.rankings.cached_at || null,
    error: readiness.error || rankingSources.error,
    staleReason: rankingSources.staleReason,
    unavailableReason: rankingSources.unavailableReason,
  }
}
