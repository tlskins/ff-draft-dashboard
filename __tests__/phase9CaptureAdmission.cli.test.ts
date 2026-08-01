import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import {
  cloneCampaign,
  createSyntheticProspectiveFixture,
  rawFixtureBytes,
} from "../test-support/phase9CaptureAdmissionFixture"

const repositoryRoot = resolve(__dirname, "..")
const cliPath = resolve(repositoryRoot, "scripts/phase9-capture-admission.cjs")

const createCliCampaign = (fixture = createSyntheticProspectiveFixture()) => {
  const root = mkdtempSync(join(tmpdir(), "drafty-phase9-cli-"))
  const campaignDirectory = join(root, "prospective-campaign")
  const manifestPath = join(campaignDirectory, "phase9-prospective-run-shadow.json")
  const rawPath = join(root, "raw-export.json")
  mkdirSync(campaignDirectory, { recursive: true })
  writeFileSync(manifestPath, `${JSON.stringify(cloneCampaign(), null, 2)}\n`, "utf8")
  writeFileSync(rawPath, rawFixtureBytes(fixture))
  return { root, manifestPath, rawPath }
}

const runCli = (root: string, manifestPath: string, rawPath: string, admit = false) =>
  spawnSync(process.execPath, [
    cliPath,
    "--fixture",
    "raw-export.json",
    "--manifest",
    "prospective-campaign/phase9-prospective-run-shadow.json",
    ...(admit ? ["--admit"] : []),
  ], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, NODE_PATH: repositoryRoot },
  })

describe("Phase 9B capture admission CLI", () => {
  it("defaults to deterministic non-mutating preview", () => {
    const campaign = createCliCampaign()
    try {
      const first = runCli(campaign.root, campaign.manifestPath, campaign.rawPath)
      const second = runCli(campaign.root, campaign.manifestPath, campaign.rawPath)
      expect(first.status).toBe(0)
      expect(first.stdout).toBe(second.stdout)
      expect(JSON.parse(first.stdout)).toMatchObject({
        mode: "preview",
        classification: "calibrated_eligible",
      })
      expect(existsSync(join(campaign.root, "prospective-campaign/fixtures"))).toBe(false)
      expect(JSON.parse(readFileSync(campaign.manifestPath, "utf8")).evidence).toEqual([])
    } finally {
      rmSync(campaign.root, { recursive: true, force: true })
    }
  })

  it("requires explicit admission, preserves bytes, and rejects a second admission", () => {
    const campaign = createCliCampaign()
    try {
      const admitted = runCli(campaign.root, campaign.manifestPath, campaign.rawPath, true)
      expect(admitted.status).toBe(0)
      const admittedOutput = JSON.parse(admitted.stdout)
      expect(admittedOutput.admission).toEqual({ admitted: true, failureReason: null })
      const destination = resolve(campaign.root, admittedOutput.destinationPath)
      expect(readFileSync(destination)).toEqual(readFileSync(campaign.rawPath))
      expect(existsSync(`${campaign.manifestPath}.phase9-lock`)).toBe(false)

      const duplicate = runCli(campaign.root, campaign.manifestPath, campaign.rawPath, true)
      expect(duplicate.status).toBe(2)
      const duplicateOutput = JSON.parse(duplicate.stdout)
      expect(duplicateOutput.admission.admitted).toBe(false)
      expect(duplicateOutput.reasonCodes).toEqual(expect.arrayContaining([
        "duplicate_content",
        "duplicate_evidence_id",
      ]))
    } finally {
      rmSync(campaign.root, { recursive: true, force: true })
    }
  })

  it("rejects lock contention without mutating the campaign", () => {
    const campaign = createCliCampaign()
    try {
      const lockPath = `${campaign.manifestPath}.phase9-lock`
      writeFileSync(lockPath, "operator-lock\n", "utf8")
      const result = runCli(campaign.root, campaign.manifestPath, campaign.rawPath, true)
      expect(result.status).toBe(2)
      const output = JSON.parse(result.stdout)
      expect(output.admission).toEqual({ admitted: false, failureReason: "admission_lock_exists" })
      expect(readFileSync(lockPath, "utf8")).toBe("operator-lock\n")
      expect(JSON.parse(readFileSync(campaign.manifestPath, "utf8")).evidence).toEqual([])
    } finally {
      rmSync(campaign.root, { recursive: true, force: true })
    }
  })

  it("rejects malformed and uncalibrated inputs", () => {
    const malformed = createCliCampaign()
    try {
      writeFileSync(malformed.rawPath, "{", "utf8")
      const preview = runCli(malformed.root, malformed.manifestPath, malformed.rawPath)
      expect(preview.status).toBe(0)
      expect(JSON.parse(preview.stdout)).toMatchObject({ classification: "invalid" })
    } finally {
      rmSync(malformed.root, { recursive: true, force: true })
    }

    const uncalibrated = createCliCampaign(createSyntheticProspectiveFixture({
      id: "cli-uncalibrated",
      rosterShape: "wr3",
    }))
    try {
      const preview = runCli(uncalibrated.root, uncalibrated.manifestPath, uncalibrated.rawPath)
      expect(preview.status).toBe(0)
      expect(JSON.parse(preview.stdout)).toMatchObject({ classification: "uncalibrated_informational" })
      const admission = runCli(uncalibrated.root, uncalibrated.manifestPath, uncalibrated.rawPath, true)
      expect(admission.status).toBe(2)
      expect(JSON.parse(admission.stdout).admission.admitted).toBe(false)
    } finally {
      rmSync(uncalibrated.root, { recursive: true, force: true })
    }
  })
})
