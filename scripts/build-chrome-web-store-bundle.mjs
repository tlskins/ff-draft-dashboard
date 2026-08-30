#!/usr/bin/env node

import {dirname, join, resolve} from "node:path"
import {fileURLToPath} from "node:url"
import bundle from "./chrome-web-store-bundle-lib.cjs"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const manifest = await import(join(root, "public", "manifest.json"), {with: {type: "json"}})
const outputArgument = process.argv.find(argument => argument.startsWith("--output="))
const outputDir = outputArgument
  ? resolve(outputArgument.slice("--output=".length))
  : join(root, "release", "chrome-web-store", manifest.default.version)
const result = bundle.buildChromeWebStoreBundle({root, outputDir})
console.log(JSON.stringify({output_dir: outputDir, ...result}, null, 2))
