import manifestJson from "../calibration-campaign/phase4-espn.json"
import recordedFixtureJson from "./fixtures/recorded-espn-2026-slot-9.json"
import recordedStandardFixtureJson from "./fixtures/recorded-espn-2026-slot-3-12-team-standard.json"
import recordedSlotSixFixtureJson from "./fixtures/recorded-espn-2026-slot-6-10-team-standard.json"
import recordedSlotOneFixtureJson from "./fixtures/recorded-espn-2026-07-31-league-1788370838-slot-1.json"
import recordedSlotEightFixtureJson from "./fixtures/recorded-espn-2026-07-31-league-510719609-slot-8.json"
import {
  CalibrationCampaignManifest,
  createReplayCaptureFingerprint,
  createReplayFixtureFingerprint,
  runCalibrationCampaign,
  validateCalibrationCampaignManifest,
} from "../behavior/draft-advisor/calibrationCampaign"
import type { RecordedCompletedDraftReplay } from "../behavior/draft-advisor/completedDraftReplay"
import type { OpponentForecast } from "../behavior/draft-advisor/types"
import { FantasyPosition } from "../types"
import {
  createReplayForecastInputFingerprint,
  createReplayForecastObservationFingerprint,
} from "../behavior/draft-advisor/replayForecastEvidence"
import { scoreRecordedOpponentForecastEvidence } from "../behavior/draft-advisor/replayMetrics"

const recorded = recordedFixtureJson as unknown as RecordedCompletedDraftReplay
const recordedStandard =
  recordedStandardFixtureJson as unknown as RecordedCompletedDraftReplay
const recordedSlotSix =
  recordedSlotSixFixtureJson as unknown as RecordedCompletedDraftReplay
const recordedSlotOne =
  recordedSlotOneFixtureJson as unknown as RecordedCompletedDraftReplay
const recordedSlotEight =
  recordedSlotEightFixtureJson as unknown as RecordedCompletedDraftReplay
const clone = <Value>(value: Value): Value => JSON.parse(JSON.stringify(value)) as Value

const fixtureFor = (
  id: string,
  targetRosterIndex = 8,
): RecordedCompletedDraftReplay => {
  const fixture = clone(recorded)
  fixture.id = id
  fixture.targetRosterIndex = targetRosterIndex
  fixture.source!.capturedAt += targetRosterIndex + id.length
  return fixture
}

const withForecastEvidence = (
  fixture: RecordedCompletedDraftReplay,
  boundaries: number[],
): RecordedCompletedDraftReplay => {
  const result = clone(fixture)
  const positions = [
    FantasyPosition.QUARTERBACK,
    FantasyPosition.RUNNING_BACK,
    FantasyPosition.WIDE_RECEIVER,
    FantasyPosition.TIGHT_END,
  ]
  result.forecastEvidence = {
    schemaVersion: 1,
    sessionId: result.id,
    observations: boundaries.map(observedThroughOverallPick => {
      const picks = [] as OpponentForecast["picks"]
      for (let overallPick = observedThroughOverallPick + 1;
        overallPick <= result.actualPicks.length;
        overallPick += 1) {
        const actual = result.actualPicks[overallPick - 1]
        if (actual.rosterIndex === result.targetRosterIndex) {
          if (picks.length > 0) break
          continue
        }
        const positionProbabilities = positions.map(position => ({
          position,
          probability: 0.25,
        }))
        const playerProbabilities = positions.map(position => ({
          playerId: `${position.toLowerCase()}-1`,
          name: position,
          position,
          conditionalProbability: 1,
          overallProbability: 0.25,
        }))
        picks.push({
          overallPick,
          rosterIndex: actual.rosterIndex,
          positionProbabilities,
          playerProbabilities,
        })
      }
      const forecast: OpponentForecast = {
        schemaVersion: 1,
        model: "combined",
        targetRosterIndex: result.targetRosterIndex,
        picks,
        runProbabilities: positions.map(position => ({
          position,
          minimumPicks: 3,
          probability: 0.25,
        })),
        tierBoundaryProbabilities: [],
      }
      const base = {
        observedThroughOverallPick,
        modelIdentity: "deterministic_opponent_v1" as const,
        model: "combined" as const,
        targetRosterIndex: result.targetRosterIndex,
        forecast,
      }
      return {
        ...base,
        inputFingerprint: createReplayForecastInputFingerprint({
          context: "test",
          observedThroughOverallPick,
        }),
        observationFingerprint: createReplayForecastObservationFingerprint(base),
      }
    }),
  }
  return result
}

const manifestFor = (
  fixtures: Record<string, unknown>,
): CalibrationCampaignManifest => ({
  campaignVersion: 1,
  id: "test-live-campaign",
  coverageTargets: {
    draftSlots: [1, 2, 3, 9],
    teamSizes: [10, 12],
    scoringFormats: ["PPR", "STANDARD"],
  },
  evidence: Object.entries(fixtures).map(([fixturePath, fixture], index) => ({
    id: `evidence-${index + 1}`,
    fixturePath,
    fixtureFingerprint: fixture && typeof fixture === "object" && "fixtureVersion" in fixture
      ? createReplayFixtureFingerprint(fixture as RecordedCompletedDraftReplay)
      : "0".repeat(64),
    declaredProvenance: {
      platform: "ESPN",
      kind: "completed_mock",
      captureMethod: "extension_board_export",
      captureVersion: 1,
    },
  })),
})

describe("Phase 4 calibration campaign evidence", () => {
  it("qualifies all five recorded ESPN exports with complete target-slot coverage", () => {
    const manifest = manifestJson as CalibrationCampaignManifest
    const report = runCalibrationCampaign(manifest, {
      "__tests__/fixtures/recorded-espn-2026-slot-9.json": recorded,
      "__tests__/fixtures/recorded-espn-2026-slot-3-12-team-standard.json": recordedStandard,
      "__tests__/fixtures/recorded-espn-2026-slot-6-10-team-standard.json": recordedSlotSix,
      "__tests__/fixtures/recorded-espn-2026-07-31-league-1788370838-slot-1.json": recordedSlotOne,
      "__tests__/fixtures/recorded-espn-2026-07-31-league-510719609-slot-8.json": recordedSlotEight,
    })

    expect(report.canonical.qualifyingMockCount).toBe(5)
    expect(report.canonical.qualifyingDraftSlots).toEqual([1, 3, 6, 8, 9])
    expect(report.canonical.teamSizes).toEqual([10, 12])
    expect(report.canonical.scoringFormats).toEqual(["PPR", "STANDARD"])
    expect(report.canonical.opponentRunPrediction).toEqual({
      available: true,
      labeledFixtureCount: 2,
      labeledWindowCount: 21,
      labeledPickCount: 191,
      metrics: {
        evaluatedPicks: 191,
        positionBrierScore: 0.7089208326563738,
        topPositionAccuracy: 0.33507853403141363,
        playerTopThreeAccuracy: 0.225130890052356,
        runPrecision: 0.5992063492063492,
        runRecall: 0.7142857142857143,
        tierCrossingBrierScore: 0.08314228140458517,
      },
    })
    expect(report.canonical.remainingGaps).toEqual([])
    expect(report.canonical.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({
        evidenceId: "espn-36954084-slot-9",
        qualifying: true,
      }),
      expect.objectContaining({
        evidenceId: "espn-236942237-slot-3",
        qualifying: true,
        fixtureFingerprint:
          "f6c33b28c2f86091ab84c6253b10fc18adffb093013428ce2e4de51514216896",
      }),
      expect.objectContaining({
        evidenceId: "espn-682877722-slot-6",
        qualifying: true,
        fixtureFingerprint:
          "2949817ece2eedfd8ff5492784052dd3bf1d748f5a57514fc9fab9f17b95e867",
      }),
      expect.objectContaining({
        evidenceId: "espn-1788370838-slot-1",
        qualifying: true,
        fixtureFingerprint:
          "c0890f3ee05f8797fb056e9b011bc25c75062d5acec3707a3f23ca86c57e51b2",
      }),
      expect.objectContaining({
        evidenceId: "espn-510719609-slot-8",
        qualifying: true,
        fixtureFingerprint:
          "7d2cb041841a715a39c02fe3c6180019e6cc62740f904f690ee93bfb0d345509",
      }),
    ]))
  })

  it("excludes synthetic, malformed, incomplete, and manually altered evidence", () => {
    const synthetic = fixtureFor("synthetic")
    synthetic.provenance = "synthetic"
    const incomplete = fixtureFor("incomplete")
    incomplete.actualPicks.pop()
    const altered = fixtureFor("altered")
    const fixtures = {
      synthetic,
      incomplete,
      altered,
      malformed: {},
      missing: undefined,
    }
    const manifest = manifestFor(fixtures)
    manifest.evidence[2].fixtureFingerprint = "0".repeat(64)

    const report = runCalibrationCampaign(manifest, fixtures)
    expect(report.canonical.qualifyingMockCount).toBe(0)
    expect(report.canonical.evidence.map(evidence => evidence.reasons.join("; ")))
      .toEqual(expect.arrayContaining([
        expect.stringContaining("fixture is not declared recorded"),
        expect.stringContaining("expected 160 completed picks"),
        expect.stringContaining("fixture fingerprint differs from declared evidence"),
        expect.stringContaining("fixture is missing or malformed"),
      ]))
  })

  it("does not inflate evidence when the same fixture is declared twice", () => {
    const one = fixtureFor("same")
    const two = fixtureFor("renamed-and-reprofiled")
    expect(two.source!.capturedAt).not.toBe(one.source!.capturedAt)
    two.source!.sourceUrl = "https://fantasy.espn.com/football/draft?leagueId=re-export"
    two.players[0].projectedMedian += 2
    two.players[0].projectedCeiling += 2
    expect(createReplayCaptureFingerprint(one))
      .toBe(createReplayCaptureFingerprint(two))
    const fixtures = { one, two }
    const report = runCalibrationCampaign(manifestFor(fixtures), fixtures)

    expect(report.canonical.qualifyingMockCount).toBe(1)
    expect(report.canonical.evidence[1]).toMatchObject({ qualifying: false })
    expect(report.canonical.evidence[1].reasons.join(" "))
      .toContain("duplicate fixture fingerprint")
  })

  it("reports slot coverage and league/scoring gaps only from qualifying evidence", () => {
    const first = fixtureFor("slot-1", 0)
    const second = fixtureFor("slot-2", 1)
    const third = fixtureFor("slot-3", 2)
    const fixtures = { first, second, third }
    const report = runCalibrationCampaign(manifestFor(fixtures), fixtures)

    expect(report.canonical.qualifyingDraftSlots).toEqual([1, 2, 3])
    expect(report.canonical.teamSizes).toEqual([10])
    expect(report.canonical.scoringFormats).toEqual(["PPR"])
    expect(report.canonical.remainingGaps).toEqual(expect.arrayContaining([
      "recorded replays 3/5",
      "draft slots 3/4",
      "target draft slots missing: 9",
      "team sizes missing: 12",
      "scoring formats missing: STANDARD",
    ]))
  })

  it("fails the quality floors without qualifying evidence instead of borrowing synthetic metrics", () => {
    const synthetic = fixtureFor("synthetic-quality")
    synthetic.provenance = "synthetic"
    const fixtures = { synthetic }
    const report = runCalibrationCampaign(manifestFor(fixtures), fixtures)

    expect(report.canonical.quality.legalRate).toBe(0)
    expect(report.canonical.remainingGaps).toEqual(expect.arrayContaining([
      "combined replay produced an illegal roster",
      "combined replay left a starter slot incomplete",
      "combined replay fell below the starter-value floor",
      "combined replay fell below the bench-upside floor",
    ]))
  })

  it("has a stable canonical report and reports missing opponent-run labels explicitly", () => {
    const fixtures = { recorded }
    const manifest = manifestFor(fixtures)
    const first = runCalibrationCampaign(manifest, fixtures)
    const second = runCalibrationCampaign(manifest, fixtures)

    expect(first.canonical).toEqual(second.canonical)
    expect(first.canonical.opponentRunPrediction).toEqual({
      available: false,
      reason: "completed replay fixtures do not yet preserve forecast labels",
    })
  })

  it("scores valid live forecast labels once per pick and once per terminal window", () => {
    const labeled = withForecastEvidence(fixtureFor("labeled"), [0, 1])
    const fixtures = { labeled }
    const first = runCalibrationCampaign(manifestFor(fixtures), fixtures)
    const second = runCalibrationCampaign(manifestFor(fixtures), fixtures)

    expect(first.canonical).toEqual(second.canonical)
    expect(first.canonical.opponentRunPrediction).toMatchObject({
      available: true,
      labeledFixtureCount: 1,
      // Both observations end at the same next target-roster pick.
      labeledWindowCount: 1,
    })
    if (first.canonical.opponentRunPrediction.available) {
      expect(first.canonical.opponentRunPrediction.labeledPickCount).toBe(8)
      expect(first.canonical.opponentRunPrediction.metrics.evaluatedPicks)
        .toBe(first.canonical.opponentRunPrediction.labeledPickCount)
    }
  })

  it("fails closed for malformed optional labels without disqualifying ESPN roster evidence", () => {
    const labeled = withForecastEvidence(fixtureFor("malformed-label"), [0])
    const observation = labeled.forecastEvidence!.observations[0]
    observation.forecast.picks[0].overallPick = 99
    observation.observationFingerprint = createReplayForecastObservationFingerprint({
      observedThroughOverallPick: observation.observedThroughOverallPick,
      modelIdentity: observation.modelIdentity,
      model: observation.model,
      targetRosterIndex: observation.targetRosterIndex,
      forecast: observation.forecast,
    })
    const fixtures = { labeled }
    const report = runCalibrationCampaign(manifestFor(fixtures), fixtures)

    expect(report.canonical.qualifyingMockCount).toBe(1)
    expect(report.canonical.opponentRunPrediction).toMatchObject({
      available: false,
      reason: expect.stringContaining("forecast evidence is invalid"),
    })
  })

  it("does not turn valid synthetic labels into campaign opponent evidence", () => {
    const synthetic = withForecastEvidence(fixtureFor("synthetic-label"), [0])
    synthetic.provenance = "synthetic"
    expect(scoreRecordedOpponentForecastEvidence(synthetic)).toMatchObject({
      available: true,
      labeledPickCount: 8,
    })
    const report = runCalibrationCampaign(manifestFor({ synthetic }), { synthetic })
    expect(report.canonical.qualifyingMockCount).toBe(0)
    expect(report.canonical.opponentRunPrediction).toEqual({
      available: false,
      reason: "completed replay fixtures do not yet preserve forecast labels",
    })
  })

  it("rejects untrusted manifest shape, provenance, version, and bounds before dereferencing", () => {
    expect(validateCalibrationCampaignManifest({
      campaignVersion: 2,
      id: "x".repeat(121),
      coverageTargets: { draftSlots: [], teamSizes: [], scoringFormats: [] },
      evidence: [{
        id: "",
        fixturePath: "../outside.json",
        fixtureFingerprint: "not-a-hash",
      }],
    }).errors).toEqual(expect.arrayContaining([
      "unsupported campaign manifest schema",
      "campaign id is missing",
      "campaign coverage targets are invalid",
      "campaign evidence 1 is invalid",
    ]))
    expect(() => runCalibrationCampaign({} as CalibrationCampaignManifest, {}))
      .toThrow("Invalid calibration campaign")
  })
})
