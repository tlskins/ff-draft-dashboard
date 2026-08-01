const {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} = require("node:fs")
const { createHash } = require("node:crypto")
const { isAbsolute, relative, resolve, dirname, sep } = require("node:path")
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
  PHASE9_CAPTURE_ADMISSION_REASON_CODES,
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

const isWithin = (root, candidate) => {
  const relativePath = relative(resolve(root), resolve(candidate))
  return relativePath === ""
    || (!relativePath.startsWith(`..${sep}`) && relativePath !== ".." && !isAbsolute(relativePath))
}

const decodeUtf8 = bytes => new TextDecoder("utf-8", { fatal: true }).decode(bytes)

const readManifest = manifestPath => {
  try {
    return JSON.parse(readFileSync(manifestPath, "utf8"))
  } catch (error) {
    throw new Error(`Unable to read campaign manifest: ${error instanceof Error ? error.message : String(error)}`)
  }
}

const safeDeclaredPath = (workspaceRoot, fixtureDirectory, fixturePath) => {
  if (typeof fixturePath !== "string" || !fixturePath || isAbsolute(fixturePath)) return null
  const normalized = fixturePath.replaceAll("\\", "/")
  if (normalized.split("/").some(part => !part || part === "." || part === "..")) return null
  const absolutePath = resolve(workspaceRoot, fixturePath)
  return isWithin(fixtureDirectory, absolutePath) ? absolutePath : null
}

const loadExistingInputs = (manifest, workspaceRoot, fixtureDirectory) => {
  if (!manifest || !Array.isArray(manifest.evidence)) return []
  return manifest.evidence.flatMap(declaration => {
    const absolutePath = safeDeclaredPath(workspaceRoot, fixtureDirectory, declaration.fixturePath)
    if (!absolutePath || !existsSync(absolutePath)) return []
    try {
      return [{ path: declaration.fixturePath, rawContent: decodeUtf8(readFileSync(absolutePath)) }]
    } catch {
      return []
    }
  })
}

const loadExistingContentHashes = (fixtureDirectory) => {
  if (!existsSync(fixtureDirectory)) return []
  return readdirSync(fixtureDirectory).flatMap(name => {
    const path = resolve(fixtureDirectory, name)
    if (!name.endsWith(".json") || !statSync(path).isFile()) return []
    try { return [sha256(readFileSync(path))] } catch { return [] }
  }).sort()
}

const nodeFileSystem = {
  exists: path => existsSync(path),
  mkdir: path => mkdirSync(path, { recursive: true }),
  readFile: path => readFileSync(path),
  remove: path => { if (existsSync(path)) unlinkSync(path) },
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
  const existingInputs = loadExistingInputs(manifest, workspaceRoot, fixtureDirectory)
  const options = {
    manifest,
    manifestPath,
    rawBytes,
    rawContent,
    workspaceRoot,
    fixtureDirectory,
    existingInputs,
    fileState: {
      existingContentHashes: loadExistingContentHashes(fixtureDirectory),
      destinationExists: existsSync(resolve(
        fixtureDirectory,
        `phase9-${sha256(rawBytes)}.json`,
      )),
    },
    additionalReasonCodes,
    fileSystem: nodeFileSystem,
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
