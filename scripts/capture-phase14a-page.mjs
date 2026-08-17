import {spawn} from "node:child_process"
import {mkdtemp, rm, writeFile} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"

const [url, outputPath, widthText = "1440", heightText = "900"] =
  process.argv.slice(2)

if (!url || !outputPath) {
  console.error("Usage: node scripts/capture-phase14a-page.mjs <url> <output.png> [width] [height]")
  process.exit(1)
}

const width = Number(widthText)
const height = Number(heightText)
if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
  throw new Error("Viewport width and height must be positive integers")
}

const chromePath = process.env.CHROME_PATH
  || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
const profilePath = await mkdtemp(join(tmpdir(), "drafty-phase14a-chrome-"))
const chrome = spawn(chromePath, [
  "--headless=new",
  "--disable-gpu",
  "--hide-scrollbars",
  "--force-device-scale-factor=1",
  "--remote-debugging-port=0",
  `--user-data-dir=${profilePath}`,
  "about:blank",
], {stdio: ["ignore", "ignore", "pipe"]})

const browserEndpoint = await new Promise((resolve, reject) => {
  let stderr = ""
  const timer = setTimeout(() => reject(new Error(
    `Timed out waiting for headless Chrome. ${stderr}`,
  )), 10_000)
  chrome.stderr.setEncoding("utf8")
  chrome.stderr.on("data", chunk => {
    stderr += chunk
    const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/)
    if (!match) return
    clearTimeout(timer)
    resolve(match[1])
  })
  chrome.once("error", error => {
    clearTimeout(timer)
    reject(error)
  })
})

const port = new URL(browserEndpoint).port
const targetResponse = await fetch(
  `http://127.0.0.1:${port}/json/new?${encodeURIComponent("about:blank")}`,
  {method: "PUT"},
)
if (!targetResponse.ok) {
  throw new Error(`Unable to create Chrome target: ${targetResponse.status}`)
}
const target = await targetResponse.json()
const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, {once: true})
  socket.addEventListener("error", reject, {once: true})
})

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
  waiters.forEach(resolve => resolve(message.params))
})

const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++commandId
  pending.set(id, {resolve, reject})
  socket.send(JSON.stringify({id, method, params}))
})
const waitForEvent = method => new Promise(resolve => {
  eventWaiters.set(method, [...(eventWaiters.get(method) || []), resolve])
})

try {
  await send("Page.enable")
  await send("Runtime.enable")
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
    screenWidth: width,
    screenHeight: height,
  })
  const loaded = waitForEvent("Page.loadEventFired")
  await send("Page.navigate", {url})
  await loaded
  await new Promise(resolve => setTimeout(resolve, 1_000))
  const viewport = await send("Runtime.evaluate", {
    expression: "({width: window.innerWidth, height: window.innerHeight, devicePixelRatio: window.devicePixelRatio, readyState: document.readyState})",
    returnByValue: true,
  })
  const capture = await send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  })
  await writeFile(outputPath, Buffer.from(capture.data, "base64"))
  console.log(JSON.stringify({url, outputPath, viewport: viewport.result.value}))
} finally {
  socket.close()
  chrome.kill("SIGTERM")
  await rm(profilePath, {recursive: true, force: true})
}
