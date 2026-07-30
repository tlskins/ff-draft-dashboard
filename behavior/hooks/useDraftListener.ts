import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "react-toastify"
import {
  parseEspnDraftPicks,
  parseNflDraftPicks,
  ParsedDraftPick,
} from "../draft-feed/parsers"
import {
  DraftSnapshot,
  EspnDraftPick,
  NflDraftPick,
  normalizeDraftFeedMessage,
} from "../draft-feed/types"
import { mergeDraftSnapshots } from "../draft-feed/snapshots"
import {
  PlayerLibrary,
  PlayersByPositionAndTeam,
} from "../draft"
import {
  FantasyPosition,
  NFLTeam,
  Player,
} from "../../types"

interface UseDraftListenerProps {
  playerLib: PlayerLibrary
  playersByPosByTeam: PlayersByPositionAndTeam
  settings: { numTeams: number }
  onDraftPlayer: (
    playerId: string,
    pickNum: number,
    fallbackPlayer?: Player,
  ) => void
  setCurrPick: (pick: number) => void
  setDraftStarted: (started: boolean) => void
}

interface DraftDecision {
  listening: boolean | null
  acceptToastId: string | number
  rejectToastId: string | number
}

const LISTENER_STALE_AFTER_MS = 7_000

const fallbackPosition = (position: string): FantasyPosition => {
  const positions = Object.values(FantasyPosition) as string[]
  return positions.includes(position)
    ? position as FantasyPosition
    : FantasyPosition.NONE
}

const fallbackTeam = (team: string): NFLTeam => {
  const normalizedTeam = team === "PHI" ? NFLTeam.PHL : team
  const teams = Object.values(NFLTeam) as string[]
  return teams.includes(normalizedTeam)
    ? normalizedTeam as NFLTeam
    : NFLTeam.FA
}

const createFallbackPlayer = ({
  id,
  name,
  team,
  position,
}: ParsedDraftPick): Player => {
  const [firstName = name, ...lastNameParts] = name.trim().split(/\s+/)
  return {
    id,
    firstName,
    lastName: lastNameParts.join(" "),
    fullName: name,
    team: fallbackTeam(team),
    position: fallbackPosition(position),
    ranks: {},
  }
}

export const useDraftListener = ({
  playerLib,
  playersByPosByTeam,
  settings,
  onDraftPlayer,
  setCurrPick,
  setDraftStarted,
}: UseDraftListenerProps) => {
  const decisions = useRef<Record<string, DraftDecision>>({})
  const pendingSnapshots = useRef<Record<string, DraftSnapshot>>({})
  const processedPicks = useRef(new Set<string>())
  const lastListenerAck = useRef<number | null>(null)

  const [activeDraftListenerTitle, setActiveDraftListenerTitle] =
    useState<string | null>(null)
  const [listenerActive, setListenerActive] = useState(false)

  const applySnapshot = useCallback((snapshot: DraftSnapshot) => {
    const parsedPicks: ParsedDraftPick[] =
      snapshot.platform === "ESPN"
        ? parseEspnDraftPicks(
            snapshot.picks as EspnDraftPick[],
            settings.numTeams,
          )
        : parseNflDraftPicks(
            snapshot.picks as NflDraftPick[],
            playersByPosByTeam,
          )

    let lastProcessedPick = 0
    parsedPicks.forEach((parsedPick) => {
      const { id, overallPick } = parsedPick
      const pickKey = `${snapshot.id}:${overallPick}`
      const player = playerLib[id]
      if (processedPicks.current.has(pickKey)) {
        return
      }

      processedPicks.current.add(pickKey)
      lastProcessedPick = Math.max(lastProcessedPick, overallPick)

      if (player) {
        onDraftPlayer(id, overallPick)
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

      const fallbackPlayer = createFallbackPlayer(parsedPick)
      onDraftPlayer(id, overallPick, fallbackPlayer)
      toast(
        `Pick #${overallPick}: ${fallbackPlayer.fullName} was added from the live draft but is missing ranking data`,
        {
          type: "warning",
          theme: "colored",
          position: "top-right",
        },
      )
    })

    if (lastProcessedPick > 0) {
      setCurrPick(lastProcessedPick + 1)
      setDraftStarted(true)
    }
  }, [
    onDraftPlayer,
    playerLib,
    playersByPosByTeam,
    setCurrPick,
    setDraftStarted,
    settings.numTeams,
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
        toast.dismiss(decision.rejectToastId)

        const pendingSnapshot = pendingSnapshots.current[snapshot.id]
        if (pendingSnapshot) {
          applySnapshot(pendingSnapshot)
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
  }, [applySnapshot])

  const processExtensionMessage = useCallback((event: MessageEvent) => {
    if (event.source !== window || Object.keys(playerLib).length === 0) {
      return
    }

    const feedEvent = normalizeDraftFeedMessage(event.data)
    if (!feedEvent) {
      return
    }

    lastListenerAck.current = Date.now()
    setListenerActive(true)

    if (feedEvent.kind === "heartbeat") {
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
      applySnapshot(draft)
    }
  }, [applySnapshot, bufferSnapshot, playerLib, promptForDraft])

  useEffect(() => {
    const checkListener = () => {
      const lastAck = lastListenerAck.current
      setListenerActive(
        lastAck !== null && Date.now() - lastAck <= LISTENER_STALE_AFTER_MS,
      )
    }

    const interval = window.setInterval(checkListener, 2_000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    window.addEventListener("message", processExtensionMessage)
    return () => window.removeEventListener("message", processExtensionMessage)
  }, [processExtensionMessage])

  return { listenerActive, activeDraftListenerTitle }
}
