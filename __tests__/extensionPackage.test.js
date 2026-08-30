const { mkdtempSync, mkdirSync, readFileSync, symlinkSync, unlinkSync, writeFileSync } = require("node:fs")
const { tmpdir } = require("node:os")
const { join } = require("node:path")
const { spawnSync } = require("node:child_process")

const { buildExtensionPackage } = require("../scripts/extension-package-lib.cjs")

const assets = ["16.png", "32.png", "128.png", "icon.png", "popup.html", "background.js", "extensionSites.js", "espnDraftExtractor.js", "contentScript.js"]
const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), "drafty package with spaces "))
  const publicRoot = join(root, "public")
  mkdirSync(publicRoot)
  const manifest = { manifest_version: 3, version: "1.2.3.4", icons: { "16": "16.png", "32": "32.png", "128": "128.png" }, action: { default_icon: "icon.png", default_popup: "popup.html" }, background: { service_worker: "background.js" }, content_scripts: [{ matches: ["https://drafty.friedchickentechnologies.com/*", "https://ff-draft-dashboard.vercel.app/*", "https://fantasy.espn.com/football/draft*", "https://fantasy.nfl.com/draftclient*"], js: ["extensionSites.js", "espnDraftExtractor.js", "contentScript.js"] }] }
  writeFileSync(join(publicRoot, "manifest.json"), JSON.stringify(manifest, null, 2))
  for (const asset of assets) writeFileSync(join(publicRoot, asset), `source:${asset}`)
  return root
}
const zipEntries = path => {
  const result = spawnSync("unzip", ["-Z1", path], { encoding: "utf8", shell: false })
  if (result.status !== 0) throw new Error(result.stderr)
  return result.stdout.split("\n").filter(Boolean)
}

describe("deterministic Chrome extension packaging", () => {
  it("produces byte-identical ZIPs with manifest-ordered root contents", () => {
    const root = fixture()
    const first = buildExtensionPackage({ root, outputPath: join(root, "first.zip") })
    const second = buildExtensionPackage({ root, outputPath: join(root, "second.zip") })
    expect(first.archive.equals(second.archive)).toBe(true)
    expect(zipEntries(first.output)).toEqual(["manifest.json", ...assets])
    expect(first.files).toEqual(["manifest.json", ...assets])
    expect(first.archive.readUInt16LE(12)).toBe(0x21)
    const centralHeader = first.archive.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))
    expect(first.archive.readUInt16LE(centralHeader + 14)).toBe(0x21)
  })

  it("rejects missing and unsafe manifest asset paths", () => {
    const root = fixture()
    require("node:fs").unlinkSync(join(root, "public", "background.js"))
    expect(() => buildExtensionPackage({ root, outputPath: join(root, "missing.zip") })).toThrow("Missing extension asset")
    const unsafe = fixture()
    const path = join(unsafe, "public", "manifest.json")
    const manifest = JSON.parse(readFileSync(path, "utf8"))
    manifest.action.default_popup = "../outside.html"
    writeFileSync(path, JSON.stringify(manifest))
    expect(() => buildExtensionPackage({ root: unsafe, outputPath: join(unsafe, "unsafe.zip") })).toThrow("Unsafe extension asset path")
  })

  it("rejects a manifest-referenced symlink even when its target exists outside public", () => {
    const root = fixture()
    const target = join(root, "outside-background.js")
    writeFileSync(target, "outside")
    const linked = join(root, "public", "background.js")
    unlinkSync(linked)
    symlinkSync(target, linked)
    expect(() => buildExtensionPackage({ root, outputPath: join(root, "symlink.zip") })).toThrow("must not be a symlink")
  })

  it("refuses overwrite and only verifies an existing byte-identical archive", () => {
    const root = fixture()
    const output = join(root, "package.zip")
    buildExtensionPackage({ root, outputPath: output })
    expect(() => buildExtensionPackage({ root, outputPath: output })).toThrow("Refusing to overwrite")
    expect(buildExtensionPackage({ root, outputPath: output, verify: true }).verified).toBe(true)
    writeFileSync(output, "stale")
    expect(() => buildExtensionPackage({ root, outputPath: output, verify: true })).toThrow("stale")
  })
})
