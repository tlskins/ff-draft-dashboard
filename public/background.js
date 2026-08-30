importScripts("extensionSites.js")

const CONNECTION_NAME = "ffDraftDashboard"
const dashboardPorts = new Set()
const platformPorts = new Set()
const extensionSites = globalThis.DraftyExtensionSites

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

  const role = extensionSites?.roleForUrl(senderUrl)
  if (role === "espn" || role === "nfl") {
    platformPorts.add(port)
    port.onMessage.addListener(relayDraftEvent)
  } else if (role === "dashboard") {
    dashboardPorts.add(port)
    port.onMessage.addListener(() => port.postMessage(heartbeat()))
  } else {
    console.warn("Ignoring extension port outside approved Drafty sites")
    return
  }

  port.onDisconnect.addListener(() => removePort(port))
})
