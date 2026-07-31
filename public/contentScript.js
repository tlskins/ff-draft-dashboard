const CONNECTION_NAME = "ffDraftDashboard"
const FEED_VERSION = 1
const READ_INTERVAL_MS = 1_000
const KEEP_ALIVE_INTERVAL_MS = 5_000
const HEALTH_REPORT_INTERVAL_MS = 30_000
const espnExtractor = globalThis.DraftyEspnExtractor

const state = {
  port: null,
  reconnectTimer: null,
  workTimer: null,
  lastEspnHealthFingerprint: null,
  lastEspnHealthSentAt: 0,
}

const sleep = (milliseconds) =>
  new Promise((resolve) => window.setTimeout(resolve, milliseconds))

const waitForElement = async (selector, timeout = 30_000) => {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeout) {
    const element = document.querySelector(selector)
    if (element) {
      return element
    }
    await sleep(500)
  }
  return null
}

const createEvent = (kind, details = {}) => ({
  version: FEED_VERSION,
  kind,
  sentAt: Date.now(),
  ...details,
})

const postToExtension = (message) => {
  if (!state.port) {
    return
  }

  try {
    state.port.postMessage(message)
  } catch (error) {
    console.warn("Unable to send extension message", error)
  }
}

const draftId = (platform, title) => {
  if (platform === "ESPN") {
    const leagueId = new URL(window.location.href).searchParams.get("leagueId")
    if (leagueId) return `${platform}:${leagueId}`
  }
  return `${platform}:${title}`
}

const sendSnapshot = (platform, title, picks, details = {}) => {
  postToExtension(createEvent("draft-snapshot", {
    draft: {
      id: draftId(platform, title),
      title,
      platform,
      picks,
      capturedAt: Date.now(),
      sourceUrl: window.location.href,
      ...details,
    },
  }))
}

const espnHealthFingerprint = (health) => JSON.stringify([
  health.status,
  health.mode,
  health.issues,
  health.checks.map((check) => [
    check.name,
    check.matched,
    check.healthy,
  ]),
])

const reportEspnHealth = (health) => {
  const fingerprint = espnHealthFingerprint(health)
  const now = Date.now()
  const changed = fingerprint !== state.lastEspnHealthFingerprint
  const reportDue =
    now - state.lastEspnHealthSentAt >= HEALTH_REPORT_INTERVAL_MS
  if (!changed && !reportDue) return

  state.lastEspnHealthFingerprint = fingerprint
  state.lastEspnHealthSentAt = now
  postToExtension(createEvent("source-health", { health }))
  if (changed && health.status !== "healthy") {
    console.warn("ESPN draft selector health changed", health)
  }
}

const readEspnDraftMetadata = (title) => {
  const teamCount = Number.parseInt(
    title.match(/\b(\d+)-Team\b/i)?.[1] || "",
    10,
  )
  const teamIdText = new URL(window.location.href)
    .searchParams.get("teamId")
  const teamId = teamIdText && /^[1-9]\d*$/.test(teamIdText)
    ? Number(teamIdText)
    : Number.NaN
  const targetRosterIndex = Number.isSafeInteger(teamCount)
    && teamCount > 0
    && Number.isSafeInteger(teamId)
    && teamId <= teamCount
    ? teamId - 1
    : null
  return {
    numTeams: Number.isFinite(teamCount) ? teamCount : undefined,
    targetRosterIndex,
    scoringFormat: /\bPPR\b/i.test(title)
      ? "PPR"
      : /\bStandard\b/i.test(title)
        ? "STANDARD"
        : null,
  }
}

const readEspnDraft = () => {
  if (!espnExtractor) {
    console.warn("ESPN draft extractor is unavailable")
    return
  }
  const extraction = espnExtractor.inspectEspnDraft(document)
  reportEspnHealth(extraction.health)
  if (
    extraction.health.mode === "unavailable" ||
    extraction.health.mode === "waiting"
  ) {
    return
  }

  const draftTitle = extraction.title ||
    `ESPN Draft ${window.location.pathname}`
  const draftMetadata = readEspnDraftMetadata(draftTitle)
  if (extraction.completion) {
    sendSnapshot("ESPN", draftTitle, extraction.preferredPicks, {
      ...draftMetadata,
      completion: extraction.completion,
    })
    return
  }

  sendSnapshot(
    "ESPN",
    draftTitle,
    extraction.preferredPicks,
    draftMetadata,
  )
}

const readNflDraft = () => {
  const picks = []
  document
    .querySelectorAll(
      'div[data-testid="table"] div[data-testid="tableRow"]',
    )
    .forEach((draftPick) => {
      if (!draftPick.querySelector('div[data-testid="playerAvatar"]')) {
        return
      }

      const cells = draftPick.querySelectorAll('div[data-testid="tableCell"]')
      const playerParts = cells[2]?.querySelectorAll("button > div > div")
      const teamAndPosition =
        playerParts?.[2]?.textContent?.split(" - ") || []
      const pick = Number.parseInt(cells[1]?.textContent || "", 10)
      if (!pick || !playerParts?.[1]) {
        return
      }

      picks.push({
        name: playerParts[1].textContent?.trim() || "",
        team: teamAndPosition[0] || "",
        position: teamAndPosition[1] || "",
        pick,
      })
    })

  const title = `NFL.com Draft ${window.location.pathname}`
  sendSnapshot("NFL", title, picks)
}

const scheduleWork = (work, delay) => {
  window.clearTimeout(state.workTimer)
  state.workTimer = window.setTimeout(() => {
    work()
    scheduleWork(work, delay)
  }, delay)
}

const startEspnReader = async () => {
  await waitForElement(
    espnExtractor?.selectors.draftRoot || ".draft-columns",
  )
  readEspnDraft()
  scheduleWork(readEspnDraft, READ_INTERVAL_MS)
}

const startNflReader = async () => {
  const draftRoot = await waitForElement('div[data-testid="table"]')
  if (draftRoot) {
    readNflDraft()
    scheduleWork(readNflDraft, READ_INTERVAL_MS)
  }
}

const startDashboardListener = () => {
  state.port?.onMessage.addListener((event) => {
    window.postMessage(
      { type: "FF_DRAFT_DASHBOARD", payload: event },
      window.location.origin,
    )
  })

  const keepAlive = () => {
    postToExtension(createEvent("dashboard-heartbeat"))
    scheduleWork(keepAlive, KEEP_ALIVE_INTERVAL_MS)
  }
  keepAlive()
}

const getPageRole = () => {
  const url = window.location.href.toLowerCase()
  if (url.includes("fantasy.espn.com/football/draft")) {
    return "espn"
  }
  if (url.includes("fantasy.nfl.com/draftclient")) {
    return "nfl"
  }
  if (url.includes("localhost") || url.includes("ff-draft-dashboard")) {
    return "dashboard"
  }
  return null
}

const startRole = (role) => {
  if (role === "espn") {
    void startEspnReader()
  } else if (role === "nfl") {
    void startNflReader()
  } else if (role === "dashboard") {
    startDashboardListener()
  }
}

const connect = () => {
  const role = getPageRole()
  if (!role) {
    return
  }

  state.port = chrome.runtime.connect({ name: CONNECTION_NAME })
  state.lastEspnHealthFingerprint = null
  state.lastEspnHealthSentAt = 0
  state.port.onDisconnect.addListener(() => {
    state.port = null
    window.clearTimeout(state.workTimer)
    window.clearTimeout(state.reconnectTimer)
    state.reconnectTimer = window.setTimeout(connect, 1_000)
  })
  startRole(role)
}

connect()
