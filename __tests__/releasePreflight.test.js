const { mkdtempSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } = require("node:fs")
const { tmpdir } = require("node:os")
const { join } = require("node:path")
const { spawnSync } = require("node:child_process")

const { execute, runPreflight, validateManifest } = require("../scripts/release-preflight-lib.cjs")

const requiredMatches = [
  "https://ff-draft-dashboard.vercel.app/*",
  "http://localhost:3000/*",
  "https://fantasy.espn.com/football/draft*",
]
const assets = ["16.png", "32.png", "128.png", "icon.png", "popup.html", "background.js", "espnDraftExtractor.js", "contentScript.js"]

const command = (commandName, args, cwd) => {
  const result = spawnSync(commandName, args, { cwd, encoding: "utf8", shell: false })
  if (result.status !== 0 || result.error) throw new Error(`${commandName} failed: ${result.error?.message || result.stderr}`)
}

const createFixture = ({ archiveVersion = "1.2.3.4", archivePopup, archiveBackground, archivePermissions, omitArchiveAsset, archiveAssetContents, trackArchive = true } = {}) => {
  const root = mkdtempSync(join(tmpdir(), "drafty preflight with spaces "))
  const publicRoot = join(root, "public")
  const packageRoot = join(root, "package")
  mkdirSync(publicRoot)
  mkdirSync(packageRoot)
  const manifest = { manifest_version: 3, version: "1.2.3.4", icons: { "16": "16.png", "32": "32.png", "128": "128.png" }, action: { default_icon: "icon.png", default_popup: "popup.html" }, background: { service_worker: "background.js" }, content_scripts: [{ matches: requiredMatches, js: ["espnDraftExtractor.js", "contentScript.js"] }] }
  writeFileSync(join(publicRoot, "manifest.json"), JSON.stringify(manifest))
  for (const asset of [...assets, "popup-alt.html", "background-alt.js"]) writeFileSync(join(publicRoot, asset), `source:${asset}`)
  const archivedManifest = { ...manifest, version: archiveVersion }
  if (archivePopup) archivedManifest.action = { ...manifest.action, default_popup: archivePopup }
  if (archiveBackground) archivedManifest.background = { ...manifest.background, service_worker: archiveBackground }
  if (archivePermissions) archivedManifest.permissions = archivePermissions
  writeFileSync(join(packageRoot, "manifest.json"), JSON.stringify(archivedManifest))
  for (const asset of [...assets, "popup-alt.html", "background-alt.js"]) if (asset !== omitArchiveAsset) writeFileSync(join(packageRoot, asset), archiveAssetContents?.[asset] || readFileSync(join(publicRoot, asset)))
  const archive = "ext_release_1_2_3_4.zip"
  command("zip", ["-q", "-r", join(root, archive), "."], packageRoot)
  rmSync(packageRoot, { recursive: true, force: true })
  command("git", ["init"], root)
  command("git", ["config", "user.email", "preflight@example.test"], root)
  command("git", ["config", "user.name", "Preflight Test"], root)
  command("git", ["add", "public"], root)
  if (trackArchive) command("git", ["add", archive], root)
  command("git", ["commit", "-m", "fixture"], root)
  return { root, archive }
}

describe("Phase 13A release preflight helpers", () => {
  it("validates a real, tracked ZIP fixture under a path with spaces", () => {
    const result = validateManifest(createFixture().root)
    expect(result.status).toBe("passed")
    expect(result.archive_checks).toMatchObject({ tracked: true, readable_zip: true, manifest_matches_source: true, assets_match_source: true })
  })

  it("rejects an untracked matching archive", () => {
    const result = validateManifest(createFixture({ trackArchive: false }).root)
    expect(result.errors.join(" ")).toContain("not tracked by Git")
  })

  it("rejects a corrupt tracked ZIP", () => {
    const { root, archive } = createFixture()
    writeFileSync(join(root, archive), "not a zip")
    expect(validateManifest(root).errors.join(" ")).toContain("archive integrity check failed")
  })

  it("rejects an archive manifest version mismatch", () => {
    const result = validateManifest(createFixture({ archiveVersion: "1.2.3.3" }).root)
    expect(result.errors.join(" ")).toContain("packaged manifest version")
  })

  it.each([
    ["popup", { archivePopup: "popup-alt.html" }, "action"],
    ["background", { archiveBackground: "background-alt.js" }, "background"],
    ["permissions", { archivePermissions: ["storage"] }, "permissions"],
  ])("rejects archive-only %s manifest divergence", (_name, options, field) => {
    const result = validateManifest(createFixture(options).root)
    expect(result.errors.join(" ")).toContain(`differing fields: ${field}`)
    expect(result.archive_checks.manifest_matches_source).toBe(false)
  })

  it("rejects a missing packaged asset", () => {
    const result = validateManifest(createFixture({ omitArchiveAsset: "background.js" }).root)
    expect(result.errors.join(" ")).toContain("packaged asset is missing")
  })

  it("rejects renamed archives whose referenced asset bytes differ", () => {
    const result = validateManifest(createFixture({ archiveAssetContents: { "contentScript.js": "stale package bytes" } }).root)
    expect(result.errors.join(" ")).toContain("packaged asset bytes differ")
  })

  it("requires dashboard, local, and ESPN matches on the extractor entry itself", () => {
    const { root } = createFixture()
    const path = join(root, "public", "manifest.json")
    const manifest = JSON.parse(readFileSync(path, "utf8"))
    manifest.content_scripts = [
      { matches: requiredMatches, js: ["contentScript.js"] },
      { matches: ["https://fantasy.espn.com/football/draft*"], js: ["espnDraftExtractor.js", "contentScript.js"] },
    ]
    writeFileSync(path, JSON.stringify(manifest))
    expect(validateManifest(root).errors.join(" ")).toContain("extractor content-script entry is missing required match")
  })

  it("fails when a source manifest asset is missing", () => {
    const { root } = createFixture()
    unlinkSync(join(root, "public", "background.js"))
    expect(validateManifest(root).errors.join(" ")).toContain("missing asset")
  })

  it("fails when a source content-script match broadens the approved boundary", () => {
    const { root } = createFixture()
    const path = join(root, "public", "manifest.json")
    const manifest = JSON.parse(readFileSync(path, "utf8"))
    manifest.content_scripts[0].matches.push("https://example.test/*")
    writeFileSync(path, JSON.stringify(manifest))
    expect(validateManifest(root).errors.join(" ")).toContain("unapproved content-script match")
  })

  it("makes a missing current archive release-blocking", () => {
    const { root, archive } = createFixture()
    unlinkSync(join(root, archive))
    const result = validateManifest(root)
    expect(result.status).toBe("failed")
    expect(result.errors.join(" ")).toContain("stale packaged-extension boundary")
  })

  it("records failed subprocess semantics without shell interpolation", () => {
    const result = execute({ command: process.execPath, args: ["-e", "process.exit(7)"], cwd: process.cwd() })
    expect(result).toMatchObject({ status: "failed", exit_code: 7 })
    expect(result.command_array).toEqual([process.execPath, "-e", "process.exit(7)"])
  })

  it("fails quick reports when an inspected repository is dirty", () => {
    const { root } = createFixture()
    writeFileSync(join(root, "uncommitted.txt"), "dirty")
    const report = runPreflight({ root, mode: "quick", apiRepo: root })
    expect(report).toMatchObject({ report_version: 1, overall: "failed", mode: "quick" })
    expect(report.gates.find(gate => gate.name === "repository-metadata")).toMatchObject({ status: "failed" })
    expect(report.gates.find(gate => gate.name === "focused-jest")).toMatchObject({ status: "not_run" })
    expect(report.human_checks.browser_acceptance).toBe("pending")
  })
})
