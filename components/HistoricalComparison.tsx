import React, { useEffect, useId, useMemo, useState } from "react"
import {
  HistoricalComparisonResponse,
  ScoringProfileId,
} from "../behavior/api/historical"
import {loadHistoricalComparisonResource} from "../behavior/api/historicalResources"
import {useReadApiCache} from "../behavior/api/readApiContext"
import {
  buildCompletedSeasonWindows,
  formatSeasonList,
  useDataReadiness,
} from "../behavior/api/dataReadiness"
import { FantasySettings, Player } from "../types"


interface HistoricalComparisonProps {
  player: Player | null
  players: Player[]
  settings: FantasySettings
}

const COLORS = ["#2563eb", "#dc2626"]
const CHART_WIDTH = 360
const CHART_HEIGHT = 150
const CHART_PADDING = 20

const pointsForPlayer = (
  player: HistoricalComparisonResponse["players"][number],
  maximum: number,
  maximumGames: number,
): string => player.weeks.map((week, index) => {
  const x = CHART_PADDING
    + (index / Math.max(1, maximumGames - 1))
    * (CHART_WIDTH - CHART_PADDING * 2)
  const y = CHART_HEIGHT - CHART_PADDING
    - (week.points / maximum)
    * (CHART_HEIGHT - CHART_PADDING * 2)
  return `${x},${y}`
}).join(" ")

const format = (value: number): string => value.toFixed(1)

const playerSearchLabel = (player: Player): string => (
  `${player.fullName} (${player.position} · ${player.team})`
)

const SearchablePlayerInput = ({
  ariaLabel,
  label,
  players,
  selectedId,
  onSelect,
}: {
  ariaLabel: string
  label: string
  players: Player[]
  selectedId: string
  onSelect: (playerId: string) => void
}) => {
  const listId = useId()
  const selected = players.find(candidate => candidate.id === selectedId)
  const selectedLabel = selected ? playerSearchLabel(selected) : ""
  const [query, setQuery] = useState(selectedLabel)

  useEffect(() => {
    setQuery(selectedLabel)
  }, [selectedLabel])

  const acceptExactMatch = (value: string) => {
    const normalized = value.trim().toLocaleLowerCase()
    const match = players.find(candidate => (
      playerSearchLabel(candidate).toLocaleLowerCase() === normalized
      || candidate.fullName.toLocaleLowerCase() === normalized
    ))
    if (match) onSelect(match.id)
  }

  return <label className="mb-2 block">
    {label}
    <input
      aria-label={ariaLabel}
      autoComplete="off"
      className="mt-1 w-full rounded border border-slate-400 p-1"
      list={listId}
      onBlur={() => setQuery(selectedLabel)}
      onChange={event => {
        setQuery(event.target.value)
        acceptExactMatch(event.target.value)
      }}
      onKeyDown={event => {
        if (event.key === "Enter") acceptExactMatch(event.currentTarget.value)
      }}
      placeholder="Search player name"
      type="search"
      value={query}
    />
    <datalist id={listId}>
      {players.map(candidate => (
        <option key={candidate.id} value={playerSearchLabel(candidate)} />
      ))}
    </datalist>
  </label>
}

const HistoricalComparison: React.FC<HistoricalComparisonProps> = ({
  player,
  players,
  settings,
}) => {
  const readApiCache = useReadApiCache()
  const enabled =
    process.env.NEXT_PUBLIC_HISTORICAL_COMPARISON_ENABLED === "true"
  const eligiblePlayers = useMemo(
    () => players
      .filter((candidate) =>
        ["QB", "RB", "WR", "TE"].includes(candidate.position)),
    [players],
  )
  const [primaryId, setPrimaryId] = useState("")
  const primaryPlayer = eligiblePlayers.find(
    (candidate) => candidate.id === primaryId,
  ) || null
  const candidates = useMemo(
    () => eligiblePlayers
      .filter((candidate) =>
        candidate.id !== primaryPlayer?.id
        && candidate.position === primaryPlayer?.position),
    [eligiblePlayers, primaryPlayer],
  )
  const [comparisonId, setComparisonId] = useState("")
  const [profile, setProfile] = useState<ScoringProfileId>(
    settings.ppr ? "ppr" : "standard",
  )
  const [seasonWindow, setSeasonWindow] = useState(5)
  const [comparison, setComparison] =
    useState<HistoricalComparisonResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const readiness = useDataReadiness()
  const completedSeasonWindows = useMemo(
    () => readiness.data
      ? buildCompletedSeasonWindows(readiness.data)
      : [],
    [readiness.data],
  )
  const selectedWindow = completedSeasonWindows.find(
    window => window.size === seasonWindow,
  ) || null

  useEffect(() => {
    if (player) {
      setPrimaryId(player.id)
    } else if (!primaryId && eligiblePlayers.length > 0) {
      setPrimaryId(eligiblePlayers[0].id)
    }
  }, [eligiblePlayers, player, primaryId])

  useEffect(() => {
    setComparisonId(candidates[0]?.id || "")
  }, [candidates])

  useEffect(() => {
    setProfile(settings.ppr ? "ppr" : "standard")
  }, [settings.ppr])

  useEffect(() => {
    if (!readiness.data || completedSeasonWindows.length === 0) return
    if (selectedWindow) return
    setSeasonWindow(
      completedSeasonWindows[completedSeasonWindows.length - 1].size,
    )
  }, [completedSeasonWindows, readiness.data, selectedWindow])

  useEffect(() => {
    if (
      !enabled
      || !primaryPlayer
      || !comparisonId
      || !selectedWindow
      || readiness.loading
      || readiness.error
    ) {
      setComparison(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    loadHistoricalComparisonResource(readApiCache, {
      playerIds: [primaryPlayer.id, comparisonId],
      seasons: selectedWindow.seasons,
      scoringProfile: profile,
    })
      .then((resource) => {
        if (!cancelled) {
          if (resource.data && ["ready", "stale"].includes(resource.state)) {
            setComparison(resource.data)
          } else {
            setComparison(null)
            setError(
              resource.unavailableReason
              || resource.error
              || "Historical comparison is unavailable",
            )
          }
        }
      })
      .catch((requestError: Error) => {
        if (!cancelled) {
          setError(requestError.message)
          setComparison(null)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [
    comparisonId,
    enabled,
    primaryPlayer,
    profile,
    readApiCache,
    readiness.error,
    readiness.loading,
    selectedWindow,
    seasonWindow,
  ])

  if (!enabled) {
    return null
  }

  const maximum = Math.max(
    1,
    ...(comparison?.players.flatMap((item) =>
      item.weeks.map((week) => week.points)) || []),
  )
  const maximumGames = Math.max(
    1,
    ...(comparison?.players.map((item) => item.weeks.length) || []),
  )
  const selectedSeasons = selectedWindow?.seasons || []

  return (
    <section className="mx-4 my-3 rounded border border-slate-300 bg-white p-3 text-xs shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="font-semibold">
          {selectedWindow
            ? `${formatSeasonList(selectedSeasons)} weekly comparison`
            : "Historical weekly comparison"}
        </h2>
        <div className="flex gap-1">
          <select
            aria-label="Historical season window"
            className="rounded border border-slate-400 p-1"
            value={seasonWindow}
            disabled={completedSeasonWindows.length === 0}
            onChange={(event) =>
              setSeasonWindow(Number(event.target.value))}
          >
            {completedSeasonWindows.map(window => (
              <option key={window.size} value={window.size}>
                {window.label}
              </option>
            ))}
          </select>
          <select
            aria-label="Scoring profile"
            className="rounded border border-slate-400 p-1"
            value={profile}
            onChange={(event) =>
              setProfile(event.target.value as ScoringProfileId)}
          >
            <option value="standard">Standard</option>
            <option value="half_ppr">Half PPR</option>
            <option value="ppr">PPR</option>
          </select>
        </div>
      </div>
      <SearchablePlayerInput
        ariaLabel="Primary comparison player"
        label="Player A"
        onSelect={setPrimaryId}
        players={eligiblePlayers}
        selectedId={primaryId}
      />
      <SearchablePlayerInput
        ariaLabel="Comparison player"
        label="Player B"
        onSelect={setComparisonId}
        players={candidates}
        selectedId={comparisonId}
      />

      {readiness.loading && <p>Loading season availability…</p>}
      {readiness.error && (
        <p className="rounded bg-amber-50 p-2 text-amber-900">
          Season metadata unavailable: {readiness.error}
        </p>
      )}
      {readiness.data && completedSeasonWindows.length === 0 && (
        <p className="rounded bg-amber-50 p-2 text-amber-900">
          No completed historical seasons are available. Partial seasons are
          not used as a fallback.
        </p>
      )}
      {readiness.data
        && readiness.data.current_partial_seasons.length > 0 && (
        <p className="rounded bg-blue-50 p-2 text-blue-900">
          {formatSeasonList(readiness.data.current_partial_seasons)} is
          current/partial and intentionally excluded.
        </p>
      )}

      {loading && <p>Loading weekly distributions…</p>}
      {error && (
        <p className="rounded bg-amber-50 p-2 text-amber-900">
          Historical comparison unavailable: {error}
        </p>
      )}
      {comparison && (
        <>
          <svg
            aria-label="Weekly fantasy points comparison"
            className="h-auto w-full rounded bg-slate-50"
            viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
            role="img"
          >
            <line
              x1={CHART_PADDING}
              x2={CHART_WIDTH - CHART_PADDING}
              y1={CHART_HEIGHT - CHART_PADDING}
              y2={CHART_HEIGHT - CHART_PADDING}
              stroke="#94a3b8"
            />
            {comparison.players.map((item, index) => (
              <polyline
                key={item.player_id}
                fill="none"
                points={pointsForPlayer(
                  item,
                  maximum,
                  maximumGames,
                )}
                stroke={COLORS[index]}
                strokeWidth="2.5"
              />
            ))}
          </svg>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {comparison.players.map((item, index) => (
              <div
                className="rounded border border-slate-200 p-2"
                key={item.player_id}
              >
                <p
                  className="font-semibold"
                  style={{ color: COLORS[index] }}
                >
                  {item.player_name}
                </p>
                <p>
                  Avg {format(item.distribution.mean)} · P10{" "}
                  {format(item.distribution.p10)} · P90{" "}
                  {format(item.distribution.p90)}
                </p>
                <p>
                  σ {format(item.distribution.std_dev)} across{" "}
                  {item.distribution.games} games
                </p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-slate-500">
            Recomputed from nflverse · {comparison.identity_miss_count}{" "}
            unmatched source players in the review queue
          </p>
        </>
      )}
    </section>
  )
}

export default HistoricalComparison
