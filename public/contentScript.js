const CONNECTION_NAME = "ffDraftDashboard"
const FEED_VERSION = 1
const READ_INTERVAL_MS = 1_000
const KEEP_ALIVE_INTERVAL_MS = 5_000

const state = {
  port: null,
  reconnectTimer: null,
  workTimer: null,
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

const draftId = (platform, title) => `${platform}:${title}`

const sendSnapshot = (platform, title, picks) => {
  postToExtension(createEvent("draft-snapshot", {
    draft: {
      id: draftId(platform, title),
      title,
      platform,
      picks,
      capturedAt: Date.now(),
    },
  }))
}

const readEspnDraft = () => {
  const draftTitle =
    document.querySelector("h1.title")?.textContent?.trim() ||
    `ESPN Draft ${window.location.pathname}`
  const history =
    document.querySelector(".draft-columns .draft-column:nth-child(3) ul")
  const picks = []

  history?.querySelectorAll("li").forEach((draftPick) => {
    picks.push({
      imgUrl:
        draftPick
          .querySelector(".player-headshot img:not(fallback)")
          ?.getAttribute("src") || "",
      name:
        draftPick.querySelector(".playerinfo__playername")?.textContent?.trim() ||
        "",
      team:
        draftPick.querySelector(".playerinfo__playerteam")?.textContent?.trim() ||
        "",
      position:
        draftPick.querySelector(".playerinfo__playerpos")?.textContent?.trim() ||
        "",
      pick: draftPick.querySelector(".pick-info")?.textContent?.trim() || "",
    })
  })

  sendSnapshot("ESPN", draftTitle, picks)
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
  const draftRoot = await waitForElement('div[class="draft-columns"]')
  if (draftRoot) {
    readEspnDraft()
    scheduleWork(readEspnDraft, READ_INTERVAL_MS)
  }
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
  state.port.onDisconnect.addListener(() => {
    state.port = null
    window.clearTimeout(state.workTimer)
    window.clearTimeout(state.reconnectTimer)
    state.reconnectTimer = window.setTimeout(connect, 1_000)
  })
  startRole(role)
}

connect()
