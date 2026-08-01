import { createHash } from "node:crypto"
import { dirname, isAbsolute, relative, resolve, sep } from "node:path"
import { TextDecoder } from "node:util"
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
  existingCampaignEvidenceInvalid: "existing_campaign_evidence_invalid",
  unsafeDestinationPath: "unsafe_destination_path",
  duplicateEvidenceId: "duplicate_evidence_id",
  fixtureIdCollision: "fixture_id_collision",
  duplicateContent: "duplicate_content",
  destinationPathCollision: "destination_path_collision",
  destinationExists: "destination_exists",
  admissionLockExists: "admission_lock_exists",
  admissionLockFailed: "admission_lock_failed",
  manifestChangedDuringAdmission: "manifest_changed_during_admission",
  stalePartialArtifact: "stale_partial_artifact",
  invalidRawEncoding: "invalid_raw_encoding",
  manifestWriteFailed: "manifest_write_failed",
  fixtureWriteFailed: "fixture_write_failed",
  rawFixtureChanged: "raw_fixture_changed",
  uncalibratedRosterShape: "uncalibrated_roster_shape",
  invalidEvidence: "invalid_evidence",
} as const

export type Phase9CaptureAdmissionReasonCode =
  typeof PHASE9_CAPTURE_ADMISSION_REASON_CODES[keyof typeof PHASE9_CAPTURE_ADMISSION_REASON_CODES]

export type Phase9CapturePathKind = "missing" | "file" | "directory" | "symlink" | "other"

export type Phase9CaptureAdmissionClassification =
  | "calibrated_eligible"
  | "uncalibrated_informational"
  | "invalid"

export interface Phase9CaptureAdmissionFileState {
  destinationExists?: boolean
  destinationPathAlreadyUsed?: boolean
  existingContentHashes?: string[]
  existingContentScanFailed?: boolean
}

export interface Phase9CaptureAdmissionFileSystem {
  exists(path: string): boolean
  lstat(path: string): Phase9CapturePathKind
  readDirectory(path: string): string[]
  readFile(path: string): Uint8Array
  fileIdentity(path: string): string | null
  removeIfIdentity(path: string, identity: string): boolean
  remove(path: string): void
  rename(from: string, to: string): void
  writeExclusive(path: string, content: Uint8Array): void
  mkdir(path: string): void
}

export interface Phase9CaptureAdmissionPreviewOptions {
  manifest: unknown
  rawBytes: Uint8Array
  rawContent: string
  workspaceRoot: string
  fixtureDirectory: string
  manifestPath?: string
  existingInputs?: ProspectiveFixtureInput[]
  fileState?: Phase9CaptureAdmissionFileState
  fileSystem?: Phase9CaptureAdmissionFileSystem
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

const bytesEqual = (left: Uint8Array, right: Uint8Array): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index])

const decodeUtf8 = (bytes: Uint8Array): string =>
  new TextDecoder("utf-8", { fatal: true }).decode(bytes)

const rawContentMatchesBytes = (rawContent: string, rawBytes: Uint8Array): boolean => {
  try {
    const decoded = decodeUtf8(rawBytes)
    return decoded === rawContent && bytesEqual(Buffer.from(rawContent, "utf8"), rawBytes)
  } catch {
    return false
  }
}

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

const pathHasSymlink = (
  fileSystem: Phase9CaptureAdmissionFileSystem,
  path: string,
  stopRoot: string,
): boolean => {
  const rootResolved = resolve(stopRoot)
  let current = resolve(path)
  if (!pathWithin(rootResolved, current)) return true
  while (pathWithin(rootResolved, current)) {
    const kind = fileSystem.lstat(current)
    if (kind === "symlink") return true
    if (current === rootResolved) return false
    const parent = dirname(current)
    if (parent === current) return false
    current = parent
  }
  return true
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

const safeDeclaredPath = (
  workspaceRoot: string,
  fixtureDirectory: string,
  fixturePath: unknown,
): string | null => {
  if (typeof fixturePath !== "string" || !safeRelativePath(fixturePath)) return null
  const absolutePath = resolve(workspaceRoot, fixturePath)
  return pathWithin(fixtureDirectory, absolutePath) ? absolutePath : null
}

export interface Phase9CaptureLoadedInputs {
  inputs: ProspectiveFixtureInput[]
  unsafePaths: string[]
  missingPaths: string[]
  unreadablePaths: string[]
  invalidUtf8Paths: string[]
}

export const loadedInputHasFailures = (loaded: Phase9CaptureLoadedInputs): boolean =>
  loaded.unsafePaths.length > 0
    || loaded.missingPaths.length > 0
    || loaded.unreadablePaths.length > 0
    || loaded.invalidUtf8Paths.length > 0

export const loadPhase9CaptureInputs = ({
  manifest,
  workspaceRoot,
  fixtureDirectory,
  fileSystem,
}: {
  manifest: unknown
  workspaceRoot: string
  fixtureDirectory: string
  fileSystem: Phase9CaptureAdmissionFileSystem
}): Phase9CaptureLoadedInputs => {
  const loaded: Phase9CaptureLoadedInputs = {
    inputs: [],
    unsafePaths: [],
    missingPaths: [],
    unreadablePaths: [],
    invalidUtf8Paths: [],
  }
  if (!isRecord(manifest) || !Array.isArray(manifest.evidence)) return loaded
  const loadedPaths = new Set<string>()
  const loadPath = (fixturePath: string, absolutePath: string): void => {
    const kind = fileSystem.lstat(absolutePath)
    if (kind === "missing") {
      loaded.missingPaths.push(fixturePath)
      return
    }
    if (kind !== "file") {
      loaded.unreadablePaths.push(fixturePath)
      return
    }
    let rawBytes: Uint8Array
    try {
      rawBytes = fileSystem.readFile(absolutePath)
    } catch {
      loaded.unreadablePaths.push(fixturePath)
      return
    }
    let rawContent: string
    try {
      rawContent = decodeUtf8(rawBytes)
    } catch {
      loaded.invalidUtf8Paths.push(fixturePath)
      return
    }
    loaded.inputs.push({ path: fixturePath, rawContent })
    loadedPaths.add(fixturePath)
  }
  manifest.evidence.forEach(entry => {
    if (!isRecord(entry)) return
    const fixturePath = entry.fixturePath
    const absolutePath = safeDeclaredPath(workspaceRoot, fixtureDirectory, fixturePath)
    if (!absolutePath || pathHasSymlink(fileSystem, absolutePath, workspaceRoot)) {
      if (typeof fixturePath === "string") loaded.unsafePaths.push(fixturePath)
      return
    }
    if (typeof fixturePath === "string") loadPath(fixturePath, absolutePath)
  })
  if (fileSystem.lstat(fixtureDirectory) === "directory") {
    let names: string[] = []
    try { names = fileSystem.readDirectory(fixtureDirectory) } catch {
      loaded.unreadablePaths.push(fixtureDirectory)
    }
    names.filter(name => name.endsWith(".json")).sort((left, right) => left.localeCompare(right)).forEach(name => {
      const absolutePath = resolve(fixtureDirectory, name)
      const fixturePath = pathFromWorkspace(workspaceRoot, absolutePath)
      if (loadedPaths.has(fixturePath)) return
      if (pathHasSymlink(fileSystem, absolutePath, workspaceRoot)) {
        loaded.unsafePaths.push(fixturePath)
        return
      }
      loadPath(fixturePath, absolutePath)
    })
  }
  return loaded
}

export const phase9CaptureFileState = ({
  workspaceRoot,
  fixtureDirectory,
  destinationPath,
  fileSystem,
}: {
  workspaceRoot: string
  fixtureDirectory: string
  destinationPath: string | null
  fileSystem: Phase9CaptureAdmissionFileSystem
}): Phase9CaptureAdmissionFileState => {
  const existingContentHashes: string[] = []
  let existingContentScanFailed = false
  if (fileSystem.lstat(fixtureDirectory) === "directory") {
    try {
      fileSystem.readDirectory(fixtureDirectory).forEach(name => {
        const path = resolve(fixtureDirectory, name)
        if (!name.endsWith(".json") || fileSystem.lstat(path) !== "file") return
        try { existingContentHashes.push(sha256Bytes(fileSystem.readFile(path))) } catch { /* unreadable files cannot be duplicates */ }
      })
    } catch {
      existingContentScanFailed = true
    }
  }
  return {
    existingContentHashes: existingContentHashes.sort(),
    existingContentScanFailed,
    destinationExists: destinationPath
      ? fileSystem.lstat(resolve(workspaceRoot, destinationPath)) !== "missing"
      : false,
  }
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
  manifestPath: string | undefined,
  fileSystem: Phase9CaptureAdmissionFileSystem | undefined,
): Phase9CaptureAdmissionReasonCode[] => {
  const reasons = new Set<Phase9CaptureAdmissionReasonCode>()
  if (!pathWithin(workspaceRoot, fixtureDirectory)
    || (destinationPath && !safeRelativePath(destinationPath))
    || (manifestPath && !pathWithin(workspaceRoot, manifestPath))
    || manifest.evidence.some(entry => !safeRelativePath(entry.fixturePath)
      || !pathWithin(fixtureDirectory, resolve(workspaceRoot, entry.fixturePath)))
    || (fileSystem && (pathHasSymlink(fileSystem, fixtureDirectory, workspaceRoot)
      || (manifestPath && pathHasSymlink(fileSystem, manifestPath, workspaceRoot))
      || (destinationPath && pathHasSymlink(
        fileSystem,
        resolve(workspaceRoot, destinationPath),
        workspaceRoot,
      ))
      || manifest.evidence.some(entry => {
        const path = safeDeclaredPath(workspaceRoot, fixtureDirectory, entry.fixturePath)
        return Boolean(path && pathHasSymlink(fileSystem, path, workspaceRoot))
      })))) {
    reasons.add(PHASE9_CAPTURE_ADMISSION_REASON_CODES.unsafeDestinationPath)
  }
  return Array.from(reasons)
}

const existingCampaignIntegrityReasons = (
  report: ProspectiveRunShadowReport,
): string[] => {
  const failures = report.evidence.filter(item =>
    item.disposition === "invalid" || item.disposition === "excluded")
  if (!failures.length) return []
  const reasons = new Set<string>([
    PHASE9_CAPTURE_ADMISSION_REASON_CODES.existingCampaignEvidenceInvalid,
  ])
  failures.flatMap(item => item.reasonCodes).forEach(reason => reasons.add(reason))
  return Array.from(reasons).sort()
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
  if (fileState.existingContentScanFailed) {
    reasons.add(PHASE9_CAPTURE_ADMISSION_REASON_CODES.existingCampaignEvidenceInvalid)
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
  const rawBindingReasons = rawContentMatchesBytes(options.rawContent, options.rawBytes)
    ? []
    : [PHASE9_CAPTURE_ADMISSION_REASON_CODES.rawFixtureChanged]
  const currentIntegrityReasons = existingCampaignIntegrityReasons(fallbackReport)
  const localReasons = localPathReasons(
    manifest,
    options.workspaceRoot,
    options.fixtureDirectory,
    destinationPath,
    options.manifestPath,
    options.fileSystem,
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
    ...currentIntegrityReasons,
    ...rawBindingReasons,
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

const PHASE9_CAPTURE_LOCK_CONTENT = Buffer.from(
  "phase9-capture-admission-lock-v1\n",
  "utf8",
)

const lockPathFor = (manifestPath: string): string => `${manifestPath}.phase9-lock`

const partialPathFor = (path: string): string => `${path}.phase9-partial`

const parseManifestBytes = (bytes: Uint8Array): unknown =>
  JSON.parse(decodeUtf8(bytes)) as unknown

const failurePreview = (
  options: Phase9CaptureAdmissionPreviewOptions,
  reason: string,
): Phase9CaptureAdmissionPreview => {
  const preview = previewPhase9CaptureAdmission(options)
  return {
    ...preview,
    classification: "invalid",
    reasonCodes: Array.from(new Set([...preview.reasonCodes, reason])).sort(),
  }
}

const removeOwned = (
  fileSystem: Phase9CaptureAdmissionFileSystem,
  path: string,
  identity: string | null,
): void => {
  if (identity) fileSystem.removeIfIdentity(path, identity)
}

const manifestSnapshotStillMatches = (
  options: Phase9CaptureAdmissionOptions,
  lockedManifestBytes: Uint8Array,
): boolean => {
  if (pathHasSymlink(options.fileSystem, options.manifestPath, options.workspaceRoot)) return false
  try {
    return bytesEqual(options.fileSystem.readFile(options.manifestPath), lockedManifestBytes)
  } catch {
    return false
  }
}

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
  const lockPath = lockPathFor(options.manifestPath)
  if (pathHasSymlink(options.fileSystem, options.manifestPath, options.workspaceRoot)
    || pathHasSymlink(options.fileSystem, lockPath, options.workspaceRoot)
    || pathHasSymlink(options.fileSystem, options.fixtureDirectory, options.workspaceRoot)) {
    return {
      admitted: false,
      preview: failurePreview(options, PHASE9_CAPTURE_ADMISSION_REASON_CODES.unsafeDestinationPath),
      failureReason: PHASE9_CAPTURE_ADMISSION_REASON_CODES.unsafeDestinationPath,
    }
  }
  if (options.fileSystem.lstat(lockPath) !== "missing") {
    return {
      admitted: false,
      preview: failurePreview(options, PHASE9_CAPTURE_ADMISSION_REASON_CODES.admissionLockExists),
      failureReason: PHASE9_CAPTURE_ADMISSION_REASON_CODES.admissionLockExists,
    }
  }

  let lockIdentity: string | null = null
  try {
    options.fileSystem.writeExclusive(lockPath, PHASE9_CAPTURE_LOCK_CONTENT)
    lockIdentity = options.fileSystem.fileIdentity(lockPath)
    if (!lockIdentity) {
      return {
        admitted: false,
        preview: failurePreview(options, PHASE9_CAPTURE_ADMISSION_REASON_CODES.admissionLockFailed),
        failureReason: PHASE9_CAPTURE_ADMISSION_REASON_CODES.admissionLockFailed,
      }
    }
  } catch (error) {
    const lockKind = options.fileSystem.lstat(lockPath)
    const reason = lockKind === "symlink"
      ? PHASE9_CAPTURE_ADMISSION_REASON_CODES.unsafeDestinationPath
      : lockKind !== "missing"
        ? PHASE9_CAPTURE_ADMISSION_REASON_CODES.admissionLockExists
        : PHASE9_CAPTURE_ADMISSION_REASON_CODES.admissionLockFailed
    return {
      admitted: false,
      preview: failurePreview(options, reason),
      failureReason: `${reason}: ${error instanceof Error ? error.message : String(error)}`,
    }
  }

  let fixtureIdentity: string | null = null
  let manifestPartialIdentity: string | null = null
  const destinationPath = candidateDestination(
    options.workspaceRoot,
    options.fixtureDirectory,
    sha256Bytes(options.rawBytes),
  )
  const destinationAbsolutePath = destinationPath
    ? resolve(options.workspaceRoot, destinationPath)
    : null
  const fixturePartialPath = destinationAbsolutePath
    ? partialPathFor(destinationAbsolutePath)
    : null
  const manifestPartialPath = partialPathFor(options.manifestPath)
  try {
    let lockedManifestBytes: Uint8Array
    let lockedManifest: unknown
    try {
      lockedManifestBytes = options.fileSystem.readFile(options.manifestPath)
      lockedManifest = parseManifestBytes(lockedManifestBytes)
    } catch {
      const preview = failurePreview(options, PHASE9_CAPTURE_ADMISSION_REASON_CODES.campaignInvalid)
      return { admitted: false, preview, failureReason: PHASE9_CAPTURE_ADMISSION_REASON_CODES.campaignInvalid }
    }
    const loaded = loadPhase9CaptureInputs({
      manifest: lockedManifest,
      workspaceRoot: options.workspaceRoot,
      fixtureDirectory: options.fixtureDirectory,
      fileSystem: options.fileSystem,
    })
    const lockedOptions: Phase9CaptureAdmissionOptions = {
      ...options,
      manifest: lockedManifest,
      manifestPath: options.manifestPath,
      existingInputs: loaded.inputs,
      additionalReasonCodes: [
        ...(options.additionalReasonCodes || []),
        ...(loadedInputHasFailures(loaded)
          ? [PHASE9_CAPTURE_ADMISSION_REASON_CODES.existingCampaignEvidenceInvalid]
          : []),
      ],
      fileState: phase9CaptureFileState({
        workspaceRoot: options.workspaceRoot,
        fixtureDirectory: options.fixtureDirectory,
        destinationPath,
        fileSystem: options.fileSystem,
      }),
    }
    const preview = previewWithFileState(lockedOptions)
    if (preview.classification !== "calibrated_eligible") {
      const reason = preview.classification === "uncalibrated_informational"
        ? "Fixture is structurally valid but prospectively uncalibrated; informational admission is not enabled."
        : "Fixture failed the canonical Phase 9 admission validation."
      return { admitted: false, preview, failureReason: reason }
    }
    if (!preview.manifestEntry || !preview.destinationPath || !destinationAbsolutePath) {
      return { admitted: false, preview, failureReason: PHASE9_CAPTURE_ADMISSION_REASON_CODES.unsafeDestinationPath }
    }
    if (pathHasSymlink(options.fileSystem, fixturePartialPath!, options.workspaceRoot)
      || pathHasSymlink(options.fileSystem, manifestPartialPath, options.workspaceRoot)) {
      return {
        admitted: false,
        preview: { ...preview, classification: "invalid", reasonCodes: [PHASE9_CAPTURE_ADMISSION_REASON_CODES.unsafeDestinationPath] },
        failureReason: PHASE9_CAPTURE_ADMISSION_REASON_CODES.unsafeDestinationPath,
      }
    }
    if (options.fileSystem.lstat(fixturePartialPath!) !== "missing"
      || options.fileSystem.lstat(manifestPartialPath) !== "missing") {
      return {
        admitted: false,
        preview: { ...preview, classification: "invalid", reasonCodes: [PHASE9_CAPTURE_ADMISSION_REASON_CODES.stalePartialArtifact] },
        failureReason: PHASE9_CAPTURE_ADMISSION_REASON_CODES.stalePartialArtifact,
      }
    }
    if (!rawContentMatchesBytes(options.rawContent, options.rawBytes)
      || createProspectiveFixtureContentSha256(options.rawContent) !== preview.contentSha256) {
      return {
        admitted: false,
        preview: { ...preview, classification: "invalid", reasonCodes: [PHASE9_CAPTURE_ADMISSION_REASON_CODES.rawFixtureChanged] },
        failureReason: PHASE9_CAPTURE_ADMISSION_REASON_CODES.rawFixtureChanged,
      }
    }
    if (!manifestSnapshotStillMatches(options, lockedManifestBytes)) {
      return {
        admitted: false,
        preview: { ...preview, classification: "invalid", reasonCodes: [PHASE9_CAPTURE_ADMISSION_REASON_CODES.manifestChangedDuringAdmission] },
        failureReason: PHASE9_CAPTURE_ADMISSION_REASON_CODES.manifestChangedDuringAdmission,
      }
    }

    const manifestValidation = validateProspectiveCampaignManifest(lockedManifest)
    if (!manifestValidation.manifest) {
      return { admitted: false, preview, failureReason: PHASE9_CAPTURE_ADMISSION_REASON_CODES.campaignInvalid }
    }
    const manifestWithCandidate = clone(manifestValidation.manifest)
    manifestWithCandidate.evidence = [...manifestWithCandidate.evidence, preview.manifestEntry]
    const serializedManifest = serializeManifest(manifestWithCandidate)

    try {
      options.fileSystem.mkdir(options.fixtureDirectory)
      if (pathHasSymlink(options.fileSystem, options.fixtureDirectory, options.workspaceRoot)
        || pathHasSymlink(options.fileSystem, destinationAbsolutePath, options.workspaceRoot)
        || options.fileSystem.lstat(destinationAbsolutePath) !== "missing") {
        return {
          admitted: false,
          preview: { ...preview, classification: "invalid", reasonCodes: [PHASE9_CAPTURE_ADMISSION_REASON_CODES.destinationExists] },
          failureReason: PHASE9_CAPTURE_ADMISSION_REASON_CODES.destinationExists,
        }
      }
      options.fileSystem.writeExclusive(destinationAbsolutePath, options.rawBytes)
      fixtureIdentity = options.fileSystem.fileIdentity(destinationAbsolutePath)
      if (!fixtureIdentity) throw new Error("created fixture identity is unavailable")
      const storedBytes = options.fileSystem.readFile(destinationAbsolutePath)
      if (!bytesEqual(storedBytes, options.rawBytes)
        || sha256Bytes(storedBytes) !== preview.contentSha256
        || createProspectiveFixtureContentSha256(options.rawContent) !== preview.contentSha256) {
        removeOwned(options.fileSystem, destinationAbsolutePath, fixtureIdentity)
        fixtureIdentity = null
        return {
          admitted: false,
          preview: { ...preview, classification: "invalid", reasonCodes: [PHASE9_CAPTURE_ADMISSION_REASON_CODES.rawFixtureChanged] },
          failureReason: PHASE9_CAPTURE_ADMISSION_REASON_CODES.rawFixtureChanged,
        }
      }
    } catch (error) {
      return {
        admitted: false,
        preview,
        failureReason: `${PHASE9_CAPTURE_ADMISSION_REASON_CODES.fixtureWriteFailed}: ${error instanceof Error ? error.message : String(error)}`,
      }
    }

    if (!manifestSnapshotStillMatches(options, lockedManifestBytes)) {
      removeOwned(options.fileSystem, destinationAbsolutePath, fixtureIdentity)
      fixtureIdentity = null
      return {
        admitted: false,
        preview: { ...preview, classification: "invalid", reasonCodes: [PHASE9_CAPTURE_ADMISSION_REASON_CODES.manifestChangedDuringAdmission] },
        failureReason: PHASE9_CAPTURE_ADMISSION_REASON_CODES.manifestChangedDuringAdmission,
      }
    }
    try {
      options.fileSystem.writeExclusive(manifestPartialPath, serializedManifest)
      manifestPartialIdentity = options.fileSystem.fileIdentity(manifestPartialPath)
      if (!manifestPartialIdentity) throw new Error("created manifest partial identity is unavailable")
      if (!manifestSnapshotStillMatches(options, lockedManifestBytes)) {
        removeOwned(options.fileSystem, manifestPartialPath, manifestPartialIdentity)
        manifestPartialIdentity = null
        removeOwned(options.fileSystem, destinationAbsolutePath, fixtureIdentity)
        fixtureIdentity = null
        return {
          admitted: false,
          preview: { ...preview, classification: "invalid", reasonCodes: [PHASE9_CAPTURE_ADMISSION_REASON_CODES.manifestChangedDuringAdmission] },
          failureReason: PHASE9_CAPTURE_ADMISSION_REASON_CODES.manifestChangedDuringAdmission,
        }
      }
      if (pathHasSymlink(options.fileSystem, options.manifestPath, options.workspaceRoot)) {
        throw new Error(PHASE9_CAPTURE_ADMISSION_REASON_CODES.unsafeDestinationPath)
      }
      options.fileSystem.rename(manifestPartialPath, options.manifestPath)
      manifestPartialIdentity = null
    } catch (error) {
      removeOwned(options.fileSystem, manifestPartialPath, manifestPartialIdentity)
      manifestPartialIdentity = null
      removeOwned(options.fileSystem, destinationAbsolutePath, fixtureIdentity)
      fixtureIdentity = null
      const message = error instanceof Error ? error.message : String(error)
      const reason = message === PHASE9_CAPTURE_ADMISSION_REASON_CODES.unsafeDestinationPath
        ? PHASE9_CAPTURE_ADMISSION_REASON_CODES.unsafeDestinationPath
        : PHASE9_CAPTURE_ADMISSION_REASON_CODES.manifestWriteFailed
      return {
        admitted: false,
        preview,
        failureReason: `${reason}: ${message}`,
      }
    }

    const postReport = runProspectiveRunShadowCampaign(manifestWithCandidate, [
      ...loaded.inputs,
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
  } finally {
    removeOwned(options.fileSystem, lockPath, lockIdentity)
  }
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
  rawContentMatchesBytes(rawContent, rawBytes)
    && createProspectiveFixtureContentSha256(rawContent) === sha256Bytes(rawBytes)
