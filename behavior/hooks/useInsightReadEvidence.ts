import {useCallback, useMemo} from "react"

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
import {useReadApiResource} from "../api/readApiContext"
import type {ReadApiLoader, ReadApiResourceSnapshot} from "../api/readApiCache"
import {readApiOutcome} from "../api/readApiCache"
import {useRankingSources} from "../api/rankingSources"


const DISABLED_HISTORY_KEY = "read-api:historical-comparison:disabled"

export const useInsightReadEvidence = ({
  playerIds,
  scoringProfile,
}: {
  playerIds: string[]
  scoringProfile: ScoringProfileId
}) => {
  const readiness = useDataReadiness()
  const rankingSources = useRankingSources()
  const completedWindows = useMemo(() => (
    readiness.data ? buildCompletedSeasonWindows(readiness.data) : []
  ), [readiness.data])
  const seasons = completedWindows[completedWindows.length - 1]?.seasons || []
  const playerSignature = Array.from(new Set(
    playerIds.map(playerId => playerId.trim()).filter(Boolean),
  )).slice(0, 3).join("\u001f")
  const boundedPlayerIds = useMemo(
    () => playerSignature ? playerSignature.split("\u001f") : [],
    [playerSignature],
  )
  const enabled = Boolean(
    process.env.NEXT_PUBLIC_HISTORICAL_COMPARISON_ENABLED === "true"
    && boundedPlayerIds.length > 0
    && seasons.length > 0
    && !readiness.error,
  )
  const key = enabled ? historicalComparisonResourceKey({
    playerIds: boundedPlayerIds,
    seasons,
    scoringProfile,
  }) : DISABLED_HISTORY_KEY
  const historyLoader = useCallback<ReadApiLoader<HistoricalComparisonResponse>>(
    async ({signal}) => {
      const response = await loadHistoricalComparison({
        playerIds: boundedPlayerIds,
        seasons,
        scoringProfile,
        signal,
      })
      return readApiOutcome({
        data: response,
        state: response.players.length > 0 ? "ready" : "unavailable",
        fingerprint: `insight-history:${JSON.stringify({
          players: response.players.map(player => [
            player.player_id,
            player.distribution.games,
            player.distribution.p10,
            player.distribution.p50,
            player.distribution.p90,
          ]),
          seasons: response.seasons,
          scoring: response.scoring_profile.id,
          sources: response.sources.map(source => source.sha256),
          availabilitySources: response.availability_sources?.map(
            source => source.sha256,
          ),
        })}`,
        ...(response.players.length === 0 ? {
          unavailableReason: "No historical games match the current comparison set.",
        } : {}),
      })
    },
    [boundedPlayerIds, scoringProfile, seasons],
  )
  const historyResource = useReadApiResource({
    enabled,
    key,
    loader: historyLoader,
    ttlMs: HISTORICAL_COMPARISON_TTL_MS,
  })
  const history = useMemo<ReadApiResourceSnapshot<HistoricalComparisonResponse>>(() => {
    if (enabled) return historyResource
    const unavailableReason = process.env.NEXT_PUBLIC_HISTORICAL_COMPARISON_ENABLED !== "true"
      ? "Historical comparison is disabled for this deployment."
      : readiness.error
        ? readiness.error
        : boundedPlayerIds.length === 0
          ? "No current comparison players are available."
          : seasons.length === 0
            ? "No supported completed-season window is available."
            : "Historical comparison is unavailable."
    return {
      ...historyResource,
      state: "unavailable",
      unavailableReason,
      fingerprint: `${DISABLED_HISTORY_KEY}:unavailable:${unavailableReason}`,
    }
  }, [boundedPlayerIds.length, enabled, historyResource, readiness.error, seasons.length])

  return {history, rankingSources, readiness, seasons}
}
