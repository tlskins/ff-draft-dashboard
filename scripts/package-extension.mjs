#!/usr/bin/env node

import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import extensionPackage from "./extension-package-lib.cjs"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const usage = "Usage: node scripts/package-extension.mjs [--out PATH] [--verify]"
const options = { outputPath: undefined, verify: false }
for (let index = 0; index < process.argv.slice(2).length; index += 1) {
  const argument = process.argv.slice(2)[index]
  if (argument === "--out") {
    const path = process.argv.slice(2)[++index]
    if (!path) throw new Error("--out requires a path")
    options.outputPath = resolve(path)
  } else if (argument === "--verify") options.verify = true
  else if (argument === "--help" || argument === "-h") { console.log(usage); process.exit(0) }
  else throw new Error(`Unknown argument: ${argument}\n${usage}`)
}

const result = extensionPackage.buildExtensionPackage({ root, ...options })
console.log(JSON.stringify({ archive: result.output, files: result.files, verified: result.verified }, null, 2))
