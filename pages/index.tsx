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
import MobileFooter, { MobileView } from "../components/MobileFooter"
import MobileTiersView from "../components/MobileTiersView"
import AnalysisWorkspace from "../components/analysis/AnalysisWorkspace"
import LiveAdvisorPanel from "../components/LiveAdvisorPanel"
import PortableDataControls from "../components/PortableDataControls"

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
  useRealtimeConversation,
} from "../behavior/hooks/useRealtimeConversation"
import { Player, ThirdPartyRanker } from "types"
import {
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
  loadPlayerData,
  rankingsAgeInDays,
  rankingsAreStale,
} from "@/behavior/playerData"
import { shouldIgnoreGlobalDraftShortcut } from "@/behavior/accessibility"
import {
  applyPortableRankingSnapshot,
  createImportedDraftPlan,
  createPortableDataPackage,
  PortableDataPackage,
  writeStorageTransaction,
} from "@/behavior/portableData"
import { draftPlanStorageKey } from "@/behavior/realtime/storage"
import {
  getSnapshotObservedThroughOverallPick,
  isDraftCaptureComplete,
} from "@/behavior/draft-feed/snapshots"

export enum DraftView {
  RANKING = "Rankings By Position",
  BEST_AVAILABLE = "Best Available By Round",
  CUSTOM_RANKING = "Edit Rankings",
}

export enum SortOption {
  RANKS = "Sort By Ranks",
  ADP = "Sort By ADP",
}



const Home: FC = () => {
  const {
    // state
    settings, setNumTeams, setIsPpr, replaceSettings,
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
    saveCustomRankings,
    loadCustomRankings,
    loadCustomRankingsData,
    hasCustomRankingsSaved,
    clearSavedCustomRankings,
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
  } = useRanks({ settings, myPickNum })

  const usingCustomRanking = boardSettings.ranker === ThirdPartyRanker.CUSTOM

  const rankingProfileControls = useRankingProfiles({
    playerRanks,
    rankings,
    settings,
    boardSettings,
    onLoadPlayers,
    onSetRanker,
    saveLocalRankings: saveCustomRankings,
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
          ? { ppr: snapshot.scoringFormat === "PPR" }
          : {}),
      })
      if (snapshot.targetRosterIndex !== null
        && snapshot.targetRosterIndex !== undefined) {
        setMyPickNum(snapshot.targetRosterIndex + 1)
      }
    },
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
    replayCaptureStatus,
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

  const [draftView, setDraftView] = useState<DraftView>(DraftView.RANKING)
  const [sortOption, setSortOption] = useState<SortOption>(SortOption.RANKS)
  const [viewPlayerId, setViewPlayerId] = useState<string | null>(null)
  const [selectedOptimalRosterIdx, setSelectedOptimalRosterIdx] = useState(0)
  const [mobileView, setMobileView] = useState<MobileView>(MobileView.OVERVIEW)
  const [analysisOpen, setAnalysisOpen] = useState(false)
  const statusPlayerIds = useMemo(() => [
    ...recommendations.candidates.map(candidate => candidate.player.id),
    ...(viewPlayerId ? [viewPlayerId] : []),
  ], [recommendations.candidates, viewPlayerId])
  const playerStatus = usePlayerStatusCache(statusPlayerIds)
  const [confirmedRealtimeView, setConfirmedRealtimeView] = useState<{
    view: "tier_landscape"
      | "positional_bests"
      | "cross_position"
      | "intra_position"
    explanation: string
    revision: number
  } | null>(null)
  const advisorPersistenceQueue = useRef(Promise.resolve())
  const sourceEventCount = draftHistory.filter(Boolean).length
  const realtimeAdvisor = useRealtimeAdvisor({
    draftSessionId: activeDraftSessionId,
    sourceEventCount,
    onApplyView: (view, proposal) => {
      setConfirmedRealtimeView({
        view,
        explanation: proposal.explanation,
        revision: sourceEventCount,
      })
      setAnalysisOpen(true)
    },
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
      }),
    })
  }, [
    activeDraftSessionId, activeDraftSnapshot, boardSettings, draftHistory,
    empiricalBaseShadowEvidence, myPickNum, playerLib, rankingSummaries,
    replayForecastEvidence, settings,
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

  useEffect(() => {
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
    const publish = () => persistAdvisorSnapshots({
        sessionId: activeDraftSessionId,
        sourceEventCount,
        inputFingerprint,
        recommendations,
        opponentForecast,
      })
    advisorPersistenceQueue.current = advisorPersistenceQueue.current
      .then(publish, publish)
      .catch(error => {
        console.warn(
          "Advisor snapshots remain local because persistence failed",
          error,
        )
      })
  }, [
    activeDraftSessionId,
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
  }), [playerLib])

  const createPortableData = useCallback(() => createPortableDataPackage({
    rankings,
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
    realtimeAdvisor.plan,
    settings,
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

    const nextRankings = {
      ...applyPortableRankingSnapshot(
        rankings,
        portable.data.custom_rankings,
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
    const writes = [
      {
        key: "ff-draft-custom-rankings",
        value: portable.data.custom_rankings
          ? JSON.stringify(nextRankings)
          : null,
      },
      {
        key: "ff-draft-favorites",
        value: JSON.stringify(importedTargets),
      },
      ...(importedPlan ? [{
        key: draftPlanStorageKey(activeDraftSessionId as string),
        value: JSON.stringify(importedPlan),
      }] : []),
    ]
    writeStorageTransaction(localStorage, writes)

    replaceSettings(portable.data.preferences.settings)
    setMyPickNum(portable.data.preferences.my_pick_num)
    replacePlayerTargets(importedTargets)
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
    sourceEventCount,
  ])

  const loadCurrentRankings = useCallback(async () => {
    const currentRankings = await loadPlayerData()
    if (!currentRankings) return
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

    // if custom rankings are detected load those as rankings and set latest rankings to the current rankings
    if (browserLoaded && hasCustomRankingsSaved()) {
      // Load custom rankings without setting state first to get the data
      const customRankingsData = loadCustomRankingsData()
      if (customRankingsData) {
        // Now load the custom rankings into state
        loadCustomRankings()
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
      }
    } else {
      // otherwise load the latest rankings
      onLoadPlayers(currentRankings)
      resetBoardSettings()
    }
  }, [onLoadPlayers, resetBoardSettings, browserLoaded, loadCustomRankings, loadCustomRankingsData, hasCustomRankingsSaved, setLatestRankings, calculateRankingDiffs, settings, boardSettings, setCustomAndLatestRankingsDiffs])

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
    const success = onStartCustomRanking(boardSettings.ranker as ThirdPartyRanker)
    if (success) {
      setDraftView(DraftView.CUSTOM_RANKING)
    }
  }

  const handleFinishCustomRanking = () => {
    onFinishCustomRanking()
    setDraftView(DraftView.RANKING)
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen relative">
      <PageHead />
      <main className="flex flex-col items-center justify-center w-full flex-1 md:px-20 text-center bg-gray-50">
        {/* Desktop Header Section */}
        <div className="hidden md:block">
          <Header
            settings={settings}
            boardSettings={boardSettings}
            draftStarted={draftStarted}
            myPickNum={myPickNum}
            setNumTeams={setNumTeams}
            setIsPpr={setIsPpr}
            setMyPickNum={setMyPickNum}
            onSetRanker={onSetRanker}
            onSetAdpRanker={onSetAdpRanker}
          />
        </div>

        <div className="flex flex-col items-center md:mt-4 mt-1 w-full h-screen">
          <div className="hidden w-full justify-end px-5 md:flex">
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
          </div>
          {!noPlayers && (
            <PortableDataControls
              createPackage={createPortableData}
              importDisabledReason={draftStarted || draftHistory.some(Boolean)
                ? "Finish or start a new draft before importing data; live picks stay untouched."
                : null}
              onApply={applyPortableData}
              validationContext={portableValidationContext}
            />
          )}
          {!analysisOpen && (
            <div className="w-full px-2 md:px-5">
              <LiveAdvisorPanel
                draftStarted={draftStarted}
                onSelectPlayer={onSelectPlayer}
                onExportReplay={
                  canExportReplay ? () => exportReplay() : undefined
                }
                onExportRosterOnly={canExportReplay ? () => exportReplay(true) : undefined}
                replayCaptureStatus={replayCaptureStatus}
                replayExportPreflight={replayExportPreflight}
                recommendations={recommendations}
                playerStatus={playerStatus}
                draftPlan={realtimeAdvisor.plan}
                realtimeProposals={realtimeAdvisor.proposals}
                onAcceptProposal={realtimeAdvisor.acceptProposal}
                onRejectProposal={realtimeAdvisor.rejectProposal}
                realtimeStatus={realtimeConversation.status}
                realtimeMessages={realtimeConversation.messages}
                realtimeError={realtimeConversation.error}
                realtimeIsResponding={realtimeConversation.isResponding}
                realtimeReconnectAttempt={
                  realtimeConversation.reconnectAttempt
                }
                realtimeAutoAdviceEnabled={
                  realtimeConversation.autoAdviceEnabled
                }
                realtimeMode={realtimeConversation.mode}
                realtimeMicrophoneEnabled={
                  realtimeConversation.microphoneEnabled
                }
                realtimeIsUserSpeaking={
                  realtimeConversation.isUserSpeaking
                }
                onConnectRealtime={realtimeConversation.connect}
                onDisconnectRealtime={realtimeConversation.disconnect}
                onCancelRealtimeResponse={
                  realtimeConversation.cancelResponse
                }
                onSetRealtimeAutoAdviceEnabled={
                  realtimeConversation.setAutoAdviceEnabled
                }
                onSetRealtimeMode={realtimeConversation.setMode}
                onSetRealtimeMicrophoneEnabled={
                  realtimeConversation.setMicrophoneEnabled
                }
                onSendRealtimeText={realtimeConversation.sendText}
              />
            </div>
          )}
          {analysisOpen && (
            <div className="hidden w-screen px-4 pb-8 md:block">
              <AnalysisWorkspace
                activePlayer={viewPlayerId ? playerLib[viewPlayerId] : null}
                boardSettings={boardSettings}
                onClose={() => setAnalysisOpen(false)}
                players={Object.values(playerLib)}
                rankingSummaries={rankingSummaries}
                settings={settings}
                advisorViewSuggestion={confirmedRealtimeView || {
                  view: recommendations.preferredView,
                  explanation: recommendations.viewExplanation,
                  revision: currPick,
                }}
              />
            </div>
          )}
          {/* Desktop Layout */}
          {!analysisOpen && (
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
                saveCustomRankings={saveCustomRankings}
                loadCustomRankings={loadCustomRankings}
                hasCustomRankingsSaved={hasCustomRankingsSaved}
                clearSavedCustomRankings={clearSavedCustomRankings}
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

          {/* Mobile Layout */}
          <div className="md:hidden w-full h-full px-2">
            {mobileView === MobileView.OVERVIEW && (
              <div className="w-full h-full">
                <MobileTiersView
                  settings={settings}
                  boardSettings={boardSettings}
                  draftStarted={draftStarted}
                  myPickNum={myPickNum}
                  setNumTeams={setNumTeams}
                  setIsPpr={setIsPpr}
                  setMyPickNum={setMyPickNum}
                  onSetRanker={onSetRanker}
                  onSetAdpRanker={onSetAdpRanker}
                  rankingSummaries={rankingSummaries}
                  ranker={boardSettings.ranker}
                  currentOptimalRoster={currentOptimalRoster}
                  optimalRosters={optimalRosters}
                  selectedOptimalRosterIdx={selectedOptimalRosterIdx}
                  setSelectedOptimalRosterIdx={setSelectedOptimalRosterIdx}
                />
              </div>
            )}

            {mobileView === MobileView.RANKINGS && (
              <RankingsBoard
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
                saveCustomRankings={saveCustomRankings}
                loadCustomRankings={loadCustomRankings}
                hasCustomRankingsSaved={hasCustomRankingsSaved}
                clearSavedCustomRankings={clearSavedCustomRankings}
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
                playerTargets={playerTargets}
                customAndLatestRankingsDiffs={customAndLatestRankingsDiffs}
                onSyncPendingRankings={onSyncPendingRankings}
                onRevertPlayerToPreSync={onRevertPlayerToPreSync}
                addPlayerTarget={addPlayerTarget}
                removePlayerTarget={removePlayerTarget}
              />
            )}

            {mobileView === MobileView.ADP && (
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
            )}

            {mobileView === MobileView.ANALYSIS && (
              <div className="w-full pb-16">
              <AnalysisWorkspace
                  activePlayer={viewPlayerId ? playerLib[viewPlayerId] : null}
                  boardSettings={boardSettings}
                  players={Object.values(playerLib)}
                rankingSummaries={rankingSummaries}
                settings={settings}
                advisorViewSuggestion={{
                  view: recommendations.preferredView,
                  explanation: recommendations.viewExplanation,
                  revision: currPick,
                }}
              />
              </div>
            )}

          </div>
        </div>
      </main>

      { draftStarted &&
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

      {/* Mobile Footer Navigation */}
      <MobileFooter 
        currentView={mobileView}
        onViewChange={setMobileView}
      />
    </div>
  )
}

export default Home;
