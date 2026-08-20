import React, {useMemo, useState} from "react"
import type {GetStaticProps, GetStaticPropsResult} from "next"

import type {AdvisorComparisonItem} from "../behavior/advisorComparisonSet"
import type {Roster} from "../behavior/draft"
import type {PlayerStatusCacheSnapshot} from "../behavior/api/playerStatusCache"
import type {DraftRecommendationSet} from "../behavior/draft-advisor/recommendations"
import type {DraftAdvisorContext, OpponentForecast} from "../behavior/draft-advisor/types"
import {useAdvisorComparisonController} from "../behavior/hooks/useAdvisorComparisonController"
import {useInsightDeckController} from "../behavior/hooks/useInsightDeckController"
import type {InsightCandidate, InsightEvidenceState} from "../behavior/insights/insightDeck"
import DraftDeskInsightDeck from "../components/insight/DraftDeskInsightDeck"
import InsightDeck from "../components/insight/InsightDeck"
import {
  DataRanker,
  FantasyPosition,
  NFLTeam,
  ThirdPartyADPRanker,
  ThirdPartyRanker,
} from "../types"
import type {BoardSettings, FantasySettings, Player, RankingSummary} from "../types"

const positions = [
  FantasyPosition.QUARTERBACK,
  FantasyPosition.RUNNING_BACK,
  FantasyPosition.WIDE_RECEIVER,
  FantasyPosition.TIGHT_END,
] as const

const settings: FantasySettings = {
  ppr: true,
  numTeams: 12,
  numStartingQbs: 1,
  numStartingRbs: 2,
  numStartingWrs: 2,
  numStartingTes: 1,
  numFlex: 1,
  numBenchPlayers: 6,
}

const boardSettings: BoardSettings = {
  ranker: ThirdPartyRanker.HARRIS,
  adpRanker: ThirdPartyADPRanker.ESPN,
}

const player = (
  id: string,
  fullName: string,
  position: FantasyPosition,
  rank: number,
  tier: number,
): Player => ({
  id,
  firstName: fullName.split(" ")[0],
  lastName: fullName.split(" ").slice(1).join(" "),
  fullName,
  team: NFLTeam.BUF,
  position,
  ranks: {
    [ThirdPartyRanker.HARRIS]: {
      playerId: id,
      ranker: ThirdPartyRanker.HARRIS,
      position,
      pprPositionRank: rank,
      standardPositionRank: rank,
      pprPositionTier: {
        tierNumber: tier, upperLimitPlayerIdx: 0, lowerLimitPlayerIdx: 2,
        upperLimitValue: 20 - rank, lowerLimitValue: 12 - rank / 2,
      },
      standardPositionTier: {
        tierNumber: tier, upperLimitPlayerIdx: 0, lowerLimitPlayerIdx: 2,
        upperLimitValue: 20 - rank, lowerLimitValue: 12 - rank / 2,
      },
    },
    [ThirdPartyRanker.ESPN]: {
      playerId: id,
      ranker: ThirdPartyRanker.ESPN,
      position,
      pprPositionRank: rank,
      standardPositionRank: rank,
      adp: rank * 9,
    },
    [ThirdPartyRanker.FPROS]: {
      playerId: id,
      ranker: ThirdPartyRanker.FPROS,
      position,
      pprPositionRank: rank,
      standardPositionRank: rank,
      adp: rank * 9,
    },
  },
})

const availablePlayers: Player[] = [
  player("4426348", "Jayden Daniels", FantasyPosition.QUARTERBACK, 2, 1),
  player("4361741", "Brock Purdy", FantasyPosition.QUARTERBACK, 8, 2),
  player("4431611", "Caleb Williams", FantasyPosition.QUARTERBACK, 11, 3),
  player("4429160", "De'Von Achane", FantasyPosition.RUNNING_BACK, 4, 1),
  player("4242335", "Jonathan Taylor", FantasyPosition.RUNNING_BACK, 6, 1),
  player("4596448", "Bucky Irving", FantasyPosition.RUNNING_BACK, 14, 2),
  player("4374302", "Amon-Ra St. Brown", FantasyPosition.WIDE_RECEIVER, 3, 1),
  player("4258173", "Nico Collins", FantasyPosition.WIDE_RECEIVER, 9, 1),
  player("4612826", "Ladd McConkey", FantasyPosition.WIDE_RECEIVER, 16, 2),
  player("4361307", "Trey McBride", FantasyPosition.TIGHT_END, 1, 1),
  player("4430027", "Sam LaPorta", FantasyPosition.TIGHT_END, 5, 1),
  player("5083076", "Harold Fannin Junior the Third", FantasyPosition.TIGHT_END, 12, 2),
]

const fixturePlayerStatus = (includeMaterialEvent: boolean): PlayerStatusCacheSnapshot => Object.fromEntries(
  availablePlayers.slice(3, 6).map((item, index) => [item.id, {
    playerId: item.id,
    state: "ready" as const,
    resourceState: "ready" as const,
    loadedAt: 1,
    response: {
      schema_version: 1 as const,
      player_id: item.id,
      last_updated_at: "2026-08-20T12:00:00Z",
      events: includeMaterialEvent && index === 0 ? [{
        schema_version: 1 as const,
        id: "fixture-achane-injury",
        player_id: item.id,
        type: "injury" as const,
        status: "questionable",
        short_summary: "Limited hamstring practice is material to the current comparison.",
        source: "nflverse_injuries",
        source_url: null,
        source_published_at: "2026-08-20T10:00:00Z",
        fetched_at: "2026-08-20T12:00:00Z",
        confidence: .94,
        recommendation_impact: "material" as const,
        stale: false,
      }] : [],
    },
  }]),
)

const emptyRoster = (): Roster => ({picks: [], QB: [], RB: [], WR: [], TE: []})

const rosters = (): Roster[] => Array.from({length: 12}, (_, rosterIndex) => (
  rosterIndex === 5
    ? {picks: ["4426348", "4374302"], QB: ["4426348"], RB: [], WR: ["4374302"], TE: []}
    : emptyRoster()
))

const recommendations = (): DraftRecommendationSet => ({
  schemaVersion: 1,
  currentPick: 43,
  nextUserPick: 54,
  preferredView: "cross_position",
  viewExplanation: "Deterministic fixture evidence: compare current starter value against the tier cliff before pick 54.",
  candidates: [availablePlayers[3], availablePlayers[6], availablePlayers[9]].map((item, index) => ({
    player: item,
    positionRank: item.ranks[ThirdPartyRanker.HARRIS]?.pprPositionRank || index + 1,
    score: 100 - index,
    evidence: {
      projectedFloor: 12 - index,
      projectedMedian: 17 - index,
      projectedCeiling: 23 - index,
      replacementLevel: 8,
      pointsAboveReplacement: 9 - index,
      marginalLineupPoints: 6 - index,
      benchUtility: 1,
      tierLossIfDeferred: 9 - index,
      survivalProbability: .38 + index * .12,
      positionalRunProbability: .78 - index * .1,
      tierBoundaryProbability: .71 - index * .08,
      userTier: 1,
      projectionTier: 1,
      rosterRole: "open_starter",
      flags: ["fixture"],
    },
  })),
})

const context = (): DraftAdvisorContext => ({
  schemaVersion: 1,
  league: {numTeams: 12, ppr: true},
  rosterFormat: {
    startingQbs: 1, startingRbs: 2, startingWrs: 2, startingTes: 1, flex: 1, bench: 6,
  },
  currentPick: 43,
  upcomingSlots: [
    {overallPick: 43, rosterIndex: 6},
    {overallPick: 44, rosterIndex: 7},
    {overallPick: 45, rosterIndex: 8},
    {overallPick: 46, rosterIndex: 9},
    {overallPick: 47, rosterIndex: 10},
    {overallPick: 48, rosterIndex: 11},
    {overallPick: 49, rosterIndex: 0},
    {overallPick: 50, rosterIndex: 1},
    {overallPick: 51, rosterIndex: 2},
    {overallPick: 52, rosterIndex: 3},
    {overallPick: 53, rosterIndex: 4},
    {overallPick: 54, rosterIndex: 5},
    {overallPick: 55, rosterIndex: 6},
    {overallPick: 56, rosterIndex: 7},
    {overallPick: 57, rosterIndex: 8},
    {overallPick: 58, rosterIndex: 9},
    {overallPick: 59, rosterIndex: 10},
    {overallPick: 60, rosterIndex: 11},
    {overallPick: 61, rosterIndex: 0},
    {overallPick: 62, rosterIndex: 1},
    {overallPick: 63, rosterIndex: 2},
    {overallPick: 64, rosterIndex: 3},
    {overallPick: 65, rosterIndex: 4},
    {overallPick: 66, rosterIndex: 5},
  ],
  teams: Array.from({length: 12}, (_, rosterIndex) => ({
    rosterIndex,
    draftedPlayerIds: rosterIndex === 5 ? ["4426348", "4374302"] : [],
    draftedPositionCounts: positions.map(position => ({
      position,
      count: rosterIndex === 5 && (position === FantasyPosition.QUARTERBACK || position === FantasyPosition.WIDE_RECEIVER) ? 1 : 0,
    })),
    needs: positions.map(position => ({
      position,
      openStarterSpots: rosterIndex === 5
        ? (position === FantasyPosition.RUNNING_BACK ? 2 : position === FantasyPosition.TIGHT_END ? 1 : position === FantasyPosition.WIDE_RECEIVER ? 1 : 0)
        : (position === FantasyPosition.RUNNING_BACK || position === FantasyPosition.WIDE_RECEIVER ? 1 : 0),
    })),
  })),
  availablePlayers: availablePlayers.map(item => ({
    id: item.id,
    name: item.fullName,
    position: item.position,
    team: item.team,
    adp: item.ranks[ThirdPartyRanker.ESPN]?.adp || null,
    positionRank: item.ranks[ThirdPartyRanker.HARRIS]?.pprPositionRank || 99,
    userTier: item.ranks[ThirdPartyRanker.HARRIS]?.pprPositionTier?.tierNumber || null,
  })),
  recentPicks: [],
})

const forecast = (): OpponentForecast => ({
  schemaVersion: 1,
  model: "combined",
  targetRosterIndex: 5,
  picks: Array.from({length: 11}, (_, index) => ({
    overallPick: 43 + index,
    rosterIndex: (6 + index) % 12,
    positionProbabilities: positions.map(position => ({
      position,
      probability: position === FantasyPosition.RUNNING_BACK ? .62 : position === FantasyPosition.WIDE_RECEIVER ? .2 : .09,
    })),
    playerProbabilities: [],
  })),
  runProbabilities: positions.map(position => ({
    position,
    minimumPicks: 3,
    probability: position === FantasyPosition.RUNNING_BACK ? .86 : .32,
  })),
  tierBoundaryProbabilities: positions.map(position => ({
    position,
    userTier: 1,
    playerIds: availablePlayers.filter(player => player.position === position).slice(0, 2).map(player => player.id),
    probability: position === FantasyPosition.RUNNING_BACK ? .83 : .25,
  })),
})

const comparisonItems = (): AdvisorComparisonItem[] => availablePlayers.slice(3, 6).map((player, index) => ({
  player,
  reasonCode: index === 0 ? "recommended_now" : "top_position",
  reasonLabel: index === 0 ? "Recommended now" : "Position-best fixture comparison",
}))

const rankingSummaries: RankingSummary[] = []

type Scenario = "initial" | "matrix" | "unavailable" | "long"
type EvidencePreview = "ready" | "loading" | "stale" | "unavailable"

const SCENARIO_COPY: Record<Scenario, string> = {
  initial: "Initial Auto: candidate comparison, current-tier market, and plan constraints are populated.",
  matrix: "Material event: supplied frozen forecast promotes the two-round run matrix.",
  unavailable: "Unavailable: intentionally omit fixture inputs to validate visible fail-closed evidence.",
  long: "Long content: validates contained right-pane wrapping for names and explanations.",
}

/**
 * The production integration deliberately accepts only prepared read-only
 * models. This fixture-only controller seam lets visual acceptance exercise
 * non-ready evidence states without inventing a production data source.
 */
const FixtureEvidenceStateDeck: React.FC<{
  evidenceState: Exclude<EvidencePreview, "ready">
  materialKey: string
}> = ({evidenceState, materialKey}) => {
  const candidates = useMemo<InsightCandidate[]>(() => {
    const evidence = {
      state: evidenceState as InsightEvidenceState,
      fingerprint: `fixture-evidence:${evidenceState}:${materialKey}`,
      ...(evidenceState === "stale"
        ? {staleReason: "Fixture-only stale status: a refreshed source is pending."}
        : {}),
      ...(evidenceState === "unavailable"
        ? {unavailableReason: "Fixture-only unavailable status: no supplied source is present."}
        : {}),
    }
    return [
      {
        viewId: "candidate_comparison",
        slot: "primary_decision",
        score: 80,
        reasonCode: "fixture_evidence_state",
        explanation: "Fixture-only controller state for visual evidence validation.",
        evidence,
      },
      {
        viewId: "current_tier_market",
        slot: "market_watch",
        score: 60,
        reasonCode: "fixture_market",
        explanation: "Prepared fixture market evidence remains read-only.",
        evidence: {state: "ready", fingerprint: `fixture-market:${materialKey}`},
      },
      {
        viewId: "plan_constraints",
        slot: "plan_constraints",
        score: 20,
        reasonCode: "fixture_plan",
        explanation: "Prepared fixture plan constraints remain read-only.",
        evidence: {state: "ready", fingerprint: `fixture-plan:${materialKey}`},
      },
    ]
  }, [evidenceState, materialKey])
  const controller = useInsightDeckController({
    materialEvent: {
      streamId: "phase14c-visual-fixture-evidence-seam",
      draftKey: materialKey,
    },
    candidates,
  })

  return <InsightDeck
    controller={controller}
    renderView={viewId => <p>
      {viewId === "candidate_comparison"
        ? "Fixture comparison renderer"
        : viewId === "current_tier_market"
          ? "Fixture tier-market renderer"
          : "Fixture plan renderer"}
    </p>}
  />
}

const Phase14CVisualFixture = () => {
  const [scenario, setScenario] = useState<Scenario>("initial")
  const [preview, setPreview] = useState<EvidencePreview>("ready")
  const [playerLabOpen, setPlayerLabOpen] = useState(false)
  const materialKey = `fixture:${scenario}`
  const unavailable = scenario === "unavailable"
  const comparisonController = useAdvisorComparisonController({
    automaticSet: comparisonItems(),
    materialEventKey: materialKey,
  })
  const fixtureRosters = useMemo(rosters, [])
  const longPlan = useMemo(() => scenario === "long" ? {
    schema_version: 1 as const,
    draft_session_id: "phase14c-fixture",
    revision: 1,
    updated_at: "2026-08-20T12:00:00Z",
    entries: [{
      id: "fixture-long-plan",
      proposal_id: "fixture-long-proposal",
      source_event_count: 43,
      created_at: "2026-08-20T12:00:00Z",
      text: "Preserve the running-back contingency until the next turn; the intentionally long fixture explanation should wrap inside a five-hundred-pixel right pane without changing selected evidence or overflowing adjacent draft controls.",
    }],
  } : null, [scenario])

  return (
    <main data-testid="phase14c-visual-fixture" style={{fontFamily: "system-ui, sans-serif", margin: "0 auto", maxWidth: 1440, padding: 24}}>
      <header>
        <p>Development-only visual acceptance fixture</p>
        <h1>Phase 14C insight deck</h1>
        <p data-testid="phase14c-scenario-copy">{SCENARIO_COPY[scenario]}</p>
      </header>
      <section aria-label="Phase 14C fixture controls" style={{display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20}}>
        {(Object.keys(SCENARIO_COPY) as Scenario[]).map(item => (
          <button aria-pressed={scenario === item} data-testid={`phase14c-scenario-${item}`} key={item} onClick={() => setScenario(item)} type="button">
            {item === "matrix" ? "Material event: two-round matrix" : item === "initial" ? "Initial Auto" : item === "unavailable" ? "Unavailable evidence" : "Long names & explanations"}
          </button>
        ))}
        {(["loading", "stale", "unavailable"] as EvidencePreview[]).map(item => (
          <button aria-pressed={preview === item} data-testid={`phase14c-preview-${item}`} key={item} onClick={() => setPreview(item)} type="button">
            Preview {item}
          </button>
        ))}
        <button data-testid="phase14c-player-lab-toggle" onClick={() => setPlayerLabOpen(open => !open)} type="button">
          {playerLabOpen ? "Close Player Lab" : "Open Player Lab"}
        </button>
      </section>
      <p data-testid="phase14c-evidence-preview">
        Fixture evidence state: {preview}. Non-ready states use a fixture-only controller seam and do not mutate draft inputs.
      </p>
      {playerLabOpen && <aside aria-label="Player Lab fixture placeholder" data-testid="phase14c-player-lab-placeholder">
        Player Lab fixture placeholder — live page interaction is covered separately.
      </aside>}
      <section data-testid="phase14c-viewport-1440" style={{display: "grid", gridTemplateColumns: "minmax(0, 1fr) 500px", gap: 24, minHeight: 720}}>
        <section aria-label="Draft board fixture" style={{background: "#f4f6f8", padding: 20}}>
          <h2>Draft board context</h2>
          <p>12-team PPR · Pick 43 · Your next pick 54</p>
          <p>Available: {availablePlayers.map(player => player.fullName).join(" · ")}</p>
        </section>
        <aside
          aria-label="Insight deck right pane"
          data-testid="phase14c-right-pane-500"
          style={{height: 720, minHeight: 0, minWidth: 0, overflow: "hidden", width: 500}}
        >
          {preview === "ready" ? <DraftDeskInsightDeck
              advisorContext={unavailable ? null : context()}
              availablePlayers={unavailable ? [] : availablePlayers}
              boardSettings={boardSettings}
              comparisonController={comparisonController}
              draftPlan={longPlan}
              materialEvent={{streamId: "phase14c-visual-fixture", draftKey: materialKey}}
              myRosterIndex={5}
              onInspectPlayer={() => setPlayerLabOpen(true)}
              opponentForecast={scenario === "matrix" ? forecast() : null}
              playerStatus={fixturePlayerStatus(scenario === "long")}
              rankingSummaries={rankingSummaries}
              recommendations={unavailable ? null : recommendations()}
              rosters={fixtureRosters}
              settings={settings}
            /> : <FixtureEvidenceStateDeck evidenceState={preview} materialKey={`${materialKey}:${preview}`} />}
        </aside>
      </section>
    </main>
  )
}

export const phase14cVisualFixtureRouteResult = (
  environment = process.env.NODE_ENV,
): GetStaticPropsResult<Record<string, never>> => environment === "production"
  ? {notFound: true}
  : {props: {}}

export const getStaticProps: GetStaticProps = async () => (
  phase14cVisualFixtureRouteResult()
)

export default Phase14CVisualFixture
