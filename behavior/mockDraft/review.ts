import type {
  RecordedCompletedDraftReplay,
  RecordedReplayPlayer,
} from "../draft-advisor/completedDraftReplay"
import {FantasyPosition} from "../../types"


export type ReviewPosition = RecordedReplayPlayer["position"]
const POSITIONS: ReviewPosition[] = [
  FantasyPosition.QUARTERBACK,
  FantasyPosition.RUNNING_BACK,
  FantasyPosition.WIDE_RECEIVER,
  FantasyPosition.TIGHT_END,
]

export interface HandcuffRelationship {
  starterPlayerId: string
  backupPlayerId: string
  source: string
}

/**
 * V1's explicit relationship contract is a frozen configured-ADP backfield
 * proxy: the first same-team RB is the starter and the second is the backup.
 * Only a backup inside the league's first ten rounds is retained. The source
 * label keeps this from being mistaken for an official depth chart.
 */
export const deriveHandcuffRelationships = (
  fixture: RecordedCompletedDraftReplay,
): HandcuffRelationship[] => {
  const cutoff = fixture.settings.numTeams * 10
  const byTeam = new Map<string, RecordedReplayPlayer[]>()
  fixture.players
    .filter(player => player.position === FantasyPosition.RUNNING_BACK && player.team)
    .forEach(player => byTeam.set(player.team, [...(byTeam.get(player.team) || []), player]))
  return Array.from(byTeam.values()).flatMap(players => {
    const ordered = players.sort((left, right) =>
      left.adp - right.adp || left.positionRank - right.positionRank || left.id.localeCompare(right.id))
    const [starter, backup] = ordered
    if (!starter || !backup || backup.adp > cutoff || backup.adp >= 999) return []
    return [{
      starterPlayerId: starter.id,
      backupPlayerId: backup.id,
      source: "configured-adp-backfield-order-v1",
    }]
  }).sort((left, right) => left.starterPlayerId.localeCompare(right.starterPlayerId))
}

export interface MockRosterScoreCategory {
  key: "tier_capital" | "starter_quality" | "bench_upside" | "target_conversion" | "handcuff_value"
  label: string
  score: number | null
  weight: number
  explanation: string
  evidence: string[]
}

export interface MockRosterScorecard {
  schemaVersion: 1
  compositeScore: number
  selectedPlayerIds: string[]
  starterPlayerIds: string[]
  benchPlayerIds: string[]
  tierCounts: Record<ReviewPosition, Record<string, number>>
  positionMetrics: Record<ReviewPosition, MockPositionMetrics>
  totals: MockRosterTotals
  playerMetrics: MockPlayerParMetric[]
  categories: MockRosterScoreCategory[]
}

export interface MockPlayerParMetric {
  playerId: string
  name: string
  position: ReviewPosition
  positionRank: number
  tier: number
  adp: number
  lineupRole: ReviewPosition | "FLEX" | "BENCH"
  projectedFloor: number
  projectedMedian: number
  projectedCeiling: number
  replacementPoints: number
  projectedPointsAboveReplacement: number
}

export interface MockPositionMetrics {
  position: ReviewPosition
  rosterCount: number
  starterCount: number
  benchCount: number
  tierCounts: Record<string, number>
  starterTierCounts: Record<string, number>
  benchTierCounts: Record<string, number>
  projectedFloor: number
  projectedMedian: number
  projectedCeiling: number
  starterProjectedMedian: number
  projectedPointsAboveReplacement: number
  starterProjectedPointsAboveReplacement: number
  benchProjectedPointsAboveReplacement: number
}

export interface MockRosterTotals {
  rosterCount: number
  starterCount: number
  benchCount: number
  requiredStarterSlots: number
  projectedFloor: number
  projectedMedian: number
  projectedCeiling: number
  starterProjectedMedian: number
  projectedPointsAboveReplacement: number
  starterProjectedPointsAboveReplacement: number
  benchProjectedPointsAboveReplacement: number
}

export interface MockCounterfactualRequest {
  positionSequence?: ReviewPosition[]
  exactPlayerOverrides?: Record<number, string>
  maxAlternatives?: number
  beamWidth?: number
  preservePicksThrough?: number
  maxChangedPicks?: number
}

export interface MockPathObjective {
  name: "starter_par_then_total_par_v1"
  starterProjectedPointsAboveReplacement: number
  benchProjectedPointsAboveReplacement: number
  totalProjectedPointsAboveReplacement: number
  totalTurnsEarly: number
  earlySelectionCount: number
}

export interface MockCounterfactualAlternative {
  rank: number
  selectedPlayerIds: string[]
  picks: Array<{
    overallPick: number
    playerId: string
    reason: string
    latestSafeOverallPick: number | null
    latestSafeUserPickNumber: number | null
    turnsEarly: number
  }>
  opponentReplacements: Array<{
    overallPick: number
    recordedPlayerId: string
    replacementPlayerId: string
  }>
  scorecard: MockRosterScorecard
  objective: MockPathObjective
  compositeDelta: number
  categoryDeltas: Array<{
    key: MockRosterScoreCategory["key"]
    label: string
    actual: number | null
    alternate: number | null
    delta: number | null
  }>
  decisionLedger: MockDecisionLedgerEntry[]
  replayFidelity: MockReplayFidelity
}

export interface MockDecisionPlayerEvidence {
  playerId: string
  name: string
  position: ReviewPosition
  positionRank: number
  tier: number
  adp: number
  projectedMedian: number
  replacementPoints: number
  projectedPointsAboveReplacement: number
}

export interface MockObservedAvailability {
  playerId: string
  observedOverallPick: number | null
  latestSafeOverallPick: number | null
  latestSafeUserPickNumber: number | null
  observedSelection: "user" | "opponent" | "undrafted"
}

export interface MockDecisionLedgerEntry {
  userPickNumber: number
  overallPick: number
  actual: MockDecisionPlayerEvidence | null
  alternate: MockDecisionPlayerEvidence
  changed: boolean
  reason: string
  directOpponentCollisionAt: number | null
  observedOverallPick: number | null
  latestSafeOverallPick: number | null
  latestSafeUserPickNumber: number | null
  turnsEarly: number
}

export interface MockReplayFidelity {
  level: "high" | "moderate" | "low"
  opponentPickCount: number
  collisionCount: number
  collisionRate: number
  changedUserPickCount: number
  explanation: string
}

export interface MockDraftReview {
  schemaVersion: 1
  fixtureId: string
  actual: MockRosterScorecard
  alternatives: MockCounterfactualAlternative[]
  observedAvailability: MockObservedAvailability[]
  assumptions: string[]
}

const boundedScore = (value: number): number => Math.round(
  Math.max(0, Math.min(100, value)),
)

const replacementFor = (
  fixture: RecordedCompletedDraftReplay,
  position: ReviewPosition,
): number => fixture.replacementPoints[position] || 0

const lineup = (
  fixture: RecordedCompletedDraftReplay,
  selectedPlayerIds: string[],
  suppliedById?: Map<string, RecordedReplayPlayer>,
) => {
  const byId = suppliedById ?? new Map(fixture.players.map(player => [player.id, player]))
  const byPosition = Object.fromEntries(POSITIONS.map(position => [
    position,
    selectedPlayerIds
      .map(id => byId.get(id))
      .filter((player): player is RecordedReplayPlayer => player?.position === position)
      .sort((left, right) => right.projectedMedian - left.projectedMedian || left.id.localeCompare(right.id)),
  ])) as Record<ReviewPosition, RecordedReplayPlayer[]>
  const required: Record<ReviewPosition, number> = {
    QB: fixture.settings.numStartingQbs,
    RB: fixture.settings.numStartingRbs,
    WR: fixture.settings.numStartingWrs,
    TE: fixture.settings.numStartingTes,
  }
  const starters = POSITIONS.flatMap(position => byPosition[position].slice(0, required[position]))
  const directStarterIds = new Set(starters.map(player => player.id))
  const flex = ([...byPosition.RB, ...byPosition.WR, ...byPosition.TE])
    .filter(player => !directStarterIds.has(player.id))
    .sort((left, right) =>
      (right.projectedMedian - replacementFor(fixture, right.position))
        - (left.projectedMedian - replacementFor(fixture, left.position))
      || left.id.localeCompare(right.id))
    .slice(0, fixture.settings.numFlex)
  const starterPlayerIds = [...starters, ...flex].map(player => player.id)
  const starterSet = new Set(starterPlayerIds)
  const lineupRoles = Object.fromEntries([
    ...starters.map(player => [player.id, player.position] as const),
    ...flex.map(player => [player.id, "FLEX"] as const),
  ]) as Record<string, ReviewPosition | "FLEX">
  return {
    starterPlayerIds,
    benchPlayerIds: selectedPlayerIds.filter(id => !starterSet.has(id)),
    lineupRoles,
    requiredStarterSlots: Object.values(required).reduce((sum, value) => sum + value, 0)
      + fixture.settings.numFlex,
  }
}

const rounded = (value: number): number => Math.round(value * 10) / 10

const tiersFor = (
  players: RecordedReplayPlayer[],
): Record<string, number> => players.reduce<Record<string, number>>((counts, player) => {
  const key = `T${player.userTier}`
  counts[key] = (counts[key] || 0) + 1
  return counts
}, {})

const sum = (
  players: RecordedReplayPlayer[],
  value: (player: RecordedReplayPlayer) => number,
): number => rounded(players.reduce((total, player) => total + value(player), 0))

const buildRosterMetrics = (
  fixture: RecordedCompletedDraftReplay,
  selectedPlayerIds: string[],
  starterPlayerIds: string[],
  requiredStarterSlots: number,
): {
  positionMetrics: MockRosterScorecard["positionMetrics"]
  totals: MockRosterScorecard["totals"]
  playerMetrics: MockRosterScorecard["playerMetrics"]
} => {
  const byId = new Map(fixture.players.map(player => [player.id, player]))
  const selected = selectedPlayerIds
    .map(id => byId.get(id))
    .filter((player): player is RecordedReplayPlayer => Boolean(player))
  const starterIds = new Set(starterPlayerIds)
  const positionMetrics = Object.fromEntries(POSITIONS.map(position => {
    const roster = selected.filter(player => player.position === position)
    const starters = roster.filter(player => starterIds.has(player.id))
    const bench = roster.filter(player => !starterIds.has(player.id))
    const replacement = replacementFor(fixture, position)
    return [position, {
      position,
      rosterCount: roster.length,
      starterCount: starters.length,
      benchCount: bench.length,
      tierCounts: tiersFor(roster),
      starterTierCounts: tiersFor(starters),
      benchTierCounts: tiersFor(bench),
      projectedFloor: sum(roster, player => player.projectedFloor),
      projectedMedian: sum(roster, player => player.projectedMedian),
      projectedCeiling: sum(roster, player => player.projectedCeiling),
      starterProjectedMedian: sum(starters, player => player.projectedMedian),
      projectedPointsAboveReplacement: sum(
        roster,
        player => player.projectedMedian - replacement,
      ),
      starterProjectedPointsAboveReplacement: sum(
        starters,
        player => player.projectedMedian - replacement,
      ),
      benchProjectedPointsAboveReplacement: sum(
        bench,
        player => player.projectedMedian - replacement,
      ),
    } satisfies MockPositionMetrics]
  })) as MockRosterScorecard["positionMetrics"]
  const total = (field: keyof Omit<MockPositionMetrics,
  "position" | "tierCounts" | "starterTierCounts" | "benchTierCounts">): number => rounded(
    POSITIONS.reduce((value, position) => value + Number(positionMetrics[position][field]), 0),
  )
  const projectedPointsAboveReplacement = total("projectedPointsAboveReplacement")
  const starterProjectedPointsAboveReplacement = total("starterProjectedPointsAboveReplacement")
  const optimized = lineup(fixture, selectedPlayerIds)
  const playerMetrics = selected.map(player => ({
    playerId: player.id,
    name: player.name,
    position: player.position,
    positionRank: player.positionRank,
    tier: player.userTier,
    adp: player.adp,
    lineupRole: optimized.lineupRoles[player.id] || "BENCH",
    projectedFloor: rounded(player.projectedFloor),
    projectedMedian: rounded(player.projectedMedian),
    projectedCeiling: rounded(player.projectedCeiling),
    replacementPoints: rounded(replacementFor(fixture, player.position)),
    projectedPointsAboveReplacement: rounded(
      player.projectedMedian - replacementFor(fixture, player.position),
    ),
  } satisfies MockPlayerParMetric))
  return {
    positionMetrics,
    playerMetrics,
    totals: {
      rosterCount: selected.length,
      starterCount: starterPlayerIds.length,
      benchCount: selected.length - starterPlayerIds.length,
      requiredStarterSlots,
      projectedFloor: total("projectedFloor"),
      projectedMedian: total("projectedMedian"),
      projectedCeiling: total("projectedCeiling"),
      starterProjectedMedian: total("starterProjectedMedian"),
      projectedPointsAboveReplacement,
      starterProjectedPointsAboveReplacement,
      benchProjectedPointsAboveReplacement: rounded(
        projectedPointsAboveReplacement - starterProjectedPointsAboveReplacement,
      ),
    },
  }
}

const eligibleUserPicks = (
  fixture: RecordedCompletedDraftReplay,
): RecordedCompletedDraftReplay["actualPicks"] => fixture.actualPicks
  .filter(pick => pick.rosterIndex === fixture.targetRosterIndex
    && (pick.advisorEligible ?? pick.playerId !== null))
  .sort((left, right) => left.overallPick - right.overallPick)

export const observedDraftAvailability = (
  fixture: RecordedCompletedDraftReplay,
): MockObservedAvailability[] => {
  const userPicks = eligibleUserPicks(fixture)
  const observed = new Map(fixture.actualPicks.flatMap(pick =>
    pick.playerId ? [[pick.playerId, pick] as const] : []))
  return fixture.players.map(player => {
    const recorded = observed.get(player.id)
    let latestSafeIndex = userPicks.length - 1
    if (recorded) {
      latestSafeIndex = -1
      userPicks.forEach((pick, index) => {
        if (pick.overallPick <= recorded.overallPick) latestSafeIndex = index
      })
    }
    const latestSafe = latestSafeIndex >= 0 ? userPicks[latestSafeIndex] : null
    return {
      playerId: player.id,
      observedOverallPick: recorded?.overallPick ?? null,
      latestSafeOverallPick: latestSafe?.overallPick ?? null,
      latestSafeUserPickNumber: latestSafe ? latestSafeIndex + 1 : null,
      observedSelection: recorded
        ? recorded.rosterIndex === fixture.targetRosterIndex ? "user" : "opponent"
        : "undrafted",
    } satisfies MockObservedAvailability
  }).sort((left, right) => left.playerId.localeCompare(right.playerId))
}

const actualUserPlayerIds = (fixture: RecordedCompletedDraftReplay): string[] => (
  fixture.actualPicks
    .filter(pick => pick.rosterIndex === fixture.targetRosterIndex && pick.playerId)
    .map(pick => pick.playerId as string)
)

const attainableTargetIds = (
  fixture: RecordedCompletedDraftReplay,
  targetIds: Set<string>,
): Set<string> => {
  const selectedAt = new Map(
    fixture.actualPicks.flatMap(pick => pick.playerId ? [[pick.playerId, pick.overallPick] as const] : []),
  )
  const userPicks = fixture.actualPicks
    .filter(pick => pick.rosterIndex === fixture.targetRosterIndex)
    .map(pick => pick.overallPick)
  return new Set(Array.from(targetIds).filter(id => {
    const takenAt = selectedAt.get(id) ?? Number.MAX_SAFE_INTEGER
    return userPicks.some(pick => pick <= takenAt)
  }))
}

export const scoreMockRoster = ({
  fixture,
  selectedPlayerIds,
  targetPlayerIds = [],
  handcuffs: suppliedHandcuffs,
}: {
  fixture: RecordedCompletedDraftReplay
  selectedPlayerIds: string[]
  targetPlayerIds?: string[]
  handcuffs?: HandcuffRelationship[]
}): MockRosterScorecard => {
  const handcuffs = suppliedHandcuffs ?? deriveHandcuffRelationships(fixture)
  const byId = new Map(fixture.players.map(player => [player.id, player]))
  const validIds = selectedPlayerIds.filter((id, index) => byId.has(id) && selectedPlayerIds.indexOf(id) === index)
  const optimized = lineup(fixture, validIds)
  const starterSet = new Set(optimized.starterPlayerIds)
  const tierCounts = Object.fromEntries(POSITIONS.map(position => [position, {}])) as MockRosterScorecard["tierCounts"]
  validIds.forEach(id => {
    const player = byId.get(id)!
    const key = `T${player.userTier}`
    tierCounts[player.position][key] = (tierCounts[player.position][key] || 0) + 1
  })

  const starterTierUtilities = optimized.starterPlayerIds.map(id =>
    Math.max(0, 100 - ((byId.get(id)?.userTier || 10) - 1) * 15))
  const benchTierUtilities = optimized.benchPlayerIds.map(id =>
    Math.max(0, 70 - ((byId.get(id)?.userTier || 10) - 1) * 10))
  const starterTierMean = starterTierUtilities.length
    ? starterTierUtilities.reduce((sum, value) => sum + value, 0) / starterTierUtilities.length
    : 0
  const benchTierMean = benchTierUtilities.length
    ? benchTierUtilities.reduce((sum, value) => sum + value, 0) / benchTierUtilities.length
    : starterTierMean
  const tierScore = boundedScore(starterTierMean * 0.8 + benchTierMean * 0.2)

  const completeness = optimized.requiredStarterSlots
    ? optimized.starterPlayerIds.length / optimized.requiredStarterSlots
    : 1
  const starterVorp = optimized.starterPlayerIds.map(id => {
    const player = byId.get(id)!
    return Math.max(0, player.projectedMedian - replacementFor(fixture, player.position))
  })
  const starterVorpMean = starterVorp.length
    ? starterVorp.reduce((sum, value) => sum + value, 0) / starterVorp.length
    : 0
  const starterScore = boundedScore(completeness * 60 + Math.min(1, starterVorpMean / 5) * 40)

  const benchCeiling = optimized.benchPlayerIds.map(id => {
    const player = byId.get(id)!
    return Math.max(0, player.projectedCeiling - replacementFor(fixture, player.position))
  })
  const benchMean = benchCeiling.length
    ? benchCeiling.reduce((sum, value) => sum + value, 0) / benchCeiling.length
    : 0
  const benchScore = boundedScore(Math.min(1, benchMean / 8) * 100)

  const targets = new Set(targetPlayerIds)
  const selected = new Set(validIds)
  const securedTargets = Array.from(targets).filter(id => selected.has(id))
  const attainable = attainableTargetIds(fixture, targets)
  const securedAttainable = securedTargets.filter(id => attainable.has(id))
  const targetScore = targets.size === 0 ? null : boundedScore(
    (attainable.size ? securedAttainable.length / attainable.size : 1) * 80
    + (securedTargets.length / targets.size) * 20,
  )

  const valuableLimit = fixture.settings.numTeams * 10
  const eligibleHandcuffs = handcuffs.filter(relationship => {
    const starter = byId.get(relationship.starterPlayerId)
    const backup = byId.get(relationship.backupPlayerId)
    return starter?.position === FantasyPosition.RUNNING_BACK
      && backup?.position === FantasyPosition.RUNNING_BACK
      && backup.adp <= valuableLimit
      && selected.has(starter.id)
  })
  const securedHandcuffs = eligibleHandcuffs.filter(relationship =>
    selected.has(relationship.backupPlayerId))
  const handcuffScore = handcuffs.length === 0 || eligibleHandcuffs.length === 0
    ? null
    : boundedScore(securedHandcuffs.length / eligibleHandcuffs.length * 100)

  const categories: MockRosterScoreCategory[] = [
    {
      key: "tier_capital", label: "Tier capital", score: tierScore, weight: 30,
      explanation: "User-tier quality with starters weighted more heavily than bench depth.",
      evidence: POSITIONS.map(position => `${position}: ${Object.entries(tierCounts[position]).map(([tier, count]) => `${count} ${tier}`).join(", ") || "none"}`),
    },
    {
      key: "starter_quality", label: "Starter quality", score: starterScore, weight: 30,
      explanation: "Starter completeness and projected points above positional replacement.",
      evidence: [`${optimized.starterPlayerIds.length}/${optimized.requiredStarterSlots} starter slots`, `${starterVorpMean.toFixed(1)} average starter points above replacement`],
    },
    {
      key: "bench_upside", label: "Bench upside", score: benchScore, weight: 15,
      explanation: "Average captured projection ceiling above positional replacement.",
      evidence: [`${optimized.benchPlayerIds.length} bench players`, `${benchMean.toFixed(1)} average ceiling above replacement`],
    },
    {
      key: "target_conversion", label: "Target conversion", score: targetScore, weight: 15,
      explanation: targetScore === null ? "No targets were saved for this mock." : "Secured targets among all saved and actually attainable targets.",
      evidence: [`${securedTargets.length}/${targets.size} total targets`, `${securedAttainable.length}/${attainable.size} attainable targets`],
    },
    {
      key: "handcuff_value", label: "Valuable handcuffs", score: handcuffScore, weight: 10,
      explanation: handcuffScore === null ? "No top-ten-round configured-ADP backfield proxy was scoreable." : "Rostered same-team RB backups inferred by configured ADP inside the first ten rounds; this is not an official depth chart.",
      evidence: [`${securedHandcuffs.length}/${eligibleHandcuffs.length} valuable handcuffs secured`, `ADP cutoff ${valuableLimit}`],
    },
  ]
  const availableWeight = categories.reduce((sum, category) =>
    sum + (category.score === null ? 0 : category.weight), 0)
  const compositeScore = availableWeight === 0 ? 0 : boundedScore(
    categories.reduce((sum, category) =>
      sum + (category.score === null ? 0 : category.score * category.weight), 0) / availableWeight,
  )
  const metrics = buildRosterMetrics(
    fixture,
    validIds,
    optimized.starterPlayerIds,
    optimized.requiredStarterSlots,
  )
  return {
    schemaVersion: 1,
    compositeScore,
    selectedPlayerIds: validIds,
    starterPlayerIds: optimized.starterPlayerIds,
    benchPlayerIds: optimized.benchPlayerIds,
    tierCounts,
    ...metrics,
    categories,
  }
}

interface ReplayBranch {
  selected: Set<string>
  userPlayerIds: string[]
  picks: MockCounterfactualAlternative["picks"]
  opponentReplacements: MockCounterfactualAlternative["opponentReplacements"]
}

const branchHeuristic = (
  fixture: RecordedCompletedDraftReplay,
  branch: ReplayBranch,
  targets: Set<string>,
  byId: Map<string, RecordedReplayPlayer>,
): number => {
  const optimized = lineup(fixture, branch.userPlayerIds, byId)
  const starterIds = new Set(optimized.starterPlayerIds)
  let starterPar = 0
  let totalPar = 0
  let targetCount = 0
  branch.userPlayerIds.forEach(id => {
    const player = byId.get(id)!
    const par = player.projectedMedian - replacementFor(fixture, player.position)
    totalPar += par
    if (starterIds.has(id)) starterPar += par
    if (targets.has(id)) targetCount += 1
  })
  const turnsEarly = branch.picks.reduce((total, pick) => total + pick.turnsEarly, 0)
  return optimized.starterPlayerIds.length * 1_000
    + starterPar * 100
    + totalPar * 10
    + targetCount * 3
    - turnsEarly * 0.5
}

const orderedAvailable = (
  orderedPlayers: RecordedReplayPlayer[],
  selected: Set<string>,
): RecordedReplayPlayer[] => orderedPlayers.filter(player => !selected.has(player.id))

const candidateOrder = (
  fixture: RecordedCompletedDraftReplay,
  left: RecordedReplayPlayer,
  right: RecordedReplayPlayer,
): number => (right.projectedMedian - replacementFor(fixture, right.position))
  - (left.projectedMedian - replacementFor(fixture, left.position))
  || left.userTier - right.userTier
  || left.positionRank - right.positionRank
  || left.adp - right.adp
  || left.id.localeCompare(right.id)

/**
 * User tiers are positional, so a single cross-position slice can erase a
 * position from the beam even when a legal roster remains available. Keep
 * the best bounded overall choices plus four representatives per position.
 */
const boundedCandidatePool = (
  fixture: RecordedCompletedDraftReplay,
  candidates: RecordedReplayPlayer[],
  availability: Map<string, MockObservedAvailability>,
  userPickNumber: number,
  exactId?: string,
  requiredPosition?: ReviewPosition,
): RecordedReplayPlayer[] => {
  const ordered = candidates.sort((left, right) => candidateOrder(fixture, left, right))
  if (exactId) return ordered.slice(0, 1)
  if (requiredPosition) return ordered.slice(0, 10)
  const expiring = ordered.filter(player =>
    availability.get(player.id)?.latestSafeUserPickNumber === userPickNumber)
  const diverse = [
    ...ordered.slice(0, 12),
    ...expiring.slice(0, 8),
    ...POSITIONS.flatMap(position => ordered
      .filter(player => player.position === position)
      .slice(0, 6)),
  ]
  return Array.from(new Map(diverse.map(player => [player.id, player])).values())
    .sort((left, right) => candidateOrder(fixture, left, right))
}

const decisionEvidence = (
  fixture: RecordedCompletedDraftReplay,
  playerId: string | null | undefined,
): MockDecisionPlayerEvidence | null => {
  if (!playerId) return null
  const player = fixture.players.find(candidate => candidate.id === playerId)
  if (!player) return null
  return {
    playerId: player.id,
    name: player.name,
    position: player.position,
    positionRank: player.positionRank,
    tier: player.userTier,
    adp: player.adp,
    projectedMedian: rounded(player.projectedMedian),
    replacementPoints: rounded(replacementFor(fixture, player.position)),
    projectedPointsAboveReplacement: rounded(
      player.projectedMedian - replacementFor(fixture, player.position),
    ),
  }
}

const categoryDeltas = (
  actual: MockRosterScorecard,
  alternate: MockRosterScorecard,
): MockCounterfactualAlternative["categoryDeltas"] => actual.categories.map(category => {
  const candidate = alternate.categories.find(item => item.key === category.key)
  const alternateScore = candidate?.score ?? null
  return {
    key: category.key,
    label: category.label,
    actual: category.score,
    alternate: alternateScore,
    delta: category.score === null || alternateScore === null
      ? null
      : alternateScore - category.score,
  }
})

const decisionLedger = (
  fixture: RecordedCompletedDraftReplay,
  branch: ReplayBranch,
): MockDecisionLedgerEntry[] => {
  const actualPicks = fixture.actualPicks
    .filter(pick => pick.rosterIndex === fixture.targetRosterIndex
      && (pick.advisorEligible ?? pick.playerId !== null))
    .sort((left, right) => left.overallPick - right.overallPick)
  return branch.picks.map((pick, index) => {
    const actual = decisionEvidence(fixture, actualPicks[index]?.playerId)
    const alternate = decisionEvidence(fixture, pick.playerId)
    if (!alternate) throw new Error(`Alternate replay player ${pick.playerId} is unavailable`)
    return {
      userPickNumber: index + 1,
      overallPick: pick.overallPick,
      actual,
      alternate,
      changed: actual?.playerId !== alternate.playerId,
      reason: pick.reason,
      directOpponentCollisionAt: branch.opponentReplacements.find(replacement =>
        replacement.recordedPlayerId === alternate.playerId)?.overallPick ?? null,
      observedOverallPick: pick.latestSafeOverallPick === null
        ? null
        : fixture.actualPicks.find(candidate => candidate.playerId === pick.playerId)?.overallPick ?? null,
      latestSafeOverallPick: pick.latestSafeOverallPick,
      latestSafeUserPickNumber: pick.latestSafeUserPickNumber,
      turnsEarly: pick.turnsEarly,
    }
  })
}

const replayFidelity = (
  fixture: RecordedCompletedDraftReplay,
  branch: ReplayBranch,
  ledger: MockDecisionLedgerEntry[],
): MockReplayFidelity => {
  const opponentPickCount = fixture.actualPicks.filter(pick =>
    pick.rosterIndex !== fixture.targetRosterIndex && pick.playerId).length
  const collisionCount = branch.opponentReplacements.length
  const collisionRate = opponentPickCount ? rounded(collisionCount / opponentPickCount * 100) : 0
  const level: MockReplayFidelity["level"] = collisionCount <= 3 && collisionRate <= 5
    ? "high"
    : collisionRate <= 15
      ? "moderate"
      : "low"
  const explanation = level === "high"
    ? "The alternate stays close to the captured opponent board."
    : level === "moderate"
      ? "Some opponent picks required deterministic ADP replacements."
      : "Many opponent picks changed after alternate selections; treat this as a directional scenario."
  return {
    level,
    opponentPickCount,
    collisionCount,
    collisionRate,
    changedUserPickCount: ledger.filter(entry => entry.changed).length,
    explanation,
  }
}

export const reviewCompletedMock = ({
  fixture,
  targetPlayerIds = [],
  handcuffs: suppliedHandcuffs,
  request = {},
}: {
  fixture: RecordedCompletedDraftReplay
  targetPlayerIds?: string[]
  handcuffs?: HandcuffRelationship[]
  request?: MockCounterfactualRequest
}): MockDraftReview => {
  const handcuffs = suppliedHandcuffs ?? deriveHandcuffRelationships(fixture)
  const actual = scoreMockRoster({
    fixture,
    selectedPlayerIds: actualUserPlayerIds(fixture),
    targetPlayerIds,
    handcuffs,
  })
  const maxAlternatives = Math.max(1, Math.min(5, request.maxAlternatives || 5))
  const beamWidth = Math.max(20, Math.min(250, request.beamWidth || 120))
  const targetSet = new Set(targetPlayerIds)
  const playerById = new Map(fixture.players.map(player => [player.id, player]))
  const actualIds = actualUserPlayerIds(fixture)
  const observedAvailability = observedDraftAvailability(fixture)
  const availabilityById = new Map(observedAvailability.map(item => [item.playerId, item]))
  const playersByAdp = [...fixture.players]
    .sort((left, right) => left.adp - right.adp
      || left.positionRank - right.positionRank
      || left.id.localeCompare(right.id))
  let branches: ReplayBranch[] = [{selected: new Set(), userPlayerIds: [], picks: [], opponentReplacements: []}]
  let userPickNumber = 0
  const replayPicks = [...fixture.actualPicks]
    .sort((left, right) => left.overallPick - right.overallPick)
  const eligibleUserPickCount = replayPicks.filter(pick =>
    pick.rosterIndex === fixture.targetRosterIndex
      && (pick.advisorEligible ?? pick.playerId !== null),
  ).length

  replayPicks.forEach(recordedPick => {
      if (recordedPick.rosterIndex !== fixture.targetRosterIndex) {
        branches = branches.map(branch => {
          if (!recordedPick.playerId) return branch
          if (!branch.selected.has(recordedPick.playerId)) {
            const selected = new Set(branch.selected).add(recordedPick.playerId)
            return {...branch, selected}
          }
          const replacement = orderedAvailable(playersByAdp, branch.selected)[0]
          if (!replacement) return branch
          return {
            ...branch,
            selected: new Set(branch.selected).add(replacement.id),
            opponentReplacements: [...branch.opponentReplacements, {
              overallPick: recordedPick.overallPick,
              recordedPlayerId: recordedPick.playerId,
              replacementPlayerId: replacement.id,
            }],
          }
        })
        return
      }

      const advisorEligible = recordedPick.advisorEligible
        ?? recordedPick.playerId !== null
      if (!advisorEligible) return

      userPickNumber += 1
      const preservedId = userPickNumber <= (request.preservePicksThrough || 0)
        ? recordedPick.playerId || undefined
        : undefined
      const exactId = request.exactPlayerOverrides?.[userPickNumber] || preservedId
      const requiredPosition = request.positionSequence?.[userPickNumber - 1]
      const expanded = branches.flatMap(branch => {
        const available = orderedAvailable(playersByAdp, branch.selected)
          .filter(player => {
            const deadline = availabilityById.get(player.id)?.latestSafeUserPickNumber
            return deadline !== null && deadline !== undefined && deadline >= userPickNumber
          })
          .filter(player => !exactId || player.id === exactId)
          .filter(player => !requiredPosition || player.position === requiredPosition)
        let candidates = boundedCandidatePool(
          fixture,
          available,
          availabilityById,
          userPickNumber,
          exactId,
          requiredPosition,
        )
        const recordedPlayer = recordedPick.playerId
          ? playerById.get(recordedPick.playerId)
          : undefined
        const retainRecordedPick = candidates.length === 0
          && recordedPlayer !== undefined
          && !branch.selected.has(recordedPlayer.id)
          && (!exactId || exactId === recordedPlayer.id)
          && (!requiredPosition || requiredPosition === recordedPlayer.position)
        if (retainRecordedPick) candidates = [recordedPlayer]
        const recordedMatchesConstraints = recordedPlayer
          && !branch.selected.has(recordedPlayer.id)
          && (!exactId || exactId === recordedPlayer.id)
          && (!requiredPosition || requiredPosition === recordedPlayer.position)
          && (availabilityById.get(recordedPlayer.id)?.latestSafeUserPickNumber || 0)
            >= userPickNumber
        if (request.maxChangedPicks && recordedMatchesConstraints
          && !candidates.some(candidate => candidate.id === recordedPlayer.id)) {
          candidates = [...candidates, recordedPlayer]
        }
        return candidates.map(player => {
          const deadline = availabilityById.get(player.id)
          const latestSafeUserPickNumber = deadline?.latestSafeUserPickNumber ?? userPickNumber
          return {
            selected: new Set(branch.selected).add(player.id),
            userPlayerIds: [...branch.userPlayerIds, player.id],
            picks: [...branch.picks, {
              overallPick: recordedPick.overallPick,
              playerId: player.id,
              reason: request.exactPlayerOverrides?.[userPickNumber]
                ? "exact player override"
                : preservedId
                  ? "recorded pick preserved"
                  : requiredPosition
                    ? `${requiredPosition} position-sequence choice ranked by projected PAR`
                    : retainRecordedPick
                      ? "recorded pick retained when no eligible candidate remained"
                      : "PAR candidate available through its observed-draft deadline",
              latestSafeOverallPick: deadline?.latestSafeOverallPick ?? recordedPick.overallPick,
              latestSafeUserPickNumber,
              turnsEarly: Math.max(0, latestSafeUserPickNumber - userPickNumber),
            }],
            opponentReplacements: branch.opponentReplacements,
          }
        }).filter(branch => !request.maxChangedPicks
          || branch.userPlayerIds.reduce((count, id, index) =>
            count + (id === actualIds[index] ? 0 : 1), 0) <= request.maxChangedPicks)
      })
      const remainingUserPicks = eligibleUserPickCount - userPickNumber
      const feasibleBranches = expanded
        .filter(branch => {
          const optimized = lineup(fixture, branch.userPlayerIds, playerById)
          const missingStarterSlots = optimized.requiredStarterSlots
            - optimized.starterPlayerIds.length
          return missingStarterSlots <= remainingUserPicks
        })
      const orderedBranches = feasibleBranches
        .map(branch => ({
          branch,
          heuristic: branchHeuristic(fixture, branch, targetSet, playerById),
          stableKey: branch.userPlayerIds.join(":"),
        }))
        .sort((left, right) => right.heuristic - left.heuristic
          || left.stableKey.localeCompare(right.stableKey))
        .map(candidate => candidate.branch)
      branches = orderedBranches.slice(0, beamWidth)
    })

  const alternatives = branches.filter(branch => {
    const optimized = lineup(fixture, branch.userPlayerIds, playerById)
    const changedPickCount = branch.userPlayerIds.reduce((count, id, index) =>
      count + (id === actualIds[index] ? 0 : 1), 0)
    return optimized.starterPlayerIds.length === optimized.requiredStarterSlots
      && branch.userPlayerIds.join(":") !== actualIds.join(":")
      && (!request.maxChangedPicks || changedPickCount <= request.maxChangedPicks)
  }).map(branch => {
    const scorecard = scoreMockRoster({
      fixture,
      selectedPlayerIds: branch.userPlayerIds,
      targetPlayerIds,
      handcuffs,
    })
    const objective: MockPathObjective = {
      name: "starter_par_then_total_par_v1",
      starterProjectedPointsAboveReplacement:
        scorecard.totals.starterProjectedPointsAboveReplacement,
      benchProjectedPointsAboveReplacement:
        scorecard.totals.benchProjectedPointsAboveReplacement,
      totalProjectedPointsAboveReplacement:
        scorecard.totals.projectedPointsAboveReplacement,
      totalTurnsEarly: branch.picks.reduce((total, pick) => total + pick.turnsEarly, 0),
      earlySelectionCount: branch.picks.filter(pick => pick.turnsEarly > 0).length,
    }
    return {branch, scorecard, objective}
  }).sort((left, right) =>
    right.objective.starterProjectedPointsAboveReplacement
      - left.objective.starterProjectedPointsAboveReplacement
    || right.objective.totalProjectedPointsAboveReplacement
      - left.objective.totalProjectedPointsAboveReplacement
    || right.objective.benchProjectedPointsAboveReplacement
      - left.objective.benchProjectedPointsAboveReplacement
    || left.objective.totalTurnsEarly - right.objective.totalTurnsEarly
    || right.scorecard.compositeScore - left.scorecard.compositeScore
    || left.branch.userPlayerIds.join(":").localeCompare(right.branch.userPlayerIds.join(":")))
    .slice(0, maxAlternatives)
    .map(({branch, scorecard, objective}, index) => {
      const ledger = decisionLedger(fixture, branch)
      return {
        rank: index + 1,
        selectedPlayerIds: branch.userPlayerIds,
        picks: branch.picks,
        opponentReplacements: branch.opponentReplacements,
        scorecard,
        objective,
        compositeDelta: scorecard.compositeScore - actual.compositeScore,
        categoryDeltas: categoryDeltas(actual, scorecard),
        decisionLedger: ledger,
        replayFidelity: replayFidelity(fixture, branch, ledger),
      }
    })

  return {
    schemaVersion: 1,
    fixtureId: fixture.id,
    actual,
    alternatives,
    observedAvailability,
    assumptions: [
      "The captured league format and scoring settings remain authoritative; alternate formats are not inferred.",
      "A player remains available only through the last recorded user pick at or before his observed selection; undrafted players remain available through the final user pick.",
      "Recorded opponent picks remain fixed unless their player was already selected in the branch.",
      "Opponent collisions use the next undrafted configured-ADP player with stable tie-breaking.",
      "Candidate pruning and final ordering optimize captured-projection starter PAR first and total roster PAR second.",
      "Observed availability deadlines are used to defer valuable players to their latest safe recorded user pick when possible.",
      "Branches that cannot fill every remaining starter slot with their remaining picks are pruned.",
      "Roster uniqueness and final starter completeness remain mandatory.",
      "V1 handcuffs use the labeled configured-ADP backfield-order proxy, not an official depth chart.",
    ],
  }
}
