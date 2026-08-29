import {Dispatch, SetStateAction, useEffect, useRef, useState} from "react"
import {PlayerTarget} from "../../types"
import {
  PLAYER_TARGETS_STORAGE_KEY,
  readStoredPlayerTargets,
  serializePlayerTargets,
} from "../playerTargetStorage"

export const usePersistedPlayerTargets = (): [
  PlayerTarget[],
  Dispatch<SetStateAction<PlayerTarget[]>>,
  boolean,
] => {
  const [playerTargets, setPlayerTargets] = useState<PlayerTarget[]>([])
  const [hydrated, setHydrated] = useState(false)
  const hydrationState = useRef<"pending" | "ready" | "rejected">("pending")
  const skipInitialPersist = useRef(false)

  useEffect(() => {
    if (typeof localStorage === "undefined") return
    let stored: ReturnType<typeof readStoredPlayerTargets>
    try {
      stored = readStoredPlayerTargets(localStorage.getItem(PLAYER_TARGETS_STORAGE_KEY))
    } catch {
      hydrationState.current = "rejected"
      skipInitialPersist.current = true
      setHydrated(true)
      return
    }

    hydrationState.current = stored.status === "rejected" ? "rejected" : "ready"
    skipInitialPersist.current = true
    if (stored.status === "ready") setPlayerTargets(stored.targets)
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (hydrationState.current === "pending" || typeof localStorage === "undefined") return
    if (skipInitialPersist.current) {
      skipInitialPersist.current = false
      return
    }

    try {
      localStorage.setItem(PLAYER_TARGETS_STORAGE_KEY, serializePlayerTargets(playerTargets))
      hydrationState.current = "ready"
    } catch {
      // Keep the in-memory selection usable when browser storage is unavailable.
    }
  }, [playerTargets])

  return [playerTargets, setPlayerTargets, hydrated]
}
