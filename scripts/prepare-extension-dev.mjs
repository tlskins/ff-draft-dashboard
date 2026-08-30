#!/usr/bin/env node

import {mkdirSync, writeFileSync} from "node:fs"
import {dirname, join, resolve} from "node:path"
import {fileURLToPath} from "node:url"
import {createRequire} from "node:module"
import extensionPackage from "./extension-package-lib.cjs"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const output = join(root, ".extension-dev")
const {manifest, files} = extensionPackage.collectExtensionFiles(root)
const require = createRequire(import.meta.url)
const {dashboardOrigins} = require("../public/extensionSites.js")
const localMatch = "http://localhost:3000/*"
const developmentManifest = {
  ...manifest,
  name: `${manifest.name} (Local Dev)`,
  content_scripts: (manifest.content_scripts || []).map(content => ({
    ...content,
    matches: (content.matches || []).some(match => dashboardOrigins.some(origin => match.startsWith(origin)))
      ? Array.from(new Set([...(content.matches || []), localMatch]))
      : content.matches,
  })),
}

mkdirSync(output, {recursive: true})
for (const file of files) {
  const data = file.name === "manifest.json"
    ? `${JSON.stringify(developmentManifest, null, 2)}\n`
    : file.data
  writeFileSync(join(output, file.name), data)
}

console.log(JSON.stringify({directory: output, version: manifest.version, localMatch}, null, 2))
