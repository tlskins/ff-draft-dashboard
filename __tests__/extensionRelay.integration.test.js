const {readFileSync} = require("node:fs")
const {join} = require("node:path")
const {spawnSync} = require("node:child_process")

const {runRelayHarness} = require("../scripts/extension-relay-harness.cjs")

const root = join(__dirname, "..")
const manifest = require("../public/manifest.json")
const archive = join(root, `ext_release_${manifest.version.replaceAll(".", "_")}.zip`)
const sourceReader = asset => readFileSync(join(root, "public", asset), "utf8")
const packageReader = asset => {
  const result = spawnSync("unzip", ["-p", archive, asset], {encoding: "utf8", shell: false})
  if (result.status !== 0 || result.error) throw new Error(result.error?.message || result.stderr)
  return result.stdout
}

describe("extension relay integration", () => {
  it("relays supported platform events across both dashboard origins from source", () => {
    expect(runRelayHarness({readAsset: sourceReader, label: "source"})).toMatchObject({
      dashboardOrigins: 2,
      platformRoles: 2,
      relayedSnapshots: 2,
      disconnectedPortSuppressed: true,
      failedPortRemoved: true,
      rejectedPorts: 2,
    })
  })

  it("executes the packaged worker with evidence equivalent to source", () => {
    const source = runRelayHarness({readAsset: sourceReader, label: "source"})
    const packaged = runRelayHarness({readAsset: packageReader, label: "package"})
    expect({...packaged, label: "source"}).toEqual(source)
  })
})
