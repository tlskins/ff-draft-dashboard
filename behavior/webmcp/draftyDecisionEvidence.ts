import type {
  BoardSettings,
  FantasyPosition,
  FantasySettings,
  Player,
  PlayerTarget,
} from "../../types"
import {getPlayerMetrics, type PlayerLibrary} from "../draft"
import type {
  DraftRecommendationCandidate,
  DraftRecommendationSet,
} from "../draft-advisor/recommendations"
import type {
  DraftAdvisorContext,
  OpponentForecast,
} from "../draft-advisor/types"
import type {RoundMarketPresentationModel} from "../analysis/roundMarket"
import type {PlayerStatusCacheEntry} from "../api/playerStatusCache"
import {currentPlayerStatus} from "../api/playerStatus"
import {profileNoteAnalysts, profileNotes} from "../playerProfileNotes"
import {scoringFormatFor} from "../scoringFormat"

const POSITIONS = ["QB", "RB", "WR", "TE"] as const
const bounded = (value: string | null | undefined, max = 220): string | null => {
  const text = value?.replace(/\s+/g, " ").trim()
  if (!text) return null
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`
}

const finite = (value: unknown): number | null => (
  typeof value === "number" && Number.isFinite(value) ? value : null
)

const candidateEvidence = (candidate: DraftRecommendationCandidate) => ({
  player_id: candidate.player.id,
  name: candidate.player.fullName,
  team: String(candidate.player.team),
  position: candidate.player.position,
  position_rank: candidate.positionRank,
  recommendation_score: Number(candidate.score.toFixed(3)),
  projection: {
    floor: finite(candidate.evidence.projectedFloor),
    median: finite(candidate.evidence.projectedMedian),
    ceiling: finite(candidate.evidence.projectedCeiling),
    points_above_replacement: finite(candidate.evidence.pointsAboveReplacement),
    marginal_lineup_points: finite(candidate.evidence.marginalLineupPoints),
  },
  market: {
    survival_probability: finite(candidate.evidence.survivalProbability),
    positional_run_probability: finite(candidate.evidence.positionalRunProbability),
    tier_boundary_probability: finite(candidate.evidence.tierBoundaryProbability),
    tier_loss_if_deferred: finite(candidate.evidence.tierLossIfDeferred),
  },
  user_tier: candidate.evidence.userTier,
  projection_tier: candidate.evidence.projectionTier,
  roster_role: candidate.evidence.rosterRole,
  flags: candidate.evidence.flags.slice(0, 6),
})

export const buildDraftyDecisionContext = ({
  context,
  recommendations,
  opponentForecast,
  roundMarket,
  playerLib,
  targetRosterIndex,
  sourceEventCount,
}: {
  context: DraftAdvisorContext | null | undefined
  recommendations: DraftRecommendationSet | null | undefined
  opponentForecast: OpponentForecast | null | undefined
  roundMarket: RoundMarketPresentationModel | null | undefined
  playerLib: PlayerLibrary
  targetRosterIndex: number
  sourceEventCount: number
}) => {
  if (!context || !recommendations) {
    return {
      schema_version: 1 as const,
      status: "unavailable" as const,
      unavailable_reason: "Draft recommendation context is not ready.",
      source_event_count: sourceEventCount,
    }
  }
  const targetTeam = context.teams.find(team => team.rosterIndex === targetRosterIndex)
  const nextUserPicks = context.upcomingSlots
    .filter(slot => slot.rosterIndex === targetRosterIndex)
    .slice(0, 3)
    .map(slot => slot.overallPick)
  const opponentNeeds = POSITIONS.map(position => {
    const needs = context.teams
      .filter(team => team.rosterIndex !== targetRosterIndex)
      .map(team => team.needs.find(need => need.position === position)?.openStarterSpots || 0)
    return {
      position,
      teams_with_open_starter: needs.filter(value => value > 0).length,
      open_starter_spots: needs.reduce((sum, value) => sum + value, 0),
    }
  })
  const roundMarketEvidence = roundMarket?.buckets.map(bucket => ({
    bucket: bucket.id,
    target_overall_pick: bucket.targetOverallPick,
    opponent_pick_count: bucket.opponentPickCount,
    provenance: bucket.provenance,
    unavailable_reason: bucket.unavailableReason,
    positions: bucket.positions.map(lane => ({
      position: lane.position,
      expected_positional_picks: lane.expectedPositionalPicks,
      probability_at_least_threshold: lane.probabilityAtLeastThreshold,
      run_threshold: lane.runThreshold,
      teams_with_open_starter: lane.observedNeed.otherTeamsWithOpenStarter,
      tiers: lane.tiers.slice(0, 2).map(tier => ({
        tier: tier.tier,
        available_player_count: tier.availablePlayerCount,
        exhaustion_probability: tier.exhaustionProbabilityByEndOfBucket,
        status: tier.status,
      })),
    })),
  })) || []
  return {
    schema_version: 1 as const,
    status: "ready" as const,
    model: opponentForecast?.model || null,
    current_pick: context.currentPick,
    next_user_pick: recommendations.nextUserPick,
    picks_until_user: Math.max(0, recommendations.nextUserPick - context.currentPick),
    next_user_picks: nextUserPicks,
    source_event_count: sourceEventCount,
    recent_picks: context.recentPicks.slice(-8),
    user_roster: (targetTeam?.draftedPlayerIds || []).map(playerId => {
      const player = playerLib[playerId]
      return {
        player_id: playerId,
        name: player?.fullName || playerId,
        position: player?.position || null,
        team: player ? String(player.team) : null,
      }
    }),
    opponent_needs: opponentNeeds,
    recommendation: {
      preferred_view: recommendations.preferredView,
      explanation: bounded(recommendations.viewExplanation, 320),
      shortlist: recommendations.candidates.slice(0, 3).map(candidateEvidence),
      best_by_position: (recommendations.positionCandidates || [])
        .slice(0, 4).map(candidateEvidence),
    },
    round_market: roundMarketEvidence,
  }
}

const historicalPoints = (player: Player, settings: FantasySettings) => {
  const format = scoringFormatFor(settings)
  return Object.values(player.historicalStats || {})
    .filter(stat => stat && stat.year !== undefined)
    .map(stat => {
      const standard = finite(stat.fantasyPointsPerGame)
      const ppr = finite(stat.pprPointsPerGame)
      const points = format === "standard" ? standard
        : format === "ppr" ? ppr
        : standard !== null && ppr !== null ? (standard + ppr) / 2
        : ppr ?? standard
      return {season: Number(stat.year), games: stat.g ?? null, points_per_game: points}
    })
    .filter(item => Number.isFinite(item.season))
    .sort((left, right) => right.season - left.season)
    .slice(0, 5)
}

export const buildDraftyPlayerEvidence = ({
  player,
  settings,
  boardSettings,
  playerTargets,
  availablePlayerIds,
  recommendations,
  status,
  peers,
}: {
  player: Player
  settings: FantasySettings
  boardSettings: BoardSettings
  playerTargets: PlayerTarget[]
  availablePlayerIds: ReadonlySet<string>
  recommendations: DraftRecommendationSet | null | undefined
  status: PlayerStatusCacheEntry | undefined
  peers: Player[]
}) => {
  const metrics = getPlayerMetrics(player, settings, boardSettings)
  const recommendation = [
    ...(recommendations?.candidates || []),
    ...(recommendations?.positionCandidates || []),
  ].find(candidate => candidate.player.id === player.id)
  const notes = profileNotes(player.profileNotes).slice(0, 6).map(note => ({
    note_id: note.noteId,
    category: note.category,
    summary: bounded(note.summary),
    practical_implication: bounded(note.practicalImplication),
    analysts: profileNoteAnalysts(note),
    source: note.sourceLabel,
    published_at: note.publishedAt,
    source_url: note.sourceUrl,
  }))
  const statusEvents = status?.state === "ready"
    ? currentPlayerStatus(status.response?.events || []).slice(0, 4).map(event => ({
      type: event.type,
      status: event.status,
      summary: bounded(event.short_summary),
      source: event.source,
      published_at: event.source_published_at,
      fetched_at: event.fetched_at,
      impact: event.recommendation_impact,
      stale: event.stale,
    }))
    : []
  return {
    schema_version: 1 as const,
    player: {
      player_id: player.id,
      name: player.fullName,
      team: String(player.team),
      position: player.position,
      available: availablePlayerIds.has(player.id),
      availability_state: player.availability?.state || "unknown",
      target_round: playerTargets.find(target => target.playerId === player.id)
        ?.targetAsEarlyAsRound || null,
      injury_status: player.injuryStatus?.status || null,
    },
    board: {
      ranking_source: String(boardSettings.ranker),
      adp_source: String(boardSettings.adpRanker),
      overall_rank: metrics.overallRank ?? null,
      position_rank: metrics.posRank < 9999 ? metrics.posRank : null,
      tier: metrics.tier?.tierNumber || null,
      adp: metrics.adp ?? null,
    },
    outlook: player.outlook ? {
      text: bounded(player.outlook.text, 500),
      source: player.outlook.source,
      season: player.outlook.season,
      observed_at: player.outlook.observedAt,
    } : null,
    analyst_notes: notes,
    current_status: {
      state: status?.state || "not_loaded",
      loaded_at: status?.loadedAt || null,
      events: statusEvents,
    },
    recommendation: recommendation ? candidateEvidence(recommendation) : null,
    historical_production: {
      scoring_format: scoringFormatFor(settings),
      seasons: historicalPoints(player, settings),
    },
    nearby_position_peers: peers
      .filter(peer => peer.id !== player.id && peer.position === player.position)
      .map(peer => {
        const peerMetrics = getPlayerMetrics(peer, settings, boardSettings)
        return {
          player_id: peer.id,
          name: peer.fullName,
          position_rank: peerMetrics.posRank < 9999 ? peerMetrics.posRank : null,
          tier: peerMetrics.tier?.tierNumber || null,
          adp: peerMetrics.adp ?? null,
        }
      })
      .sort((left, right) => (left.position_rank ?? 9999) - (right.position_rank ?? 9999))
      .slice(0, 4),
  }
}
