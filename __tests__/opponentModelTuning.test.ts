import slotSixFixtureJson from "./fixtures/recorded-espn-2026-slot-6-10-team-standard.json"
import slotOneFixtureJson from "./fixtures/recorded-espn-2026-07-31-league-1788370838-slot-1.json"
import {
  createOpponentForecast,
  validateOpponentModelBlendConfig,
} from "../behavior/draft-advisor/opponentModel"
import {
  evaluatePreparedOpponentCandidate,
  OPPONENT_V2_SEARCH_CANDIDATES,
  prepareRecordedOpponentReplay,
  runOpponentV2Tuning,
  selectOpponentV2Candidate,
  V1_EQUIVALENT_CANDIDATE,
} from "../behavior/draft-advisor/opponentModelTuning"
import { replayRecordedOpponentModel } from "../behavior/draft-advisor/replayMetrics"
import type { RecordedCompletedDraftReplay } from "../behavior/draft-advisor/completedDraftReplay"

const fixtures = [slotSixFixtureJson, slotOneFixtureJson] as unknown as RecordedCompletedDraftReplay[]

describe("opponent v2 tuning harness", () => {
  it("validates normalized explicit source blends", () => {
    expect(validateOpponentModelBlendConfig({
      id: "scaled",
      adpWeight: 2,
      directNeedWeight: 1,
      formatFlexPressureWeight: 1,
      recentRunWeight: 0,
    })).toMatchObject({
      adpWeight: 0.5,
      directNeedWeight: 0.25,
      formatFlexPressureWeight: 0.25,
    })
    expect(() => validateOpponentModelBlendConfig({
      id: "invalid",
      adpWeight: -1,
      directNeedWeight: 0,
      formatFlexPressureWeight: 0,
      recentRunWeight: 0,
    })).toThrow("invalid weights")
    expect(() => validateOpponentModelBlendConfig({
      id: "too-strong",
      adpWeight: 1,
      directNeedWeight: 0,
      formatFlexPressureWeight: 0,
      recentRunWeight: 0,
      formatAdjustment: { kind: "marginal_scarcity_v1", strength: 0.51 },
    })).toThrow("invalid format adjustment")
    expect(() => validateOpponentModelBlendConfig({
      id: "mixed-old-source",
      adpWeight: 0.5,
      directNeedWeight: 0.35,
      formatFlexPressureWeight: 0.05,
      recentRunWeight: 0.1,
      formatAdjustment: { kind: "marginal_scarcity_v1", strength: 0.1 },
    })).toThrow("requires v1-equivalent base weights")
  })

  it("reuses leakage-safe boundaries and reproduces the rebuilt v1 candidate", () => {
    const prepared = prepareRecordedOpponentReplay(fixtures)
    expect(prepared.fixtures).toHaveLength(2)
    prepared.fixtures.forEach(fixture => fixture.windows.forEach(window => {
      expect(window.context.currentPick).toBeGreaterThan(window.observedThroughOverallPick)
      expect(window.context.recentPicks.every(pick =>
        pick.overallPick <= window.observedThroughOverallPick)).toBe(true)
      const v1 = createOpponentForecast(window.context, {
        model: "combined", targetRosterIndex: fixture.targetRosterIndex,
      })
      const equivalent = createOpponentForecast(window.context, {
        model: "combined_v2",
        targetRosterIndex: fixture.targetRosterIndex,
        combinedV2Config: V1_EQUIVALENT_CANDIDATE.config,
      })
      expect(equivalent.picks).toEqual(v1.picks)
      expect(equivalent.runProbabilities).toEqual(v1.runProbabilities)
      expect(equivalent.tierBoundaryProbabilities).toEqual(v1.tierBoundaryProbabilities)
    }))
    prepared.fixtures.forEach(fixture => {
      const replayed = replayRecordedOpponentModel(
        fixtures.find(candidate => candidate.id === fixture.fixtureId)!, "combined",
      )
      const equivalent = evaluatePreparedOpponentCandidate(
        [fixture], V1_EQUIVALENT_CANDIDATE)
      expect(replayed.available).toBe(true)
      if (!replayed.available) throw new Error(replayed.reason)
      expect(equivalent.metrics).toEqual(replayed.metrics)
    })
  })

  it("has a bounded deterministic search and keeps fold labels out of selection", () => {
    expect(OPPONENT_V2_SEARCH_CANDIDATES).toHaveLength(9)
    const prepared = prepareRecordedOpponentReplay(fixtures)
    const standard = prepared.fixtures.filter(fixture => !fixture.ppr)
    const first = selectOpponentV2Candidate(standard)
    const repeated = selectOpponentV2Candidate(standard)
    expect(repeated.selected.candidate.id).toBe(first.selected.candidate.id)
    expect(repeated.considered.map(candidate => candidate.candidate.id))
      .toEqual(first.considered.map(candidate => candidate.candidate.id))

    const report = runOpponentV2Tuning(fixtures)
    const standardFold = report.folds.find(fold => fold.trainingFormat === "STANDARD")!
    expect(standardFold.selection.selected.candidate.id).toBe(first.selected.candidate.id)
    expect(report.folds.map(fold => fold.holdout.labeledPickCount).reduce((a, b) => a + b, 0))
      .toBe(191)
    expect(report.promotion.promoted).toBe(false)
    expect(report.promotion.reason).toBe(
      "no promotion: both folds selected the v1-equivalent abstention; no league-aware candidate met the training selection rule",
    )
    expect(report.legacySearchCandidateCount).toBe(6)
    expect(report.residualSearchCandidateCount).toBe(3)
    expect(report.residualAblations).toHaveLength(3)
  })
})
