const { readFileSync } = require("node:fs")
const { join } = require("node:path")

const {
  SELECTOR_VERSION,
  inspectEspnDraft,
} = require("../public/espnDraftExtractor")


const fixture = readFileSync(
  join(
    process.cwd(),
    "__tests__",
    "fixtures",
    "espn-draft-dom.html",
  ),
  "utf8",
)

describe("ESPN extension selector contract", () => {
  beforeEach(() => {
    document.body.innerHTML = fixture
  })

  const renderScheduledBoard = ({
    numTeams,
    numRounds,
    completedPicks,
  }) => {
    document.querySelector(".draft-board-grid").remove()
    const board = document.createElement("section")
    board.className = "draft-board-grid"
    for (let team = 1; team <= numTeams; team += 1) {
      const header = document.createElement("div")
      header.className = "draft-board-grid-header-cell"
      if (team === 1) header.classList.add("myTeam")
      header.textContent = `Team ${team}`
      board.append(header)
    }
    for (let round = 1; round <= numRounds; round += 1) {
      for (let pickInRound = 1; pickInRound <= numTeams; pickInRound += 1) {
        const overallPick = (round - 1) * numTeams + pickInRound
        const cell = document.createElement("div")
        cell.className = "draft-board-grid-pick-cell"
        if (overallPick <= completedPicks) {
          cell.classList.add("completedPick")
          cell.innerHTML = `
            <span class="roundPick">${round}.${pickInRound}</span>
            <span class="playerFirstName">Player</span>
            <span class="playerLastName">${overallPick}</span>
            <span class="playerProTeam">TST</span>
            <span class="positionPill">WR</span>
          `
        } else {
          // ESPN's scheduled grid exposes coordinates for blank future picks.
          cell.innerHTML = `<span class="roundPick">${round}.${pickInRound}</span>`
        }
        board.append(cell)
      }
    }
    document.querySelector("main").append(board)
  }

  it("extracts a completed board using the recorded DOM selectors", () => {
    const result = inspectEspnDraft(document, 123)

    expect(result.health).toMatchObject({
      selectorVersion: SELECTOR_VERSION,
      platform: "ESPN",
      status: "healthy",
      mode: "completed-board",
      checkedAt: 123,
      pickCount: 4,
      issues: [],
    })
    expect(result.preferredPicks.map(pick => pick.pick)).toEqual([
      "R1, P1",
      "R1, P2",
      "R2, P1",
      "R2, P2",
    ])
    expect(result.preferredPicks[0]).toMatchObject({
      imgUrl:
        "https://a.espncdn.com/i/headshots/nfl/players/full/4362628.png",
      name: "Ja'Marr Chase",
      team: "CIN",
      position: "WR",
    })
    expect(result.completion).toEqual({
      complete: true,
      totalPicks: 4,
      numRounds: 2,
      numTeams: 2,
      platformRosterSize: 2,
      targetRosterIndex: 0,
      excludedPositions: [],
      scoringFormat: "PPR",
    })
  })

  it("uses live history while the completed board is absent", () => {
    document.querySelector(".draft-board-grid").remove()

    const result = inspectEspnDraft(document, 456)

    expect(result.health).toMatchObject({
      status: "healthy",
      mode: "live-history",
      pickCount: 4,
    })
    expect(result.completion).toBeNull()
    expect(result.preferredPicks).toEqual(result.historyPicks)
  })

  it.each([
    [10, 16, 20],
    [12, 16, 24],
  ])("keeps a partial %i-team board live after a completed round boundary", (
    numTeams,
    numRounds,
    completedPicks,
  ) => {
    renderScheduledBoard({ numTeams, numRounds, completedPicks })

    const result = inspectEspnDraft(document)

    expect(result.health).toMatchObject({
      status: "healthy",
      mode: "live-history",
      pickCount: 4,
      issues: [],
    })
    expect(result.preferredPicks).toEqual(result.historyPicks)
    expect(result.completion).toMatchObject({
      complete: false,
      totalPicks: numTeams * numRounds,
      numRounds,
      numTeams,
      platformRosterSize: numRounds,
      targetRosterIndex: 0,
    })
  })

  it.each([10, 12])("preserves final authoritative metadata for a complete %i-team board", (
    numTeams,
  ) => {
    const numRounds = 16
    renderScheduledBoard({
      numTeams,
      numRounds,
      completedPicks: numTeams * numRounds,
    })

    const result = inspectEspnDraft(document)

    expect(result.health).toMatchObject({
      status: "healthy",
      mode: "completed-board",
      pickCount: numTeams * numRounds,
      issues: [],
    })
    expect(result.preferredPicks).toHaveLength(numTeams * numRounds)
    expect(result.completion).toMatchObject({
      complete: true,
      totalPicks: numTeams * numRounds,
      numRounds,
      numTeams,
      platformRosterSize: numRounds,
      targetRosterIndex: 0,
      scoringFormat: "PPR",
    })
  })

  it("distinguishes an empty draft from selector drift", () => {
    document.querySelector(".draft-board-grid").remove()
    document.querySelector(
      ".draft-columns .draft-column:nth-child(3) ul",
    ).replaceChildren()

    const waiting = inspectEspnDraft(document)
    expect(waiting.health).toMatchObject({
      status: "healthy",
      mode: "live-history",
      pickCount: 0,
    })

    document.querySelector(
      ".draft-columns .draft-column:nth-child(3)",
    ).replaceChildren()
    const drifted = inspectEspnDraft(document)
    expect(drifted.health.status).toBe("degraded")
    expect(drifted.health.issues).toContain("pick-source-unhealthy")
  })

  it("reports incomplete pick rows and a missing root explicitly", () => {
    document.querySelector(".pick-info").remove()
    const incomplete = inspectEspnDraft(document)
    expect(incomplete.health.status).toBe("degraded")
    expect(incomplete.health.issues).toContain("history-rows-unhealthy")

    document.querySelector(".draft-columns").remove()
    document.querySelector(".draft-board-grid").remove()
    const unavailable = inspectEspnDraft(document)
    expect(unavailable.health).toMatchObject({
      status: "unavailable",
      mode: "unavailable",
      pickCount: 0,
    })
    expect(unavailable.health.issues).toContain("draft-root-unhealthy")
  })

  it("loads the extractor before the content script in the manifest", () => {
    const manifest = require("../public/manifest.json")
    expect(manifest.version).toBe("0.0.0.8")
    expect(manifest.content_scripts[0].js).toEqual([
      "espnDraftExtractor.js",
      "contentScript.js",
    ])
  })
})
