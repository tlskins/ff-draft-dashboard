const { createHash } = require("node:crypto")
const { existsSync, readFileSync, readdirSync } = require("node:fs")
const { join, resolve, relative, sep } = require("node:path")
const { spawnSync } = require("node:child_process")
const { isChromeExtensionVersion } = require("./chrome-version.cjs")

const REPORT_VERSION = 1
const expectedMatches = [
  "https://drafty.friedchickentechnologies.com/*",
  "https://ff-draft-dashboard.vercel.app/*",
  "https://fantasy.espn.com/football/draft*",
  "https://fantasy.nfl.com/draftclient*",
]
const approvedMatches = new Set(expectedMatches)
const espnMatch = "https://fantasy.espn.com/football/draft*"
const contentOnlyMatches = expectedMatches.filter(match => match !== espnMatch)
const focusedTests = [
  "__tests__/espnDraftExtractor.test.js",
  "__tests__/espnMockAcceptance.test.ts",
  "__tests__/extensionSites.test.js",
  "__tests__/chromeWebStoreReadiness.test.js",
  "__tests__/chromeWebStoreBundle.test.js",
  "__tests__/extensionRelay.integration.test.js",
  "__tests__/extensionProductionSmoke.test.js",
  "__tests__/productionHealth.test.js",
  "__tests__/completedMockArchive.test.ts",
  "__tests__/userMockDraftApi.test.ts",
  "__tests__/rankingProfileStorage.test.ts",
  "__tests__/rankingProfileUiAuthority.test.tsx",
  "__tests__/useRankingProfiles.test.tsx",
  "__tests__/portableData.test.tsx",
  "__tests__/useDraftListener.test.ts",
  "__tests__/draftBoundaryStatus.test.tsx",
  "__tests__/dataReadiness.test.ts",
  "__tests__/playerAvailability.test.ts",
  "__tests__/playerData.test.ts",
  "__tests__/releasePreflight.test.js",
]

const sha256 = value => createHash("sha256").update(value).digest("hex")
const commandText = (command, args) => [command, ...args].map(JSON.stringify).join(" ")
const canonicalValue = value => {
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalValue(value[key])]))
  return value
}
const canonicalJson = value => JSON.stringify(canonicalValue(value))

const execute = ({ command, args, cwd, env }) => {
  const started = process.hrtime.bigint()
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...env },
    encoding: "utf8",
    timeout: 10 * 60 * 1_000,
    shell: false,
  })
  const durationMs = Number(process.hrtime.bigint() - started) / 1e6
  return {
    command: commandText(command, args), command_array: [command, ...args], cwd,
    status: result.status === 0 && !result.error ? "passed" : "failed",
    duration_ms: durationMs, exit_code: result.status, signal: result.signal || null,
    error: result.error?.message || null,
    stdout_tail: (result.stdout || "").slice(-4000), stderr_tail: (result.stderr || "").slice(-4000),
  }
}

const gitValue = (root, args) => {
  const result = execute({ command: "git", args: ["-C", root, ...args], cwd: root })
  if (result.status !== "passed") throw new Error(`Git inspection failed: ${result.command}`)
  return result.stdout_tail.trim()
}

const repositoryMetadata = root => ({
  path: root,
  head: gitValue(root, ["rev-parse", "HEAD"]),
  branch: gitValue(root, ["branch", "--show-current"]),
  dirty: Boolean(gitValue(root, ["status", "--porcelain"])),
})

const extractZipEntry = (archivePath, entry) => {
  const result = spawnSync("unzip", ["-p", archivePath, entry], {
    encoding: null,
    shell: false,
  })
  if (result.status !== 0 || result.error) {
    throw new Error(`unzip could not read ${entry} from ${archivePath}: ${result.error?.message || result.stderr?.toString("utf8") || `exit ${result.status}`}`)
  }
  return result.stdout
}

const zipEntries = archivePath => {
  const result = spawnSync("unzip", ["-Z1", archivePath], { encoding: "utf8", shell: false })
  if (result.status !== 0 || result.error) {
    throw new Error(`unzip could not list ${archivePath}: ${result.error?.message || result.stderr || `exit ${result.status}`}`)
  }
  return new Set(result.stdout.split("\n").filter(Boolean))
}

const archiveIsTracked = (root, archiveName) => execute({ command: "git", args: ["-C", root, "ls-files", "--error-unmatch", "--", archiveName], cwd: root }).status === "passed"

const assetReferences = manifest => {
  const assets = []
  for (const [size, path] of Object.entries(manifest.icons || {})) assets.push([`icons.${size}`, path])
  assets.push(["action.default_icon", manifest.action?.default_icon])
  assets.push(["action.default_popup", manifest.action?.default_popup])
  assets.push(["background.service_worker", manifest.background?.service_worker])
  for (const [index, content] of (manifest.content_scripts || []).entries()) {
    for (const path of content.js || []) assets.push([`content_scripts[${index}].js`, path])
    for (const path of content.css || []) assets.push([`content_scripts[${index}].css`, path])
  }
  return assets.filter(([, path]) => typeof path === "string" && !path.includes("://") && !path.startsWith("/") && !path.startsWith("data:"))
}

const validateManifest = root => {
  const publicRoot = join(root, "public")
  const manifestPath = join(publicRoot, "manifest.json")
  const errors = []
  let manifest
  try { manifest = JSON.parse(readFileSync(manifestPath, "utf8")) } catch (error) {
    return { status: "failed", errors: [`Cannot parse public/manifest.json: ${error.message}`] }
  }
  if (manifest.manifest_version !== 3) errors.push("manifest_version must be 3")
  if (!isChromeExtensionVersion(manifest.version)) errors.push("version is not valid Chrome extension syntax")
  if (!manifest.name || /local dev/i.test(manifest.name)) errors.push("production manifest name must not use local-development branding")
  if (!manifest.description || manifest.description.length > 132) errors.push("manifest description must be present and no more than 132 characters")
  if (!manifest.background?.service_worker) errors.push("background.service_worker is required")
  if (!manifest.action?.default_popup) errors.push("action.default_popup is required")
  if (!["16", "32", "128"].every(size => manifest.icons?.[size])) errors.push("icons 16, 32, and 128 are required")
  const matches = new Set((manifest.content_scripts || []).flatMap(content => content.matches || []))
  for (const match of expectedMatches) if (!matches.has(match)) errors.push(`required match missing: ${match}`)
  for (const match of matches) if (!approvedMatches.has(match)) errors.push(`unapproved content-script match broadens the extension boundary: ${match}`)
  if (matches.has("http://localhost:3000/*")) errors.push("production manifest must not request localhost access")
  if (manifest.permissions || manifest.host_permissions) errors.push("unexpected permissions or host_permissions broaden the extension boundary")
  const selectorEntry = (manifest.content_scripts || []).find(content => JSON.stringify(content.js || []) === JSON.stringify(["extensionSites.js", "espnDraftExtractor.js", "contentScript.js"]))
  if (!selectorEntry) errors.push("site boundary and extractor must precede contentScript.js")
  else if (JSON.stringify(selectorEntry.matches || []) !== JSON.stringify([espnMatch])) errors.push("ESPN extractor must run only on the approved ESPN draft match")
  for (const match of contentOnlyMatches) {
    const entry = (manifest.content_scripts || []).find(content => (
      (content.matches || []).includes(match)
      && JSON.stringify(content.js || []) === JSON.stringify(["extensionSites.js", "contentScript.js"])
    ))
    if (!entry) errors.push(`approved non-ESPN match must use only the site boundary and content script: ${match}`)
  }
  const assets = assetReferences(manifest)
  for (const [source, asset] of assets) {
    const candidate = resolve(publicRoot, asset)
    if (!candidate.startsWith(`${publicRoot}${sep}`) || !existsSync(candidate)) errors.push(`missing asset: ${source} -> ${asset}`)
  }
  try {
    const popup = readFileSync(join(publicRoot, manifest.action?.default_popup || ""), "utf8")
    if (/local dev/i.test(popup)) errors.push("production popup must not use local-development branding")
    if (!popup.includes(manifest.version)) errors.push("production popup version must match the manifest")
  } catch {
    // The missing-asset error above remains the canonical failure.
  }
  const archives = readdirSync(root).filter(name => /^ext_release_.*\.zip$/.test(name)).sort()
  const expectedArchive = `ext_release_${manifest.version.replaceAll(".", "_")}.zip`
  const archiveCurrent = archives.includes(expectedArchive)
  const archiveChecks = { path: expectedArchive, present: archiveCurrent, tracked: false, readable_zip: false, manifest_matches_source: false, assets_match_source: false }
  if (!archiveCurrent) errors.push(`stale packaged-extension boundary: expected ${expectedArchive}; tracked archives: ${archives.join(", ") || "none"}`)
  else {
    const archivePath = join(root, expectedArchive)
    archiveChecks.tracked = archiveIsTracked(root, expectedArchive)
    if (!archiveChecks.tracked) errors.push(`matching archive is not tracked by Git: ${expectedArchive}`)
    try {
      const entries = zipEntries(archivePath)
      archiveChecks.readable_zip = true
      if (!entries.has("manifest.json")) throw new Error("archive has no manifest.json")
      const archivedManifest = JSON.parse(extractZipEntry(archivePath, "manifest.json").toString("utf8"))
      if (archivedManifest.version !== manifest.version || archivedManifest.manifest_version !== manifest.manifest_version) errors.push("packaged manifest version does not match public/manifest.json")
      if (JSON.stringify(archivedManifest.content_scripts || []) !== JSON.stringify(manifest.content_scripts || [])) errors.push("packaged content-script boundary does not match public/manifest.json")
      const divergentFields = [...new Set([...Object.keys(manifest), ...Object.keys(archivedManifest)])].filter(key => canonicalJson(manifest[key]) !== canonicalJson(archivedManifest[key])).sort()
      if (divergentFields.length) errors.push(`packaged manifest is not semantically identical to public/manifest.json (differing fields: ${divergentFields.join(", ")})`)
      archiveChecks.manifest_matches_source = divergentFields.length === 0
      let assetsMatch = true
      for (const [source, asset] of assetReferences(archivedManifest)) {
        if (!entries.has(asset)) { errors.push(`packaged asset is missing: ${source} -> ${asset}`); assetsMatch = false; continue }
        const sourcePath = resolve(publicRoot, asset)
        if (!sourcePath.startsWith(`${publicRoot}${sep}`) || !existsSync(sourcePath)) { errors.push(`source asset for package comparison is missing: ${source} -> ${asset}`); assetsMatch = false; continue }
        if (sha256(extractZipEntry(archivePath, asset)) !== sha256(readFileSync(sourcePath))) { errors.push(`packaged asset bytes differ from source: ${source} -> ${asset}`); assetsMatch = false }
      }
      archiveChecks.assets_match_source = assetsMatch
    } catch (error) { errors.push(`archive integrity check failed: ${error.message}`) }
  }
  return { status: errors.length ? "failed" : "passed", manifest: relative(root, manifestPath), version: manifest.version, matches: [...matches].sort(), assets, archives, expected_archive: expectedArchive, archive_current: archiveCurrent, archive_checks: archiveChecks, errors }
}

const artifactParity = (root, apiRepo) => {
  const dashboardPath = join(root, "behavior", "playerData.json")
  const apiPath = join(apiRepo, "latest_player_rankings.json")
  try {
    const dashboard = readFileSync(dashboardPath)
    const api = readFileSync(apiPath)
    const metadata = JSON.parse(api.toString("utf8"))
    return {
      status: dashboard.equals(api) ? "passed" : "failed",
      dashboard_path: dashboardPath, api_path: apiPath,
      dashboard_sha256: sha256(dashboard), api_sha256: sha256(api), byte_identical: dashboard.equals(api),
      metadata: { season: metadata.season ?? null, cached_at: metadata.cached_at ?? null, player_count: Array.isArray(metadata.players) ? metadata.players.length : null },
      limitation: "Reports stored season/cache metadata only; it does not create a freshness policy.",
    }
  } catch (error) { return { status: "failed", error: error.message } }
}

const statusFromInspection = value => value.status === "passed" ? "passed" : "failed"
const notRun = ({ name, command, args, cwd, env }) => ({ name, status: "not_run", command: commandText(command, args), command_array: [command, ...args], cwd, env_inputs: env || {} })
const commandGate = (name, specification) => ({ name, env_inputs: specification.env || {}, ...execute(specification) })

const runPreflight = ({ root, mode, apiRepo }) => {
  const started = process.hrtime.bigint()
  const apiOpenapi = join(apiRepo, "openapi", "v1.json")
  const gates = []
  try {
    const dashboard = repositoryMetadata(root)
    const api = repositoryMetadata(apiRepo)
    gates.push({ name: "repository-metadata", status: dashboard.dirty || api.dirty ? "failed" : "passed", dashboard, api, errors: dashboard.dirty || api.dirty ? ["dashboard and API repositories must both be clean for release evidence"] : [] })
  } catch (error) { gates.push({ name: "repository-metadata", status: "failed", error: error.message }) }
  const manifest = validateManifest(root)
  gates.push({ name: "extension-manifest-assets-and-archive", ...manifest, status: statusFromInspection(manifest) })
  const artifact = artifactParity(root, apiRepo)
  gates.push({ name: "ranking-artifact-parity-and-metadata", ...artifact, status: statusFromInspection(artifact) })
  gates.push({ name: "api-openapi-file", status: existsSync(apiOpenapi) ? "passed" : "failed", path: apiOpenapi })

  const jest = join(root, "node_modules", "jest", "bin", "jest.js")
  const commands = [
    { name: "focused-jest", command: process.execPath, args: [jest, "--runInBand", ...focusedTests], cwd: root },
    { name: "api-types-check", command: process.execPath, args: ["scripts/generate-api-types.mjs", "--check"], cwd: root, env: { DRAFTY_OPENAPI_SCHEMA: apiOpenapi } },
    { name: "typescript-no-emit", command: process.execPath, args: [join(root, "node_modules", "typescript", "bin", "tsc"), "--noEmit"], cwd: root },
    { name: "lint", command: "npm", args: ["run", "lint"], cwd: root },
    { name: "production-build", command: "npm", args: ["run", "build"], cwd: root },
  ]
  for (const command of commands) gates.push(mode === "full" ? commandGate(command.name, command) : notRun(command))
  const overall = gates.some(gate => gate.status === "failed") ? "failed" : "passed"
  return {
    report_version: REPORT_VERSION, kind: "drafty-phase-13a-release-preflight", mode,
    release_evidence: mode === "full", overall,
    duration_ms: Number(process.hrtime.bigint() - started) / 1e6,
    inputs: { dashboard_root: root, api_repo: apiRepo, api_openapi: apiOpenapi },
    gates,
    human_checks: {
      browser_acceptance: "pending", voiceover_and_device: "deferred", live_local_mock: "pending",
      deployment_tag_push: "decision_required", external_data_phase_11c: "pending",
    },
    limitations: ["No network, provider credential, browser automation, server, active-data mutation, deployment, tag, or push is performed.", "Frozen prediction v1 is release-acceptable; Phase 9 remains evidence-blocked and Realtime GPT/voice is deferred."],
  }
}

module.exports = { artifactParity, execute, expectedMatches, runPreflight, validateManifest }
