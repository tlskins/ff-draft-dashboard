#!/usr/bin/env node

import {readFileSync} from "node:fs"
import {dirname, join, resolve} from "node:path"
import {fileURLToPath} from "node:url"
import health from "./production-health-lib.cjs"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const expectedManifest = JSON.parse(readFileSync(join(root, "public", "manifest.json"), "utf8"))
const productionEnvironment = readFileSync(join(root, ".env.production"), "utf8")
const apiBaseUrl = process.env.DRAFTY_PRODUCTION_API_HOST
  || productionEnvironment.match(/^DRAFTY_PRODUCTION_API_HOST=(.+)$/m)?.[1]?.trim()
if (!apiBaseUrl) throw new Error("DRAFTY_PRODUCTION_API_HOST is not configured")
const dashboardBaseUrl = process.env.DRAFTY_PRODUCTION_DASHBOARD_HOST
  || "https://drafty.friedchickentechnologies.com"
const result = await health.runProductionHealth({
  dashboardBaseUrl,
  apiBaseUrl,
  expectedManifest,
  fetchImpl: fetch,
})
console.log(JSON.stringify(result, null, 2))
if (result.overall !== "passed") process.exitCode = 1
