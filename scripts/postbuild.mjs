import { readdir, readFile, rename, writeFile } from "node:fs/promises"
import { join } from "node:path"

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
