#!/usr/bin/env node

import {readFileSync} from "node:fs"
import {dirname, join, resolve} from "node:path"
import {fileURLToPath} from "node:url"
import {spawnSync} from "node:child_process"
import relayHarness from "./extension-relay-harness.cjs"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const manifest = JSON.parse(readFileSync(join(root, "public", "manifest.json"), "utf8"))
const archive = join(root, `ext_release_${manifest.version.replaceAll(".", "_")}.zip`)
const sourceReader = asset => readFileSync(join(root, "public", asset), "utf8")
const packageReader = asset => {
  const result = spawnSync("unzip", ["-p", archive, asset], {encoding: "utf8", shell: false})
  if (result.status !== 0 || result.error) throw new Error(`Cannot read ${asset} from ${archive}: ${result.error?.message || result.stderr}`)
  return result.stdout
}

const source = relayHarness.runRelayHarness({readAsset: sourceReader, label: "source"})
const packaged = relayHarness.runRelayHarness({readAsset: packageReader, label: "package"})
const comparable = evidence => ({...evidence, label: undefined})
if (JSON.stringify(comparable(source)) !== JSON.stringify(comparable(packaged))) {
  throw new Error("Source and packaged relay evidence differ")
}

console.log(JSON.stringify({version: manifest.version, archive, source, packaged, equivalent: true}, null, 2))
