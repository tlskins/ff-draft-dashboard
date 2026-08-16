#!/usr/bin/env node

// Provider-free Phase 13A release preflight. stdout is one JSON document.
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import helpers from "./release-preflight-lib.cjs"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const usage = "Usage: node scripts/release-preflight.mjs --mode quick|full [--api-repo PATH] [--report PATH]"

const parse = argv => {
  const options = { mode: "quick", apiRepo: process.env.DRAFTY_API_REPO, report: undefined }
  for (let i = 0; i < argv.length; i += 1) {
    const argument = argv[i]
    if (argument === "--mode" || argument === "--api-repo" || argument === "--report") {
      const value = argv[++i]
      if (!value) throw new Error(`${argument} requires a value`)
      if (argument === "--mode") options.mode = value
      if (argument === "--api-repo") options.apiRepo = value
      if (argument === "--report") options.report = resolve(value)
    } else if (argument === "--help" || argument === "-h") {
      options.help = true
    } else {
      throw new Error(`Unknown argument: ${argument}`)
    }
  }
  if (!options.help && !["quick", "full"].includes(options.mode)) throw new Error("--mode must be quick or full")
  options.apiRepo = resolve(options.apiRepo || resolve(root, "..", "ff-draft-dashboard-python-api"))
  return options
}

const failedReport = error => ({
  report_version: 1,
  kind: "drafty-phase-13a-release-preflight",
  overall: "failed",
  error: error.message,
  usage,
  gates: [],
})

const main = () => {
  let options
  try {
    options = parse(process.argv.slice(2))
  } catch (error) {
    console.log(JSON.stringify(failedReport(error), null, 2))
    return 2
  }
  if (options.help) {
    console.log(usage)
    return 0
  }
  const report = helpers.runPreflight({ root, ...options })
  const output = `${JSON.stringify(report, null, 2)}\n`
  if (options.report) {
    mkdirSync(dirname(options.report), { recursive: true })
    writeFileSync(options.report, output)
  }
  console.log(output)
  return report.overall === "passed" ? 0 : 1
}

process.exitCode = main()
