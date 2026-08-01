import { createHash } from "node:crypto"
import { FantasyPosition } from "../../types"
import { validateCompletedDraftReplay } from "./replayFixtures"
import { validateRecordedOpponentForecastEvidence } from "./replayMetrics"
import { validateRunOnlyShadowEvidence } from "./runOnlyShadowMetrics"
import { canonicalStaticWindowBoundaries } from "./staticWindowBacktest"
import { summarizeRunEvents } from "./staticWindowRunTuning"
import type {
  RecordedCompletedDraftReplay,
  ReplayForecastObservation,
  ReplayRunOnlyShadowObservation,
} from "./completedDraftReplay"
import type { RunEvent, RunPosition, StaticWindowRunMetrics } from "./staticWindowRunTuning"

export const PHASE9_PROSPECTIVE_CAMPAIGN_SCHEMA_VERSION = 1 as const
export const PHASE9_PROSPECTIVE_POLICY_VERSION = 1 as const
export const PHASE9_BASELINE_COMMIT =
  "1410d29fa17fd55a206bb7fc0cdaf16ec435d696" as const
export const PHASE9_BASELINE_PARENT =
  "78b59bd33b7da79310519667acbcba1a14e181ce" as const
export const PHASE9_BASELINE_TAG = "phase8-integration-baseline-2026-08-01" as const
export const PHASE9_BASELINE_COMMITTED_AT = "2026-08-01T10:05:42-04:00" as const

export const PROSPECTIVE_RUN_SHADOW_REASON_CODES = {
  campaignInvalid: "campaign_invalid",
  policyFingerprintMismatch: "policy_fingerprint_mismatch",
  policyTampered: "policy_tampered",
  duplicateEvidenceId: "duplicate_evidence_id",
  duplicateDeclarationPath: "duplicate_declaration_path",
  duplicateInputPath: "duplicate_input_path",
  duplicateFixture: "duplicate_fixture",
  fixtureNotFound: "fixture_not_found",
  unlistedEvidence: "unlisted_evidence",
  missingPairedEvidence: "missing_paired_evidence",
  fixtureHashMismatch: "fixture_hash_mismatch",
  fixtureMalformed: "fixture_malformed",
  malformedJson: "malformed_fixture_json",
  malformedInput: "malformed_fixture_input",
  fixtureNotRecorded: "fixture_not_recorded",
  fixtureIncomplete: "fixture_incomplete",
  retrospectiveEvidence: "retrospective_evidence",
  fixtureIdMismatch: "fixture_id_mismatch",
  sourceProvenanceMismatch: "source_provenance_mismatch",
  shadowModelIdentityMismatch: "challenger_model_identity_mismatch",
  shadowArtifactIdMismatch: "challenger_artifact_id_mismatch",
  shadowArtifactFingerprintMismatch: "challenger_artifact_fingerprint_mismatch",
  shadowTrainingCorpusMismatch: "challenger_training_corpus_fingerprint_mismatch",
  shadowEnvelopeIdentityMismatch: "shadow_envelope_identity_mismatch",
  runOnlyEvidenceInvalid: "run_only_shadow_evidence_invalid",
  sessionMismatch: "session_mismatch",
  targetRosterMismatch: "target_roster_mismatch",
  duplicateBoundary: "duplicate_boundary",
  boundaryMismatch: "boundary_mismatch",
  horizonMismatch: "horizon_mismatch",
  phaseProvenanceMismatch: "phase_provenance_mismatch",
  fallbackPhaseProvenance: "fallback_phase_provenance",
  frozenProbabilityMismatch: "frozen_probability_mismatch",
  malformedProbability: "malformed_probability",
  missingLabel: "missing_label",
  canonicalWindowMissing: "canonical_window_missing",
  canonicalWindowIncomplete: "canonical_window_incomplete",
  noEligibleFixtures: "zero_eligible_fixtures",
  coverageInsufficient: "coverage_insufficient",
  subgroupInsufficient: "required_subgroup_insufficient",
  subgroupRegression: "required_subgroup_regression",
  positionGateInsufficient: "position_gate_insufficient",
  runGateInsufficient: "run_gate_insufficient",
  challengerPositionUnavailable: "challenger_position_probabilities_unavailable",
  observationOnly: "phase9_observation_only",
} as const

export type ProspectiveRunShadowReasonCode =
  typeof PROSPECTIVE_RUN_SHADOW_REASON_CODES[keyof typeof PROSPECTIVE_RUN_SHADOW_REASON_CODES]

export interface ProspectiveCampaignPolicy {
  version: typeof PHASE9_PROSPECTIVE_POLICY_VERSION
  baseline: {
    commit: typeof PHASE9_BASELINE_COMMIT
    parent: typeof PHASE9_BASELINE_PARENT
    tag: typeof PHASE9_BASELINE_TAG
    committedAt: typeof PHASE9_BASELINE_COMMITTED_AT
  }
  evidenceSufficiency: {
    minimumEligibleFixtures: number
    minimumDistinctDraftSlots: number
    requiredTeamCounts: number[]
    requiredScoringFormats: Array<"PPR" | "STANDARD">
    minimumDistinctRosterShapes: number
    requiredRosterShapes: string[]
    minimumCompleteWindowsPerRequiredSubgroup: number
  }
  positionAcceptance: {
    mode: "frozen_v1_reference_only"
    challengerComparison: "not_available_in_run_only_schema"
  }
  runAcceptance: {
    minimumPicks: 3
    threshold: 0.5
    maximumBrierRegression: number
    maximumLogLossRegression: number
    maximumPrecisionRegression: number
    maximumRecallRegression: number
    maximumF1Regression: number
    minimumMaterialBrierImprovement: number
    minimumMaterialLogLossImprovement: number
  }
  rationale: {
    sufficiency: string
    rosterCoverage: string
    position: string
    run: string
  }
}

export interface ProspectiveCampaignManifest {
  schemaVersion: typeof PHASE9_PROSPECTIVE_CAMPAIGN_SCHEMA_VERSION
  campaignId: string
  baseline: ProspectiveCampaignPolicy["baseline"]
  policy: ProspectiveCampaignPolicy
  policyFingerprint: string
  coverageTargets: {
    draftSlots: number[]
    teamCounts: number[]
    scoringFormats: Array<"PPR" | "STANDARD">
    rosterShapes: string[]
    superflex: "report_if_represented"
  }
  evidence: ProspectiveCampaignEvidenceDeclaration[]
}

export interface ProspectiveCampaignEvidenceDeclaration {
  id: string
  fixturePath: string
  fixtureId: string
  contentSha256: string
  baselineCommit: typeof PHASE9_BASELINE_COMMIT
  baselineTag: typeof PHASE9_BASELINE_TAG
  declaredProvenance: {
    platform: "ESPN"
    kind: "completed_mock"
    captureMethod: "extension_board_export" | "cli_board_export"
    captureVersion: 1
  }
}

export interface ProspectiveFixtureInput {
  path: string
  rawContent: string
}

export interface LeagueFormatCoverage {
  teamCount: number
  scoringFormat: "PPR" | "STANDARD"
  rosterShape: string
  starters: { QB: number, RB: number, WR: number, TE: number }
  flex: number
  bench: number
  superflex: boolean
  superflexRepresentation: "derived_from_starting_qb_count"
  draftSlot: number
}

export interface ProspectiveEvidenceDecision {
  id?: string
  fixturePath: string
  fixtureId?: string
  contentSha256?: string
  disposition: "eligible" | "excluded" | "invalid"
  reasonCodes: ProspectiveRunShadowReasonCode[]
  coverage?: LeagueFormatCoverage
}

export interface PositionCalibrationSummary {
  evaluatedPicks: number
  expectedCalibrationError: number
  bins: Array<{
    lowerInclusive: number
    upperExclusive: number
    includesUpperBound: boolean
    count: number
    meanConfidence: number
    empiricalAccuracy: number
  }>
}

export interface PositionMetrics {
  available: true
  evaluatedPicks: number
  positionBrierScore: number
  topPositionAccuracy: number
  calibration: PositionCalibrationSummary
}

export interface RunMetrics {
  available: true
  evaluatedEvents: number
  runBrierScore: number
  runLogLoss: number
  calibration: {
    evaluatedEvents: number
    meanPredictedProbability: number
    observedRate: number
    signedCalibrationError: number
    absoluteCalibrationError: number
  }
  atThreshold: {
    threshold: number
    truePositives: number
    falsePositives: number
    falseNegatives: number
    predictedPositives: number
    actualPositives: number
    precision: number
    recall: number
    f1: number
  }
}

export interface UnavailableMetric {
  available: false
  reasonCode: ProspectiveRunShadowReasonCode
  reason: string
}

export interface WindowCoverage {
  expected: number
  /** Paired observations at expected canonical boundaries only. */
  captured: number
  /** Canonical pairs whose frozen and shadow horizons are identical. */
  comparable: number
  /** Canonical pairs admitted to the scorer; never includes extras. */
  scored: number
  /** Expected canonical windows without a comparable pair. */
  missing: number
  /** Valid, paired noncanonical observations retained outside the scorer. */
  extra: number
}

export interface RunMetricDeltas {
  runBrierScore: number
  runLogLoss: number
  precision: number
  recall: number
  f1: number
  absoluteCalibrationError: number
  direction: {
    runBrierScore: MetricDirection
    runLogLoss: MetricDirection
    precision: MetricDirection
    recall: MetricDirection
    f1: MetricDirection
    absoluteCalibrationError: MetricDirection
  }
}

export type MetricDirection = "improved" | "regressed" | "unchanged"

export interface GateResult {
  status: "pass" | "fail" | "insufficient"
  reasonCodes: ProspectiveRunShadowReasonCode[]
  failures: string[]
  mode?: "active" | "reference_only"
}

export interface ProspectiveFixtureReport {
  fixtureId: string
  fixturePath: string
  coverage: LeagueFormatCoverage
  evaluatedObservationCount: number
  evaluatedPickCount: number
  evaluatedRunWindowCount: number
  windowCoverage: WindowCoverage
  evaluatedPositionLabelCount: number
  evaluatedRunEventCount: number
  frozenV1: { position: PositionMetrics | UnavailableMetric, run: RunMetrics | UnavailableMetric }
  challenger: { position: UnavailableMetric, run: RunMetrics | UnavailableMetric }
  deltas: { position: UnavailableMetric, run: RunMetricDeltas | UnavailableMetric }
  gates: { position: GateResult, run: GateResult }
}

export interface ProspectiveSubgroupReport {
  dimension: "scoringFormat" | "teamCount" | "rosterShape"
  key: string
  required: boolean
  fixtureCount: number
  windowCoverage: WindowCoverage
  evaluatedPositionLabelCount: number
  evaluatedRunEventCount: number
  frozenV1: { position: PositionMetrics | UnavailableMetric, run: RunMetrics | UnavailableMetric }
  challenger: { position: UnavailableMetric, run: RunMetrics | UnavailableMetric }
  deltas: { position: UnavailableMetric, run: RunMetricDeltas | UnavailableMetric }
  gate: GateResult
}

export interface ProspectiveRunShadowReport {
  schemaVersion: typeof PHASE9_PROSPECTIVE_CAMPAIGN_SCHEMA_VERSION
  reportKind: "phase9_prospective_run_shadow"
  campaignId: string
  campaignPolicyVersion: typeof PHASE9_PROSPECTIVE_POLICY_VERSION
  policy: ProspectiveCampaignPolicy
  policyFingerprint: string
  baseline: ProspectiveCampaignPolicy["baseline"]
  status: "evidence_available" | "evidence_blocked"
  evidence: ProspectiveEvidenceDecision[]
  eligibleFixtureCount: number
  excludedEvidenceCount: number
  invalidEvidenceCount: number
  coverage: {
    eligibleFixtureCount: number
    distinctDraftSlots: number[]
    teamCounts: number[]
    scoringFormats: Array<"PPR" | "STANDARD">
    rosterShapes: string[]
    superflex: "present" | "absent"
    missing: string[]
  }
  aggregate?: {
    evaluatedObservationCount: number
    evaluatedPickCount: number
    evaluatedRunWindowCount: number
    windowCoverage: WindowCoverage
    evaluatedPositionLabelCount: number
    evaluatedRunEventCount: number
    frozenV1: { position: PositionMetrics, run: RunMetrics }
    challenger: { position: UnavailableMetric, run: RunMetrics }
    deltas: { position: UnavailableMetric, run: RunMetricDeltas }
  }
  stratified: {
    scoringFormat: ProspectiveSubgroupReport[]
    teamCount: ProspectiveSubgroupReport[]
    rosterShape: ProspectiveSubgroupReport[]
    overall: GateResult
  }
  fixtures: ProspectiveFixtureReport[]
  gates: { evidenceSufficiency: GateResult, position: GateResult, run: GateResult }
  promotion: {
    promoted: false
    reasonCode: typeof PROSPECTIVE_RUN_SHADOW_REASON_CODES.observationOnly
    reason: string
  }
  nextCaptureNeeds: string[]
}

const POSITIONS: RunPosition[] = [
  FantasyPosition.QUARTERBACK,
  FantasyPosition.RUNNING_BACK,
  FantasyPosition.WIDE_RECEIVER,
  FantasyPosition.TIGHT_END,
]
const EPSILON = 0.000001
const CALIBRATION_EDGES = [0, 0.25, 0.5, 0.75, 1] as const
const SHA256 = /^[a-f0-9]{64}$/
const FINGERPRINT = /^[a-f0-9]{8}$/

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value)
const isFiniteProbability = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1
const sortedUniqueNumbers = (values: number[]): number[] =>
  Array.from(new Set(values)).sort((left, right) => left - right)
const sortedUniqueStrings = (values: string[]): string[] =>
  Array.from(new Set(values)).sort((left, right) => left.localeCompare(right))

const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map(key =>
      `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`
  }
  return JSON.stringify(value)
}

const sha256 = (value: unknown): string =>
  createHash("sha256").update(stableJson(value), "utf8").digest("hex")

const baseline = {
  commit: PHASE9_BASELINE_COMMIT,
  parent: PHASE9_BASELINE_PARENT,
  tag: PHASE9_BASELINE_TAG,
  committedAt: PHASE9_BASELINE_COMMITTED_AT,
} as const

/** Version 1 is an immutable contract, not caller-supplied tuning input. */
const CANONICAL_PHASE9_POLICY: ProspectiveCampaignPolicy = {
  version: 1,
  baseline,
  evidenceSufficiency: {
    minimumEligibleFixtures: 5,
    minimumDistinctDraftSlots: 4,
    requiredTeamCounts: [10, 12],
    requiredScoringFormats: ["PPR", "STANDARD"],
    minimumDistinctRosterShapes: 2,
    requiredRosterShapes: [
      "QB1-RB2-WR2-TE1-FLEX1-BENCH7",
      "QB1-RB2-WR3-TE1-FLEX1-BENCH6",
    ],
    // Two complete topology windows per required marginal subgroup is the
    // smallest explicit support guard derived from complete-window evidence.
    minimumCompleteWindowsPerRequiredSubgroup: 2,
  },
  positionAcceptance: {
    mode: "frozen_v1_reference_only",
    challengerComparison: "not_available_in_run_only_schema",
  },
  runAcceptance: {
    minimumPicks: 3,
    threshold: 0.5,
    maximumBrierRegression: 0.01,
    maximumLogLossRegression: 0.01,
    maximumPrecisionRegression: 0.05,
    maximumRecallRegression: 0.05,
    maximumF1Regression: 0.05,
    minimumMaterialBrierImprovement: 0.002,
    minimumMaterialLogLossImprovement: 0.002,
  },
  rationale: {
    sufficiency: "Five complete newly admitted fixtures, four draft slots, and two complete windows per required marginal subgroup preserve the existing Phase 4/8 fixture denominator while preventing partial drafts from satisfying Phase 9 evidence.",
    rosterCoverage: "Ten- and twelve-team PPR/Standard coverage and the two listed roster shapes are required marginal dimensions. The repository has no stronger prospective roster-shape denominator, so these explicit capture requirements remain evidence-blocking until varied complete captures exist.",
    position: "The bounded run-only envelope stores no challenger position vector. Frozen-v1 position Brier, top-position accuracy, and calibration are reference/integrity metrics only; no inactive numerical position threshold is a gate and exact-player metrics are excluded.",
    run: "Run Brier/log-loss and the 0.50 precision, recall, and F1 no-harm guardrails reuse the existing static-window residual tolerances. Aggregate run improvement is required, while each adequately supported required marginal subgroup must avoid material regression. Phase 9A never promotes a model.",
  },
}

export const createPhase9PolicyFingerprint = (policy: ProspectiveCampaignPolicy): string => sha256(policy)

// Filled from CANONICAL_PHASE9_POLICY and checked in as a literal below after
// the policy contract is finalized. Keeping the comparison here makes policy
// edits fail closed even if a caller recomputes a new fingerprint.
export const PHASE9_POLICY_FINGERPRINT =
  "f6cac586811f0276f8066a563f5570d75d79e9a14a64f479627d6a7488797574"

export const createProspectiveFixtureContentSha256 = (rawContent: string): string =>
  createHash("sha256").update(rawContent, "utf8").digest("hex")

const isPosition = (value: unknown): value is RunPosition => POSITIONS.includes(value as RunPosition)

const safeFixtureValidation = (fixture: unknown): string[] => {
  if (!isRecord(fixture)) return ["fixture is missing or malformed"]
  try {
    return validateCompletedDraftReplay(fixture as unknown as RecordedCompletedDraftReplay)
  } catch {
    return ["fixture is missing or malformed"]
  }
}

const safeFrozenValidation = (fixture: RecordedCompletedDraftReplay): string[] => {
  try {
    return validateRecordedOpponentForecastEvidence(fixture)
  } catch {
    return ["forecast evidence is invalid"]
  }
}

const safeRunOnlyValidation = (fixture: RecordedCompletedDraftReplay): string[] => {
  try {
    return validateRunOnlyShadowEvidence(fixture)
  } catch {
    return ["run-only shadow evidence is invalid"]
  }
}

const sourceIsComplete = (fixture: RecordedCompletedDraftReplay): boolean => {
  if (!isRecord(fixture.settings) || !Array.isArray(fixture.actualPicks)) return false
  const source = fixture.source
  if (!isRecord(source)) return false
  return source.platform === "ESPN"
    && source.totalPicks === fixture.actualPicks.length
    && source.numRounds * fixture.settings.numTeams === fixture.actualPicks.length
    && source.platformRosterSize === source.numRounds
    && fixture.actualPicks.length > 0
}

const coverageFor = (fixture: RecordedCompletedDraftReplay): LeagueFormatCoverage => {
  const settings = fixture.settings
  return {
    teamCount: settings.numTeams,
    scoringFormat: settings.ppr ? "PPR" : "STANDARD",
    rosterShape: `QB${settings.numStartingQbs}-RB${settings.numStartingRbs}-WR${settings.numStartingWrs}-TE${settings.numStartingTes}-FLEX${settings.numFlex}-BENCH${settings.numBenchPlayers}`,
    starters: { QB: settings.numStartingQbs, RB: settings.numStartingRbs, WR: settings.numStartingWrs, TE: settings.numStartingTes },
    flex: settings.numFlex,
    bench: settings.numBenchPlayers,
    superflex: settings.numStartingQbs >= 2,
    superflexRepresentation: "derived_from_starting_qb_count",
    draftSlot: fixture.targetRosterIndex + 1,
  }
}

const actualOpponentLabels = (fixture: RecordedCompletedDraftReplay) => fixture.actualPicks.flatMap(pick => {
  if (pick.rosterIndex === fixture.targetRosterIndex) return []
  const player = pick.playerId ? fixture.players.find(candidate => candidate.id === pick.playerId) : undefined
  const declaredPosition = pick.position || player?.position
  return declaredPosition && isPosition(declaredPosition)
    ? [{ overallPick: pick.overallPick, playerId: pick.playerId, position: declaredPosition }]
    : []
})

const missingFutureLabels = (fixture: RecordedCompletedDraftReplay): boolean => {
  const evidence = fixture.runOnlyShadowEvidence
  if (!evidence) return true
  const picksByOverall = new Map(fixture.actualPicks.map(pick => [pick.overallPick, pick]))
  return evidence.observations.some(observation => observation.forecast.horizon.some(slot => {
    const pick = picksByOverall.get(slot.overallPick)
    if (!pick || pick.rosterIndex === fixture.targetRosterIndex) return true
    const player = pick.playerId ? fixture.players.find(candidate => candidate.id === pick.playerId) : undefined
    const declared = pick.position || player?.position
    // K/DST and any future non-positional slot remain in the horizon but are
    // intentionally not positive QB/RB/WR/TE labels.
    if (declared && !isPosition(declared)) return false
    if (!pick.playerId) return true
    return !player || (declared && isPosition(declared) && player.position !== declared)
  }))
}

const stablePositionTop = (probabilities: Array<{ position: RunPosition, probability: number }>): RunPosition =>
  [...probabilities].sort((left, right) => right.probability - left.probability || left.position.localeCompare(right.position))[0].position

const calibrationForPositions = (samples: Array<{ confidence: number, hit: number }>): PositionCalibrationSummary | undefined => {
  if (!samples.length) return undefined
  const bins = CALIBRATION_EDGES.slice(0, -1).map((lowerInclusive, index) => ({
    lowerInclusive,
    upperExclusive: CALIBRATION_EDGES[index + 1],
    includesUpperBound: index === CALIBRATION_EDGES.length - 2,
    values: [] as Array<{ confidence: number, hit: number }>,
  }))
  samples.forEach(sample => bins[Math.min(bins.length - 1, Math.floor(sample.confidence * bins.length))].values.push(sample))
  const summarized = bins.map(bin => ({
    lowerInclusive: bin.lowerInclusive,
    upperExclusive: bin.upperExclusive,
    includesUpperBound: bin.includesUpperBound,
    count: bin.values.length,
    meanConfidence: bin.values.length ? bin.values.reduce((sum, value) => sum + value.confidence, 0) / bin.values.length : 0,
    empiricalAccuracy: bin.values.length ? bin.values.reduce((sum, value) => sum + value.hit, 0) / bin.values.length : 0,
  }))
  return {
    evaluatedPicks: samples.length,
    expectedCalibrationError: summarized.reduce((sum, bin) => sum + bin.count / samples.length * Math.abs(bin.meanConfidence - bin.empiricalAccuracy), 0),
    bins: summarized,
  }
}

const scorePositionSamples = (samples: Array<{ probabilities: Array<{ position: RunPosition, probability: number }>, actual: RunPosition }>): PositionMetrics | undefined => {
  if (!samples.length) return undefined
  const brier = samples.reduce((sum, sample) => sum + sample.probabilities.reduce(
    (score, candidate) => score + (candidate.probability - (candidate.position === sample.actual ? 1 : 0)) ** 2, 0,
  ), 0) / samples.length
  const calibrationSamples = samples.map(sample => {
    const top = stablePositionTop(sample.probabilities)
    return { confidence: sample.probabilities.find(candidate => candidate.position === top)!.probability, hit: top === sample.actual ? 1 : 0 }
  })
  const calibration = calibrationForPositions(calibrationSamples)
  if (!calibration) return undefined
  return {
    available: true,
    evaluatedPicks: samples.length,
    positionBrierScore: brier,
    topPositionAccuracy: calibrationSamples.reduce((sum, sample) => sum + sample.hit, 0) / samples.length,
    calibration,
  }
}

const summarizeRun = (events: RunEvent[]): RunMetrics | undefined => {
  if (!events.length) return undefined
  const summary: StaticWindowRunMetrics = summarizeRunEvents(events)
  const threshold = summary.thresholds.find(item => item.threshold === 0.5)
  if (!threshold) return undefined
  return {
    available: true,
    evaluatedEvents: summary.evaluatedEvents,
    runBrierScore: summary.brierScore,
    runLogLoss: summary.logLoss,
    calibration: {
      evaluatedEvents: events.length,
      meanPredictedProbability: events.reduce((sum, event) => sum + event.probability, 0) / events.length,
      observedRate: events.reduce((sum, event) => sum + (event.actual ? 1 : 0), 0) / events.length,
      signedCalibrationError: events.reduce((sum, event) => sum + event.probability - (event.actual ? 1 : 0), 0) / events.length,
      absoluteCalibrationError: events.reduce((sum, event) => sum + Math.abs(event.probability - (event.actual ? 1 : 0)), 0) / events.length,
    },
    atThreshold: threshold,
  }
}

const unavailable = (reasonCode: ProspectiveRunShadowReasonCode, reason: string): UnavailableMetric => ({ available: false, reasonCode, reason })
const directionFor = (delta: number, lowerIsBetter = false): MetricDirection => {
  const signed = lowerIsBetter ? -delta : delta
  return signed < -EPSILON ? "regressed" : signed > EPSILON ? "improved" : "unchanged"
}

const compareRunMetrics = (frozen: RunMetrics, challenger: RunMetrics): RunMetricDeltas => ({
  runBrierScore: challenger.runBrierScore - frozen.runBrierScore,
  runLogLoss: challenger.runLogLoss - frozen.runLogLoss,
  precision: challenger.atThreshold.precision - frozen.atThreshold.precision,
  recall: challenger.atThreshold.recall - frozen.atThreshold.recall,
  f1: challenger.atThreshold.f1 - frozen.atThreshold.f1,
  absoluteCalibrationError: challenger.calibration.absoluteCalibrationError - frozen.calibration.absoluteCalibrationError,
  direction: {
    runBrierScore: directionFor(challenger.runBrierScore - frozen.runBrierScore, true),
    runLogLoss: directionFor(challenger.runLogLoss - frozen.runLogLoss, true),
    precision: directionFor(challenger.atThreshold.precision - frozen.atThreshold.precision),
    recall: directionFor(challenger.atThreshold.recall - frozen.atThreshold.recall),
    f1: directionFor(challenger.atThreshold.f1 - frozen.atThreshold.f1),
    absoluteCalibrationError: directionFor(challenger.calibration.absoluteCalibrationError - frozen.calibration.absoluteCalibrationError, true),
  },
})

const runRegressionFailures = (
  deltas: RunMetricDeltas,
  policy: ProspectiveCampaignPolicy["runAcceptance"],
): string[] => {
  const failures: string[] = []
  if (deltas.runBrierScore > policy.maximumBrierRegression) failures.push("run Brier regression exceeds policy")
  if (deltas.runLogLoss > policy.maximumLogLossRegression) failures.push("run log-loss regression exceeds policy")
  if (deltas.precision < -policy.maximumPrecisionRegression) failures.push("run precision regression exceeds policy")
  if (deltas.recall < -policy.maximumRecallRegression) failures.push("run recall regression exceeds policy")
  if (deltas.f1 < -policy.maximumF1Regression) failures.push("run F1 regression exceeds policy")
  return failures
}

const runGateFor = (frozen: RunMetrics | undefined, challenger: RunMetrics | undefined, policy: ProspectiveCampaignPolicy["runAcceptance"], requireImprovement = true): GateResult => {
  if (!frozen || !challenger) return { status: "insufficient", reasonCodes: [PROSPECTIVE_RUN_SHADOW_REASON_CODES.runGateInsufficient], failures: ["paired run metrics are unavailable"], mode: "active" }
  const deltas = compareRunMetrics(frozen, challenger)
  const failures = runRegressionFailures(deltas, policy)
  if (requireImprovement && deltas.runBrierScore > -policy.minimumMaterialBrierImprovement
    && deltas.runLogLoss > -policy.minimumMaterialLogLossImprovement) failures.push("run challenger has no material probabilistic improvement")
  return {
    status: failures.length ? "fail" : "pass",
    reasonCodes: failures.length ? [PROSPECTIVE_RUN_SHADOW_REASON_CODES.runGateInsufficient] : [],
    failures,
    mode: "active",
  }
}

const frozenPositionGateFor = (metrics: PositionMetrics | undefined): GateResult => metrics
  ? { status: "pass", reasonCodes: [], failures: [], mode: "reference_only" }
  : { status: "insufficient", reasonCodes: [PROSPECTIVE_RUN_SHADOW_REASON_CODES.positionGateInsufficient], failures: ["frozen v1 position reference labels are unavailable"], mode: "reference_only" }

const expectedRunVector = (observation: ReplayForecastObservation, minimumPicks: number) => {
  const vectors = POSITIONS.map(position => observation.forecast.picks.map(pick =>
    pick.positionProbabilities.find(candidate => candidate.position === position)?.probability))
  if (vectors.some(probabilities => probabilities.some(value => value === undefined))) return []
  return vectors.map((probabilities, index) => {
    let distribution = [1]
    probabilities.forEach(probability => {
      const next = Array(probabilities.length + 1).fill(0) as number[]
      distribution.forEach((value, count) => {
        if (value === 0) return
        next[count] += value * (1 - probability!)
        next[count + 1] += value * probability!
      })
      distribution = next
    })
    return { position: POSITIONS[index], probability: distribution.slice(minimumPicks).reduce((sum, value) => sum + value, 0) }
  })
}

const shadowProvenanceReasons = (fixture: RecordedCompletedDraftReplay): ProspectiveRunShadowReasonCode[] => {
  const observations: unknown[] = Array.isArray(fixture.runOnlyShadowEvidence?.observations)
    ? fixture.runOnlyShadowEvidence.observations
    : []
  const reasons = new Set<ProspectiveRunShadowReasonCode>()
  observations.forEach(value => {
    if (!isRecord(value)) {
      reasons.add(PROSPECTIVE_RUN_SHADOW_REASON_CODES.runOnlyEvidenceInvalid)
      return
    }
    const observation = value as unknown as ReplayRunOnlyShadowObservation
    if (observation.modelIdentity !== "bounded_residual_run_shadow_v1") reasons.add(PROSPECTIVE_RUN_SHADOW_REASON_CODES.shadowModelIdentityMismatch)
    if (observation.artifactId !== "bounded_residual_run_shadow_v1") reasons.add(PROSPECTIVE_RUN_SHADOW_REASON_CODES.shadowArtifactIdMismatch)
    if (observation.artifactFingerprint !== "ce1f07b2") reasons.add(PROSPECTIVE_RUN_SHADOW_REASON_CODES.shadowArtifactFingerprintMismatch)
    if (observation.trainingCorpusFingerprint !== "d43e0754c60937794fabcf3fbf89cf7cad43fea6133274255d56008271f6c652") reasons.add(PROSPECTIVE_RUN_SHADOW_REASON_CODES.shadowTrainingCorpusMismatch)
    const forecast = observation.forecast as unknown as Record<string, unknown>
    if (isRecord(forecast) && (forecast.modelIdentity !== observation.modelIdentity
      || forecast.artifactId !== observation.artifactId
      || forecast.artifactFingerprint !== observation.artifactFingerprint
      || forecast.trainingCorpusFingerprint !== observation.trainingCorpusFingerprint)) reasons.add(PROSPECTIVE_RUN_SHADOW_REASON_CODES.shadowEnvelopeIdentityMismatch)
  })
  return Array.from(reasons)
}

const validatePairedEvidence = (fixture: RecordedCompletedDraftReplay): ProspectiveRunShadowReasonCode[] => {
  const frozen = fixture.forecastEvidence
  const shadow = fixture.runOnlyShadowEvidence
  if (!frozen || !shadow || !Array.isArray(frozen.observations) || !Array.isArray(shadow.observations)) return [PROSPECTIVE_RUN_SHADOW_REASON_CODES.missingPairedEvidence]
  const reasons = new Set<ProspectiveRunShadowReasonCode>()
  if (frozen.sessionId !== fixture.id || shadow.sessionId !== fixture.id) reasons.add(PROSPECTIVE_RUN_SHADOW_REASON_CODES.sessionMismatch)
  if (frozen.observations.some(observation => observation.modelIdentity !== "deterministic_opponent_v1" || observation.model !== "combined")) reasons.add(PROSPECTIVE_RUN_SHADOW_REASON_CODES.sourceProvenanceMismatch)
  if (frozen.observations.some(observation => observation.targetRosterIndex !== fixture.targetRosterIndex)
    || shadow.observations.some(observation => observation.targetRosterIndex !== fixture.targetRosterIndex)) reasons.add(PROSPECTIVE_RUN_SHADOW_REASON_CODES.targetRosterMismatch)
  const frozenBoundaries = new Set<number>()
  frozen.observations.forEach(observation => { if (frozenBoundaries.has(observation.observedThroughOverallPick)) reasons.add(PROSPECTIVE_RUN_SHADOW_REASON_CODES.duplicateBoundary); frozenBoundaries.add(observation.observedThroughOverallPick) })
  const shadowBoundaries = new Set<number>()
  shadow.observations.forEach(observation => { if (shadowBoundaries.has(observation.observedThroughOverallPick)) reasons.add(PROSPECTIVE_RUN_SHADOW_REASON_CODES.duplicateBoundary); shadowBoundaries.add(observation.observedThroughOverallPick) })
  const shadowByBoundary = new Map(shadow.observations.map(observation => [observation.observedThroughOverallPick, observation]))
  if (frozen.observations.length !== shadow.observations.length) reasons.add(PROSPECTIVE_RUN_SHADOW_REASON_CODES.boundaryMismatch)
  frozen.observations.forEach(observation => {
    const challenger = shadowByBoundary.get(observation.observedThroughOverallPick)
    if (!challenger) { reasons.add(PROSPECTIVE_RUN_SHADOW_REASON_CODES.boundaryMismatch); return }
    if (observation.forecast.picks.length !== challenger.forecast.horizon.length
      || observation.forecast.picks.some((pick, index) => pick.overallPick !== challenger.forecast.horizon[index]?.overallPick || pick.rosterIndex !== challenger.forecast.horizon[index]?.rosterIndex)) reasons.add(PROSPECTIVE_RUN_SHADOW_REASON_CODES.horizonMismatch)
    if (challenger.phaseProvenance.kind !== "known_total") reasons.add(PROSPECTIVE_RUN_SHADOW_REASON_CODES.fallbackPhaseProvenance)
    if (challenger.phaseProvenance.kind === "known_total" && challenger.phaseProvenance.totalDraftPicks !== fixture.actualPicks.length) reasons.add(PROSPECTIVE_RUN_SHADOW_REASON_CODES.phaseProvenanceMismatch)
    if (observation.forecast.picks.some(pick => pick.overallPick <= observation.observedThroughOverallPick)) reasons.add(PROSPECTIVE_RUN_SHADOW_REASON_CODES.phaseProvenanceMismatch)
    const canonical = expectedRunVector(observation, 3)
    if (!canonical.length || !canonical.every(candidate => challenger.forecast.frozenRunProbabilities.some(run => run.position === candidate.position && Math.abs(run.probability - candidate.probability) <= EPSILON))) reasons.add(PROSPECTIVE_RUN_SHADOW_REASON_CODES.frozenProbabilityMismatch)
    if (POSITIONS.some(position => {
      const expected = observation.forecast.runProbabilities.find(run => run.position === position)
      const actual = challenger.forecast.frozenRunProbabilities.find(run => run.position === position)
      return !expected || !actual || expected.minimumPicks !== 3 || Math.abs(expected.probability - actual.probability) > EPSILON
    })) reasons.add(PROSPECTIVE_RUN_SHADOW_REASON_CODES.frozenProbabilityMismatch)
    if (challenger.forecast.challengerRunProbabilities.some(run => !isFiniteProbability(run.probability))) reasons.add(PROSPECTIVE_RUN_SHADOW_REASON_CODES.malformedProbability)
  })
  if (missingFutureLabels(fixture)) reasons.add(PROSPECTIVE_RUN_SHADOW_REASON_CODES.missingLabel)
  return Array.from(reasons)
}

interface CanonicalWindowMatch {
  observedThroughOverallPick: number
  terminalTargetPick: number
  frozen?: ReplayForecastObservation
  shadow?: ReplayRunOnlyShadowObservation
  comparable: boolean
}

interface CanonicalWindowAssessment {
  matches: CanonicalWindowMatch[]
  coverage: WindowCoverage
  reasonCodes: ProspectiveRunShadowReasonCode[]
}

const sameHorizon = (frozen: ReplayForecastObservation, shadow: ReplayRunOnlyShadowObservation): boolean =>
  frozen.forecast.picks.length === shadow.forecast.horizon.length
  && frozen.forecast.picks.every((pick, index) => pick.overallPick === shadow.forecast.horizon[index]?.overallPick && pick.rosterIndex === shadow.forecast.horizon[index]?.rosterIndex)

const assessCanonicalWindows = (fixture: RecordedCompletedDraftReplay): CanonicalWindowAssessment => {
  const expected = canonicalStaticWindowBoundaries(fixture)
  const frozen = fixture.forecastEvidence?.observations || []
  const shadow = fixture.runOnlyShadowEvidence?.observations || []
  const frozenByBoundary = new Map(frozen.map(observation => [observation.observedThroughOverallPick, observation]))
  const shadowByBoundary = new Map(shadow.map(observation => [observation.observedThroughOverallPick, observation]))
  const matches = expected.map(window => {
    const frozenObservation = frozenByBoundary.get(window.observedThroughOverallPick)
    const shadowObservation = shadowByBoundary.get(window.observedThroughOverallPick)
    return {
      ...window,
      frozen: frozenObservation,
      shadow: shadowObservation,
      comparable: Boolean(frozenObservation && shadowObservation && sameHorizon(frozenObservation, shadowObservation)),
    }
  })
  const captured = matches.filter(match => match.frozen && match.shadow).length
  const comparable = matches.filter(match => match.comparable).length
  const expectedBoundaries = new Set(expected.map(window => window.observedThroughOverallPick))
  const extra = [...frozen, ...shadow].filter(observation =>
    !expectedBoundaries.has(observation.observedThroughOverallPick)).length
  const reasonCodes = new Set<ProspectiveRunShadowReasonCode>()
  if (!expected.length) reasonCodes.add(PROSPECTIVE_RUN_SHADOW_REASON_CODES.canonicalWindowMissing)
  if (captured !== expected.length) reasonCodes.add(PROSPECTIVE_RUN_SHADOW_REASON_CODES.canonicalWindowIncomplete)
  if (comparable !== expected.length) reasonCodes.add(PROSPECTIVE_RUN_SHADOW_REASON_CODES.canonicalWindowIncomplete)
  return {
    matches,
    coverage: { expected: expected.length, captured, comparable, scored: comparable, missing: expected.length - comparable, extra },
    reasonCodes: Array.from(reasonCodes),
  }
}

const createPositionSamples = (
  fixture: RecordedCompletedDraftReplay,
  observations: ReplayForecastObservation[],
): Array<{ probabilities: Array<{ position: RunPosition, probability: number }>, actual: RunPosition }> => actualOpponentLabels(fixture).flatMap(label => {
  const owner = observations.filter(observation => observation.observedThroughOverallPick < label.overallPick
    && observation.forecast.picks.some(pick => pick.overallPick === label.overallPick))
    .sort((left, right) => right.observedThroughOverallPick - left.observedThroughOverallPick)[0]
  const prediction = owner?.forecast.picks.find(pick => pick.overallPick === label.overallPick)
  if (!prediction) return []
  const probabilities = prediction.positionProbabilities.flatMap(candidate => isPosition(candidate.position) ? [{ position: candidate.position, probability: candidate.probability }] : [])
  return probabilities.length === POSITIONS.length ? [{ probabilities, actual: label.position }] : []
})

const createRunEvents = (fixture: RecordedCompletedDraftReplay, shadowObservation: ReplayRunOnlyShadowObservation, useChallenger: boolean): RunEvent[] => {
  const labels = actualOpponentLabels(fixture).filter(label => label.overallPick > shadowObservation.observedThroughOverallPick && shadowObservation.forecast.horizon.some(slot => slot.overallPick === label.overallPick))
  const runs = useChallenger ? shadowObservation.forecast.challengerRunProbabilities : shadowObservation.forecast.frozenRunProbabilities
  return runs.flatMap(run => isPosition(run.position) ? [{
    position: run.position,
    probability: run.probability,
    actual: labels.filter(label => label.position === run.position).length >= shadowObservation.forecast.minimumPicks,
  }] : [])
}

interface ScoredFixture {
  report: ProspectiveFixtureReport
  positionSamples: Array<{ probabilities: Array<{ position: RunPosition, probability: number }>, actual: RunPosition }>
  frozenRunEvents: RunEvent[]
  challengerRunEvents: RunEvent[]
}

const scoreFixture = (fixture: RecordedCompletedDraftReplay, declaration: ProspectiveCampaignEvidenceDeclaration, policy: ProspectiveCampaignPolicy["runAcceptance"]): ScoredFixture => {
  const topology = assessCanonicalWindows(fixture)
  const pairs = topology.matches.filter(match => match.comparable && match.frozen && match.shadow)
  const frozenObservations = pairs.map(pair => pair.frozen!)
  const shadowObservations = pairs.map(pair => pair.shadow!)
  const positionSamples = createPositionSamples(fixture, frozenObservations)
  const frozenRunEvents = shadowObservations.flatMap(observation => createRunEvents(fixture, observation, false))
  const challengerRunEvents = shadowObservations.flatMap(observation => createRunEvents(fixture, observation, true))
  const frozenPosition = scorePositionSamples(positionSamples)
  const frozenRun = summarizeRun(frozenRunEvents)
  const challengerRun = summarizeRun(challengerRunEvents)
  const positionUnavailable = unavailable(PROSPECTIVE_RUN_SHADOW_REASON_CODES.challengerPositionUnavailable, "The bounded run-only shadow envelope stores no challenger position probabilities.")
  const runUnavailable = unavailable(PROSPECTIVE_RUN_SHADOW_REASON_CODES.runGateInsufficient, "No canonical run events were eligible for scoring.")
  return {
    positionSamples,
    frozenRunEvents,
    challengerRunEvents,
    report: {
      fixtureId: fixture.id,
      fixturePath: declaration.fixturePath,
      coverage: coverageFor(fixture),
      evaluatedObservationCount: shadowObservations.length,
      evaluatedPickCount: positionSamples.length,
      evaluatedRunWindowCount: pairs.length,
      windowCoverage: topology.coverage,
      evaluatedPositionLabelCount: positionSamples.length,
      evaluatedRunEventCount: challengerRunEvents.length,
      frozenV1: { position: frozenPosition || unavailable(PROSPECTIVE_RUN_SHADOW_REASON_CODES.positionGateInsufficient, "Frozen v1 evidence has no labeled opponent position picks."), run: frozenRun || runUnavailable },
      challenger: { position: positionUnavailable, run: challengerRun || runUnavailable },
      deltas: { position: positionUnavailable, run: frozenRun && challengerRun ? compareRunMetrics(frozenRun, challengerRun) : runUnavailable },
      gates: {
        position: frozenPosition ? frozenPositionGateFor(frozenPosition) : { ...frozenPositionGateFor(undefined), reasonCodes: topology.reasonCodes.includes(PROSPECTIVE_RUN_SHADOW_REASON_CODES.canonicalWindowIncomplete) ? [PROSPECTIVE_RUN_SHADOW_REASON_CODES.positionGateInsufficient, PROSPECTIVE_RUN_SHADOW_REASON_CODES.canonicalWindowIncomplete] : frozenPositionGateFor(undefined).reasonCodes },
        run: runGateFor(frozenRun, challengerRun, policy),
      },
    },
  }
}

const validateManifestShape = (value: unknown): string[] => {
  if (!isRecord(value)) return ["campaign manifest must be an object"]
  const errors: string[] = []
  if (value.schemaVersion !== 1) errors.push("unsupported campaign manifest schema")
  if (typeof value.campaignId !== "string" || !value.campaignId.trim()) errors.push("campaign id is missing")
  const manifestBaseline = value.baseline
  if (!isRecord(manifestBaseline) || manifestBaseline.commit !== PHASE9_BASELINE_COMMIT || manifestBaseline.parent !== PHASE9_BASELINE_PARENT || manifestBaseline.tag !== PHASE9_BASELINE_TAG || manifestBaseline.committedAt !== PHASE9_BASELINE_COMMITTED_AT) errors.push("campaign baseline provenance is invalid")
  const policy = value.policy
  if (!isRecord(policy) || policy.version !== 1) errors.push("campaign policy version is invalid")
  if (!isRecord(policy) || !isRecord(policy.baseline) || policy.baseline.commit !== PHASE9_BASELINE_COMMIT || policy.baseline.parent !== PHASE9_BASELINE_PARENT || policy.baseline.tag !== PHASE9_BASELINE_TAG || policy.baseline.committedAt !== PHASE9_BASELINE_COMMITTED_AT) errors.push("campaign policy baseline provenance is invalid")
  if (typeof value.policyFingerprint !== "string" || value.policyFingerprint !== PHASE9_POLICY_FINGERPRINT) errors.push("campaign policy fingerprint is invalid")
  if (isRecord(policy)) {
    try {
      if (createPhase9PolicyFingerprint(policy as unknown as ProspectiveCampaignPolicy) !== PHASE9_POLICY_FINGERPRINT) errors.push("campaign policy contents are not the immutable version-1 policy")
    } catch { errors.push("campaign policy contents are malformed") }
  }
  const sufficiency = isRecord(policy) ? policy.evidenceSufficiency : undefined
  const positionAcceptance = isRecord(policy) ? policy.positionAcceptance : undefined
  const runAcceptance = isRecord(policy) ? policy.runAcceptance : undefined
  const nonNegativeFinite = (candidate: unknown): candidate is number => typeof candidate === "number" && Number.isFinite(candidate) && candidate >= 0
  if (!isRecord(sufficiency) || !nonNegativeFinite(sufficiency.minimumEligibleFixtures) || !nonNegativeFinite(sufficiency.minimumDistinctDraftSlots) || !Array.isArray(sufficiency.requiredTeamCounts) || sufficiency.requiredTeamCounts.some(team => !Number.isSafeInteger(team) || team < 2) || !Array.isArray(sufficiency.requiredScoringFormats) || sufficiency.requiredScoringFormats.some(format => format !== "PPR" && format !== "STANDARD") || !nonNegativeFinite(sufficiency.minimumDistinctRosterShapes) || !Array.isArray(sufficiency.requiredRosterShapes) || sufficiency.requiredRosterShapes.some(shape => typeof shape !== "string" || !shape.trim()) || !nonNegativeFinite(sufficiency.minimumCompleteWindowsPerRequiredSubgroup)) errors.push("evidence sufficiency policy is invalid")
  if (!isRecord(positionAcceptance) || positionAcceptance.mode !== "frozen_v1_reference_only" || positionAcceptance.challengerComparison !== "not_available_in_run_only_schema") errors.push("position acceptance policy is invalid")
  if (!isRecord(runAcceptance) || runAcceptance.minimumPicks !== 3 || runAcceptance.threshold !== 0.5 || !nonNegativeFinite(runAcceptance.maximumBrierRegression) || !nonNegativeFinite(runAcceptance.maximumLogLossRegression) || !nonNegativeFinite(runAcceptance.maximumPrecisionRegression) || !nonNegativeFinite(runAcceptance.maximumRecallRegression) || !nonNegativeFinite(runAcceptance.maximumF1Regression) || !nonNegativeFinite(runAcceptance.minimumMaterialBrierImprovement) || !nonNegativeFinite(runAcceptance.minimumMaterialLogLossImprovement)) errors.push("run acceptance policy is invalid")
  const targets = value.coverageTargets
  if (!isRecord(targets) || !Array.isArray(targets.draftSlots) || !Array.isArray(targets.teamCounts) || !Array.isArray(targets.scoringFormats) || !Array.isArray(targets.rosterShapes) || targets.superflex !== "report_if_represented" || targets.draftSlots.some(slot => !Number.isSafeInteger(slot) || slot < 1) || targets.teamCounts.some(team => !Number.isSafeInteger(team) || team < 2) || targets.scoringFormats.some(format => format !== "PPR" && format !== "STANDARD") || targets.rosterShapes.some(shape => typeof shape !== "string" || !shape.trim())) errors.push("coverage targets are invalid")
  if (!Array.isArray(value.evidence)) errors.push("campaign evidence must be an array")
  else {
    const ids = new Set<string>(); const paths = new Set<string>()
    value.evidence.forEach((entry, index) => {
      if (!isRecord(entry) || typeof entry.id !== "string" || typeof entry.fixturePath !== "string" || typeof entry.fixtureId !== "string" || !SHA256.test(entry.contentSha256 as string) || entry.baselineCommit !== PHASE9_BASELINE_COMMIT || entry.baselineTag !== PHASE9_BASELINE_TAG || !isRecord(entry.declaredProvenance) || entry.declaredProvenance.platform !== "ESPN" || entry.declaredProvenance.kind !== "completed_mock" || entry.declaredProvenance.captureVersion !== 1 || !["extension_board_export", "cli_board_export"].includes(entry.declaredProvenance.captureMethod as string)) {
        errors.push(`campaign evidence ${index + 1} is invalid`); return
      }
      if (ids.has(entry.id)) errors.push("campaign evidence ids are duplicated")
      if (paths.has(entry.fixturePath)) errors.push("campaign evidence paths are duplicated")
      ids.add(entry.id); paths.add(entry.fixturePath)
    })
  }
  return errors
}

export const validateProspectiveCampaignManifest = (value: unknown): { manifest?: ProspectiveCampaignManifest, errors: string[] } => {
  const errors = validateManifestShape(value)
  return errors.length ? { errors } : { manifest: value as ProspectiveCampaignManifest, errors: [] }
}

const manifestReasonCodes = (value: unknown): ProspectiveRunShadowReasonCode[] => {
  const reasons = new Set<ProspectiveRunShadowReasonCode>([PROSPECTIVE_RUN_SHADOW_REASON_CODES.campaignInvalid])
  if (!isRecord(value) || value.policyFingerprint !== PHASE9_POLICY_FINGERPRINT) reasons.add(PROSPECTIVE_RUN_SHADOW_REASON_CODES.policyFingerprintMismatch)
  if (isRecord(value) && isRecord(value.policy)) {
    try {
      if (createPhase9PolicyFingerprint(value.policy as unknown as ProspectiveCampaignPolicy) !== PHASE9_POLICY_FINGERPRINT) reasons.add(PROSPECTIVE_RUN_SHADOW_REASON_CODES.policyTampered)
    } catch { reasons.add(PROSPECTIVE_RUN_SHADOW_REASON_CODES.policyTampered) }
  }
  if (isRecord(value) && Array.isArray(value.evidence)) {
    const ids = new Set<string>()
    const paths = new Set<string>()
    value.evidence.forEach(entry => {
      if (!isRecord(entry)) return
      if (typeof entry.id === "string" && ids.has(entry.id)) reasons.add(PROSPECTIVE_RUN_SHADOW_REASON_CODES.duplicateEvidenceId)
      if (typeof entry.fixturePath === "string" && paths.has(entry.fixturePath)) reasons.add(PROSPECTIVE_RUN_SHADOW_REASON_CODES.duplicateDeclarationPath)
      if (typeof entry.id === "string") ids.add(entry.id)
      if (typeof entry.fixturePath === "string") paths.add(entry.fixturePath)
    })
  }
  return Array.from(reasons).sort()
}

const decision = (declaration: ProspectiveCampaignEvidenceDeclaration, disposition: ProspectiveEvidenceDecision["disposition"], reasonCodes: ProspectiveRunShadowReasonCode[], fixture?: RecordedCompletedDraftReplay, contentSha256?: string): ProspectiveEvidenceDecision => {
  let details: Pick<ProspectiveEvidenceDecision, "fixtureId" | "coverage"> = {}
  if (fixture && typeof fixture.id === "string") {
    try { details = { fixtureId: fixture.id, coverage: coverageFor(fixture) } } catch { details = { fixtureId: fixture.id } }
  }
  return { id: declaration.id, fixturePath: declaration.fixturePath, ...details, ...(contentSha256 ? { contentSha256 } : {}), disposition, reasonCodes: Array.from(new Set(reasonCodes)).sort() }
}

const safePairedReasons = (fixture: RecordedCompletedDraftReplay): ProspectiveRunShadowReasonCode[] => {
  const reasons = new Set<ProspectiveRunShadowReasonCode>()
  try { validatePairedEvidence(fixture).forEach(reason => reasons.add(reason)) } catch { reasons.add(PROSPECTIVE_RUN_SHADOW_REASON_CODES.runOnlyEvidenceInvalid) }
  const canonicalErrors = safeRunOnlyValidation(fixture)
  if (canonicalErrors.length) reasons.add(PROSPECTIVE_RUN_SHADOW_REASON_CODES.runOnlyEvidenceInvalid)
  shadowProvenanceReasons(fixture).forEach(reason => reasons.add(reason))
  if (Array.isArray(fixture.runOnlyShadowEvidence?.observations)
    && fixture.runOnlyShadowEvidence.observations.some(observation => !isRecord(observation) || !FINGERPRINT.test(observation.observationFingerprint as string))) reasons.add(PROSPECTIVE_RUN_SHADOW_REASON_CODES.runOnlyEvidenceInvalid)
  try { assessCanonicalWindows(fixture).reasonCodes.forEach(reason => reasons.add(reason)) } catch { reasons.add(PROSPECTIVE_RUN_SHADOW_REASON_CODES.canonicalWindowIncomplete) }
  return Array.from(reasons).sort()
}

/** Validates paired v1/run-only evidence and its complete canonical topology. */
export const validateProspectiveRunShadowPair = (fixture: RecordedCompletedDraftReplay): ProspectiveRunShadowReasonCode[] => safePairedReasons(fixture)

const windowCoverageSum = (reports: ProspectiveFixtureReport[]): WindowCoverage => reports.reduce((total, report) => ({
  expected: total.expected + report.windowCoverage.expected,
  captured: total.captured + report.windowCoverage.captured,
  comparable: total.comparable + report.windowCoverage.comparable,
  scored: total.scored + report.windowCoverage.scored,
  missing: total.missing + report.windowCoverage.missing,
  extra: total.extra + report.windowCoverage.extra,
}), { expected: 0, captured: 0, comparable: 0, scored: 0, missing: 0, extra: 0 })

const evaluateSufficiency = (manifest: ProspectiveCampaignManifest, reports: ProspectiveFixtureReport[]): GateResult => {
  const policy = manifest.policy.evidenceSufficiency
  const slots = sortedUniqueNumbers(reports.map(report => report.coverage.draftSlot))
  const teams = sortedUniqueNumbers(reports.map(report => report.coverage.teamCount))
  const formats = sortedUniqueStrings(reports.map(report => report.coverage.scoringFormat))
  const shapes = sortedUniqueStrings(reports.map(report => report.coverage.rosterShape))
  const failures: string[] = []
  if (reports.length < policy.minimumEligibleFixtures) failures.push("eligible fixture count is below policy")
  if (slots.length < policy.minimumDistinctDraftSlots) failures.push("distinct draft-slot coverage is below policy")
  policy.requiredTeamCounts.filter(team => !teams.includes(team)).forEach(team => failures.push(`required team-count coverage is missing: ${team}`))
  policy.requiredScoringFormats.filter(format => !formats.includes(format)).forEach(format => failures.push(`required scoring-format coverage is missing: ${format}`))
  policy.requiredRosterShapes.filter(shape => !shapes.includes(shape)).forEach(shape => failures.push(`required roster-shape coverage is missing: ${shape}`))
  if (shapes.length < policy.minimumDistinctRosterShapes) failures.push("distinct roster-shape coverage is below policy")
  ;(["scoringFormat", "teamCount", "rosterShape"] as const).forEach(dimension => {
    const required = dimension === "scoringFormat" ? policy.requiredScoringFormats.map(String) : dimension === "teamCount" ? policy.requiredTeamCounts.map(String) : policy.requiredRosterShapes
    required.forEach(key => {
      const windows = reports.filter(report => (dimension === "scoringFormat" ? report.coverage.scoringFormat : dimension === "teamCount" ? String(report.coverage.teamCount) : report.coverage.rosterShape) === key).reduce((sum, report) => sum + report.windowCoverage.scored, 0)
      if (windows < policy.minimumCompleteWindowsPerRequiredSubgroup) failures.push(`required ${dimension} subgroup ${key} has insufficient complete windows`)
    })
  })
  return { status: failures.length ? "insufficient" : "pass", reasonCodes: failures.length ? [PROSPECTIVE_RUN_SHADOW_REASON_CODES.coverageInsufficient] : [], failures }
}

const aggregateReports = (scored: ScoredFixture[]): ProspectiveRunShadowReport["aggregate"] | undefined => {
  if (!scored.length) return undefined
  const position = scorePositionSamples(scored.flatMap(item => item.positionSamples))
  const frozenRun = summarizeRun(scored.flatMap(item => item.frozenRunEvents))
  const challengerRun = summarizeRun(scored.flatMap(item => item.challengerRunEvents))
  if (!position || !frozenRun || !challengerRun) return undefined
  return {
    evaluatedObservationCount: scored.reduce((sum, item) => sum + item.report.evaluatedObservationCount, 0),
    evaluatedPickCount: position.evaluatedPicks,
    evaluatedRunWindowCount: scored.reduce((sum, item) => sum + item.report.evaluatedRunWindowCount, 0),
    windowCoverage: windowCoverageSum(scored.map(item => item.report)),
    evaluatedPositionLabelCount: scored.reduce((sum, item) => sum + item.report.evaluatedPositionLabelCount, 0),
    evaluatedRunEventCount: scored.reduce((sum, item) => sum + item.report.evaluatedRunEventCount, 0),
    frozenV1: { position, run: frozenRun },
    challenger: { position: unavailable(PROSPECTIVE_RUN_SHADOW_REASON_CODES.challengerPositionUnavailable, "The bounded run-only shadow envelope stores no challenger position probabilities."), run: challengerRun },
    deltas: { position: unavailable(PROSPECTIVE_RUN_SHADOW_REASON_CODES.challengerPositionUnavailable, "The bounded run-only shadow envelope stores no challenger position probabilities."), run: compareRunMetrics(frozenRun, challengerRun) },
  }
}

const subgroupGate = (aggregate: ProspectiveRunShadowReport["aggregate"] | undefined, fixtureCount: number, windows: number, policy: ProspectiveCampaignPolicy): GateResult => {
  if (!aggregate || fixtureCount === 0 || windows < policy.evidenceSufficiency.minimumCompleteWindowsPerRequiredSubgroup) return { status: "insufficient", reasonCodes: [PROSPECTIVE_RUN_SHADOW_REASON_CODES.subgroupInsufficient], failures: ["required subgroup lacks enough complete paired windows"], mode: "active" }
  const gate = runGateFor(aggregate.frozenV1.run, aggregate.challenger.run, policy.runAcceptance, false)
  return gate.status === "fail" ? { ...gate, reasonCodes: [PROSPECTIVE_RUN_SHADOW_REASON_CODES.subgroupRegression], failures: gate.failures } : gate
}

const stratifiedFor = (policy: ProspectiveCampaignPolicy, reports: ProspectiveFixtureReport[], scored: ScoredFixture[]): ProspectiveRunShadowReport["stratified"] => {
  const dimensions = ["scoringFormat", "teamCount", "rosterShape"] as const
  const keysFor = (dimension: typeof dimensions[number]): string[] => {
    const required = dimension === "scoringFormat" ? policy.evidenceSufficiency.requiredScoringFormats.map(String) : dimension === "teamCount" ? policy.evidenceSufficiency.requiredTeamCounts.map(String) : policy.evidenceSufficiency.requiredRosterShapes
    const observed = reports.map(report => dimension === "scoringFormat" ? report.coverage.scoringFormat : dimension === "teamCount" ? String(report.coverage.teamCount) : report.coverage.rosterShape)
    return sortedUniqueStrings([...required, ...observed])
  }
  const forDimension = (dimension: typeof dimensions[number]): ProspectiveSubgroupReport[] => keysFor(dimension).map(key => {
    const matches = reports.filter(report => (dimension === "scoringFormat" ? report.coverage.scoringFormat : dimension === "teamCount" ? String(report.coverage.teamCount) : report.coverage.rosterShape) === key)
    const matchingScored = scored.filter(item => matches.includes(item.report))
    const aggregate = aggregateReports(matchingScored)
    const windowCoverage = windowCoverageSum(matches)
    const frozenPosition = aggregate?.frozenV1.position || unavailable(PROSPECTIVE_RUN_SHADOW_REASON_CODES.positionGateInsufficient, "frozen v1 subgroup position labels are unavailable")
    const frozenRun = aggregate?.frozenV1.run || unavailable(PROSPECTIVE_RUN_SHADOW_REASON_CODES.runGateInsufficient, "frozen v1 subgroup run metrics are unavailable")
    const challengerRun = aggregate?.challenger.run || unavailable(PROSPECTIVE_RUN_SHADOW_REASON_CODES.runGateInsufficient, "challenger subgroup run metrics are unavailable")
    const required = (dimension === "scoringFormat" ? policy.evidenceSufficiency.requiredScoringFormats.map(String) : dimension === "teamCount" ? policy.evidenceSufficiency.requiredTeamCounts.map(String) : policy.evidenceSufficiency.requiredRosterShapes).includes(key)
    return {
      dimension,
      key,
      required,
      fixtureCount: matches.length,
      windowCoverage,
      evaluatedPositionLabelCount: matches.reduce((sum, report) => sum + report.evaluatedPositionLabelCount, 0),
      evaluatedRunEventCount: matches.reduce((sum, report) => sum + report.evaluatedRunEventCount, 0),
      frozenV1: { position: frozenPosition, run: frozenRun },
      challenger: { position: unavailable(PROSPECTIVE_RUN_SHADOW_REASON_CODES.challengerPositionUnavailable, "run-only challenger has no position vector"), run: challengerRun },
      deltas: { position: unavailable(PROSPECTIVE_RUN_SHADOW_REASON_CODES.challengerPositionUnavailable, "run-only challenger has no position vector"), run: aggregate?.deltas.run || unavailable(PROSPECTIVE_RUN_SHADOW_REASON_CODES.runGateInsufficient, "subgroup run deltas are unavailable") },
      gate: required ? subgroupGate(aggregate, matches.length, windowCoverage.scored, policy) : { status: "pass", reasonCodes: [], failures: [], mode: "active" },
    }
  })
  const scoringFormat = forDimension("scoringFormat")
  const teamCount = forDimension("teamCount")
  const rosterShape = forDimension("rosterShape")
  const requiredGroups = [...scoringFormat, ...teamCount, ...rosterShape].filter(group => group.required)
  const overallStatus = requiredGroups.some(group => group.gate.status === "fail") ? "fail" : requiredGroups.some(group => group.gate.status === "insufficient") ? "insufficient" : "pass"
  const overallReasons = overallStatus === "fail" ? [PROSPECTIVE_RUN_SHADOW_REASON_CODES.subgroupRegression] : overallStatus === "insufficient" ? [PROSPECTIVE_RUN_SHADOW_REASON_CODES.subgroupInsufficient] : []
  return { scoringFormat, teamCount, rosterShape, overall: { status: overallStatus, reasonCodes: overallReasons, failures: requiredGroups.flatMap(group => group.gate.failures), mode: "active" } }
}

const nextCaptureNeedsFor = (manifest: ProspectiveCampaignManifest, reports: ProspectiveFixtureReport[], sufficiency: GateResult, runGate: GateResult, stratified: ProspectiveRunShadowReport["stratified"]): string[] => {
  const policy = manifest.policy.evidenceSufficiency
  const slots = new Set(reports.map(report => report.coverage.draftSlot))
  const teams = new Set(reports.map(report => report.coverage.teamCount))
  const formats = new Set(reports.map(report => report.coverage.scoringFormat))
  const shapes = new Set(reports.map(report => report.coverage.rosterShape))
  const needs: string[] = []
  if (reports.length < policy.minimumEligibleFixtures) needs.push(`capture ${policy.minimumEligibleFixtures - reports.length} more eligible completed fixtures`)
  if (slots.size < policy.minimumDistinctDraftSlots) needs.push(`capture ${policy.minimumDistinctDraftSlots - slots.size} more distinct draft slots`)
  policy.requiredTeamCounts.filter(team => !teams.has(team)).forEach(team => needs.push(`capture a ${team}-team fixture`))
  policy.requiredScoringFormats.filter(format => !formats.has(format)).forEach(format => needs.push(`capture a ${format} fixture`))
  policy.requiredRosterShapes.filter(shape => !shapes.has(shape)).forEach(shape => needs.push(`capture a complete ${shape} roster-shape fixture`))
  if (stratified.overall.status !== "pass") needs.push("capture complete paired windows for every required scoring-format, team-count, and roster-shape subgroup")
  if (runGate.status !== "pass") needs.push("capture enough paired future labels for the predeclared aggregate run gate")
  if (sufficiency.status !== "pass") needs.push("keep all admitted evidence hash-bound to this immutable campaign and baseline")
  return sortedUniqueStrings(needs)
}

const emptyStratified = (): ProspectiveRunShadowReport["stratified"] => ({
  scoringFormat: [], teamCount: [], rosterShape: [],
  overall: { status: "insufficient", reasonCodes: [PROSPECTIVE_RUN_SHADOW_REASON_CODES.subgroupInsufficient], failures: ["no required subgroup has eligible evidence"], mode: "active" },
})

export const runProspectiveRunShadowCampaign = (manifest: unknown, inputs: unknown): ProspectiveRunShadowReport => {
  const manifestValidation = validateProspectiveCampaignManifest(manifest)
  const manifestRecord = isRecord(manifest) ? manifest : undefined
  const policy = manifestValidation.manifest?.policy || CANONICAL_PHASE9_POLICY
  const base = {
    schemaVersion: 1 as const,
    reportKind: "phase9_prospective_run_shadow" as const,
    campaignId: typeof manifestRecord?.campaignId === "string" ? manifestRecord.campaignId : "invalid",
    campaignPolicyVersion: 1 as const,
    policy,
    policyFingerprint: manifestValidation.manifest?.policyFingerprint || PHASE9_POLICY_FINGERPRINT,
    baseline: manifestValidation.manifest?.baseline || baseline,
    evidence: [] as ProspectiveEvidenceDecision[],
    eligibleFixtureCount: 0,
    excludedEvidenceCount: 0,
    invalidEvidenceCount: 0,
    coverage: { eligibleFixtureCount: 0, distinctDraftSlots: [] as number[], teamCounts: [] as number[], scoringFormats: [] as Array<"PPR" | "STANDARD">, rosterShapes: [] as string[], superflex: "absent" as const, missing: [] as string[] },
    stratified: emptyStratified(),
    fixtures: [] as ProspectiveFixtureReport[],
    gates: {
      evidenceSufficiency: { status: "insufficient" as const, reasonCodes: [PROSPECTIVE_RUN_SHADOW_REASON_CODES.coverageInsufficient], failures: ["campaign manifest is invalid"] },
      position: { status: "insufficient" as const, reasonCodes: [PROSPECTIVE_RUN_SHADOW_REASON_CODES.positionGateInsufficient], failures: ["campaign manifest is invalid"], mode: "reference_only" as const },
      run: { status: "insufficient" as const, reasonCodes: [PROSPECTIVE_RUN_SHADOW_REASON_CODES.runGateInsufficient], failures: ["campaign manifest is invalid"], mode: "active" as const },
    },
    promotion: { promoted: false as const, reasonCode: PROSPECTIVE_RUN_SHADOW_REASON_CODES.observationOnly, reason: "Phase 9A is evidence collection and reporting only; no model promotion is permitted." },
    nextCaptureNeeds: ["repair the immutable versioned campaign manifest before admitting evidence"],
  }
  if (manifestValidation.errors.length) return { ...base, status: "evidence_blocked", evidence: [{ fixturePath: "", disposition: "invalid", reasonCodes: manifestReasonCodes(manifest) }], invalidEvidenceCount: 1 }

  const declarations = [...manifestValidation.manifest!.evidence].sort((left, right) => left.id.localeCompare(right.id) || left.fixturePath.localeCompare(right.fixturePath))
  const rawInputs = Array.isArray(inputs) ? inputs : []
  const validInputs = rawInputs.filter(isRecord).filter(input => typeof input.path === "string" && typeof input.rawContent === "string") as unknown as ProspectiveFixtureInput[]
  const malformedInputCount = rawInputs.filter(input => !isRecord(input) || typeof input.path !== "string" || typeof input.rawContent !== "string").length
  const pathCounts = new Map<string, number>()
  validInputs.forEach(input => pathCounts.set(input.path, (pathCounts.get(input.path) || 0) + 1))
  const duplicatePaths = new Set(Array.from(pathCounts.entries()).filter(([, count]) => count > 1).map(([path]) => path))
  const inputByPath = new Map(validInputs.map(input => [input.path, input]))
  const declaredPaths = new Set(declarations.map(declaration => declaration.fixturePath))
  const evidence: ProspectiveEvidenceDecision[] = []
  if (malformedInputCount) evidence.push({ fixturePath: "", disposition: "invalid", reasonCodes: [PROSPECTIVE_RUN_SHADOW_REASON_CODES.malformedInput] })
  validInputs.filter(input => !declaredPaths.has(input.path)).sort((left, right) => left.path.localeCompare(right.path)).forEach(input => evidence.push({ fixturePath: input.path, disposition: "excluded", reasonCodes: duplicatePaths.has(input.path) ? [PROSPECTIVE_RUN_SHADOW_REASON_CODES.duplicateInputPath, PROSPECTIVE_RUN_SHADOW_REASON_CODES.unlistedEvidence] : [PROSPECTIVE_RUN_SHADOW_REASON_CODES.unlistedEvidence] }))
  const seenHashes = new Map<string, string>()
  const scored: ScoredFixture[] = []
  declarations.forEach(declaration => {
    const reasons: ProspectiveRunShadowReasonCode[] = []
    const input = inputByPath.get(declaration.fixturePath)
    if (!input) { evidence.push(decision(declaration, "excluded", [PROSPECTIVE_RUN_SHADOW_REASON_CODES.fixtureNotFound])); return }
    if (duplicatePaths.has(input.path)) reasons.push(PROSPECTIVE_RUN_SHADOW_REASON_CODES.duplicateInputPath)
    const actualHash = createProspectiveFixtureContentSha256(input.rawContent)
    if (actualHash !== declaration.contentSha256) reasons.push(PROSPECTIVE_RUN_SHADOW_REASON_CODES.fixtureHashMismatch)
    const duplicateOf = seenHashes.get(actualHash)
    if (duplicateOf) reasons.push(PROSPECTIVE_RUN_SHADOW_REASON_CODES.duplicateFixture)
    else seenHashes.set(actualHash, declaration.id)
    if (reasons.length) { evidence.push(decision(declaration, "invalid", reasons, undefined, actualHash)); return }
    let parsed: unknown
    try { parsed = JSON.parse(input.rawContent) } catch { evidence.push(decision(declaration, "invalid", [PROSPECTIVE_RUN_SHADOW_REASON_CODES.malformedJson], undefined, actualHash)); return }
    if (!isRecord(parsed)) { evidence.push(decision(declaration, "invalid", [PROSPECTIVE_RUN_SHADOW_REASON_CODES.fixtureMalformed], undefined, actualHash)); return }
    const fixture = parsed as unknown as RecordedCompletedDraftReplay
    if (fixture.id !== declaration.fixtureId) reasons.push(PROSPECTIVE_RUN_SHADOW_REASON_CODES.fixtureIdMismatch)
    if (fixture.provenance !== "recorded") reasons.push(PROSPECTIVE_RUN_SHADOW_REASON_CODES.fixtureNotRecorded)
    if (!sourceIsComplete(fixture)) reasons.push(PROSPECTIVE_RUN_SHADOW_REASON_CODES.fixtureIncomplete)
    const source = fixture.source
    if (!source || source.platform !== declaration.declaredProvenance.platform) reasons.push(PROSPECTIVE_RUN_SHADOW_REASON_CODES.sourceProvenanceMismatch)
    if (!source || !Number.isFinite(source.capturedAt) || source.capturedAt <= Date.parse(PHASE9_BASELINE_COMMITTED_AT)) reasons.push(PROSPECTIVE_RUN_SHADOW_REASON_CODES.retrospectiveEvidence)
    if (safeFixtureValidation(fixture).length) reasons.push(PROSPECTIVE_RUN_SHADOW_REASON_CODES.fixtureMalformed)
    if (!fixture.forecastEvidence || !fixture.runOnlyShadowEvidence) reasons.push(PROSPECTIVE_RUN_SHADOW_REASON_CODES.missingPairedEvidence)
    if (safeFrozenValidation(fixture).length) reasons.push(PROSPECTIVE_RUN_SHADOW_REASON_CODES.malformedProbability)
    if (safeRunOnlyValidation(fixture).length) reasons.push(PROSPECTIVE_RUN_SHADOW_REASON_CODES.runOnlyEvidenceInvalid)
    reasons.push(...safePairedReasons(fixture))
    const uniqueReasons = Array.from(new Set(reasons)).sort()
    if (uniqueReasons.length) {
      evidence.push(decision(declaration, uniqueReasons.includes(PROSPECTIVE_RUN_SHADOW_REASON_CODES.retrospectiveEvidence) ? "excluded" : "invalid", uniqueReasons, fixture, actualHash)); return
    }
    scored.push(scoreFixture(fixture, declaration, policy.runAcceptance))
    evidence.push(decision(declaration, "eligible", [], fixture, actualHash))
  })
  const fixtures = scored.map(item => item.report).sort((left, right) => left.fixtureId.localeCompare(right.fixtureId))
  const sufficiency = evaluateSufficiency(manifestValidation.manifest!, fixtures)
  const aggregate = aggregateReports(scored)
  const positionGate = aggregate ? frozenPositionGateFor(aggregate.frozenV1.position) : { status: "insufficient" as const, reasonCodes: [PROSPECTIVE_RUN_SHADOW_REASON_CODES.positionGateInsufficient], failures: ["no eligible fixture has frozen v1 position reference labels"], mode: "reference_only" as const }
  const runGate = aggregate ? runGateFor(aggregate.frozenV1.run, aggregate.challenger.run, policy.runAcceptance) : { status: "insufficient" as const, reasonCodes: [PROSPECTIVE_RUN_SHADOW_REASON_CODES.runGateInsufficient], failures: ["no eligible fixture has aggregate run metrics"], mode: "active" as const }
  const stratified = stratifiedFor(policy, fixtures, scored)
  const coverage = {
    eligibleFixtureCount: fixtures.length,
    distinctDraftSlots: sortedUniqueNumbers(fixtures.map(fixture => fixture.coverage.draftSlot)),
    teamCounts: sortedUniqueNumbers(fixtures.map(fixture => fixture.coverage.teamCount)),
    scoringFormats: sortedUniqueStrings(fixtures.map(fixture => fixture.coverage.scoringFormat)) as Array<"PPR" | "STANDARD">,
    rosterShapes: sortedUniqueStrings(fixtures.map(fixture => fixture.coverage.rosterShape)),
    superflex: fixtures.some(fixture => fixture.coverage.superflex) ? "present" as const : "absent" as const,
    missing: sufficiency.failures,
  }
  const status = fixtures.length > 0 && sufficiency.status === "pass" && positionGate.status === "pass" && runGate.status === "pass" && stratified.overall.status === "pass" ? "evidence_available" as const : "evidence_blocked" as const
  const finalEvidence = evidence.sort((left, right) => left.fixturePath.localeCompare(right.fixturePath)
    || (left.id || "").localeCompare(right.id || "")
    || left.disposition.localeCompare(right.disposition))
  return {
    ...base,
    status,
    evidence: finalEvidence,
    eligibleFixtureCount: fixtures.length,
    excludedEvidenceCount: finalEvidence.filter(item => item.disposition === "excluded").length,
    invalidEvidenceCount: finalEvidence.filter(item => item.disposition === "invalid").length,
    coverage,
    aggregate,
    stratified,
    fixtures,
    gates: {
      evidenceSufficiency: fixtures.length ? sufficiency : { ...sufficiency, reasonCodes: [PROSPECTIVE_RUN_SHADOW_REASON_CODES.noEligibleFixtures, ...sufficiency.reasonCodes] },
      position: fixtures.length ? positionGate : { ...positionGate, reasonCodes: [PROSPECTIVE_RUN_SHADOW_REASON_CODES.noEligibleFixtures, ...positionGate.reasonCodes] },
      run: fixtures.length ? runGate : { ...runGate, reasonCodes: [PROSPECTIVE_RUN_SHADOW_REASON_CODES.noEligibleFixtures, ...runGate.reasonCodes] },
    },
    nextCaptureNeeds: nextCaptureNeedsFor(manifestValidation.manifest!, fixtures, sufficiency, runGate, stratified),
  }
}
