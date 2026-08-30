const vm = require("node:vm")

const signal = () => {
  const listeners = []
  return {
    addListener(listener) { listeners.push(listener) },
    emit(value) { listeners.slice().forEach(listener => listener(value)) },
    get size() { return listeners.length },
  }
}

const port = (url, {tabId = 1, failPost = false} = {}) => {
  const onMessage = signal()
  const onDisconnect = signal()
  const messages = []
  let postAttempts = 0
  return {
    name: "ffDraftDashboard",
    sender: {url, tab: tabId == null ? undefined : {id: tabId}},
    onMessage,
    onDisconnect,
    postMessage(message) {
      postAttempts += 1
      if (failPost) throw new Error("simulated disconnected port")
      messages.push(message)
    },
    evidence: {messages, get postAttempts() { return postAttempts }},
  }
}

const invariant = (condition, message) => {
  if (!condition) throw new Error(`Extension relay harness failed: ${message}`)
}

const runRelayHarness = ({readAsset, label}) => {
  const connectListeners = []
  const warnings = []
  const context = vm.createContext({
    URL,
    console: {warn: (...values) => warnings.push(values.map(String).join(" "))},
    chrome: {
      runtime: {
        onConnect: {addListener: listener => connectListeners.push(listener)},
      },
    },
  })
  context.globalThis = context
  context.importScripts = (...assets) => assets.forEach(asset => (
    vm.runInContext(readAsset(asset), context, {filename: `${label}:${asset}`})
  ))
  vm.runInContext(readAsset("background.js"), context, {filename: `${label}:background.js`})
  invariant(connectListeners.length === 1, "background registered exactly one connection listener")

  const connect = candidate => connectListeners[0](candidate)
  const primary = port("https://drafty.friedchickentechnologies.com/")
  const alias = port("https://ff-draft-dashboard.vercel.app/")
  const espn = port("https://fantasy.espn.com/football/draft?leagueId=42")
  const nfl = port("https://fantasy.nfl.com/draftclient/league/42")
  const lookalike = port("https://drafty.friedchickentechnologies.com.evil.test/")
  const missingTab = port("https://drafty.friedchickentechnologies.com/", {tabId: null})
  ;[primary, alias, espn, nfl, lookalike, missingTab].forEach(connect)

  primary.onMessage.emit({kind: "dashboard-heartbeat"})
  invariant(primary.evidence.messages.length === 1, "dashboard receives a heartbeat response")
  invariant(primary.evidence.messages[0].kind === "heartbeat", "heartbeat response has the stable kind")
  invariant(primary.evidence.messages[0].version === 1, "heartbeat response has version 1")
  primary.evidence.messages.length = 0

  const espnEvent = {version: 1, kind: "draft-snapshot", draft: {id: "ESPN:42", picks: [{pick: 1, name: "Player One"}]}}
  espn.onMessage.emit(espnEvent)
  invariant(primary.evidence.messages[0] === espnEvent, "ESPN event reaches the primary dashboard")
  invariant(alias.evidence.messages[0] === espnEvent, "ESPN event reaches the deployment alias")
  invariant(lookalike.evidence.messages.length === 0, "lookalike origin is not treated as a dashboard")

  alias.onDisconnect.emit()
  const nflEvent = {version: 1, kind: "draft-snapshot", draft: {id: "NFL:42", picks: [{pick: 2, name: "Player Two"}]}}
  nfl.onMessage.emit(nflEvent)
  invariant(primary.evidence.messages[1] === nflEvent, "NFL event reaches the connected dashboard")
  invariant(alias.evidence.messages.length === 1, "disconnected dashboard receives no later event")

  const failing = port("https://drafty.friedchickentechnologies.com/", {failPost: true})
  connect(failing)
  espn.onMessage.emit({version: 1, kind: "source-health"})
  const attemptsAfterFailure = failing.evidence.postAttempts
  espn.onMessage.emit({version: 1, kind: "source-health"})
  invariant(failing.evidence.postAttempts === attemptsAfterFailure, "failed dashboard port is removed before the next relay")

  invariant(lookalike.onDisconnect.size === 0, "rejected lookalike port is not retained")
  invariant(missingTab.onDisconnect.size === 0, "port without a tab is not retained")
  invariant(warnings.some(message => message.includes("outside approved Drafty sites")), "lookalike rejection is diagnosed")
  invariant(warnings.some(message => message.includes("without a tab URL")), "missing-tab rejection is diagnosed")
  invariant(warnings.some(message => message.includes("Unable to relay draft event")), "failed relay is diagnosed")

  return {
    label,
    dashboardOrigins: 2,
    platformRoles: 2,
    heartbeatVersion: 1,
    relayedSnapshots: 2,
    disconnectedPortSuppressed: true,
    failedPortRemoved: true,
    rejectedPorts: 2,
  }
}

module.exports = {runRelayHarness}
