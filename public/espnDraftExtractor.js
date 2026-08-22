(function initializeEspnDraftExtractor(root, factory) {
  const extractor = factory()
  if (typeof module === "object" && module.exports) {
    module.exports = extractor
  }
  root.DraftyEspnExtractor = extractor
}(typeof globalThis === "object" ? globalThis : this, () => {
  const SELECTOR_VERSION = 2
  const selectors = Object.freeze({
    draftRoot: ".draft-columns",
    title: "h1.title",
    historyContainer:
      ".draft-columns .draft-column:nth-child(3) ul",
    historyRows:
      ".draft-columns .draft-column:nth-child(3) ul > li",
    historyHeadshot: ".player-headshot img:not(fallback)",
    historyName: ".playerinfo__playername",
    historyTeam: ".playerinfo__playerteam",
    historyPosition: ".playerinfo__playerpos",
    historyCoordinate: ".pick-info",
    boardHeaders: ".draft-board-grid-header-cell",
    boardCells: ".draft-board-grid-pick-cell",
    completedCells: ".draft-board-grid-pick-cell.completedPick",
    boardCoordinate: ".roundPick",
    boardFirstName: ".playerFirstName",
    boardLastName: ".playerLastName",
    boardTeam: ".playerProTeam",
    boardPosition: ".positionPill",
  })

  const text = (element, selector) =>
    element.querySelector(selector)?.textContent?.trim() || ""

  const espnPickCoordinate = (pick) => {
    const match = pick.pick.match(/^R(\d+), P(\d+)\b/)
    return match ? `${match[1]}:${match[2]}` : null
  }

  const readHistoryPick = (draftPick) => ({
    imgUrl:
      draftPick
        .querySelector(selectors.historyHeadshot)
        ?.getAttribute("src") || "",
    name: text(draftPick, selectors.historyName),
    team: text(draftPick, selectors.historyTeam),
    position: text(draftPick, selectors.historyPosition),
    pick: text(draftPick, selectors.historyCoordinate),
  })

  const isCompletePick = (pick) =>
    Boolean(
      pick.name &&
      pick.team &&
      pick.position &&
      espnPickCoordinate(pick),
    )

  const readBoardSchedule = (headers, boardCells) => {
    if (headers.length === 0 || boardCells.length === 0) return null

    const coordinates = new Set()
    let numRounds = 0
    let invalidCellCount = 0
    boardCells.forEach((cell) => {
      const match = text(cell, selectors.boardCoordinate)
        .match(/^(\d+)\.(\d+)$/)
      if (!match) {
        invalidCellCount += 1
        return
      }
      const round = Number.parseInt(match[1], 10)
      const pickInRound = Number.parseInt(match[2], 10)
      if (
        round < 1
        || pickInRound < 1
        || pickInRound > headers.length
      ) {
        invalidCellCount += 1
        return
      }
      coordinates.add(`${round}:${pickInRound}`)
      numRounds = Math.max(numRounds, round)
    })

    const totalPicks = numRounds * headers.length
    const expectedCoordinates = new Set()
    for (let round = 1; round <= numRounds; round += 1) {
      for (let pickInRound = 1; pickInRound <= headers.length; pickInRound += 1) {
        expectedCoordinates.add(`${round}:${pickInRound}`)
      }
    }
    const complete =
      invalidCellCount === 0
      && boardCells.length === totalPicks
      && coordinates.size === totalPicks
      && expectedCoordinates.size === totalPicks
      && Array.from(expectedCoordinates).every((coordinate) =>
        coordinates.has(coordinate))

    return {
      complete,
      totalPicks,
      numRounds,
      invalidCellCount,
      cellCount: boardCells.length,
    }
  }

  const readCompletedBoard = (
    historyPicks,
    headers,
    completedCells,
    schedule,
    title,
  ) => {
    if (!schedule || completedCells.length === 0) {
      return null
    }

    const historyByPick = new Map()
    historyPicks.forEach((pick) => {
      const coordinate = espnPickCoordinate(pick)
      if (coordinate) historyByPick.set(coordinate, pick)
    })

    const picks = completedCells.flatMap((cell) => {
      const roundPick = text(cell, selectors.boardCoordinate)
      const coordinateMatch = roundPick.match(/^(\d+)\.(\d+)$/)
      if (!coordinateMatch) return []
      const round = Number.parseInt(coordinateMatch[1], 10)
      const pickInRound = Number.parseInt(coordinateMatch[2], 10)
      const coordinate = `${round}:${pickInRound}`
      const historyPick = historyByPick.get(coordinate)
      return [{
        imgUrl: historyPick?.imgUrl || "",
        name: [
          text(cell, selectors.boardFirstName),
          text(cell, selectors.boardLastName),
        ].filter(Boolean).join(" "),
        team: text(cell, selectors.boardTeam),
        position: text(cell, selectors.boardPosition),
        pick: `R${round}, P${pickInRound}`,
      }]
    }).sort((left, right) => {
      const leftMatch = left.pick.match(/^R(\d+), P(\d+)/)
      const rightMatch = right.pick.match(/^R(\d+), P(\d+)/)
      const leftOverall =
        (Number(leftMatch?.[1]) - 1) * headers.length
        + Number(leftMatch?.[2])
      const rightOverall =
        (Number(rightMatch?.[1]) - 1) * headers.length
        + Number(rightMatch?.[2])
      return leftOverall - rightOverall
    })
    const excludedPositions = Array.from(new Set(
      picks
        .map((pick) => pick.position)
        .filter((position) => position === "K" || position === "D/ST"),
    ))
    const targetRosterIndex = headers.findIndex((header) =>
      header.classList.contains("myTeam"))

    return {
      picks,
      completion: {
        // ESPN can render a fully populated row before the draft is done.
        // Never infer the draft length from completed cells: only the complete
        // scheduled grid is authoritative for total rounds and completion.
        complete:
          schedule.complete
          && schedule.totalPicks > 0
          && picks.length === schedule.totalPicks
          && picks.every(isCompletePick),
        totalPicks: schedule.totalPicks,
        numRounds: schedule.numRounds,
        numTeams: headers.length,
        platformRosterSize: schedule.numRounds,
        targetRosterIndex:
          targetRosterIndex >= 0 ? targetRosterIndex : null,
        excludedPositions,
        scoringFormat: /\b(?:Half|0\.5)[ -]?PPR\b/i.test(title)
          ? "HALF_PPR"
          : /\bPPR\b/i.test(title)
            ? "PPR"
          : /\bStandard\b/i.test(title)
            ? "STANDARD"
            : null,
      },
    }
  }

  const createCheck = (
    name,
    selector,
    matched,
    required,
    healthy = !required || matched > 0,
  ) => ({
    name,
    selector,
    matched,
    required,
    healthy,
  })

  const inspectEspnDraft = (
    document,
    checkedAt = Date.now(),
  ) => {
    const draftRoot = document.querySelector(selectors.draftRoot)
    const titleElement = document.querySelector(selectors.title)
    const title = titleElement?.textContent?.trim() || ""
    const historyContainer =
      document.querySelector(selectors.historyContainer)
    const historyRows = Array.from(
      document.querySelectorAll(selectors.historyRows),
    )
    const historyPicks = historyRows.map(readHistoryPick)
    const headers = Array.from(
      document.querySelectorAll(selectors.boardHeaders),
    )
    const boardCells = Array.from(
      document.querySelectorAll(selectors.boardCells),
    )
    const completedCells = Array.from(
      document.querySelectorAll(selectors.completedCells),
    )
    const boardSchedule = readBoardSchedule(headers, boardCells)
    const completedBoard = readCompletedBoard(
      historyPicks,
      headers,
      completedCells,
      boardSchedule,
      title,
    )
    const validHistoryRows =
      historyPicks.filter(isCompletePick).length
    const validCompletedCells =
      completedBoard?.picks.filter(isCompletePick).length || 0
    const mode = completedBoard?.completion.complete
      ? "completed-board"
      : historyContainer
        ? "live-history"
        : draftRoot
          ? "waiting"
          : "unavailable"
    const checks = [
      createCheck(
        "draft-root",
        selectors.draftRoot,
        draftRoot ? 1 : 0,
        true,
      ),
      createCheck(
        "draft-title",
        selectors.title,
        titleElement ? 1 : 0,
        true,
      ),
      createCheck(
        "pick-source",
        `${selectors.historyContainer} | ${selectors.boardCells}`,
        (historyContainer ? 1 : 0) + boardCells.length,
        Boolean(draftRoot),
      ),
      createCheck(
        "history-rows",
        selectors.historyRows,
        historyRows.length,
        false,
        historyRows.length === validHistoryRows,
      ),
      createCheck(
        "board-headers",
        selectors.boardHeaders,
        headers.length,
        boardCells.length > 0,
      ),
      createCheck(
        "scheduled-board-cells",
        selectors.boardCells,
        boardCells.length,
        boardCells.length > 0,
        !boardCells.length || Boolean(boardSchedule?.complete),
      ),
      createCheck(
        "completed-cells",
        selectors.completedCells,
        completedCells.length,
        false,
        completedCells.length === validCompletedCells,
      ),
    ]
    const issues = checks
      .filter((check) => !check.healthy)
      .map((check) => `${check.name}-unhealthy`)
    const status = !draftRoot
      ? "unavailable"
      : issues.length > 0
        ? "degraded"
        : "healthy"
    const preferredBoard =
      completedBoard?.completion.complete ? completedBoard : null

    return {
      title,
      historyPicks,
      completedBoard,
      preferredPicks: preferredBoard?.picks || historyPicks,
      // An incomplete scheduled board still owns completion. Passing its
      // explicit false flag downstream prevents eligible-history fallbacks
      // from falsely completing at a round boundary.
      completion: completedBoard?.completion || null,
      health: {
        selectorVersion: SELECTOR_VERSION,
        platform: "ESPN",
        status,
        mode,
        checkedAt,
        pickCount: preferredBoard?.picks.length || historyPicks.length,
        checks,
        issues,
      },
    }
  }

  return Object.freeze({
    SELECTOR_VERSION,
    selectors,
    espnPickCoordinate,
    inspectEspnDraft,
  })
}))
