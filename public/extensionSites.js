(function initializeDraftyExtensionSites(root, factory) {
  const sites = factory()
  if (typeof module === "object" && module.exports) module.exports = sites
  root.DraftyExtensionSites = sites
}(typeof globalThis === "object" ? globalThis : this, () => {
  const dashboardOrigins = Object.freeze([
    "https://drafty.friedchickentechnologies.com",
    "https://ff-draft-dashboard.vercel.app",
  ])

  const roleForUrl = (value) => {
    let url
    try {
      url = new URL(value)
    } catch {
      return null
    }
    if (
      url.protocol === "https:"
      && url.hostname === "fantasy.espn.com"
      && url.pathname.startsWith("/football/draft")
    ) return "espn"
    if (
      url.protocol === "https:"
      && url.hostname === "fantasy.nfl.com"
      && url.pathname.startsWith("/draftclient")
    ) return "nfl"
    return dashboardOrigins.includes(url.origin) ? "dashboard" : null
  }

  return Object.freeze({dashboardOrigins, roleForUrl})
}))
