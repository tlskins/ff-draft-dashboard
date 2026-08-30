import {useCallback, useEffect, useMemo, useRef, useState} from "react"
import type {User} from "firebase/auth"

import {
  getUserDraftProfile,
  putUserDraftProfile,
  UserDraftProfileApiError,
} from "../api/userDraftProfile"
import {
  createCloudProfilePayload,
  decideCloudProfileSync,
  getOrCreateCloudProfileDeviceId,
  markerForRecord,
  readCloudProfileSyncMarker,
  stableJson,
  writeCloudProfileSyncMarker,
  type UserDraftProfilePayload,
  type UserDraftProfileRankingAuthority,
  type UserDraftProfileRecord,
} from "../cloudProfileSync"
import type {RankingProfileV2} from "../rankingProfileV2"
import type {PlayerTarget} from "../../types"


export type CloudProfileSyncState =
  | "disabled"
  | "waiting"
  | "syncing"
  | "synced"
  | "conflict"
  | "offline"
  | "error"

interface UseCloudProfileSyncOptions {
  enabled: boolean
  user: User | null
  hydrated: boolean
  rankingProfile: RankingProfileV2 | null
  targets: PlayerTarget[]
  sourceRanker: string | null
  season?: number
  onApplyRemote: (profile: UserDraftProfilePayload) => void | Promise<void>
}

const mutationId = (deviceId: string): string => {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replaceAll("-", "")
    : Math.random().toString(36).slice(2)
  return `${deviceId}:${Date.now().toString(36)}:${random}`.slice(0, 128)
}

export const useCloudProfileSync = ({
  enabled,
  user,
  hydrated,
  rankingProfile,
  targets,
  sourceRanker,
  season = 2026,
  onApplyRemote,
}: UseCloudProfileSyncOptions) => {
  const [state, setState] = useState<CloudProfileSyncState>(
    enabled ? "waiting" : "disabled",
  )
  const [error, setError] = useState<string | null>(null)
  const [record, setRecord] = useState<UserDraftProfileRecord | null>(null)
  const [conflict, setConflict] = useState<UserDraftProfileRecord | null>(null)
  const [priorAuthority, setPriorAuthority] =
    useState<UserDraftProfileRankingAuthority | null>(null)
  const [retryNonce, setRetryNonce] = useState(0)
  const requestSequence = useRef(0)
  const onApplyRemoteRef = useRef(onApplyRemote)
  const activeUid = user?.uid || null
  const priorProfileKey = useRef<string | null>(null)

  useEffect(() => {
    onApplyRemoteRef.current = onApplyRemote
  }, [onApplyRemote])

  useEffect(() => {
    const profileKey = activeUid ? `${activeUid}:${season}` : null
    if (priorProfileKey.current === profileKey) return
    priorProfileKey.current = profileKey
    requestSequence.current += 1
    setRecord(null)
    setConflict(null)
    setPriorAuthority(null)
    setError(null)
    setState(enabled ? "waiting" : "disabled")
  }, [activeUid, enabled, season])

  const localPayload = useMemo(() => createCloudProfilePayload({
    rankingProfile,
    targets,
    sourceRanker,
    priorAuthority,
  }), [priorAuthority, rankingProfile, sourceRanker, targets])
  const localPayloadKey = useMemo(() => stableJson(localPayload), [localPayload])

  const commitRecord = useCallback((uid: string, next: UserDraftProfileRecord) => {
    writeCloudProfileSyncMarker(localStorage, markerForRecord(uid, next))
    setRecord(next)
    setConflict(null)
    setPriorAuthority(current => stableJson(current) === stableJson(next.profile.ranking_authority)
      ? current
      : next.profile.ranking_authority)
    setState("synced")
    setError(null)
  }, [])

  const upload = useCallback(async (
    uid: string,
    token: string,
    profile: UserDraftProfilePayload,
    expectedRevision: number,
  ) => {
    const deviceId = getOrCreateCloudProfileDeviceId(localStorage)
    const next = await putUserDraftProfile({
      expected_revision: expectedRevision,
      mutation_id: mutationId(deviceId),
      device_id: deviceId,
      profile,
    }, {token, season})
    commitRecord(uid, next)
    return next
  }, [commitRecord, season])

  const synchronize = useCallback(async (
    activeUser: User,
    profile: UserDraftProfilePayload,
    sequence: number,
  ) => {
    setState("syncing")
    setError(null)
    try {
      const token = await activeUser.getIdToken()
      let remote: UserDraftProfileRecord | null = null
      try {
        remote = await getUserDraftProfile({token, season})
      } catch (caught) {
        if (!(caught instanceof UserDraftProfileApiError && caught.status === 404)) {
          throw caught
        }
      }
      if (sequence !== requestSequence.current) return
      const marker = readCloudProfileSyncMarker(localStorage, activeUser.uid, season)
      const decision = decideCloudProfileSync({local: profile, remote, marker})
      if (decision.action === "ready") {
        commitRecord(activeUser.uid, decision.record)
        return
      }
      if (decision.action === "apply_remote") {
        await onApplyRemoteRef.current(decision.record.profile)
        if (sequence !== requestSequence.current) return
        commitRecord(activeUser.uid, decision.record)
        return
      }
      if (decision.action === "conflict") {
        setRecord(decision.record)
        setConflict(decision.record)
        setPriorAuthority(current => stableJson(current) === stableJson(decision.record.profile.ranking_authority)
          ? current
          : decision.record.profile.ranking_authority)
        setState("conflict")
        setError("This device and the cloud profile both changed. Choose which copy to keep.")
        return
      }
      await upload(
        activeUser.uid,
        token,
        profile,
        decision.expectedRevision,
      )
    } catch (caught) {
      if (sequence !== requestSequence.current) return
      if (caught instanceof UserDraftProfileApiError && caught.status === 409) {
        setState("conflict")
        setError("The cloud profile changed during this sync. Review the latest copy before replacing it.")
        try {
          const token = await activeUser.getIdToken(true)
          const latest = await getUserDraftProfile({token, season})
          setRecord(latest)
          setConflict(latest)
          setPriorAuthority(current => stableJson(current) === stableJson(latest.profile.ranking_authority)
            ? current
            : latest.profile.ranking_authority)
        } catch {
          // Retain the actionable conflict even if the follow-up read is offline.
        }
        return
      }
      setState(caught instanceof UserDraftProfileApiError && caught.status === undefined
        ? "offline"
        : "error")
      setError(caught instanceof Error ? caught.message : "Cloud profile sync failed")
    }
  }, [commitRecord, season, upload])

  useEffect(() => {
    if (!enabled) {
      setState("disabled")
      return
    }
    if (!user || !hydrated) {
      setState("waiting")
      return
    }
    // A conflict is an explicit user-decision boundary. Local rerenders or
    // edits made while it is visible must not restart synchronization and
    // flash the UI between conflict and syncing states.
    if (conflict) {
      setState("conflict")
      return
    }
    const sequence = ++requestSequence.current
    const timeout = window.setTimeout(() => {
      void synchronize(user, localPayload, sequence)
    }, 650)
    return () => window.clearTimeout(timeout)
  }, [conflict, enabled, hydrated, localPayload, localPayloadKey, retryNonce, synchronize, user])

  const useCloudCopy = useCallback(async () => {
    if (!user || !conflict) return
    await onApplyRemoteRef.current(conflict.profile)
    commitRecord(user.uid, conflict)
  }, [commitRecord, conflict, user])

  const keepThisDevice = useCallback(async () => {
    if (!user || !conflict) return
    setState("syncing")
    setError(null)
    try {
      const token = await user.getIdToken(true)
      await upload(user.uid, token, localPayload, conflict.revision)
    } catch (caught) {
      setState("error")
      setError(caught instanceof Error ? caught.message : "Unable to replace the cloud profile")
      throw caught
    }
  }, [conflict, localPayload, upload, user])

  const retry = useCallback(() => setRetryNonce(current => current + 1), [])

  return useMemo(() => ({
    state,
    error,
    record,
    conflict,
    useCloudCopy,
    keepThisDevice,
    retry,
  }), [conflict, error, keepThisDevice, record, retry, state, useCloudCopy])
}

export type CloudProfileSyncControls = ReturnType<typeof useCloudProfileSync>
