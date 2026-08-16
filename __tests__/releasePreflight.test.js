const { mkdtempSync, mkdirSync, writeFileSync } = require("node:fs")
const { tmpdir } = require("node:os")
const { join } = require("node:path")

const { execute, runPreflight, validateManifest } = require("../scripts/release-preflight-lib.cjs")

const requiredMatches = [
  "https://ff-draft-dashboard.vercel.app/*",
  "http://localhost:3000/*",
  "https://fantasy.espn.com/football/draft*",
]

const createFixture = () => {
  const root = mkdtempSync(join(tmpdir(), "drafty preflight with spaces "))
  mkdirSync(join(root, "public"))
  const manifest = { manifest_version: 3, version: "1.2.3.4", icons: { "16": "16.png", "32": "32.png", "128": "128.png" }, action: { default_icon: "icon.png", default_popup: "popup.html" }, background: { service_worker: "background.js" }, content_scripts: [{ matches: requiredMatches, js: ["espnDraftExtractor.js", "contentScript.js"] }] }
  writeFileSync(join(root, "public", "manifest.json"), JSON.stringify(manifest))
  for (const asset of ["16.png", "32.png", "128.png", "icon.png", "popup.html", "background.js", "espnDraftExtractor.js", "contentScript.js"]) writeFileSync(join(root, "public", asset), "fixture")
  writeFileSync(join(root, "ext_release_1_2_3_4.zip"), "fixture")
  return root
}

describe("Phase 13A release preflight helpers", () => {
  it("validates a complete manifest fixture under a path with spaces", () => {
    const result = validateManifest(createFixture())
    expect(result.status).toBe("passed")
    expect(result.archive_current).toBe(true)
  })

  it("fails for a missing local manifest asset", () => {
    const root = createFixture()
    require("node:fs").unlinkSync(join(root, "public", "background.js"))
    expect(validateManifest(root)).toMatchObject({ status: "failed" })
    expect(validateManifest(root).errors.join(" ")).toContain("missing asset")
  })

  it("rejects a content-script match that broadens the approved boundary", () => {
    const root = createFixture()
    const path = join(root, "public", "manifest.json")
    const manifest = JSON.parse(require("node:fs").readFileSync(path, "utf8"))
    manifest.content_scripts[0].matches.push("https://example.test/*")
    writeFileSync(path, JSON.stringify(manifest))
    expect(validateManifest(root).errors.join(" ")).toContain("unapproved content-script match")
  })

  it("makes a stale packaged archive release-blocking", () => {
    const root = createFixture()
    require("node:fs").unlinkSync(join(root, "ext_release_1_2_3_4.zip"))
    const result = validateManifest(root)
    expect(result.status).toBe("failed")
    expect(result.errors.join(" ")).toContain("stale packaged-extension boundary")
  })

  it("records failed subprocess semantics without shell interpolation", () => {
    const result = execute({ command: process.execPath, args: ["-e", "process.exit(7)"], cwd: process.cwd() })
    expect(result).toMatchObject({ status: "failed", exit_code: 7 })
    expect(result.command_array).toEqual([process.execPath, "-e", "process.exit(7)"])
  })

  it("keeps inspection failures and human checks explicit in the JSON report", () => {
    const root = createFixture()
    require("node:fs").unlinkSync(join(root, "ext_release_1_2_3_4.zip"))
    const report = runPreflight({ root, mode: "quick", apiRepo: root })
    expect(report).toMatchObject({ report_version: 1, overall: "failed", mode: "quick" })
    expect(report.gates.find(gate => gate.name === "extension-manifest-assets-and-archive")).toMatchObject({ status: "failed" })
    expect(report.gates.find(gate => gate.name === "focused-jest")).toMatchObject({ status: "not_run" })
    expect(report.human_checks.browser_acceptance).toBe("pending")
  })
})
