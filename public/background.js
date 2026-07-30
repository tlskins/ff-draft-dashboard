const CONNECTION_NAME = "ffDraftDashboard"
const dashboardPorts = new Set()
const platformPorts = new Set()

const isDraftPlatformUrl = (url) => {
  const normalizedUrl = url.toLowerCase()
  return (
    normalizedUrl.includes("fantasy.espn.com/football/draft") ||
    normalizedUrl.includes("fantasy.nfl.com/draftclient")
  )
}

const removePort = (port) => {
  dashboardPorts.delete(port)
  platformPorts.delete(port)
}

const relayDraftEvent = (event) => {
  dashboardPorts.forEach((dashboardPort) => {
    try {
      dashboardPort.postMessage(event)
    } catch (error) {
      console.warn("Unable to relay draft event", error)
      removePort(dashboardPort)
    }
  })
}

const heartbeat = () => ({
  version: 1,
  kind: "heartbeat",
  sentAt: Date.now(),
})

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== CONNECTION_NAME) {
    return
  }

  const senderUrl = port.sender?.url
  const tabId = port.sender?.tab?.id
  if (!senderUrl || tabId == null) {
    console.warn("Ignoring extension port without a tab URL")
    return
  }

  if (isDraftPlatformUrl(senderUrl)) {
    platformPorts.add(port)
    port.onMessage.addListener(relayDraftEvent)
  } else {
    dashboardPorts.add(port)
    port.onMessage.addListener(() => port.postMessage(heartbeat()))
  }

  port.onDisconnect.addListener(() => removePort(port))
})
