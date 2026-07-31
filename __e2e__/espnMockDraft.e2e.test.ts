/** @jest-environment node */

import {
  mkdtemp,
  rm,
} from "node:fs/promises"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import {
  join,
  resolve,
} from "node:path"
import {
  spawn,
} from "node:child_process"
import type { ChildProcess } from "node:child_process"

import {
  loadAdvisorSnapshots,
  persistAdvisorSnapshots,
  persistDraftEvents,
} from "../behavior/api/draftSessions"
import type {
  DraftRecommendationSet,
} from "../behavior/draft-advisor/recommendations"
import type {
  OpponentForecast,
} from "../behavior/draft-advisor/types"
import {
  recordedEspnCanonicalEvents,
  recordedEspnReplay,
} from "../test-support/recordedEspnDraft"


const enabled = process.env.PHASE7_LIVE_API === "1"
const describeLive = enabled ? describe : describe.skip

const availablePort = async (): Promise<number> =>
  new Promise((resolvePort, reject) => {
    const server = createServer()
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      if (!address || typeof address === "string") {
        server.close()
        reject(new Error("Unable to allocate an E2E API port"))
        return
      }
      server.close(error => {
        if (error) reject(error)
        else resolvePort(address.port)
      })
    })
  })

const waitForApi = async (
  apiHost: string,
  process: ChildProcess,
  errorOutput: () => string,
): Promise<void> => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (process.exitCode !== null) {
      throw new Error(
        `Phase 7 API exited early: ${errorOutput()}`,
      )
    }
    try {
      const response = await fetch(`${apiHost}/health`)
      if (response.ok) return
    } catch {
      // The local server is still starting.
    }
    await new Promise(resolveWait => setTimeout(resolveWait, 100))
  }
  throw new Error(`Phase 7 API did not start: ${errorOutput()}`)
}

describeLive("Phase 7 ESPN mock draft live API acceptance", () => {
  let apiProcess: ChildProcess
  let apiHost: string
  let tempDirectory: string
  let stderr = ""

  const stopApi = async (): Promise<void> => {
    if (
      !apiProcess ||
      apiProcess.exitCode !== null ||
      apiProcess.signalCode !== null
    ) {
      return
    }
    const exited = new Promise<void>(resolveExit => {
      apiProcess.once("exit", () => resolveExit())
    })
    apiProcess.kill("SIGTERM")
    let stopTimeout: ReturnType<typeof setTimeout>
    const timedOut = new Promise<void>(resolveWait => {
      stopTimeout = setTimeout(resolveWait, 2_000)
    })
    await Promise.race([exited, timedOut])
    clearTimeout(stopTimeout!)
  }

  beforeAll(async () => {
    const apiRepository = resolve(
      process.cwd(),
      "..",
      "ff-draft-dashboard-python-api",
    )
    const python = join(apiRepository, ".venv", "bin", "python")
    const serverScript = join(
      apiRepository,
      "scripts",
      "run_phase7_e2e_server.py",
    )
    tempDirectory = await mkdtemp(
      join(tmpdir(), "drafty-phase7-"),
    )
    const port = await availablePort()
    apiHost = `http://127.0.0.1:${port}`
    apiProcess = spawn(
      python,
      [
        serverScript,
        "--port",
        String(port),
        "--directory",
        tempDirectory,
      ],
      {
        cwd: apiRepository,
        stdio: ["ignore", "ignore", "pipe"],
      },
    )
    apiProcess.stderr?.on("data", chunk => {
      stderr += chunk.toString()
    })
    await waitForApi(apiHost, apiProcess, () => stderr)
  }, 20_000)

  afterAll(async () => {
    await stopApi()
    if (tempDirectory) {
      await rm(tempDirectory, { recursive: true, force: true })
    }
  })

  it("round-trips a complete canonical mock and advisor snapshots", async () => {
    const { snapshot, events } = recordedEspnCanonicalEvents()

    await persistDraftEvents(events, { apiHost })
    await persistDraftEvents(events, { apiHost })

    const eventResponse = await fetch(
      `${apiHost}/v1/draft-sessions/${
        encodeURIComponent(snapshot.id)
      }/events`,
    )
    expect(eventResponse.ok).toBe(true)
    const eventPayload = await eventResponse.json()
    expect(eventPayload.events).toEqual(events)
    expect(eventPayload.events).toHaveLength(139)

    const rawSnapshotResponse = await fetch(
      `${apiHost}/v1/draft-sessions/${
        encodeURIComponent(snapshot.id)
      }/events`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events: [snapshot] }),
      },
    )
    expect(rawSnapshotResponse.status).toBe(400)
    const eventsAfterRejectedSnapshot = await fetch(
      `${apiHost}/v1/draft-sessions/${
        encodeURIComponent(snapshot.id)
      }/events`,
    )
    expect(eventsAfterRejectedSnapshot.ok).toBe(true)
    expect((await eventsAfterRejectedSnapshot.json()).events).toEqual(events)

    const recommendations: DraftRecommendationSet = {
      schemaVersion: 1,
      currentPick: 161,
      nextUserPick: 169,
      preferredView: "cross_position",
      viewExplanation: "Recorded mock is complete.",
      candidates: [],
    }
    const forecast: OpponentForecast = {
      schemaVersion: 1,
      model: "combined",
      targetRosterIndex: recordedEspnReplay.targetRosterIndex,
      picks: [],
      runProbabilities: [],
      tierBoundaryProbabilities: [],
    }
    await persistAdvisorSnapshots({
      sessionId: snapshot.id,
      sourceEventCount: events.length,
      inputFingerprint: "7e57a11c",
      generatedAt: "2026-07-30T23:00:00Z",
      recommendations,
      opponentForecast: forecast,
    }, { apiHost })

    const loaded = await loadAdvisorSnapshots(snapshot.id, { apiHost })
    expect(loaded.recommendations?.snapshot).toMatchObject({
      source_event_count: 139,
      input_fingerprint: "7e57a11c",
      current_pick: 161,
    })
    expect(loaded.opponentForecast?.snapshot).toMatchObject({
      source_event_count: 139,
      model: "combined",
      target_roster_index: 8,
    })
  }, 20_000)

  it("keeps the deterministic replay usable during an API outage", async () => {
    const beforeDisconnect = recordedEspnCanonicalEvents()
    await stopApi()

    await expect(persistDraftEvents(beforeDisconnect.events, {
      apiHost,
    })).rejects.toThrow()

    const offlineReplay = recordedEspnCanonicalEvents()
    expect(offlineReplay.events).toEqual(beforeDisconnect.events)
    expect(offlineReplay.events).toHaveLength(139)
  })
})
