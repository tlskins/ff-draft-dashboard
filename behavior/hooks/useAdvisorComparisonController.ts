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
  const [pinnedItems, setPinnedItems] = useState<AdvisorComparisonItem[]>([])
  const [announcement, setAnnouncement] = useState("")
  const announcementCount = useRef(0)
  const automaticSignature = advisorComparisonSetSignature(automaticSet)
  const observed = useRef({
    automaticSignature,
    materialEventKey,
  })

  useEffect(() => {
    const selectionChanged = observed.current.automaticSignature
      !== automaticSignature
    const materialEventChanged = observed.current.materialEventKey
      !== materialEventKey
    observed.current = {automaticSignature, materialEventKey}
    if (!selectionChanged || mode !== "auto") return
    announcementCount.current += 1
    const names = automaticSet.map(item => item.player.fullName).join(", ")
    setAnnouncement(
      `Automatic comparison updated${materialEventChanged ? " after a draft pick" : " after selection evidence changed"}: `
      + `${names || "no available players"}. Update ${announcementCount.current}.`,
    )
  }, [automaticSet, automaticSignature, materialEventKey, mode])

  const pinCurrent = useCallback(() => {
    if (mode === "pinned") return
    setPinnedItems(automaticSet.slice(0, MAX_ADVISOR_COMPARISON_PLAYERS))
    setMode("pinned")
  }, [automaticSet, mode])

  const restoreAuto = useCallback(() => {
    const reconciles = advisorComparisonSetSignature(pinnedItems)
      !== automaticSignature
    setMode("auto")
    if (reconciles) {
      announcementCount.current += 1
      setAnnouncement(
        `Automatic comparison restored: ${automaticSet.map(item => (
          item.player.fullName
        )).join(", ") || "no available players"}. Update ${announcementCount.current}.`,
      )
    }
  }, [automaticSet, automaticSignature, pinnedItems])

  const addPinnedPlayer = useCallback((player: Player) => {
    setPinnedItems(current => {
      if (current.some(item => item.player.id === player.id)) return current
      return [...current, createManualComparisonItem(player)]
        .slice(0, MAX_ADVISOR_COMPARISON_PLAYERS)
    })
  }, [])

  const removePinnedPlayer = useCallback((playerId: string) => {
    setPinnedItems(current => current.filter(item => (
      item.player.id !== playerId
    )))
  }, [])

  const items = useMemo(() => mode === "auto"
    ? automaticSet
    : pinnedItems, [automaticSet, mode, pinnedItems])

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
