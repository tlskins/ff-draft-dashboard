const {createHash} = require("node:crypto")
const {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs")
const {basename, join} = require("node:path")

const BUNDLE_KIND = "drafty-chrome-web-store-submission"

const sha256 = value => createHash("sha256").update(value).digest("hex")

const pngDimensions = path => {
  const png = readFileSync(path)
  if (png.length < 24 || png.subarray(1, 4).toString("ascii") !== "PNG") {
    throw new Error(`${path} is not a PNG file`)
  }
  return {width: png.readUInt32BE(16), height: png.readUInt32BE(20)}
}

const validateExistingOutput = (outputDir, version) => {
  if (!existsSync(outputDir)) return
  const markerPath = join(outputDir, "submission-manifest.json")
  if (!existsSync(markerPath)) {
    throw new Error(`Refusing to replace an unmarked directory: ${outputDir}`)
  }
  const marker = JSON.parse(readFileSync(markerPath, "utf8"))
  if (marker.kind !== BUNDLE_KIND || marker.extension_version !== version) {
    throw new Error(`Refusing to replace a different submission bundle: ${outputDir}`)
  }
  rmSync(outputDir, {recursive: true, force: true})
}

const buildChromeWebStoreBundle = ({root, outputDir}) => {
  const manifest = JSON.parse(readFileSync(join(root, "public", "manifest.json"), "utf8"))
  const version = manifest.version
  const archiveName = `ext_release_${version.replaceAll(".", "_")}.zip`
  const inputs = [
    {source: join(root, archiveName), output: `drafty-draft-sync-${version}.zip`, kind: "extension"},
    {source: join(root, "public", "pulse-icon-128.png"), output: "drafty-icon-128.png", kind: "icon", dimensions: {width: 128, height: 128}},
    {source: join(root, "docs", "chrome-web-store", "assets", "drafty-small-promo-440x280.png"), output: "drafty-small-promo-440x280.png", kind: "small_promo", dimensions: {width: 440, height: 280}},
    {source: join(root, "docs", "chrome-web-store", "assets", "drafty-marquee-1400x560.png"), output: "drafty-marquee-1400x560.png", kind: "marquee", dimensions: {width: 1400, height: 560}},
    {source: join(root, "docs", "chrome-web-store-readiness.md"), output: "SUBMISSION_PACKET.md", kind: "submission_packet"},
  ]
  for (const input of inputs) {
    if (!existsSync(input.source)) throw new Error(`Missing Chrome Web Store input: ${input.source}`)
    if (input.dimensions) {
      const actual = pngDimensions(input.source)
      if (actual.width !== input.dimensions.width || actual.height !== input.dimensions.height) {
        throw new Error(`${basename(input.source)} has ${actual.width}x${actual.height}; expected ${input.dimensions.width}x${input.dimensions.height}`)
      }
    }
  }

  validateExistingOutput(outputDir, version)
  mkdirSync(outputDir, {recursive: true})
  for (const input of inputs) copyFileSync(input.source, join(outputDir, input.output))

  const screenshotNotice = [
    "# Authentic screenshots still required",
    "",
    "Capture at least one 1280x800 or 640x400 screenshot from the installed",
    `Drafty Draft Sync ${version} package. Do not substitute fixture artwork or`,
    "include private league, account, email, or authentication information.",
    "",
    "Recommended captures are listed in SUBMISSION_PACKET.md.",
    "",
  ].join("\n")
  writeFileSync(join(outputDir, "SCREENSHOTS_REQUIRED.md"), screenshotNotice)

  const bundleFiles = [...inputs.map(input => input.output), "SCREENSHOTS_REQUIRED.md"]
    .map(file => {
      const bytes = readFileSync(join(outputDir, file))
      return {file, bytes: bytes.length, sha256: sha256(bytes)}
    })
  const submissionManifest = {
    schema_version: 1,
    kind: BUNDLE_KIND,
    extension_version: version,
    extension_name: manifest.name,
    files: bundleFiles,
    human_owned_remaining: [
      "authentic installed-package screenshots",
      "developer-dashboard form choices and upload",
      "installed-package browser acceptance",
      "reviewer submission",
    ],
  }
  writeFileSync(
    join(outputDir, "submission-manifest.json"),
    `${JSON.stringify(submissionManifest, null, 2)}\n`,
  )
  const checksums = [...bundleFiles, {
    file: "submission-manifest.json",
    sha256: sha256(readFileSync(join(outputDir, "submission-manifest.json"))),
  }]
    .map(item => `${item.sha256}  ${item.file}`)
    .join("\n")
  writeFileSync(join(outputDir, "SHA256SUMS"), `${checksums}\n`)
  return submissionManifest
}

module.exports = {BUNDLE_KIND, buildChromeWebStoreBundle, pngDimensions, sha256}
