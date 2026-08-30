import React, {useCallback, useEffect, useMemo, useState} from "react"

import type {PlayerStatusCacheSnapshot} from "../../behavior/api/playerStatusCache"
import {
  buildCrossPositionPresentationModel,
} from "../../behavior/analysis/crossPosition"
import {
  buildRoundMarketPresentationModel,
} from "../../behavior/analysis/roundMarket"
import {
  buildTierLandscapePresentationModel,
  type TierLandscapePosition,
} from "../../behavior/analysis/tierLandscape"
import {
  buildIntraPositionPresentationModel,
  INTRA_POSITION_POSITIONS,
  type IntraPosition,
} from "../../behavior/analysis/intraPosition"
import type {DraftAdvisorContext, OpponentForecast} from "../../behavior/draft-advisor/types"
import type {DraftRecommendationSet} from "../../behavior/draft-advisor/recommendations"
import type {Roster} from "../../behavior/draft"
import type {AdvisorComparisonController} from "../../behavior/hooks/useAdvisorComparisonController"
import {scoringFormatFor} from "../../behavior/scoringFormat"
import {useInsightDeckController} from "../../behavior/hooks/useInsightDeckController"
import {useInsightReadEvidence} from "../../behavior/hooks/useInsightReadEvidence"
import {buildInsightCandidates} from "../../behavior/insights/insightCandidates"
import {
  buildPlanConstraintsPresentationModel,
} from "../../behavior/insights/planConstraints"
import {
  buildActiveBoardTierInputs,
  buildPlanConstraintsEvidenceSummary,
} from "../../behavior/insights/liveInsightInputs"
import {
  buildHistoricalInsightModel,
  buildPlayerStatusInsightModel,
  buildRankTierDisagreementModel,
  buildSourceReadinessInsightModel,
} from "../../behavior/insights/apiInsightModels"
import {
  INSIGHT_VIEW_REGISTRY,
  MaterialInsightEvent,
  selectInsightDeckView,
  restoreInsightDeckSlotAuto,
} from "../../behavior/insights/insightDeck"
import {
  useDraftyInsightWebMcp,
  type DraftySetInsightViewInput,
} from "../../behavior/hooks/useDraftyInsightWebMcp"
import type {WebMcpRegistrationState} from "../../behavior/hooks/useDraftyWebMcp"
import {
  DraftyInsightAgentState,
  toolFailure,
  toolSuccess,
} from "../../behavior/webmcp/draftyWebMcp"
import type {
  BoardSettings,
  FantasySettings,
  Player,
  PlayerTarget,
  RankingSummary,
} from "../../types"
import {FantasyPosition} from "../../types"
import TierLandscapeLiveSurface from "../analysis/TierLandscapeLiveSurface"
import type {DraftPlanDocument} from "../../behavior/realtime/contracts"
import InsightDeck from "./InsightDeck"
import PlanConstraintsSurface from "./PlanConstraintsSurface"
import RoundRunMatrix from "./RoundRunMatrix"
import PlayerLabInsightSurface from "./PlayerLabInsightSurface"
import PositionDecisionTable from "./PositionDecisionTable"
import {
  CompactIntraPositionSurface,
  CurrentBoardProjectionSurface,
  HistoricalProductionSurface,
  HistoricalRiskRewardSurface,
  PlayerStatusInsightSurface,
  RankTierDisagreementSurface,
  SourceReadinessSurface,
} from "./ApiInsightSurfaces"

export interface DraftDeskInsightDeckProps {
  availablePlayers: Player[]
  boardSettings: BoardSettings
  settings: FantasySettings
  rankingSummaries: RankingSummary[]
  recommendations: DraftRecommendationSet | null
  opponentForecast: OpponentForecast | null
  advisorContext: DraftAdvisorContext | null
  playerStatus?: PlayerStatusCacheSnapshot
  comparisonController: AdvisorComparisonController
  materialEvent: MaterialInsightEvent
  rosters: Roster[]
  myRosterIndex: number
  draftPlan: DraftPlanDocument | null
  onInspectPlayer: (player: Player) => void
  playerTargets?: readonly PlayerTarget[]
  visibleTierPositions?: readonly TierLandscapePosition[]
  onVisibleTierPositionsChange?: (positions: TierLandscapePosition[]) => void
  onAgentStateChange?: (state: DraftyInsightAgentState) => void
  onWebMcpRegistrationStateChange?: (state: WebMcpRegistrationState) => void
}

const DEFAULT_TIER_POSITIONS: readonly TierLandscapePosition[] = [
  FantasyPosition.RUNNING_BACK,
  FantasyPosition.WIDE_RECEIVER,
]
const INITIAL_INSIGHT_VIEWS = {primary_decision: "current_tier_market"} as const

const agentSlotId = (
  slot: "decision" | "supporting",
): "primary_decision" | "market_watch" => (
  slot === "decision" ? "primary_decision" : "market_watch"
)

const insightAgentState = (
  state: ReturnType<typeof useInsightDeckController>["state"],
  expandedSlot: "primary_decision" | "market_watch" | null,
): DraftyInsightAgentState => ({
  available: true,
  slots: ([
    ["decision", "primary_decision"],
    ["supporting", "market_watch"],
  ] as const).map(([agentSlot, deckSlot]) => {
    const selection = state.slots[deckSlot].selection
    return {
      slot: agentSlot,
      view: selection?.viewId || null,
      mode: selection?.pinned ? "pinned" : "auto",
      evidence: selection?.evidence.state || null,
    }
  }),
  expandedSlot: expandedSlot === "primary_decision"
    ? "decision"
    : expandedSlot === "market_watch" ? "supporting" : null,
})

/**
 * Bounded integration shell for Phase 14C.  It only adapts prepared live
 * inputs into display models; it never recalculates recommendations or the
 * opponent forecast, and never persists pins or plan state.
 */
const DraftDeskInsightDeck: React.FC<DraftDeskInsightDeckProps> = ({
  availablePlayers,
  boardSettings,
  settings,
  rankingSummaries,
  recommendations,
  opponentForecast,
  advisorContext,
  playerStatus = {},
  comparisonController,
  materialEvent,
  rosters,
  myRosterIndex,
  draftPlan,
  onInspectPlayer,
  playerTargets = [],
  visibleTierPositions = DEFAULT_TIER_POSITIONS,
  onVisibleTierPositionsChange,
  onAgentStateChange,
  onWebMcpRegistrationStateChange,
}) => {
  const comparisonPlayers = useMemo(
    () => comparisonController.items.map(item => item.player),
    [comparisonController.items],
  )
  const comparisonPlayerIds = useMemo(
    () => comparisonPlayers.map(player => player.id),
    [comparisonPlayers],
  )
  const targetPlayerIds = useMemo(
    () => playerTargets.map(target => target.playerId),
    [playerTargets],
  )
  const readEvidence = useInsightReadEvidence({
    playerIds: comparisonPlayerIds,
    scoringProfile: scoringFormatFor(settings),
  })
  const crossPosition = useMemo(() => recommendations
    ? buildCrossPositionPresentationModel({
        recommendations,
        boardSettings,
        settings,
        playerStatus,
        comparisonItems: comparisonController.items,
      })
    : null, [
      boardSettings,
      comparisonController.items,
      playerStatus,
      recommendations,
      settings,
    ])
  const tierLandscape = useMemo(() => {
    const model = buildTierLandscapePresentationModel({
      availablePlayers,
      recommendations,
      opponentForecast,
      boardSettings,
      settings,
      rankingSummaries,
    })
    const selected = new Set(visibleTierPositions)
    return {
      ...model,
      lanes: model.lanes.filter(lane => selected.has(lane.position)),
    }
  }, [
    availablePlayers,
    boardSettings,
    opponentForecast,
    rankingSummaries,
    recommendations,
    settings,
    visibleTierPositions,
  ])
  const activeBoardTiers = useMemo(() => buildActiveBoardTierInputs({
    availablePlayers,
    boardSettings,
    settings,
  }), [availablePlayers, boardSettings, settings])
  const roundMarket = useMemo(() => advisorContext
    ? buildRoundMarketPresentationModel({
        context: advisorContext,
        opponentForecast,
        targetRosterIndex: myRosterIndex,
        activeBoardTiers,
      })
    : null, [activeBoardTiers, advisorContext, myRosterIndex, opponentForecast])
  const planConstraints = useMemo(() => buildPlanConstraintsPresentationModel({
    userRoster: rosters[myRosterIndex],
    rosters,
    myRosterIndex,
    settings,
    draftPlan,
  }), [draftPlan, myRosterIndex, rosters, settings])
  const planEvidence = useMemo(
    () => buildPlanConstraintsEvidenceSummary(planConstraints),
    [planConstraints],
  )
  const intraPosition = useMemo<IntraPosition>(() => {
    const counts = new Map<IntraPosition, {count: number; firstIndex: number}>()
    comparisonPlayers.forEach((player, index) => {
      if (!INTRA_POSITION_POSITIONS.includes(player.position as IntraPosition)) return
      const position = player.position as IntraPosition
      const current = counts.get(position)
      counts.set(position, {
        count: (current?.count || 0) + 1,
        firstIndex: current?.firstIndex ?? index,
      })
    })
    return Array.from(counts.entries()).sort((left, right) => (
      right[1].count - left[1].count
      || left[1].firstIndex - right[1].firstIndex
    ))[0]?.[0] || "RB" as IntraPosition
  }, [comparisonPlayers])
  const intraPositionPool = useMemo(() => {
    const availableIds = new Set(availablePlayers.map(player => player.id))
    const selectedAtPosition = comparisonPlayers.filter(player => (
      player.position === intraPosition && availableIds.has(player.id)
    ))
    return selectedAtPosition.length >= 2
      ? selectedAtPosition
      : availablePlayers
  }, [availablePlayers, comparisonPlayers, intraPosition])
  const intraPositionModel = useMemo(() => buildIntraPositionPresentationModel({
    position: intraPosition,
    availablePlayers: intraPositionPool,
    boardSettings,
    settings,
    rankingSummaries,
    playerStatus,
  }), [
    boardSettings,
    intraPosition,
    intraPositionPool,
    playerStatus,
    rankingSummaries,
    settings,
  ])
  const historical = useMemo(
    () => buildHistoricalInsightModel(readEvidence.history),
    [readEvidence.history],
  )
  const statusInsight = useMemo(
    () => buildPlayerStatusInsightModel(comparisonPlayers, playerStatus),
    [comparisonPlayers, playerStatus],
  )
  const rankTierDisagreement = useMemo(
    () => buildRankTierDisagreementModel(comparisonPlayers, settings),
    [comparisonPlayers, settings],
  )
  const sourceReadiness = useMemo(
    () => buildSourceReadinessInsightModel(
      readEvidence.rankingSources,
      readEvidence.readiness,
    ),
    [readEvidence.rankingSources, readEvidence.readiness],
  )
  const candidates = useMemo(() => buildInsightCandidates({
      crossPosition,
      intraPosition: intraPositionModel,
      historical,
      tierLandscape,
      roundMarket,
      rankTierDisagreement,
      planConstraints: planEvidence,
      playerStatus: statusInsight,
      sourceReadiness,
      comparisonPlayerIds,
      currentBoardRecommendations: recommendations,
    }), [
    crossPosition,
    historical,
    intraPositionModel,
    planEvidence,
    rankTierDisagreement,
    roundMarket,
    sourceReadiness,
    statusInsight,
    tierLandscape,
    comparisonPlayerIds,
    recommendations,
  ])
  const controller = useInsightDeckController({
    materialEvent,
    candidates,
    initialViews: INITIAL_INSIGHT_VIEWS,
  })
  const [expandedSlot, setExpandedSlot] = useState<
    "primary_decision" | "market_watch" | null
  >(null)
  const agentState = useMemo(
    () => insightAgentState(controller.state, expandedSlot),
    [controller.state, expandedSlot],
  )
  useEffect(() => {
    onAgentStateChange?.(agentState)
  }, [agentState, onAgentStateChange])
  const setInsightView = useCallback((input: DraftySetInsightViewInput) => {
    const slot = agentSlotId(input.slot)
    const transition = input.view === "auto"
      ? restoreInsightDeckSlotAuto(controller.state, slot, candidates)
      : selectInsightDeckView(controller.state, slot, input.view, candidates)
    if (transition.blockedReason) {
      const code = transition.blockedReason.includes("registered")
        ? "not_found"
        : "not_allowed"
      return toolFailure(code, transition.blockedReason)
    }
    if (input.view === "auto") controller.restoreSlotAuto(slot)
    else controller.selectView(slot, input.view)

    let nextExpandedSlot = expandedSlot
    if (input.expanded === true) nextExpandedSlot = slot
    else if (input.expanded === false && expandedSlot === slot) nextExpandedSlot = null
    if (nextExpandedSlot !== expandedSlot) setExpandedSlot(nextExpandedSlot)
    const nextState = insightAgentState(transition.state, nextExpandedSlot)
    const registration = input.view === "auto"
      ? null
      : INSIGHT_VIEW_REGISTRY.find(view => view.id === input.view)
    return toolSuccess(
      nextState,
      input.view === "auto"
        ? `${input.slot} insight restored to Auto.`
        : `${registration?.label || input.view} selected and pinned in the ${input.slot} slot.`,
      transition.changed || nextExpandedSlot !== expandedSlot ? "accepted" : "unchanged",
    )
  }, [candidates, controller, expandedSlot])
  const webMcpRegistration = useDraftyInsightWebMcp({setInsightView})
  useEffect(() => {
    onWebMcpRegistrationStateChange?.(webMcpRegistration)
  }, [onWebMcpRegistrationStateChange, webMcpRegistration])

  return (
    <InsightDeck
      controller={controller}
      defaultExpandedViewId="current_tier_market"
      expandedSlot={expandedSlot}
      onExpandedSlotChange={setExpandedSlot}
      renderView={viewId => {
        switch (viewId) {
          case "candidate_comparison":
            return <PositionDecisionTable
              onInspectPlayer={onInspectPlayer}
              recommendations={recommendations}
            />
          case "player_lab":
            return <PlayerLabInsightSurface
              availablePlayers={availablePlayers}
              comparisonController={comparisonController}
              onInspectPlayer={onInspectPlayer}
              settings={settings}
            />
          case "current_board_projection":
            return <CurrentBoardProjectionSurface
              onInspectPlayer={onInspectPlayer}
              recommendations={recommendations}
            />
          case "intra_position_comparison":
            return <CompactIntraPositionSurface
              model={intraPositionModel}
              onInspectPlayer={onInspectPlayer}
            />
          case "historical_risk_reward":
            return <HistoricalRiskRewardSurface model={historical} />
          case "historical_production":
            return <HistoricalProductionSurface model={historical} />
          case "current_tier_market":
            return <TierLandscapeLiveSurface
              announceUpdates={false}
              model={tierLandscape}
              onInspectPlayer={onInspectPlayer}
              onVisiblePositionsChange={onVisibleTierPositionsChange}
              targetPlayerIds={targetPlayerIds}
              visiblePositions={visibleTierPositions}
            />
          case "two_round_run_matrix":
            return <RoundRunMatrix model={roundMarket} />
          case "plan_constraints":
            return <PlanConstraintsSurface model={planConstraints} />
          case "player_status":
            return <PlayerStatusInsightSurface model={statusInsight} />
          case "rank_tier_disagreement":
            return <RankTierDisagreementSurface model={rankTierDisagreement} />
          case "data_source_status":
            return <SourceReadinessSurface model={sourceReadiness} />
          default:
            return viewId satisfies never
        }
      }}
    />
  )
}

export default DraftDeskInsightDeck
