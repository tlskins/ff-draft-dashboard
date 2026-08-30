const canonical = value => {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
  return value
}

const manifestBoundary = manifest => canonical({
  manifest_version: manifest.manifest_version,
  name: manifest.name,
  description: manifest.description,
  version: manifest.version,
  content_scripts: manifest.content_scripts,
  permissions: manifest.permissions,
  host_permissions: manifest.host_permissions,
})

const runProductionSmoke = async ({baseUrl, expectedManifest, fetchImpl}) => {
  const base = new URL(baseUrl)
  if (base.protocol !== "https:") throw new Error("Production extension smoke requires HTTPS")
  const read = async path => {
    const url = new URL(path, base)
    const response = await fetchImpl(url)
    if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`)
    return {url: String(url), text: await response.text(), contentType: response.headers?.get?.("content-type") || null}
  }
  const [home, manifestResult, privacy, support] = await Promise.all([
    read("/"), read("/manifest.json"), read("/extension-privacy"), read("/extension-support"),
  ])
  const remoteManifest = JSON.parse(manifestResult.text)
  if (JSON.stringify(manifestBoundary(remoteManifest)) !== JSON.stringify(manifestBoundary(expectedManifest))) {
    throw new Error("Production extension manifest does not match the release source boundary")
  }
  if (!privacy.text.includes("Chrome Web Store User Data Policy") || !privacy.text.includes("Limited Use requirements")) {
    throw new Error("Production privacy policy is missing the Limited Use disclosure")
  }
  if (!privacy.text.includes('href="/extension-support"') || !support.text.includes('href="/extension-privacy"')) {
    throw new Error("Production privacy and support pages do not link to each other")
  }
  if (!home.text.includes("Drafty")) throw new Error("Production home page does not identify Drafty")
  return {
    baseUrl: base.origin,
    version: remoteManifest.version,
    endpoints: [home, manifestResult, privacy, support].map(result => ({url: result.url, contentType: result.contentType})),
    manifestMatches: true,
    limitedUseDisclosure: true,
    supportLinks: true,
  }
}

module.exports = {manifestBoundary, runProductionSmoke}
