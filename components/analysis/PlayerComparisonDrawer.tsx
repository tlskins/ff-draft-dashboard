import React, { useMemo, useRef } from "react"
import { useDialogAccessibility } from "../../behavior/hooks/useDialogAccessibility"

import { AnalysisQueryResponse } from "../../behavior/api/historicalAnalysis"
import {
  getPlayerMetrics,
  getProjectedTier,
} from "../../behavior/draft"
import {
  BoardSettings,
  DataRanker,
  FantasySettings,
  Player,
  RankingSummary,
  ThirdPartyRanker,
} from "../../types"


interface PlayerComparisonDrawerProps {
  player: Player
  response: AnalysisQueryResponse | null
  settings: FantasySettings
  boardSettings: BoardSettings
  rankingSummaries: RankingSummary[]
  onClose: () => void
}

const METRIC_LABELS: Record<string, string> = {
  games: "Games",
  fantasy_points_mean: "Weekly average",
  fantasy_points_p10: "P10 floor",
  fantasy_points_p50: "Median",
  fantasy_points_p90: "P90 ceiling",
  fantasy_points_std_dev: "Volatility",
  attempts_total: "Pass attempts",
  carries_total: "Carries",
  targets_total: "Targets",
}

const formatMetric = (value: number) => (
  Number.isInteger(value) ? String(value) : value.toFixed(1)
)

const PlayerComparisonDrawer: React.FC<
  PlayerComparisonDrawerProps
> = ({
  player,
  response,
  settings,
  boardSettings,
  rankingSummaries,
  onClose,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const onDialogKeyDown = useDialogAccessibility({
    dialogRef,
    initialFocusRef: closeButtonRef,
    onClose,
  })
  const hasUserRank = Boolean(player.ranks[ThirdPartyRanker.CUSTOM])
  const ranker = hasUserRank
    ? ThirdPartyRanker.CUSTOM
    : boardSettings.ranker
  const metrics = getPlayerMetrics(
    player,
    settings,
    {...boardSettings, ranker},
  )
  const projection = getProjectedTier(
    player,
    ranker,
    DataRanker.LAST_SSN_PPG,
    settings,
    rankingSummaries,
  )
  const resultRows = useMemo(() => (response?.rows || [])
    .filter(row => row.dimensions.player_id === player.id)
    .sort((left, right) =>
      Number(right.dimensions.season || 0) -
      Number(left.dimensions.season || 0)),
  [player.id, response])
  const resultRow = resultRows[0]
  const historicalMetrics = resultRow?.metrics || {}
  const games = historicalMetrics.games
  const uncertainty = [
    ...(!hasUserRank ? ["No saved user rank; showing active source rank."] : []),
    ...(!projection ? ["Projection range is unavailable."] : []),
    ...(
      typeof games === "number" && games < 8
        ? ["Very small historical sample."]
        : typeof games === "number" && games < 17
          ? ["Limited historical sample."]
          : []
    ),
  ]
  const projectedFloor = projection
    ? Math.min(
      projection.upperLimitValue,
      projection.lowerLimitValue,
    )
    : null
  const projectedCeiling = projection
    ? Math.max(
      projection.upperLimitValue,
      projection.lowerLimitValue,
    )
    : null

  return (
    <div
      aria-labelledby="player-comparison-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex justify-end bg-slate-950 bg-opacity-30"
      onKeyDown={onDialogKeyDown}
      ref={dialogRef}
      role="dialog"
      tabIndex={-1}
    >
      <div className="h-full w-full max-w-md overflow-y-auto bg-white p-5 text-left shadow-2xl">
        <header className="mb-5 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
              Player comparison
            </p>
            <h2 className="text-2xl font-bold text-slate-900" id="player-comparison-title">
              {player.fullName}
            </h2>
            <p className="text-sm text-slate-500">
              {player.team} · {player.position}
            </p>
          </div>
          <button
            aria-label="Close player comparison"
            className="rounded border border-slate-300 px-2.5 py-1.5 text-sm hover:bg-slate-100"
            onClick={onClose}
            ref={closeButtonRef}
          >
            Close
          </button>
        </header>

        <section className="mb-5">
          <h3 className="mb-2 text-sm font-semibold text-slate-800">
            Draft board context
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-slate-500">
                {hasUserRank ? "User position rank" : "Position rank"}
              </p>
              <p className="text-xl font-bold">
                {metrics.posRank
                  ? `${player.position}${metrics.posRank}`
                  : "Unranked"}
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-slate-500">User tier</p>
              <p className="text-xl font-bold">
                {hasUserRank && metrics.tier
                  ? `Tier ${metrics.tier.tierNumber}`
                  : "Not set"}
              </p>
            </div>
            <div className="col-span-2 rounded-lg bg-indigo-50 p-3">
              <p className="text-xs text-indigo-700">
                Projection range · standard_deviation_v1
              </p>
              <p className="text-xl font-bold text-indigo-950">
                {projection && projectedFloor !== null &&
                projectedCeiling !== null
                  ? `${projectedFloor.toFixed(1)}–${projectedCeiling.toFixed(1)} PPG`
                  : "Unavailable"}
              </p>
              {projection && (
                <p className="text-xs text-indigo-700">
                  Projection tier {projection.tierNumber}
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="mb-5">
          <h3 className="mb-2 text-sm font-semibold text-slate-800">
            Current analysis
          </h3>
          {Object.keys(historicalMetrics).length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(historicalMetrics)
                .filter(([field]) => METRIC_LABELS[field])
                .map(([field, value]) => (
                  <div
                    className="rounded-lg border border-slate-200 p-3"
                    key={field}
                  >
                    <p className="text-xs text-slate-500">
                      {METRIC_LABELS[field]}
                    </p>
                    <p className="text-lg font-semibold text-slate-900">
                      {formatMetric(value)}
                    </p>
                  </div>
                ))}
            </div>
          ) : (
            <p className="rounded bg-slate-50 p-3 text-sm text-slate-500">
              This player is not present in the current grouped result.
            </p>
          )}
          {resultRows.length > 1 && (
            <p className="mt-2 text-xs text-slate-500">
              Showing the latest of {resultRows.length} season rows.
            </p>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-slate-800">
            Confidence and uncertainty
          </h3>
          {uncertainty.length > 0 ? (
            <ul className="space-y-2">
              {uncertainty.map(reason => (
                <li
                  className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900"
                  key={reason}
                >
                  {reason}
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-900">
              Full historical sample and projection range are available.
            </p>
          )}
        </section>
      </div>
    </div>
  )
}

export default PlayerComparisonDrawer
