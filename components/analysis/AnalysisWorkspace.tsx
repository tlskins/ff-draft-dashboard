import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import {
  AnalysisQueryResponse,
  ScoringProfileId,
} from "../../behavior/api/historicalAnalysis"
import {
  HistoricalComparisonResponse,
} from "../../behavior/api/historical"
import {
  loadHistoricalComparisonResource,
  loadHistoricalQueryResource,
} from "../../behavior/api/historicalResources"
import {useReadApiCache} from "../../behavior/api/readApiContext"
import {
  buildCompletedSeasonWindows,
  formatSeasonList,
  useDataReadiness,
} from "../../behavior/api/dataReadiness"
import type {
  DraftRecommendationSet,
} from "../../behavior/draft-advisor/recommendations"
import type {
  PlayerStatusCacheSnapshot,
} from "../../behavior/api/playerStatusCache"
import type {
  AdvisorComparisonController,
} from "../../behavior/hooks/useAdvisorComparisonController"
import {advisorComparisonSetSignature} from "../../behavior/advisorComparisonSet"
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
import {
  buildIntraPositionPresentationModel,
} from "../../behavior/analysis/intraPosition"
import type {
  IntraPosition,
} from "../../behavior/analysis/intraPosition"
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
  userFacingAnalysisViewDefinition,
  userFacingAnalysisViewId,
  userFacingAnalysisViewLabel,
} from "../../behavior/analysis/viewState"
import {
  BoardSettings,
  FantasySettings,
  Player,
  RankingSummary,
} from "../../types"
import DeclarativeChart from "./DeclarativeChart"
import CrossPositionLiveSurface from "./CrossPositionLiveSurface"
import IntraPositionLiveSurface from "./IntraPositionLiveSurface"
import PlayerComparisonDrawer from "./PlayerComparisonDrawer"
import PlayerLabHistorical from "./PlayerLabHistorical"
import TierLandscapeLiveSurface from "./TierLandscapeLiveSurface"
import type {TierRunwayForecast} from "./TierLandscapeLiveSurface"
import styles from "./AnalysisRedesign.module.css"
import AdvisorComparisonSurface from "../AdvisorComparisonSurface"


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
  /** Optional run probabilities for the user's next one to three turns. */
  tierRunwayForecast?: TierRunwayForecast
  playerStatus?: PlayerStatusCacheSnapshot
  analysisViewEvent?: AnalysisViewNavigationEvent | null
  onAnalysisViewEventHandled?: (
    event: AnalysisViewNavigationEvent,
  ) => void
  /** The draft desk keeps board focus in its profile pane, not Player Lab. */
  followActivePlayer?: boolean
  /** The embedded desk pane keeps controls readable at laptop widths. */
  compact?: boolean
  comparisonController: AdvisorComparisonController
  onClose?: () => void
}

export const comparisonQueryScopeSignature = (
  playerIds: string[],
): string => JSON.stringify(playerIds)

const POSITIONS: AnalysisPosition[] = ["QB", "RB", "WR", "TE"]
const VIEW_STATE_STORAGE_KEY = "drafty-analysis-view-state"
const VISIBLE_ANALYSIS_VIEW_IDS: AnalysisViewState["view"][] = [
  "cross_position",
  "tier_landscape",
  "intra_position",
]
const PLAYER_LAB_COLORS = ["#4f46e5", "#0891b2", "#d97706", "#dc2626", "#7c3aed"]
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

const resultSeasonLabel = (
  seasons: AnalysisQueryResponse["query"]["seasons"],
): string => formatSeasonList(Array.isArray(seasons)
  ? seasons
  : Array.from(
      {length: seasons.end - seasons.start + 1},
      (_, index) => seasons.start + index,
    ))

const AnalysisWorkspace: React.FC<AnalysisWorkspaceProps> = ({
  players,
  availablePlayers = [],
  activePlayer,
  settings,
  boardSettings,
  rankingSummaries,
  recommendations = null,
  opponentForecast = null,
  tierRunwayForecast = {},
  playerStatus = {},
  analysisViewEvent,
  onAnalysisViewEventHandled,
  followActivePlayer = true,
  compact = false,
  comparisonController,
  onClose,
}) => {
  const readApiCache = useReadApiCache()
  const readiness = useDataReadiness()
  const completedSeasonWindows = useMemo(
    () => readiness.data
      ? buildCompletedSeasonWindows(readiness.data)
      : [],
    [readiness.data],
  )
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
  const selectedPlayerIds = comparisonController.items.map(item => (
    item.player.id
  ))
  const comparisonAnnouncementIdentity = advisorComparisonSetSignature(
    comparisonController.items,
  )
  const comparisonQueryScope = comparisonQueryScopeSignature(selectedPlayerIds)
  const [viewState, setViewState] =
    useState<AnalysisViewState>(loadViewState)
  const [seasonWindow, setSeasonWindow] = useState<1 | 3 | 5>(5)
  const [scoringProfile, setScoringProfile] =
    useState<ScoringProfileId>(settings.ppr ? "ppr" : "standard")
  const [result, setResult] =
    useState<AnalysisQueryResponse | null>(null)
  const [playerLabResult, setPlayerLabResult] =
    useState<HistoricalComparisonResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [playerLabError, setPlayerLabError] = useState<string | null>(null)
  const [historyControlsOpen, setHistoryControlsOpen] = useState(true)
  const [drawerPlayerId, setDrawerPlayerId] = useState<string | null>(
    null,
  )
  const [drawerPlayerOrigin, setDrawerPlayerOrigin] = useState<
    "historical" | "live" | null
  >(null)
  const [advisorAnnouncement, setAdvisorAnnouncement] = useState("")
  const selectedSeasonWindow = completedSeasonWindows.find(
    window => window.size === seasonWindow,
  ) || null
  const selectedSeasons = selectedSeasonWindow?.seasons || []
  const completedSeasonCount = readiness.data
    ? new Set(readiness.data.imported_weekly_seasons
        .filter(source => source.classification === "completed")
        .map(source => source.season)).size
    : 0
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
          comparisonItems: comparisonController.items,
        })
      : null
  ), [
    boardSettings,
    comparisonController.items,
    playerStatus,
    recommendations,
    settings,
  ])
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
  const intraPositionModel = useMemo(() => (
    buildIntraPositionPresentationModel({
      position: position as IntraPosition,
      availablePlayers,
      boardSettings,
      settings,
      rankingSummaries,
      playerStatus,
    })
  ), [
    availablePlayers,
    boardSettings,
    playerStatus,
    position,
    rankingSummaries,
    settings,
  ])
  const analysisRequestId = useRef(0)
  const comparisonQueryScopeRef = useRef(comparisonQueryScope)
  const activeComparisonQueryScopeRef = useRef(comparisonQueryScope)
  activeComparisonQueryScopeRef.current = comparisonQueryScope
  const viewStateRef = useRef(viewState)
  viewStateRef.current = viewState
  const clearAnalysisState = useCallback(() => {
    analysisRequestId.current += 1
    setResult(null)
    setPlayerLabResult(null)
    setError(null)
    setPlayerLabError(null)
    setDrawerPlayerId(null)
    setDrawerPlayerOrigin(null)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (comparisonQueryScopeRef.current === comparisonQueryScope) return
    comparisonQueryScopeRef.current = comparisonQueryScope
    clearAnalysisState()
  }, [clearAnalysisState, comparisonQueryScope])

  useEffect(() => {
    if (followActivePlayer && activePlayer) {
      setPosition(activePlayer.position as AnalysisPosition)
    }
  }, [activePlayer, followActivePlayer])

  useEffect(() => {
    setScoringProfile(settings.ppr ? "ppr" : "standard")
  }, [settings.ppr])

  useEffect(() => {
    if (!readiness.data || completedSeasonWindows.length === 0) return
    if (completedSeasonWindows.some(window => window.size === seasonWindow)) {
      return
    }
    setSeasonWindow(
      completedSeasonWindows[completedSeasonWindows.length - 1].size,
    )
  }, [completedSeasonWindows, readiness.data, seasonWindow])

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
          `Selected ${userFacingAnalysisViewLabel(analysisViewEvent.view)} from a `
          + `confirmed advisor recommendation. ${analysisViewEvent.explanation}`,
        )
      } else if (transition.advisorAction === "pending") {
        setAdvisorAnnouncement(
          `Advisor recommends ${userFacingAnalysisViewLabel(analysisViewEvent.view)}. `
          + `${analysisViewEvent.explanation} Your pinned view was preserved.`,
        )
      } else if (transition.advisorAction === "applied") {
        setAdvisorAnnouncement(
          `Advisor selected ${userFacingAnalysisViewLabel(analysisViewEvent.view)}. `
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

  const activeView = userFacingAnalysisViewDefinition(viewState.view)
  const drawerPlayerIsValid = drawerPlayerOrigin !== "live"
    || (
      viewState.view === "positional_bests"
      && Boolean(tierLandscapeModel.lanes.some(lane =>
        lane.players.some(player => player.player.id === drawerPlayerId)))
    )
    || (
      viewState.view === "tier_landscape"
      && Boolean(tierLandscapeModel.lanes.some(lane =>
        lane.players.some(player => player.player.id === drawerPlayerId)))
    )
    || (
      viewState.view === "cross_position"
      && (
        Boolean(crossPositionModel?.candidates.some(candidate =>
          candidate.player.id === drawerPlayerId))
        || Boolean(tierLandscapeModel.lanes.some(lane =>
          lane.players.some(player => player.player.id === drawerPlayerId)))
      )
    )
    || (
      viewState.view === "intra_position"
      && Boolean(intraPositionModel.players.some(candidate =>
        candidate.player.id === drawerPlayerId))
    )
  const liveIntraPositionDrawerPlayer = (
    drawerPlayerOrigin === "live" && viewState.view === "intra_position"
      ? intraPositionModel.players.find(candidate =>
        candidate.player.id === drawerPlayerId)?.player || null
      : null
  )
  const drawerPlayer = drawerPlayerIsValid
    ? liveIntraPositionDrawerPlayer
      || eligiblePlayers.find(player => player.id === drawerPlayerId)
      || positionalBestsModel?.candidates.find(candidate =>
        candidate.player.id === drawerPlayerId)?.player
      || tierLandscapeModel.lanes.flatMap(lane =>
        lane.players)
        .find(player => player.player.id === drawerPlayerId)?.player
      || crossPositionModel?.candidates.find(candidate =>
        candidate.player.id === drawerPlayerId)?.player
      || intraPositionModel.players.find(candidate =>
        candidate.player.id === drawerPlayerId)?.player
      || null
    : null
  const canRun = Boolean(selectedSeasonWindow) && !readiness.loading
    && !readiness.error && (
    viewState.view === "cross_position"
      ? selectedPlayerIds.length > 0
      : viewState.view === "intra_position"
        ? selectedPlayerIds.length === 3
        : positionPlayers.length > 0
  )

  useEffect(() => {
    if (
      [
        "positional_bests",
        "tier_landscape",
        "cross_position",
        "intra_position",
      ].includes(
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
        + `recommendation for ${userFacingAnalysisViewLabel(recommendation.view)}. `
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
        `Selected ${userFacingAnalysisViewLabel(recommendation.view)} manually from `
        + `the advisor recommendation. ${recommendation.explanation}`,
      )
    }
  }

  const runAnalysis = async () => {
    if (!canRun) return
    const requestId = ++analysisRequestId.current
    const requestComparisonScope = comparisonQueryScope
    setLoading(true)
    setError(null)
    setPlayerLabError(null)
    try {
      const query = buildAnalysisViewQuery({
        view: viewState.view,
        playerIds: selectedPlayerIds,
        crossPositionPlayerIds: selectedPlayerIds,
        position,
        seasons: selectedSeasons,
        scoringProfile,
      })
      setDrawerPlayerId(null)
      setDrawerPlayerOrigin(null)
      const [analysisOutcome, labOutcome] = await Promise.allSettled([
        loadHistoricalQueryResource(readApiCache, query),
        viewState.view === "intra_position"
          ? loadHistoricalComparisonResource(readApiCache, {
              playerIds: selectedPlayerIds,
              seasons: selectedSeasons,
              scoringProfile,
            })
          : Promise.resolve(null),
      ])
      if (
        analysisRequestId.current !== requestId
        || activeComparisonQueryScopeRef.current !== requestComparisonScope
      ) return
      if (analysisOutcome.status === "fulfilled") {
        const resource = analysisOutcome.value
        setResult(resource.data)
        setError(resource.state === "ready" || resource.state === "stale"
          ? null
          : resource.unavailableReason || resource.error
            || "Historical analysis failed")
      } else {
        setResult(null)
        setError(
          analysisOutcome.reason instanceof Error
            ? analysisOutcome.reason.message
            : "Historical analysis failed",
        )
      }
      if (labOutcome.status === "fulfilled") {
        const resource = labOutcome.value
        setPlayerLabResult(resource?.data || null)
        setPlayerLabError(!resource || resource.state === "ready" || resource.state === "stale"
          ? null
          : resource.unavailableReason || resource.error
            || "Player Lab history failed")
      } else {
        setPlayerLabResult(null)
        setPlayerLabError(
          labOutcome.reason instanceof Error
            ? labOutcome.reason.message
            : "Player Lab history failed",
        )
      }
    } finally {
      if (
        analysisRequestId.current === requestId
        && activeComparisonQueryScopeRef.current === requestComparisonScope
      ) setLoading(false)
    }
  }

  return (
    <section className={`mx-auto w-full max-w-7xl border border-slate-200 bg-slate-50 text-left ${compact ? "rounded p-1 shadow-none" : "rounded-xl p-3 shadow-sm md:p-5"}`}>
      <header className={`${compact ? "mb-2 gap-1" : "mb-4 gap-3"} flex flex-wrap items-start justify-between`}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
            Decision workspace · {viewState.pinned
              ? "Pinned navigation"
              : "Automatic navigation"}
          </p>
          <h1 className={`${compact ? "text-lg" : "text-2xl"} font-bold text-slate-900`}>
            Draft decision workspace
          </h1>
          <p className="max-w-3xl text-sm text-slate-600">
            Compare the board now, explore position tiers, and review how
            similar players scored week by week.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            aria-pressed={viewState.pinned}
            aria-label={viewState.pinned
              ? "Return to automatic navigation"
              : "Pin current view"}
            className={`cursor-pointer rounded-lg border px-3 py-2 text-sm font-semibold shadow-sm transition hover:-translate-y-0.5 hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
              viewState.pinned
                ? "border-indigo-500 bg-indigo-100 text-indigo-950 ring-2 ring-indigo-200"
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
            className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-100 hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
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

      <AdvisorComparisonSurface
        availablePlayers={availablePlayers}
        controller={comparisonController}
      />
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
                {userFacingAnalysisViewLabel(
                  viewState.pendingAdvisorRecommendation.view,
                )}
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

      <nav aria-label="Analysis workspace views" className="mb-4 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
        <div
          aria-label="Analysis views"
          className={`grid grid-cols-1 gap-2 ${compact ? "" : "sm:grid-cols-3"}`}
          role="group"
        >
          {ANALYSIS_VIEW_DEFINITIONS.filter(candidate =>
            VISIBLE_ANALYSIS_VIEW_IDS.includes(candidate.id)).map(candidate => {
              const selected = userFacingAnalysisViewId(viewState.view) === candidate.id
              return (
                <button
                  aria-label={candidate.label}
                  aria-pressed={selected}
                  className={`cursor-pointer rounded-xl border-2 px-4 py-3 text-left text-slate-950 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${selected ? "border-indigo-500 bg-indigo-100 ring-2 ring-indigo-200" : "border-slate-300 bg-white hover:border-slate-500"}`}
                  key={candidate.id}
                  onClick={() => selectView(candidate.id, candidate.explanation)}
                >
                  <span className="block text-sm font-bold">{candidate.shortLabel}</span>
                  <span className="mt-0.5 block text-xs text-slate-600">{candidate.description}</span>
                  <span className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${selected ? "border-indigo-400 bg-white text-indigo-900" : "border-slate-300 bg-slate-100 text-slate-600"}`}>{selected ? "✓ Current view" : "Open view"}</span>
                </button>
              )
            })}
        </div>
      </nav>

      <div className="grid gap-4 lg:grid-cols-12">
        <aside className={`${viewState.view === "intra_position" ? "lg:order-1" : "lg:order-2"} lg:col-span-12`}>
          <details
            className="rounded-xl border border-slate-200 bg-white shadow-sm"
            onToggle={event => {
              if (viewState.view !== "intra_position") {
                setHistoryControlsOpen(event.currentTarget.open)
              }
            }}
            open={viewState.view === "intra_position" || historyControlsOpen}
          >
            {viewState.view !== "intra_position" && (
              <summary className="cursor-pointer rounded-xl px-4 py-3 text-sm font-bold text-slate-800 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
                Historical analysis · optional manual comparison
                <span className="ml-2 text-xs font-normal text-slate-500">Open controls</span>
              </summary>
            )}
            <div className={compact
              ? styles.compactLabControls
              : "grid gap-4 border-t border-slate-100 p-4 first:border-t-0 lg:grid-cols-12 lg:items-start"}>
          <div className={compact ? styles.compactLabControlsHeader : "lg:col-span-12"}>
            {viewState.view === "intra_position" ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Player Lab</p>
                <h2 className="text-xl font-bold text-slate-950">How different are their weekly outcomes?</h2>
                <p className="mt-1 text-xs text-slate-500">Use the shared maximum-three comparison set, then load the requested season data. Scoring distribution and playing-time evidence stay separate so the view never invents a cause.</p>
              </>
            ) : (
              <>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Optional history controls</p>
                <p className="mt-1 text-xs text-slate-500">The live decision visual above updates automatically. These controls only run a separate historical query.</p>
              </>
            )}
          </div>

          <div className={compact ? styles.compactLabControlsStatus : "lg:col-span-12"} aria-live="polite">
            {readiness.loading && (
              <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                Loading season availability and source freshness…
              </p>
            )}
            {readiness.error && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                Season metadata unavailable: {readiness.error}. Historical
                analysis is disabled until the API reports completed seasons.
              </p>
            )}
            {readiness.data && completedSeasonWindows.length === 0 && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                No completed historical seasons are available. Current or
                partial seasons are not used as a fallback.
              </p>
            )}
            {readiness.data && completedSeasonWindows.length > 0 && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                <p>
                  Rankings: {readiness.data.rankings.availability}
                  {readiness.data.rankings.season
                    ? ` · season ${readiness.data.rankings.season}`
                    : ""}
                  {readiness.data.rankings.cached_at
                    ? ` · cached ${readiness.data.rankings.cached_at}`
                    : ""}
                </p>
                <p>
                  Identity catalog: {readiness.data.identity_catalog.availability}
                  {readiness.data.identity_catalog.retrieved_at
                    ? ` · retrieved ${readiness.data.identity_catalog.retrieved_at}`
                    : ""}
                  {` · ${readiness.data.historical_identity_miss_count} historical identity misses`}
                </p>
                {completedSeasonCount < 3 && (
                  <p>Three- and five-season windows are unavailable because fewer than three completed seasons are imported.</p>
                )}
                {completedSeasonCount >= 3 && completedSeasonCount < 5 && (
                  <p>The five-season window is unavailable because fewer than five completed seasons are imported.</p>
                )}
              </div>
            )}
            {readiness.data
              && readiness.data.current_partial_seasons.length > 0 && (
              <p className="mt-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                {formatSeasonList(readiness.data.current_partial_seasons)} is
                current/partial and intentionally excluded from completed-history
                windows.
              </p>
            )}
          </div>

          <fieldset className={compact ? styles.compactLabControlsScope : "lg:col-span-7"}>
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
                }}
              >
                {POSITIONS.map(value => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>
            )}
            {viewState.view === "intra_position" && (
              <fieldset className="mt-3">
                <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Shared Player Lab set · {selectedPlayerIds.length}/3
                </legend>
                <p className="mt-1 text-xs text-slate-600" id="player-lab-selection-guidance">
                  The advisor comparison set is shared with Player Lab. Pin and edit it above; the historical API runs only when requested.
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Selected Player Lab players">
                  {comparisonController.items.map((item, index) => (
                    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold shadow-sm" key={item.player.id}>
                      <span className="h-2 w-2 rounded-full" style={{backgroundColor: PLAYER_LAB_COLORS[index % PLAYER_LAB_COLORS.length]}} />
                      {item.player.fullName}
                    </span>
                  ))}
                </div>
              </fieldset>
            )}
            {viewState.view === "cross_position" && (
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="mb-2 text-xs text-slate-500">
                  Historical comparison uses the shared advisor set and runs
                  only when requested.
                </p>
                <div className="flex flex-wrap gap-1">
                  {comparisonController.items.map(item => {
                    const player = item.player
                    return (
                      <span
                        className="rounded bg-white px-2 py-1 text-xs shadow-sm"
                        key={player.id}
                      >
                        {player.position}: {player.fullName}
                      </span>
                    )
                  })}
                </div>
              </div>
            )}
            {viewState.view === "intra_position" && (
              <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                The shared maximum-three comparison set remains independent of
                profile focus. Player Lab history runs only when you choose Run
                analysis.
              </p>
            )}
            {["tier_landscape", "positional_bests", "cross_position"].includes(
              viewState.view,
            ) && (
              <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                {viewState.view === "positional_bests"
                  ? "Position tiers use the players currently available on the draft board. Historical controls below are a separate manual drilldown."
                  : viewState.view === "tier_landscape"
                    ? "Position tiers use only players currently available on the draft board. Historical controls below are a separate manual drilldown."
                    : "The decision cockpit uses the current board and supplied recommendation evidence. Historical selections are separate and run only when you choose Run analysis."}
              </p>
            )}
          </fieldset>

          <div className={compact ? styles.compactLabControlsSelectors : "grid grid-cols-2 gap-2 lg:col-span-3"}>
            <label className="text-sm">
              Seasons
              <select
                aria-label="Analysis season window"
                className="mt-1 w-full rounded border border-slate-300 p-2"
                value={seasonWindow}
                disabled={completedSeasonWindows.length === 0}
                onChange={event =>
                  setSeasonWindow(Number(event.target.value) as 1 | 3 | 5)}
              >
                {completedSeasonWindows.map(window => (
                  <option key={window.size} value={window.size}>
                    {window.label}
                  </option>
                ))}
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
            aria-describedby={viewState.view === "intra_position"
              ? "player-lab-selection-guidance"
              : undefined}
            className={`${compact ? styles.compactLabControlsAction : "lg:col-span-2 lg:self-end"} w-full cursor-pointer bg-indigo-600 font-semibold text-white transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50`}
            disabled={!canRun || loading}
            onClick={() => void runAnalysis()}
          >
            {loading ? "Running analysis…" : "Run analysis"}
          </button>
            </div>
          </details>
        </aside>

        <div className={`space-y-4 ${viewState.view === "intra_position" ? "lg:order-2" : "lg:order-1"} lg:col-span-12`}>
          {["tier_landscape", "positional_bests"].includes(viewState.view) && (
            <TierLandscapeLiveSurface
              model={tierLandscapeModel}
              onInspectPlayer={inspectLivePlayer}
              runwayForecast={tierRunwayForecast}
            />
          )}
          {viewState.view === "cross_position" && (
            <CrossPositionLiveSurface
              comparisonIdentityKey={comparisonAnnouncementIdentity}
              model={crossPositionModel}
              onInspectPlayer={inspectLivePlayer}
              tierModel={tierLandscapeModel}
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
                Historical defaults use the same ordered advisor set shown
                live. Changing that set clears obsolete results, but a new
                bounded query runs only when you request it.
              </p>
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Analysis unavailable: {error}
            </div>
          )}
          {playerLabError && viewState.view === "intra_position" && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Player Lab history unavailable: {playerLabError}
            </div>
          )}
          {playerLabResult && viewState.view === "intra_position" && (
            <PlayerLabHistorical
              onInspectPlayer={inspectHistoricalPlayer}
              response={playerLabResult}
            />
          )}
          {viewState.view === "intra_position"
            && !playerLabResult
            && !playerLabError
            && selectedSeasonWindow && (
            <div className={styles.labEmpty}>
              <h2 className="font-bold text-slate-900">Player Lab is ready</h2>
              <p className="mx-auto mt-2 max-w-xl text-sm">
                Use the three shared players above and run the
                analysis to compare their scoring ranges, full {selectedSeasons[selectedSeasons.length - 1]} season,
                and recorded playing-time gaps.
              </p>
            </div>
          )}
          {result && (
            <div className={viewState.view === "intra_position" ? "hidden" : "contents"}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-semibold text-slate-900">
                    {activeView.label}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {resultSeasonLabel(result.query.seasons)} ·{" "}
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
            </div>
          )}
          {viewState.view === "intra_position" && (
            <details className="rounded-xl border border-slate-300 bg-white shadow-sm">
              <summary className="cursor-pointer rounded-xl px-4 py-3 text-sm font-bold text-slate-800 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
                Current-board projection context
                <span className="ml-2 text-xs font-normal text-slate-500">
                  Optional live shortlist
                </span>
              </summary>
              <div className="border-t border-slate-200 p-3">
                <IntraPositionLiveSurface
                  model={intraPositionModel}
                  onInspectPlayer={inspectLivePlayer}
                />
              </div>
            </details>
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
