import { readdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"

const developmentFixtureName = "phase14a-visual-fixture"
const developmentFixtureRoute = `/${developmentFixtureName}`
const escapedDevelopmentFixtureRoute = `\\u002F${developmentFixtureName}`
const outputDirectory = join(process.cwd(), "out")
const nextAssets = join(outputDirectory, "_next")
const staticAssets = join(outputDirectory, "assets")

await rename(nextAssets, staticAssets)

const rewriteHtmlAssets = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true })
  await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      await rewriteHtmlAssets(path)
      return
    }
    if (!entry.name.endsWith(".html")) {
      return
    }

    const html = await readFile(path, "utf8")
    await writeFile(path, html.replaceAll("/_next", "/assets"))
  }))
}

await rewriteHtmlAssets(outputDirectory)

const scrubDevelopmentFixtureManifest = async (path) => {
  const content = await readFile(path, "utf8")
  if (!content.includes(developmentFixtureName)) return

  const scrubbed = content
    .replace(
      new RegExp(`,"${developmentFixtureRoute}":\\[[^\\]]*\\]`, "g"),
      "",
    )
    .replaceAll(`,"${developmentFixtureRoute}"`, "")
    .replaceAll(`"${escapedDevelopmentFixtureRoute}"`, "")
  await writeFile(path, scrubbed)
}

const scrubDevelopmentFixtureManifests = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true })
  await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      await scrubDevelopmentFixtureManifests(path)
      return
    }
    if (entry.name.endsWith("Manifest.js")) {
      await scrubDevelopmentFixtureManifest(path)
    }
  }))
}

await scrubDevelopmentFixtureManifests(outputDirectory)

const removeDevelopmentOnlyFixtureAssets = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true })
  await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      await removeDevelopmentOnlyFixtureAssets(path)
      return
    }
    if (entry.name.includes(developmentFixtureName)) {
      await rm(path)
    }
  }))
}

await removeDevelopmentOnlyFixtureAssets(outputDirectory)

const developmentFixtureReferences = async (directory) => {
  const matches = []
  const entries = await readdir(directory, { withFileTypes: true })
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      matches.push(...await developmentFixtureReferences(path))
      continue
    }
    const content = await readFile(path)
    if (
      entry.name.includes(developmentFixtureName)
      || content.includes(Buffer.from(developmentFixtureName))
    ) {
      matches.push(path)
    }
  }
  return matches
}

const remainingFixtureReferences = await developmentFixtureReferences(
  outputDirectory,
)
if (remainingFixtureReferences.length > 0) {
  throw new Error(
    `Development fixture leaked into production output:\n${
      remainingFixtureReferences.join("\n")
    }`,
  )
}
