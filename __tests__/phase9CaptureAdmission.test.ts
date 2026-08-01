import { lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs"
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
  lstat: path => {
    try {
      const stat = lstatSync(path)
      if (stat.isSymbolicLink()) return "symlink"
      if (stat.isFile()) return "file"
      if (stat.isDirectory()) return "directory"
      return "other"
    } catch { return "missing" }
  },
  readDirectory: path => readdirSync(path),
  mkdir: path => require("node:fs").mkdirSync(path, { recursive: true }),
  readFile: path => readFileSync(path),
  fileIdentity: path => {
    try {
      const stat = lstatSync(path)
      return stat.isSymbolicLink() ? null : `${stat.dev}:${stat.ino}`
    } catch { return null }
  },
  removeIfIdentity: (path, identity) => {
    try {
      const stat = lstatSync(path)
      if (stat.isSymbolicLink() || `${stat.dev}:${stat.ino}` !== identity) return false
      require("node:fs").unlinkSync(path)
      return true
    } catch { return false }
  },
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

const admissionOptionsWithExistingBytes = (existingBytes: Uint8Array) => {
  const admission = admissionOptions()
  const existingPath = join(admission.options.fixtureDirectory, "existing.json")
  mkdirSync(admission.options.fixtureDirectory, { recursive: true })
  writeFileSync(existingPath, existingBytes)
  const manifest = cloneCampaign()
  manifest.evidence = [{
    id: "existing-evidence",
    fixturePath: "prospective-campaign/fixtures/existing.json",
    fixtureId: "existing-fixture",
    contentSha256: createRawFixtureSha256(existingBytes),
    baselineCommit: manifest.baseline.commit,
    baselineTag: manifest.baseline.tag,
    declaredProvenance: {
      platform: "ESPN",
      kind: "completed_mock",
      captureMethod: "extension_board_export",
      captureVersion: 1,
    },
  }]
  writeFileSync(admission.options.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8")
  admission.options.manifest = manifest
  return admission
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

  it("blocks a candidate when declared existing evidence is missing", () => {
    const existing = createSyntheticProspectiveFixture({ id: "existing-missing" })
    const options = addDeclaration(optionsFor(), existing)
    options.existingInputs = []
    const preview = previewPhase9CaptureAdmission(options)
    expect(preview.classification).toBe("invalid")
    expect(preview.reasonCodes).toEqual(expect.arrayContaining([
      "existing_campaign_evidence_invalid",
      "fixture_not_found",
    ]))
  })

  it("discovers and blocks an undeclared fixture file", () => {
    const admission = admissionOptions()
    const unlisted = createSyntheticProspectiveFixture({ id: "unlisted-on-disk" })
    mkdirSync(admission.options.fixtureDirectory, { recursive: true })
    writeFileSync(join(admission.options.fixtureDirectory, "unlisted.json"), rawFixtureBytes(unlisted))
    try {
      const result = admitPhase9Capture(admission.options)
      expect(result.admitted).toBe(false)
      expect(result.preview.reasonCodes).toEqual(expect.arrayContaining([
        "existing_campaign_evidence_invalid",
        "unlisted_evidence",
      ]))
      expect(JSON.parse(readFileSync(admission.options.manifestPath, "utf8")).evidence).toEqual([])
    } finally {
      rmSync(admission.temporaryRoot, { recursive: true, force: true })
    }
  })

  it("blocks unreadable and invalid-UTF-8 declared evidence", () => {
    const valid = createSyntheticProspectiveFixture({ id: "existing-unreadable" })
    const unreadable = admissionOptionsWithExistingBytes(rawFixtureBytes(valid))
    const unreadableFs: Phase9CaptureAdmissionFileSystem = {
      ...unreadable.options.fileSystem,
      readFile: path => {
        if (path.endsWith("/existing.json")) throw new Error("injected unreadable fixture")
        return unreadable.options.fileSystem.readFile(path)
      },
    }
    try {
      const unreadableResult = admitPhase9Capture({ ...unreadable.options, fileSystem: unreadableFs })
      expect(unreadableResult.admitted).toBe(false)
      expect(unreadableResult.preview.reasonCodes).toContain("existing_campaign_evidence_invalid")
    } finally {
      rmSync(unreadable.temporaryRoot, { recursive: true, force: true })
    }

    const invalidUtf8 = admissionOptionsWithExistingBytes(Uint8Array.from([0xc3, 0x28]))
    try {
      const result = admitPhase9Capture(invalidUtf8.options)
      expect(result.admitted).toBe(false)
      expect(result.preview.reasonCodes).toContain("existing_campaign_evidence_invalid")
    } finally {
      rmSync(invalidUtf8.temporaryRoot, { recursive: true, force: true })
    }
  })

  it("blocks invalid, excluded, and unlisted existing evidence", () => {
    const candidate = createSyntheticProspectiveFixture({ id: "candidate-integrity" })
    const tampered = createSyntheticProspectiveFixture({ id: "existing-tampered" })
    const tamperedOptions = addDeclaration(optionsFor(candidate), tampered, { contentSha256: "0".repeat(64) })
    expect(previewPhase9CaptureAdmission(tamperedOptions).reasonCodes).toEqual(expect.arrayContaining([
      "existing_campaign_evidence_invalid",
      "fixture_hash_mismatch",
    ]))

    const retrospective = createSyntheticProspectiveFixture({
      id: "existing-retrospective",
      capturedAt: Date.parse("2026-07-31T10:06:00-04:00"),
    })
    const retrospectiveOptions = addDeclaration(optionsFor(candidate), retrospective)
    expect(previewPhase9CaptureAdmission(retrospectiveOptions).reasonCodes).toEqual(expect.arrayContaining([
      "existing_campaign_evidence_invalid",
      "retrospective_evidence",
    ]))

    const unlisted = optionsFor(candidate, {
      existingInputs: [{
        path: "prospective-campaign/fixtures/unlisted.json",
        rawContent: Buffer.from(rawFixtureBytes(tampered)).toString("utf8"),
      }],
    })
    expect(previewPhase9CaptureAdmission(unlisted).reasonCodes).toEqual(expect.arrayContaining([
      "existing_campaign_evidence_invalid",
      "unlisted_evidence",
    ]))
  })

  it("allows valid informational evidence and ordinary coverage insufficiency", () => {
    const candidate = createSyntheticProspectiveFixture({ id: "candidate-valid" })
    const informational = createSyntheticProspectiveFixture({ id: "existing-informational", rosterShape: "wr3" })
    const informationalOptions = addDeclaration(optionsFor(candidate), informational)
    expect(previewPhase9CaptureAdmission(informationalOptions).classification).toBe("calibrated_eligible")

    const existing = createSyntheticProspectiveFixture({ id: "existing-valid" })
    const incompleteCampaign = addDeclaration(optionsFor(candidate), existing)
    expect(previewPhase9CaptureAdmission(incompleteCampaign).classification).toBe("calibrated_eligible")
  })

  it("fails closed when raw bytes and raw content are not identical", () => {
    const options = optionsFor(undefined, { rawContent: "{}" })
    const preview = previewPhase9CaptureAdmission(options)
    expect(preview.classification).toBe("invalid")
    expect(preview.reasonCodes).toContain("raw_fixture_changed")
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
      expect(() => readFileSync(`${options.manifestPath}.phase9-lock`)).toThrow()
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true })
    }
  })

  it("refuses a pre-existing lock without changing campaign artifacts", () => {
    const { temporaryRoot, options } = admissionOptions()
    const lockPath = `${options.manifestPath}.phase9-lock`
    writeFileSync(lockPath, "operator-lock\n", "utf8")
    try {
      const result = admitPhase9Capture(options)
      expect(result.admitted).toBe(false)
      expect(result.failureReason).toBe("admission_lock_exists")
      expect(readFileSync(lockPath, "utf8")).toBe("operator-lock\n")
      expect(JSON.parse(readFileSync(options.manifestPath, "utf8")).evidence).toEqual([])
      expect(() => readdirSync(options.fixtureDirectory)).toThrow()
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true })
    }
  })

  it("reloads the locked manifest so stale snapshots cannot lose prior admission", () => {
    const first = admissionOptions(createSyntheticProspectiveFixture({ id: "first-admission" }))
    const secondFixture = createSyntheticProspectiveFixture({ id: "second-admission", targetRosterIndex: 2 })
    try {
      expect(admitPhase9Capture(first.options).admitted).toBe(true)
      const secondOptions = {
        ...first.options,
        rawBytes: rawFixtureBytes(secondFixture),
        rawContent: Buffer.from(rawFixtureBytes(secondFixture)).toString("utf8"),
        fileState: undefined,
      }
      const secondResult = admitPhase9Capture(secondOptions)
      expect(secondResult.admitted).toBe(true)
      const manifest = JSON.parse(readFileSync(first.options.manifestPath, "utf8"))
      expect(manifest.evidence.map((entry: { fixtureId: string }) => entry.fixtureId)).toEqual(expect.arrayContaining([
        "first-admission",
        "second-admission",
      ]))
      expect(manifest.evidence).toHaveLength(2)
      expect(manifest.evidence.map((entry: { id: string }) => entry.id)).toEqual(expect.arrayContaining([
        secondResult.preview.evidenceId,
      ]))
    } finally {
      rmSync(first.temporaryRoot, { recursive: true, force: true })
    }
  })

  it("preserves a changed manifest and removes only its own fixture", () => {
    const { temporaryRoot, options } = admissionOptions()
    const originalManifestBytes = readFileSync(options.manifestPath)
    const changingFileSystem: Phase9CaptureAdmissionFileSystem = {
      ...options.fileSystem,
      writeExclusive: (path, content) => {
        options.fileSystem.writeExclusive(path, content)
        if (path.includes("/prospective-campaign/fixtures/") && path.endsWith(".json")) {
          writeFileSync(options.manifestPath, Buffer.concat([originalManifestBytes, Buffer.from(" ")]))
        }
      },
    }
    try {
      const result = admitPhase9Capture({ ...options, fileSystem: changingFileSystem })
      expect(result.admitted).toBe(false)
      expect(result.failureReason).toBe("manifest_changed_during_admission")
      expect(readFileSync(options.manifestPath)).toEqual(Buffer.concat([originalManifestBytes, Buffer.from(" ")]))
      expect(() => readFileSync(resolve(options.workspaceRoot, result.preview.destinationPath!))).toThrow()
      expect(() => readFileSync(`${options.manifestPath}.phase9-lock`)).toThrow()
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true })
    }
  })

  it("does not overwrite or remove a destination that appears after preview", () => {
    const { temporaryRoot, options } = admissionOptions()
    const preview = previewPhase9CaptureAdmission(options)
    const destination = resolve(options.workspaceRoot, preview.destinationPath!)
    mkdirSync(options.fixtureDirectory, { recursive: true })
    const sentinel = Buffer.from("pre-existing destination", "utf8")
    writeFileSync(destination, sentinel)
    try {
      const result = admitPhase9Capture(options)
      expect(result.admitted).toBe(false)
      expect(result.preview.reasonCodes).toContain("destination_exists")
      expect(readFileSync(destination)).toEqual(sentinel)
      expect(JSON.parse(readFileSync(options.manifestPath, "utf8")).evidence).toEqual([])
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true })
    }
  })

  it.each([
    ["fixture directory", "fixture-directory"],
    ["manifest", "manifest"],
    ["lock", "lock"],
    ["manifest partial", "manifest-partial"],
  ])("rejects %s symlink confinement violations", (_label, kind) => {
    const { temporaryRoot, options } = admissionOptions()
    const outside = join(temporaryRoot, "outside")
    mkdirSync(outside, { recursive: true })
    const marker = join(outside, "marker")
    writeFileSync(marker, "outside-marker\n", "utf8")
    try {
      if (kind === "fixture-directory") {
        symlinkSync(outside, options.fixtureDirectory)
      } else if (kind === "manifest") {
        const target = join(outside, "manifest.json")
        writeFileSync(target, readFileSync(options.manifestPath))
        unlinkSync(options.manifestPath)
        symlinkSync(target, options.manifestPath)
      } else if (kind === "lock") {
        const target = join(outside, "lock")
        writeFileSync(target, "outside-lock\n")
        symlinkSync(target, `${options.manifestPath}.phase9-lock`)
      } else {
        mkdirSync(options.fixtureDirectory, { recursive: true })
        const target = join(outside, "partial")
        writeFileSync(target, "outside-partial\n")
        symlinkSync(target, `${options.manifestPath}.phase9-partial`)
      }
      const result = admitPhase9Capture(options)
      expect(result.admitted).toBe(false)
      expect(result.failureReason).toBe("unsafe_destination_path")
      expect(readFileSync(marker, "utf8")).toBe("outside-marker\n")
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
      writeExclusive: (path, content) => {
        if (path.includes("/prospective-campaign/fixtures/") && path.endsWith(".json")) {
          throw new Error("injected fixture failure")
        }
        options.fileSystem.writeExclusive(path, content)
      },
    }
    try {
      const result = admitPhase9Capture({ ...options, fileSystem: failingFileSystem })
      expect(result.admitted).toBe(false)
      expect(result.failureReason).toContain("fixture_write_failed")
      expect(JSON.parse(readFileSync(options.manifestPath, "utf8")).evidence).toEqual([])
      expect(() => readFileSync(`${options.manifestPath}.phase9-lock`)).toThrow()
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
