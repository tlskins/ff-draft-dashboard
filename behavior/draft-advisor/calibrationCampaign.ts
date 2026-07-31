import { createHash } from "node:crypto"

import {
  PHASE_4_CALIBRATION_THRESHOLDS,
  auditPhase4Calibration,
  runCompletedDraftCalibrationMatrix,
} from "./calibrationMatrix"
import type { RecordedCompletedDraftReplay } from "./completedDraftReplay"
import { validateCompletedDraftReplay } from "./replayFixtures"
import {
  scoreRecordedOpponentForecastEvidence,
} from "./replayMetrics"
import type {
  OpponentForecastMetrics,
  RecordedOpponentEvidenceResult,
} from "./replayMetrics"

/** This is an evidence schema, not an assertion that ESPN authenticated it. */
export const CALIBRATION_CAMPAIGN_VERSION = 1 as const
export const ESPN_REPLAY_CAPTURE_VERSION = 1 as const

export interface CampaignEvidenceDeclaration {
  id: string
  fixturePath: string
  fixtureFingerprint: string
  declaredProvenance: {
    platform: "ESPN"
    kind: "completed_mock"
    captureMethod: "extension_board_export" | "cli_board_export"
    captureVersion: typeof ESPN_REPLAY_CAPTURE_VERSION
  }
}

export interface CalibrationCampaignManifest {
  campaignVersion: typeof CALIBRATION_CAMPAIGN_VERSION
  id: string
  coverageTargets: {
    draftSlots: number[]
    teamSizes: number[]
    scoringFormats: Array<"PPR" | "STANDARD">
  }
  evidence: CampaignEvidenceDeclaration[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value)

const isRelativeFixturePath = (value: unknown): value is string =>
  typeof value === "string"
  && value.length > 0
  && value.length <= 240
  && !value.startsWith("/")
  && !value.startsWith("\\")
  && !value.split(/[\\/]+/).includes("..")

/** Validate JSON before it is allowed to become evidence. */
export const validateCalibrationCampaignManifest = (
  value: unknown,
): { manifest?: CalibrationCampaignManifest; errors: string[] } => {
  const errors: string[] = []
  if (!isRecord(value)) return { errors: ["campaign manifest must be an object"] }
  if (value.campaignVersion !== CALIBRATION_CAMPAIGN_VERSION) {
    errors.push("unsupported campaign manifest schema")
  }
  if (typeof value.id !== "string" || !value.id.trim() || value.id.length > 120) {
    errors.push("campaign id is missing")
  }
  const coverageTargets = value.coverageTargets
  if (!isRecord(coverageTargets)
    || !Array.isArray(coverageTargets.draftSlots)
    || !Array.isArray(coverageTargets.teamSizes)
    || !Array.isArray(coverageTargets.scoringFormats)
    || coverageTargets.draftSlots.length === 0 || coverageTargets.draftSlots.length > 32
    || coverageTargets.teamSizes.length === 0 || coverageTargets.teamSizes.length > 32
    || coverageTargets.scoringFormats.length === 0 || coverageTargets.scoringFormats.length > 2
    || coverageTargets.draftSlots.some(slot =>
      !Number.isInteger(slot) || slot < 1 || slot > 32)
    || coverageTargets.teamSizes.some(size =>
      !Number.isInteger(size) || size < 2 || size > 32)
    || coverageTargets.scoringFormats.some(format =>
      format !== "PPR" && format !== "STANDARD")) {
    errors.push("campaign coverage targets are invalid")
  }
  if (!Array.isArray(value.evidence) || value.evidence.length > 32) {
    errors.push("campaign evidence must be an array")
  } else {
    value.evidence.forEach((entry, index) => {
      if (!isRecord(entry)
        || typeof entry.id !== "string" || !entry.id.trim() || entry.id.length > 120
        || !isRelativeFixturePath(entry.fixturePath)
        || typeof entry.fixtureFingerprint !== "string"
        || !/^[a-f0-9]{64}$/.test(entry.fixtureFingerprint)
        || !isRecord(entry.declaredProvenance)
        || entry.declaredProvenance.platform !== "ESPN"
        || entry.declaredProvenance.kind !== "completed_mock"
        || !["extension_board_export", "cli_board_export"]
          .includes(entry.declaredProvenance.captureMethod as string)
        || entry.declaredProvenance.captureVersion !== ESPN_REPLAY_CAPTURE_VERSION) {
        errors.push(`campaign evidence ${index + 1} is invalid`)
      }
    })
  }
  return errors.length > 0
    ? { errors }
    : { manifest: value as unknown as CalibrationCampaignManifest, errors }
}

export interface CampaignEvidenceResult {
  evidenceId: string
  fixturePath: string
  fixtureId?: string
  fixtureFingerprint?: string
  captureFingerprint?: string
  qualifying: boolean
  reasons: string[]
}

export interface CalibrationCampaignReport {
  schemaVersion: 1
  campaignId: string
  /** Stable evidence identity. Runtime measurements deliberately live below. */
  canonical: {
    fingerprint: string
    qualifyingMockCount: number
    targetMockCount: number
    qualifyingDraftSlots: number[]
    targetDraftSlotCount: number
    teamSizes: number[]
    scoringFormats: Array<"PPR" | "STANDARD">
    evidence: CampaignEvidenceResult[]
    quality: {
      legalRate: number
      minimumStarterCompleteness: number
      positionalRankViolations: number
      minimumVsBestStarterRatio: number
      minimumVsBestBenchRatio: number
    }
    opponentRunPrediction:
      | {
          available: true
          labeledFixtureCount: number
          labeledWindowCount: number
          labeledPickCount: number
          metrics: OpponentForecastMetrics
        }
      | {
          available: false
          reason: string
        }
    remainingGaps: string[]
  }
  /** Measured locally for this invocation; intentionally excluded from fingerprint. */
  runtimeTelemetry: {
    maximumDecisionLatencyP95Ms: number
    decisionLatencyTargetMs: number
    passesDecisionLatencyTarget: boolean
    ready: boolean
    unmet: string[]
  }
}

const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map(key =>
      `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`
  }
  return JSON.stringify(value)
}

/** A deterministic content identifier for de-duplication, not source authenticity. */
export const createReplayFixtureFingerprint = (
  fixture: RecordedCompletedDraftReplay,
): string => createHash("sha256")
  .update(stableJson(fixture))
  .digest("hex")

/**
 * Identifies a captured board independently of its fixture id or regenerated
 * ranking/projection values. It is a dedupe key, not authentication.
 */
export const createReplayCaptureFingerprint = (
  fixture: RecordedCompletedDraftReplay,
): string => createHash("sha256")
  .update(stableJson({
    platform: fixture.source?.platform,
    totalPicks: fixture.source?.totalPicks,
    settings: fixture.settings,
    targetRosterIndex: fixture.targetRosterIndex,
    actualPicks: fixture.actualPicks.map(pick => ({
      overallPick: pick.overallPick,
      rosterIndex: pick.rosterIndex,
      playerId: pick.playerId,
      advisorEligible: pick.advisorEligible ?? pick.playerId !== null,
    })),
  }))
  .digest("hex")

const sourceErrors = (fixture: RecordedCompletedDraftReplay): string[] => {
  const errors: string[] = []
  if (fixture.fixtureVersion !== 1) errors.push("unsupported fixture schema")
  if (fixture.provenance !== "recorded") {
    errors.push("fixture is not declared recorded")
  }
  const source = fixture.source
  if (!source) return [...errors, "missing ESPN capture provenance"]
  if (source.platform !== "ESPN") errors.push("capture platform is not ESPN")
  if (!source.title.trim()) errors.push("capture title is missing")
  if (!Number.isFinite(source.capturedAt) || source.capturedAt <= 0) {
    errors.push("capture timestamp is invalid")
  }
  if (source.totalPicks !== fixture.actualPicks.length) {
    errors.push("capture total pick count does not match fixture")
  }
  if (source.numRounds * fixture.settings.numTeams !== source.totalPicks) {
    errors.push("capture rounds and league size do not match total picks")
  }
  if (source.platformRosterSize !== source.numRounds) {
    errors.push("capture roster size does not match completed rounds")
  }
  if (!Array.isArray(source.excludedPositions)) {
    errors.push("capture excluded positions are missing")
  }
  if (fixture.actualPicks.some(pick =>
    pick.advisorEligible !== false && (!pick.playerId || !pick.position))) {
    errors.push("fixture is not fully deterministic-replay eligible")
  }
  return errors
}

const replayShapeErrors = (value: unknown): string[] => {
  if (!isRecord(value)) return ["fixture is missing or malformed"]
  const fixture = value as Record<string, unknown>
  const settings = fixture.settings
  const replacementPoints = fixture.replacementPoints
  const source = fixture.source
  const numericSettingKeys = [
    "numTeams",
    "numStartingQbs",
    "numStartingRbs",
    "numStartingWrs",
    "numStartingTes",
    "numFlex",
    "numBenchPlayers",
  ]
  if (typeof fixture.id !== "string"
    || typeof fixture.provenance !== "string"
    || typeof fixture.targetRosterIndex !== "number"
    || !Number.isInteger(fixture.targetRosterIndex)
    || fixture.targetRosterIndex < 0
    || !isRecord(settings)
    || typeof settings.ppr !== "boolean"
    || numericSettingKeys.some(key => !Number.isFinite(settings[key]))
    || !isRecord(replacementPoints)
    || ["QB", "RB", "WR", "TE"].some(key =>
      !Number.isFinite(replacementPoints[key]))
    || !Array.isArray(fixture.players)
    || !Array.isArray(fixture.actualPicks)) {
    return ["fixture is missing or malformed"]
  }
  if (source !== undefined && (!isRecord(source)
    || typeof source.platform !== "string"
    || typeof source.title !== "string"
    || !Number.isFinite(source.capturedAt)
    || !Number.isFinite(source.totalPicks)
    || !Number.isFinite(source.numRounds)
    || !Number.isFinite(source.platformRosterSize)
    || !Array.isArray(source.excludedPositions))) {
    return ["fixture is missing or malformed"]
  }
  if (fixture.players.some(player => !isRecord(player)
    || typeof player.id !== "string"
    || typeof player.name !== "string"
    || typeof player.position !== "string"
    || !["QB", "RB", "WR", "TE"].includes(player.position)
    || typeof player.team !== "string"
    || ["adp", "positionRank", "userTier", "projectedFloor", "projectedMedian", "projectedCeiling"]
      .some(key => !Number.isFinite(player[key])))) {
    return ["fixture is missing or malformed"]
  }
  if (fixture.actualPicks.some(pick => !isRecord(pick)
    || !Number.isFinite(pick.overallPick)
    || !Number.isFinite(pick.rosterIndex)
    || (pick.playerId !== null && typeof pick.playerId !== "string")
    || (pick.position !== undefined && typeof pick.position !== "string")
    || (pick.advisorEligible !== undefined && typeof pick.advisorEligible !== "boolean"))) {
    return ["fixture is missing or malformed"]
  }
  return []
}

const scoringFormat = (fixture: RecordedCompletedDraftReplay): "PPR" | "STANDARD" =>
  fixture.settings.ppr ? "PPR" : "STANDARD"

const uniqueSorted = <Value extends string | number>(values: Value[]): Value[] =>
  Array.from(new Set(values)).sort((left, right) =>
    typeof left === "number" && typeof right === "number"
      ? left - right
      : String(left).localeCompare(String(right)))

const aggregateOpponentMetrics = (
  results: Array<{
    metrics: OpponentForecastMetrics
    labeledWindowCount: number
  }>,
): OpponentForecastMetrics => {
  const metrics = results.map(result => result.metrics)
  const totalPicks = metrics.reduce((sum, value) => sum + value.evaluatedPicks, 0)
  const totalWindows = results.reduce((sum, result) =>
    sum + result.labeledWindowCount, 0)
  const pickWeighted = (
    key: "positionBrierScore" | "topPositionAccuracy" | "playerTopThreeAccuracy",
  ) => totalPicks === 0 ? 0 : metrics.reduce((sum, value) =>
    sum + value[key] * value.evaluatedPicks, 0) / totalPicks
  const windowMean = (
    key: "runPrecision" | "runRecall" | "tierCrossingBrierScore",
  ) => totalWindows === 0 ? 0 : results.reduce((sum, result) =>
    sum + result.metrics[key] * result.labeledWindowCount, 0) / totalWindows
  return {
    evaluatedPicks: totalPicks,
    positionBrierScore: pickWeighted("positionBrierScore"),
    topPositionAccuracy: pickWeighted("topPositionAccuracy"),
    playerTopThreeAccuracy: pickWeighted("playerTopThreeAccuracy"),
    runPrecision: windowMean("runPrecision"),
    runRecall: windowMean("runRecall"),
    tierCrossingBrierScore: windowMean("tierCrossingBrierScore"),
  }
}

export const runCalibrationCampaign = (
  manifest: CalibrationCampaignManifest,
  fixturesByPath: Record<string, unknown>,
): CalibrationCampaignReport => {
  const manifestValidation = validateCalibrationCampaignManifest(manifest)
  if (manifestValidation.errors.length > 0) {
    throw new Error(`Invalid calibration campaign: ${manifestValidation.errors.join("; ")}`)
  }
  const evidence: CampaignEvidenceResult[] = []
  const qualifying: RecordedCompletedDraftReplay[] = []
  const captureFingerprints = new Map<string, string>()
  const evidenceIds = new Set<string>()

  manifest.evidence.forEach(declaration => {
    const reasons: string[] = []
    if (evidenceIds.has(declaration.id)) reasons.push("duplicate evidence id")
    evidenceIds.add(declaration.id)
    if (declaration.declaredProvenance.platform !== "ESPN"
      || declaration.declaredProvenance.kind !== "completed_mock") {
      reasons.push("manifest provenance is not an ESPN completed mock")
    }
    if (![
      "extension_board_export",
      "cli_board_export",
    ].includes(declaration.declaredProvenance.captureMethod)) {
      reasons.push("unsupported capture method")
    }
    if (declaration.declaredProvenance.captureVersion !== ESPN_REPLAY_CAPTURE_VERSION) {
      reasons.push("unsupported capture schema")
    }
    const candidate = fixturesByPath[declaration.fixturePath]
    const shapeErrors = replayShapeErrors(candidate)
    if (shapeErrors.length > 0) {
      reasons.push("fixture is missing or malformed")
    } else {
      const fixture = candidate as RecordedCompletedDraftReplay
      reasons.push(...validateCompletedDraftReplay(fixture), ...sourceErrors(fixture))
      const fingerprint = createReplayFixtureFingerprint(fixture)
      const captureFingerprint = createReplayCaptureFingerprint(fixture)
      if (declaration.fixtureFingerprint !== fingerprint) {
        reasons.push("fixture fingerprint differs from declared evidence")
      }
      const duplicateOf = captureFingerprints.get(captureFingerprint)
      if (duplicateOf) reasons.push(`duplicate fixture fingerprint of ${duplicateOf}`)
      else captureFingerprints.set(captureFingerprint, declaration.id)
      if (reasons.length === 0) qualifying.push(fixture)
      evidence.push({
        evidenceId: declaration.id,
        fixturePath: declaration.fixturePath,
        fixtureId: fixture.id,
        fixtureFingerprint: fingerprint,
        captureFingerprint,
        qualifying: reasons.length === 0,
        reasons,
      })
      return
    }
    evidence.push({
      evidenceId: declaration.id,
      fixturePath: declaration.fixturePath,
      qualifying: false,
      reasons,
    })
  })

  const matrix = runCompletedDraftCalibrationMatrix(qualifying.map(fixture => ({
    id: fixture.id,
    fixture,
  })))
  const audit = auditPhase4Calibration(matrix)
  const slots = uniqueSorted(qualifying.map(fixture =>
    fixture.targetRosterIndex + 1))
  const teamSizes = uniqueSorted(qualifying.map(fixture => fixture.settings.numTeams))
  const formats = uniqueSorted(qualifying.map(scoringFormat)) as Array<"PPR" | "STANDARD">
  const targetSlots = uniqueSorted(manifest.coverageTargets.draftSlots)
  const targetTeamSizes = uniqueSorted(manifest.coverageTargets.teamSizes)
  const targetFormats = uniqueSorted(manifest.coverageTargets.scoringFormats)
  // Wall-clock latency is runtime telemetry, never part of evidence identity.
  const remainingGaps = audit.unmet.filter(unmet =>
    unmet !== "combined replay exceeded decision latency")
  const missingTargetSlots = targetSlots.filter(slot => !slots.includes(slot))
  const missingTeamSizes = targetTeamSizes.filter(size => !teamSizes.includes(size))
  const missingFormats = targetFormats.filter(format => !formats.includes(format))
  if (missingTargetSlots.length > 0) {
    remainingGaps.push(`target draft slots missing: ${missingTargetSlots.join(", ")}`)
  }
  if (missingTeamSizes.length > 0) {
    remainingGaps.push(`team sizes missing: ${missingTeamSizes.join(", ")}`)
  }
  if (missingFormats.length > 0) {
    remainingGaps.push(`scoring formats missing: ${missingFormats.join(", ")}`)
  }
  // Optional forecast labels never affect base campaign qualification. If any
  // qualifying fixture supplies malformed labels, score none: a mixed result
  // would obscure exactly which observations were rejected.
  const opponentEvidence = qualifying.map(fixture => ({
    fixture,
    result: scoreRecordedOpponentForecastEvidence(fixture),
  }))
  const invalidOpponentEvidence = opponentEvidence.filter((entry): entry is {
    fixture: RecordedCompletedDraftReplay
    result: Extract<RecordedOpponentEvidenceResult, { available: false }>
  } => {
    if (!entry.fixture.forecastEvidence || entry.result.available) return false
    return entry.result.reason !== "forecast evidence has no labeled opponent picks"
  })
  const availableOpponentEvidence = opponentEvidence.filter((entry): entry is {
    fixture: RecordedCompletedDraftReplay
    result: Extract<typeof entry.result, { available: true }>
  } => entry.result.available)
  const opponentRunPrediction = invalidOpponentEvidence.length > 0
    ? {
        available: false as const,
        reason: uniqueSorted(invalidOpponentEvidence.map(({ fixture, result }) =>
          `${fixture.id}: ${result.reason}`)).join("; "),
      }
    : availableOpponentEvidence.length > 0
      ? {
          available: true as const,
          labeledFixtureCount: availableOpponentEvidence.length,
          labeledWindowCount: availableOpponentEvidence.reduce(
            (sum, entry) => sum + entry.result.labeledWindowCount,
            0,
          ),
          labeledPickCount: availableOpponentEvidence.reduce(
            (sum, entry) => sum + entry.result.labeledPickCount,
            0,
          ),
          metrics: aggregateOpponentMetrics(availableOpponentEvidence.map(entry => entry.result)),
        }
      : {
          available: false as const,
          reason: "completed replay fixtures do not yet preserve forecast labels",
        }
  const canonical = {
    fingerprint: createHash("sha256").update(stableJson({
      manifest: {
        campaignVersion: manifest.campaignVersion,
        id: manifest.id,
        coverageTargets: {
          draftSlots: targetSlots,
          teamSizes: targetTeamSizes,
          scoringFormats: targetFormats,
        },
      },
      evidence: evidence.map(({
        fixtureFingerprint,
        captureFingerprint,
        qualifying,
        evidenceId,
        reasons,
      }) => ({
        evidenceId,
        fixtureFingerprint,
        captureFingerprint,
        qualifying,
        reasons,
      })),
    })).digest("hex"),
    qualifyingMockCount: qualifying.length,
    targetMockCount: PHASE_4_CALIBRATION_THRESHOLDS.minimumRecordedReplays,
    qualifyingDraftSlots: slots,
    targetDraftSlotCount: PHASE_4_CALIBRATION_THRESHOLDS.minimumDistinctDraftSlots,
    teamSizes,
    scoringFormats: formats,
    evidence,
    quality: {
      legalRate: matrix.combined.legalRate,
      minimumStarterCompleteness: matrix.combined.minimumStarterCompleteness,
      positionalRankViolations: matrix.combined.positionalRankViolations,
      minimumVsBestStarterRatio: matrix.combined.minimumVsBestStarterRatio,
      minimumVsBestBenchRatio: matrix.combined.minimumVsBestBenchRatio,
    },
    opponentRunPrediction,
    remainingGaps: uniqueSorted(remainingGaps),
  }
  const passesDecisionLatencyTarget =
    matrix.combined.maximumDecisionLatencyP95Ms
    <= PHASE_4_CALIBRATION_THRESHOLDS.maximumDecisionLatencyP95Ms
  return {
    schemaVersion: 1,
    campaignId: manifest.id,
    canonical,
    runtimeTelemetry: {
      maximumDecisionLatencyP95Ms: matrix.combined.maximumDecisionLatencyP95Ms,
      decisionLatencyTargetMs:
        PHASE_4_CALIBRATION_THRESHOLDS.maximumDecisionLatencyP95Ms,
      passesDecisionLatencyTarget,
      ready: canonical.remainingGaps.length === 0 && passesDecisionLatencyTarget,
      unmet: passesDecisionLatencyTarget
        ? canonical.remainingGaps
        : uniqueSorted([
          ...canonical.remainingGaps,
          "combined replay exceeded decision latency",
        ]),
    },
  }
}
