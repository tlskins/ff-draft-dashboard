import fixture from "../__tests__/fixtures/completed-draft-replay.json"
import recordedEspnFixture from "../__tests__/fixtures/recorded-espn-2026-slot-9.json"
import {
  auditPhase4Calibration,
  runCompletedDraftCalibrationMatrix,
} from "../behavior/draft-advisor/calibrationMatrix"
import type {
  RecordedCompletedDraftReplay,
} from "../behavior/draft-advisor/completedDraftReplay"

const replay = fixture as unknown as RecordedCompletedDraftReplay
const recordedReplay =
  recordedEspnFixture as unknown as RecordedCompletedDraftReplay
const syntheticScenarios = Array.from(
  { length: replay.settings.numTeams },
  (_, targetRosterIndex) => ({
    id: `${replay.id}-slot-${targetRosterIndex + 1}`,
    fixture: {
      ...replay,
      id: `${replay.id}-slot-${targetRosterIndex + 1}`,
      targetRosterIndex,
    },
  }),
)
const scenarios = [
  ...syntheticScenarios,
  {
    id: recordedReplay.id,
    fixture: recordedReplay,
  },
]

describe("Phase 4 completed-draft calibration matrix", () => {
  it("reports calculation and quality gates across every snake slot", () => {
    const matrix = runCompletedDraftCalibrationMatrix(scenarios)
    if (process.env.PHASE4_REPORT === "1") {
      console.log(JSON.stringify({
        scenarioCount: matrix.scenarioCount,
        recordedReplayCount: matrix.recordedReplayCount,
        distinctDraftSlots: matrix.distinctDraftSlots,
        combined: matrix.combined,
        benchCeilingByFixture: scenarios.map(scenario => ({
          fixtureId: scenario.fixture.id,
          strategies: matrix.results
            .filter(result => result.fixtureId === scenario.fixture.id)
            .map(result => ({
              strategy: result.strategy,
              starterCompleteness: result.quality.starterCompleteness,
              benchCeiling: result.quality.benchCeiling,
            })),
        })),
        recordedResults: matrix.results
          .filter(result => result.fixtureId === recordedReplay.id)
          .map(result => ({
            strategy: result.strategy,
            selectedPlayerIds: result.selectedPlayerIds,
            quality: result.quality,
            positionalRankViolations: result.positionalRankViolations,
            decisionLatencyP95Ms: result.decisionLatencyP95Ms,
          })),
        audit: auditPhase4Calibration(matrix),
      }, null, 2))
    }

    expect(matrix.scenarioCount).toBe(5)
    expect(matrix.recordedReplayCount).toBe(1)
    expect(matrix.results).toHaveLength(20)
    expect(matrix.distinctDraftSlots).toBe(1)
    expect(matrix.combined.legalRate).toBe(1)
    expect(matrix.combined.minimumStarterCompleteness).toBe(1)
    expect(matrix.combined.positionalRankViolations).toBe(0)
    expect(matrix.combined.maximumDecisionLatencyP95Ms).toBeLessThan(150)
    expect(matrix.combined.minimumVsBestStarterRatio)
      .toBeGreaterThanOrEqual(0.9)
    expect(matrix.combined.minimumVsBestBenchRatio)
      .toBeGreaterThanOrEqual(0.9)
  })

  it("does not claim calibration readiness without recorded mocks", () => {
    const audit = auditPhase4Calibration(
      runCompletedDraftCalibrationMatrix(scenarios),
    )

    expect(audit.ready).toBe(false)
    expect(audit.unmet).toContain("recorded replays 1/5")
    expect(audit.unmet).toContain("draft slots 1/4")
    expect(audit.unmet).not.toContain(
      "combined replay fell below the bench-upside floor",
    )
  })
})
