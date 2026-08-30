import {Dispatch, SetStateAction, useEffect, useRef, useState} from "react"
import {PlayerTarget} from "../../types"
import {
  PLAYER_TARGETS_STORAGE_KEY,
  readStoredPlayerTargets,
  serializePlayerTargets,
} from "../playerTargetStorage"
import {seasonScopedStorage} from "../seasonScopedStorage"

export const usePersistedPlayerTargets = (season = 2026): [
  PlayerTarget[],
  Dispatch<SetStateAction<PlayerTarget[]>>,
  boolean,
] => {
  const [playerTargets, setPlayerTargets] = useState<PlayerTarget[]>([])
  const [hydratedSeason, setHydratedSeason] = useState<number | null>(null)
  const hydrationState = useRef<"pending" | "ready" | "rejected">("pending")
  const skipInitialPersist = useRef(false)

  useEffect(() => {
    if (typeof localStorage === "undefined") return
    const storage = seasonScopedStorage(localStorage, season)
    hydrationState.current = "pending"
    let stored: ReturnType<typeof readStoredPlayerTargets>
    try {
      stored = readStoredPlayerTargets(storage.getItem(PLAYER_TARGETS_STORAGE_KEY))
    } catch {
      hydrationState.current = "rejected"
      skipInitialPersist.current = true
      setPlayerTargets([])
      setHydratedSeason(season)
      return
    }

    hydrationState.current = stored.status === "rejected" ? "rejected" : "ready"
    skipInitialPersist.current = true
    setPlayerTargets(stored.status === "ready" ? stored.targets : [])
    setHydratedSeason(season)
  }, [season])

  useEffect(() => {
    if (hydrationState.current === "pending" || typeof localStorage === "undefined") return
    if (skipInitialPersist.current) {
      skipInitialPersist.current = false
      return
    }

    try {
      seasonScopedStorage(localStorage, season).setItem(
        PLAYER_TARGETS_STORAGE_KEY,
        serializePlayerTargets(playerTargets),
      )
      hydrationState.current = "ready"
    } catch {
      // Keep the in-memory selection usable when browser storage is unavailable.
    }
  }, [playerTargets, season])

  return [playerTargets, setPlayerTargets, hydratedSeason === season]
}
