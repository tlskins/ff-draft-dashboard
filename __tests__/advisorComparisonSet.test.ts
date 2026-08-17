import {
  advisorComparisonSetSignature,
  buildAdvisorComparisonSet,
  createMaterialDraftEventKey,
} from "../behavior/advisorComparisonSet"
import type {
  DraftRecommendationCandidate,
  DraftRecommendationSet,
} from "../behavior/draft-advisor/recommendations"
import {
  FantasyPosition,
  NFLTeam,
  ThirdPartyADPRanker,
  ThirdPartyRanker,
} from "../types"
import type {FantasySettings, Player} from "../types"

const settings: FantasySettings = {
  ppr: true, numTeams: 12, numStartingQbs: 1, numStartingRbs: 2,
  numStartingWrs: 2, numStartingTes: 1, numFlex: 1, numBenchPlayers: 5,
}
const boardSettings = {
  ranker: ThirdPartyRanker.HARRIS,
  adpRanker: ThirdPartyADPRanker.ESPN,
}
const player = (
  id: string,
  position: FantasyPosition,
  rank: number,
  availability: Player["availability"] = undefined,
): Player => ({
  id, firstName: id, lastName: "Player", fullName: `${id} Player`,
  team: NFLTeam.BUF, position, availability,
  ranks: {[ThirdPartyRanker.HARRIS]: {
    playerId: id, ranker: ThirdPartyRanker.HARRIS, position,
    pprOverallRank: rank, standardOverallRank: rank,
    pprPositionRank: rank, standardPositionRank: rank,
  }},
})
const candidate = (
  item: Player,
  positionRank: number,
  tierLossIfDeferred = 0,
  survivalProbability = .5,
): DraftRecommendationCandidate => ({
  player: item,
  positionRank,
  score: 100 - positionRank,
  evidence: {
    projectedFloor: 10, projectedMedian: 15, projectedCeiling: 20,
    replacementLevel: 8, pointsAboveReplacement: 7,
    marginalLineupPoints: 4, benchUtility: 0, tierLossIfDeferred,
    survivalProbability, positionalRunProbability: 0,
    tierBoundaryProbability: 0, userTier: 1, projectionTier: 1,
    rosterRole: "open_starter", flags: tierLossIfDeferred > 0 ? ["User-tier cliff"] : [],
  },
})
const recommendations = (
  candidates: DraftRecommendationCandidate[],
  positionCandidates = candidates,
): DraftRecommendationSet => ({
  schemaVersion: 1, currentPick: 10, nextUserPick: 12,
  preferredView: "cross_position", viewExplanation: "Compare.",
  candidates, positionCandidates,
})

describe("Phase 14B advisor comparison selection", () => {
  it("preserves supplied recommendation order and caps the stable set at three", () => {
    const players = [
      player("third", FantasyPosition.TIGHT_END, 30),
      player("first", FantasyPosition.RUNNING_BACK, 10),
      player("fourth", FantasyPosition.QUARTERBACK, 40),
      player("second", FantasyPosition.WIDE_RECEIVER, 20),
    ]
    const result = buildAdvisorComparisonSet({
      recommendations: recommendations(players.map((item, index) => candidate(item, index + 1))),
      availablePlayers: [...players].reverse(), playerTargets: [], settings, boardSettings,
    })
    expect(result.map(item => item.player.id)).toEqual(["third", "first", "fourth"])
    expect(result.map(item => item.reasonLabel)).toEqual([
      "Recommended now", "Recommended now", "Recommended now",
    ])
  })

  it("uses deterministic tier-cliff urgency and tie-breaks after recommended-now", () => {
    const preferred = player("preferred", FantasyPosition.RUNNING_BACK, 1)
    const cliffLater = player("cliff-later", FantasyPosition.WIDE_RECEIVER, 3)
    const cliffFirst = player("cliff-first", FantasyPosition.QUARTERBACK, 2)
    const result = buildAdvisorComparisonSet({
      recommendations: recommendations(
        [candidate(preferred, 1)],
        [candidate(cliffLater, 3, 5, .5), candidate(cliffFirst, 2, 5, .5)],
      ),
      availablePlayers: [cliffLater, preferred, cliffFirst],
      playerTargets: [], settings, boardSettings,
    })
    expect(result.map(item => [item.player.id, item.reasonCode])).toEqual([
      ["preferred", "recommended_now"],
      ["cliff-first", "tier_cliff"],
      ["cliff-later", "tier_cliff"],
    ])
  })

  it("orders explicit targets by target round/rank and then uses top-position fallback", () => {
    const early = player("early", FantasyPosition.WIDE_RECEIVER, 7)
    const earlyBetterRank = player("early-better", FantasyPosition.RUNNING_BACK, 4)
    const topTe = player("top-te", FantasyPosition.TIGHT_END, 2)
    const result = buildAdvisorComparisonSet({
      recommendations: null,
      availablePlayers: [early, topTe, earlyBetterRank],
      playerTargets: [
        {playerId: early.id, targetAsEarlyAsRound: 5},
        {playerId: earlyBetterRank.id, targetAsEarlyAsRound: 5},
      ],
      settings, boardSettings,
    })
    expect(result.map(item => [item.player.id, item.reasonLabel])).toEqual([
      ["early-better", "User target"],
      ["early", "User target"],
      ["top-te", "Top TE"],
    ])
  })

  it("deduplicates and excludes drafted, missing, malformed, and ineligible players", () => {
    const valid = player("valid", FantasyPosition.RUNNING_BACK, 1)
    const drafted = player("drafted", FantasyPosition.WIDE_RECEIVER, 2)
    const ineligible = player("inactive", FantasyPosition.TIGHT_END, 3, {
      state: "inactive_confirmed", automaticRecommendationEligible: false,
      source: "catalog", reason: "retired",
    })
    const malformed = {...player("bad", FantasyPosition.QUARTERBACK, 4), fullName: ""}
    const result = buildAdvisorComparisonSet({
      recommendations: recommendations([
        candidate(drafted, 1), candidate(valid, 1), candidate(valid, 1),
        candidate(ineligible, 1), candidate(malformed, 1),
      ]),
      availablePlayers: [valid, ineligible, malformed],
      playerTargets: [{playerId: "missing", targetAsEarlyAsRound: 1}],
      settings, boardSettings,
    })
    expect(result.map(item => item.player.id)).toEqual(["valid"])
  })

  it("returns a useful subset and equivalent signatures for equivalent inputs", () => {
    const only = player("only", FantasyPosition.RUNNING_BACK, 1)
    const input = {
      recommendations: null,
      availablePlayers: [only], playerTargets: [], settings, boardSettings,
    }
    const first = buildAdvisorComparisonSet(input)
    const second = buildAdvisorComparisonSet({...input, availablePlayers: [{...only}]})
    expect(first).toHaveLength(1)
    expect(second).toEqual(first)
    expect(advisorComparisonSetSignature(second)).toBe(
      advisorComparisonSetSignature(first),
    )
  })

  it("defines material draft events from concrete pick additions, removals, and corrections", () => {
    expect(createMaterialDraftEventKey([null, "one", null]))
      .toBe(createMaterialDraftEventKey([null, "one", null]))
    expect(createMaterialDraftEventKey([null, "one", null]))
      .not.toBe(createMaterialDraftEventKey([null, "two", null]))
    expect(createMaterialDraftEventKey([null, "one", null]))
      .not.toBe(createMaterialDraftEventKey([null, null, null]))
    expect(createMaterialDraftEventKey([null, "one", null]))
      .not.toBe(createMaterialDraftEventKey([null, "one", "two"]))
  })
})
