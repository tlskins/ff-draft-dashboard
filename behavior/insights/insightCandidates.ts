import type {CrossPositionPresentationModel} from "../analysis/crossPosition"
import type {RoundMarketPresentationModel} from "../analysis/roundMarket"
import type {TierLandscapePresentationModel} from "../analysis/tierLandscape"
import type {IntraPositionPresentationModel} from "../analysis/intraPosition"
import type {DraftRecommendationSet} from "../draft-advisor/recommendations"
import type {
  HistoricalInsightModel,
  PlayerStatusInsightModel,
  RankTierDisagreementModel,
  SourceReadinessInsightModel,
} from "./apiInsightModels"
import type {
  InsightCandidate,
  InsightEvidence,
  InsightEvidenceState,
  InsightViewId,
} from "./insightDeck"

/** Prepared read-only summary; this scorer never edits a draft plan. */
export interface PlanConstraintsEvidenceSummary {
  fingerprint: string
  summary: string
  state?: InsightEvidenceState
  unavailableReason?: string
  staleReason?: string
}

export interface InsightCandidateInputs {
  crossPosition: CrossPositionPresentationModel | null
  tierLandscape: TierLandscapePresentationModel | null
  roundMarket: RoundMarketPresentationModel | null
  planConstraints: PlanConstraintsEvidenceSummary | null
  intraPosition?: IntraPositionPresentationModel | null
  historical?: HistoricalInsightModel | null
  playerStatus?: PlayerStatusInsightModel | null
  rankTierDisagreement?: RankTierDisagreementModel | null
  sourceReadiness?: SourceReadinessInsightModel | null
  /** Ordered, advisor-owned identities currently in play. */
  comparisonPlayerIds?: string[]
  currentBoardRecommendations?: DraftRecommendationSet | null
}

const POSITION_ORDER = ["QB", "RB", "WR", "TE"] as const
const SCORE_MAX = 100

const finite = (value: unknown): value is number => (
  typeof value === "number" && Number.isFinite(value)
)

const probability = (value: unknown): number | null => (
  finite(value) && value >= 0 && value <= 1 ? value : null
)

const boundedScore = (value: number): number => (
  Math.max(0, Math.min(SCORE_MAX, Number.isFinite(value) ? value : 0))
)

const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map(key => (
      `${JSON.stringify(key)}:${stableJson(record[key])}`
    )).join(",")}}`
  }
  return JSON.stringify(value)
}

const fingerprint = (viewId: InsightViewId, value: unknown): string => (
  `${viewId}:${stableJson(value)}`
)

const unavailable = (
  viewId: InsightViewId,
  reason: string,
): InsightEvidence => ({
  state: "unavailable",
  fingerprint: fingerprint(viewId, {reason}),
  unavailableReason: reason,
})

const candidate = (
  viewId: InsightViewId,
  slot: InsightCandidate["slot"],
  score: number,
  reasonCode: string,
  explanation: string,
  evidence: InsightEvidence,
): InsightCandidate => ({
  viewId,
  slot,
  score: boundedScore(score),
  reasonCode,
  explanation,
  evidence,
})

const positionIndex = (position: unknown): number => {
  const index = POSITION_ORDER.indexOf(position as typeof POSITION_ORDER[number])
  return index === -1 ? POSITION_ORDER.length : index
}

const percent = (value: number | null): string => (
  value === null ? "unavailable" : `${Math.round(value * 100)}%`
)

const usablePositiveInteger = (value: unknown): boolean => (
  finite(value) && Number.isInteger(value) && value > 0
)

const hasComparisonIdentityAndSignal = (item: unknown): boolean => {
  const candidate = item as Record<string, unknown>
  const player = candidate?.player as Record<string, unknown> | undefined
  if (typeof player?.id !== "string" || !player.id.trim()) return false
  const ranks = [
    candidate.positionRank,
    candidate.customPositionRank,
    candidate.activeTier,
    candidate.projectionTier,
  ].some(usablePositiveInteger)
  const projection = candidate.projection as Record<string, unknown> | undefined
  const projectionValues = [projection?.floor, projection?.median, projection?.ceiling]
    .some(finite)
  const metrics = candidate.metricValues
  const metricValues = Boolean(metrics && typeof metrics === "object"
    && Object.values(metrics as Record<string, unknown>).some(finite))
  const statusEvidence = Array.isArray(candidate.statusEvidence)
    && candidate.statusEvidence.length > 0
  const statusState = candidate.statusState === "ready"
  return ranks || projectionValues || metricValues || statusEvidence || statusState
}

interface Pressure {
  position: string
  pressure: number
  run: number | null
  exhaustion: number | null
  survivalRisk: number | null
}

const tierPressure = (model: TierLandscapePresentationModel | null): Pressure[] => {
  if (!model || !Array.isArray(model.lanes)) return []
  return model.lanes.flatMap(lane => {
    const run = probability(lane?.run?.probability)
    const exhaustion = probability(lane?.currentTopAvailableTier?.exhaustionProbability)
    const survivals = Array.isArray(lane?.players)
      ? lane.players.map(player => probability(player?.survivalProbability))
        .filter((value): value is number => value !== null)
      : []
    const survivalRisk = survivals.length > 0
      ? 1 - Math.min(...survivals)
      : null
    const values = [run, exhaustion, survivalRisk]
      .filter((value): value is number => value !== null)
    return values.length === 0 ? [] : [{
      position: String(lane.position),
      pressure: Math.max(...values),
      run,
      exhaustion,
      survivalRisk,
    }]
  }).sort((left, right) => (
    right.pressure - left.pressure
    || positionIndex(left.position) - positionIndex(right.position)
  ))
}

const crossPositionDisplayFingerprint = (
  model: CrossPositionPresentationModel | null,
  candidates: unknown[],
): string => fingerprint("candidate_comparison", {
  explanation: model?.explanation || "",
  candidates: candidates.map(item => {
    const candidate = item as Record<string, unknown>
    const player = candidate.player as Record<string, unknown> | undefined
    const projection = candidate.projection as Record<string, unknown> | undefined
    const statusEvidence = Array.isArray(candidate.statusEvidence)
      ? candidate.statusEvidence.map(status => {
          const event = status as Record<string, unknown>
          return {
            id: event.id, type: event.type, recommendationImpact: event.recommendation_impact,
            summary: event.short_summary, source: event.source, stale: event.stale,
          }
        })
      : []
    return {
      identity: {
        id: player?.id, name: player?.fullName, team: player?.team,
        position: player?.position,
      },
      preferenceLabel: candidate.preferenceLabel,
      fallbackNumber: candidate.fallbackNumber,
      positionRank: candidate.positionRank,
      positionRankSourceLabel: candidate.positionRankSourceLabel,
      customPositionRank: candidate.customPositionRank,
      customTier: candidate.customTier,
      activeTier: candidate.activeTier,
      activeTierSourceLabel: candidate.activeTierSourceLabel,
      projectionTier: candidate.projectionTier,
      projection: projection && {
        floor: projection.floor, median: projection.median, ceiling: projection.ceiling,
        rangeFloor: projection.rangeFloor, rangeCeiling: projection.rangeCeiling,
      },
      metrics: candidate.metricValues,
      statusState: candidate.statusState,
      statusEvidence,
    }
  }),
})

const tierMarketDisplayFingerprint = (
  model: TierLandscapePresentationModel | null,
): string => fingerprint("current_tier_market", {
  currentPick: model?.currentPick,
  nextUserPick: model?.nextUserPick,
  lanes: Array.isArray(model?.lanes) ? model.lanes.map(lane => ({
    position: lane?.position,
    availablePlayerCount: lane?.availablePlayerCount,
    primaryTierSourceLabel: lane?.primaryTierSourceLabel,
    run: lane?.run,
    currentTier: lane?.currentTopAvailableTier && {
      tier: lane.currentTopAvailableTier.tier,
      label: lane.currentTopAvailableTier.label,
      sourceLabel: lane.currentTopAvailableTier.sourceLabel,
      availablePlayerCount: lane.currentTopAvailableTier.availablePlayerCount,
      exhaustionProbability: lane.currentTopAvailableTier.exhaustionProbability,
      exhaustionUnavailableReason: lane.currentTopAvailableTier.exhaustionUnavailableReason,
      activeTierBoundary: lane.currentTopAvailableTier.activeTierBoundary,
    },
    players: Array.isArray(lane?.players) ? lane.players.map(player => ({
      identity: {
        id: player?.player?.id, name: player?.player?.fullName, team: player?.player?.team,
        position: player?.player?.position,
      },
      positionRank: player?.positionRank,
      positionRankSourceLabel: player?.positionRankSourceLabel,
      primaryTier: player?.primaryTier,
      primaryTierSourceLabel: player?.primaryTierSourceLabel,
      projectionTier: player?.projectionTier,
      projection: player?.projection,
      survivalProbability: player?.survivalProbability,
    })) : [],
  })) : [],
})

const roundMarketDisplayFingerprint = (
  model: RoundMarketPresentationModel | null,
): string => fingerprint("two_round_run_matrix", {
  inputFingerprint: model?.inputFingerprint,
  buckets: Array.isArray(model?.buckets) ? model.buckets.map(bucket => ({
    id: bucket.id,
    targetOverallPick: bucket.targetOverallPick,
    firstOpponentOverallPick: bucket.firstOpponentOverallPick,
    lastOpponentOverallPick: bucket.lastOpponentOverallPick,
    opponentPickCount: bucket.opponentPickCount,
    provenance: bucket.provenance,
    staticBoardAssumption: bucket.staticBoardAssumption,
    unavailableReason: bucket.unavailableReason,
    positions: Array.isArray(bucket.positions) ? bucket.positions.map(lane => ({
      position: lane.position,
      expectedPositionalPicks: lane.expectedPositionalPicks,
      runThreshold: lane.runThreshold,
      probabilityAtLeastThreshold: lane.probabilityAtLeastThreshold,
      observedNeed: lane.observedNeed,
      tiers: Array.isArray(lane.tiers) ? lane.tiers.map(tier => ({
        id: tier.id, authority: tier.authority, position: tier.position, tier: tier.tier,
        playerIds: Array.from(new Set(Array.isArray(tier.playerIds) ? tier.playerIds : [])).sort(),
        availablePlayerCount: tier.availablePlayerCount,
        expectedUniquePlayersTakenInBucket: tier.expectedUniquePlayersTakenInBucket,
        exhaustionProbabilityByEndOfBucket: tier.exhaustionProbabilityByEndOfBucket,
        probabilityMethod: tier.probabilityMethod, provenance: tier.provenance,
        assumption: tier.assumption, status: tier.status,
        unavailableReason: tier.unavailableReason,
      })) : [],
    })) : [],
  })) : [],
})

const crossPositionCandidate = (
  model: CrossPositionPresentationModel | null,
): InsightCandidate => {
  const candidates = model && Array.isArray(model.candidates)
    ? model.candidates.filter(hasComparisonIdentityAndSignal)
    : []
  if (candidates.length === 0) {
    const evidence = unavailable(
      "candidate_comparison",
      "No supplied cross-position candidate has both a valid player identity and current evidence.",
    )
    return candidate(
      "candidate_comparison", "primary_decision", 0, "comparison_unavailable",
      "Candidate comparison is unavailable because no valid supplied candidate evidence is present.", evidence,
    )
  }
  const urgency = candidates.flatMap(item => {
    const metrics = item?.metricValues
    const tierLoss = finite(metrics?.tierLossIfDeferred)
      ? Math.max(0, Math.min(1, metrics.tierLossIfDeferred / 10))
      : null
    const survival = probability(metrics?.survivalProbability)
    const run = probability(metrics?.positionalRunProbability)
    return [tierLoss, survival === null ? null : 1 - survival, run]
      .filter((value): value is number => value !== null)
  })
  const urgencyScore = urgency.length > 0 ? Math.max(...urgency) : 0
  const ambiguity = candidates.length > 1 ? 1 : 0
  const evidence: InsightEvidence = {
    state: "ready",
    fingerprint: crossPositionDisplayFingerprint(model, candidates),
  }
  return candidate(
    "candidate_comparison", "primary_decision",
    30 + ambiguity * 15 + urgencyScore * 35,
    ambiguity ? "comparison_ambiguity_and_urgency" : "comparison_urgency",
    ambiguity
      ? "Several supplied candidates remain in play; compare their current evidence before choosing."
      : "The supplied comparison has one current candidate with decision-relevant evidence.",
    evidence,
  )
}

const tierMarketCandidates = (
  model: TierLandscapePresentationModel | null,
): InsightCandidate[] => {
  const pressures = tierPressure(model)
  const evidence = pressures.length > 0
    ? {
        state: "ready" as const,
        fingerprint: tierMarketDisplayFingerprint(model),
      }
    : unavailable(
      "current_tier_market",
      "No valid supplied run, tier-exhaustion, or survival evidence is available.",
    )
  const strongest = pressures[0]
  const score = strongest ? 25 + strongest.pressure * 55 : 0
  const explanation = strongest
    ? `${strongest.position} has the strongest current market pressure from supplied evidence: `
      + `run ${percent(strongest.run)}, tier exhaustion ${percent(strongest.exhaustion)}, `
      + `availability risk ${percent(strongest.survivalRisk)}.`
    : "Current tier market is unavailable because required supplied pressure evidence is absent."
  return (["primary_decision", "market_watch"] as const).map(slot => candidate(
    "current_tier_market", slot, score,
    strongest ? "supplied_current_tier_pressure" : "current_tier_market_unavailable",
    explanation, evidence,
  ))
}

interface RoundPressure {
  position: string
  bucket: "next_user_turn" | "following_user_turn"
  pressure: number
  run: number | null
  depletion: number | null
  exhaustion: number | null
}

const roundPressures = (model: RoundMarketPresentationModel | null): RoundPressure[] => {
  if (!model || !Array.isArray(model.buckets) || model.buckets.length !== 2) return []
  return model.buckets.flatMap(bucket => {
    const validBucket = bucket?.id === "next_user_turn"
      ? bucket.provenance === "frozen_v1_window"
      : bucket?.id === "following_user_turn"
        ? bucket.provenance === "static_board_derived_v1"
        : false
    if (!validBucket || !Array.isArray(bucket.positions)) return []
    return bucket.positions.flatMap(lane => {
      const run = probability(lane?.probabilityAtLeastThreshold)
      const validTiers = Array.isArray(lane?.tiers)
        ? lane.tiers.filter(tier => (
          tier?.status === "available"
          && tier.provenance === "static_board_derived_v1"
          && typeof tier.assumption === "string"
          && Boolean(tier.assumption.trim())
          && finite(tier.availablePlayerCount)
          && Number.isInteger(tier.availablePlayerCount)
          && tier.availablePlayerCount > 0
          && finite(tier.expectedUniquePlayersTakenInBucket)
          && tier.expectedUniquePlayersTakenInBucket >= 0
          && tier.expectedUniquePlayersTakenInBucket <= tier.availablePlayerCount
        ))
        : []
      const depletion = validTiers
        ? validTiers.map(tier => {
            if (!finite(tier?.expectedUniquePlayersTakenInBucket)
              || !finite(tier?.availablePlayerCount)
              || tier.availablePlayerCount <= 0) return null
            return Math.max(0, Math.min(1,
              tier.expectedUniquePlayersTakenInBucket / tier.availablePlayerCount,
            ))
          }).filter((value): value is number => value !== null)
        : []
      const exhaustion = validTiers
        ? validTiers.map(tier => probability(tier?.exhaustionProbabilityByEndOfBucket))
          .filter((value): value is number => value !== null)
        : []
      const tierValues = [...depletion, ...exhaustion]
      // Two-round pressure requires a valid supplied position-run probability
      // and validated tier evidence; numeric remnants alone are never current.
      if (run === null || tierValues.length === 0) return []
      const values = [run, ...tierValues]
      return [{
        position: String(lane.position),
        bucket: bucket.id,
        pressure: Math.max(...values),
        run,
        depletion: depletion.length > 0 ? Math.max(...depletion) : null,
        exhaustion: exhaustion.length > 0 ? Math.max(...exhaustion) : null,
      }]
    })
  }).sort((left, right) => (
    right.pressure - left.pressure
    || (left.bucket === "next_user_turn" ? -1 : 1)
      - (right.bucket === "next_user_turn" ? -1 : 1)
    || positionIndex(left.position) - positionIndex(right.position)
  ))
}

const roundMarketCandidate = (
  model: RoundMarketPresentationModel | null,
): InsightCandidate => {
  const pressures = roundPressures(model)
  const strongest = pressures[0]
  const evidence = strongest
    ? {
        state: "ready" as const,
        fingerprint: roundMarketDisplayFingerprint(model),
      }
    : unavailable(
      "two_round_run_matrix",
      "No valid supplied two-round run, tier-depletion, or exhaustion evidence is available.",
    )
  const secondTurnNote = " Following-user-turn evidence is provisional and derived from the supplied static-board outlook."
  const explanation = strongest
    ? `${strongest.position} has the strongest ${strongest.bucket.replaceAll("_", " ")} pressure: `
      + `run ${percent(strongest.run)}, tier depletion ${percent(strongest.depletion)}, `
      + `tier exhaustion ${percent(strongest.exhaustion)}.${secondTurnNote}`
    : "Two-round run matrix is unavailable because required supplied market evidence is absent."
  return candidate(
    "two_round_run_matrix", "market_watch", strongest ? 35 + strongest.pressure * 60 : 0,
    strongest ? "supplied_two_round_market_pressure" : "two_round_run_matrix_unavailable",
    explanation,
    evidence,
  )
}

const planCandidate = (
  summary: PlanConstraintsEvidenceSummary | null,
): InsightCandidate => {
  const state = summary?.state || "unavailable"
  const ready = state === "ready" && Boolean(summary?.fingerprint && summary.summary)
  const evidence: InsightEvidence = ready
    ? {state: "ready", fingerprint: `plan_constraints:${summary!.fingerprint}`}
    : {
        state,
        fingerprint: `plan_constraints:${summary?.fingerprint || "unavailable"}`,
        ...(summary?.unavailableReason
          ? {unavailableReason: summary.unavailableReason}
          : {unavailableReason: "Read-only plan constraints are unavailable."}),
        ...(summary?.staleReason ? {staleReason: summary.staleReason} : {}),
      }
  return candidate(
    "plan_constraints", "plan_constraints", ready ? 20 : 0,
    ready ? "read_only_plan_constraints" : "plan_constraints_unavailable",
    ready
      ? `Read-only plan constraints: ${summary!.summary}`
      : "Plan constraints are unavailable; no draft-plan authority is inferred.",
    evidence,
  )
}

const mappedEvidenceState = (
  state: HistoricalInsightModel["state"] | SourceReadinessInsightModel["state"],
): InsightEvidenceState => (
  state === "idle" ? "loading" : state === "error" ? "unavailable" : state
)

const intraPositionCandidate = (
  model: IntraPositionPresentationModel | null | undefined,
): InsightCandidate => {
  const usable = Boolean(model && model.players.length >= 2)
  const projectionSpreads = model?.players.map(player => player.projectionSpread)
    .filter((value): value is number => finite(value)) || []
  const maximumSpread = projectionSpreads.length > 0
    ? Math.max(...projectionSpreads)
    : 0
  const evidence = usable ? {
    state: "ready" as const,
    fingerprint: fingerprint("intra_position_comparison", {
      position: model!.position,
      total: model!.totalAvailablePlayerCount,
      players: model!.players.map(player => ({
        id: player.player.id,
        rank: player.positionRank,
        customRank: player.customPositionRank,
        activeTier: player.activeTier,
        customTier: player.customTier,
        projectionTier: player.projectionTier,
        projection: player.projection,
        status: player.statusEvidence.map(event => event.id),
      })),
    }),
  } : unavailable(
    "intra_position_comparison",
    "At least two current players at one position are required for an intra-position comparison.",
  )
  return candidate(
    "intra_position_comparison",
    "primary_decision",
    usable ? 20 + Math.min(25, maximumSpread * 3) : 0,
    usable ? "intra_position_options" : "intra_position_unavailable",
    usable
      ? `${model!.position} has ${model!.visiblePlayerCount} current options; compare rank, tier, and projection spread.`
      : "Intra-position comparison is unavailable because the current board lacks two eligible options.",
    evidence,
  )
}

const historicalCandidates = (
  model: HistoricalInsightModel | null | undefined,
): InsightCandidate[] => {
  const state = model ? mappedEvidenceState(model.state) : "unavailable"
  const usable = Boolean(model && model.players.length > 0)
  const evidenceFor = (viewId: "historical_risk_reward" | "historical_production"):
  InsightEvidence => model ? {
      state,
      fingerprint: `${viewId}:${model.fingerprint}`,
      ...(model.staleReason ? {staleReason: model.staleReason} : {}),
      ...(state === "unavailable" ? {
        unavailableReason: model.unavailableReason || model.error
          || "Historical evidence is unavailable.",
      } : {}),
    } : unavailable(
      viewId,
      "Historical evidence has not loaded for the current comparison set.",
    )
  return [
    candidate(
      "historical_risk_reward",
      "primary_decision",
      usable ? 12 + Math.min(33, model!.riskScore * 3) : 0,
      usable ? "historical_weekly_variance" : "historical_risk_unavailable",
      usable
        ? `Weekly scoring variance reaches ${model!.riskScore.toFixed(1)} points across the current comparison set.`
        : "Historical risk and reward is unavailable for the current comparison set.",
      evidenceFor("historical_risk_reward"),
    ),
    candidate(
      "historical_production",
      "primary_decision",
      usable ? 10 + Math.min(30, model!.trendScore * 4) : 0,
      usable ? "historical_season_trend" : "historical_production_unavailable",
      usable
        ? `Season scoring movement spans as much as ${model!.trendScore.toFixed(1)} points per game.`
        : "Historical production is unavailable for the current comparison set.",
      evidenceFor("historical_production"),
    ),
  ]
}

const playerLabCandidate = (
  playerIds: string[] | undefined,
  model: HistoricalInsightModel | null | undefined,
): InsightCandidate => {
  const stableIds = Array.from(new Set(playerIds || [])).filter(Boolean).slice(0, 3)
  const usable = stableIds.length >= 2
  const state = usable
    ? model ? mappedEvidenceState(model.state) : "loading"
    : "unavailable"
  const evidence: InsightEvidence = {
    state,
    fingerprint: fingerprint("player_lab", {
      playerIds: stableIds,
      history: model?.fingerprint || "not-loaded",
    }),
    ...(state === "unavailable" ? {
      unavailableReason: usable
        ? model?.unavailableReason || model?.error || "Player Lab history is unavailable."
        : "At least two Players in play are required.",
    } : {}),
    ...(model?.staleReason ? {staleReason: model.staleReason} : {}),
  }
  return candidate(
    "player_lab",
    "primary_decision",
    0,
    usable ? "manual_player_lab_ready" : "manual_player_lab_selection_required",
    usable
      ? "Compare the advisor-owned Players in play across the latest completed seasons."
      : "Player Lab requires at least two Players in play.",
    evidence,
  )
}

const currentBoardProjectionCandidate = (
  recommendations: DraftRecommendationSet | null | undefined,
): InsightCandidate => {
  const players = (recommendations?.positionCandidates
    || recommendations?.candidates
    || []).filter(item => (
    finite(item.evidence?.projectedFloor)
    && finite(item.evidence?.projectedMedian)
    && finite(item.evidence?.projectedCeiling)
  )) || []
  const usable = players.length >= 2
  const evidence = usable ? {
    state: "ready" as const,
    fingerprint: fingerprint("current_board_projection", {
      players: players.map(player => ({
        id: player.player.id,
        projection: {
          floor: player.evidence.projectedFloor,
          median: player.evidence.projectedMedian,
          ceiling: player.evidence.projectedCeiling,
        },
        activeTier: player.evidence.userTier,
        positionRank: player.positionRank,
      })),
    }),
  } : unavailable(
    "current_board_projection",
    "At least two eligible current-board players are required.",
  )
  return candidate(
    "current_board_projection",
    "primary_decision",
    usable ? 18 : 0,
    usable ? "current_board_projection_ready" : "current_board_projection_unavailable",
    usable
      ? "Compare the top positional options on one current-board projection scale."
      : "Current-board projection context requires at least two eligible players.",
    evidence,
  )
}

const playerStatusCandidate = (
  model: PlayerStatusInsightModel | null | undefined,
): InsightCandidate => {
  const evidence: InsightEvidence = model ? {
    state: model.state,
    fingerprint: `player_status:${model.fingerprint}`,
    ...(model.staleReason ? {staleReason: model.staleReason} : {}),
    ...(model.unavailableReason ? {unavailableReason: model.unavailableReason} : {}),
  } : unavailable("player_status", "Player status evidence has not loaded.")
  const score = model?.maximumImpact === "material"
    ? 95
    : model?.maximumImpact === "review" ? 65 : 0
  return candidate(
    "player_status",
    "plan_constraints",
    score,
    score > 0 ? `player_status_${model!.maximumImpact}` : "player_status_unavailable",
    score > 0
      ? `${model!.maximumImpact === "material" ? "Material" : "Review"} status evidence affects a player currently in play.`
      : "No fresh actionable status evidence is published for the current comparison set.",
    evidence,
  )
}

const rankTierDisagreementCandidate = (
  model: RankTierDisagreementModel | null | undefined,
): InsightCandidate => {
  const ready = model?.state === "ready" && model.players.length > 0
  const evidence = ready ? {
    state: "ready" as const,
    fingerprint: model!.fingerprint,
  } : unavailable(
    "rank_tier_disagreement",
    model?.unavailableReason || "Ranking-source disagreement is unavailable.",
  )
  return candidate(
    "rank_tier_disagreement",
    "market_watch",
    ready ? 10 + Math.min(30, model!.maximumSpread / 2) : 0,
    ready ? "positional_rank_disagreement" : "rank_disagreement_unavailable",
    ready
      ? `The largest positional-rank disagreement among players in play is ${model!.maximumSpread} spots.`
      : "Rank and tier disagreement is unavailable for the current comparison set.",
    evidence,
  )
}

const sourceReadinessCandidate = (
  model: SourceReadinessInsightModel | null | undefined,
): InsightCandidate => {
  const evidence: InsightEvidence = model ? {
    state: mappedEvidenceState(model.state),
    fingerprint: model.fingerprint,
    ...(model.staleReason ? {staleReason: model.staleReason} : {}),
    ...((model.unavailableReason || model.error) ? {
      unavailableReason: model.unavailableReason || model.error || undefined,
    } : {}),
  } : unavailable("data_source_status", "Published source readiness has not loaded.")
  return candidate(
    "data_source_status",
    "plan_constraints",
    0,
    "manual_source_context",
    "Inspect published ranking, status, and historical source readiness. This context never changes draft recommendations.",
    evidence,
  )
}

/**
 * Returns only registered presentation candidates. Scores express which view
 * deserves scarce deck space; they never reorder or re-score draft players.
 */
export const buildInsightCandidates = (
  inputs: InsightCandidateInputs,
): InsightCandidate[] => [
  crossPositionCandidate(inputs.crossPosition),
  playerLabCandidate(inputs.comparisonPlayerIds, inputs.historical),
  currentBoardProjectionCandidate(inputs.currentBoardRecommendations),
  ...(inputs.intraPosition === undefined
    ? [] : [intraPositionCandidate(inputs.intraPosition)]),
  ...(inputs.historical === undefined
    ? [] : historicalCandidates(inputs.historical)),
  ...tierMarketCandidates(inputs.tierLandscape),
  roundMarketCandidate(inputs.roundMarket),
  ...(inputs.rankTierDisagreement === undefined
    ? [] : [rankTierDisagreementCandidate(inputs.rankTierDisagreement)]),
  planCandidate(inputs.planConstraints),
  ...(inputs.playerStatus === undefined
    ? [] : [playerStatusCandidate(inputs.playerStatus)]),
  ...(inputs.sourceReadiness === undefined
    ? [] : [sourceReadinessCandidate(inputs.sourceReadiness)]),
]
