import { createHash } from "node:crypto"
import { isAbsolute, relative, resolve, sep } from "node:path"
import {
  createProspectiveFixtureContentSha256,
  runProspectiveRunShadowCampaign,
  validateProspectiveCampaignManifest,
  type ProspectiveCampaignEvidenceDeclaration,
  type ProspectiveCampaignManifest,
  type ProspectiveFixtureInput,
  type ProspectiveRunShadowReport,
} from "./prospectiveRunShadow"

export const PHASE9_CAPTURE_ADMISSION_SCHEMA_VERSION = 1 as const
export const PHASE9_CAPTURE_FIXTURES_DIRECTORY = "prospective-campaign/fixtures"

export const PHASE9_CAPTURE_ADMISSION_REASON_CODES = {
  campaignInvalid: "campaign_invalid",
  unsafeDestinationPath: "unsafe_destination_path",
  duplicateEvidenceId: "duplicate_evidence_id",
  fixtureIdCollision: "fixture_id_collision",
  duplicateContent: "duplicate_content",
  destinationPathCollision: "destination_path_collision",
  destinationExists: "destination_exists",
  invalidRawEncoding: "invalid_raw_encoding",
  manifestWriteFailed: "manifest_write_failed",
  fixtureWriteFailed: "fixture_write_failed",
  rawFixtureChanged: "raw_fixture_changed",
  uncalibratedRosterShape: "uncalibrated_roster_shape",
  invalidEvidence: "invalid_evidence",
} as const

export type Phase9CaptureAdmissionReasonCode =
  typeof PHASE9_CAPTURE_ADMISSION_REASON_CODES[keyof typeof PHASE9_CAPTURE_ADMISSION_REASON_CODES]

export type Phase9CaptureAdmissionClassification =
  | "calibrated_eligible"
  | "uncalibrated_informational"
  | "invalid"

export interface Phase9CaptureAdmissionFileState {
  destinationExists?: boolean
  destinationPathAlreadyUsed?: boolean
  existingContentHashes?: string[]
}

export interface Phase9CaptureAdmissionPreviewOptions {
  manifest: unknown
  rawBytes: Uint8Array
  rawContent: string
  workspaceRoot: string
  fixtureDirectory: string
  existingInputs?: ProspectiveFixtureInput[]
  fileState?: Phase9CaptureAdmissionFileState
  captureMethod?: "extension_board_export" | "cli_board_export"
  additionalReasonCodes?: string[]
}

export interface Phase9CaptureCampaignSummary {
  status: ProspectiveRunShadowReport["status"]
  calibratedFixtures: { count: number, target: number }
  distinctDraftSlots: { count: number, target: number, values: number[] }
  teamCounts: { values: number[], required: number[] }
  scoringFormats: { values: Array<"PPR" | "STANDARD">, required: Array<"PPR" | "STANDARD"> }
  rosterShapes: { values: string[], required: string[] }
  canonicalWindows: {
    expected: number
    captured: number
    comparable: number
    scored: number
    missing: number
    extra: number
  } | null
  requiredSubgroups: { status: string, failures: string[] }
  gaps: string[]
  promotionPromoted: false
}

export interface Phase9CaptureAdmissionPreview {
  schemaVersion: typeof PHASE9_CAPTURE_ADMISSION_SCHEMA_VERSION
  classification: Phase9CaptureAdmissionClassification
  fixtureId: string | null
  evidenceId: string
  contentSha256: string
  destinationPath: string | null
  manifestEntry: ProspectiveCampaignEvidenceDeclaration | null
  reasonCodes: string[]
  campaign: Phase9CaptureCampaignSummary
  evaluatorDisposition: "eligible" | "informational" | "excluded" | "invalid" | null
  evaluatorReport: ProspectiveRunShadowReport
}

export interface Phase9CaptureAdmissionFileSystem {
  exists(path: string): boolean
  mkdir(path: string): void
  readFile(path: string): Uint8Array
  remove(path: string): void
  rename(from: string, to: string): void
  writeExclusive(path: string, content: Uint8Array): void
}

export interface Phase9CaptureAdmissionOptions extends Phase9CaptureAdmissionPreviewOptions {
  manifestPath: string
  fileSystem: Phase9CaptureAdmissionFileSystem
}

export interface Phase9CaptureAdmissionResult {
  admitted: boolean
  preview: Phase9CaptureAdmissionPreview
  failureReason?: string
  postAdmissionPreview?: Phase9CaptureAdmissionPreview
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value)

const clone = <Value>(value: Value): Value =>
  JSON.parse(JSON.stringify(value)) as Value

const sha256Bytes = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex")

const toPosix = (path: string): string => path.split(sep).join("/")

const pathWithin = (root: string, candidate: string): boolean => {
  const rootResolved = resolve(root)
  const candidateResolved = resolve(candidate)
  const candidateRelative = relative(rootResolved, candidateResolved)
  return candidateRelative === ""
    || (!candidateRelative.startsWith(`..${sep}`)
      && candidateRelative !== ".."
      && !isAbsolute(candidateRelative))
}

const safeRelativePath = (path: string): boolean => {
  if (!path || isAbsolute(path) || /^[A-Za-z]:[\\/]/.test(path)) return false
  const normalized = path.replaceAll("\\", "/")
  return normalized.split("/").every(part => part.length > 0 && part !== "." && part !== "..")
}

const pathFromWorkspace = (workspaceRoot: string, path: string): string =>
  toPosix(relative(resolve(workspaceRoot), resolve(workspaceRoot, path)))

const decodeFixtureId = (rawContent: string): string | null => {
  try {
    const parsed: unknown = JSON.parse(rawContent)
    return isRecord(parsed) && typeof parsed.id === "string" ? parsed.id : null
  } catch {
    return null
  }
}

const candidateDestination = (
  workspaceRoot: string,
  fixtureDirectory: string,
  contentSha256: string,
): string | null => {
  if (!pathWithin(workspaceRoot, fixtureDirectory)) return null
  const destination = resolve(fixtureDirectory, `phase9-${contentSha256}.json`)
  if (!pathWithin(fixtureDirectory, destination)) return null
  return pathFromWorkspace(workspaceRoot, destination)
}

const manifestEntryFor = ({
  manifest,
  fixtureId,
  evidenceId,
  destinationPath,
  contentSha256,
  captureMethod,
}: {
  manifest: ProspectiveCampaignManifest
  fixtureId: string | null
  evidenceId: string
  destinationPath: string | null
  contentSha256: string
  captureMethod: "extension_board_export" | "cli_board_export"
}): ProspectiveCampaignEvidenceDeclaration | null => {
  if (!destinationPath) return null
  return {
    id: evidenceId,
    fixturePath: destinationPath,
    fixtureId: fixtureId || "",
    contentSha256,
    baselineCommit: manifest.baseline.commit,
    baselineTag: manifest.baseline.tag,
    declaredProvenance: {
      platform: "ESPN",
      kind: "completed_mock",
      captureMethod,
      captureVersion: 1,
    },
  }
}

const currentReport = (
  manifest: unknown,
  existingInputs: ProspectiveFixtureInput[],
): ProspectiveRunShadowReport =>
  runProspectiveRunShadowCampaign(manifest, existingInputs)

const campaignSummary = (report: ProspectiveRunShadowReport): Phase9CaptureCampaignSummary => ({
  status: report.status,
  calibratedFixtures: {
    count: report.eligibleFixtureCount,
    target: report.policy.evidenceSufficiency.minimumEligibleFixtures,
  },
  distinctDraftSlots: {
    count: report.coverage.distinctDraftSlots.length,
    target: report.policy.evidenceSufficiency.minimumDistinctDraftSlots,
    values: report.coverage.distinctDraftSlots,
  },
  teamCounts: {
    values: report.coverage.teamCounts,
    required: report.policy.evidenceSufficiency.requiredTeamCounts,
  },
  scoringFormats: {
    values: report.coverage.scoringFormats,
    required: report.policy.evidenceSufficiency.requiredScoringFormats,
  },
  rosterShapes: {
    values: report.coverage.rosterShapes,
    required: report.policy.evidenceSufficiency.requiredRosterShapes,
  },
  canonicalWindows: report.aggregate?.windowCoverage || null,
  requiredSubgroups: {
    status: report.stratified.overall.status,
    failures: report.stratified.overall.failures,
  },
  gaps: report.nextCaptureNeeds,
  promotionPromoted: report.promotion.promoted,
})

const localPathReasons = (
  manifest: ProspectiveCampaignManifest,
  workspaceRoot: string,
  fixtureDirectory: string,
  destinationPath: string | null,
): Phase9CaptureAdmissionReasonCode[] => {
  const reasons = new Set<Phase9CaptureAdmissionReasonCode>()
  if (!pathWithin(workspaceRoot, fixtureDirectory)
    || (destinationPath && !safeRelativePath(destinationPath))
    || manifest.evidence.some(entry => !safeRelativePath(entry.fixturePath)
      || !pathWithin(fixtureDirectory, resolve(workspaceRoot, entry.fixturePath)))) {
    reasons.add(PHASE9_CAPTURE_ADMISSION_REASON_CODES.unsafeDestinationPath)
  }
  return Array.from(reasons)
}

const collisionReasons = (
  manifest: ProspectiveCampaignManifest,
  candidate: ProspectiveCampaignEvidenceDeclaration | null,
  fileState: Phase9CaptureAdmissionFileState,
): Phase9CaptureAdmissionReasonCode[] => {
  if (!candidate) return []
  const reasons = new Set<Phase9CaptureAdmissionReasonCode>()
  if (manifest.evidence.some(entry => entry.id === candidate.id)) {
    reasons.add(PHASE9_CAPTURE_ADMISSION_REASON_CODES.duplicateEvidenceId)
  }
  if (manifest.evidence.some(entry => entry.fixtureId === candidate.fixtureId)) {
    reasons.add(PHASE9_CAPTURE_ADMISSION_REASON_CODES.fixtureIdCollision)
  }
  if (manifest.evidence.some(entry => entry.fixturePath === candidate.fixturePath)
    || fileState.destinationPathAlreadyUsed) {
    reasons.add(PHASE9_CAPTURE_ADMISSION_REASON_CODES.destinationPathCollision)
  }
  if (manifest.evidence.some(entry => entry.contentSha256 === candidate.contentSha256)
    || fileState.existingContentHashes?.includes(candidate.contentSha256)) {
    reasons.add(PHASE9_CAPTURE_ADMISSION_REASON_CODES.duplicateContent)
  }
  if (fileState.destinationExists) reasons.add(PHASE9_CAPTURE_ADMISSION_REASON_CODES.destinationExists)
  return Array.from(reasons)
}

const candidateReport = (
  manifest: ProspectiveCampaignManifest,
  candidate: ProspectiveCampaignEvidenceDeclaration,
  rawContent: string,
  existingInputs: ProspectiveFixtureInput[],
): ProspectiveRunShadowReport => {
  const candidateManifest = clone(manifest)
  candidateManifest.evidence = [...manifest.evidence, candidate]
  return runProspectiveRunShadowCampaign(candidateManifest, [
    ...existingInputs,
    { path: candidate.fixturePath, rawContent },
  ])
}

export const previewPhase9CaptureAdmission = (
  options: Phase9CaptureAdmissionPreviewOptions,
): Phase9CaptureAdmissionPreview => {
  const contentSha256 = sha256Bytes(options.rawBytes)
  const fixtureId = decodeFixtureId(options.rawContent)
  const evidenceId = `phase9-${contentSha256}`
  const manifestValidation = validateProspectiveCampaignManifest(options.manifest)
  const existingInputs = options.existingInputs || []
  const fallbackReport = currentReport(options.manifest, existingInputs)
  const fallbackSummary = campaignSummary(fallbackReport)
  if (manifestValidation.errors.length || !manifestValidation.manifest) {
    return {
      schemaVersion: PHASE9_CAPTURE_ADMISSION_SCHEMA_VERSION,
      classification: "invalid",
      fixtureId,
      evidenceId,
      contentSha256,
      destinationPath: null,
      manifestEntry: null,
      reasonCodes: [PHASE9_CAPTURE_ADMISSION_REASON_CODES.campaignInvalid],
      campaign: fallbackSummary,
      evaluatorDisposition: null,
      evaluatorReport: fallbackReport,
    }
  }

  const manifest = manifestValidation.manifest
  const destinationPath = candidateDestination(
    options.workspaceRoot,
    options.fixtureDirectory,
    contentSha256,
  )
  const manifestEntry = manifestEntryFor({
    manifest,
    fixtureId,
    evidenceId,
    destinationPath,
    contentSha256,
    captureMethod: options.captureMethod || "extension_board_export",
  })
  const localReasons = localPathReasons(
    manifest,
    options.workspaceRoot,
    options.fixtureDirectory,
    destinationPath,
  )
  const collisions = collisionReasons(manifest, manifestEntry, options.fileState || {})
  const evaluatorReport = manifestEntry
    ? candidateReport(manifest, manifestEntry, options.rawContent, existingInputs)
    : fallbackReport
  const evaluatorDecision = manifestEntry
    ? evaluatorReport.evidence.find(item => item.id === manifestEntry.id)
      || evaluatorReport.evidence.find(item => item.fixturePath === manifestEntry.fixturePath)
    : undefined
  const evaluatorDisposition = evaluatorDecision?.disposition || null
  const evaluatorReasons = evaluatorDecision?.reasonCodes || []
  const reasons = Array.from(new Set([
    ...localReasons,
    ...collisions,
    ...evaluatorReasons,
    ...(options.additionalReasonCodes || []),
  ])).sort()
  const blockingReasons = reasons.filter(reason =>
    reason !== "uncalibrated_roster_shape")
  const classification: Phase9CaptureAdmissionClassification = blockingReasons.length
    ? "invalid"
    : evaluatorDisposition === "eligible"
      ? "calibrated_eligible"
      : evaluatorDisposition === "informational"
        ? "uncalibrated_informational"
        : "invalid"
  return {
    schemaVersion: PHASE9_CAPTURE_ADMISSION_SCHEMA_VERSION,
    classification,
    fixtureId,
    evidenceId,
    contentSha256,
    destinationPath,
    manifestEntry,
    reasonCodes: reasons,
    campaign: campaignSummary(evaluatorReport),
    evaluatorDisposition,
    evaluatorReport,
  }
}

const serializeManifest = (manifest: ProspectiveCampaignManifest): Uint8Array =>
  Buffer.from(`${JSON.stringify({
    ...manifest,
    evidence: [...manifest.evidence].sort((left, right) =>
      left.id.localeCompare(right.id) || left.fixturePath.localeCompare(right.fixturePath)),
  }, null, 2)}\n`, "utf8")

const previewWithFileState = (
  options: Phase9CaptureAdmissionOptions,
): Phase9CaptureAdmissionPreview => {
  const contentSha256 = sha256Bytes(options.rawBytes)
  const destinationPath = candidateDestination(
    options.workspaceRoot,
    options.fixtureDirectory,
    contentSha256,
  )
  const destinationAbsolutePath = destinationPath
    ? resolve(options.workspaceRoot, destinationPath)
    : null
  return previewPhase9CaptureAdmission({
    ...options,
    fileState: {
      ...options.fileState,
      destinationExists: destinationAbsolutePath
        ? options.fileSystem.exists(destinationAbsolutePath)
        : false,
    },
  })
}

export const admitPhase9Capture = (
  options: Phase9CaptureAdmissionOptions,
): Phase9CaptureAdmissionResult => {
  const preview = previewWithFileState(options)
  if (preview.classification !== "calibrated_eligible") {
    const reason = preview.classification === "uncalibrated_informational"
      ? "Fixture is structurally valid but prospectively uncalibrated; informational admission is not enabled."
      : "Fixture failed the canonical Phase 9 admission validation."
    return { admitted: false, preview, failureReason: reason }
  }
  if (!preview.manifestEntry || !preview.destinationPath) {
    return { admitted: false, preview, failureReason: "Fixture destination could not be safely derived." }
  }

  const manifestValidation = validateProspectiveCampaignManifest(options.manifest)
  if (!manifestValidation.manifest) {
    return { admitted: false, preview, failureReason: "Campaign manifest is invalid." }
  }
  const destinationAbsolutePath = resolve(options.workspaceRoot, preview.destinationPath)
  const manifestWithCandidate = clone(manifestValidation.manifest)
  manifestWithCandidate.evidence = [
    ...manifestWithCandidate.evidence,
    preview.manifestEntry,
  ]
  const fixturePartialPath = `${destinationAbsolutePath}.phase9-partial`
  const manifestPartialPath = `${options.manifestPath}.phase9-partial`
  if (options.fileSystem.exists(fixturePartialPath)
    || options.fileSystem.exists(manifestPartialPath)) {
    return { admitted: false, preview, failureReason: "A stale partial admission artifact exists; recover it before retrying." }
  }

  try {
    options.fileSystem.mkdir(options.fixtureDirectory)
  } catch (error) {
    return {
      admitted: false,
      preview,
      failureReason: `${PHASE9_CAPTURE_ADMISSION_REASON_CODES.fixtureWriteFailed}: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
  try {
    options.fileSystem.writeExclusive(fixturePartialPath, options.rawBytes)
    options.fileSystem.rename(fixturePartialPath, destinationAbsolutePath)
    const storedBytes = options.fileSystem.readFile(destinationAbsolutePath)
    if (sha256Bytes(storedBytes) !== preview.contentSha256
      || storedBytes.length !== options.rawBytes.length
      || !storedBytes.every((value, index) => value === options.rawBytes[index])) {
      options.fileSystem.remove(destinationAbsolutePath)
      return { admitted: false, preview, failureReason: "Admitted fixture bytes did not round-trip exactly." }
    }
  } catch (error) {
    try { options.fileSystem.remove(fixturePartialPath) } catch { /* best effort cleanup */ }
    return {
      admitted: false,
      preview,
      failureReason: `${PHASE9_CAPTURE_ADMISSION_REASON_CODES.fixtureWriteFailed}: ${error instanceof Error ? error.message : String(error)}`,
    }
  }

  try {
    options.fileSystem.writeExclusive(manifestPartialPath, serializeManifest(manifestWithCandidate))
    options.fileSystem.rename(manifestPartialPath, options.manifestPath)
  } catch (error) {
    try { options.fileSystem.remove(manifestPartialPath) } catch { /* best effort cleanup */ }
    try { options.fileSystem.remove(destinationAbsolutePath) } catch { /* best effort cleanup */ }
    return {
      admitted: false,
      preview,
      failureReason: `${PHASE9_CAPTURE_ADMISSION_REASON_CODES.manifestWriteFailed}: ${error instanceof Error ? error.message : String(error)}`,
    }
  }

  const postReport = runProspectiveRunShadowCampaign(manifestWithCandidate, [
    ...(options.existingInputs || []),
    { path: preview.destinationPath, rawContent: options.rawContent },
  ])
  const postAdmissionPreview: Phase9CaptureAdmissionPreview = {
    ...preview,
    classification: "calibrated_eligible",
    reasonCodes: [],
    evaluatorDisposition: "eligible",
    campaign: campaignSummary(postReport),
    evaluatorReport: postReport,
  }
  return { admitted: true, preview, postAdmissionPreview }
}

export const createRawFixtureSha256 = sha256Bytes

export const createPhase9CaptureManifestEntry = ({
  manifest,
  rawBytes,
  rawContent,
  workspaceRoot,
  fixtureDirectory,
  captureMethod,
}: Omit<Phase9CaptureAdmissionPreviewOptions, "existingInputs" | "fileState">): ProspectiveCampaignEvidenceDeclaration | null => {
  const manifestValidation = validateProspectiveCampaignManifest(manifest)
  if (!manifestValidation.manifest) return null
  const contentSha256 = sha256Bytes(rawBytes)
  return manifestEntryFor({
    manifest: manifestValidation.manifest,
    fixtureId: decodeFixtureId(rawContent),
    evidenceId: `phase9-${contentSha256}`,
    destinationPath: candidateDestination(workspaceRoot, fixtureDirectory, contentSha256),
    contentSha256,
    captureMethod: captureMethod || "extension_board_export",
  })
}

export const createProspectiveFixtureInput = (
  workspaceRoot: string,
  path: string,
  rawBytes: Uint8Array,
): ProspectiveFixtureInput => ({
  path: pathFromWorkspace(workspaceRoot, resolve(workspaceRoot, path)),
  rawContent: new TextDecoder("utf-8", { fatal: true }).decode(rawBytes),
})

export const verifyRawContentHash = (rawContent: string, rawBytes: Uint8Array): boolean =>
  createProspectiveFixtureContentSha256(rawContent) === sha256Bytes(rawBytes)
