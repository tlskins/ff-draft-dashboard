import React, {useEffect, useMemo, useRef, useState} from "react"

import type {HistoricalComparisonResponse} from "../../behavior/api/historical"
import type {ScoringProfileId} from "../../behavior/api/historicalAnalysis"
import {useReadApiCache} from "../../behavior/api/readApiContext"
import {
  buildCompletedSeasonWindows,
  useDataReadiness,
} from "../../behavior/api/dataReadiness"
import {loadHistoricalComparisonResource} from "../../behavior/api/historicalResources"
import type {AdvisorComparisonController} from "../../behavior/hooks/useAdvisorComparisonController"
import type {FantasySettings, Player} from "../../types"
import {scoringFormatFor} from "../../behavior/scoringFormat"
import AdvisorComparisonSurface from "../AdvisorComparisonSurface"
import PlayerLabHistorical from "../analysis/PlayerLabHistorical"
import styles from "./InsightDeck.module.css"


const PlayerLabInsightSurface = ({
  availablePlayers,
  comparisonController,
  onInspectPlayer,
  settings,
}: {
  availablePlayers: Player[]
  comparisonController: AdvisorComparisonController
  onInspectPlayer: (player: Player) => void
  settings: FantasySettings
}) => {
  const cache = useReadApiCache()
  const readiness = useDataReadiness()
  const windows = useMemo(() => readiness.data
    ? buildCompletedSeasonWindows(readiness.data)
    : [], [readiness.data])
  const defaultWindow = windows.find(window => window.size === 5)
    || windows[windows.length - 1]
    || null
  const [windowSize, setWindowSize] = useState<1 | 3 | 5>(5)
  const activeScoringProfile = scoringFormatFor(settings)
  const [scoringProfile, setScoringProfile] = useState<ScoringProfileId>(
    activeScoringProfile,
  )
  const [result, setResult] = useState<HistoricalComparisonResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestId = useRef(0)
  const selectedWindow = windows.find(window => window.size === windowSize)
    || defaultWindow
  const playerIds = comparisonController.items.map(item => item.player.id).slice(0, 3)
  const playerSignature = playerIds.join("|")

  useEffect(() => {
    setScoringProfile(activeScoringProfile)
  }, [activeScoringProfile])

  useEffect(() => {
    if (!defaultWindow) return
    if (!windows.some(window => window.size === windowSize)) {
      setWindowSize(defaultWindow.size)
    }
  }, [defaultWindow, windowSize, windows])

  useEffect(() => {
    const seasons = selectedWindow?.seasons || []
    if (playerIds.length < 2 || seasons.length === 0 || readiness.error) {
      requestId.current += 1
      setResult(null)
      setLoading(false)
      setError(readiness.error || null)
      return
    }
    const currentRequest = ++requestId.current
    setLoading(true)
    setError(null)
    void loadHistoricalComparisonResource(cache, {
      playerIds,
      seasons,
      scoringProfile,
    }).then(resource => {
      if (requestId.current !== currentRequest) return
      setResult(resource.data)
      setError(resource.state === "ready" || resource.state === "stale"
        ? null
        : resource.unavailableReason || resource.error || "Player Lab history is unavailable.")
    }).catch(reason => {
      if (requestId.current !== currentRequest) return
      setResult(null)
      setError(reason instanceof Error ? reason.message : "Player Lab history is unavailable.")
    }).finally(() => {
      if (requestId.current === currentRequest) setLoading(false)
    })
  // The stable signature owns query identity; the bounded list is rebuilt per render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cache, playerSignature, readiness.error, scoringProfile, selectedWindow?.label])

  const playersById = useMemo(() => new Map(availablePlayers.map(player => (
    [player.id, player]
  ))), [availablePlayers])

  return (
    <section aria-label="Automatic Player Lab" className={styles.playerLabView}>
      <AdvisorComparisonSurface
        announceUpdates={false}
        availablePlayers={availablePlayers}
        controller={comparisonController}
      />
      <div className={styles.playerLabToolbar}>
        <div>
          <strong>Automatic historical comparison</strong>
          <span>Refreshes when Players in play changes.</span>
        </div>
        <label>
          <span>Seasons</span>
          <select
            aria-label="Player Lab season window"
            disabled={windows.length === 0}
            onChange={event => setWindowSize(Number(event.target.value) as 1 | 3 | 5)}
            value={selectedWindow?.size || windowSize}
          >
            {windows.map(window => (
              <option key={window.size} value={window.size}>{window.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Scoring</span>
          <select
            aria-label="Player Lab scoring profile"
            onChange={event => setScoringProfile(event.target.value as ScoringProfileId)}
            value={scoringProfile}
          >
            <option value="standard">Standard</option>
            <option value="half_ppr">Half PPR</option>
            <option value="ppr">PPR</option>
          </select>
        </label>
      </div>
      {loading && <p className={styles.playerLabState} role="status">Loading Player Lab…</p>}
      {!loading && error && <p className={styles.playerLabState}>Player Lab unavailable: {error}</p>}
      {!loading && !error && playerIds.length < 2 && (
        <p className={styles.playerLabState}>At least two Players in play are required.</p>
      )}
      {!loading && !error && result && (
        <div className={styles.playerLabHistorical}>
          <PlayerLabHistorical
            onInspectPlayer={playerId => {
              const player = playersById.get(playerId)
              if (player) onInspectPlayer(player)
            }}
            response={result}
          />
        </div>
      )}
    </section>
  )
}

export default PlayerLabInsightSurface
