import slotOneFixtureJson from "../__tests__/fixtures/recorded-espn-2026-07-31-league-1788370838-slot-1.json"
import slotEightFixtureJson from "../__tests__/fixtures/recorded-espn-2026-07-31-league-510719609-slot-8.json"
import slotThreeFixtureJson from "../__tests__/fixtures/recorded-espn-2026-slot-3-12-team-standard.json"
import slotSixFixtureJson from "../__tests__/fixtures/recorded-espn-2026-slot-6-10-team-standard.json"
import slotNineFixtureJson from "../__tests__/fixtures/recorded-espn-2026-slot-9.json"
import {
  runEmpiricalBaseShadowEvaluation,
} from "../behavior/draft-advisor/empiricalBaseShadowMetrics"
import type { RecordedCompletedDraftReplay } from "../behavior/draft-advisor/completedDraftReplay"

describe("empirical learned-base shadow evidence", () => {
  it("fails closed until a newly captured fixture contains matching shadow labels", () => {
    const report = runEmpiricalBaseShadowEvaluation([
      slotOneFixtureJson,
      slotThreeFixtureJson,
      slotSixFixtureJson,
      slotEightFixtureJson,
      slotNineFixtureJson,
    ] as unknown as RecordedCompletedDraftReplay[])
    if (process.env.EMPIRICAL_BASE_SHADOW_REPORT === "1") {
      console.log(JSON.stringify(report, null, 2))
    }
    expect(report.available).toBe(false)
    expect(report.promotion.promoted).toBe(false)
  })
})
