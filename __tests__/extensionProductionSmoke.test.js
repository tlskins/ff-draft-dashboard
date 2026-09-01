const {runProductionSmoke} = require("../scripts/extension-production-smoke-lib.cjs")
const manifest = require("../public/manifest.json")

const response = (body, status = 200, contentType = "text/html; charset=utf-8") => ({
  ok: status >= 200 && status < 300,
  status,
  headers: {get: name => name.toLowerCase() === "content-type" ? contentType : null},
  text: async () => body,
})

const fixtureFetch = overrides => async url => {
  const path = new URL(url).pathname
  if (overrides?.[path]) return overrides[path]
  if (path === "/") return response("<title>Drafty</title>")
  if (path === "/manifest.json") return response(JSON.stringify(manifest), 200, "application/json")
  if (path === "/extension-privacy") return response('Chrome Web Store User Data Policy Limited Use requirements <a href="/extension-support">Support</a>')
  if (path === "/extension-support") return response('<a href="/extension-privacy">Privacy</a>')
  return response("not found", 404)
}

describe("production extension release smoke", () => {
  it("accepts a production origin whose release and disclosure boundary matches", async () => {
    await expect(runProductionSmoke({
      baseUrl: "https://drafty.friedchickentechnologies.com",
      expectedManifest: manifest,
      fetchImpl: fixtureFetch(),
    })).resolves.toMatchObject({
      version: "0.0.0.12",
      manifestMatches: true,
      limitedUseDisclosure: true,
      supportLinks: true,
    })
  })

  it("fails closed for HTTP, stale manifests, missing disclosures, and failed endpoints", async () => {
    await expect(runProductionSmoke({baseUrl: "http://example.test", expectedManifest: manifest, fetchImpl: fixtureFetch()})).rejects.toThrow("requires HTTPS")
    const stale = {...manifest, version: "0.0.0.9"}
    await expect(runProductionSmoke({
      baseUrl: "https://example.test", expectedManifest: manifest,
      fetchImpl: fixtureFetch({"/manifest.json": response(JSON.stringify(stale), 200, "application/json")}),
    })).rejects.toThrow("does not match")
    await expect(runProductionSmoke({
      baseUrl: "https://example.test", expectedManifest: manifest,
      fetchImpl: fixtureFetch({"/extension-privacy": response("No disclosure")}),
    })).rejects.toThrow("Limited Use")
    await expect(runProductionSmoke({
      baseUrl: "https://example.test", expectedManifest: manifest,
      fetchImpl: fixtureFetch({"/extension-support": response("not found", 404)}),
    })).rejects.toThrow("HTTP 404")
  })
})
