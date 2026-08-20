import React, {useMemo} from "react"

import type {PlayerStatusCacheSnapshot} from "../../behavior/api/playerStatusCache"
import {
  buildCrossPositionPresentationModel,
} from "../../behavior/analysis/crossPosition"
import {
  buildRoundMarketPresentationModel,
} from "../../behavior/analysis/roundMarket"
import {
  buildTierLandscapePresentationModel,
} from "../../behavior/analysis/tierLandscape"
import type {DraftAdvisorContext, OpponentForecast} from "../../behavior/draft-advisor/types"
import type {DraftRecommendationSet} from "../../behavior/draft-advisor/recommendations"
import type {Roster} from "../../behavior/draft"
import type {AdvisorComparisonController} from "../../behavior/hooks/useAdvisorComparisonController"
import {useInsightDeckController} from "../../behavior/hooks/useInsightDeckController"
import {buildInsightCandidates} from "../../behavior/insights/insightCandidates"
import {
  buildPlanConstraintsPresentationModel,
} from "../../behavior/insights/planConstraints"
import {
  buildActiveBoardTierInputs,
  buildPlanConstraintsEvidenceSummary,
} from "../../behavior/insights/liveInsightInputs"
import type {MaterialInsightEvent} from "../../behavior/insights/insightDeck"
import type {
  BoardSettings,
  FantasySettings,
  Player,
  RankingSummary,
} from "../../types"
import AdvisorComparisonSurface from "../AdvisorComparisonSurface"
import CrossPositionLiveSurface from "../analysis/CrossPositionLiveSurface"
import TierLandscapeLiveSurface from "../analysis/TierLandscapeLiveSurface"
import type {DraftPlanDocument} from "../../behavior/realtime/contracts"
import InsightDeck from "./InsightDeck"
import PlanConstraintsSurface from "./PlanConstraintsSurface"
import RoundRunMatrix from "./RoundRunMatrix"

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
}

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
}) => {
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
  const tierLandscape = useMemo(() => buildTierLandscapePresentationModel({
    availablePlayers,
    recommendations,
    opponentForecast,
    boardSettings,
    settings,
    rankingSummaries,
  }), [
    availablePlayers,
    boardSettings,
    opponentForecast,
    rankingSummaries,
    recommendations,
    settings,
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
  const candidates = useMemo(() => buildInsightCandidates({
    crossPosition,
    tierLandscape,
    roundMarket,
    planConstraints: planEvidence,
  }), [crossPosition, planEvidence, roundMarket, tierLandscape])
  const controller = useInsightDeckController({materialEvent, candidates})

  return (
    <InsightDeck
      controller={controller}
      renderView={viewId => {
        switch (viewId) {
          case "candidate_comparison":
            return <>
              <AdvisorComparisonSurface
                announceUpdates={false}
                availablePlayers={availablePlayers}
                controller={comparisonController}
              />
              <CrossPositionLiveSurface
                announceUpdates={false}
                comparisonIdentityKey={comparisonController.items.map(item => (
                  `${item.player.id}:${item.reasonCode}`
                )).join("|")}
                model={crossPosition}
                onInspectPlayer={onInspectPlayer}
                tierModel={tierLandscape}
              />
            </>
          case "current_tier_market":
            return <TierLandscapeLiveSurface
              announceUpdates={false}
              model={tierLandscape}
              onInspectPlayer={onInspectPlayer}
            />
          case "two_round_run_matrix":
            return <RoundRunMatrix model={roundMarket} />
          case "plan_constraints":
            return <PlanConstraintsSurface model={planConstraints} />
          default:
            return null
        }
      }}
    />
  )
}

export default DraftDeskInsightDeck
