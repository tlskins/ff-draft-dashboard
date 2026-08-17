import React, { useEffect, useMemo, useState } from "react"
import type {GetStaticProps, GetStaticPropsResult} from "next"

import type { Roster } from "../behavior/draft"
import type {PlayerRanks} from "../behavior/draft"
import {HighlightOption} from "../behavior/hooks/usePredictions"
import DraftDeskAppBar from "../components/DraftDeskAppBar"
import DraftDeskProfilePane from "../components/DraftDeskProfilePane"
import DraftDock from "../components/DraftDock"
import RankingsBoard from "../components/RankingsBoard"
import styles from "../components/DraftDesk.module.css"
import PageHead from "../components/pageHead"
import DeskPaneHeader from "../components/draft-desk/DeskPaneHeader"
import DeskSegmentedControl from "../components/draft-desk/DeskSegmentedControl"
import DraftDeskAdvisorDisclosure from "../components/draft-desk/DraftDeskAdvisorDisclosure"
import CrossPositionLiveSurface from "../components/analysis/CrossPositionLiveSurface"
import AdvisorComparisonSurface from "../components/AdvisorComparisonSurface"
import {buildCrossPositionPresentationModel} from "../behavior/analysis/crossPosition"
import {buildTierLandscapePresentationModel} from "../behavior/analysis/tierLandscape"
import {createDraftRecommendations} from "../behavior/draft-advisor/recommendations"
import {
  buildAdvisorComparisonSet,
  createMaterialDraftEventKey,
} from "../behavior/advisorComparisonSet"
import {
  useAdvisorComparisonController,
} from "../behavior/hooks/useAdvisorComparisonController"
import type {OpponentForecast} from "../behavior/draft-advisor/types"
import {createDraftPlanProposal} from "../behavior/realtime/proposals"
import type {DraftPlanDocument} from "../behavior/realtime/contracts"
import {DraftView, SortOption} from "./index"
import {
  DataRanker,
  FantasyPosition,
  NFLTeam,
  ThirdPartyADPRanker,
  ThirdPartyRanker,
} from "../types"
import type {
  BoardSettings,
  FantasySettings,
  Player,
  PlayerRanking,
  RankingSummary,
  Rankings,
} from "../types"

const settings: FantasySettings = {
  ppr: true,
  numTeams: 12,
  numStartingQbs: 1,
  numStartingRbs: 2,
  numStartingWrs: 2,
  numStartingTes: 1,
  numFlex: 1,
  numBenchPlayers: 5,
}

const boardSettings: BoardSettings = {
  ranker: ThirdPartyRanker.HARRIS,
  adpRanker: ThirdPartyADPRanker.ESPN,
}

const ranking = (
  position: FantasyPosition,
  overallRank: number,
  positionRank: number,
  adp: number,
): PlayerRanking => ({
  playerId: "",
  ranker: ThirdPartyRanker.HARRIS,
  position,
  adp,
  standardOverallRank: overallRank,
  pprOverallRank: overallRank,
  standardPositionRank: positionRank,
  pprPositionRank: positionRank,
  standardPositionTier: {
    tierNumber: positionRank <= 4 ? 1 : positionRank <= 9 ? 2 : 3,
    upperLimitPlayerIdx: 0,
    upperLimitValue: 0,
    lowerLimitPlayerIdx: 5,
    lowerLimitValue: 0,
  },
  pprPositionTier: {
    tierNumber: positionRank <= 4 ? 1 : positionRank <= 9 ? 2 : 3,
    upperLimitPlayerIdx: 0,
    upperLimitValue: 0,
    lowerLimitPlayerIdx: 5,
    lowerLimitValue: 0,
  },
})

const player = (
  id: string,
  fullName: string,
  team: NFLTeam,
  position: FantasyPosition,
  overallRank: number,
  positionRank: number,
  adp: number,
): Player => {
  const [firstName, ...lastName] = fullName.split(" ")
  const harris = ranking(position, overallRank, positionRank, adp)
  const espn = {...harris, ranker: ThirdPartyRanker.ESPN}
  const fpros = {...harris, ranker: ThirdPartyRanker.FPROS}
  harris.playerId = id
  espn.playerId = id
  fpros.playerId = id
  const basePpg = Math.max(7.5, 22 - overallRank / 5)
  return {
    id,
    firstName,
    lastName: lastName.join(" "),
    fullName,
    team,
    position,
    ranks: {
      [ThirdPartyRanker.HARRIS]: harris,
      [ThirdPartyRanker.ESPN]: espn,
      [ThirdPartyRanker.FPROS]: fpros,
    },
    historicalStats: Object.fromEntries([2023, 2024, 2025].map((year, index) => [String(year), {
      rk: overallRank,
      player: fullName,
      name: fullName,
      tm: team,
      team,
      fantPos: position,
      position,
      playerId: id,
      g: 15 + (index % 2),
      gs: 13 + index,
      rushAtt: position === FantasyPosition.RUNNING_BACK ? 180 + index * 18 : position === FantasyPosition.QUARTERBACK ? 68 + index * 5 : 4,
      rushYds: position === FantasyPosition.RUNNING_BACK ? 910 + index * 90 : position === FantasyPosition.QUARTERBACK ? 420 + index * 30 : 18,
      rushTd: position === FantasyPosition.RUNNING_BACK ? 7 + index : position === FantasyPosition.QUARTERBACK ? 4 + index : 0,
      passAtt: position === FantasyPosition.QUARTERBACK ? 480 + index * 20 : undefined,
      passYds: position === FantasyPosition.QUARTERBACK ? 3700 + index * 180 : undefined,
      passTd: position === FantasyPosition.QUARTERBACK ? 27 + index * 2 : undefined,
      recTgt: position === FantasyPosition.WIDE_RECEIVER || position === FantasyPosition.TIGHT_END ? 112 + index * 9 : position === FantasyPosition.RUNNING_BACK ? 58 + index * 4 : undefined,
      rec: position === FantasyPosition.WIDE_RECEIVER || position === FantasyPosition.TIGHT_END ? 76 + index * 6 : position === FantasyPosition.RUNNING_BACK ? 43 + index * 3 : undefined,
      recYds: position === FantasyPosition.WIDE_RECEIVER || position === FantasyPosition.TIGHT_END ? 1010 + index * 85 : position === FantasyPosition.RUNNING_BACK ? 330 + index * 35 : undefined,
      recTd: position === FantasyPosition.WIDE_RECEIVER || position === FantasyPosition.TIGHT_END ? 7 + index : position === FantasyPosition.RUNNING_BACK ? 3 + index : undefined,
      pprPointsPerGame: Number((basePpg + index * .8).toFixed(1)),
      fantasyPointsPerGame: Number((basePpg - 2 + index * .7).toFixed(1)),
    }])),
    pros: id === "achane" ? "Explosive efficiency and receiving usage create a weekly ceiling." : undefined,
    cons: id === "achane" ? "Workload has varied more than the other top running backs." : undefined,
    outlook: id === "achane" ? {
      text: "Explosive runner and receiver with weekly RB1 upside. Touch volume remains the primary source of volatility.",
      source: "espn",
      season: 2026,
      observedAt: "2026-08-16T12:00:00Z",
    } : null,
  }
}

const players = [
  player("achane", "De'Von Achane", NFLTeam.MIA, FantasyPosition.RUNNING_BACK, 8, 4, 9.2),
  player("taylor", "Jonathan Taylor", NFLTeam.IND, FantasyPosition.RUNNING_BACK, 9, 5, 10.8),
  player("brown", "Chase Brown", NFLTeam.CIN, FantasyPosition.RUNNING_BACK, 13, 7, 15.4),
  player("jacobs", "Josh Jacobs", NFLTeam.GB, FantasyPosition.RUNNING_BACK, 15, 8, 18.1),
  player("irving", "Bucky Irving", NFLTeam.TB, FantasyPosition.RUNNING_BACK, 20, 11, 23.7),
  player("walker", "Kenneth Walker", NFLTeam.SEA, FantasyPosition.RUNNING_BACK, 23, 13, 27),
  player("london", "Drake London", NFLTeam.ATL, FantasyPosition.WIDE_RECEIVER, 11, 6, 12.6),
  player("nabers", "Malik Nabers", NFLTeam.NYG, FantasyPosition.WIDE_RECEIVER, 12, 7, 13.1),
  player("ajbrown", "A.J. Brown", NFLTeam.PHL, FantasyPosition.WIDE_RECEIVER, 14, 8, 15.8),
  player("collins", "Nico Collins", NFLTeam.HOU, FantasyPosition.WIDE_RECEIVER, 16, 9, 17.2),
  player("mcconkey", "Ladd McConkey", NFLTeam.LAC, FantasyPosition.WIDE_RECEIVER, 18, 10, 20.4),
  player("evans", "Mike Evans", NFLTeam.TB, FantasyPosition.WIDE_RECEIVER, 24, 14, 26.3),
  player("hurts", "Jalen Hurts", NFLTeam.PHL, FantasyPosition.QUARTERBACK, 31, 2, 39.1),
  player("daniels", "Jayden Daniels", NFLTeam.WAS, FantasyPosition.QUARTERBACK, 28, 1, 37.2),
  player("burrow", "Joe Burrow", NFLTeam.CIN, FantasyPosition.QUARTERBACK, 49, 3, 62.4),
  player("allen", "Josh Allen", NFLTeam.BUF, FantasyPosition.QUARTERBACK, 53, 4, 66.1),
  player("kittle", "George Kittle", NFLTeam.SF, FantasyPosition.TIGHT_END, 34, 3, 42.2),
  player("mcbride", "Trey McBride", NFLTeam.ARI, FantasyPosition.TIGHT_END, 29, 1, 44.8),
  player("bowers", "Brock Bowers", NFLTeam.LV, FantasyPosition.TIGHT_END, 33, 2, 47.1),
  player("laporta", "Sam LaPorta", NFLTeam.DET, FantasyPosition.TIGHT_END, 55, 4, 68.2),
  player("jones", "Aaron Jones", NFLTeam.MIN, FantasyPosition.RUNNING_BACK, 35, 15, 43.1),
  player("waddle", "Jaylen Waddle", NFLTeam.MIA, FantasyPosition.WIDE_RECEIVER, 36, 17, 44.2),
  player("cook", "James Cook", NFLTeam.BUF, FantasyPosition.RUNNING_BACK, 37, 16, 45.1),
  player("smith", "DeVonta Smith", NFLTeam.PHL, FantasyPosition.WIDE_RECEIVER, 38, 18, 46.0),
]

const playerLib = Object.fromEntries(players.map(item => [item.id, item]))
const recentIds = ["hurts", "kittle", "jones", "waddle", "cook", "smith"]
const availableIds = players.map(item => item.id).filter(id => !recentIds.includes(id))
const available = availableIds.map(id => playerLib[id])
const playerRanks: PlayerRanks = {
  QB: available.filter(item => item.position === FantasyPosition.QUARTERBACK),
  RB: available.filter(item => item.position === FantasyPosition.RUNNING_BACK),
  WR: available.filter(item => item.position === FantasyPosition.WIDE_RECEIVER),
  TE: available.filter(item => item.position === FantasyPosition.TIGHT_END),
  Purge: [],
  availPlayersByOverallRank: [...available].sort((left, right) => (left.ranks.Harris?.pprOverallRank || 999) - (right.ranks.Harris?.pprOverallRank || 999)),
  availPlayersByAdp: [...available].sort((left, right) => (left.ranks.ESPN?.adp || 999) - (right.ranks.ESPN?.adp || 999)),
}

const fixtureOpponentForecast: OpponentForecast = {
  schemaVersion: 1,
  model: "combined",
  targetRosterIndex: 5,
  picks: [
    {overallPick: 44, rosterIndex: 6, positionProbabilities: [], playerProbabilities: [
      {playerId: "achane", name: "De'Von Achane", position: FantasyPosition.RUNNING_BACK, conditionalProbability: .45, overallProbability: .45},
      {playerId: "london", name: "Drake London", position: FantasyPosition.WIDE_RECEIVER, conditionalProbability: .12, overallProbability: .12},
    ]},
    {overallPick: 45, rosterIndex: 7, positionProbabilities: [], playerProbabilities: [
      {playerId: "achane", name: "De'Von Achane", position: FantasyPosition.RUNNING_BACK, conditionalProbability: .4, overallProbability: .4},
      {playerId: "mcbride", name: "Trey McBride", position: FantasyPosition.TIGHT_END, conditionalProbability: .18, overallProbability: .18},
    ]},
  ],
  runProbabilities: [
    {position: FantasyPosition.QUARTERBACK, minimumPicks: 3, probability: .12},
    {position: FantasyPosition.RUNNING_BACK, minimumPicks: 3, probability: .61},
    {position: FantasyPosition.WIDE_RECEIVER, minimumPicks: 3, probability: .24},
    {position: FantasyPosition.TIGHT_END, minimumPicks: 3, probability: .43},
  ],
  tierBoundaryProbabilities: [
    {position: FantasyPosition.QUARTERBACK, userTier: 1, playerIds: ["daniels", "burrow", "allen"], probability: .2},
    {position: FantasyPosition.RUNNING_BACK, userTier: 1, playerIds: ["achane", "taylor", "brown", "jacobs"], probability: .72},
    {position: FantasyPosition.WIDE_RECEIVER, userTier: 2, playerIds: ["london", "nabers", "ajbrown", "collins"], probability: .28},
    {position: FantasyPosition.TIGHT_END, userTier: 1, playerIds: ["mcbride", "bowers", "laporta"], probability: .65},
  ],
}
const emptyRoster = (): Roster => ({picks: [], QB: [], RB: [], WR: [], TE: []})

const projectionTiers = [
  {tierNumber: 1, upperLimitPlayerIdx: 0, lowerLimitPlayerIdx: 4, upperLimitValue: 20.4, lowerLimitValue: 16.8},
  {tierNumber: 2, upperLimitPlayerIdx: 5, lowerLimitPlayerIdx: 9, upperLimitValue: 16.7, lowerLimitValue: 13.4},
  {tierNumber: 3, upperLimitPlayerIdx: 10, lowerLimitPlayerIdx: 20, upperLimitValue: 13.3, lowerLimitValue: 9.2},
]
const rankingSummaries: RankingSummary[] = [{
  ranker: DataRanker.LAST_SSN_PPG,
  ppr: true,
  replacementLevels: {QB: [12, 16], RB: [24, 10], WR: [24, 10], TE: [12, 9], DST: [12, 0], K: [12, 0], "": [0, 0]},
  stdDevs: {QB: 3.2, RB: 3.6, WR: 3.1, TE: 2.8, DST: 0, K: 0, "": 0},
  tiers: {QB: projectionTiers, RB: projectionTiers, WR: projectionTiers, TE: projectionTiers, DST: [], K: [], "": []},
}]
const rankings: Rankings = {
  players: available,
  rankingsSummaries: rankingSummaries,
  cachedAt: "2026-08-16T12:00:00Z",
  editedAt: "",
  settings,
}
const playerStatus = Object.fromEntries(["achane", "daniels", "mcbride", "london"].map(id => {
  const routineTransaction = {
    schema_version: 1 as const,
    id: `fixture-transaction-${id}`,
    player_id: id,
    type: "transaction" as const,
    status: "active",
    short_summary: "Active with no current injury designation in the fixture state.",
    source: "nflverse_weekly_rosters",
    source_url: null,
    source_published_at: "2026-08-16T11:00:00Z",
    fetched_at: "2026-08-16T12:00:00Z",
    confidence: .98,
    recommendation_impact: "none" as const,
    stale: false,
  }
  const materialInjury = {
    schema_version: 1 as const,
    id: `fixture-injury-${id}`,
    player_id: id,
    type: "injury" as const,
    status: "questionable",
    short_summary: "Questionable after a limited hamstring practice in the fixture state.",
    source: "nflverse_injuries",
    source_url: "https://example.test/phase14a/injury-source",
    source_published_at: "2026-08-16T09:00:00Z",
    fetched_at: "2026-08-16T10:00:00Z",
    confidence: .94,
    recommendation_impact: "material" as const,
    stale: false,
  }
  return [id, {
    playerId: id,
    state: "ready" as const,
    loadedAt: 1,
    response: {
      schema_version: 1 as const,
      player_id: id,
      last_updated_at: "2026-08-16T12:00:00Z",
      events: id === "achane" ? [routineTransaction, materialInjury] : [routineTransaction],
      summary: id === "achane" ? {
        text: "Fixture-only outlook derived from the structured injury event.",
        method: "deterministic" as const,
        model: null,
        generated_at: "2026-08-16T12:30:00Z",
        event_ids: [materialInjury.id],
      } : undefined,
    },
  }]
}))

const advisorHarnessPlan: DraftPlanDocument = {
  schema_version: 1,
  draft_session_id: "phase14a-advisor-harness",
  revision: 16,
  updated_at: "2026-08-17T00:00:00Z",
  entries: Array.from({length: 16}, (_, index) => ({
    id: `fixture-plan-${index + 1}`,
    proposal_id: `fixture-accepted-${index + 1}`,
    text: `Fixture plan checkpoint ${index + 1}: preserve deterministic roster construction evidence through the next user pick.`,
    source_event_count: 30 + index,
    created_at: `2026-08-17T00:${String(index).padStart(2, "0")}:00Z`,
  })),
}

const advisorHarnessProposals = Array.from({length: 10}, (_, index) => (
  createDraftPlanProposal({
    id: `fixture-pending-${index + 1}`,
    draftSessionId: "phase14a-advisor-harness",
    sourceEventCount: 46,
    createdAt: `2026-08-17T01:${String(index).padStart(2, "0")}:00Z`,
    text: `Review fixture proposal ${index + 1} before changing the live draft plan.`,
    explanation: "Deterministic long-content harness for validating contained drawer scrolling.",
  })
))

const Phase14AVisualFixture = () => {
  const [focusedId, setFocusedId] = useState("achane")
  const [dockHeight, setDockHeight] = useState(0)
  const [draftView, setDraftView] = useState<DraftView>(DraftView.RANKING)
  const [isEditingCustomRanking, setIsEditingCustomRanking] = useState(false)
  const [sortOption, setSortOption] = useState<SortOption>(SortOption.RANKS)
  const [highlightOption, setHighlightOption] = useState<HighlightOption>(HighlightOption.PREDICTED_TAKEN)
  const [playerTargets, setPlayerTargets] = useState([
    {playerId: "achane", targetAsEarlyAsRound: 4},
    {playerId: "taylor", targetAsEarlyAsRound: 4},
    {playerId: "mcbride", targetAsEarlyAsRound: 5},
  ])
  const [showAdvisorHarness, setShowAdvisorHarness] = useState(false)
  useEffect(() => {
    setShowAdvisorHarness(
      new URLSearchParams(window.location.search).get("advisor") === "long",
    )
  }, [])
  const rosters = useMemo(() => Array.from({length: 12}, (_, index) => {
    if (index === 5) {
      return {
        picks: ["hurts", "london"],
        QB: ["hurts"], RB: [], WR: ["london"], TE: [],
      }
    }
    return emptyRoster()
  }), [])
  const draftHistory = useMemo<(string | null)[]>(() => [
    ...Array.from({length: 36}, () => null),
    ...recentIds,
    null,
  ], [])
  const currRound = useMemo<(string | null)[]>(() => [
    ...recentIds,
    ...Array.from({length: 6}, () => null),
  ], [])
  const fixtureRecommendations = useMemo(() => createDraftRecommendations({
    settings,
    boardSettings,
    rankingSummaries,
    playerRanks,
    playerLib,
    roster: rosters[5],
    currentPick: 43,
    myPickNum: 6,
    predictedPicks: {achane: 2, taylor: 0, brown: 1, london: 5, mcbride: 7},
    opponentForecast: fixtureOpponentForecast,
  }), [rosters])
  const automaticComparisonSet = useMemo(() => buildAdvisorComparisonSet({
    recommendations: fixtureRecommendations,
    availablePlayers: available,
    playerTargets,
    settings,
    boardSettings,
  }), [fixtureRecommendations, playerTargets])
  const comparisonController = useAdvisorComparisonController({
    automaticSet: automaticComparisonSet,
    materialEventKey: createMaterialDraftEventKey(draftHistory),
  })
  const crossPositionModel = useMemo(() => buildCrossPositionPresentationModel({
    recommendations: fixtureRecommendations,
    boardSettings,
    settings,
    playerStatus,
    comparisonItems: comparisonController.items,
  }), [comparisonController.items, fixtureRecommendations])
  const tierLandscapeModel = useMemo(() => buildTierLandscapePresentationModel({
    availablePlayers: available,
    recommendations: fixtureRecommendations,
    opponentForecast: fixtureOpponentForecast,
    boardSettings,
    settings,
    rankingSummaries,
  }), [fixtureRecommendations])

  return (
    <div className={`relative flex min-h-screen flex-col ${styles.deskViewport}`}>
      <PageHead />
      <main className={`flex w-full flex-1 flex-col bg-gray-50 ${styles.deskMain}`}>
        <DraftDeskAppBar
          activeDraftListenerTitle="Home League"
          boardSettings={boardSettings}
          draftCaptureState="live"
          draftPersistence={{state: "local", pendingEventCount: 0, error: null, canRetry: false}}
          draftSourceHealth={null}
          draftSourceHealthFreshness="fresh"
          draftStarted
          myPickNum={6}
          onRetryDraftPersistence={() => undefined}
          onSetAdpRanker={() => undefined}
          onSetRanker={() => undefined}
          setIsPpr={() => undefined}
          setMyPickNum={() => undefined}
          setNumTeams={() => undefined}
          settings={settings}
        />
        <div className={`${styles.deskBody} flex min-h-0 flex-1 flex-col`}>
          <div
            className={`${styles.desk} ${styles.deskShell} flex w-full flex-1`}
            style={{"--draft-desk-dock-height": `${dockHeight}px`} as React.CSSProperties}
          >
            <div className={styles.centerPanes}>
              <section aria-label="Rankings pane" className={`${styles.pane} flex min-h-0 flex-col`}>
                <DeskPaneHeader
                  actions={<DeskSegmentedControl
                    ariaLabel="Rankings mode"
                    items={[{id: DraftView.RANKING, label: "Position"}, {id: DraftView.ADP_ROUND, label: "ADP round"}]}
                    onSelect={setDraftView}
                    selectedId={draftView === DraftView.ADP_ROUND ? DraftView.ADP_ROUND : DraftView.RANKING}
                  />}
                  kicker="Board"
                  title="Rankings"
                />
                <div className="min-h-0 flex-1">
                  <RankingsBoard
                    activeDraftListenerTitle="Home League"
                    addPlayerTarget={(focusedPlayer, targetAsEarlyAsRound) => setPlayerTargets(current => current.some(target => target.playerId === focusedPlayer.id)
                      ? current
                      : [...current, {playerId: focusedPlayer.id, targetAsEarlyAsRound}])}
                    boardSettings={boardSettings}
                    canEditCustomRankings
                    compact
                    currPick={43}
                    customAndLatestRankingsDiffs={{}}
                    draftCaptureState="live"
                    draftHistory={draftHistory}
                    draftPersistence={{state: "local", pendingEventCount: 0, error: null, canRetry: false}}
                    draftSourceHealth={null}
                    draftSourceHealthFreshness="fresh"
                    draftStarted
                    draftView={draftView}
                    fantasySettings={settings}
                    getDraftRoundForPickNum={() => currRound}
                    hasCustomRanking={false}
                    hideCompactModeControl
                    highlightOption={highlightOption}
                    isEditingCustomRanking={isEditingCustomRanking}
                    latestRankings={null}
                    loadCurrentRankings={() => undefined}
                    myPickNum={6}
                    myPicks={[6, 19, 30, 46, 57]}
                    noPlayers={false}
                    onCancelCustomRanking={() => {
                      setIsEditingCustomRanking(false)
                      setDraftView(DraftView.RANKING)
                    }}
                    onFinishCustomRanking={() => {
                      setIsEditingCustomRanking(false)
                      setDraftView(DraftView.RANKING)
                    }}
                    onPurgePlayer={() => undefined}
                    onReorderPlayer={() => undefined}
                    onRetryDraftPersistence={() => undefined}
                    onRevertPlayerToPreSync={() => undefined}
                    onSelectPlayer={selectedPlayer => setFocusedId(selectedPlayer.id)}
                    onStartCustomRanking={() => setIsEditingCustomRanking(true)}
                    onSyncPendingRankings={() => undefined}
                    onUpdateTierBoundary={() => undefined}
                    playerLib={playerLib}
                    playerRanks={playerRanks}
                    playerTargets={playerTargets}
                    predNextTiers={{RB: 3, WR: 3, QB: 2, TE: 2}}
                    predictedPicks={{achane: 2, taylor: 0, brown: 1, london: 5, mcbride: 7}}
                    rankingProfileControls={{
                      profiles: [], activeProfile: null, isLoading: false, isSaving: false,
                      error: null, apiConfigured: false, refresh: async () => undefined,
                      save: async () => { throw new Error("Fixture profile save is disabled") },
                      select: () => undefined, startNew: () => undefined,
                      clearLocal: () => undefined, undo: async () => undefined, redo: async () => undefined,
                    }}
                    rankingSummaries={rankingSummaries}
                    rankings={rankings}
                    removePlayerTarget={playerId => setPlayerTargets(current => current.filter(target => target.playerId !== playerId))}
                    removePlayerTargets={playerIds => setPlayerTargets(current => current.filter(target => !playerIds.includes(target.playerId)))}
                    replacePlayerTargets={setPlayerTargets}
                    rosters={rosters}
                    setDraftView={setDraftView}
                    setHighlightOption={setHighlightOption}
                    setSortOption={setSortOption}
                    setViewPlayerId={id => id && setFocusedId(id)}
                    sortOption={sortOption}
                    viewPlayerId={focusedId}
                    viewRosterIdx={5}
                  />
                </div>
              </section>
              <DraftDeskProfilePane
                boardSettings={boardSettings}
                fixtureDetails={{
                  byeWeek: focusedId === "achane" ? 12 : 8,
                }}
                player={playerLib[focusedId]}
                players={available}
                playerStatus={playerStatus}
                rankingSummaries={rankingSummaries}
                rankingsSeason={2026}
                settings={settings}
              />
              <section aria-label="Deterministic insight pane" className={`${styles.pane} text-left`}>
                <DeskPaneHeader
                  actions={showAdvisorHarness ? (
                    <DraftDeskAdvisorDisclosure
                      draftPlan={advisorHarnessPlan}
                      draftStarted
                      onAcceptProposal={() => undefined}
                      onExportReplay={() => undefined}
                      onExportRosterOnly={() => undefined}
                      onRejectProposal={() => undefined}
                      onSelectPlayer={() => undefined}
                      realtimeProposals={advisorHarnessProposals}
                      realtimeStatus="connected"
                      recommendations={fixtureRecommendations}
                    />
                  ) : undefined}
                  kicker="Decision view · auto"
                  title="Cross-position value"
                />
                <div className="min-h-0 p-2">
                  <AdvisorComparisonSurface
                    availablePlayers={available}
                    controller={comparisonController}
                  />
                  <CrossPositionLiveSurface
                    announceUpdates={false}
                    model={crossPositionModel}
                    onInspectPlayer={selectedPlayer => setFocusedId(selectedPlayer.id)}
                    tierModel={tierLandscapeModel}
                  />
                </div>
              </section>
            </div>
          </div>
        </div>
      </main>
      <DraftDock
        boardSettings={boardSettings}
        currPick={43}
        currRound={currRound}
        currRoundPick={7}
        draftHistory={draftHistory}
        connected
        connectionDetail="Pick feed current"
        connectionLabel="ESPN connected"
        isEvenRound
        myPickNum={6}
        myPicks={[6, 19, 30, 46, 57]}
        onHeightChange={setDockHeight}
        onRemovePick={() => undefined}
        playerLib={playerLib}
        rosters={rosters}
        roundIdx={3}
        setCurrPick={() => undefined}
        setViewPlayerId={id => id && setFocusedId(id)}
        settings={settings}
      />
    </div>
  )
}

export const phase14aVisualFixtureRouteResult = (
  environment = process.env.NODE_ENV,
): GetStaticPropsResult<Record<string, never>> => environment === "production"
  ? {notFound: true}
  : {props: {}}

export const getStaticProps: GetStaticProps = async () =>
  phase14aVisualFixtureRouteResult()

export default Phase14AVisualFixture
