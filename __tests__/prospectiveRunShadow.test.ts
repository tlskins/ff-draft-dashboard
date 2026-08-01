import campaignJson from "../prospective-campaign/phase9-prospective-run-shadow.json"
import fixtureJson from "./fixtures/recorded-espn-2026-07-31-league-1788370838-slot-1.json"
import {
  createBoundedResidualRunShadowForecast,
} from "../behavior/draft-advisor/boundedResidualRunShadow"
import {
  createRecordedDraftAdvisorContextAtBoundary,
} from "../behavior/draft-advisor/completedDraftReplay"
import {
  ReplayForecastEvidenceRecorder,
  ReplayRunOnlyShadowEvidenceRecorder,
  createReplayForecastObservationFingerprint,
  createRunOnlyShadowObservationFingerprint,
} from "../behavior/draft-advisor/replayForecastEvidence"
import {
  createOpponentForecast,
} from "../behavior/draft-advisor/opponentModel"
import {
  createPhase9PolicyFingerprint,
  createProspectiveFixtureContentSha256,
  runProspectiveRunShadowCampaign,
} from "../behavior/draft-advisor/prospectiveRunShadow"
import { canonicalStaticWindowBoundaries } from "../behavior/draft-advisor/staticWindowBacktest"
import type {
  ProspectiveCampaignManifest,
  ProspectiveFixtureInput,
} from "../behavior/draft-advisor/prospectiveRunShadow"
import type { RecordedCompletedDraftReplay } from "../behavior/draft-advisor/completedDraftReplay"

const sourceFixture = fixtureJson as unknown as RecordedCompletedDraftReplay
const baseCampaign = campaignJson as unknown as ProspectiveCampaignManifest

const clone = <Value>(value: Value): Value => JSON.parse(JSON.stringify(value)) as Value

const futurePairedFixture = (options: { id?: string, omitBoundary?: number, extraBoundaries?: number[] } = {}): RecordedCompletedDraftReplay => {
  const fixture = clone(sourceFixture)
  if (options.id) fixture.id = options.id
  fixture.source!.capturedAt = Date.parse("2026-08-01T10:06:00-04:00")
  const frozenRecorder = new ReplayForecastEvidenceRecorder()
  const shadowRecorder = new ReplayRunOnlyShadowEvidenceRecorder()
  const canonicalWindows = canonicalStaticWindowBoundaries(fixture)
  const canonicalBoundaries = canonicalWindows.map(window => window.observedThroughOverallPick)
  const boundaries = Array.from(new Set([
    ...canonicalBoundaries,
    ...(options.extraBoundaries || []),
  ])).sort((left, right) => left - right)
  boundaries
    .filter(boundary => boundary !== options.omitBoundary)
    .forEach(boundary => {
      const context = createRecordedDraftAdvisorContextAtBoundary(fixture, boundary)
      const frozen = createOpponentForecast(context, { model: "combined", targetRosterIndex: fixture.targetRosterIndex })
      const shadow = createBoundedResidualRunShadowForecast(context, frozen, fixture.actualPicks.length)
      frozenRecorder.record({ sessionId: fixture.id, observedThroughOverallPick: boundary, forecast: frozen, targetRosterIndex: fixture.targetRosterIndex, inputFingerprint: "deadbeef" })
      shadowRecorder.record({ sessionId: fixture.id, observedThroughOverallPick: boundary, forecast: shadow, targetRosterIndex: fixture.targetRosterIndex, inputFingerprint: "deadbeef" })
    })
  fixture.forecastEvidence = frozenRecorder.snapshot(fixture.id)
  fixture.runOnlyShadowEvidence = shadowRecorder.snapshot(fixture.id)
  return fixture
}

const campaignFor = (
  fixture: RecordedCompletedDraftReplay,
  path = "prospective-campaign/fixtures/future.json",
): { manifest: ProspectiveCampaignManifest, input: ProspectiveFixtureInput } => {
  const rawContent = JSON.stringify(fixture)
  const manifest = clone(baseCampaign)
  manifest.evidence = [{
    id: "future-fixture-1",
    fixturePath: path,
    fixtureId: fixture.id,
    contentSha256: createProspectiveFixtureContentSha256(rawContent),
    baselineCommit: manifest.baseline.commit,
    baselineTag: manifest.baseline.tag,
    declaredProvenance: {
      platform: "ESPN",
      kind: "completed_mock",
      captureMethod: "extension_board_export",
      captureVersion: 1,
    },
  }]
  return { manifest, input: { path, rawContent } }
}

const reportFor = (fixture = futurePairedFixture()) => {
  const campaign = campaignFor(fixture)
  return runProspectiveRunShadowCampaign(campaign.manifest, [campaign.input])
}

describe("Phase 9 prospective run-shadow evaluator", () => {
  it("accepts a paired known-total boundary and scores only future labels", () => {
    const report = reportFor()
    expect(report.evidence[0].disposition).toBe("eligible")
    expect(report.eligibleFixtureCount).toBe(1)
    expect(report.fixtures[0].evaluatedPickCount).toBeGreaterThan(0)
    expect(report.fixtures[0].evaluatedRunWindowCount).toBe(report.fixtures[0].windowCoverage.expected)
    expect(report.fixtures[0].windowCoverage.comparable).toBe(report.fixtures[0].windowCoverage.expected)
    expect(report.fixtures[0].evaluatedPositionLabelCount).toBe(report.fixtures[0].evaluatedPickCount)
    expect(report.fixtures[0].evaluatedRunEventCount).toBeGreaterThan(0)
    expect(report.fixtures[0].frozenV1.position.available).toBe(true)
    expect(report.fixtures[0].challenger.run.available).toBe(true)
    expect(report.fixtures[0].frozenV1.run.available).toBe(true)
    expect(report.fixtures[0].frozenV1.run.available && report.fixtures[0].frozenV1.run.runBrierScore).toBeGreaterThanOrEqual(0)
    expect(report.fixtures[0].challenger.run.available && report.fixtures[0].challenger.run.calibration).toEqual(expect.objectContaining({
      evaluatedEvents: expect.any(Number),
    }))
    expect(report.fixtures[0].challenger.position.available).toBe(false)
    expect(report.promotion.promoted).toBe(false)
  })

  it("accepts live-recorder-style extra observations but scores canonical windows only", () => {
    const canonicalReport = reportFor()
    const firstCanonical = canonicalStaticWindowBoundaries(sourceFixture)[0]
    const extraBoundary = firstCanonical.observedThroughOverallPick + 1
    const liveStyleReport = reportFor(futurePairedFixture({ extraBoundaries: [extraBoundary] }))
    const canonicalFixture = canonicalReport.fixtures[0]
    const liveFixture = liveStyleReport.fixtures[0]
    expect(liveStyleReport.evidence[0].disposition).toBe("eligible")
    expect(liveFixture.windowCoverage.extra).toBeGreaterThan(0)
    expect(liveFixture.windowCoverage.scored).toBe(liveFixture.windowCoverage.expected)
    expect(liveFixture.evaluatedRunWindowCount).toBe(liveFixture.windowCoverage.expected)
    expect(liveFixture.evaluatedObservationCount).toBe(canonicalFixture.evaluatedObservationCount)
    expect(liveFixture.frozenV1).toEqual(canonicalFixture.frozenV1)
    expect(liveFixture.challenger).toEqual(canonicalFixture.challenger)
    expect(liveFixture.deltas).toEqual(canonicalFixture.deltas)
    expect(liveFixture.gates).toEqual(canonicalFixture.gates)
    expect(liveStyleReport.aggregate && {
      ...liveStyleReport.aggregate,
      windowCoverage: undefined,
    }).toEqual(canonicalReport.aggregate && {
      ...canonicalReport.aggregate,
      windowCoverage: undefined,
    })
  })

  it("does not let valid extras substitute for a missing canonical window", () => {
    const missingBoundary = canonicalStaticWindowBoundaries(sourceFixture)[0].observedThroughOverallPick
    const fixture = futurePairedFixture({
      omitBoundary: missingBoundary,
      extraBoundaries: [missingBoundary + 1],
    })
    const report = reportFor(fixture)
    expect(report.evidence[0].disposition).toBe("invalid")
    expect(report.evidence[0].reasonCodes).toContain("canonical_window_incomplete")
    expect(report.eligibleFixtureCount).toBe(0)
    expect(report.aggregate).toBeUndefined()
  })

  it("fails closed when an otherwise valid extra observation is tampered", () => {
    const extraBoundary = canonicalStaticWindowBoundaries(sourceFixture)[0].observedThroughOverallPick + 1
    const fixture = futurePairedFixture({ extraBoundaries: [extraBoundary] })
    const extra = fixture.runOnlyShadowEvidence!.observations.find(observation => observation.observedThroughOverallPick === extraBoundary)!
    extra.artifactFingerprint = "deadbeef"
    const campaign = campaignFor(fixture)
    const report = runProspectiveRunShadowCampaign(campaign.manifest, [campaign.input])
    expect(report.evidence[0].disposition).toBe("invalid")
    expect(report.evidence[0].reasonCodes).toEqual(expect.arrayContaining([
      "challenger_artifact_fingerprint_mismatch",
      "run_only_shadow_evidence_invalid",
    ]))
    expect(report.aggregate).toBeUndefined()
  })

  it("keeps canonical scoring deterministic when stored observations are reordered", () => {
    const extraBoundary = canonicalStaticWindowBoundaries(sourceFixture)[0].observedThroughOverallPick + 1
    const ordered = reportFor(futurePairedFixture({ extraBoundaries: [extraBoundary] }))
    const shuffledFixture = futurePairedFixture({ extraBoundaries: [extraBoundary] })
    shuffledFixture.forecastEvidence!.observations.reverse()
    shuffledFixture.runOnlyShadowEvidence!.observations.reverse()
    const shuffled = reportFor(shuffledFixture)
    expect(shuffled.evidence[0].disposition).toBe("eligible")
    expect(shuffled.fixtures).toEqual(ordered.fixtures)
    expect(shuffled.aggregate).toEqual(ordered.aggregate)
    expect(shuffled.stratified).toEqual(ordered.stratified)
    expect(shuffled.gates).toEqual(ordered.gates)
  })

  it("produces byte-stable aggregate output and never reports exact-player gates", () => {
    const fixture = futurePairedFixture()
    const campaign = campaignFor(fixture)
    const first = runProspectiveRunShadowCampaign(campaign.manifest, [campaign.input])
    const second = runProspectiveRunShadowCampaign(campaign.manifest, [campaign.input])
    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
    expect(JSON.stringify(first)).not.toContain("playerTop")
    expect(JSON.stringify(first.gates)).not.toContain("player")
    expect(first.promotion.promoted).toBe(false)
  })

  it("fails closed for the empty checked-in campaign without zero-filled metrics", () => {
    const report = runProspectiveRunShadowCampaign(baseCampaign, [])
    expect(report.status).toBe("evidence_blocked")
    expect(report.eligibleFixtureCount).toBe(0)
    expect(report.aggregate).toBeUndefined()
    expect(report.gates.evidenceSufficiency.reasonCodes).toContain("zero_eligible_fixtures")
    expect(report.promotion.promoted).toBe(false)
  })

  it("excludes legacy and unlisted inputs", () => {
    const legacy = clone(sourceFixture)
    const campaign = clone(baseCampaign)
    const rawContent = JSON.stringify(legacy)
    const report = runProspectiveRunShadowCampaign(campaign, [{
      path: "__tests__/fixtures/legacy.json",
      rawContent,
    }])
    expect(report.evidence).toEqual([{
      fixturePath: "__tests__/fixtures/legacy.json",
      disposition: "excluded",
      reasonCodes: ["unlisted_evidence"],
    }])

    const admittedLegacy = campaignFor(legacy, "legacy.json")
    const legacyReport = runProspectiveRunShadowCampaign(admittedLegacy.manifest, [admittedLegacy.input])
    expect(legacyReport.evidence[0].disposition).toBe("excluded")
    expect(legacyReport.evidence[0].reasonCodes).toContain("retrospective_evidence")
  })

  it("rejects raw content hash drift before parsing it as evidence", () => {
    const campaign = campaignFor(futurePairedFixture())
    const report = runProspectiveRunShadowCampaign(campaign.manifest, [{
      ...campaign.input,
      rawContent: `${campaign.input.rawContent}\n`,
    }])
    expect(report.evidence[0].disposition).toBe("invalid")
    expect(report.evidence[0].reasonCodes).toContain("fixture_hash_mismatch")
  })

  it.each([
    ["session", (fixture: RecordedCompletedDraftReplay) => { fixture.forecastEvidence!.sessionId = "other" }],
    ["roster", (fixture: RecordedCompletedDraftReplay) => { fixture.runOnlyShadowEvidence!.observations[0].targetRosterIndex = 99 }],
    ["boundary", (fixture: RecordedCompletedDraftReplay) => { fixture.runOnlyShadowEvidence!.observations[0].observedThroughOverallPick = 0 }],
    ["horizon", (fixture: RecordedCompletedDraftReplay) => { fixture.runOnlyShadowEvidence!.observations[0].forecast.horizon[0].overallPick = 1 }],
    ["phase", (fixture: RecordedCompletedDraftReplay) => {
      const observation = fixture.runOnlyShadowEvidence!.observations[0]
      const phase = { kind: "fallback_context_horizon" as const, totalDraftPicks: fixture.actualPicks.length }
      observation.phaseProvenance = phase
      observation.forecast.phaseProvenance = phase
      observation.observationFingerprint = createRunOnlyShadowObservationFingerprint({
        observedThroughOverallPick: observation.observedThroughOverallPick,
        modelIdentity: observation.modelIdentity,
        artifactId: observation.artifactId,
        artifactFingerprint: observation.artifactFingerprint,
        trainingCorpusFingerprint: observation.trainingCorpusFingerprint,
        targetRosterIndex: observation.targetRosterIndex,
        phaseProvenance: observation.phaseProvenance,
        forecast: observation.forecast,
      })
    }],
    ["frozen probability", (fixture: RecordedCompletedDraftReplay) => {
      const observation = fixture.runOnlyShadowEvidence!.observations[0]
      observation.forecast.frozenRunProbabilities[0].probability = 0
      observation.observationFingerprint = createRunOnlyShadowObservationFingerprint({
        observedThroughOverallPick: observation.observedThroughOverallPick,
        modelIdentity: observation.modelIdentity,
        artifactId: observation.artifactId,
        artifactFingerprint: observation.artifactFingerprint,
        trainingCorpusFingerprint: observation.trainingCorpusFingerprint,
        targetRosterIndex: observation.targetRosterIndex,
        phaseProvenance: observation.phaseProvenance,
        forecast: observation.forecast,
      })
    }],
    ["completion", (fixture: RecordedCompletedDraftReplay) => { fixture.source!.totalPicks -= 1 }],
    ["non-finite probability", (fixture: RecordedCompletedDraftReplay) => { fixture.runOnlyShadowEvidence!.observations[0].forecast.challengerRunProbabilities[0].probability = Number.NaN }],
    ["missing label", (fixture: RecordedCompletedDraftReplay) => {
      const pick = fixture.actualPicks.find(candidate => candidate.overallPick ===
        fixture.runOnlyShadowEvidence!.observations[0].forecast.horizon[0].overallPick)!
      pick.position = "QB"
      pick.playerId = null
      pick.advisorEligible = false
    }],
  ])("fails closed on %s mismatches", (_name, mutate) => {
    const fixture = futurePairedFixture()
    mutate(fixture)
    const campaign = campaignFor(fixture)
    const report = runProspectiveRunShadowCampaign(campaign.manifest, [campaign.input])
    expect(report.evidence[0].disposition).not.toBe("eligible")
  })

  it("rejects duplicate paired boundaries", () => {
    const fixture = futurePairedFixture()
    fixture.forecastEvidence!.observations.push(clone(fixture.forecastEvidence!.observations[0]))
    fixture.runOnlyShadowEvidence!.observations.push(clone(fixture.runOnlyShadowEvidence!.observations[0]))
    const campaign = campaignFor(fixture)
    const report = runProspectiveRunShadowCampaign(campaign.manifest, [campaign.input])
    expect(report.evidence[0].reasonCodes).toContain("duplicate_boundary")
  })

  it("rejects duplicate admitted fixture content", () => {
    const fixture = futurePairedFixture()
    const campaign = campaignFor(fixture)
    const second = { ...campaign.manifest.evidence[0], id: "future-fixture-2", fixturePath: "future-2.json" }
    campaign.manifest.evidence.push(second)
    const secondInput = { ...campaign.input, path: "future-2.json" }
    const report = runProspectiveRunShadowCampaign(campaign.manifest, [campaign.input, secondInput])
    expect(report.evidence.find(item => item.id === "future-fixture-2")?.reasonCodes)
      .toContain("duplicate_fixture")
  })

  it("rejects malformed evidence without mutating the input", () => {
    const fixture = futurePairedFixture()
    fixture.runOnlyShadowEvidence!.observations[0].forecast.challengerRunProbabilities[0].probability = Number.NaN
    const before = JSON.stringify(fixture)
    const campaign = campaignFor(fixture)
    const report = runProspectiveRunShadowCampaign(campaign.manifest, [campaign.input])
    expect(report.status).toBe("evidence_blocked")
    expect(JSON.stringify(fixture)).toBe(before)
  })

  it("returns a stable invalid decision for malformed envelopes instead of throwing", () => {
    const fixture = futurePairedFixture()
    fixture.forecastEvidence = { schemaVersion: 1, sessionId: fixture.id, observations: null } as never
    const campaign = campaignFor(fixture)
    expect(() => runProspectiveRunShadowCampaign(campaign.manifest, [campaign.input])).not.toThrow()
    const report = runProspectiveRunShadowCampaign(campaign.manifest, [campaign.input])
    expect(report.evidence[0].disposition).toBe("invalid")
  })

  it("fails closed for malformed observation arrays and duplicate input paths", () => {
    const fixture = futurePairedFixture()
    fixture.runOnlyShadowEvidence!.observations = [null] as never
    const campaign = campaignFor(fixture)
    const duplicateInputs = [campaign.input, { ...campaign.input }]
    const report = runProspectiveRunShadowCampaign(campaign.manifest, duplicateInputs)
    expect(report.evidence[0].disposition).toBe("invalid")
    expect(report.evidence[0].reasonCodes).toEqual(expect.arrayContaining(["duplicate_input_path"]))
    const malformed = runProspectiveRunShadowCampaign(campaign.manifest, [{ path: campaign.input.path, rawContent: JSON.stringify(fixture) }])
    expect(malformed.evidence[0].disposition).toBe("invalid")
    expect(malformed.evidence[0].reasonCodes).toContain("run_only_shadow_evidence_invalid")
  })

  it.each([
    ["model identity", (fixture: RecordedCompletedDraftReplay) => { const observation = fixture.runOnlyShadowEvidence!.observations[0] as any; observation.modelIdentity = "tampered_model"; observation.observationFingerprint = createRunOnlyShadowObservationFingerprint(observation) }],
    ["artifact id", (fixture: RecordedCompletedDraftReplay) => { const observation = fixture.runOnlyShadowEvidence!.observations[0] as any; observation.artifactId = "tampered_artifact"; observation.observationFingerprint = createRunOnlyShadowObservationFingerprint(observation) }],
    ["artifact fingerprint", (fixture: RecordedCompletedDraftReplay) => { const observation = fixture.runOnlyShadowEvidence!.observations[0] as any; observation.artifactFingerprint = "deadbeef"; observation.observationFingerprint = createRunOnlyShadowObservationFingerprint(observation) }],
    ["training corpus fingerprint", (fixture: RecordedCompletedDraftReplay) => { const observation = fixture.runOnlyShadowEvidence!.observations[0] as any; observation.trainingCorpusFingerprint = "0".repeat(64); observation.observationFingerprint = createRunOnlyShadowObservationFingerprint(observation) }],
  ])("rejects recomputed but non-canonical challenger %s provenance", (_name, mutate) => {
    const fixture = futurePairedFixture()
    mutate(fixture)
    const campaign = campaignFor(fixture)
    const report = runProspectiveRunShadowCampaign(campaign.manifest, [campaign.input])
    expect(report.evidence[0].disposition).toBe("invalid")
    expect(report.evidence[0].reasonCodes.some(reason => reason.includes("challenger") || reason === "shadow_envelope_identity_mismatch")).toBe(true)
  })

  it("couples raw hashing and parsing so the scored object is the hashed object", () => {
    const campaign = campaignFor(futurePairedFixture())
    const other = futurePairedFixture({ id: "different-fixture" })
    const report = runProspectiveRunShadowCampaign(campaign.manifest, [{
      path: campaign.input.path,
      rawContent: JSON.stringify(other),
    }])
    expect(report.evidence[0].disposition).toBe("invalid")
    expect(report.evidence[0].reasonCodes).toContain("fixture_hash_mismatch")
  })

  it("returns a stable malformed-JSON decision", () => {
    const campaign = clone(baseCampaign)
    const rawContent = "{not json"
    campaign.evidence = [{
      id: "malformed",
      fixturePath: "malformed.json",
      fixtureId: "malformed",
      contentSha256: createProspectiveFixtureContentSha256(rawContent),
      baselineCommit: campaign.baseline.commit,
      baselineTag: campaign.baseline.tag,
      declaredProvenance: { platform: "ESPN", kind: "completed_mock", captureMethod: "extension_board_export", captureVersion: 1 },
    }]
    const report = runProspectiveRunShadowCampaign(campaign, [{ path: "malformed.json", rawContent }])
    expect(report.evidence[0].reasonCodes).toEqual(["malformed_fixture_json"])
  })

  it("fails closed for policy and baseline tampering, even with a recomputed fingerprint", () => {
    const campaign = clone(baseCampaign)
    campaign.policy.runAcceptance.maximumBrierRegression = 0.5
    campaign.policyFingerprint = createPhase9PolicyFingerprint(campaign.policy)
    const report = runProspectiveRunShadowCampaign(campaign, [])
    expect(report.status).toBe("evidence_blocked")
    expect(report.evidence[0].reasonCodes).toEqual(expect.arrayContaining(["campaign_invalid", "policy_tampered"]))
    const baselineTampered = clone(baseCampaign)
    baselineTampered.baseline.commit = "tampered" as never
    const baselineReport = runProspectiveRunShadowCampaign(baselineTampered, [])
    expect(baselineReport.evidence[0].reasonCodes).toContain("campaign_invalid")
  })

  it.each([null, 1, "manifest", [], { schemaVersion: 1, evidence: null }])("fails closed for malformed manifest %p", manifest => {
    expect(() => runProspectiveRunShadowCampaign(manifest, [])).not.toThrow()
    const report = runProspectiveRunShadowCampaign(manifest, [])
    expect(report.status).toBe("evidence_blocked")
    expect(report.promotion.promoted).toBe(false)
  })

  it("rejects missing canonical windows and five incomplete nominal fixtures", () => {
    const omittedBoundary = canonicalStaticWindowBoundaries(sourceFixture)[0].observedThroughOverallPick
    const incomplete = futurePairedFixture({ omitBoundary: omittedBoundary })
    const campaign = campaignFor(incomplete)
    const report = runProspectiveRunShadowCampaign(campaign.manifest, [campaign.input])
    expect(report.evidence[0].reasonCodes).toContain("canonical_window_incomplete")

    const five = Array.from({ length: 5 }, (_, index) => futurePairedFixture({ id: `incomplete-${index}`, omitBoundary: omittedBoundary }))
    const fiveManifest = clone(baseCampaign)
    fiveManifest.evidence = five.map((item, index) => {
      const rawContent = JSON.stringify(item)
      return { id: `incomplete-${index}`, fixturePath: `incomplete-${index}.json`, fixtureId: item.id, contentSha256: createProspectiveFixtureContentSha256(rawContent), baselineCommit: fiveManifest.baseline.commit, baselineTag: fiveManifest.baseline.tag, declaredProvenance: { platform: "ESPN", kind: "completed_mock", captureMethod: "extension_board_export", captureVersion: 1 } }
    })
    const fiveReport = runProspectiveRunShadowCampaign(fiveManifest, five.map((item, index) => ({ path: `incomplete-${index}.json`, rawContent: JSON.stringify(item) })))
    expect(fiveReport.eligibleFixtureCount).toBe(0)
    expect(fiveReport.gates.evidenceSufficiency.status).toBe("insufficient")
  })

  it("keeps coverage bookkeeping explicit and blocks insufficient varied formats", () => {
    const fixture = futurePairedFixture()
    const campaign = campaignFor(fixture)
    campaign.manifest.policy.evidenceSufficiency = baseCampaign.policy.evidenceSufficiency
    const report = runProspectiveRunShadowCampaign(campaign.manifest, [campaign.input])
    expect(report.coverage.teamCounts).toEqual([10])
    expect(report.coverage.scoringFormats).toEqual(["PPR"])
    expect(report.coverage.superflex).toBe("absent")
    expect(report.gates.evidenceSufficiency.status).toBe("insufficient")
    expect(report.stratified.overall.status).toBe("insufficient")
    expect(report.nextCaptureNeeds).toEqual(expect.arrayContaining([
      "capture a 12-team fixture",
      "capture a STANDARD fixture",
      "capture a complete QB1-RB2-WR3-TE1-FLEX1-BENCH6 roster-shape fixture",
    ]))
  })

  it("keeps frozen v1 live and makes no promotion or live-model decision", () => {
    const fixture = futurePairedFixture()
    const before = JSON.stringify(fixture.forecastEvidence)
    const report = reportFor(fixture)
    expect(JSON.stringify(fixture.forecastEvidence)).toBe(before)
    expect(report.promotion).toEqual(expect.objectContaining({ promoted: false }))
    expect(report.baseline.commit).toBe("1410d29fa17fd55a206bb7fc0cdaf16ec435d696")
  })

  it("does not let exact-player probabilities enter metrics or gates", () => {
    const fixture = futurePairedFixture()
    fixture.forecastEvidence!.observations[0].forecast.picks.forEach(pick => {
      pick.playerProbabilities = pick.playerProbabilities.map(player => ({
        ...player,
        overallProbability: player.overallProbability === 0 ? 0.001 : player.overallProbability,
      }))
    })
    const observation = fixture.forecastEvidence!.observations[0]
    observation.observationFingerprint = createReplayForecastObservationFingerprint({
      observedThroughOverallPick: observation.observedThroughOverallPick,
      modelIdentity: observation.modelIdentity,
      model: observation.model,
      targetRosterIndex: observation.targetRosterIndex,
      forecast: observation.forecast,
    })
    const report = reportFor(fixture)
    expect(report.evidence[0].disposition).toBe("eligible")
    expect(report.fixtures[0].gates).not.toHaveProperty("exactPlayer")
    expect(report.fixtures[0].frozenV1.position.available).toBe(true)
  })
})
