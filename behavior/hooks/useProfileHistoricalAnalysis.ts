import {useCallback, useEffect, useMemo, useState} from "react"

import {
  buildCompletedSeasonWindows,
  useDataReadiness,
} from "../api/dataReadiness"
import {
  AnalysisQueryResponse,
  ScoringProfileId,
  executeHistoricalAnalysis,
} from "../api/historicalAnalysis"
import {
  HISTORICAL_QUERY_TTL_MS,
  historicalQueryResourceKey,
} from "../api/historicalResources"
import {
  useReadApiResource,
} from "../api/readApiContext"
import type {
  ReadApiLoader,
  ReadApiResourceSnapshot,
} from "../api/readApiCache"
import {readApiOutcome} from "../api/readApiCache"
import {
  buildProfileHistoricalQuery,
} from "../profile/profileHistoricalViews"


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
  resource: ReadApiResourceSnapshot<AnalysisQueryResponse>
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
    completedWindows.find(window => window.size === 3)
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
  const query = useMemo(() => buildProfileHistoricalQuery({
    playerId: settledPlayerId,
    scoringProfile,
    seasons: boundedSeasons,
  }), [boundedSeasons, scoringProfile, settledPlayerId])
  const key = enabled
    ? historicalQueryResourceKey(query)
    : DISABLED_PROFILE_HISTORY_KEY
  const loader = useCallback<ReadApiLoader<AnalysisQueryResponse>>(
    async ({signal}) => {
      const response = await executeHistoricalAnalysis(query, {signal})
      return readApiOutcome({
        data: response,
        state: response.row_count > 0 ? "ready" : "unavailable",
        fingerprint: `profile-history:${JSON.stringify({
          playerId: settledPlayerId,
          rows: response.rows.map(row => [
            row.dimensions.season,
            row.dimensions.week,
            row.metrics.fantasy_points_mean,
          ]),
          scoring: response.scoring_profile.id,
          sources: response.sources.map(source => source.sha256),
        })}`,
        ...(response.row_count === 0 ? {
          unavailableReason: "No recorded NFL weeks matched this player and scoring profile.",
        } : {}),
      })
    },
    [query, settledPlayerId],
  )
  const loadedResource = useReadApiResource({
    enabled,
    key,
    loader,
    ttlMs: HISTORICAL_QUERY_TTL_MS,
  })
  const focusSettling = Boolean(playerId && settledPlayerId !== playerId)
  const resource = useMemo<ReadApiResourceSnapshot<AnalysisQueryResponse>>(() => {
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
