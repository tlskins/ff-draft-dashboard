const {mkdtempSync, readFileSync, rmSync, writeFileSync} = require("node:fs")
const {tmpdir} = require("node:os")
const {join} = require("node:path")
const {
  BUNDLE_KIND,
  buildChromeWebStoreBundle,
  sha256,
} = require("../scripts/chrome-web-store-bundle-lib.cjs")

const root = join(__dirname, "..")
let temporaryRoot

afterEach(() => {
  if (temporaryRoot) rmSync(temporaryRoot, {recursive: true, force: true})
})

describe("Chrome Web Store submission bundle", () => {
  it("assembles verified upload files without pretending screenshots exist", () => {
    temporaryRoot = mkdtempSync(join(tmpdir(), "drafty-store-bundle-"))
    const outputDir = join(temporaryRoot, "submission")
    const result = buildChromeWebStoreBundle({root, outputDir})
    expect(result).toMatchObject({
      kind: BUNDLE_KIND,
      extension_version: "0.0.0.11",
      extension_name: "Drafty Draft Sync",
    })
    expect(result.files.map(item => item.file)).toEqual(expect.arrayContaining([
      "drafty-draft-sync-0.0.0.11.zip",
      "drafty-icon-128.png",
      "drafty-small-promo-440x280.png",
      "drafty-marquee-1400x560.png",
      "SUBMISSION_PACKET.md",
      "SCREENSHOTS_REQUIRED.md",
    ]))
    expect(readFileSync(join(outputDir, "SCREENSHOTS_REQUIRED.md"), "utf8"))
      .toContain("Authentic screenshots still required")
    const checksumLines = readFileSync(join(outputDir, "SHA256SUMS"), "utf8").trim().split("\n")
    expect(checksumLines).toHaveLength(result.files.length + 1)
    for (const item of result.files) {
      expect(item.sha256).toBe(sha256(readFileSync(join(outputDir, item.file))))
    }
    expect(() => buildChromeWebStoreBundle({root, outputDir})).not.toThrow()
  })

  it("refuses to replace an unrelated output directory", () => {
    temporaryRoot = mkdtempSync(join(tmpdir(), "drafty-store-bundle-"))
    const outputDir = join(temporaryRoot, "submission")
    require("node:fs").mkdirSync(outputDir)
    writeFileSync(join(outputDir, "unrelated.txt"), "keep me")
    expect(() => buildChromeWebStoreBundle({root, outputDir}))
      .toThrow("Refusing to replace an unmarked directory")
  })
})
