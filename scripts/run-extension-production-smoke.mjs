#!/usr/bin/env node

import {readFileSync} from "node:fs"
import {dirname, join, resolve} from "node:path"
import {fileURLToPath} from "node:url"
import smoke from "./extension-production-smoke-lib.cjs"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const expectedManifest = JSON.parse(readFileSync(join(root, "public", "manifest.json"), "utf8"))
const baseArgument = process.argv.find(argument => argument.startsWith("--base-url="))
const baseUrl = baseArgument?.slice("--base-url=".length) || "https://drafty.friedchickentechnologies.com"
const result = await smoke.runProductionSmoke({baseUrl, expectedManifest, fetchImpl: fetch})
console.log(JSON.stringify(result, null, 2))
