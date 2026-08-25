import {useCallback, useEffect, useMemo, useState} from "react"

import {
  buildCompletedSeasonWindows,
  useDataReadiness,
} from "../api/dataReadiness"
import {
  HistoricalComparisonResponse,
  ScoringProfileId,
  loadHistoricalComparison,
} from "../api/historical"
import {
  HISTORICAL_COMPARISON_TTL_MS,
  historicalComparisonResourceKey,
} from "../api/historicalResources"
import {
  useReadApiResource,
} from "../api/readApiContext"
import type {
  ReadApiLoader,
  ReadApiResourceSnapshot,
} from "../api/readApiCache"
import {readApiOutcome} from "../api/readApiCache"
const DISABLED_PROFILE_HISTORY_KEY = "read-api:profile-history:disabled"
export const PROFILE_HISTORY_FOCUS_DELAY_MS = 250

export const useProfileHistoricalAnalysis = ({
  playerId,
  scoringProfile,
}: {
  playerId: string
  scoringProfile: ScoringProfileId
}): {
  readiness: ReturnType<typeof useDataReadiness>
  resource: ReadApiResourceSnapshot<HistoricalComparisonResponse>
  seasons: number[]
} => {
  const readiness = useDataReadiness()
  const [settledPlayerId, setSettledPlayerId] = useState("")
  useEffect(() => {
    if (!playerId) {
      setSettledPlayerId("")
      return
    }
    const timeout = window.setTimeout(
      () => setSettledPlayerId(playerId),
      PROFILE_HISTORY_FOCUS_DELAY_MS,
    )
    return () => window.clearTimeout(timeout)
  }, [playerId])
  const completedWindows = useMemo(() => (
    readiness.data ? buildCompletedSeasonWindows(readiness.data) : []
  ), [readiness.data])
  const seasons = (
    completedWindows.find(window => window.size === 1)
    || completedWindows[completedWindows.length - 1]
  )?.seasons || []
  const seasonSignature = seasons.join(",")
  const boundedSeasons = useMemo(
    () => seasonSignature ? seasonSignature.split(",").map(Number) : [],
    [seasonSignature],
  )
  const enabled = Boolean(
    process.env.NEXT_PUBLIC_API_HOST
    && process.env.NEXT_PUBLIC_HISTORICAL_COMPARISON_ENABLED === "true"
    && settledPlayerId
    && settledPlayerId === playerId
    && boundedSeasons.length > 0
    && !readiness.error,
  )
  const key = enabled
    ? historicalComparisonResourceKey({
      playerIds: [settledPlayerId],
      scoringProfile,
      seasons: boundedSeasons,
    })
    : DISABLED_PROFILE_HISTORY_KEY
  const loader = useCallback<ReadApiLoader<HistoricalComparisonResponse>>(
    async ({signal}) => {
      const response = await loadHistoricalComparison({
        playerIds: [settledPlayerId],
        scoringProfile,
        seasons: boundedSeasons,
        signal,
      })
      const result = response.players.find(
        candidate => candidate.player_id === settledPlayerId,
      )
      return readApiOutcome({
        data: response,
        state: result && result.weeks.length > 0 ? "ready" : "unavailable",
        fingerprint: `profile-history:${JSON.stringify({
          playerId: settledPlayerId,
          weeks: result?.weeks.map(week => [
            week.season,
            week.week,
            week.points,
          ]),
          availability: result?.availability?.map(item => [
            item.season,
            item.week,
            item.status,
            item.detail,
          ]),
          scoring: response.scoring_profile.id,
          sources: response.sources.map(source => source.sha256),
          availabilitySources: (response.availability_sources || []).map(
            source => source.sha256,
          ),
        })}`,
        ...(!result || result.weeks.length === 0 ? {
          unavailableReason: "No recorded NFL weeks matched this player and scoring profile.",
        } : {}),
      })
    },
    [boundedSeasons, scoringProfile, settledPlayerId],
  )
  const loadedResource = useReadApiResource({
    enabled,
    key,
    loader,
    ttlMs: HISTORICAL_COMPARISON_TTL_MS,
  })
  const focusSettling = Boolean(playerId && settledPlayerId !== playerId)
  const resource = useMemo<ReadApiResourceSnapshot<HistoricalComparisonResponse>>(() => {
    if (enabled) return loadedResource
    const unavailableReason = process.env.NEXT_PUBLIC_HISTORICAL_COMPARISON_ENABLED !== "true"
      ? "Historical analysis is disabled for this deployment."
      : readiness.error
        ? readiness.error
        : !playerId
          ? "Focus a player to load historical analysis."
          : focusSettling
            ? "Waiting for player focus to settle."
          : boundedSeasons.length === 0
            ? "No supported completed-season window is available."
            : "Historical analysis API is not configured."
    return {
      ...loadedResource,
      state: readiness.loading || focusSettling ? "loading" : "unavailable",
      unavailableReason,
      fingerprint: `${DISABLED_PROFILE_HISTORY_KEY}:${readiness.loading || focusSettling ? "loading" : "unavailable"}:${unavailableReason}`,
    }
  }, [boundedSeasons.length, enabled, focusSettling, loadedResource, playerId, readiness.error, readiness.loading])

  return {readiness, resource, seasons: boundedSeasons}
}
