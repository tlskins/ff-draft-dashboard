import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import {
  admitPhase9Capture,
  createRawFixtureSha256,
  previewPhase9CaptureAdmission,
  type Phase9CaptureAdmissionFileSystem,
  type Phase9CaptureAdmissionPreviewOptions,
} from "../behavior/draft-advisor/phase9CaptureAdmission"
import {
  createProspectiveFixtureContentSha256,
  runProspectiveRunShadowCampaign,
} from "../behavior/draft-advisor/prospectiveRunShadow"
import {
  cloneCampaign,
  createSyntheticProspectiveFixture,
  rawFixtureBytes,
} from "../test-support/phase9CaptureAdmissionFixture"
import type { RecordedCompletedDraftReplay } from "../behavior/draft-advisor/completedDraftReplay"

const root = "/phase9-admission-test"
const fixtureDirectory = `${root}/prospective-campaign/fixtures`
const manifestPath = `${root}/prospective-campaign/phase9-prospective-run-shadow.json`

const optionsFor = (
  fixture = createSyntheticProspectiveFixture(),
  overrides: Partial<Phase9CaptureAdmissionPreviewOptions> = {},
): Phase9CaptureAdmissionPreviewOptions => {
  const rawBytes = rawFixtureBytes(fixture)
  return {
    manifest: cloneCampaign(),
    rawBytes,
    rawContent: Buffer.from(rawBytes).toString("utf8"),
    workspaceRoot: root,
    fixtureDirectory,
    ...overrides,
  }
}

const addDeclaration = (
  options: Phase9CaptureAdmissionPreviewOptions,
  fixture: RecordedCompletedDraftReplay,
  entryOverrides: Record<string, unknown> = {},
) => {
  const rawBytes = rawFixtureBytes(fixture)
  const rawContent = Buffer.from(rawBytes).toString("utf8")
  const hash = createRawFixtureSha256(rawBytes)
  const manifest = JSON.parse(JSON.stringify(options.manifest))
  manifest.evidence = [{
    id: `existing-${hash.slice(0, 8)}`,
    fixturePath: `prospective-campaign/fixtures/existing-${hash}.json`,
    fixtureId: fixture.id,
    contentSha256: hash,
    baselineCommit: manifest.baseline.commit,
    baselineTag: manifest.baseline.tag,
    declaredProvenance: {
      platform: "ESPN",
      kind: "completed_mock",
      captureMethod: "extension_board_export",
      captureVersion: 1,
    },
    ...entryOverrides,
  }]
  return { ...options, manifest, existingInputs: [{ path: manifest.evidence[0].fixturePath, rawContent }] }
}

const realFileSystem = (): Phase9CaptureAdmissionFileSystem => ({
  exists: path => {
    try { readFileSync(path); return true } catch { return false }
  },
  mkdir: path => require("node:fs").mkdirSync(path, { recursive: true }),
  readFile: path => readFileSync(path),
  remove: path => { try { require("node:fs").unlinkSync(path) } catch { /* absent */ } },
  rename: (from, to) => require("node:fs").renameSync(from, to),
  writeExclusive: (path, content) => writeFileSync(path, content, { flag: "wx" }),
})

const admissionOptions = (fixture = createSyntheticProspectiveFixture()) => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "drafty-phase9-admission-"))
  const campaignDirectory = join(temporaryRoot, "prospective-campaign")
  const directory = join(campaignDirectory, "fixtures")
  const manifestFile = join(campaignDirectory, "phase9-prospective-run-shadow.json")
  require("node:fs").mkdirSync(campaignDirectory, { recursive: true })
  writeFileSync(manifestFile, `${JSON.stringify(cloneCampaign(), null, 2)}\n`, "utf8")
  const rawBytes = rawFixtureBytes(fixture)
  return {
    temporaryRoot,
    options: {
      manifest: cloneCampaign(),
      manifestPath: manifestFile,
      rawBytes,
      rawContent: Buffer.from(rawBytes).toString("utf8"),
      workspaceRoot: temporaryRoot,
      fixtureDirectory: directory,
      existingInputs: [],
      fileSystem: realFileSystem(),
    },
  }
}

describe("Phase 9B capture admission", () => {
  it("produces deterministic preview output and does not write", () => {
    const options = optionsFor()
    const first = previewPhase9CaptureAdmission(options)
    const second = previewPhase9CaptureAdmission(options)
    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
    expect(first.classification).toBe("calibrated_eligible")
    expect(first.campaign.promotionPromoted).toBe(false)
    expect(first.destinationPath).toBe(`prospective-campaign/fixtures/phase9-${first.contentSha256}.json`)
    expect(first.campaign.calibratedFixtures).toEqual({ count: 1, target: 5 })
    expect(first.campaign.distinctDraftSlots).toMatchObject({ count: 1, target: 4 })
    expect(first.campaign.teamCounts.values).toEqual([10])
    expect(first.campaign.scoringFormats.values).toEqual(["PPR"])
    expect(first.campaign.gaps).toEqual(expect.arrayContaining([
      "capture 4 more eligible completed fixtures",
      "capture 3 more distinct draft slots",
      "capture a 12-team fixture",
      "capture a STANDARD fixture",
    ]))
  })

  it("hashes exact bytes and preserves a deterministic manifest entry", () => {
    const fixture = createSyntheticProspectiveFixture()
    const options = optionsFor(fixture)
    const preview = previewPhase9CaptureAdmission(options)
    expect(preview.contentSha256).toBe(createProspectiveFixtureContentSha256(options.rawContent))
    expect(preview.contentSha256).toBe(createRawFixtureSha256(options.rawBytes))
    expect(preview.manifestEntry).toEqual(expect.objectContaining({
      id: `phase9-${preview.contentSha256}`,
      fixtureId: fixture.id,
      contentSha256: preview.contentSha256,
      fixturePath: preview.destinationPath,
    }))
  })

  it.each([
    ["duplicate raw content", { fileState: { existingContentHashes: [createRawFixtureSha256(rawFixtureBytes(createSyntheticProspectiveFixture()))] } }, "duplicate_content"],
    ["duplicate evidence id", { fileState: {}, manifestEvidence: "id" }, "duplicate_evidence_id"],
    ["fixture identifier collision", { fileState: {}, manifestEvidence: "fixtureId" }, "fixture_id_collision"],
    ["destination path collision", { fileState: {}, manifestEvidence: "fixturePath" }, "destination_path_collision"],
    ["existing destination", { fileState: { destinationExists: true } }, "destination_exists"],
  ] as Array<[string, Partial<Phase9CaptureAdmissionPreviewOptions> & { manifestEvidence?: string }, string]>) (
    "%s is rejected before admission",
    (_name, overrides, reason) => {
      let options = optionsFor()
      if (overrides.manifestEvidence) {
        const first = previewPhase9CaptureAdmission(options)
        const existing = createSyntheticProspectiveFixture({ id: "existing-fixture" })
        options = addDeclaration(options, existing, {
          ...(overrides.manifestEvidence === "id" ? { id: first.evidenceId } : {}),
          ...(overrides.manifestEvidence === "fixtureId" ? { fixtureId: first.fixtureId } : {}),
          ...(overrides.manifestEvidence === "fixturePath" ? { fixturePath: first.destinationPath } : {}),
        })
      }
      const preview = previewPhase9CaptureAdmission({ ...options, ...overrides })
      expect(preview.classification).toBe("invalid")
      expect(preview.reasonCodes).toContain(reason)
    },
  )

  it("rejects unsafe manifest paths and malformed JSON", () => {
    const unsafe = optionsFor()
    const unsafeManifest = cloneCampaign()
    unsafeManifest.evidence = [{
      id: "unsafe",
      fixturePath: "../outside.json",
      fixtureId: "unsafe-fixture",
      contentSha256: "0".repeat(64),
      baselineCommit: unsafeManifest.baseline.commit,
      baselineTag: unsafeManifest.baseline.tag,
      declaredProvenance: { platform: "ESPN", kind: "completed_mock", captureMethod: "extension_board_export", captureVersion: 1 },
    }]
    unsafe.manifest = unsafeManifest
    expect(previewPhase9CaptureAdmission(unsafe).reasonCodes).toContain("unsafe_destination_path")
    const malformed = optionsFor(undefined, { rawBytes: Buffer.from("{", "utf8"), rawContent: "{" })
    expect(previewPhase9CaptureAdmission(malformed)).toMatchObject({
      classification: "invalid",
      reasonCodes: expect.arrayContaining(["malformed_fixture_json"]),
    })
  })

  it("rejects incomplete, retrospective, and unpaired captures", () => {
    const incomplete = createSyntheticProspectiveFixture({ omitBoundary: 1 })
    expect(previewPhase9CaptureAdmission(optionsFor(incomplete)).reasonCodes)
      .toContain("canonical_window_incomplete")
    const retrospective = createSyntheticProspectiveFixture({ capturedAt: Date.parse("2026-07-31T10:06:00-04:00") })
    expect(previewPhase9CaptureAdmission(optionsFor(retrospective)).reasonCodes)
      .toContain("retrospective_evidence")
    const unpaired = createSyntheticProspectiveFixture()
    unpaired.runOnlyShadowEvidence = undefined
    expect(previewPhase9CaptureAdmission(optionsFor(unpaired)).reasonCodes)
      .toContain("missing_paired_evidence")
  })

  it("rejects tampered model, artifact, and corpus bindings", () => {
    (["modelIdentity", "artifactFingerprint", "trainingCorpusFingerprint"] as const).forEach(field => {
      const fixture = createSyntheticProspectiveFixture()
      const observation = fixture.runOnlyShadowEvidence!.observations[0] as unknown as Record<string, unknown>
      observation[field] = "tampered"
      const preview = previewPhase9CaptureAdmission(optionsFor(fixture))
      expect(preview.classification).toBe("invalid")
      expect(preview.reasonCodes.some(reason => reason.includes("shadow") || reason.includes("challenger"))).toBe(true)
    })
  })

  it("fails closed on invalid extra observations but keeps valid noncanonical extras informational", () => {
    const withExtra = createSyntheticProspectiveFixture({ extraBoundaries: [2] })
    const validPreview = previewPhase9CaptureAdmission(optionsFor(withExtra))
    expect(validPreview.classification).toBe("calibrated_eligible")
    expect(validPreview.evaluatorReport.fixtures[0].windowCoverage.extra).toBeGreaterThanOrEqual(1)
    const invalidExtra = createSyntheticProspectiveFixture({ extraBoundaries: [2] })
    const extra = invalidExtra.runOnlyShadowEvidence!.observations
      .find(observation => observation.observedThroughOverallPick === 2)
    if (!extra) throw new Error("synthetic extra boundary was not created")
    extra.observationFingerprint = "bad"
    expect(previewPhase9CaptureAdmission(optionsFor(invalidExtra)).classification).toBe("invalid")
  })

  it("classifies an uncalibrated roster as informational and excludes it from campaign coverage", () => {
    const preview = previewPhase9CaptureAdmission(optionsFor(
      createSyntheticProspectiveFixture({ rosterShape: "wr3" }),
    ))
    expect(preview.classification).toBe("uncalibrated_informational")
    expect(preview.evaluatorDisposition).toBe("informational")
    expect(preview.reasonCodes).toContain("uncalibrated_roster_shape")
    expect(preview.campaign.calibratedFixtures.count).toBe(0)
    expect(preview.campaign.rosterShapes.values).toEqual([])
  })

  it("admits a calibrated fixture atomically and preserves raw bytes exactly", () => {
    const { temporaryRoot, options } = admissionOptions()
    try {
      const result = admitPhase9Capture(options)
      expect(result.admitted).toBe(true)
      expect(result.postAdmissionPreview?.campaign.promotionPromoted).toBe(false)
      const destination = resolve(options.workspaceRoot, result.preview.destinationPath!)
      expect(Array.from(readFileSync(destination))).toEqual(Array.from(options.rawBytes))
      const manifest = JSON.parse(readFileSync(options.manifestPath, "utf8"))
      expect(manifest.evidence).toHaveLength(1)
      expect(manifest.evidence[0]).toEqual(result.preview.manifestEntry)
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true })
    }
  })

  it("rejects uncalibrated admission and keeps the campaign unchanged", () => {
    const { temporaryRoot, options } = admissionOptions(createSyntheticProspectiveFixture({ rosterShape: "wr3" }))
    try {
      const result = admitPhase9Capture(options)
      expect(result.admitted).toBe(false)
      expect(result.failureReason).toContain("uncalibrated")
      expect(readFileSync(options.manifestPath, "utf8")).toContain('"evidence": []')
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true })
    }
  })

  it("does not leave a manifest referring to a missing fixture when writing fails", () => {
    const { temporaryRoot, options } = admissionOptions()
    const failingFileSystem: Phase9CaptureAdmissionFileSystem = {
      ...options.fileSystem,
      writeExclusive: (path, content) => {
        if (path.endsWith("phase9-prospective-run-shadow.json.phase9-partial")) throw new Error("injected manifest failure")
        options.fileSystem.writeExclusive(path, content)
      },
    }
    try {
      const result = admitPhase9Capture({ ...options, fileSystem: failingFileSystem })
      expect(result.admitted).toBe(false)
      expect(result.failureReason).toContain("manifest_write_failed")
      expect(JSON.parse(readFileSync(options.manifestPath, "utf8")).evidence).toEqual([])
      expect(result.preview.destinationPath).toBeTruthy()
      expect(() => readFileSync(resolve(options.workspaceRoot, result.preview.destinationPath!))).toThrow()
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true })
    }
  })

  it("does not write a manifest when fixture writing fails", () => {
    const { temporaryRoot, options } = admissionOptions()
    const failingFileSystem: Phase9CaptureAdmissionFileSystem = {
      ...options.fileSystem,
      writeExclusive: () => { throw new Error("injected fixture failure") },
    }
    try {
      const result = admitPhase9Capture({ ...options, fileSystem: failingFileSystem })
      expect(result.admitted).toBe(false)
      expect(result.failureReason).toContain("fixture_write_failed")
      expect(JSON.parse(readFileSync(options.manifestPath, "utf8")).evidence).toEqual([])
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true })
    }
  })

  it("keeps the checked-in empty campaign blocked and promotion impossible", () => {
    const report = runProspectiveRunShadowCampaign(cloneCampaign(), [])
    expect(report.status).toBe("evidence_blocked")
    expect(report.eligibleFixtureCount).toBe(0)
    expect(report.promotion.promoted).toBe(false)
    expect(report.policyFingerprint).toBe("c4d950474e7dd6aae37cc18ba18b356dba2668cd6d626aaa4b5048e5fd29aad7")
    expect(cloneCampaign().evidence).toEqual([])
  })
})
