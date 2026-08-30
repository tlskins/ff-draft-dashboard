import { readFile, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { resolve } from "node:path"

const require = createRequire(import.meta.url)
const { evaluateWebMcpRun } = require("./webmcp-eval-lib.cjs")

const valueAfter = (args, flag) => {
  const index = args.indexOf(flag)
  return index >= 0 ? args[index + 1] : null
}

const args = process.argv.slice(2)
const input = valueAfter(args, "--input")
const output = valueAfter(args, "--output")
if (!input) {
  process.stderr.write("Usage: node scripts/run-webmcp-eval.mjs --input <run.json> [--output <report.json>]\n")
  process.exitCode = 2
} else {
  const root = resolve(new URL("..", import.meta.url).pathname)
  const corpusPath = resolve(root, "behavior/webmcp/webmcp-task-corpus.json")
  const [corpus, run] = await Promise.all([
    readFile(corpusPath, "utf8").then(JSON.parse),
    readFile(resolve(input), "utf8").then(JSON.parse),
  ])
  const report = evaluateWebMcpRun(corpus, run)
  const serialized = `${JSON.stringify(report, null, 2)}\n`
  if (output) await writeFile(resolve(output), serialized, "utf8")
  else process.stdout.write(serialized)
  if (report.overall !== "passed") process.exitCode = 1
}
