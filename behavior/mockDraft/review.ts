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
  categories: MockRosterScoreCategory[]
}

export interface MockCounterfactualRequest {
  positionSequence?: ReviewPosition[]
  exactPlayerOverrides?: Record<number, string>
  maxAlternatives?: number
  beamWidth?: number
}

export interface MockCounterfactualAlternative {
  rank: number
  selectedPlayerIds: string[]
  picks: Array<{overallPick: number; playerId: string; reason: string}>
  opponentReplacements: Array<{
    overallPick: number
    recordedPlayerId: string
    replacementPlayerId: string
  }>
  scorecard: MockRosterScorecard
  compositeDelta: number
}

export interface MockDraftReview {
  schemaVersion: 1
  fixtureId: string
  actual: MockRosterScorecard
  alternatives: MockCounterfactualAlternative[]
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
) => {
  const byId = new Map(fixture.players.map(player => [player.id, player]))
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
    .sort((left, right) => right.projectedMedian - left.projectedMedian || left.id.localeCompare(right.id))
    .slice(0, fixture.settings.numFlex)
  const starterPlayerIds = [...starters, ...flex].map(player => player.id)
  const starterSet = new Set(starterPlayerIds)
  return {
    starterPlayerIds,
    benchPlayerIds: selectedPlayerIds.filter(id => !starterSet.has(id)),
    requiredStarterSlots: Object.values(required).reduce((sum, value) => sum + value, 0)
      + fixture.settings.numFlex,
  }
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
  return {
    schemaVersion: 1,
    compositeScore,
    selectedPlayerIds: validIds,
    starterPlayerIds: optimized.starterPlayerIds,
    benchPlayerIds: optimized.benchPlayerIds,
    tierCounts,
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
): number => {
  const byId = new Map(fixture.players.map(player => [player.id, player]))
  const counts = Object.fromEntries(POSITIONS.map(position => [position, 0])) as Record<ReviewPosition, number>
  let value = 0
  branch.userPlayerIds.forEach(id => {
    const player = byId.get(id)!
    counts[player.position] += 1
    value += Math.max(0, 20 - player.userTier * 3) + (targets.has(id) ? 5 : 0)
  })
  const required: Record<ReviewPosition, number> = {
    QB: fixture.settings.numStartingQbs,
    RB: fixture.settings.numStartingRbs,
    WR: fixture.settings.numStartingWrs,
    TE: fixture.settings.numStartingTes,
  }
  POSITIONS.forEach(position => {
    value += Math.min(counts[position], required[position]) * 12
    value -= Math.max(0, counts[position] - required[position] - 2) * 8
  })
  return value
}

const orderedAvailable = (
  fixture: RecordedCompletedDraftReplay,
  selected: Set<string>,
): RecordedReplayPlayer[] => fixture.players
  .filter(player => !selected.has(player.id))
  .sort((left, right) => left.adp - right.adp || left.positionRank - right.positionRank || left.id.localeCompare(right.id))

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
  const maxAlternatives = Math.max(1, Math.min(3, request.maxAlternatives || 3))
  const beamWidth = Math.max(3, Math.min(40, request.beamWidth || 24))
  const targetSet = new Set(targetPlayerIds)
  let branches: ReplayBranch[] = [{selected: new Set(), userPlayerIds: [], picks: [], opponentReplacements: []}]
  let userPickNumber = 0

  ;[...fixture.actualPicks]
    .sort((left, right) => left.overallPick - right.overallPick)
    .forEach(recordedPick => {
      if (recordedPick.rosterIndex !== fixture.targetRosterIndex) {
        branches = branches.map(branch => {
          if (!recordedPick.playerId) return branch
          if (!branch.selected.has(recordedPick.playerId)) {
            const selected = new Set(branch.selected).add(recordedPick.playerId)
            return {...branch, selected}
          }
          const replacement = orderedAvailable(fixture, branch.selected)[0]
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
      const exactId = request.exactPlayerOverrides?.[userPickNumber]
      const requiredPosition = request.positionSequence?.[userPickNumber - 1]
      const expanded = branches.flatMap(branch => {
        const candidates = orderedAvailable(fixture, branch.selected)
          .filter(player => player.adp >= recordedPick.overallPick && player.adp < 999)
          .filter(player => !exactId || player.id === exactId)
          .filter(player => !requiredPosition || player.position === requiredPosition)
          .sort((left, right) => left.userTier - right.userTier || left.positionRank - right.positionRank || left.adp - right.adp || left.id.localeCompare(right.id))
          .slice(0, exactId ? 1 : 4)
        return candidates.map(player => ({
          selected: new Set(branch.selected).add(player.id),
          userPlayerIds: [...branch.userPlayerIds, player.id],
          picks: [...branch.picks, {
            overallPick: recordedPick.overallPick,
            playerId: player.id,
            reason: exactId
              ? "exact player override"
              : requiredPosition
                ? `${requiredPosition} position-sequence choice`
                : "best bounded user-tier choice predicted available by ADP",
          }],
          opponentReplacements: branch.opponentReplacements,
        }))
      })
      branches = expanded
        .sort((left, right) => branchHeuristic(fixture, right, targetSet) - branchHeuristic(fixture, left, targetSet)
          || left.userPlayerIds.join(":").localeCompare(right.userPlayerIds.join(":")))
        .slice(0, beamWidth)
    })

  const alternatives = branches.filter(branch => {
    const optimized = lineup(fixture, branch.userPlayerIds)
    return optimized.starterPlayerIds.length === optimized.requiredStarterSlots
  }).map(branch => {
    const scorecard = scoreMockRoster({
      fixture,
      selectedPlayerIds: branch.userPlayerIds,
      targetPlayerIds,
      handcuffs,
    })
    return {branch, scorecard}
  }).sort((left, right) => right.scorecard.compositeScore - left.scorecard.compositeScore
    || left.branch.userPlayerIds.join(":").localeCompare(right.branch.userPlayerIds.join(":")))
    .slice(0, maxAlternatives)
    .map(({branch, scorecard}, index) => ({
      rank: index + 1,
      selectedPlayerIds: branch.userPlayerIds,
      picks: branch.picks,
      opponentReplacements: branch.opponentReplacements,
      scorecard,
      compositeDelta: scorecard.compositeScore - actual.compositeScore,
    }))

  return {
    schemaVersion: 1,
    fixtureId: fixture.id,
    actual,
    alternatives,
    assumptions: [
      "Future availability requires configured overall-pick ADP greater than or equal to the user pick.",
      "Recorded opponent picks remain fixed unless their player was already selected in the branch.",
      "Opponent collisions use the next undrafted configured-ADP player with stable tie-breaking.",
      "User tiers drive bounded candidate ordering; roster uniqueness and final starter completeness remain mandatory.",
      "V1 handcuffs use the labeled configured-ADP backfield-order proxy, not an official depth chart.",
    ],
  }
}
