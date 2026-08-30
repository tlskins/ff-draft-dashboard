/*global chrome*/
import React, {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
  FC,
} from "react"
import { toast } from 'react-toastify'

import PageHead from "../components/pageHead"
import Header from "../components/Header"
import RankingsBoard from "../components/RankingsBoard"
import HistoricalStats from "../components/HistoricalStats"
import HistoricalComparison from "../components/HistoricalComparison"
import PlayerRankingTable from "../components/PlayerRankingTable"
import PlayerStatusPanel from "../components/PlayerStatusPanel"
import RankingSummaryDisplay from "../components/RankingSummary"
import ADPView from "../components/views/ADPView"
import OptimalRosterDisplay from "../components/OptimalRosterDisplay"
import PickHistoryFooter from "../components/PickHistoryFooter"
import MobileRankingsEditor from "../components/mobile/MobileRankingsEditor"
import AnalysisWorkspace from "../components/analysis/AnalysisWorkspace"
import LiveAdvisorPanel, {type LiveAdvisorPanelProps} from "../components/LiveAdvisorPanel"
import PortableDataControls from "../components/PortableDataControls"
import DraftDeskAppBar from "../components/DraftDeskAppBar"
import DraftDeskProfilePane from "../components/DraftDeskProfilePane"
import DraftDock from "../components/DraftDock"
import DeskPaneHeader from "../components/draft-desk/DeskPaneHeader"
import DeskSegmentedControl from "../components/draft-desk/DeskSegmentedControl"
import DraftDeskAdvisorDisclosure from "../components/draft-desk/DraftDeskAdvisorDisclosure"
import DraftDeskInsightDeck from "../components/insight/DraftDeskInsightDeck"
import CloudProfileControl from "../components/CloudProfileControl"
import {MockDraftReviewPanel} from "../components/MockDraftReviewPanel"
import draftDeskStyles from "../components/DraftDesk.module.css"

import { useRanks } from '../behavior/hooks/useRanks'
import { useDraftBoard } from '../behavior/hooks/useDraftBoard'
import { useDraftListener } from '../behavior/hooks/useDraftListener'
import { usePredictions, HighlightOption } from "../behavior/hooks/usePredictions"
import { useRankingProfiles } from "../behavior/hooks/useRankingProfiles"
import { useRealtimeAdvisor } from "../behavior/hooks/useRealtimeAdvisor"
import {
  usePlayerStatusCache,
} from "../behavior/hooks/usePlayerStatusCache"
import {
  useAdvisorComparisonController,
} from "../behavior/hooks/useAdvisorComparisonController"
import {
  useRealtimeConversation,
} from "../behavior/hooks/useRealtimeConversation"
import {useDraftyAuth} from "../behavior/hooks/useDraftyAuth"
import {useCloudProfileSync} from "../behavior/hooks/useCloudProfileSync"
import {useCompletedMockArchive} from "../behavior/hooks/useCompletedMockArchive"
import {
  createCompletedMockArchive,
  type LocalMockDraftArchive,
} from "../behavior/mockDraft/archive"
import {useDraftyWebMcp, type WebMcpRegistrationState} from "../behavior/hooks/useDraftyWebMcp"
import {useDraftyMockReviewWebMcp} from "../behavior/hooks/useDraftyMockReviewWebMcp"
import {
  FantasyRanker,
  FantasyPosition,
  Player,
  ThirdPartyADPRanker,
  ThirdPartyRanker,
} from "types"
import {selectableExpertRankers} from "../behavior/rankingCatalog"
import {scoringFormatFor, settingsWithScoringFormat} from "../behavior/scoringFormat"
import type {ProfileModuleId} from "../behavior/profile/profileModuleController"
import {
  DraftyConfigureWorkspaceInput,
  DraftyInsightAgentState,
  DraftyMovePlayerRankInput,
  DraftyRankingsView,
  DraftySetPlayerTargetInput,
  DraftySetRankingsViewInput,
  DraftyShowPlayerProfileInput,
  DraftyStartRankEditingInput,
  DraftyWorkspaceSnapshot,
  searchDraftyPlayers,
  toolFailure,
  toolSuccess,
} from "../behavior/webmcp/draftyWebMcp"
import {
  buildDraftyDecisionContext,
  buildDraftyPlayerEvidence,
} from "../behavior/webmcp/draftyDecisionEvidence"
import {buildRoundMarketPresentationModel} from "../behavior/analysis/roundMarket"
import {buildActiveBoardTierInputs} from "../behavior/insights/liveInsightInputs"
import {loadPlayerStatus} from "../behavior/api/playerStatus"
import {
  createAdvisorSnapshotPersistenceCoordinator,
  createAdvisorInputFingerprint,
  persistAdvisorSnapshots,
} from "@/behavior/api/draftSessions"
import {
  captureCompletedDraftReplay,
} from "@/behavior/draft-advisor/replayFixtures"
import {
  preflightReplayExport,
  validateReplayExportAtConfirmation,
} from "@/behavior/draft-advisor/replayCaptureStatus"
import {
  getAdvisorRosterCapacity,
} from "@/behavior/draft-advisor/recommendations"
import {
  getEmbeddedPlayerData,
  rankingsAgeInDays,
  rankingsAreStale,
} from "@/behavior/playerData"
import {loadPlayerRankingsResource} from "@/behavior/api/playerRankingsResource"
import {useReadApiCache} from "@/behavior/api/readApiContext"
import { getDashboardApiFeatures } from "@/behavior/api/featureConfig"
import { shouldIgnoreGlobalDraftShortcut } from "@/behavior/accessibility"
import {
  applyRankingProfileV2Snapshot,
  createImportedDraftPlan,
  createPortableDataPackage,
  PortableDataPackage,
  portableRankingProfile,
  portableRankingSource,
} from "@/behavior/portableData"
import {
  commitCanonicalRankingProfile,
  runRankingProfileStartupMigration,
} from "@/behavior/rankingProfileStorage"
import {
  validateRankingProfileV2,
  type RankingProfileV2,
} from "@/behavior/rankingProfileV2"
import { draftPlanStorageKey } from "@/behavior/realtime/storage"
import {
  PLAYER_TARGETS_STORAGE_KEY,
  serializePlayerTargets,
} from "@/behavior/playerTargetStorage"
import {seasonScopedStorage} from "@/behavior/seasonScopedStorage"
import type {UserDraftProfilePayload} from "@/behavior/cloudProfileSync"
import {
  getSnapshotObservedThroughOverallPick,
  isDraftCaptureComplete,
} from "@/behavior/draft-feed/snapshots"
import {
  acknowledgeAnalysisViewEvent,
  arbitrateAnalysisViewEventsByLayout,
  createAnalysisViewEventArbitrationState,
  queueConfirmedAnalysisViewEvent,
} from "@/behavior/analysis/viewEventArbitration"
import type {
  AnalysisViewNavigationEvent,
  AutomaticAnalysisViewEvent,
} from "@/behavior/analysis/viewState"
import {
  DRAFT_DESK_PANE_STORAGE_KEY,
  DraftDeskPaneId,
  DraftDeskPanePlacement,
  createDraftDeskInsightMaterialEvent,
  isDraftDeskEnabled,
  isPhase14CInsightDeckEnabled,
  restoreDraftDeskPanePlacement,
  swapDraftDeskPanePlacement,
} from "@/behavior/draftDesk"
import {
  buildAdvisorComparisonSet,
  createMaterialDraftEventKey,
} from "@/behavior/advisorComparisonSet"
import type {RankingLanePosition} from "@/types/DraftBoardTypes"

export enum DraftView {
  RANKING = "Rankings By Position",
  ADP_ROUND = "Best By ADP Round",
  TARGETS = "Targets",
  BEST_AVAILABLE = "Best Available By Round",
  CUSTOM_RANKING = "Edit Rankings",
}

export enum SortOption {
  RANKS = "Sort By Ranks",
  ADP = "Sort By ADP",
}

const EMPTY_INSIGHT_AGENT_STATE: DraftyInsightAgentState = {
  available: false,
  slots: [
    {slot: "decision", view: null, mode: "auto", evidence: null},
    {slot: "supporting", view: null, mode: "auto", evidence: null},
  ],
  expandedSlot: null,
}

const UNSUPPORTED_WEBMCP_REGISTRATION: WebMcpRegistrationState = {
  status: "unsupported",
  registeredToolCount: 0,
  errorName: null,
}

const draftViewForAgent = (view: DraftView): DraftyRankingsView => {
  if (view === DraftView.ADP_ROUND) return "adp_round"
  if (view === DraftView.TARGETS) return "targets"
  return "position"
}

const agentDraftView = (view: DraftyRankingsView): DraftView => {
  if (view === "adp_round") return DraftView.ADP_ROUND
  if (view === "targets") return DraftView.TARGETS
  return DraftView.RANKING
}

const WEBMCP_RANK_EDIT_POSITIONS = [
  FantasyPosition.QUARTERBACK,
  FantasyPosition.RUNNING_BACK,
  FantasyPosition.WIDE_RECEIVER,
  FantasyPosition.TIGHT_END,
] as const



const Home: FC = () => {
  const readApiCache = useReadApiCache()
  const apiFeatures = getDashboardApiFeatures()
  const [persistenceSeason, setPersistenceSeason] = useState(
    () => getEmbeddedPlayerData().season ?? 2026,
  )
  const {
    // state
    settings, setNumTeams, setIsPpr, setScoringFormat, replaceSettings,
    applyAuthoritativeDraftSettings,
    draftStarted, setDraftStarted,
    myPickNum, setMyPickNum,
    currPick, setCurrPick,
    // memo
    roundIdx,
    isEvenRound,
    currRoundPick,
    currMyPickNum,
    myPicks,
    // funcs
    onNavRoundUp,
    onNavRoundDown,
  } = useDraftBoard({
    defaultNumTeams: 12,
    defaultMyPickNum: 6,
  })

  // ranks depend on draft board
  const {
    // state
    rankingSummaries,
    boardSettings,
    playerRanks,
    playerLib,
    playersByPosByTeam,
    noPlayers,
    rosters,
    draftHistory,
    isEditingCustomRanking,
    playerTargets,
    playerTargetsHydrated,
    rankings,
    latestRankings,
    customAndLatestRankingsDiffs,
    // funcs
    onDraftPlayer,
    onRemoveDraftedPlayer,
    getDraftRoundForPickNum,
    onPurgeAvailPlayer,
    onApplyRankingSortBy,
    onSetRanker,
    onSetAdpRanker,
    // custom ranking funcs
    canEditCustomRankings,
    onStartCustomRanking,
    onFinishCustomRanking,
    onReorderPlayerInPosition,
    onUpdateTierBoundary,
    // player targeting funcs
    addPlayerTarget,
    removePlayerTarget,
    replacePlayerTargets,
    removePlayerTargets,
    // save/load custom rankings funcs
    loadCustomRankingsData,
    resetBoardSettings,
    // sync functions
    onSyncPendingRankings,
    onRevertPlayerToPreSync,
    onLoadPlayers,
    applyImportedRankings,
    setLatestRankings,
    setCustomAndLatestRankingsDiffs,
    // helper funcs
    calculateRankingDiffs,
  } = useRanks({ settings, myPickNum, persistenceSeason })

  const usingCustomRanking = boardSettings.ranker === ThirdPartyRanker.CUSTOM
  const rankingSourceOptions = useMemo(
    () => selectableExpertRankers(rankings, settings),
    [rankings, settings],
  )

  const [startupProfile, setStartupProfile] = useState<RankingProfileV2 | null>(null)
  const [startupMigrationStatus, setStartupMigrationStatus] = useState<string | null>(null)
  const [rankingsHydrated, setRankingsHydrated] = useState(false)

  const rankingProfileControls = useRankingProfiles({
    playerRanks,
    rankings,
    settings,
    boardSettings,
    onLoadPlayers,
    onSetRanker,
    localProfile: startupProfile,
    onLocalProfileCommitted: setStartupProfile,
    persistenceSeason,
    serverPersistenceEnabled: apiFeatures.rankingProfilePersistenceEnabled,
  })
  const draftyAuth = useDraftyAuth(apiFeatures.cloudProfileSyncEnabled)

  const applyCloudProfile = useCallback((cloud: UserDraftProfilePayload) => {
    if (typeof localStorage === "undefined") {
      throw new Error("Browser storage is unavailable; the cloud profile was not applied")
    }
    const nextProfile = cloud.ranking_profile
      ? validateRankingProfileV2(cloud.ranking_profile)
      : null
    const nextTargets = cloud.targets.map(target => ({
      playerId: target.player_id,
      targetAsEarlyAsRound: target.target_as_early_as_round,
    }))
    const committed = commitCanonicalRankingProfile(
      seasonScopedStorage(localStorage, persistenceSeason),
      nextProfile,
      [{
        key: PLAYER_TARGETS_STORAGE_KEY,
        value: serializePlayerTargets(nextTargets),
      }],
    )
    if (committed.status === "rejected") {
      throw new Error(`Cloud profile browser commit failed (${committed.code}): ${committed.message}`)
    }

    replacePlayerTargets(nextTargets)
    setStartupProfile(nextProfile)
    const published = latestRankings || rankings
    if (published.players.length === 0) return
    if (nextProfile) {
      onLoadPlayers({
        ...applyRankingProfileV2Snapshot(
          published,
          nextProfile,
          (cloud.source_ranker || ThirdPartyRanker.HARRIS),
        ),
        settings,
      })
      onSetRanker(ThirdPartyRanker.CUSTOM)
    } else {
      onLoadPlayers({...published, settings})
      resetBoardSettings()
    }
  }, [
    latestRankings,
    onLoadPlayers,
    onSetRanker,
    rankings,
    persistenceSeason,
    replacePlayerTargets,
    resetBoardSettings,
    settings,
  ])

  const cloudProfileSync = useCloudProfileSync({
    enabled: apiFeatures.cloudProfileSyncEnabled,
    user: draftyAuth.user,
    hydrated: rankingsHydrated
      && playerTargetsHydrated
      && !draftStarted
      && !draftHistory.some(Boolean),
    rankingProfile: startupProfile,
    targets: playerTargets,
    sourceRanker: String(rankings.copiedRanker || boardSettings.ranker || "") || null,
    season: persistenceSeason,
    onApplyRemote: applyCloudProfile,
  })

  const {
    activeDraftListenerTitle,
    activeDraftSessionId,
    activeDraftSnapshot,
    draftCaptureState,
    draftSourceHealth,
    draftSourceHealthFreshness,
    draftPersistence,
    retryDraftPersistence,
    pendingDraft,
    acceptPendingDraft,
    ignorePendingDraft,
    draftActivity,
  } = useDraftListener({
    playerLib,
    playersByPosByTeam,
    settings,
    onDraftPlayer,
    setCurrPick,
    setDraftStarted,
    onDraftMetadata: snapshot => {
      applyAuthoritativeDraftSettings({
        ...(snapshot.numTeams ? { numTeams: snapshot.numTeams } : {}),
        ...(snapshot.scoringFormat
          ? { scoringFormat: snapshot.scoringFormat.toLocaleLowerCase() as "standard" | "half_ppr" | "ppr" }
          : {}),
      })
      if (snapshot.targetRosterIndex !== null
        && snapshot.targetRosterIndex !== undefined) {
        setMyPickNum(snapshot.targetRosterIndex + 1)
      }
    },
    apiPersistenceEnabled: apiFeatures.draftSessionPersistenceEnabled,
  })
  const sourceObservedThroughOverallPick = useMemo(() =>
    getSnapshotObservedThroughOverallPick(activeDraftSnapshot, settings.numTeams),
  [activeDraftSnapshot, settings.numTeams])
  const dashboardDraftComplete = isDraftCaptureComplete(
    activeDraftSnapshot,
    draftHistory.filter(Boolean).length,
    getAdvisorRosterCapacity(settings) * settings.numTeams,
  )

  const {
    predictedPicks,
    predNextTiers,
    setNumPostPredicts,
    optimalRosters,
    highlightOption,
    setHighlightOption,
    recommendations,
    opponentForecast,
    advisorContext,
    replayForecastEvidence,
    empiricalBaseShadowEvidence,
    runOnlyShadowEvidence,
    runOnlyShadowCaptureStatus,
    replayCaptureStatus,
    empiricalBaseShadowCaptureStatus,
    predictionActivity,
  } = usePredictions({
    rosters,
    playerRanks,
    settings,
    boardSettings,
    currPick,
    myPickNum,
    draftStarted,
    rankingSummaries,
    playerLib,
    draftHistory,
    draftSessionId: activeDraftSessionId,
    sourceComplete: dashboardDraftComplete,
    sourceObservedThroughOverallPick,
    sourceTotalPicks: activeDraftSnapshot?.completion?.totalPicks,
  })
  const analysisAvailablePlayers = useMemo(() => {
    const availableById = new Map<string, Player>()
    const available = [
      ...playerRanks.QB,
      ...playerRanks.RB,
      ...playerRanks.WR,
      ...playerRanks.TE,
    ]
    available.forEach(player => availableById.set(player.id, player))
    return Array.from(availableById.values())
      .sort((left, right) => left.id.localeCompare(right.id))
  }, [playerRanks])
  const draftTickerActivity = useMemo(() => (
    [...draftActivity, ...predictionActivity]
      .sort((left, right) => left.occurredAt - right.occurredAt)
      .slice(-8)
  ), [draftActivity, predictionActivity])
  const automaticComparisonSet = useMemo(() => buildAdvisorComparisonSet({
    recommendations,
    availablePlayers: analysisAvailablePlayers,
    playerTargets,
    settings,
    boardSettings,
  }), [
    analysisAvailablePlayers,
    boardSettings,
    playerTargets,
    recommendations,
    settings,
  ])
  const materialDraftEventKey = useMemo(
    () => createMaterialDraftEventKey(draftHistory),
    [draftHistory],
  )
  const comparisonController = useAdvisorComparisonController({
    automaticSet: automaticComparisonSet,
    materialEventKey: materialDraftEventKey,
  })
  const draftDeskInsightMaterialEvent = useMemo(() => (
    createDraftDeskInsightMaterialEvent(
      activeDraftSessionId,
      materialDraftEventKey,
    )
  ), [activeDraftSessionId, materialDraftEventKey])

  const [draftView, setDraftView] = useState<DraftView>(DraftView.RANKING)
  const [adpRoundPage, setAdpRoundPage] = useState(0)
  const [filterRankedBelowAdp, setFilterRankedBelowAdp] = useState(false)
  const [rankingVisiblePositions, setRankingVisiblePositions] = useState<RankingLanePosition[]>([
    FantasyPosition.RUNNING_BACK,
    FantasyPosition.WIDE_RECEIVER,
  ])
  const [sortOption, setSortOption] = useState<SortOption>(SortOption.RANKS)
  const [viewPlayerId, setViewPlayerId] = useState<string | null>(null)
  const [pinnedProfilePlayerId, setPinnedProfilePlayerId] = useState<string | null>(null)
  const [profileModule, setProfileModule] = useState<ProfileModuleId | null>("production")
  const [profileAdvancedDetailsOpen, setProfileAdvancedDetailsOpen] = useState(true)
  const [webMcpMockReviewArchive, setWebMcpMockReviewArchive] =
    useState<LocalMockDraftArchive | null>(null)
  const [insightAgentState, setInsightAgentState] = useState<DraftyInsightAgentState>(
    EMPTY_INSIGHT_AGENT_STATE,
  )
  const [insightWebMcpRegistration, setInsightWebMcpRegistration] =
    useState<WebMcpRegistrationState>(UNSUPPORTED_WEBMCP_REGISTRATION)
  const focusBoardPlayer = useCallback((playerId: string | null) => {
    if (!pinnedProfilePlayerId) setViewPlayerId(playerId)
  }, [pinnedProfilePlayerId])
  const togglePinnedProfilePlayer = useCallback((playerId: string) => {
    setPinnedProfilePlayerId(current => current === playerId ? null : playerId)
    setViewPlayerId(playerId)
  }, [])
  const [selectedOptimalRosterIdx, setSelectedOptimalRosterIdx] = useState(0)
  const [analysisOpen, setAnalysisOpen] = useState(false)
  const draftDeskEnabled = isDraftDeskEnabled()
  const phase14CInsightDeckEnabled = isPhase14CInsightDeckEnabled()
  const [draftDeskDockHeight, setDraftDeskDockHeight] = useState(0)
  const onDraftDeskDockHeightChange = useCallback((height: number) => {
    setDraftDeskDockHeight(current => Math.abs(current - height) < 0.5
      ? current
      : height)
  }, [])
  const draftDeskShellStyle = useMemo(() => ({
    "--draft-desk-dock-height": `${draftDeskDockHeight}px`,
  }) as React.CSSProperties, [draftDeskDockHeight])
  const [draftDeskPanePlacement, setDraftDeskPanePlacement] =
    useState<DraftDeskPanePlacement>(() => {
      if (typeof window === "undefined") {
        return restoreDraftDeskPanePlacement(null)
      }
      try {
        return restoreDraftDeskPanePlacement(JSON.parse(
          window.localStorage.getItem(DRAFT_DESK_PANE_STORAGE_KEY) || "null",
        ))
      } catch {
        return restoreDraftDeskPanePlacement(null)
      }
    })
  useEffect(() => {
    if (!draftDeskEnabled || typeof window === "undefined") return
    window.localStorage.setItem(
      DRAFT_DESK_PANE_STORAGE_KEY,
      JSON.stringify(draftDeskPanePlacement),
    )
  }, [draftDeskEnabled, draftDeskPanePlacement])
  const statusPlayerIds = useMemo(() => [
    ...recommendations.candidates.map(candidate => candidate.player.id),
    ...comparisonController.items.map(item => item.player.id),
    ...(viewPlayerId ? [viewPlayerId] : []),
  ], [comparisonController.items, recommendations.candidates, viewPlayerId])
  const playerStatus = usePlayerStatusCache(statusPlayerIds)
  const advisorPersistenceCoordinator = useRef<ReturnType<
    typeof createAdvisorSnapshotPersistenceCoordinator
  > | null>(null)
  if (!advisorPersistenceCoordinator.current) {
    advisorPersistenceCoordinator.current =
      createAdvisorSnapshotPersistenceCoordinator({
        publish: persistAdvisorSnapshots,
        onError: error => {
          console.warn(
            "Advisor snapshots remain local because persistence failed",
            error,
          )
        },
      })
  }
  const sourceEventCount = draftHistory.filter(Boolean).length
  const analysisEventStreamId = activeDraftSessionId || "unscoped-draft"
  const [analysisViewEventArbitration, setAnalysisViewEventArbitration] =
    useState(() => createAnalysisViewEventArbitrationState(
      analysisEventStreamId,
    ))
  useEffect(() => {
    setAnalysisViewEventArbitration(current => (
      current.streamId === analysisEventStreamId
        ? current
        : createAnalysisViewEventArbitrationState(analysisEventStreamId)
    ))
  }, [analysisEventStreamId])
  const automaticAnalysisViewEvent = useMemo<AutomaticAnalysisViewEvent>(
    () => ({
      kind: "automatic",
      streamId: analysisEventStreamId,
      view: recommendations.preferredView,
      explanation: recommendations.viewExplanation,
      revision: currPick,
    }),
    [
      analysisEventStreamId,
      currPick,
      recommendations.preferredView,
      recommendations.viewExplanation,
    ],
  )
  const analysisViewEvents = useMemo(() => (
    arbitrateAnalysisViewEventsByLayout(
      analysisViewEventArbitration,
      automaticAnalysisViewEvent,
    )
  ), [analysisViewEventArbitration, automaticAnalysisViewEvent])
  const acknowledgeAnalysisViewNavigation = useCallback((
    event: AnalysisViewNavigationEvent,
  ) => {
    setAnalysisViewEventArbitration(current =>
      acknowledgeAnalysisViewEvent(current, event))
  }, [])
  const applyConfirmedRealtimeView = useCallback((
    view: AnalysisViewNavigationEvent["view"],
    proposal: {id: string; explanation: string},
  ) => {
    setAnalysisViewEventArbitration(current =>
      queueConfirmedAnalysisViewEvent(
        current,
        analysisEventStreamId,
        {
          eventId: proposal.id,
          view,
          explanation: proposal.explanation,
          supersedesAutomaticRevision: currPick,
        },
      ))
    if (
      !draftDeskEnabled
      &&
      typeof window !== "undefined"
      && window.matchMedia?.("(min-width: 768px)").matches
    ) {
      setAnalysisOpen(true)
    }
  }, [analysisEventStreamId, currPick, draftDeskEnabled])
  const realtimeAdvisor = useRealtimeAdvisor({
    draftSessionId: activeDraftSessionId,
    sourceEventCount,
    onApplyView: applyConfirmedRealtimeView,
  })
  const realtimeToolContext = useMemo(() => (
    activeDraftSessionId && realtimeAdvisor.plan
      ? {
          draftSessionId: activeDraftSessionId,
          sourceEventCount,
          advisorContext,
          recommendations,
          plan: realtimeAdvisor.plan,
        }
      : null
  ), [
    activeDraftSessionId,
    advisorContext,
    realtimeAdvisor.plan,
    recommendations,
    sourceEventCount,
  ])
  const realtimeConversation = useRealtimeConversation({
    draftSessionId: activeDraftSessionId,
    toolContext: realtimeToolContext,
    onProposal: realtimeAdvisor.enqueueProposal,
    enabled: apiFeatures.realtimeAdvisorEnabled,
  })
  const canExportReplay = Boolean(
    activeDraftSessionId && dashboardDraftComplete,
  )

  const buildReplayFixture = useCallback((rosterOnly = false) => {
    if (!activeDraftSessionId) {
      throw new Error("Open the current draft session before exporting")
    }
    return captureCompletedDraftReplay({
      id: activeDraftSessionId,
      settings,
      targetRosterIndex: myPickNum - 1,
      boardSettings,
      rankingSummaries,
      playerLib,
      draftHistory,
      sourceSnapshot: activeDraftSnapshot,
      ...(rosterOnly ? {} : {
        forecastEvidence: replayForecastEvidence,
        empiricalBaseShadowEvidence,
        runOnlyShadowEvidence,
      }),
    })
  }, [
    activeDraftSessionId, activeDraftSnapshot, boardSettings, draftHistory,
    empiricalBaseShadowEvidence, myPickNum, playerLib, rankingSummaries,
    replayForecastEvidence, settings,
    runOnlyShadowEvidence,
  ])
  const replayExportPreflight = useMemo(() => {
    if (!canExportReplay) return undefined
    try {
      return preflightReplayExport(buildReplayFixture())
    } catch (error) {
      return {
        state: "blocked" as const,
        message: error instanceof Error ? error.message : "Replay fixture export failed",
        totalPlatformPicks: activeDraftSnapshot?.completion?.totalPicks || draftHistory.length,
        boardComplete: false,
        authoritativePlatformBoard: false,
        campaignEvidenceReady: false,
        sessionMatch: false,
        targetRosterMatch: false,
        evidencePresent: Boolean(replayForecastEvidence),
        evidenceValid: false as const,
        canExportRosterOnly: false,
        labeledPickCount: 0 as const,
        labeledWindowCount: 0 as const,
        opponentMetricsAvailable: false as const,
      }
    }
  }, [
    activeDraftSnapshot, buildReplayFixture, canExportReplay,
    draftHistory.length, replayForecastEvidence,
  ])
  const exportReplay = useCallback((rosterOnly = false) => {
    if (!activeDraftSessionId) return
    try {
      const { fixture } = validateReplayExportAtConfirmation(
        buildReplayFixture,
        rosterOnly,
      )
      const blob = new Blob(
        [JSON.stringify(fixture, null, 2)],
        { type: "application/json" },
      )
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = `${
        activeDraftSessionId.replace(/[^a-z0-9]+/gi, "-")
      }-replay.json`
      anchor.click()
      URL.revokeObjectURL(url)
      toast.success("Completed draft replay fixture exported")
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Replay fixture export failed",
      )
    }
  }, [activeDraftSessionId, buildReplayFixture])

  const completedMockTimestamps = useRef(new Map<string, string>())
  const completedMockArchive = useMemo(() => {
    if (!canExportReplay || !activeDraftSessionId) return null
    try {
      let completedAt = completedMockTimestamps.current.get(activeDraftSessionId)
      if (!completedAt) {
        completedAt = new Date(
          activeDraftSnapshot?.capturedAt || Date.now(),
        ).toISOString()
        completedMockTimestamps.current.set(activeDraftSessionId, completedAt)
      }
      return createCompletedMockArchive({
        fixture: buildReplayFixture(true),
        season: persistenceSeason,
        rankingSource: String(boardSettings.ranker),
        adpSource: String(boardSettings.adpRanker),
        targets: playerTargets,
        completedAt,
      })
    } catch {
      // The full authoritative board may arrive a snapshot after the dashboard
      // first observes completion. The next source update retries naturally.
      return null
    }
  }, [
    activeDraftSessionId,
    activeDraftSnapshot?.capturedAt,
    boardSettings.adpRanker,
    boardSettings.ranker,
    buildReplayFixture,
    canExportReplay,
    persistenceSeason,
    playerTargets,
  ])
  useCompletedMockArchive({
    enabled: true,
    archive: completedMockArchive,
    season: persistenceSeason,
    user: apiFeatures.cloudProfileSyncEnabled ? draftyAuth.user : null,
  })

  useEffect(() => {
    if (!apiFeatures.advisorSnapshotPersistenceEnabled) return
    if (!activeDraftSessionId || !draftStarted) return
    const inputFingerprint = createAdvisorInputFingerprint({
      sourceEventCount,
      currentPick: currPick,
      myPickNum,
      settings,
      boardSettings,
      roster: rosters[myPickNum - 1]?.picks || [],
      available: playerRanks.availPlayersByAdp
        .slice(0, 60)
        .map(player => player.id),
    })
    advisorPersistenceCoordinator.current?.enqueue({
      sessionId: activeDraftSessionId,
      sourceEventCount,
      inputFingerprint,
      recommendations,
      opponentForecast,
    })
  }, [
    activeDraftSessionId,
    apiFeatures.advisorSnapshotPersistenceEnabled,
    boardSettings,
    currPick,
    draftHistory,
    draftStarted,
    myPickNum,
    opponentForecast,
    playerRanks.availPlayersByAdp,
    recommendations,
    rosters,
    settings,
    sourceEventCount,
  ])

  const browserLoaded = typeof window !== "undefined"

  const portableValidationContext = useMemo(() => ({
    playersById: new Map(Object.values(playerLib).map(player => [player.id, player])),
    rankers: new Set(rankings.allThirdPartyRankers || []),
  }), [playerLib, rankings.allThirdPartyRankers])

  const createPortableData = useCallback(() => createPortableDataPackage({
    rankings,
    rankingProfile: rankingProfileControls.activeProfile?.snapshot.schema_version === 2
      ? rankingProfileControls.activeProfile.snapshot as unknown as RankingProfileV2
      : startupProfile,
    settings,
    boardSettings,
    myPickNum,
    playerTargets,
    plan: realtimeAdvisor.plan,
  }), [
    boardSettings,
    myPickNum,
    playerTargets,
    rankings,
    rankingProfileControls.activeProfile,
    realtimeAdvisor.plan,
    settings,
    startupProfile,
  ])

  const applyPortableData = useCallback((portable: PortableDataPackage) => {
    // A package is a coherent pre-draft profile. Replacing ranks or league
    // rules after a pick would mix two deterministic boards, so check again at
    // confirmation time in addition to disabling the file picker.
    if (draftStarted || draftHistory.some(Boolean)) {
      throw new Error("Import is available before the first draft pick so the live board cannot be mixed")
    }
    if (portable.data.draft_plan && !activeDraftSessionId) {
      throw new Error("Open the current draft session before importing a package with a draft plan")
    }
    if (typeof localStorage === "undefined") {
      throw new Error("Browser storage is unavailable; local data was not changed")
    }

    const importedProfile = portableRankingProfile(
      portable,
      portableValidationContext,
    )
    const nextRankings = {
      ...applyRankingProfileV2Snapshot(
        rankings,
        importedProfile,
        portableRankingSource(portable),
      ),
      settings: { ...portable.data.preferences.settings },
    }
    const importedTargets = portable.data.preferences.player_targets.map(target => ({
      playerId: target.player_id,
      targetAsEarlyAsRound: target.target_as_early_as_round,
    }))
    const importedPlan = activeDraftSessionId
      ? createImportedDraftPlan(
          activeDraftSessionId,
          sourceEventCount,
          portable.data.draft_plan?.entries || [],
          realtimeAdvisor.plan,
        )
      : null
    const additionalWrites = [
      {
        key: PLAYER_TARGETS_STORAGE_KEY,
        value: JSON.stringify(importedTargets),
      },
      ...(importedPlan ? [{
        key: draftPlanStorageKey(activeDraftSessionId as string),
        value: JSON.stringify(importedPlan),
      }] : []),
    ]
    const committed = commitCanonicalRankingProfile(
      seasonScopedStorage(localStorage, persistenceSeason),
      importedProfile,
      additionalWrites,
    )
    if (committed.status === "rejected") {
      throw new Error(`Portable import browser commit failed (${committed.code}): ${committed.message}`)
    }

    replaceSettings(portable.data.preferences.settings)
    setMyPickNum(portable.data.preferences.my_pick_num)
    replacePlayerTargets(importedTargets)
    setStartupProfile(importedProfile)
    applyImportedRankings(
      nextRankings,
      portable.data.preferences.settings,
      portable.data.preferences.board,
    )
    if (importedPlan) realtimeAdvisor.replacePlanFromImport(importedPlan)
  }, [
    activeDraftSessionId,
    applyImportedRankings,
    draftHistory,
    draftStarted,
    rankings,
    realtimeAdvisor,
    replacePlayerTargets,
    replaceSettings,
    setMyPickNum,
    portableValidationContext,
    persistenceSeason,
    sourceEventCount,
  ])

  const loadCurrentRankings = useCallback(async () => {
    const rankingsResource = await loadPlayerRankingsResource(readApiCache)
    const currentRankings = rankingsResource.data
    if (!currentRankings) return
    const currentSeason = currentRankings.season ?? 2026
    setPersistenceSeason(currentSeason)
    if (rankingsResource.state === "unavailable") {
      toast.warn(
        rankingsResource.unavailableReason
          || "Published rankings are unavailable; using the embedded snapshot.",
        {autoClose: 10_000, position: "top-right"},
      )
    }
    if (rankingsAreStale(currentRankings)) {
      const ageInDays = rankingsAgeInDays(currentRankings)
      toast.warn(
        `Player rankings are ${Math.floor(ageInDays || 0)} days old. Refresh the API rankings before starting a live draft.`,
        {
          autoClose: 10_000,
          position: "top-right",
        },
      )
    }

    let migratedProfile: RankingProfileV2 | null = null
    let canonicalAuthorityEstablished = false
    let migrationRejected = false
    if (browserLoaded) {
      const migration = runRankingProfileStartupMigration(
        seasonScopedStorage(localStorage, currentSeason),
        currentRankings.players,
        scoringFormatFor(settings),
      )
      if (migration.status === "migrated" || migration.status === "already_current") {
        canonicalAuthorityEstablished = true
        migratedProfile = migration.profile
        setStartupProfile(migration.profile)
        setStartupMigrationStatus(
          migration.evidence.code === "authority_recovered"
            ? "Your existing local rankings profile was verified and repaired."
            : migration.status === "migrated"
              ? "Local rankings were migrated to canonical profile v2."
            : "Canonical profile v2 is current.",
        )
      } else if (migration.status === "unavailable") {
        setStartupMigrationStatus(null)
      } else {
        migrationRejected = true
        setStartupMigrationStatus(
          `Local profile recovery could not be completed (${migration.evidence.code}); published rankings remain active.`,
        )
      }
    }

    if (canonicalAuthorityEstablished) {
      if (migratedProfile) {
        onLoadPlayers({
          ...applyRankingProfileV2Snapshot(currentRankings, migratedProfile),
          settings,
        })
        onSetRanker(ThirdPartyRanker.CUSTOM)
      } else {
        onLoadPlayers({...currentRankings, settings})
        resetBoardSettings()
      }
      setLatestRankings(currentRankings)
    } else if (!migrationRejected && browserLoaded) {
      // This is the sole legacy-data compatibility read. It is reachable only
      // before canonical authority exists and startup migration is unavailable.
      const customRankingsData = loadCustomRankingsData()
      if (customRankingsData) {
        onLoadPlayers(customRankingsData)
        onSetRanker(ThirdPartyRanker.CUSTOM)
        setLatestRankings(currentRankings)
        
        // Calculate diffs between custom rankings and latest data
        // Create temporary playerLib from custom rankings for diff calculation
        const customPlayerLib = customRankingsData.players.reduce((acc: any, player: Player) => {
          acc[player.id] = player
          return acc
        }, {})
        
        const diffs = calculateRankingDiffs(customRankingsData, customPlayerLib, currentRankings, settings, boardSettings)
        const diffCount = Object.keys(diffs).length
        
        if (diffCount > 0) {
          setCustomAndLatestRankingsDiffs(diffs)
          toast.info(`${diffCount} players have ranking changes have changed since you last adjusted your rankings. Go to Edit Rankings - Sync to update.`, {
            autoClose: 8000,
            position: 'top-right'
          })
        }
      } else {
        onLoadPlayers(currentRankings)
        resetBoardSettings()
      }
    } else {
      // otherwise load the latest rankings
      onLoadPlayers(currentRankings)
      resetBoardSettings()
    }
    setRankingsHydrated(true)
  }, [onLoadPlayers, onSetRanker, readApiCache, resetBoardSettings, browserLoaded, loadCustomRankingsData, setLatestRankings, calculateRankingDiffs, settings, boardSettings, setCustomAndLatestRankingsDiffs])

  useEffect(() => {
    void loadCurrentRankings()
    // Rankings are intentionally loaded once on initial mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const currentOptimalRoster = optimalRosters[selectedOptimalRosterIdx] || optimalRosters[0]

  const currRound = getDraftRoundForPickNum(currPick)

  // key press / up commands
  const onKeyUp = useCallback( (e: KeyboardEvent) => {
    if (shouldIgnoreGlobalDraftShortcut(e)) return
    if (['MetaRight', 'MetaLeft'].includes(e.code) && draftView !== DraftView.CUSTOM_RANKING) {
      setHighlightOption(HighlightOption.PREDICTED_TAKEN)
    } else if (['ShiftLeft', 'ShiftRight'].includes(e.code) && draftView !== DraftView.CUSTOM_RANKING) {
      // sort by harris
      onApplyRankingSortBy( false )
      setSortOption(SortOption.RANKS)
    } else if (['KeyZ'].includes(e.code) && draftView !== DraftView.CUSTOM_RANKING) {
      // show predicted avail by round
      setDraftView(DraftView.RANKING)
    }
  }, [draftView, onApplyRankingSortBy, setHighlightOption])

  const onKeyDown = useCallback( (e: KeyboardEvent) => {
    if (shouldIgnoreGlobalDraftShortcut(e)) return
    // arrow up
    if (e.code === 'ArrowUp' ) {
      onNavRoundUp()
    // arrow down
    } else if (e.code === 'ArrowDown') {
      onNavRoundDown(draftHistory)
    // arrow left
    } else if ( e.code === 'ArrowLeft' ) {
      // onNavLeft()
    // arrow right
    } else if ( e.code === 'ArrowRight' ) {
      // onNavRight(draftHistory)
      // alt 
    } else if (['MetaRight', 'MetaLeft'].includes(e.code) && draftView !== DraftView.CUSTOM_RANKING) {
      setHighlightOption(HighlightOption.PREDICTED_TAKEN_NEXT_TURN)
    // shift 
    } else if (['ShiftLeft', 'ShiftRight'].includes(e.code) && draftView !== DraftView.CUSTOM_RANKING) {
      onApplyRankingSortBy( true )
      setSortOption(SortOption.ADP)
    } else if (['KeyZ'].includes(e.code) && draftView !== DraftView.CUSTOM_RANKING) {
      // show predicted avail by round
      setDraftView(DraftView.BEST_AVAILABLE)
    }
  }, [
    draftHistory,
    draftView,
    onApplyRankingSortBy,
    onNavRoundDown,
    onNavRoundUp,
    setHighlightOption,
  ])

  useEffect(() => {
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onKeyDown, onKeyUp])

  // drafting

  const onSelectPlayer = (player: Player) => {
    onDraftPlayer(player.id, currPick)
    setCurrPick(currPick+1)
    if ( !draftStarted ) {
      setDraftStarted(true)
    }
  }

  const onRemovePick = (pickNum: number) => {
    onRemoveDraftedPlayer(pickNum)
    setCurrPick(pickNum)
    onChangeNumPostPredicts(1)
  }

  const onChangeNumPostPredicts = (num: number) => {
    setNumPostPredicts(num)
  }

  // Custom ranking wrapper functions
  const handleStartCustomRanking = () => {
    const success = onStartCustomRanking(boardSettings.ranker)
    if (success) {
      setDraftView(DraftView.CUSTOM_RANKING)
    }
  }

  const handleFinishCustomRanking = () => {
    onFinishCustomRanking()
    setDraftView(DraftView.RANKING)
  }

  const handleBeginMobileRankings = useCallback(() => (
    onStartCustomRanking(boardSettings.ranker)
  ), [boardSettings.ranker, onStartCustomRanking])

  const handleSaveMobileRankings = useCallback(() => {
    rankingProfileControls.saveLocal()
    onFinishCustomRanking()
  }, [onFinishCustomRanking, rankingProfileControls])

  const getWebMcpWorkspace = useCallback((): DraftyWorkspaceSnapshot => {
    const scoringFormat = scoringFormatFor(settings)
    const currentPlayer = viewPlayerId ? playerLib[viewPlayerId] : null
    return {
      schemaVersion: 1,
      draft: {
        started: draftStarted,
        currentPick: currPick,
        teamCount: settings.numTeams,
        userDraftSlot: myPickNum,
      },
      configuration: {
        scoringFormat,
        starters: {
          qb: settings.numStartingQbs,
          rb: settings.numStartingRbs,
          wr: settings.numStartingWrs,
          te: settings.numStartingTes,
          flex: settings.numFlex,
          bench: settings.numBenchPlayers,
        },
        rankingSource: String(boardSettings.ranker),
        adpSource: String(boardSettings.adpRanker),
        availableRankingSources: rankingSourceOptions.map(String),
        availableAdpSources: Object.values(ThirdPartyADPRanker).map(String),
      },
      rankings: {
        view: draftViewForAgent(draftView),
        visiblePositions: [...rankingVisiblePositions],
        sort: sortOption === SortOption.ADP ? "adp" : "rank",
        adpRoundPage: adpRoundPage + 1,
        adpRoundsVisible: [adpRoundPage + 1, adpRoundPage + 2, adpRoundPage + 3],
        filterRankedBelowAdp,
        editing: isEditingCustomRanking,
        editable: canEditCustomRankings(),
      },
      profile: {
        playerId: currentPlayer?.id || null,
        playerName: currentPlayer?.fullName || null,
        pinned: Boolean(
          pinnedProfilePlayerId && pinnedProfilePlayerId === currentPlayer?.id,
        ),
        module: profileModule || "auto",
        advancedDetailsOpen: profileAdvancedDetailsOpen,
      },
      insights: insightAgentState,
      targets: {count: playerTargets.length},
      persistence: {
        rankingsHydrated,
        targetsHydrated: playerTargetsHydrated,
        localRankingProfileSaved: Boolean(startupProfile),
        cloudSyncEnabled: apiFeatures.cloudProfileSyncEnabled,
        authenticated: Boolean(draftyAuth.user),
        cloudSyncState: cloudProfileSync.state,
      },
      capabilities: {
        configureWorkspace: {
          available: !draftStarted,
          reason: draftStarted ? "Draft setup is locked after the first pick." : null,
        },
        setPlayerTarget: {
          available: rankingsHydrated && playerTargetsHydrated,
          reason: rankingsHydrated && playerTargetsHydrated
            ? null
            : "Rankings or targets are still hydrating.",
        },
        editRanks: {
          available: canEditCustomRankings(),
          reason: canEditCustomRankings()
            ? null
            : "Custom rankings are locked after a player is drafted or purged.",
        },
        saveRankEdits: {
          available: isEditingCustomRanking && canEditCustomRankings(),
          reason: isEditingCustomRanking
            ? canEditCustomRankings() ? null : "Custom rankings are locked."
            : "No custom rank editing session is active.",
        },
      },
    }
  }, [
    adpRoundPage,
    boardSettings,
    canEditCustomRankings,
    currPick,
    draftStarted,
    draftView,
    filterRankedBelowAdp,
    insightAgentState,
    isEditingCustomRanking,
    myPickNum,
    pinnedProfilePlayerId,
    playerLib,
    playerTargetsHydrated,
    playerTargets.length,
    profileAdvancedDetailsOpen,
    profileModule,
    rankingSourceOptions,
    rankingsHydrated,
    rankingVisiblePositions,
    settings,
    sortOption,
    startupProfile,
    viewPlayerId,
    apiFeatures.cloudProfileSyncEnabled,
    cloudProfileSync.state,
    draftyAuth.user,
  ])

  const getWebMcpDecisionContext = useCallback(() => buildDraftyDecisionContext({
    context: advisorContext,
    recommendations,
    opponentForecast,
    roundMarket: advisorContext ? buildRoundMarketPresentationModel({
      context: advisorContext,
      opponentForecast,
      targetRosterIndex: myPickNum - 1,
      activeBoardTiers: buildActiveBoardTierInputs({
        availablePlayers: analysisAvailablePlayers,
        boardSettings,
        settings,
      }),
    }) : null,
    playerLib,
    targetRosterIndex: myPickNum - 1,
    sourceEventCount,
  }), [
    advisorContext,
    analysisAvailablePlayers,
    boardSettings,
    myPickNum,
    opponentForecast,
    playerLib,
    recommendations,
    sourceEventCount,
    settings,
  ])

  const getWebMcpPlayerEvidence = useCallback(async (input: {player_id: string}) => {
    const player = playerLib[input.player_id]
    if (!player) {
      return toolFailure("not_found", `Player ${input.player_id} is not in the current Drafty universe.`)
    }
    let status = playerStatus[player.id]
    if (!status || status.state === "loading") {
      try {
        const response = await loadPlayerStatus(player.id, {limit: 8})
        status = {
          playerId: player.id,
          state: "ready",
          response,
          loadedAt: Date.now(),
        }
      } catch {
        status = {
          playerId: player.id,
          state: "unavailable",
          response: null,
          loadedAt: Date.now(),
        }
      }
    }
    return toolSuccess(buildDraftyPlayerEvidence({
      player,
      settings,
      boardSettings,
      playerTargets,
      availablePlayerIds: new Set(
        playerRanks.availPlayersByOverallRank.map(candidate => candidate.id),
      ),
      recommendations,
      status,
      peers: analysisAvailablePlayers,
    }), `${player.fullName}'s current Drafty evidence is ready.`)
  }, [
    analysisAvailablePlayers,
    boardSettings,
    playerLib,
    playerRanks.availPlayersByOverallRank,
    playerStatus,
    playerTargets,
    recommendations,
    settings,
  ])

  const configureWebMcpWorkspace = useCallback((input: DraftyConfigureWorkspaceInput) => {
    if (draftStarted) {
      return toolFailure("not_allowed", "Draft setup is locked after the first pick.")
    }
    if (
      input.ranking_source
      && !rankingSourceOptions.map(String).includes(input.ranking_source)
    ) {
      return toolFailure("not_found", `Ranking source ${input.ranking_source} is not loaded.`)
    }
    const availableAdpSources = Object.values(ThirdPartyADPRanker).map(String)
    if (input.adp_source && !availableAdpSources.includes(input.adp_source)) {
      return toolFailure("not_found", `ADP source ${input.adp_source} is unsupported.`)
    }
    const teamCount = input.team_count ?? settings.numTeams
    const userDraftSlot = input.user_draft_slot ?? Math.min(myPickNum, teamCount)
    if (userDraftSlot > teamCount) {
      return toolFailure("invalid_input", "user_draft_slot cannot exceed team_count.")
    }
    const baseSettings = {
      ...settings,
      numTeams: teamCount,
      numStartingQbs: input.starting_qbs ?? settings.numStartingQbs,
      numStartingRbs: input.starting_rbs ?? settings.numStartingRbs,
      numStartingWrs: input.starting_wrs ?? settings.numStartingWrs,
      numStartingTes: input.starting_tes ?? settings.numStartingTes,
      numFlex: input.flex ?? settings.numFlex,
      numBenchPlayers: input.bench ?? settings.numBenchPlayers,
    }
    const nextSettings = input.scoring_format
      ? settingsWithScoringFormat(baseSettings, input.scoring_format)
      : baseSettings
    replaceSettings(nextSettings)
    setMyPickNum(userDraftSlot)
    if (input.ranking_source) onSetRanker(input.ranking_source)
    if (input.adp_source) {
      onSetAdpRanker(input.adp_source as ThirdPartyADPRanker)
    }
    const current = getWebMcpWorkspace()
    const result: DraftyWorkspaceSnapshot = {
      ...current,
      draft: {...current.draft, teamCount, userDraftSlot},
      configuration: {
        ...current.configuration,
        scoringFormat: scoringFormatFor(nextSettings),
        starters: {
          qb: nextSettings.numStartingQbs,
          rb: nextSettings.numStartingRbs,
          wr: nextSettings.numStartingWrs,
          te: nextSettings.numStartingTes,
          flex: nextSettings.numFlex,
          bench: nextSettings.numBenchPlayers,
        },
        rankingSource: input.ranking_source || current.configuration.rankingSource,
        adpSource: input.adp_source || current.configuration.adpSource,
      },
    }
    return toolSuccess(result, "Drafty workspace configuration was applied.", "accepted")
  }, [
    draftStarted,
    getWebMcpWorkspace,
    myPickNum,
    onSetAdpRanker,
    onSetRanker,
    rankingSourceOptions,
    replaceSettings,
    setMyPickNum,
    settings,
  ])

  const setWebMcpRankingsView = useCallback((input: DraftySetRankingsViewInput) => {
    const current = getWebMcpWorkspace().rankings
    const nextView = input.view || current.view
    const nextPositions = input.positions || current.visiblePositions
    const nextPage = input.adp_round === undefined
      ? adpRoundPage
      : input.adp_round - 1
    const nextSort = input.sort || current.sort
    const nextFilter = input.filter_ranked_below_adp ?? current.filterRankedBelowAdp
    if (input.view) setDraftView(agentDraftView(input.view))
    if (input.positions) {
      setRankingVisiblePositions(input.positions as RankingLanePosition[])
    }
    if (input.adp_round !== undefined) setAdpRoundPage(nextPage)
    if (input.sort) {
      onApplyRankingSortBy(input.sort === "adp")
      setSortOption(input.sort === "adp" ? SortOption.ADP : SortOption.RANKS)
    }
    if (input.filter_ranked_below_adp !== undefined) {
      setFilterRankedBelowAdp(input.filter_ranked_below_adp)
    }
    const result: DraftyWorkspaceSnapshot["rankings"] = {
      ...current,
      view: nextView,
      visiblePositions: [...nextPositions],
      sort: nextSort,
      adpRoundPage: nextPage + 1,
      adpRoundsVisible: [nextPage + 1, nextPage + 2, nextPage + 3],
      filterRankedBelowAdp: nextFilter,
    }
    return toolSuccess(
      result,
      "Drafty rankings view was applied.",
      JSON.stringify(result) === JSON.stringify(current) ? "unchanged" : "accepted",
    )
  }, [adpRoundPage, getWebMcpWorkspace, onApplyRankingSortBy])

  const showWebMcpPlayerProfile = useCallback((input: DraftyShowPlayerProfileInput) => {
    const player = playerLib[input.player_id]
    if (!player) {
      return toolFailure("not_found", `Player ${input.player_id} is not in the current Drafty universe.`)
    }
    const pin = input.pin !== false
    setViewPlayerId(player.id)
    setPinnedProfilePlayerId(pin ? player.id : null)
    const nextModule = input.module === undefined
      ? profileModule
      : input.module === "auto" ? null : input.module
    if (input.module !== undefined) setProfileModule(nextModule)
    const advancedDetailsOpen = input.advanced_details_open
      ?? profileAdvancedDetailsOpen
    if (input.advanced_details_open !== undefined) {
      setProfileAdvancedDetailsOpen(input.advanced_details_open)
    }
    const result: DraftyWorkspaceSnapshot["profile"] = {
      playerId: player.id,
      playerName: player.fullName,
      pinned: pin,
      module: nextModule || "auto",
      advancedDetailsOpen,
    }
    return toolSuccess(
      result,
      `${player.fullName} is shown in the player profile.`,
      "accepted",
    )
  }, [playerLib, profileAdvancedDetailsOpen, profileModule])

  const setWebMcpPlayerTarget = useCallback((input: DraftySetPlayerTargetInput) => {
    const player = playerLib[input.player_id]
    if (!player) {
      return toolFailure("not_found", `Player ${input.player_id} is not in the current Drafty universe.`)
    }
    const prior = playerTargets.find(target => target.playerId === player.id)
    const previousTargetRound = prior?.targetAsEarlyAsRound || null
    if (previousTargetRound === input.target_round) {
      return toolSuccess({
        playerId: player.id,
        playerName: player.fullName,
        previousTargetRound,
        targetRound: input.target_round,
        targetCount: playerTargets.length,
        persistence: {
          local: "unchanged" as const,
          cloudSyncEnabled: apiFeatures.cloudProfileSyncEnabled,
          authenticated: Boolean(draftyAuth.user),
          cloudSyncState: cloudProfileSync.state,
        },
      }, `${player.fullName}'s target is unchanged.`, "unchanged")
    }
    if (
      input.target_round !== null
      && !playerRanks.availPlayersByOverallRank.some(candidate => candidate.id === player.id)
    ) {
      return toolFailure(
        "not_allowed",
        `${player.fullName} is not currently available and cannot be targeted.`,
      )
    }
    const nextTargets = input.target_round === null
      ? playerTargets.filter(target => target.playerId !== player.id)
      : [
        ...playerTargets.filter(target => target.playerId !== player.id),
        {playerId: player.id, targetAsEarlyAsRound: input.target_round},
      ]
    replacePlayerTargets(nextTargets)
    return toolSuccess({
      playerId: player.id,
      playerName: player.fullName,
      previousTargetRound,
      targetRound: input.target_round,
      targetCount: nextTargets.length,
      persistence: {
        local: "scheduled" as const,
        cloudSyncEnabled: apiFeatures.cloudProfileSyncEnabled,
        authenticated: Boolean(draftyAuth.user),
        cloudSyncState: cloudProfileSync.state,
      },
    }, input.target_round === null
      ? `${player.fullName}'s target was removed.`
      : `${player.fullName} is targeted as early as round ${input.target_round}.`,
    "accepted")
  }, [
    apiFeatures.cloudProfileSyncEnabled,
    cloudProfileSync.state,
    draftyAuth.user,
    playerLib,
    playerRanks.availPlayersByOverallRank,
    playerTargets,
    replacePlayerTargets,
  ])

  const startWebMcpRankEditing = useCallback((input: DraftyStartRankEditingInput) => {
    if (noPlayers) {
      return toolFailure("not_allowed", "Rankings are not loaded yet.")
    }
    if (!canEditCustomRankings()) {
      return toolFailure(
        "not_allowed",
        "Custom rankings are locked after a player is drafted or purged.",
      )
    }
    const source = input.source_ranker || String(boardSettings.ranker)
    if (!rankingSourceOptions.map(String).includes(source)) {
      return toolFailure("not_found", `Ranking source ${source} is not loaded.`)
    }
    const hasCustomBoard = Boolean(rankings.copiedRanker) && (
      playerRanks.availPlayersByOverallRank.some(player => (
        Boolean(player.ranks?.[ThirdPartyRanker.CUSTOM])
      ))
    )
    if (source === String(ThirdPartyRanker.CUSTOM) && !hasCustomBoard) {
      return toolFailure(
        "not_allowed",
        "No custom board exists yet; start from a loaded analyst ranking source.",
      )
    }
    if (isEditingCustomRanking) {
      const activeSource = rankings.copiedRanker
        ? String(rankings.copiedRanker)
        : String(boardSettings.ranker)
      if (source !== String(ThirdPartyRanker.CUSTOM) && source !== activeSource) {
        return toolFailure(
          "not_allowed",
          `Rank editing is already active from ${activeSource}; save it before choosing another source.`,
        )
      }
      return toolSuccess({
        editing: true,
        rankingSource: String(ThirdPartyRanker.CUSTOM),
        copiedFrom: rankings.copiedRanker ? String(rankings.copiedRanker) : null,
        editable: true,
      }, "Custom rank editing is already active.", "unchanged")
    }
    const started = onStartCustomRanking(source as FantasyRanker)
    if (!started) {
      return toolFailure("not_allowed", "Custom rank editing could not be started.")
    }
    setDraftView(DraftView.CUSTOM_RANKING)
    return toolSuccess({
      editing: true,
      rankingSource: String(ThirdPartyRanker.CUSTOM),
      copiedFrom: source === String(ThirdPartyRanker.CUSTOM)
        ? rankings.copiedRanker ? String(rankings.copiedRanker) : null
        : source,
      editable: true,
    }, "Custom positional-rank editing is active.", "accepted")
  }, [
    boardSettings.ranker,
    canEditCustomRankings,
    isEditingCustomRanking,
    noPlayers,
    onStartCustomRanking,
    playerRanks.availPlayersByOverallRank,
    rankingSourceOptions,
    rankings.copiedRanker,
  ])

  const moveWebMcpPlayerRank = useCallback((input: DraftyMovePlayerRankInput) => {
    if (!isEditingCustomRanking) {
      return toolFailure("not_allowed", "Start custom rank editing before moving a player.")
    }
    if (!canEditCustomRankings()) {
      return toolFailure(
        "not_allowed",
        "Custom rankings are locked after a player is drafted or purged.",
      )
    }
    const player = playerLib[input.player_id]
    if (!player) {
      return toolFailure("not_found", `Player ${input.player_id} is not in the current Drafty universe.`)
    }
    if (!WEBMCP_RANK_EDIT_POSITIONS.some(position => position === player.position)) {
      return toolFailure("not_allowed", `${player.position} rankings are not editable in Drafty.`)
    }
    const position = player.position as typeof WEBMCP_RANK_EDIT_POSITIONS[number]
    const positionPlayers = playerRanks[position]
    const previousIndex = positionPlayers.findIndex(candidate => candidate.id === player.id)
    if (previousIndex < 0) {
      return toolFailure("not_allowed", `${player.fullName} is not on the editable rankings board.`)
    }
    if (input.new_rank > positionPlayers.length) {
      return toolFailure(
        "invalid_input",
        `new_rank must be from 1 to ${positionPlayers.length} for ${position}.`,
      )
    }
    const previousRank = previousIndex + 1
    if (previousRank === input.new_rank) {
      return toolSuccess({
        playerId: player.id,
        playerName: player.fullName,
        position,
        previousRank,
        rank: input.new_rank,
        positionPlayerCount: positionPlayers.length,
        persistence: "unsaved" as const,
      }, `${player.fullName} is already ${position}${input.new_rank}.`, "unchanged")
    }
    onReorderPlayerInPosition(player.id, position, input.new_rank - 1)
    return toolSuccess({
      playerId: player.id,
      playerName: player.fullName,
      position,
      previousRank,
      rank: input.new_rank,
      positionPlayerCount: positionPlayers.length,
      persistence: "unsaved" as const,
    }, `${player.fullName} moved from ${position}${previousRank} to ${position}${input.new_rank}.`, "accepted")
  }, [
    canEditCustomRankings,
    isEditingCustomRanking,
    onReorderPlayerInPosition,
    playerLib,
    playerRanks,
  ])

  const saveWebMcpRankEdits = useCallback(() => {
    if (!isEditingCustomRanking) {
      return toolFailure("not_allowed", "There are no active custom rank edits to save.")
    }
    if (!canEditCustomRankings()) {
      return toolFailure(
        "not_allowed",
        "Custom rankings are locked after a player is drafted or purged.",
      )
    }
    try {
      rankingProfileControls.saveLocal()
    } catch {
      return toolFailure("internal_error", "Custom rankings could not be saved to the canonical browser profile.")
    }
    onFinishCustomRanking()
    setDraftView(DraftView.RANKING)
    return toolSuccess({
      editing: false as const,
      rankingSource: String(ThirdPartyRanker.CUSTOM),
      localPersistence: "saved" as const,
      cloudSync: {
        enabled: apiFeatures.cloudProfileSyncEnabled,
        authenticated: Boolean(draftyAuth.user),
        state: cloudProfileSync.state,
      },
    }, apiFeatures.cloudProfileSyncEnabled && draftyAuth.user
      ? "Custom rankings were saved locally; authenticated cloud sync will reconcile this profile."
      : "Custom rankings were saved to this browser.",
    "accepted")
  }, [
    apiFeatures.cloudProfileSyncEnabled,
    canEditCustomRankings,
    cloudProfileSync.state,
    draftyAuth.user,
    isEditingCustomRanking,
    onFinishCustomRanking,
    rankingProfileControls,
  ])

  const webMcpAdapter = useMemo(() => ({
    getWorkspace: getWebMcpWorkspace,
    getDecisionContext: getWebMcpDecisionContext,
    getPlayerEvidence: getWebMcpPlayerEvidence,
    searchPlayers: (input: Parameters<typeof searchDraftyPlayers>[0]["input"]) => (
      searchDraftyPlayers({
        players: Object.values(playerLib),
        settings,
        boardSettings,
        playerTargets,
        availablePlayerIds: new Set(
          playerRanks.availPlayersByOverallRank.map(player => player.id),
        ),
        input,
      })
    ),
    configureWorkspace: configureWebMcpWorkspace,
    setRankingsView: setWebMcpRankingsView,
    showPlayerProfile: showWebMcpPlayerProfile,
    setPlayerTarget: setWebMcpPlayerTarget,
    startRankEditing: startWebMcpRankEditing,
    movePlayerRank: moveWebMcpPlayerRank,
    saveRankEdits: saveWebMcpRankEdits,
  }), [
    boardSettings,
    configureWebMcpWorkspace,
    getWebMcpWorkspace,
    getWebMcpDecisionContext,
    getWebMcpPlayerEvidence,
    playerLib,
    playerRanks.availPlayersByOverallRank,
    playerTargets,
    moveWebMcpPlayerRank,
    saveWebMcpRankEdits,
    setWebMcpRankingsView,
    setWebMcpPlayerTarget,
    startWebMcpRankEditing,
    settings,
    showWebMcpPlayerProfile,
  ])
  const webMcpRegistration = useDraftyWebMcp(webMcpAdapter)
  const mockReviewWebMcpRegistration = useDraftyMockReviewWebMcp({
    season: persistenceSeason,
    user: draftyAuth.user,
    currentArchive: completedMockArchive,
    onOpenReview: setWebMcpMockReviewArchive,
  })

  const liveAdvisorPanelProps: LiveAdvisorPanelProps = {
    draftStarted,
    onSelectPlayer,
    onExportReplay: canExportReplay ? () => exportReplay() : undefined,
    onExportRosterOnly: canExportReplay ? () => exportReplay(true) : undefined,
    replayCaptureStatus,
    empiricalBaseShadowCaptureStatus,
    runOnlyShadowCaptureStatus,
    replayExportPreflight,
    recommendations,
    playerStatus,
    draftPlan: realtimeAdvisor.plan,
    realtimeProposals: realtimeAdvisor.proposals,
    onAcceptProposal: realtimeAdvisor.acceptProposal,
    onRejectProposal: realtimeAdvisor.rejectProposal,
    ...(apiFeatures.realtimeAdvisorEnabled ? {
      realtimeStatus: realtimeConversation.status,
      realtimeMessages: realtimeConversation.messages,
      realtimeError: realtimeConversation.error,
      realtimeIsResponding: realtimeConversation.isResponding,
      realtimeReconnectAttempt: realtimeConversation.reconnectAttempt,
      realtimeAutoAdviceEnabled: realtimeConversation.autoAdviceEnabled,
      realtimeMode: realtimeConversation.mode,
      realtimeMicrophoneEnabled: realtimeConversation.microphoneEnabled,
      realtimeIsUserSpeaking: realtimeConversation.isUserSpeaking,
      onConnectRealtime: realtimeConversation.connect,
      onDisconnectRealtime: realtimeConversation.disconnect,
      onCancelRealtimeResponse: realtimeConversation.cancelResponse,
      onSetRealtimeAutoAdviceEnabled: realtimeConversation.setAutoAdviceEnabled,
      onSetRealtimeMode: realtimeConversation.setMode,
      onSetRealtimeMicrophoneEnabled: realtimeConversation.setMicrophoneEnabled,
      onSendRealtimeText: realtimeConversation.sendText,
    } : {}),
  }
  const insightWebMcpExpected = draftDeskEnabled && phase14CInsightDeckEnabled
  const expectedWebMcpStatuses = insightWebMcpExpected
    ? [webMcpRegistration.status, insightWebMcpRegistration.status, mockReviewWebMcpRegistration.status]
    : [webMcpRegistration.status, mockReviewWebMcpRegistration.status]
  const combinedWebMcpStatus = expectedWebMcpStatuses.includes("error")
    ? "error"
    : webMcpRegistration.status === "ready"
      && mockReviewWebMcpRegistration.status === "ready"
      && (!insightWebMcpExpected || insightWebMcpRegistration.status === "ready")
      ? "ready"
      : expectedWebMcpStatuses.includes("registering")
        ? "registering"
        : "unsupported"
  const registeredWebMcpToolCount = webMcpRegistration.registeredToolCount
    + insightWebMcpRegistration.registeredToolCount
    + mockReviewWebMcpRegistration.registeredToolCount

  return (
    <div
      className={`flex flex-col items-center justify-center min-h-screen relative ${draftDeskEnabled ? draftDeskStyles.deskViewport : ""}`}
      data-webmcp-status={combinedWebMcpStatus}
      data-webmcp-tool-count={registeredWebMcpToolCount}
    >
      <PageHead />
      <main className={`flex flex-col items-center justify-center w-full flex-1 text-center bg-gray-50 ${draftDeskEnabled ? draftDeskStyles.deskMain : "md:px-20"}`}>
        {draftDeskEnabled && (
          <div className="hidden w-full xl:block">
            <DraftDeskAppBar
              activeDraftListenerTitle={activeDraftListenerTitle}
              boardSettings={boardSettings}
              draftCaptureState={draftCaptureState}
              draftPersistence={draftPersistence}
              draftSourceHealth={draftSourceHealth}
              draftSourceHealthFreshness={draftSourceHealthFreshness}
              draftStarted={draftStarted}
              myPickNum={myPickNum}
              onRetryDraftPersistence={retryDraftPersistence}
              onSetAdpRanker={onSetAdpRanker}
              onSetRanker={onSetRanker}
              rankingSources={rankingSourceOptions}
              setIsPpr={setIsPpr}
              setScoringFormat={setScoringFormat}
              setMyPickNum={setMyPickNum}
              setNumTeams={setNumTeams}
              settings={settings}
              workspaceOperations={(
                <div className="grid gap-3">
                  <CloudProfileControl
                    auth={draftyAuth}
                    sync={cloudProfileSync}
                  />
                  <MockDraftReviewPanel
                    currentArchive={completedMockArchive}
                    requestedArchive={webMcpMockReviewArchive}
                    season={persistenceSeason}
                    user={draftyAuth.user}
                  />
                  <button
                    className={`${draftDeskStyles.focusRing} rounded border border-slate-500 px-3 py-2 text-sm font-semibold hover:bg-slate-800`}
                    onClick={() => setDraftDeskPanePlacement(current =>
                      swapDraftDeskPanePlacement(current))}
                    type="button"
                  >
                    Swap rankings and insight panes
                  </button>
                </div>
              )}
              setupOperations={!noPlayers ? (
                <PortableDataControls
                  createPackage={createPortableData}
                  importDisabledReason={draftStarted || draftHistory.some(Boolean)
                    ? "Finish or start a new draft before importing data; live picks stay untouched."
                    : null}
                  onApply={applyPortableData}
                  validationContext={portableValidationContext}
                />
              ) : undefined}
            />
          </div>
        )}
        {/* Accepted Phase 13 desktop header, retained as the feature-flag rollback. */}
        {!draftDeskEnabled && <div className="hidden md:block">
          <Header
            settings={settings}
            boardSettings={boardSettings}
            draftStarted={draftStarted}
            myPickNum={myPickNum}
            setNumTeams={setNumTeams}
            setIsPpr={setIsPpr}
            setScoringFormat={setScoringFormat}
            setMyPickNum={setMyPickNum}
            onSetRanker={onSetRanker}
            rankingSources={rankingSourceOptions}
            onSetAdpRanker={onSetAdpRanker}
          />
        </div>}

        <div className={`flex flex-col items-center mt-1 w-full ${draftDeskEnabled ? `${draftDeskStyles.deskBody} h-screen xl:mt-0` : "h-screen md:mt-4"}`}>
          {!draftDeskEnabled && <div className="hidden w-full justify-end px-5 md:flex">
            <button
              className={`mb-2 rounded-lg border px-4 py-2 text-sm font-semibold transition ${
                analysisOpen
                  ? "border-indigo-600 bg-indigo-600 text-white"
                  : "border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-50"
              }`}
              onClick={() => setAnalysisOpen(current => !current)}
            >
              {analysisOpen ? "Close analysis" : "Open analysis workspace"}
            </button>
          </div>}
          {!draftDeskEnabled && !noPlayers && (
            <div className="hidden w-full xl:block">
              <PortableDataControls
                createPackage={createPortableData}
                importDisabledReason={draftStarted || draftHistory.some(Boolean)
                  ? "Finish or start a new draft before importing data; live picks stay untouched."
                  : null}
                onApply={applyPortableData}
                validationContext={portableValidationContext}
              />
            </div>
          )}
          {startupMigrationStatus && (
            <p className="mb-2 hidden px-3 text-left text-xs text-slate-600 xl:block" role="status">
              {startupMigrationStatus}
            </p>
          )}
          {draftDeskEnabled && (
            <div
              className={`${draftDeskStyles.desk} ${draftDeskStyles.deskShell} hidden w-full flex-1 xl:flex`}
              data-testid="draft-desk-shell"
              style={draftDeskShellStyle}
            >
              <div className={draftDeskStyles.centerPanes}>
                {draftDeskPanePlacement.map((pane: DraftDeskPaneId) => (
                  <React.Fragment key={pane}>
                    {pane === "profile" && (
                      <DraftDeskProfilePane
                        advancedDetailsOpen={profileAdvancedDetailsOpen}
                        boardSettings={boardSettings}
                        onAdvancedDetailsOpenChange={setProfileAdvancedDetailsOpen}
                        onPinnedModuleChange={setProfileModule}
                        player={viewPlayerId ? playerLib[viewPlayerId] : null}
                        players={Object.values(playerLib)}
                        playerStatus={playerStatus}
                        rankingSummaries={rankingSummaries}
                        rankingsSeason={rankings.season}
                        settings={settings}
                        pinnedModule={profileModule}
                      />
                    )}
                    {pane === "rankings" && (
                      <section aria-label="Rankings pane" className={`${draftDeskStyles.pane} flex h-full min-h-0 flex-col`}>
                        <DeskPaneHeader
                          actions={(
                            <DeskSegmentedControl
                              ariaLabel="Rankings mode"
                              disabled={isEditingCustomRanking}
                              items={[
                                {id: DraftView.RANKING, label: "Position"},
                                {id: DraftView.ADP_ROUND, label: "ADP round"},
                                {id: DraftView.TARGETS, label: "Targets"},
                              ]}
                              onSelect={setDraftView}
                              selectedId={[DraftView.ADP_ROUND, DraftView.TARGETS].includes(draftView)
                                ? draftView
                                : DraftView.RANKING}
                            />
                          )}
                          kicker="Board"
                          title="Rankings"
                        />
                        <div className="min-h-0 flex-1">
                          <RankingsBoard
                            adpRoundPage={adpRoundPage}
                            compact
                            filterRankedBelowAdp={filterRankedBelowAdp}
                            hideCompactModeControl
                            playerRanks={playerRanks}
                            predictedPicks={isEditingCustomRanking || usingCustomRanking ? {} : predictedPicks}
                            draftView={draftView}
                            setDraftView={setDraftView}
                            sortOption={sortOption}
                            setSortOption={setSortOption}
                            highlightOption={highlightOption}
                            setHighlightOption={setHighlightOption}
                            myPickNum={myPickNum}
                            noPlayers={noPlayers}
                            currPick={currPick}
                            predNextTiers={isEditingCustomRanking || usingCustomRanking ? {} : predNextTiers}
                            fantasySettings={settings}
                            boardSettings={boardSettings}
                            rankingSummaries={rankingSummaries}
                            onSelectPlayer={onSelectPlayer}
                            onPurgePlayer={onPurgeAvailPlayer}
                            setViewPlayerId={focusBoardPlayer}
                            pinnedPlayerId={pinnedProfilePlayerId}
                            onPinPlayer={togglePinnedProfilePlayer}
                            visiblePositions={rankingVisiblePositions}
                            onVisiblePositionsChange={setRankingVisiblePositions}
                            onAdpRoundPageChange={setAdpRoundPage}
                            onFilterRankedBelowAdpChange={setFilterRankedBelowAdp}
                            isEditingCustomRanking={isEditingCustomRanking}
                            hasCustomRanking={usingCustomRanking}
                            canEditCustomRankings={canEditCustomRankings()}
                            onReorderPlayer={onReorderPlayerInPosition}
                            onStartCustomRanking={handleStartCustomRanking}
                            onFinishCustomRanking={handleFinishCustomRanking}
                            onUpdateTierBoundary={onUpdateTierBoundary}
                            onCancelCustomRanking={() => setDraftView(DraftView.RANKING)}
                            rosters={rosters}
                            playerLib={playerLib}
                            draftStarted={draftStarted}
                            getDraftRoundForPickNum={getDraftRoundForPickNum}
                            viewPlayerId={viewPlayerId}
                            draftHistory={draftHistory}
                            viewRosterIdx={myPickNum - 1}
                            activeDraftListenerTitle={activeDraftListenerTitle}
                            draftCaptureState={draftCaptureState}
                            draftSourceHealth={draftSourceHealth}
                            draftSourceHealthFreshness={draftSourceHealthFreshness}
                            draftPersistence={draftPersistence}
                            onRetryDraftPersistence={retryDraftPersistence}
                            loadCurrentRankings={loadCurrentRankings}
                            rankings={rankings}
                            latestRankings={latestRankings}
                            rankingProfileControls={rankingProfileControls}
                            removePlayerTargets={removePlayerTargets}
                            replacePlayerTargets={replacePlayerTargets}
                            myPicks={myPicks}
                            playerTargets={playerTargets}
                            customAndLatestRankingsDiffs={customAndLatestRankingsDiffs}
                            onSyncPendingRankings={onSyncPendingRankings}
                            onRevertPlayerToPreSync={onRevertPlayerToPreSync}
                            addPlayerTarget={addPlayerTarget}
                            removePlayerTarget={removePlayerTarget}
                          />
                        </div>
                      </section>
                    )}
                    {pane === "insight" && (
                      <section aria-label="Deterministic insight pane" className={`${draftDeskStyles.pane} flex h-full min-h-0 flex-col`}>
                        {phase14CInsightDeckEnabled ? (
                          <DeskPaneHeader
                            actions={<DraftDeskAdvisorDisclosure {...liveAdvisorPanelProps} />}
                            kicker="Decision views · auto or pinned"
                            title="Insight deck"
                          />
                        ) : (
                          <DeskPaneHeader
                            actions={<DraftDeskAdvisorDisclosure {...liveAdvisorPanelProps} />}
                            kicker="Decision view · auto"
                            title="Cross-position value"
                          />
                        )}
                        {phase14CInsightDeckEnabled ? (
                          <div className="min-h-0 flex-1 overflow-hidden p-2 text-left">
                            <DraftDeskInsightDeck
                              advisorContext={advisorContext}
                              availablePlayers={analysisAvailablePlayers}
                              boardSettings={boardSettings}
                              comparisonController={comparisonController}
                              draftPlan={realtimeAdvisor.plan}
                              materialEvent={draftDeskInsightMaterialEvent}
                              myRosterIndex={myPickNum - 1}
                              onAgentStateChange={setInsightAgentState}
                              onInspectPlayer={player => setViewPlayerId(player.id)}
                              onWebMcpRegistrationStateChange={setInsightWebMcpRegistration}
                              opponentForecast={opponentForecast}
                              playerStatus={playerStatus}
                              rankingSummaries={rankingSummaries}
                              recommendations={recommendations}
                              rosters={rosters}
                              settings={settings}
                              playerTargets={playerTargets}
                              visibleTierPositions={rankingVisiblePositions}
                              onVisibleTierPositionsChange={setRankingVisiblePositions}
                            />
                          </div>
                        ) : (
                          <div className="min-h-0 flex-1 overflow-y-auto p-2 text-left">
                            <AnalysisWorkspace
                              availablePlayers={analysisAvailablePlayers}
                              boardSettings={boardSettings}
                              compact
                              comparisonController={comparisonController}
                              followActivePlayer={false}
                              players={Object.values(playerLib)}
                              rankingSummaries={rankingSummaries}
                              recommendations={recommendations}
                              opponentForecast={opponentForecast}
                              settings={settings}
                              playerStatus={playerStatus}
                              analysisViewEvent={analysisViewEvents.desktop}
                              onAnalysisViewEventHandled={acknowledgeAnalysisViewNavigation}
                            />
                          </div>
                        )}
                      </section>
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}
          {!draftDeskEnabled && !analysisOpen && (
            <div className="hidden w-full px-5 xl:block">
              <LiveAdvisorPanel {...liveAdvisorPanelProps} />
            </div>
          )}
          {!draftDeskEnabled && analysisOpen && (
            <div className="hidden w-screen px-4 pb-8 md:block">
              <AnalysisWorkspace
                activePlayer={viewPlayerId ? playerLib[viewPlayerId] : null}
                availablePlayers={analysisAvailablePlayers}
                boardSettings={boardSettings}
                comparisonController={comparisonController}
                onClose={() => setAnalysisOpen(false)}
                players={Object.values(playerLib)}
                rankingSummaries={rankingSummaries}
                recommendations={recommendations}
                opponentForecast={opponentForecast}
                settings={settings}
                playerStatus={playerStatus}
                analysisViewEvent={analysisViewEvents.desktop}
                onAnalysisViewEventHandled={
                  acknowledgeAnalysisViewNavigation
                }
              />
            </div>
          )}
          {/* Desktop Layout */}
          {!draftDeskEnabled && !analysisOpen && (
          <div className="hidden md:grid justify-center w-screen relative mb-4 grid grid-cols-12 gap-1 px-1">
            {/* Stats Column */}
            <div className="md:col-span-3">
              <div className="justify-start ml-2 p-1 w-full">
                <OptimalRosterDisplay
                  currentOptimalRoster={currentOptimalRoster}
                  optimalRosters={optimalRosters}
                  selectedOptimalRosterIdx={selectedOptimalRosterIdx}
                  setSelectedOptimalRosterIdx={setSelectedOptimalRosterIdx}
                  boardSettings={boardSettings}
                  settings={settings}
                  rankingSummaries={rankingSummaries}
                />
                <RankingSummaryDisplay
                  activePlayer={viewPlayerId ? playerLib[viewPlayerId] : null}
                  rankingSummaries={rankingSummaries}
                  settings={settings}
                  ranker={boardSettings.ranker}
                />
                <PlayerRankingTable
                  player={viewPlayerId ? playerLib[viewPlayerId] : null}
                  settings={settings}
                  boardSettings={boardSettings}
                />
                <PlayerStatusPanel
                  playerId={viewPlayerId}
                  status={
                    viewPlayerId
                      ? playerStatus[viewPlayerId]
                      : undefined
                  }
                  playerName={
                    viewPlayerId
                      ? playerLib[viewPlayerId]?.fullName
                      : undefined
                  }
                />
                <HistoricalStats
                  settings={settings}
                  player={viewPlayerId ? playerLib[viewPlayerId] : null}
                />
                <HistoricalComparison
                  settings={settings}
                  player={viewPlayerId ? playerLib[viewPlayerId] : null}
                  players={Object.values(playerLib)}
                />
              </div>
            </div>

            {/* Rankings Board Column */}
            <div className="col-span-5">
              <RankingsBoard
                adpRoundPage={adpRoundPage}
                filterRankedBelowAdp={filterRankedBelowAdp}
                playerRanks={playerRanks}
                predictedPicks={isEditingCustomRanking || usingCustomRanking ? {} : predictedPicks}
                draftView={draftView}
                setDraftView={setDraftView}
                sortOption={sortOption}
                setSortOption={setSortOption}
                highlightOption={highlightOption}
                setHighlightOption={setHighlightOption}
                myPickNum={myPickNum}
                noPlayers={noPlayers}
                currPick={currPick}
                predNextTiers={isEditingCustomRanking || usingCustomRanking ? {} : predNextTiers}
                fantasySettings={settings}
                boardSettings={boardSettings}
                rankingSummaries={rankingSummaries}
                onSelectPlayer={onSelectPlayer}
                onPurgePlayer={onPurgeAvailPlayer}
                setViewPlayerId={setViewPlayerId}
                onAdpRoundPageChange={setAdpRoundPage}
                onFilterRankedBelowAdpChange={setFilterRankedBelowAdp}
                isEditingCustomRanking={isEditingCustomRanking}
                hasCustomRanking={usingCustomRanking}
                canEditCustomRankings={canEditCustomRankings()}
                onReorderPlayer={onReorderPlayerInPosition}
                onStartCustomRanking={handleStartCustomRanking}
                onFinishCustomRanking={handleFinishCustomRanking}
                onUpdateTierBoundary={onUpdateTierBoundary}
                onCancelCustomRanking={() => {
                  setDraftView(DraftView.RANKING)
                }}
                rosters={rosters}
                playerLib={playerLib}
                draftStarted={draftStarted}
                getDraftRoundForPickNum={getDraftRoundForPickNum}
                viewPlayerId={viewPlayerId}
                draftHistory={draftHistory}
                viewRosterIdx={myPickNum-1}
                activeDraftListenerTitle={activeDraftListenerTitle}
                draftCaptureState={draftCaptureState}
                draftSourceHealth={draftSourceHealth}
                draftSourceHealthFreshness={draftSourceHealthFreshness}
                draftPersistence={draftPersistence}
                onRetryDraftPersistence={retryDraftPersistence}
                loadCurrentRankings={loadCurrentRankings}
                rankings={rankings}
                latestRankings={latestRankings}
                rankingProfileControls={rankingProfileControls}
                removePlayerTargets={removePlayerTargets}
                replacePlayerTargets={replacePlayerTargets}
                myPicks={myPicks}
                playerTargets={playerTargets}
                customAndLatestRankingsDiffs={customAndLatestRankingsDiffs}
                onSyncPendingRankings={onSyncPendingRankings}
                onRevertPlayerToPreSync={onRevertPlayerToPreSync}
                addPlayerTarget={addPlayerTarget}
                removePlayerTarget={removePlayerTarget}
              />
            </div>

            <div className="col-span-4">
              <ADPView
                playerRanks={playerRanks}
                fantasySettings={settings}
                boardSettings={boardSettings}
                onSelectPlayer={onSelectPlayer}
                setViewPlayerId={setViewPlayerId}
                viewPlayerId={viewPlayerId}
                myPicks={myPicks}
                currPick={currPick}
                playerTargets={playerTargets}
                playerLib={playerLib}
                addPlayerTarget={addPlayerTarget}
                replacePlayerTargets={replacePlayerTargets}
                removePlayerTarget={removePlayerTarget}
                removePlayerTargets={removePlayerTargets}
                rankingSummaries={rankingSummaries}
                myPickNum={myPickNum}
              />
            </div>
          </div>
          )}

          <div className="h-full w-full xl:hidden">
            <MobileRankingsEditor
              addPlayerTarget={addPlayerTarget}
              boardSettings={boardSettings}
              canEditRankings={canEditCustomRankings()}
              isEditingRankings={isEditingCustomRanking}
              onBeginRankEdits={handleBeginMobileRankings}
              onReorderPlayer={onReorderPlayerInPosition}
              onSaveRankEdits={handleSaveMobileRankings}
              playerLib={playerLib}
              playerRanks={playerRanks}
              playerTargets={playerTargets}
              profileControl={(
                <CloudProfileControl
                  auth={draftyAuth}
                  compact
                  sync={cloudProfileSync}
                />
              )}
              removePlayerTarget={removePlayerTarget}
              replacePlayerTargets={replacePlayerTargets}
              settings={settings}
            />
          </div>
        </div>
      </main>

      {draftDeskEnabled && (
        <DraftDock
          roundIdx={roundIdx}
          currRoundPick={currRoundPick}
          currPick={currPick}
          isEvenRound={isEvenRound}
          currRound={currRound}
          playerLib={playerLib}
          rosters={rosters}
          settings={settings}
          boardSettings={boardSettings}
          connected={draftCaptureState === "live"}
          activity={draftTickerActivity}
          connectionDetail={draftCaptureState === "live" ? "Pick feed current" : "Local board current"}
          connectionLabel={draftCaptureState === "live" ? "ESPN connected" : "Draft feed ready"}
          draftHistory={draftHistory}
          myPickNum={myPickNum}
          myPicks={myPicks}
          pendingDraftTitle={pendingDraft?.title || null}
          onAcceptDraft={acceptPendingDraft}
          onIgnoreDraft={ignorePendingDraft}
          onRemovePick={onRemovePick}
          onHeightChange={onDraftDeskDockHeightChange}
          setCurrPick={setCurrPick}
          setViewPlayerId={setViewPlayerId}
        />
      )}
      {!draftDeskEnabled && draftStarted &&
        <PickHistoryFooter
          roundIdx={roundIdx}
          currRoundPick={currRoundPick}
          currPick={currPick}
          isEvenRound={isEvenRound}
          currRound={currRound}
          playerLib={playerLib}
          settings={settings}
          currMyPickNum={currMyPickNum}
          onRemovePick={onRemovePick}
          setCurrPick={setCurrPick}
          setViewPlayerId={setViewPlayerId}
        />
      }
    </div>
  )
}

export default Home;
