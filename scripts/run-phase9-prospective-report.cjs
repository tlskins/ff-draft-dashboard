const { mkdirSync, readFileSync, writeFileSync } = require("node:fs")
const { isAbsolute, relative, resolve, dirname } = require("node:path")
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

const { runProspectiveRunShadowCampaign } = require(resolve(
  __dirname,
  "../behavior/draft-advisor/prospectiveRunShadow.ts",
))

const parseArgs = argv => {
  const args = { manifest: "prospective-campaign/phase9-prospective-run-shadow.json", out: null, fixtures: [] }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === "--manifest") args.manifest = argv[++index]
    else if (argument === "--out") args.out = argv[++index]
    else if (argument === "--fixture") args.fixtures.push(argv[++index])
    else if (argument === "--help") {
      console.log("Usage: npm run eval:phase9-prospective -- [--manifest path] [--fixture path ...] [--out path]")
      process.exit(0)
    } else throw new Error(`Unknown argument: ${argument}`)
  }
  return args
}

const loadJson = path => JSON.parse(readFileSync(path, "utf8"))

const main = () => {
  const args = parseArgs(process.argv.slice(2))
  const manifestPath = resolve(process.cwd(), args.manifest)
  const manifest = loadJson(manifestPath)
  const inputs = args.fixtures.map(fixturePath => {
    const absolutePath = isAbsolute(fixturePath)
      ? fixturePath
      : resolve(process.cwd(), fixturePath)
    const rawContent = readFileSync(absolutePath, "utf8")
    const relativePath = relative(process.cwd(), absolutePath)
    return {
      path: relativePath.startsWith("..") ? fixturePath : relativePath,
      rawContent,
    }
  })
  const report = runProspectiveRunShadowCampaign(manifest, inputs)
  const serialized = `${JSON.stringify(report, null, 2)}\n`
  if (args.out) {
    const outputPath = isAbsolute(args.out) ? args.out : resolve(process.cwd(), args.out)
    mkdirSync(dirname(outputPath), { recursive: true })
    writeFileSync(outputPath, serialized, "utf8")
    console.error(`Phase 9 prospective report: ${outputPath}`)
  }
  process.stdout.write(serialized)
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}
