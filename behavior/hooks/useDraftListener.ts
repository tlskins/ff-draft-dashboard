import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "react-toastify"
import {
  DraftSourceHealth,
  DraftSnapshot,
  normalizeDraftFeedMessage,
} from "../draft-feed/types"
import { mergeDraftSnapshots } from "../draft-feed/snapshots"
import {
  createDraftSessionReducerState,
  createFallbackPlayerFromDraftEvent,
  CanonicalDraftEvent,
  reduceDraftSnapshot,
} from "../draft-feed/session"
import {
  PlayerLibrary,
  PlayersByPositionAndTeam,
} from "../draft"
import { Player } from "../../types"
import { persistDraftEvents } from "../api/draftSessions"
import type {
  DraftCaptureConnectionState,
  DraftPersistenceBoundary,
  DraftSourceHealthFreshness,
} from "../boundaryState"

interface UseDraftListenerProps {
  playerLib: PlayerLibrary
  playersByPosByTeam: PlayersByPositionAndTeam
  settings: { numTeams: number }
  onDraftPlayer: (
    playerId: string,
    pickNum: number,
    fallbackPlayer?: Player,
    rosterIndex?: number,
  ) => void
  onDraftMetadata?: (snapshot: DraftSnapshot) => void
  setCurrPick: (pick: number) => void
  setDraftStarted: (started: boolean) => void
  /** Test and local-host seam; production keeps the default API adapter. */
  persistEvents?: (events: CanonicalDraftEvent[]) => Promise<void>
  apiPersistenceEnabled?: boolean
}

interface DraftDecision {
  listening: boolean | null
  acceptToastId: string | number
  rejectToastId: string | number
}

const LISTENER_STALE_AFTER_MS = 7_000
const SOURCE_HEALTH_STALE_AFTER_MS = 40_000
const MAX_PENDING_PERSISTENCE_EVENTS = 500

export const useDraftListener = ({
  playerLib,
  playersByPosByTeam,
  settings,
  onDraftPlayer,
  setCurrPick,
  setDraftStarted,
  onDraftMetadata,
  persistEvents = persistDraftEvents,
  apiPersistenceEnabled = Boolean(process.env.NEXT_PUBLIC_API_HOST),
}: UseDraftListenerProps) => {
  const decisions = useRef<Record<string, DraftDecision>>({})
  const pendingSnapshots = useRef<Record<string, DraftSnapshot>>({})
  const sessionState = useRef(createDraftSessionReducerState())
  const pendingPersistence = useRef<Record<string, CanonicalDraftEvent[]>>({})
  const persistenceInFlight = useRef<Record<string, boolean>>({})
  const persistenceFailed = useRef<Record<string, boolean>>({})
  const persistenceWasOffline = useRef<Record<string, boolean>>({})
  const recoveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastListenerAck = useRef<number | null>(null)
  const lastSourceHealthAck = useRef<number | null>(null)
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  const [activeDraftListenerTitle, setActiveDraftListenerTitle] =
    useState<string | null>(null)
  const [activeDraftSessionId, setActiveDraftSessionId] =
    useState<string | null>(null)
  const [activeDraftSnapshot, setActiveDraftSnapshot] =
    useState<DraftSnapshot | null>(null)
  const [listenerActive, setListenerActive] = useState(false)
  const [draftCaptureState, setDraftCaptureState] =
    useState<DraftCaptureConnectionState>("disconnected")
  const [draftSourceHealthFreshness, setDraftSourceHealthFreshness] =
    useState<DraftSourceHealthFreshness>("unknown")
  const [draftSourceHealth, setDraftSourceHealth] =
    useState<DraftSourceHealth | null>(null)
  const [draftPersistence, setDraftPersistence] =
    useState<DraftPersistenceBoundary>({
      state: "local",
      pendingEventCount: 0,
      error: null,
      canRetry: false,
    })

  const updatePersistence = useCallback((
    state: DraftPersistenceBoundary["state"],
    sessionId: string | null,
    error: string | null = null,
  ) => {
    const pendingEventCount = sessionId
      ? pendingPersistence.current[sessionId]?.length || 0
      : 0
    setDraftPersistence({
      state,
      pendingEventCount,
      error,
      canRetry: state === "offline" || state === "blocked",
    })
  }, [])

  const flushPersistence = useCallback(async (sessionId: string) => {
    if (
      !apiPersistenceEnabled
      || persistenceInFlight.current[sessionId]
      || persistenceFailed.current[sessionId]
    ) return
    if (!pendingPersistence.current[sessionId]?.length) return

    persistenceInFlight.current[sessionId] = true
    if (recoveryTimerRef.current) {
      clearTimeout(recoveryTimerRef.current)
      recoveryTimerRef.current = null
    }
    updatePersistence("syncing", sessionId)
    try {
      // A new ESPN snapshot can arrive while fetch is in flight. Drain every
      // batch that was locally queued before declaring the boundary healthy.
      while (pendingPersistence.current[sessionId]?.length) {
        const events = pendingPersistence.current[sessionId]
        await persistEvents(events)
        const queued = pendingPersistence.current[sessionId] || []
        const persistedIds = new Set(events.map(event => event.eventId))
        pendingPersistence.current[sessionId] = queued.filter(event =>
          !persistedIds.has(event.eventId))
      }
      const recovered = Boolean(persistenceWasOffline.current[sessionId])
      persistenceFailed.current[sessionId] = false
      persistenceWasOffline.current[sessionId] = false
      updatePersistence(recovered ? "recovered" : "local", sessionId)
      if (recovered) {
        recoveryTimerRef.current = setTimeout(() => {
          recoveryTimerRef.current = null
          updatePersistence("local", sessionId)
        }, 5_000)
      }
    } catch (error) {
      persistenceFailed.current[sessionId] = true
      persistenceWasOffline.current[sessionId] = true
      const message = error instanceof Error
        ? error.message
        : "Draft session API could not be reached"
      updatePersistence("offline", sessionId, message)
      console.warn("Draft events remain local because persistence failed", error)
    } finally {
      persistenceInFlight.current[sessionId] = false
    }
  }, [apiPersistenceEnabled, persistEvents, updatePersistence])

  const queuePersistence = useCallback((events: CanonicalDraftEvent[]) => {
    if (!events.length) return
    const sessionId = events[0].draftId
    if (!apiPersistenceEnabled) {
      updatePersistence("local", null)
      return
    }
    const queued = pendingPersistence.current[sessionId] || []
    const knownIds = new Set(queued.map(event => event.eventId))
    const additions = events.filter(event => !knownIds.has(event.eventId))
    if (queued.length + additions.length > MAX_PENDING_PERSISTENCE_EVENTS) {
      updatePersistence("blocked", sessionId,
        "Local sync queue is full. Export the draft replay before continuing.")
      return
    }
    pendingPersistence.current[sessionId] = [...queued, ...additions]
    updatePersistence("syncing", sessionId)
    void flushPersistence(sessionId)
  }, [apiPersistenceEnabled, flushPersistence, updatePersistence])

  const retryDraftPersistence = useCallback(() => {
    const sessionId = activeDraftSessionId
    if (!sessionId || !pendingPersistence.current[sessionId]?.length) return
    persistenceFailed.current[sessionId] = false
    void flushPersistence(sessionId)
  }, [activeDraftSessionId, flushPersistence])

  const applySnapshot = useCallback((snapshot: DraftSnapshot) => {
    setActiveDraftSnapshot(snapshot)
    const reduction = reduceDraftSnapshot(sessionState.current, snapshot, {
      numTeams: snapshot.numTeams || settingsRef.current.numTeams,
      playersByPositionAndTeam: playersByPosByTeam,
    })
    sessionState.current = reduction.state

    queuePersistence(reduction.events)

    reduction.events.forEach((event) => {
      const { playerId, overallPick } = event.pick
      const player = playerLib[playerId]
      if (player) {
        onDraftPlayer(
          playerId,
          overallPick,
          undefined,
          event.pick.rosterIndex,
        )
        toast(
          `Pick #${overallPick}: ${player.fullName} - ${player.position} - ${player.team}`,
          {
            type: "success",
            theme: "colored",
            position: "top-right",
          },
        )
        return
      }

      const fallbackPlayer = createFallbackPlayerFromDraftEvent(event)
      onDraftPlayer(
        playerId,
        overallPick,
        fallbackPlayer,
        event.pick.rosterIndex,
      )
      toast(
        `Pick #${overallPick}: ${fallbackPlayer.fullName} was added from the live draft but is missing ranking data`,
        {
          type: "warning",
          theme: "colored",
          position: "top-right",
        },
      )
    })

    if (reduction.lastProcessedPick !== null) {
      setCurrPick(reduction.lastProcessedPick + 1)
      setDraftStarted(true)
    }
  }, [
    onDraftPlayer,
    playerLib,
    playersByPosByTeam,
    queuePersistence,
    setCurrPick,
    setDraftStarted,
  ])

  const bufferSnapshot = useCallback((snapshot: DraftSnapshot) => {
    pendingSnapshots.current[snapshot.id] = mergeDraftSnapshots(
      pendingSnapshots.current[snapshot.id],
      snapshot,
    )
  }, [])

  const promptForDraft = useCallback((snapshot: DraftSnapshot) => {
    const acceptToastId = toast(`Listen to draft: ${snapshot.title}`, {
      autoClose: false,
      hideProgressBar: true,
      type: "success",
      theme: "colored",
      position: "top-right",
      containerId: "AcceptListenDraft",
      onClick: () => {
        const decision = decisions.current[snapshot.id]
        if (!decision) {
          return
        }

        decision.listening = true
        setActiveDraftListenerTitle(snapshot.title)
        setActiveDraftSessionId(snapshot.id)
        toast.dismiss(decision.rejectToastId)

        const pendingSnapshot = pendingSnapshots.current[snapshot.id]
        const acceptedSnapshot = pendingSnapshot || snapshot
        onDraftMetadata?.(acceptedSnapshot)
        if (pendingSnapshot) {
          applySnapshot(acceptedSnapshot)
          delete pendingSnapshots.current[snapshot.id]
        }
      },
    })

    const rejectToastId = toast(`Ignore draft: ${snapshot.title}`, {
      autoClose: false,
      hideProgressBar: true,
      type: "error",
      theme: "colored",
      position: "top-right",
      containerId: "RejectListenDraft",
      onClick: () => {
        const decision = decisions.current[snapshot.id]
        if (!decision) {
          return
        }

        decision.listening = false
        delete pendingSnapshots.current[snapshot.id]
        toast.dismiss(decision.acceptToastId)
      },
    })

    decisions.current[snapshot.id] = {
      listening: null,
      acceptToastId,
      rejectToastId,
    }
  }, [applySnapshot, onDraftMetadata])

  const processExtensionMessage = useCallback((event: MessageEvent) => {
    if (event.source !== window) {
      return
    }

    const feedEvent = normalizeDraftFeedMessage(event.data)
    if (!feedEvent) {
      return
    }

    lastListenerAck.current = Date.now()
    setListenerActive(true)
    setDraftCaptureState("live")

    if (feedEvent.kind === "heartbeat") {
      return
    }

    if (feedEvent.kind === "source-health") {
      lastSourceHealthAck.current = Date.now()
      setDraftSourceHealthFreshness("fresh")
      setDraftSourceHealth(feedEvent.health)
      return
    }

    if (Object.keys(playerLib).length === 0) {
      return
    }

    const { draft } = feedEvent
    const decision = decisions.current[draft.id]
    if (!decision) {
      bufferSnapshot(draft)
      promptForDraft(draft)
      return
    }

    if (decision.listening === null) {
      bufferSnapshot(draft)
      return
    }

    if (decision.listening) {
      // Reapply canonical source metadata for an already accepted draft. This
      // lets a hot-reloaded dashboard repair format state from the next ESPN
      // snapshot without asking the user to reconnect the source.
      onDraftMetadata?.(draft)
      applySnapshot(draft)
    }
  }, [applySnapshot, bufferSnapshot, onDraftMetadata, playerLib, promptForDraft])

  useEffect(() => {
    const checkListener = () => {
      const lastAck = lastListenerAck.current
      setListenerActive(
        lastAck !== null && Date.now() - lastAck <= LISTENER_STALE_AFTER_MS,
      )
      setDraftCaptureState(lastAck === null
        ? "disconnected"
        : Date.now() - lastAck <= LISTENER_STALE_AFTER_MS
          ? "live"
          : "stale")
      const lastHealthAck = lastSourceHealthAck.current
      setDraftSourceHealthFreshness(lastHealthAck === null
        ? "unknown"
        : Date.now() - lastHealthAck <= SOURCE_HEALTH_STALE_AFTER_MS
          ? "fresh"
          : "stale")
    }

    const interval = window.setInterval(checkListener, 2_000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    window.addEventListener("message", processExtensionMessage)
    return () => window.removeEventListener("message", processExtensionMessage)
  }, [processExtensionMessage])

  useEffect(() => () => {
    if (recoveryTimerRef.current) clearTimeout(recoveryTimerRef.current)
  }, [])

  return {
    listenerActive,
    draftCaptureState,
    draftSourceHealthFreshness,
    activeDraftListenerTitle,
    activeDraftSessionId,
    activeDraftSnapshot,
    draftSourceHealth,
    draftPersistence,
    retryDraftPersistence,
  }
}
