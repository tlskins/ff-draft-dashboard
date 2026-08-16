const { lstatSync, readFileSync, writeFileSync } = require("node:fs")
const { basename, join, relative, resolve, sep } = require("node:path")
const { isChromeExtensionVersion } = require("./chrome-version.cjs")

const localAssetReferences = manifest => {
  const assets = []
  for (const [size, path] of Object.entries(manifest.icons || {})) assets.push([`icons.${size}`, path])
  assets.push(["action.default_icon", manifest.action?.default_icon])
  assets.push(["action.default_popup", manifest.action?.default_popup])
  assets.push(["background.service_worker", manifest.background?.service_worker])
  for (const [index, content] of (manifest.content_scripts || []).entries()) {
    for (const path of content.js || []) assets.push([`content_scripts[${index}].js`, path])
    for (const path of content.css || []) assets.push([`content_scripts[${index}].css`, path])
  }
  return assets.filter(([, path]) => typeof path === "string" && !path.includes("://") && !path.startsWith("/") && !path.startsWith("data:"))
}

const validateArchivePath = path => {
  if (!path || path.includes("\\") || path.includes("\0") || path.split("/").some(part => !part || part === "." || part === "..")) {
    throw new Error(`Unsafe extension asset path: ${JSON.stringify(path)}`)
  }
  return path
}

const collectExtensionFiles = root => {
  const publicRoot = join(root, "public")
  const manifestBuffer = readFileSync(join(publicRoot, "manifest.json"))
  const manifest = JSON.parse(manifestBuffer.toString("utf8"))
  const files = [{ name: "manifest.json", data: manifestBuffer }]
  const names = new Set(["manifest.json"])
  for (const [, asset] of localAssetReferences(manifest)) {
    const name = validateArchivePath(asset)
    if (names.has(name)) continue
    const source = resolve(publicRoot, name)
    if (!source.startsWith(`${publicRoot}${sep}`) || relative(publicRoot, source).startsWith("..")) throw new Error(`Unsafe extension asset path: ${JSON.stringify(asset)}`)
    let metadata
    try { metadata = lstatSync(source) } catch { throw new Error(`Missing extension asset: ${asset}`) }
    if (metadata.isSymbolicLink()) throw new Error(`Extension asset must not be a symlink: ${asset}`)
    if (!metadata.isFile()) throw new Error(`Extension asset must be a regular file: ${asset}`)
    files.push({ name, data: readFileSync(source) })
    names.add(name)
  }
  return { manifest, files }
}

const crcTable = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0)
    table[index] = value >>> 0
  }
  return table
})()

const crc32 = buffer => {
  let value = 0xffffffff
  for (const byte of buffer) value = (value >>> 8) ^ crcTable[(value ^ byte) & 0xff]
  return (value ^ 0xffffffff) >>> 0
}

const uint16 = value => { const buffer = Buffer.alloc(2); buffer.writeUInt16LE(value); return buffer }
const uint32 = value => { const buffer = Buffer.alloc(4); buffer.writeUInt32LE(value >>> 0); return buffer }
const DOS_DATE_1980_01_01 = 0x21

const createDeterministicZip = files => {
  const localParts = []
  const centralParts = []
  let offset = 0
  for (const file of files) {
    const name = Buffer.from(file.name, "utf8")
    const data = Buffer.from(file.data)
    const crc = crc32(data)
    const local = Buffer.concat([
      uint32(0x04034b50), uint16(20), uint16(0), uint16(0), uint16(0), uint16(DOS_DATE_1980_01_01), uint32(crc), uint32(data.length), uint32(data.length), uint16(name.length), uint16(0), name, data,
    ])
    localParts.push(local)
    centralParts.push(Buffer.concat([
      uint32(0x02014b50), uint16(20), uint16(20), uint16(0), uint16(0), uint16(0), uint16(DOS_DATE_1980_01_01), uint32(crc), uint32(data.length), uint32(data.length), uint16(name.length), uint16(0), uint16(0), uint16(0), uint16(0), uint32(0), uint32(offset), name,
    ]))
    offset += local.length
  }
  const central = Buffer.concat(centralParts)
  return Buffer.concat([...localParts, central, Buffer.concat([
    uint32(0x06054b50), uint16(0), uint16(0), uint16(files.length), uint16(files.length), uint32(central.length), uint32(offset), uint16(0),
  ])])
}

const archiveNameForVersion = version => {
  if (!isChromeExtensionVersion(version)) throw new Error("Manifest version is not valid Chrome extension syntax")
  return `ext_release_${version.replaceAll(".", "_")}.zip`
}

const buildExtensionPackage = ({ root, outputPath, verify = false }) => {
  const { manifest, files } = collectExtensionFiles(root)
  const archive = createDeterministicZip(files)
  const output = outputPath || join(root, archiveNameForVersion(manifest.version))
  try {
    const existing = readFileSync(output)
    if (!verify) throw new Error(`Refusing to overwrite existing extension archive: ${output}. Use --verify to compare it with current public sources.`)
    if (!existing.equals(archive)) throw new Error(`Existing extension archive is stale: ${output}`)
    return { output, archive, files: files.map(file => file.name), verified: true }
  } catch (error) {
    if (error.code !== "ENOENT") throw error
  }
  writeFileSync(output, archive, { flag: "wx" })
  return { output, archive, files: files.map(file => file.name), verified: false }
}

module.exports = { archiveNameForVersion, buildExtensionPackage, collectExtensionFiles, createDeterministicZip }
