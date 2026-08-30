import {useEffect, useMemo, useRef, useState} from "react"
import type {User} from "firebase/auth"

import {putUserMockDraft} from "../api/userMockDrafts"
import {
  completedMockPutRequest,
  readLocalCompletedMocks,
  storeLocalCompletedMock,
  type LocalMockDraftArchive,
} from "../mockDraft/archive"


export type CompletedMockArchiveState =
  | "idle"
  | "saving_local"
  | "saved_local"
  | "syncing"
  | "synced"
  | "offline"
  | "error"

export const useCompletedMockArchive = ({
  enabled,
  archive,
  season,
  user,
}: {
  enabled: boolean
  archive: LocalMockDraftArchive | null
  season: number
  user: User | null
}) => {
  const [state, setState] = useState<CompletedMockArchiveState>("idle")
  const [error, setError] = useState<string | null>(null)
  const sequence = useRef(0)
  const [retry, setRetry] = useState(0)
  const archiveKey = useMemo(
    () => archive ? `${archive.season}:${archive.mock_id}:${archive.completed_at}` : null,
    [archive],
  )

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return
    const retryPending = () => setRetry(value => value + 1)
    window.addEventListener("online", retryPending)
    return () => window.removeEventListener("online", retryPending)
  }, [enabled])

  useEffect(() => {
    if (!enabled || typeof localStorage === "undefined") {
      setState("idle")
      return
    }
    const currentSequence = ++sequence.current
    let pending = readLocalCompletedMocks(localStorage, season)
    if (archive) {
      try {
        setState("saving_local")
        pending = storeLocalCompletedMock(localStorage, archive)
        setState("saved_local")
        setError(null)
      } catch (caught) {
        setState("error")
        setError(caught instanceof Error ? caught.message : "Unable to store completed mock locally")
        return
      }
    }
    if (!pending.length) {
      setState("idle")
      setError(null)
      return
    }
    if (!user) {
      setState("saved_local")
      return
    }
    const synchronize = async () => {
      setState("syncing")
      try {
        const token = await user.getIdToken()
        for (const item of pending) {
          await putUserMockDraft(
            item.mock_id,
            completedMockPutRequest(item),
            {token, season: item.season},
          )
        }
        if (sequence.current !== currentSequence) return
        setState("synced")
        setError(null)
      } catch (caught) {
        if (sequence.current !== currentSequence) return
        setState("offline")
        setError(caught instanceof Error ? caught.message : "Completed mock cloud sync failed")
      }
    }
    void synchronize()
    return () => {
      sequence.current += 1
    }
  }, [archive, archiveKey, enabled, retry, season, user])

  return {state, error}
}
