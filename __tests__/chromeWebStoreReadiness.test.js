const {readFileSync} = require("node:fs")
const {join} = require("node:path")

const root = join(__dirname, "..")
const manifest = require("../public/manifest.json")

describe("Chrome Web Store production boundary", () => {
  it("uses production branding, an eligible description, and exact minimum site access", () => {
    expect(manifest).toMatchObject({
      manifest_version: 3,
      name: "Drafty Draft Sync",
      version: "0.0.0.10",
    })
    expect(manifest.description.length).toBeLessThanOrEqual(132)
    expect(manifest.name).not.toMatch(/local dev/i)
    expect(manifest.permissions).toBeUndefined()
    expect(manifest.host_permissions).toBeUndefined()
    expect(manifest.content_scripts.flatMap(entry => entry.matches).sort()).toEqual([
      "https://drafty.friedchickentechnologies.com/*",
      "https://fantasy.espn.com/football/draft*",
      "https://fantasy.nfl.com/draftclient*",
      "https://ff-draft-dashboard.vercel.app/*",
    ].sort())
    expect(manifest.content_scripts).toEqual([
      {
        matches: ["https://fantasy.espn.com/football/draft*"],
        js: ["extensionSites.js", "espnDraftExtractor.js", "contentScript.js"],
      },
      {
        matches: ["https://fantasy.nfl.com/draftclient*"],
        js: ["extensionSites.js", "contentScript.js"],
      },
      {
        matches: [
          "https://drafty.friedchickentechnologies.com/*",
          "https://ff-draft-dashboard.vercel.app/*",
        ],
        js: ["extensionSites.js", "contentScript.js"],
      },
    ])
  })

  it("packages only local code and keeps the popup version aligned", () => {
    const scripts = ["background.js", "extensionSites.js", "espnDraftExtractor.js", "contentScript.js"]
      .map(file => readFileSync(join(root, "public", file), "utf8"))
      .join("\n")
    expect(scripts).not.toMatch(/\bfetch\s*\(/)
    expect(scripts).not.toMatch(/XMLHttpRequest|WebSocket|\beval\s*\(|new Function|import\s*\(\s*["']https?:/)
    const popup = readFileSync(join(root, "public", manifest.action.default_popup), "utf8")
    expect(popup).toContain(`Version ${manifest.version}`)
    expect(popup).not.toMatch(/local dev/i)
  })

  it("ships a complete, consistent privacy and listing packet", () => {
    const privacy = readFileSync(join(root, "public", "extension-privacy.html"), "utf8")
    expect(privacy).toContain("website content and narrowly scoped browsing activity")
    expect(privacy).toContain("makes no external network requests")
    expect(privacy).toContain("Chrome Web Store User Data Policy")
    expect(privacy).toContain("Limited Use requirements")
    expect(privacy).toContain('href="/extension-support"')
    const support = readFileSync(join(root, "public", "extension-support.html"), "utf8")
    expect(support).toContain('href="/extension-privacy"')
    const packet = readFileSync(join(root, "docs", "chrome-web-store-readiness.md"), "utf8")
    expect(packet).toContain("## Single purpose")
    expect(packet).toContain("## Host-access justifications")
    expect(packet).toContain("## Privacy-practices answers")
    expect(packet).toContain("drafty-draft-sync-0.0.0.10.zip")
    expect(packet).toContain("npm run extension:test:relay")
    expect(packet).toContain("npm run extension:test:clean-browser")
    expect(packet).toContain("npm run extension:smoke:production")
    expect(packet).toContain("npm run extension:bundle:store")
  })

  it("ships correctly sized promotional graphics", () => {
    const dimensions = file => {
      const png = readFileSync(join(root, "docs", "chrome-web-store", "assets", file))
      expect(png.subarray(1, 4).toString("ascii")).toBe("PNG")
      return {width: png.readUInt32BE(16), height: png.readUInt32BE(20)}
    }

    expect(dimensions("drafty-small-promo-440x280.png")).toEqual({width: 440, height: 280})
    expect(dimensions("drafty-marquee-1400x560.png")).toEqual({width: 1400, height: 560})
  })
})
