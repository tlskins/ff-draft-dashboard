import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import {
  AnalysisQueryResponse,
  executeHistoricalAnalysis,
  ScoringProfileId,
} from "../../behavior/api/historicalAnalysis"
import type {
  DraftRecommendationSet,
} from "../../behavior/draft-advisor/recommendations"
import type {
  PlayerStatusCacheSnapshot,
} from "../../behavior/api/playerStatusCache"
import {
  AnalysisPosition,
  buildAnalysisViewQuery,
} from "../../behavior/analysis/presets"
import {
  buildPositionalBestsPresentationModel,
} from "../../behavior/analysis/positionalBests"
import {
  buildCrossPositionPresentationModel,
} from "../../behavior/analysis/crossPosition"
import {
  buildTierLandscapePresentationModel,
} from "../../behavior/analysis/tierLandscape"
import type {
  OpponentForecast,
} from "../../behavior/draft-advisor/types"
import {
  ANALYSIS_VIEW_DEFINITIONS,
  AnalysisViewAction,
  AnalysisViewNavigationEvent,
  AnalysisViewState,
  DEFAULT_ANALYSIS_VIEW_STATE,
  restoreAnalysisViewState,
  serializeAnalysisViewState,
  transitionAnalysisViewState,
} from "../../behavior/analysis/viewState"
import {getPlayerMetrics} from "../../behavior/draft"
import {
  BoardSettings,
  FantasySettings,
  Player,
  RankingSummary,
} from "../../types"
import DeclarativeChart from "./DeclarativeChart"
import CrossPositionLiveSurface from "./CrossPositionLiveSurface"
import PlayerComparisonDrawer from "./PlayerComparisonDrawer"
import PositionalBestsLiveSurface from "./PositionalBestsLiveSurface"
import TierLandscapeLiveSurface from "./TierLandscapeLiveSurface"


interface AnalysisWorkspaceProps {
  players: Player[]
  /** Explicit live-board availability; never inferred from the player library. */
  availablePlayers?: Player[]
  activePlayer?: Player | null
  settings: FantasySettings
  boardSettings: BoardSettings
  rankingSummaries: RankingSummary[]
  recommendations?: DraftRecommendationSet | null
  opponentForecast?: OpponentForecast | null
  playerStatus?: PlayerStatusCacheSnapshot
  analysisViewEvent?: AnalysisViewNavigationEvent | null
  onAnalysisViewEventHandled?: (
    event: AnalysisViewNavigationEvent,
  ) => void
  onClose?: () => void
}

const POSITIONS: AnalysisPosition[] = ["QB", "RB", "WR", "TE"]
const COMPLETED_SEASONS = [2021, 2022, 2023, 2024, 2025]
const VIEW_STATE_STORAGE_KEY = "drafty-analysis-view-state"

const loadViewState = (): AnalysisViewState => {
  if (typeof localStorage === "undefined") {
    return {...DEFAULT_ANALYSIS_VIEW_STATE}
  }
  try {
    const parsed = JSON.parse(
      localStorage.getItem(VIEW_STATE_STORAGE_KEY) || "null",
    )
    return restoreAnalysisViewState(parsed)
  } catch {
    return {...DEFAULT_ANALYSIS_VIEW_STATE}
  }
}

const formatField = (field: string) => field
  .replaceAll("_", " ")
  .replace(/\b\w/g, character => character.toUpperCase())

const formatValue = (value: string | number | undefined) => (
  typeof value === "number" ? value.toFixed(1) : value || "—"
)

const AnalysisWorkspace: React.FC<AnalysisWorkspaceProps> = ({
  players,
  availablePlayers = [],
  activePlayer,
  settings,
  boardSettings,
  rankingSummaries,
  recommendations = null,
  opponentForecast = null,
  playerStatus = {},
  analysisViewEvent,
  onAnalysisViewEventHandled,
  onClose,
}) => {
  const eligiblePlayers = useMemo(() => players
    .filter(player =>
      POSITIONS.includes(player.position as AnalysisPosition))
    .sort((left, right) => left.fullName.localeCompare(right.fullName)),
  [players])
  const [position, setPosition] = useState<AnalysisPosition>(
    (activePlayer?.position as AnalysisPosition) || "RB",
  )
  const positionPlayers = useMemo(
    () => eligiblePlayers.filter(player => player.position === position),
    [eligiblePlayers, position],
  )
  const [primaryId, setPrimaryId] = useState(activePlayer?.id || "")
  const [secondaryId, setSecondaryId] = useState("")
  const [viewState, setViewState] =
    useState<AnalysisViewState>(loadViewState)
  const [seasonWindow, setSeasonWindow] = useState<1 | 3 | 5>(3)
  const [scoringProfile, setScoringProfile] =
    useState<ScoringProfileId>(settings.ppr ? "ppr" : "standard")
  const [result, setResult] =
    useState<AnalysisQueryResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [drawerPlayerId, setDrawerPlayerId] = useState<string | null>(
    null,
  )
  const [drawerPlayerOrigin, setDrawerPlayerOrigin] = useState<
    "historical" | "live" | null
  >(null)
  const [advisorAnnouncement, setAdvisorAnnouncement] = useState("")
  const positionalBestsModel = useMemo(() => (
    recommendations
      ? buildPositionalBestsPresentationModel({
          recommendations,
          boardSettings,
          settings,
          playerStatus,
        })
      : null
  ), [boardSettings, playerStatus, recommendations, settings])
  const crossPositionModel = useMemo(() => (
    recommendations
      ? buildCrossPositionPresentationModel({
          recommendations,
          boardSettings,
          settings,
          playerStatus,
        })
      : null
  ), [boardSettings, playerStatus, recommendations, settings])
  const tierLandscapeModel = useMemo(() => (
    buildTierLandscapePresentationModel({
      availablePlayers,
      recommendations,
      opponentForecast,
      boardSettings,
      settings,
      rankingSummaries,
    })
  ), [
    availablePlayers,
    boardSettings,
    opponentForecast,
    rankingSummaries,
    recommendations,
    settings,
  ])
  const analysisRequestId = useRef(0)
  const viewStateRef = useRef(viewState)
  viewStateRef.current = viewState
  const clearAnalysisState = useCallback(() => {
    analysisRequestId.current += 1
    setResult(null)
    setError(null)
    setDrawerPlayerId(null)
    setDrawerPlayerOrigin(null)
    setLoading(false)
  }, [])

  useEffect(() => {
    const nextPrimary = activePlayer?.id || positionPlayers[0]?.id || ""
    if (!primaryId || activePlayer) {
      setPrimaryId(nextPrimary)
    }
  }, [activePlayer, positionPlayers, primaryId])

  useEffect(() => {
    const candidate = positionPlayers.find(player =>
      player.id !== primaryId)
    if (
      !secondaryId ||
      secondaryId === primaryId ||
      !positionPlayers.some(player => player.id === secondaryId)
    ) {
      setSecondaryId(candidate?.id || "")
    }
  }, [positionPlayers, primaryId, secondaryId])

  useEffect(() => {
    if (activePlayer) {
      setPosition(activePlayer.position as AnalysisPosition)
    }
  }, [activePlayer])

  useEffect(() => {
    setScoringProfile(settings.ppr ? "ppr" : "standard")
  }, [settings.ppr])

  useEffect(() => {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(
        VIEW_STATE_STORAGE_KEY,
        JSON.stringify(serializeAnalysisViewState(viewState)),
      )
    }
  }, [viewState])

  useEffect(() => {
    if (!analysisViewEvent) return
    const transition = transitionAnalysisViewState(
      viewStateRef.current,
      analysisViewEvent.kind === "confirmed_manual"
        ? {
            type: "confirmed_manual_select",
            event: analysisViewEvent,
          }
        : {
            type: "advisor_recommendation",
            recommendation: analysisViewEvent,
          },
    )
    if (transition.changed) {
      viewStateRef.current = transition.state
      setViewState(transition.state)
      if (transition.viewChanged) clearAnalysisState()
      if (transition.confirmedManualAction === "applied") {
        setAdvisorAnnouncement(
          `Selected ${analysisViewEvent.view.replace(/_/g, " ")} from a `
          + `confirmed advisor recommendation. ${analysisViewEvent.explanation}`,
        )
      } else if (transition.advisorAction === "pending") {
        setAdvisorAnnouncement(
          `Advisor recommends ${analysisViewEvent.view.replace(/_/g, " ")}. `
          + `${analysisViewEvent.explanation} Your pinned view was preserved.`,
        )
      } else if (transition.advisorAction === "applied") {
        setAdvisorAnnouncement(
          `Advisor selected ${analysisViewEvent.view.replace(/_/g, " ")}. `
          + analysisViewEvent.explanation,
        )
      }
    }
    onAnalysisViewEventHandled?.(analysisViewEvent)
  }, [
    analysisViewEvent,
    clearAnalysisState,
    onAnalysisViewEventHandled,
  ])

  const selectedPlayerIds = [primaryId, secondaryId].filter(Boolean)
  const crossPositionPlayerIds = useMemo(() => POSITIONS.flatMap(
    candidatePosition => {
      const ranked = eligiblePlayers
        .filter(player => player.position === candidatePosition)
        .map(player => ({
          player,
          rank: getPlayerMetrics(
            player,
            settings,
            boardSettings,
          ).posRank || Number.MAX_SAFE_INTEGER,
        }))
        .sort((left, right) => left.rank - right.rank)
      return ranked[0] ? [ranked[0].player.id] : []
    },
  ), [boardSettings, eligiblePlayers, settings])
  const activeView = ANALYSIS_VIEW_DEFINITIONS.find(
    definition => definition.id === viewState.view,
  ) || ANALYSIS_VIEW_DEFINITIONS[0]
  const drawerPlayerIsValid = drawerPlayerOrigin !== "live"
    || (
      viewState.view === "positional_bests"
      && Boolean(positionalBestsModel?.candidates.some(candidate =>
        candidate.player.id === drawerPlayerId))
    )
    || (
      viewState.view === "tier_landscape"
      && Boolean(tierLandscapeModel.lanes.some(lane =>
        lane.visibleTierBands.some(band => band.players.some(player =>
          player.player.id === drawerPlayerId))))
    )
    || (
      viewState.view === "cross_position"
      && Boolean(crossPositionModel?.candidates.some(candidate =>
        candidate.player.id === drawerPlayerId))
    )
  const drawerPlayer = drawerPlayerIsValid
    ? eligiblePlayers.find(player => player.id === drawerPlayerId)
      || positionalBestsModel?.candidates.find(candidate =>
        candidate.player.id === drawerPlayerId)?.player
      || tierLandscapeModel.lanes.flatMap(lane =>
        lane.visibleTierBands.flatMap(band => band.players))
        .find(player => player.player.id === drawerPlayerId)?.player
      || crossPositionModel?.candidates.find(candidate =>
        candidate.player.id === drawerPlayerId)?.player
      || null
    : null
  const canRun = (
    viewState.view === "cross_position"
      ? crossPositionPlayerIds.length > 0
      : viewState.view === "intra_position"
        ? selectedPlayerIds.length > 0
        : positionPlayers.length > 0
  )

  useEffect(() => {
    if (
      ["positional_bests", "tier_landscape", "cross_position"].includes(
        viewState.view,
      )
      && drawerPlayerId
      && !drawerPlayerIsValid
    ) {
      setDrawerPlayerId(null)
      setDrawerPlayerOrigin(null)
    }
  }, [drawerPlayerId, drawerPlayerIsValid, viewState.view])

  const inspectLivePlayer = (player: Player) => {
    setDrawerPlayerOrigin("live")
    setDrawerPlayerId(player.id)
  }

  const inspectHistoricalPlayer = (playerId: string) => {
    setDrawerPlayerOrigin("historical")
    setDrawerPlayerId(playerId)
  }

  const applyViewAction = (
    action: AnalysisViewAction,
    announcement = "",
  ) => {
    const transition = transitionAnalysisViewState(viewState, action)
    if (!transition.changed) return
    setViewState(transition.state)
    if (transition.viewChanged) clearAnalysisState()
    if (announcement) setAdvisorAnnouncement(announcement)
  }

  const selectView = (
    view: AnalysisViewState["view"],
    explanation: string,
  ) => {
    applyViewAction({
      type: "manual_select",
      view,
      explanation,
    })
  }

  const toggleNavigationMode = () => {
    const transition = transitionAnalysisViewState(viewState, {
      type: "set_pinned",
      pinned: !viewState.pinned,
    })
    if (!transition.changed) return
    setViewState(transition.state)
    if (transition.viewChanged) clearAnalysisState()
    if (transition.advisorAction === "applied" && transition.advisorRecommendation) {
      const recommendation = transition.advisorRecommendation
      setAdvisorAnnouncement(
        `Automatic navigation restored. Applying the pending advisor `
        + `recommendation for ${recommendation.view.replace(/_/g, " ")}. `
        + recommendation.explanation,
      )
    }
  }

  const adoptPendingRecommendation = () => {
    const recommendation = viewState.pendingAdvisorRecommendation
    const transition = transitionAnalysisViewState(viewState, {
      type: "adopt_pending_recommendation",
    })
    if (!transition.changed) return
    setViewState(transition.state)
    if (transition.viewChanged) clearAnalysisState()
    if (recommendation) {
      setAdvisorAnnouncement(
        `Selected ${recommendation.view.replace(/_/g, " ")} manually from `
        + `the advisor recommendation. ${recommendation.explanation}`,
      )
    }
  }

  const runAnalysis = async () => {
    if (!canRun) return
    const requestId = ++analysisRequestId.current
    setLoading(true)
    setError(null)
    try {
      const query = buildAnalysisViewQuery({
        view: viewState.view,
        playerIds: selectedPlayerIds,
        crossPositionPlayerIds,
        position,
        seasonWindow,
        scoringProfile,
      })
      setDrawerPlayerId(null)
      setDrawerPlayerOrigin(null)
      const response = await executeHistoricalAnalysis(query)
      if (analysisRequestId.current === requestId) setResult(response)
    } catch (requestError) {
      if (analysisRequestId.current === requestId) {
        setResult(null)
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Historical analysis failed",
        )
      }
    } finally {
      if (analysisRequestId.current === requestId) setLoading(false)
    }
  }

  return (
    <section className="mx-auto w-full max-w-7xl rounded-xl border border-slate-200 bg-slate-50 p-3 text-left shadow-sm md:p-5">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
            Decision workspace · {viewState.pinned
              ? "Pinned navigation"
              : "Automatic navigation"}
          </p>
          <h1 className="text-2xl font-bold text-slate-900">
            Historical analysis workspace
          </h1>
          <p className="max-w-3xl text-sm text-slate-600">
            Build deterministic comparisons from nflverse weekly data.
            Every chart is generated from a validated API specification.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            aria-pressed={viewState.pinned}
            aria-label={viewState.pinned
              ? "Return to automatic navigation"
              : "Pin current view"}
            className={`rounded border px-3 py-2 text-sm font-semibold ${
              viewState.pinned
                ? "border-indigo-600 bg-indigo-600 text-white"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
            }`}
            onClick={toggleNavigationMode}
          >
            {viewState.pinned
              ? "Return to automatic navigation"
              : "Pin current view"}
          </button>
          {onClose && (
          <button
            className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            onClick={onClose}
          >
            Return to draft board
          </button>
          )}
        </div>
      </header>

      <div
        className={`mb-4 rounded-lg border p-3 text-sm ${
          viewState.source === "agent"
            ? "border-violet-200 bg-violet-50 text-violet-900"
            : "border-indigo-100 bg-indigo-50 text-indigo-900"
        }`}
      >
        <span className="font-semibold">
          {viewState.source === "agent"
            ? "Current view selected by advisor: "
            : "Current view selected manually: "}
        </span>
        {viewState.explanation}
        <span className="ml-2 rounded bg-white px-2 py-0.5 text-xs font-semibold">
          {viewState.pinned
            ? "Pinned: advisor cannot replace this view"
            : "Automatic: advisor may change this view"}
        </span>
      </div>
      <div
        aria-atomic="true"
        aria-live="polite"
        className="sr-only"
        role="status"
      >
        {advisorAnnouncement}
      </div>

      {viewState.pendingAdvisorRecommendation && (
        <div
          aria-atomic="true"
          aria-live="polite"
          className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"
          role="status"
        >
          <div>
            <p className="font-semibold">Pending advisor recommendation</p>
            <p>
              Advisor recommends{" "}
              <span className="font-semibold">
                {ANALYSIS_VIEW_DEFINITIONS.find(definition =>
                  definition.id === viewState.pendingAdvisorRecommendation?.view,
                )?.label}
              </span>
              . {viewState.pendingAdvisorRecommendation.explanation} Your
              current pinned view was preserved.
            </p>
          </div>
          <button
            aria-label="Review pending advisor recommendation"
            className="rounded border border-amber-700 bg-white px-3 py-2 font-semibold text-amber-900 hover:bg-amber-100"
            onClick={adoptPendingRecommendation}
          >
            Review recommendation
          </button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-12">
        <aside className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 lg:col-span-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Analysis
            </p>
            <div
              aria-label="Analysis views"
              className="grid grid-cols-1 gap-2 sm:grid-cols-2"
              role="group"
            >
              {ANALYSIS_VIEW_DEFINITIONS.map(candidate => (
                <button
                  aria-label={candidate.label}
                  aria-pressed={viewState.view === candidate.id}
                  className={`rounded-lg border p-2 text-left transition ${
                    viewState.view === candidate.id
                      ? "border-indigo-500 bg-indigo-50 text-indigo-900"
                      : "border-slate-200 hover:border-slate-400"
                  }`}
                  key={candidate.id}
                  onClick={() =>
                    selectView(candidate.id, candidate.explanation)}
                >
                  <span className="block text-sm font-semibold">
                    {candidate.shortLabel}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {candidate.description}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <fieldset>
            <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Scope
            </legend>
            {viewState.view !== "cross_position" && (
            <label className="mb-2 block text-sm">
              Position
              <select
                aria-label="Analysis position"
                className="mt-1 w-full rounded border border-slate-300 p-2"
                value={position}
                onChange={event => {
                  setPosition(event.target.value as AnalysisPosition)
                  setPrimaryId("")
                  setSecondaryId("")
                }}
              >
                {POSITIONS.map(value => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>
            )}
            {viewState.view === "intra_position" && (
              <>
                <label className="mb-2 block text-sm">
                  Player A
                  <select
                    aria-label="Analysis primary player"
                    className="mt-1 w-full rounded border border-slate-300 p-2"
                    value={primaryId}
                    onChange={event => setPrimaryId(event.target.value)}
                  >
                    {positionPlayers.map(player => (
                      <option key={player.id} value={player.id}>
                        {player.fullName}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  Player B
                  <select
                    aria-label="Analysis comparison player"
                    className="mt-1 w-full rounded border border-slate-300 p-2"
                    value={secondaryId}
                    onChange={event => setSecondaryId(event.target.value)}
                  >
                    {positionPlayers
                      .filter(player => player.id !== primaryId)
                      .map(player => (
                        <option key={player.id} value={player.id}>
                          {player.fullName}
                        </option>
                      ))}
                  </select>
                </label>
              </>
            )}
            {viewState.view === "cross_position" && (
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="mb-2 text-xs text-slate-500">
                  Historical comparison players selected independently from live
                  advisor candidates
                </p>
                <div className="flex flex-wrap gap-1">
                  {crossPositionPlayerIds.map(playerId => {
                    const player = eligiblePlayers.find(
                      candidate => candidate.id === playerId,
                    )
                    return player ? (
                      <span
                        className="rounded bg-white px-2 py-1 text-xs shadow-sm"
                        key={player.id}
                      >
                        {player.position}: {player.fullName}
                      </span>
                    ) : null
                  })}
                </div>
              </div>
            )}
            {["tier_landscape", "positional_bests", "cross_position"].includes(
              viewState.view,
            ) && (
              <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                {viewState.view === "positional_bests"
                  ? "The live comparison uses the supplied deterministic advisor candidates. Historical controls below remain a manual drilldown for the selected position."
                  : viewState.view === "tier_landscape"
                    ? "The live landscape above uses only explicitly available draft-board players. Historical controls below remain a separate manual drilldown."
                    : "The live comparison above uses only supplied deterministic advisor candidates. These historical selections are separate and run only when you choose Run analysis."}
              </p>
            )}
          </fieldset>

          <div className="grid grid-cols-2 gap-2">
            <label className="text-sm">
              Seasons
              <select
                aria-label="Analysis season window"
                className="mt-1 w-full rounded border border-slate-300 p-2"
                value={seasonWindow}
                onChange={event =>
                  setSeasonWindow(Number(event.target.value) as 1 | 3 | 5)}
              >
                <option value={1}>2025</option>
                <option value={3}>2023–2025</option>
                <option value={5}>2021–2025</option>
              </select>
            </label>
            <label className="text-sm">
              Scoring
              <select
                aria-label="Analysis scoring profile"
                className="mt-1 w-full rounded border border-slate-300 p-2"
                value={scoringProfile}
                onChange={event =>
                  setScoringProfile(event.target.value as ScoringProfileId)}
              >
                <option value="standard">Standard</option>
                <option value="half_ppr">Half PPR</option>
                <option value="ppr">PPR</option>
              </select>
            </label>
          </div>

          <button
            className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            disabled={!canRun || loading}
            onClick={() => void runAnalysis()}
          >
            {loading ? "Running analysis…" : "Run analysis"}
          </button>
        </aside>

        <div className="space-y-3 lg:col-span-8">
          {viewState.view === "positional_bests" && (
            <PositionalBestsLiveSurface
              model={positionalBestsModel}
              onInspectPlayer={inspectLivePlayer}
            />
          )}
          {viewState.view === "tier_landscape" && (
            <TierLandscapeLiveSurface
              model={tierLandscapeModel}
              onInspectPlayer={inspectLivePlayer}
            />
          )}
          {viewState.view === "cross_position" && (
            <CrossPositionLiveSurface
              model={crossPositionModel}
              onInspectPlayer={inspectLivePlayer}
            />
          )}
          {viewState.view === "positional_bests" && (
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <h2 className="font-semibold text-slate-900">
                Historical positional drilldown
              </h2>
              <p className="text-xs text-slate-500">
                Run the existing bounded historical query independently of the
                live recommendation surface.
              </p>
            </div>
          )}
          {viewState.view === "tier_landscape" && (
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <h2 className="font-semibold text-slate-900">
                Historical positional tier drilldown
              </h2>
              <p className="text-xs text-slate-500">
                Run the existing bounded historical query independently of the
                live tier landscape.
              </p>
            </div>
          )}
          {viewState.view === "cross_position" && (
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <h2 className="font-semibold text-slate-900">
                Historical cross-position drilldown
              </h2>
              <p className="text-xs text-slate-500">
                The historical selections are distinct from live advisor
                candidates and run only when you request the bounded query.
              </p>
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Analysis unavailable: {error}
            </div>
          )}
          {!result && !error && (
            <div className="flex min-h-80 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
              Choose a view and run the analysis to build a chart.
            </div>
          )}
          {result && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-semibold text-slate-900">
                    {activeView.label}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {COMPLETED_SEASONS.slice(-seasonWindow)[0]}–2025 ·{" "}
                    {result.row_count} grouped rows ·{" "}
                    {result.scoring_profile.id.replace("_", " ")}
                  </p>
                </div>
                {result.truncated && (
                  <span className="rounded bg-amber-100 px-2 py-1 text-xs text-amber-800">
                    Display limited to {result.rows.length} rows
                  </span>
                )}
              </div>
              <DeclarativeChart
                onSelectPlayer={inspectHistoricalPlayer}
                response={result}
              />
              <details className="rounded-lg border border-slate-200 bg-white">
                <summary className="cursor-pointer p-3 text-sm font-semibold">
                  Inspect validated dataset
                </summary>
                <div className="overflow-x-auto border-t border-slate-200">
                  <table className="min-w-full text-xs">
                    <thead className="bg-slate-50">
                      <tr>
                        {result.columns.dimensions.map(field => (
                          <th className="p-2 text-left" key={field}>
                            {formatField(field)}
                          </th>
                        ))}
                        {result.columns.metrics.map(field => (
                          <th className="p-2 text-right" key={field}>
                            {formatField(field)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.slice(0, 50).map((row, index) => (
                        <tr
                          className="border-t border-slate-100"
                          key={JSON.stringify(row.dimensions) + index}
                        >
                          {result.columns.dimensions.map(field => (
                            <td className="p-2" key={field}>
                              {field === "player_name" &&
                              typeof row.dimensions.player_id === "string" ? (
                                <button
                                  className="font-semibold text-indigo-700 hover:underline"
                                  onClick={() => inspectHistoricalPlayer(
                                    String(row.dimensions.player_id),
                                  )}
                                >
                                  {formatValue(row.dimensions[field])}
                                </button>
                              ) : formatValue(row.dimensions[field])}
                            </td>
                          ))}
                          {result.columns.metrics.map(field => (
                            <td className="p-2 text-right" key={field}>
                              {formatValue(row.metrics[field])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
              <p className="text-xs text-slate-500">
                Recomputed from {result.sources.length} nflverse weekly
                source{result.sources.length === 1 ? "" : "s"}.
              </p>
            </>
          )}
        </div>
      </div>
      {drawerPlayer && (
        <PlayerComparisonDrawer
          boardSettings={boardSettings}
          onClose={() => {
            setDrawerPlayerId(null)
            setDrawerPlayerOrigin(null)
          }}
          player={drawerPlayer}
          rankingSummaries={rankingSummaries}
          response={result}
          settings={settings}
        />
      )}
    </section>
  )
}

export default AnalysisWorkspace
