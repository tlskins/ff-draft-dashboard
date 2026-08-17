const {mkdtemp, mkdir, readFile, writeFile} = require("node:fs/promises")
const {spawnSync} = require("node:child_process")
const {tmpdir} = require("node:os")
const {join, resolve} = require("node:path")

describe("production postbuild fixture cleanup", () => {
  it("removes fixture routes, chunks, and textual manifest references", async () => {
    const root = await mkdtemp(join(tmpdir(), "drafty-postbuild-"))
    const buildId = "fixture-build"
    const staticRoot = join(root, "out", "_next", "static", buildId)
    const pagesRoot = join(root, "out", "_next", "static", "chunks", "pages")
    await mkdir(staticRoot, {recursive: true})
    await mkdir(pagesRoot, {recursive: true})
    await writeFile(join(root, "out", "index.html"), '<script src="/_next/app.js"></script>')
    await writeFile(
      join(staticRoot, "_buildManifest.js"),
      'self.__BUILD_MANIFEST={"/":["index.js"],"/phase14a-visual-fixture":["static/chunks/pages/phase14a-visual-fixture-test.js"],sortedPages:["/","/phase14a-visual-fixture"]}',
    )
    await writeFile(
      join(staticRoot, "_ssgManifest.js"),
      'self.__SSG_MANIFEST=new Set(["\\u002Fphase14a-visual-fixture"]);',
    )
    await writeFile(
      join(pagesRoot, "phase14a-visual-fixture-test.js"),
      "fixture chunk",
    )

    const result = spawnSync(
      process.execPath,
      [resolve(__dirname, "../scripts/postbuild.mjs")],
      {cwd: root, encoding: "utf8"},
    )
    expect(result.status).toBe(0)

    const output = join(root, "out")
    const buildManifest = await readFile(
      join(output, "assets", "static", buildId, "_buildManifest.js"),
      "utf8",
    )
    const ssgManifest = await readFile(
      join(output, "assets", "static", buildId, "_ssgManifest.js"),
      "utf8",
    )
    const html = await readFile(join(output, "index.html"), "utf8")
    expect(buildManifest).not.toContain("phase14a-visual-fixture")
    expect(buildManifest).toContain('"/":["index.js"]')
    expect(ssgManifest).toBe("self.__SSG_MANIFEST=new Set([]);")
    expect(html).toContain('/assets/app.js')
  })
})
