const {dashboardOrigins, roleForUrl} = require("../public/extensionSites.js")

describe("Drafty extension site boundary", () => {
  it("recognizes both production dashboards and supported draft clients", () => {
    expect(dashboardOrigins).toEqual([
      "https://drafty.friedchickentechnologies.com",
      "https://ff-draft-dashboard.vercel.app",
    ])
    expect(roleForUrl("https://drafty.friedchickentechnologies.com/board")).toBe("dashboard")
    expect(roleForUrl("https://ff-draft-dashboard.vercel.app/")).toBe("dashboard")
    expect(roleForUrl("https://fantasy.espn.com/football/draft?leagueId=12")).toBe("espn")
    expect(roleForUrl("https://fantasy.nfl.com/draftclient/league/12")).toBe("nfl")
  })

  it("rejects localhost, insecure, malformed, and lookalike URLs", () => {
    expect(roleForUrl("http://localhost:3000/")).toBeNull()
    expect(roleForUrl("http://drafty.friedchickentechnologies.com/")).toBeNull()
    expect(roleForUrl("https://drafty.friedchickentechnologies.com.evil.test/")).toBeNull()
    expect(roleForUrl("https://fantasy.espn.com/football/players")).toBeNull()
    expect(roleForUrl("not a url")).toBeNull()
  })
})
