import recordedFixtureJson from "./fixtures/recorded-espn-2026-07-31-league-1788370838-slot-1.json"
import fixture from "./fixtures/opponent-model-replay.json"
import {
  createRecordedDraftAdvisorContextAtBoundary,
} from "../behavior/draft-advisor/completedDraftReplay"
import {
  createOpponentForecast,
  marginalScarcityPositionResiduals,
} from "../behavior/draft-advisor/opponentModel"
import {
  replayRecordedOpponentModel,
  runRecordedOpponentModelReplay,
  leagueFormatFor,
} from "../behavior/draft-advisor/replayMetrics"
import type {
  RecordedCompletedDraftReplay,
} from "../behavior/draft-advisor/completedDraftReplay"
import type { OpponentReplayCase } from "../behavior/draft-advisor/replayMetrics"
import type { DraftAdvisorContext } from "../behavior/draft-advisor/types"
import { FantasyPosition } from "../types"

const cases = fixture.cases as unknown as OpponentReplayCase[]
const recorded = recordedFixtureJson as unknown as RecordedCompletedDraftReplay

const probabilityFor = (
  context: DraftAdvisorContext,
  position: FantasyPosition,
  residual = false,
): number => createOpponentForecast(context, {
  model: "combined_v2",
  targetRosterIndex: 0,
  ...(residual ? {
    combinedV2Config: {
      id: "test_marginal_scarcity",
      adpWeight: 0.55,
      directNeedWeight: 0.35,
      formatFlexPressureWeight: 0,
      recentRunWeight: 0.1,
      formatAdjustment: { kind: "marginal_scarcity_v1", strength: 0.5 },
    },
  } : {}),
}).picks[0].positionProbabilities.find(item => item.position === position)
  ?.probability || 0

const formatContext = (): DraftAdvisorContext => ({
  ...cases[0].context,
  upcomingSlots: [
    { overallPick: 2, rosterIndex: 1 },
    { overallPick: 3, rosterIndex: 0 },
  ],
  rosterFormat: {
    startingQbs: 1,
    startingRbs: 2,
    startingWrs: 2,
    startingTes: 1,
    flex: 0,
    bench: 5,
  },
  teams: [0, 1, 2].map(rosterIndex => ({
    rosterIndex,
    draftedPlayerIds: [],
    draftedPositionCounts: [
      { position: FantasyPosition.QUARTERBACK, count: 0 },
      { position: FantasyPosition.RUNNING_BACK, count: 0 },
      { position: FantasyPosition.WIDE_RECEIVER, count: 0 },
      { position: FantasyPosition.TIGHT_END, count: 0 },
    ],
    needs: [
      { position: FantasyPosition.QUARTERBACK, openStarterSpots: 1 },
      { position: FantasyPosition.RUNNING_BACK, openStarterSpots: 2 },
      { position: FantasyPosition.WIDE_RECEIVER, openStarterSpots: 2 },
      { position: FantasyPosition.TIGHT_END, openStarterSpots: 1 },
    ],
  })),
})

describe("format-aware opponent challenger", () => {
  it("raises RB probability when the league requires an extra direct RB starter", () => {
    const base = formatContext()
    const extraRb: DraftAdvisorContext = {
      ...base,
      rosterFormat: { ...base.rosterFormat!, startingRbs: 3 },
      teams: base.teams.map(team => ({
        ...team,
        needs: team.needs.map(need => need.position === FantasyPosition.RUNNING_BACK
          ? { ...need, openStarterSpots: 3 }
          : need),
      })),
    }

    expect(probabilityFor(extraRb, FantasyPosition.RUNNING_BACK, true))
      .toBeGreaterThan(probabilityFor(base, FantasyPosition.RUNNING_BACK, true))
  })

  it("raises QB probability for 2QB direct demand", () => {
    const base = formatContext()
    const twoQb: DraftAdvisorContext = {
      ...base,
      rosterFormat: { ...base.rosterFormat!, startingQbs: 2 },
      teams: base.teams.map(team => ({
        ...team,
        needs: team.needs.map(need => need.position === FantasyPosition.QUARTERBACK
          ? { ...need, openStarterSpots: 2 }
          : need),
      })),
    }
    expect(probabilityFor(twoQb, FantasyPosition.QUARTERBACK, true))
      .toBeGreaterThan(probabilityFor(base, FantasyPosition.QUARTERBACK, true))
  })

  it("assigns flex pressure only to RB, WR, and TE", () => {
    const base = formatContext()
    const filledDirectStarters: DraftAdvisorContext = {
      ...base,
      teams: base.teams.map(team => ({
        ...team,
        draftedPlayerIds: Array.from({ length: 6 }, (_, index) =>
          `${team.rosterIndex}-${index}`),
        draftedPositionCounts: [
          { position: FantasyPosition.QUARTERBACK, count: 1 },
          { position: FantasyPosition.RUNNING_BACK, count: 2 },
          { position: FantasyPosition.WIDE_RECEIVER, count: 2 },
          { position: FantasyPosition.TIGHT_END, count: 1 },
        ],
        needs: team.needs.map(need => ({ ...need, openStarterSpots: 0 })),
      })),
    }
    const withFlex: DraftAdvisorContext = {
      ...filledDirectStarters,
      rosterFormat: { ...filledDirectStarters.rosterFormat!, flex: 2 },
    }

    expect(probabilityFor(withFlex, FantasyPosition.RUNNING_BACK))
      .toBeGreaterThan(probabilityFor(filledDirectStarters, FantasyPosition.RUNNING_BACK))
    expect(probabilityFor(withFlex, FantasyPosition.WIDE_RECEIVER))
      .toBeGreaterThan(probabilityFor(filledDirectStarters, FantasyPosition.WIDE_RECEIVER))
    expect(probabilityFor(withFlex, FantasyPosition.TIGHT_END))
      .toBeGreaterThan(probabilityFor(filledDirectStarters, FantasyPosition.TIGHT_END))
    expect(probabilityFor(withFlex, FantasyPosition.QUARTERBACK))
      .toBeLessThan(probabilityFor(filledDirectStarters, FantasyPosition.QUARTERBACK))

    const qbSurplus: DraftAdvisorContext = {
      ...withFlex,
      teams: withFlex.teams.map(team => ({
        ...team,
        draftedPositionCounts: team.draftedPositionCounts!.map(count =>
          count.position === FantasyPosition.QUARTERBACK
            ? { ...count, count: 4 }
            : count),
      })),
    }
    expect(createOpponentForecast(qbSurplus, {
      model: "combined_v2", targetRosterIndex: 0,
    }).picks[0].positionProbabilities).toEqual(createOpponentForecast(withFlex, {
      model: "combined_v2", targetRosterIndex: 0,
    }).picks[0].positionProbabilities)
  })

  it("uses fixed PPR flex allocations without changing direct demand", () => {
    const base = formatContext()
    const flexOnly: DraftAdvisorContext = {
      ...base,
      rosterFormat: { ...base.rosterFormat!, flex: 2 },
      teams: base.teams.map(team => ({
        ...team,
        draftedPositionCounts: [
          { position: FantasyPosition.QUARTERBACK, count: 1 },
          { position: FantasyPosition.RUNNING_BACK, count: 2 },
          { position: FantasyPosition.WIDE_RECEIVER, count: 2 },
          { position: FantasyPosition.TIGHT_END, count: 1 },
        ],
        needs: team.needs.map(need => ({ ...need, openStarterSpots: 0 })),
      })),
    }
    const standard = { ...flexOnly, league: { ...flexOnly.league, ppr: false } }
    const ppr = { ...flexOnly, league: { ...flexOnly.league, ppr: true } }
    const forPosition = (context: DraftAdvisorContext, position: FantasyPosition) =>
      marginalScarcityPositionResiduals(context).find(item => item.position === position)!

    expect(forPosition(ppr, FantasyPosition.QUARTERBACK).allocatedFlexDemand).toBe(0)
    expect(forPosition(ppr, FantasyPosition.WIDE_RECEIVER).allocatedFlexDemand)
      .toBeGreaterThan(forPosition(standard, FantasyPosition.WIDE_RECEIVER).allocatedFlexDemand)
    expect(forPosition(ppr, FantasyPosition.WIDE_RECEIVER).residual)
      .toBeGreaterThan(forPosition(standard, FantasyPosition.WIDE_RECEIVER).residual)
    expect(forPosition(ppr, FantasyPosition.RUNNING_BACK).allocatedFlexDemand)
      .toBeLessThan(forPosition(standard, FantasyPosition.RUNNING_BACK).allocatedFlexDemand)
    expect(forPosition(ppr, FantasyPosition.WIDE_RECEIVER).directDemand)
      .toBe(forPosition(standard, FantasyPosition.WIDE_RECEIVER).directDemand)
  })

  it("increases RB scarcity pressure when available RB supply is reduced", () => {
    const base = formatContext()
    const reducedSupply: DraftAdvisorContext = {
      ...base,
      availablePlayers: base.availablePlayers.filter(player =>
        player.position !== FantasyPosition.RUNNING_BACK),
    }
    const residualFor = (context: DraftAdvisorContext) => marginalScarcityPositionResiduals(context)
      .find(item => item.position === FantasyPosition.RUNNING_BACK)!.residual
    expect(residualFor(reducedSupply)).toBeGreaterThan(residualFor(base))
  })

  it("is exactly neutral after all direct and flex demand is filled", () => {
    const base = formatContext()
    const filled: DraftAdvisorContext = {
      ...base,
      rosterFormat: { ...base.rosterFormat!, flex: 1 },
      teams: base.teams.map(team => ({
        ...team,
        draftedPositionCounts: [
          { position: FantasyPosition.QUARTERBACK, count: 1 },
          { position: FantasyPosition.RUNNING_BACK, count: 3 },
          { position: FantasyPosition.WIDE_RECEIVER, count: 2 },
          { position: FantasyPosition.TIGHT_END, count: 1 },
        ],
        needs: team.needs.map(need => ({ ...need, openStarterSpots: 0 })),
      })),
    }
    const residual = marginalScarcityPositionResiduals(filled)
    expect(residual.every(item => item.residual === 0)).toBe(true)
    expect(createOpponentForecast(filled, {
      model: "combined_v2", targetRosterIndex: 0,
      combinedV2Config: {
        id: "neutral", adpWeight: 0.55, directNeedWeight: 0.35,
        formatFlexPressureWeight: 0, recentRunWeight: 0.1,
        formatAdjustment: { kind: "marginal_scarcity_v1", strength: 0.5 },
      },
    }).picks).toEqual(createOpponentForecast(filled, {
      model: "combined", targetRosterIndex: 0,
    }).picks)
  })

  it("keeps residual forecasts bounded, normalized, and deterministic", () => {
    const base = formatContext()
    const first = createOpponentForecast(base, {
      model: "combined_v2", targetRosterIndex: 0,
      combinedV2Config: {
        id: "bounded", adpWeight: 0.55, directNeedWeight: 0.35,
        formatFlexPressureWeight: 0, recentRunWeight: 0.1,
        formatAdjustment: { kind: "marginal_scarcity_v1", strength: 0.5 },
      },
    })
    const repeated = createOpponentForecast(base, {
      model: "combined_v2", targetRosterIndex: 0,
      combinedV2Config: {
        id: "bounded", adpWeight: 0.55, directNeedWeight: 0.35,
        formatFlexPressureWeight: 0, recentRunWeight: 0.1,
        formatAdjustment: { kind: "marginal_scarcity_v1", strength: 0.5 },
      },
    })
    expect(first).toEqual(repeated)
    first.picks.forEach(pick => {
      expect(pick.positionProbabilities.reduce((sum, item) => sum + item.probability, 0))
        .toBeCloseTo(1)
      pick.positionProbabilities.forEach(item => {
        expect(item.probability).toBeGreaterThanOrEqual(0)
        expect(item.probability).toBeLessThanOrEqual(1)
      })
    })
    const zeroStrength = createOpponentForecast(base, {
      model: "combined_v2", targetRosterIndex: 0,
      combinedV2Config: {
        id: "zero", adpWeight: 0.55, directNeedWeight: 0.35,
        formatFlexPressureWeight: 0, recentRunWeight: 0.1,
        formatAdjustment: { kind: "marginal_scarcity_v1", strength: 0 },
      },
    })
    const frozen = createOpponentForecast(base, {
      model: "combined", targetRosterIndex: 0,
    })
    expect(zeroStrength.picks).toEqual(frozen.picks)
    expect(zeroStrength.runProbabilities).toEqual(frozen.runProbabilities)
    expect(zeroStrength.tierBoundaryProbabilities).toEqual(frozen.tierBoundaryProbabilities)
  })

  it("reconstructs an observation without reading future selected players", () => {
    const boundary = recorded.forecastEvidence!.observations[0]
      .observedThroughOverallPick
    const altered = JSON.parse(JSON.stringify(recorded)) as RecordedCompletedDraftReplay
    const future = altered.actualPicks.filter(pick => pick.overallPick > boundary
      && pick.playerId)
    const first = future[0]
    const second = future[1]
    const firstPlayerId = first.playerId
    first.playerId = second.playerId
    second.playerId = firstPlayerId

    expect(createRecordedDraftAdvisorContextAtBoundary(recorded, boundary))
      .toEqual(createRecordedDraftAdvisorContextAtBoundary(altered, boundary))
  })

  it("replays v2 deterministically at the stored observation windows", () => {
    const first = replayRecordedOpponentModel(recorded, "combined_v2")
    const repeated = replayRecordedOpponentModel(recorded, "combined_v2")

    expect(first).toEqual(repeated)
    expect(first).toMatchObject({ available: true, labeledWindowCount: 6 })
  })

  it("skips unlabeled fixtures but fails closed on a malformed labeled fixture", () => {
    const unlabeled = JSON.parse(JSON.stringify(recorded)) as RecordedCompletedDraftReplay
    delete unlabeled.forecastEvidence
    expect(runRecordedOpponentModelReplay([recorded, unlabeled], "combined_v2"))
      .toMatchObject({ available: true, labeledFixtureCount: 1 })

    const malformed = JSON.parse(JSON.stringify(recorded)) as RecordedCompletedDraftReplay
    malformed.forecastEvidence!.observations[0].forecast.picks = []
    expect(runRecordedOpponentModelReplay([recorded, malformed], "combined_v2"))
      .toMatchObject({ available: false })
  })

  it("groups every roster-format dimension separately", () => {
    const differentRosterShape: RecordedCompletedDraftReplay = {
      ...recorded,
      settings: {
        ...recorded.settings,
        numStartingRbs: recorded.settings.numStartingRbs + 1,
        numStartingTes: recorded.settings.numStartingTes + 1,
        numBenchPlayers: recorded.settings.numBenchPlayers + 2,
      },
    }

    expect(leagueFormatFor(recorded)).toContain(
      `-QB${recorded.settings.numStartingQbs}`
      + `-RB${recorded.settings.numStartingRbs}`
      + `-WR${recorded.settings.numStartingWrs}`
      + `-TE${recorded.settings.numStartingTes}`
      + `-flex-${recorded.settings.numFlex}`
      + `-bench-${recorded.settings.numBenchPlayers}`,
    )
    expect(leagueFormatFor(differentRosterShape)).not.toBe(leagueFormatFor(recorded))
  })
})
