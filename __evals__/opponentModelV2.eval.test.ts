import slotSixFixtureJson from "../__tests__/fixtures/recorded-espn-2026-slot-6-10-team-standard.json"
import slotOneFixtureJson from "../__tests__/fixtures/recorded-espn-2026-07-31-league-1788370838-slot-1.json"
import { compareRecordedOpponentModels } from "../behavior/draft-advisor/replayMetrics"
import type { RecordedCompletedDraftReplay } from "../behavior/draft-advisor/completedDraftReplay"

const fixtures = [
  slotSixFixtureJson,
  slotOneFixtureJson,
] as unknown as RecordedCompletedDraftReplay[]

describe("opponent-model v2 recorded challenger", () => {
  it("reports leakage-safe v1/v2 deltas without promoting v2", () => {
    const report = compareRecordedOpponentModels(fixtures)
    if (process.env.V2_OPPONENT_REPORT === "1") {
      console.log(JSON.stringify(report, null, 2))
    }

    expect(report).toMatchObject({
      available: true,
      v1: { labeledFixtureCount: 2, labeledWindowCount: 21, labeledPickCount: 191 },
      v2: { labeledFixtureCount: 2, labeledWindowCount: 21, labeledPickCount: 191 },
    })
    if (!report.available) throw new Error(report.reason)
    expect(report.byFixture).toHaveLength(2)
    expect(report.byLeagueFormat).toHaveLength(2)
    // Match the campaign's pick/window-weighted v1 aggregate exactly enough
    // to catch a regression that averages 15- and 6-window fixtures equally.
    expect(report.storedV1.metrics.evaluatedPicks).toBe(191)
    expect(report.storedV1.metrics.positionBrierScore)
      .toBeCloseTo(0.7089208326563738)
    expect(report.storedV1.metrics.topPositionAccuracy)
      .toBeCloseTo(0.33507853403141363)
    expect(report.storedV1.metrics.playerTopThreeAccuracy)
      .toBeCloseTo(0.225130890052356)
    expect(report.storedV1.metrics.runPrecision)
      .toBeCloseTo(0.5992063492063492)
    expect(report.storedV1.metrics.runRecall)
      .toBeCloseTo(0.7142857142857143)
    expect(report.storedV1.metrics.tierCrossingBrierScore)
      .toBeCloseTo(0.08314228140458517)
  })
})
