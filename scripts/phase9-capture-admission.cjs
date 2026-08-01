const {
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} = require("node:fs")
const { createHash } = require("node:crypto")
const { relative, resolve, dirname, sep } = require("node:path")
const Module = require("node:module")
const ts = require("typescript")

process.env.NODE_PATH = [process.cwd(), process.env.NODE_PATH]
  .filter(Boolean)
  .join(require("node:path").delimiter)
Module.Module._initPaths()
require.extensions[".ts"] = (module, filename) => {
  const output = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
    },
    fileName: filename,
  }).outputText
  module._compile(output, filename)
}

const {
  admitPhase9Capture,
  loadPhase9CaptureInputs,
  loadedInputHasFailures,
  PHASE9_CAPTURE_ADMISSION_REASON_CODES,
  phase9CaptureFileState,
  previewPhase9CaptureAdmission,
} = require(resolve(__dirname, "../behavior/draft-advisor/phase9CaptureAdmission.ts"))

const DEFAULT_MANIFEST = "prospective-campaign/phase9-prospective-run-shadow.json"

const parseArgs = argv => {
  const args = { mode: "preview", manifest: DEFAULT_MANIFEST, fixture: null }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === "--preview") args.mode = "preview"
    else if (argument === "--admit") args.mode = "admit"
    else if (argument === "--manifest") args.manifest = argv[++index]
    else if (argument === "--fixture") args.fixture = argv[++index]
    else if (argument === "--help") {
      console.log("Usage: npm run phase9:capture -- --fixture <raw.json> [--manifest <campaign.json>] [--admit]")
      console.log("Preview is the default. --admit is the only mutating mode and admits calibrated evidence only.")
      process.exit(0)
    } else throw new Error(`Unknown argument: ${argument}`)
  }
  if (!args.fixture) throw new Error("--fixture <raw.json> is required")
  return args
}

const sha256 = bytes => createHash("sha256").update(bytes).digest("hex")

const decodeUtf8 = bytes => new TextDecoder("utf-8", { fatal: true }).decode(bytes)

const readManifest = manifestPath => {
  try {
    return JSON.parse(readFileSync(manifestPath, "utf8"))
  } catch (error) {
    throw new Error(`Unable to read campaign manifest: ${error instanceof Error ? error.message : String(error)}`)
  }
}

const nodeFileSystem = {
  exists: path => lstatSync(path, { throwIfNoEntry: false }) !== undefined,
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
  mkdir: path => mkdirSync(path, { recursive: true }),
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
      unlinkSync(path)
      return true
    } catch { return false }
  },
  remove: path => { if (lstatSync(path, { throwIfNoEntry: false })) unlinkSync(path) },
  rename: (from, to) => renameSync(from, to),
  writeExclusive: (path, content) => writeFileSync(path, content, { flag: "wx" }),
}

const printablePreview = preview => ({
  schemaVersion: preview.schemaVersion,
  classification: preview.classification,
  fixtureId: preview.fixtureId,
  evidenceId: preview.evidenceId,
  contentSha256: preview.contentSha256,
  destinationPath: preview.destinationPath,
  manifestEntry: preview.manifestEntry,
  evaluatorDisposition: preview.evaluatorDisposition,
  reasonCodes: preview.reasonCodes,
  campaign: preview.campaign,
})

const main = () => {
  const args = parseArgs(process.argv.slice(2))
  const workspaceRoot = resolve(process.cwd())
  const manifestPath = resolve(workspaceRoot, args.manifest)
  const fixturePath = resolve(workspaceRoot, args.fixture)
  const fixtureDirectory = resolve(
    workspaceRoot,
    resolve(dirname(manifestPath), "fixtures"),
  )
  const manifest = readManifest(manifestPath)
  const rawBytes = readFileSync(fixturePath)
  let rawContent = ""
  let additionalReasonCodes = []
  try {
    rawContent = decodeUtf8(rawBytes)
  } catch (error) {
    additionalReasonCodes = [PHASE9_CAPTURE_ADMISSION_REASON_CODES.invalidRawEncoding]
  }
  const fileSystem = nodeFileSystem
  const loadedInputs = loadPhase9CaptureInputs({
    manifest,
    workspaceRoot,
    fixtureDirectory,
    fileSystem,
  })
  const existingInputs = loadedInputs.inputs
  if (loadedInputHasFailures(loadedInputs)) {
    additionalReasonCodes.push(PHASE9_CAPTURE_ADMISSION_REASON_CODES.existingCampaignEvidenceInvalid)
  }
  const contentSha256 = sha256(rawBytes)
  const destinationPath = relative(
    workspaceRoot,
    resolve(fixtureDirectory, `phase9-${contentSha256}.json`),
  ).split(sep).join("/")
  const options = {
    manifest,
    manifestPath,
    rawBytes,
    rawContent,
    workspaceRoot,
    fixtureDirectory,
    existingInputs,
    fileState: phase9CaptureFileState({
      workspaceRoot,
      fixtureDirectory,
      destinationPath,
      fileSystem,
    }),
    additionalReasonCodes,
    fileSystem,
  }
  if (args.mode === "admit") {
    const result = admitPhase9Capture(options)
    console.log(JSON.stringify({
      mode: "admit",
      ...printablePreview(result.postAdmissionPreview || result.preview),
      admission: {
        admitted: result.admitted,
        failureReason: result.failureReason || null,
      },
    }, null, 2))
    if (!result.admitted) process.exitCode = 2
    return
  }
  const preview = previewPhase9CaptureAdmission(options)
  console.log(JSON.stringify({ mode: "preview", ...printablePreview(preview) }, null, 2))
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
