import {useCallback, useEffect, useMemo, useRef, useState} from "react"

import {
  AdvisorComparisonItem,
  advisorComparisonSetSignature,
  createManualComparisonItem,
  MAX_ADVISOR_COMPARISON_PLAYERS,
} from "../advisorComparisonSet"
import type {Player} from "../../types"

export type AdvisorComparisonMode = "auto" | "pinned"

export interface AdvisorComparisonController {
  mode: AdvisorComparisonMode
  items: AdvisorComparisonItem[]
  announcement: string
  pinCurrent: () => void
  restoreAuto: () => void
  addPinnedPlayer: (player: Player) => void
  removePinnedPlayer: (playerId: string) => void
}

export const useAdvisorComparisonController = ({
  automaticSet,
  materialEventKey,
}: {
  automaticSet: AdvisorComparisonItem[]
  materialEventKey: string
}): AdvisorComparisonController => {
  const [mode, setMode] = useState<AdvisorComparisonMode>("auto")
  // Auto is deliberately committed at a material draft boundary rather than
  // following every ranking/status/evidence rerender.
  const [committedAutomaticSet, setCommittedAutomaticSet] = useState(
    () => automaticSet.slice(0, MAX_ADVISOR_COMPARISON_PLAYERS),
  )
  const [pinnedItems, setPinnedItems] = useState<AdvisorComparisonItem[]>([])
  const [announcement, setAnnouncement] = useState("")
  const announcementCount = useRef(0)
  const automaticSignature = advisorComparisonSetSignature(automaticSet)
  const committedAutomaticSignature = advisorComparisonSetSignature(
    committedAutomaticSet,
  )
  const observedMaterialEventKey = useRef(materialEventKey)
  const latestAutomaticSet = useRef(automaticSet)
  latestAutomaticSet.current = automaticSet
  const announcePinnedUpdate = useCallback((items: AdvisorComparisonItem[]) => {
    announcementCount.current += 1
    setAnnouncement(
      `Pinned comparison updated: ${items.map(item => (
        item.player.fullName
      )).join(", ") || "no available players"}. Update ${announcementCount.current}.`,
    )
  }, [])

  useEffect(() => {
    if (observedMaterialEventKey.current === materialEventKey) return
    observedMaterialEventKey.current = materialEventKey
    if (mode !== "auto") return
    setCommittedAutomaticSet(automaticSet.slice(0, MAX_ADVISOR_COMPARISON_PLAYERS))
    if (committedAutomaticSignature === automaticSignature) return
    announcementCount.current += 1
    const names = automaticSet.map(item => item.player.fullName).join(", ")
    setAnnouncement(
      "Automatic comparison updated after a draft pick: "
      + `${names || "no available players"}. Update ${announcementCount.current}.`,
    )
  }, [
    automaticSet,
    automaticSignature,
    committedAutomaticSignature,
    materialEventKey,
    mode,
  ])

  // A first render can legitimately have no available candidates while the
  // board settles. Allow that empty Auto state one silent bootstrap at the
  // same material boundary, but never replace a nonempty committed set without
  // a new material draft event.
  useEffect(() => {
    if (
      mode !== "auto"
      || committedAutomaticSet.length > 0
      || automaticSet.length === 0
    ) return
    setCommittedAutomaticSet(automaticSet.slice(0, MAX_ADVISOR_COMPARISON_PLAYERS))
  }, [automaticSet, committedAutomaticSet.length, mode])

  const pinCurrent = useCallback(() => {
    if (mode === "pinned") return
    setPinnedItems(committedAutomaticSet.slice(0, MAX_ADVISOR_COMPARISON_PLAYERS))
    setMode("pinned")
  }, [committedAutomaticSet, mode])

  const restoreAuto = useCallback(() => {
    const latest = latestAutomaticSet.current.slice(0, MAX_ADVISOR_COMPARISON_PLAYERS)
    const latestSignature = advisorComparisonSetSignature(latest)
    const reconciles = advisorComparisonSetSignature(pinnedItems)
      !== latestSignature
    setMode("auto")
    setCommittedAutomaticSet(latest)
    if (reconciles) {
      announcementCount.current += 1
      setAnnouncement(
        `Automatic comparison restored: ${latest.map(item => (
          item.player.fullName
        )).join(", ") || "no available players"}. Update ${announcementCount.current}.`,
      )
    }
  }, [pinnedItems])

  const addPinnedPlayer = useCallback((player: Player) => {
    if (pinnedItems.some(item => item.player.id === player.id)
      || pinnedItems.length >= MAX_ADVISOR_COMPARISON_PLAYERS) return
    const next = [...pinnedItems, createManualComparisonItem(player)]
      .slice(0, MAX_ADVISOR_COMPARISON_PLAYERS)
    setPinnedItems(next)
    announcePinnedUpdate(next)
  }, [announcePinnedUpdate, pinnedItems])

  const removePinnedPlayer = useCallback((playerId: string) => {
    const next = pinnedItems.filter(item => (
      item.player.id !== playerId
    ))
    if (next.length === pinnedItems.length) return
    setPinnedItems(next)
    announcePinnedUpdate(next)
  }, [announcePinnedUpdate, pinnedItems])

  const items = useMemo(() => mode === "auto"
    ? committedAutomaticSet
    : pinnedItems, [committedAutomaticSet, mode, pinnedItems])

  return {
    mode,
    items,
    announcement,
    pinCurrent,
    restoreAuto,
    addPinnedPlayer,
    removePinnedPlayer,
  }
}
