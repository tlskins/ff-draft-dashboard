import slotOneFixtureJson from "../__tests__/fixtures/recorded-espn-2026-07-31-league-1788370838-slot-1.json"
import slotEightFixtureJson from "../__tests__/fixtures/recorded-espn-2026-07-31-league-510719609-slot-8.json"
import slotThreeFixtureJson from "../__tests__/fixtures/recorded-espn-2026-slot-3-12-team-standard.json"
import slotSixFixtureJson from "../__tests__/fixtures/recorded-espn-2026-slot-6-10-team-standard.json"
import slotNineFixtureJson from "../__tests__/fixtures/recorded-espn-2026-slot-9.json"
import { runStaticWindowBacktest } from "../behavior/draft-advisor/staticWindowBacktest"
import type { RecordedCompletedDraftReplay } from "../behavior/draft-advisor/completedDraftReplay"

const fixtures = [
  slotOneFixtureJson,
  slotThreeFixtureJson,
  slotSixFixtureJson,
  slotEightFixtureJson,
  slotNineFixtureJson,
] as unknown as RecordedCompletedDraftReplay[]

const withPoisonedNestedPick = (
  fixture: RecordedCompletedDraftReplay,
): RecordedCompletedDraftReplay => {
  const poisoned = JSON.parse(JSON.stringify(fixture)) as RecordedCompletedDraftReplay
  poisoned.id = `${fixture.id}:poisoned-nested-pick`
  const first = poisoned.actualPicks.find(pick => pick.playerId)!
  const later = poisoned.actualPicks.find(pick =>
    pick.overallPick > first.overallPick && pick.playerId)!
  later.playerId = first.playerId
  return poisoned
}

describe("offline canonical static-window backtest", () => {
  it("runs leakage-safe LODO learned-base evaluation without promotion", () => {
    const report = runStaticWindowBacktest(fixtures)
    if (process.env.STATIC_WINDOW_BACKTEST_REPORT === "1") {
      if (process.env.STATIC_WINDOW_BACKTEST_COMPACT === "1") {
        const compactModel = (model: typeof report.primary.frozenV1) => ({
          pickMetrics: model.pickMetrics,
          runAtHalf: model.runMetrics.thresholds.find(metric => metric.threshold === 0.5),
          positionDiagnostics: model.positionDiagnostics,
        })
        console.log(JSON.stringify({
          primary: {
            frozenV1: compactModel(report.primary.frozenV1),
            learnedBaseLodo: compactModel(report.primary.learnedBaseLodo),
            learnedResidualLodo: compactModel(report.primary.learnedResidualLodo),
          },
          byActualPosition: report.byActualPosition.map(group => ({
            position: group.key,
            frozenV1Recall: group.frozenV1.pickMetrics.topPositionAccuracy,
            learnedBaseRecall: group.learnedBaseLodo.pickMetrics.topPositionAccuracy,
            learnedResidualRecall: group.learnedResidualLodo.pickMetrics.topPositionAccuracy,
          })),
          residualGate: report.residualGate,
        }, null, 2))
      } else {
        const compact = (group: typeof report.primary) => ({
          key: group.key,
          fixtureCount: group.fixtureCount,
          canonicalWindowCount: group.canonicalWindowCount,
          labelCount: group.labelCount,
          frozenV1: group.frozenV1.pickMetrics,
          learnedBaseLodo: group.learnedBaseLodo.pickMetrics,
          learnedResidualLodo: group.learnedResidualLodo.pickMetrics,
          fullDataArtifactDescriptive: group.fullDataArtifactDescriptive.pickMetrics,
        })
        console.log(JSON.stringify({
          policy: report.policy,
          coverage: report.coverage,
          primary: report.primary,
          byFixture: report.byFixture.map(fixture => ({
            fixtureId: fixture.fixtureId,
            leagueFormat: fixture.leagueFormat,
            canonicalWindowCount: fixture.canonicalWindows.length,
            labelCount: fixture.labelCount,
            lodoTrainingFixtureIds: fixture.lodoTrainingFixtureIds,
            frozenV1: fixture.frozenV1.pickMetrics,
            learnedBaseLodo: fixture.learnedBaseLodo.pickMetrics,
            learnedResidualLodo: fixture.learnedResidualLodo.pickMetrics,
          })),
          byLeagueFormat: report.byLeagueFormat.map(compact),
          byDraftPhase: report.byDraftPhase.map(compact),
          byActualPosition: report.byActualPosition.map(compact),
          skippedFixtures: report.skippedFixtures,
          residualGate: report.residualGate,
          promotion: report.promotion,
        }, null, 2))
      }
    }
    expect(report.available).toBe(true)
    expect(report.byFixture).toHaveLength(5)
    expect(report.primary.learnedBaseLodo.pickMetrics.evaluatedPicks)
      .toBe(report.primary.frozenV1.pickMetrics.evaluatedPicks)
    expect(report.primary.learnedResidualLodo.pickMetrics.evaluatedPicks)
      .toBe(report.primary.frozenV1.pickMetrics.evaluatedPicks)
    expect(report.primary.learnedResidualLodo.positionDiagnostics.predictedCounts)
      .toEqual(expect.objectContaining({ QB: expect.any(Number), RB: expect.any(Number), WR: expect.any(Number), TE: expect.any(Number) }))
    expect(report.byFixture.every(fixture =>
      !fixture.lodoTrainingFixtureIds.includes(fixture.fixtureId))).toBe(true)
    expect(report.promotion.promoted).toBe(false)
    const withMalformed = runStaticWindowBacktest([
      ...fixtures,
      withPoisonedNestedPick(fixtures[0]),
    ])
    expect(withMalformed.available).toBe(true)
    expect(withMalformed.primary).toEqual(report.primary)
    expect(withMalformed.byFixture).toEqual(report.byFixture)
    expect(withMalformed.skippedFixtures).toHaveLength(1)
    expect(withMalformed.skippedFixtures[0].fixtureId)
      .toBe(`${fixtures[0].id}:poisoned-nested-pick`)
    expect(withMalformed.skippedFixtures[0].reason).toContain("corpus preparation failed")
  })
})
