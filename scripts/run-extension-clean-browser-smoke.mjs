#!/usr/bin/env node

import {spawn, spawnSync} from "node:child_process"
import {access, mkdir, mkdtemp, rename, rm, writeFile} from "node:fs/promises"
import {tmpdir} from "node:os"
import {dirname, join, resolve} from "node:path"
import {fileURLToPath} from "node:url"
import {readFileSync} from "node:fs"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const manifest = JSON.parse(readFileSync(join(root, "public", "manifest.json"), "utf8"))
const archive = join(root, `ext_release_${manifest.version.replaceAll(".", "_")}.zip`)
const productionUrl = "https://drafty.friedchickentechnologies.com/"
const temporaryRoot = await mkdtemp(join(tmpdir(), "drafty-clean-extension-"))
const extensionDir = join(temporaryRoot, "extension")
const profileDir = join(temporaryRoot, "profile")
const sockets = new Set()
let chrome

const chromeForTestingPlatform = () => {
  if (process.platform === "darwin" && process.arch === "arm64") return "mac-arm64"
  if (process.platform === "darwin" && process.arch === "x64") return "mac-x64"
  if (process.platform === "linux" && process.arch === "x64") return "linux64"
  if (process.platform === "win32" && process.arch === "x64") return "win64"
  throw new Error(`No Chrome for Testing mapping for ${process.platform}/${process.arch}`)
}

const chromeExecutable = (directory, platform) => {
  if (platform.startsWith("mac-")) {
    return join(
      directory,
      `chrome-${platform}`,
      "Google Chrome for Testing.app",
      "Contents",
      "MacOS",
      "Google Chrome for Testing",
    )
  }
  if (platform === "linux64") return join(directory, "chrome-linux64", "chrome")
  return join(directory, "chrome-win64", "chrome.exe")
}

const exists = async path => access(path).then(() => true).catch(() => false)

const resolveChromePath = async () => {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH
  const installedChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  const installedVersion = spawnSync(installedChrome, ["--version"], {
    encoding: "utf8",
    shell: false,
  }).stdout?.match(/(\d+)\./)?.[1]
  const metadataUrl = installedVersion
    ? "https://googlechromelabs.github.io/chrome-for-testing/latest-versions-per-milestone-with-downloads.json"
    : "https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json"
  const metadataResponse = await fetch(metadataUrl)
  if (!metadataResponse.ok) throw new Error(`Chrome for Testing metadata returned ${metadataResponse.status}`)
  const metadata = await metadataResponse.json()
  const stable = installedVersion
    ? metadata.milestones?.[installedVersion]
    : metadata.channels?.Stable
  const platform = chromeForTestingPlatform()
  const download = stable?.downloads?.chrome?.find(candidate => candidate.platform === platform)
  if (!stable?.version || !download?.url) throw new Error(`Stable Chrome for Testing has no ${platform} download`)
  const cacheRoot = join(root, "node_modules", ".cache", "drafty-chrome-for-testing")
  const versionDir = join(cacheRoot, stable.version, platform)
  const executable = chromeExecutable(versionDir, platform)
  if (await exists(executable)) return executable
  if (process.env.DRAFTY_INSTALL_CHROME_FOR_TESTING === "0") {
    throw new Error(`Chrome for Testing ${stable.version} is not cached; rerun without DRAFTY_INSTALL_CHROME_FOR_TESTING=0`)
  }
  await mkdir(cacheRoot, {recursive: true})
  const staging = join(cacheRoot, `.staging-${stable.version}-${platform}`)
  const zipPath = join(cacheRoot, `.download-${stable.version}-${platform}.zip`)
  await rm(staging, {recursive: true, force: true})
  await rm(zipPath, {force: true})
  const archiveResponse = await fetch(download.url)
  if (!archiveResponse.ok) throw new Error(`Chrome for Testing download returned ${archiveResponse.status}`)
  await writeFile(zipPath, Buffer.from(await archiveResponse.arrayBuffer()))
  await mkdir(staging, {recursive: true})
  const unzip = spawnSync("unzip", ["-q", zipPath, "-d", staging], {encoding: "utf8", shell: false})
  if (unzip.status !== 0 || unzip.error) {
    throw new Error(`Unable to extract Chrome for Testing: ${unzip.error?.message || unzip.stderr}`)
  }
  await mkdir(dirname(versionDir), {recursive: true})
  await rename(staging, versionDir)
  await rm(zipPath, {force: true})
  if (!await exists(executable)) throw new Error(`Chrome for Testing executable missing after extraction: ${executable}`)
  return executable
}

const wait = milliseconds => new Promise(resolvePromise => setTimeout(resolvePromise, milliseconds))
const withTimeout = (promise, milliseconds, message) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error(message)), milliseconds)),
])

const connectTarget = async target => {
  const socket = new WebSocket(target.webSocketDebuggerUrl)
  sockets.add(socket)
  await withTimeout(new Promise((resolvePromise, reject) => {
    socket.addEventListener("open", resolvePromise, {once: true})
    socket.addEventListener("error", reject, {once: true})
  }), 10_000, `Timed out connecting to ${target.url}`)
  let commandId = 0
  const pending = new Map()
  const eventWaiters = new Map()
  socket.addEventListener("message", event => {
    const message = JSON.parse(event.data)
    if (message.id) {
      const callback = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) callback?.reject(new Error(message.error.message))
      else callback?.resolve(message.result)
      return
    }
    const waiters = eventWaiters.get(message.method) || []
    eventWaiters.delete(message.method)
    waiters.forEach(resolvePromise => resolvePromise(message.params))
  })
  const send = (method, params = {}) => new Promise((resolvePromise, reject) => {
    const id = ++commandId
    pending.set(id, {resolve: resolvePromise, reject})
    socket.send(JSON.stringify({id, method, params}))
  })
  const waitForEvent = method => new Promise(resolvePromise => {
    eventWaiters.set(method, [...(eventWaiters.get(method) || []), resolvePromise])
  })
  return {send, waitForEvent}
}

const createTarget = async (port, url) => {
  const response = await fetch(
    `http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`,
    {method: "PUT"},
  )
  if (!response.ok) throw new Error(`Unable to create Chrome target: ${response.status}`)
  return response.json()
}

const targetList = async port => {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`)
  if (!response.ok) throw new Error(`Unable to list Chrome targets: ${response.status}`)
  return response.json()
}

const evaluate = async (client, expression) => {
  const result = await client.send("Runtime.evaluate", {expression, returnByValue: true})
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Chrome evaluation failed")
  return result.result.value
}

const waitForValue = async (read, predicate, description, attempts = 60) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const value = await read()
    if (predicate(value)) return value
    await wait(250)
  }
  throw new Error(`Timed out waiting for ${description}`)
}

const navigate = async (client, url) => {
  const loaded = client.waitForEvent("Page.loadEventFired")
  await client.send("Page.navigate", {url})
  await withTimeout(loaded, 30_000, `Timed out loading ${url}`)
}

try {
  const chromePath = await resolveChromePath()
  const unzip = spawnSync("unzip", ["-q", archive, "-d", extensionDir], {
    encoding: "utf8",
    shell: false,
  })
  if (unzip.status !== 0 || unzip.error) {
    throw new Error(`Unable to extract ${archive}: ${unzip.error?.message || unzip.stderr}`)
  }
  const chromeArguments = [
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--window-position=-10000,-10000",
    "--window-size=800,600",
    "--remote-debugging-port=0",
    `--user-data-dir=${profileDir}`,
    `--disable-extensions-except=${extensionDir}`,
    `--load-extension=${extensionDir}`,
    "about:blank",
  ]
  if (process.env.DRAFTY_CHROME_HEADLESS === "1") chromeArguments.unshift("--headless=new")
  chrome = spawn(chromePath, chromeArguments, {stdio: ["ignore", "ignore", "pipe"]})
  const browserEndpoint = await withTimeout(new Promise((resolvePromise, reject) => {
    let stderr = ""
    chrome.stderr.setEncoding("utf8")
    chrome.stderr.on("data", chunk => {
      stderr += chunk
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/)
      if (match) resolvePromise(match[1])
    })
    chrome.once("error", reject)
    chrome.once("exit", code => reject(new Error(`Chrome exited before startup (${code}): ${stderr}`)))
  }), 30_000, "Timed out waiting for clean Chrome")
  const port = new URL(browserEndpoint).port

  const dashboardTarget = await createTarget(port, "about:blank")
  const dashboard = await connectTarget(dashboardTarget)
  await dashboard.send("Page.enable")
  await dashboard.send("Runtime.enable")
  await dashboard.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `globalThis.__draftyExtensionEvents = [];
      addEventListener("message", event => {
        if (event.data?.type === "FF_DRAFT_DASHBOARD") {
          globalThis.__draftyExtensionEvents.push(event.data.payload);
        }
      });`,
  })
  await navigate(dashboard, productionUrl)
  const heartbeat = await waitForValue(
    () => evaluate(dashboard, "globalThis.__draftyExtensionEvents || []"),
    events => events.some(event => event?.kind === "heartbeat" && event?.version === 1),
    "the packaged extension heartbeat on production",
    80,
  )
  const serviceWorker = await waitForValue(
    async () => (await targetList(port)).find(target => (
      target.type === "service_worker"
      && /^chrome-extension:\/\/[^/]+\/background\.js$/.test(target.url)
    )),
    Boolean,
    "the Manifest V3 service worker",
  )
  const extensionId = new URL(serviceWorker.url).host

  const popupTarget = await createTarget(port, `chrome-extension://${extensionId}/popup.html`)
  const popup = await connectTarget(popupTarget)
  await popup.send("Page.enable")
  await popup.send("Runtime.enable")
  const popupEvidence = await waitForValue(
    () => evaluate(popup, "({title: document.title, text: document.body?.innerText || '', ready: document.readyState})"),
    value => value.ready === "complete" && value.text.includes(`Version ${manifest.version}`),
    "the packaged extension popup",
  )

  const unmatchedTarget = await createTarget(port, "about:blank")
  const unmatched = await connectTarget(unmatchedTarget)
  await unmatched.send("Page.enable")
  await unmatched.send("Runtime.enable")
  await unmatched.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `globalThis.__draftyExtensionEvents = [];
      addEventListener("message", event => {
        if (event.data?.type === "FF_DRAFT_DASHBOARD") globalThis.__draftyExtensionEvents.push(event.data.payload);
      });`,
  })
  await navigate(unmatched, "https://example.com/")
  await wait(2_000)
  const unmatchedEvents = await evaluate(unmatched, "globalThis.__draftyExtensionEvents || []")
  if (unmatchedEvents.length !== 0) throw new Error("The packaged extension injected into an unmatched site")

  console.log(JSON.stringify({
    status: "passed",
    chrome_path: chromePath,
    extension_version: manifest.version,
    archive,
    package_extracted_to_temporary_profile: true,
    service_worker: "background.js",
    popup: {
      title: popupEvidence.title,
      version_visible: popupEvidence.text.includes(`Version ${manifest.version}`),
    },
    production_dashboard: {
      url: productionUrl,
      heartbeat_version: heartbeat.find(event => event?.kind === "heartbeat")?.version,
    },
    unmatched_origin_events: unmatchedEvents.length,
    limitations: [
      "No fantasy-provider login, draft room, live pick, or human-visible judgment is exercised.",
      "This account-free smoke does not replace installed-package Chrome Web Store acceptance.",
    ],
  }, null, 2))
} finally {
  for (const socket of sockets) socket.close()
  if (chrome?.exitCode === null) {
    chrome.kill("SIGTERM")
    await Promise.race([
      new Promise(resolvePromise => chrome.once("exit", resolvePromise)),
      wait(2_000),
    ])
  }
  await rm(temporaryRoot, {recursive: true, force: true, maxRetries: 5, retryDelay: 100})
}
