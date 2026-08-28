import React from "react"
import {fireEvent, render, screen, waitFor, within} from "@testing-library/react"

import type {AdvisorComparisonItem} from "../behavior/advisorComparisonSet"
import type {DraftRecommendationSet} from "../behavior/draft-advisor/recommendations"
import type {DraftAdvisorContext, OpponentForecast} from "../behavior/draft-advisor/types"
import {useAdvisorComparisonController} from "../behavior/hooks/useAdvisorComparisonController"
import {buildActiveBoardTierInputs, buildPlanConstraintsEvidenceSummary} from "../behavior/insights/liveInsightInputs"
import {buildPlanConstraintsPresentationModel} from "../behavior/insights/planConstraints"
import DraftDeskInsightDeck from "../components/insight/DraftDeskInsightDeck"
import {FantasyPosition, NFLTeam, ThirdPartyADPRanker, ThirdPartyRanker} from "../types"
import type {BoardSettings, FantasySettings, Player} from "../types"
import type {Roster} from "../behavior/draft"

const settings: FantasySettings = {ppr: true, numTeams: 3, numStartingQbs: 1, numStartingRbs: 2, numStartingWrs: 2, numStartingTes: 1, numFlex: 1, numBenchPlayers: 6}
const boardSettings: BoardSettings = {ranker: ThirdPartyRanker.HARRIS, adpRanker: ThirdPartyADPRanker.ESPN}
const positions = [FantasyPosition.QUARTERBACK, FantasyPosition.RUNNING_BACK, FantasyPosition.WIDE_RECEIVER, FantasyPosition.TIGHT_END] as const

const player = (id: string, position: FantasyPosition, rank: number, tier = 1): Player => ({
  id, firstName: id, lastName: "Player", fullName: `${id} Player`, team: NFLTeam.BUF, position,
  ranks: {
    [ThirdPartyRanker.HARRIS]: {playerId: id, ranker: ThirdPartyRanker.HARRIS, position, pprPositionRank: rank, standardPositionRank: rank, pprPositionTier: {tierNumber: tier, upperLimitPlayerIdx: 0, lowerLimitPlayerIdx: 1, upperLimitValue: 10, lowerLimitValue: 5}, standardPositionTier: {tierNumber: tier, upperLimitPlayerIdx: 0, lowerLimitPlayerIdx: 1, upperLimitValue: 10, lowerLimitValue: 5}},
    [ThirdPartyRanker.ESPN]: {playerId: id, ranker: ThirdPartyRanker.ESPN, position, pprPositionRank: rank, standardPositionRank: rank, adp: rank * 10},
  },
})
const players = positions.flatMap(position => [player(`${position.toLowerCase()}-one`, position, 1, 1), player(`${position.toLowerCase()}-two`, position, 2, 2)])
const roster = (): Roster => ({picks: [], QB: [], RB: [], WR: [], TE: []})
const comparisonItems = (): AdvisorComparisonItem[] => players.slice(0, 3).map(player => ({player, reasonCode: "recommended_now", reasonLabel: "Recommended now"}))
const recommendations = (): DraftRecommendationSet => ({
  schemaVersion: 1, currentPick: 11, nextUserPick: 12, preferredView: "cross_position", viewExplanation: "Prepared test display evidence.",
  candidates: players.slice(0, 3).map((player, index) => ({player, positionRank: index + 1, score: 20 - index, evidence: {projectedFloor: 9, projectedMedian: 12, projectedCeiling: 15, replacementLevel: 5, pointsAboveReplacement: 7, marginalLineupPoints: 5, benchUtility: 1, tierLossIfDeferred: 10 - index, survivalProbability: .5, positionalRunProbability: .4, tierBoundaryProbability: .4, userTier: 1, projectionTier: 1, rosterRole: "open_starter", flags: []}})),
})
const advisorContext = (): DraftAdvisorContext => ({
  schemaVersion: 1, league: {numTeams: 3, ppr: true}, currentPick: 11,
  rosterFormat: {startingQbs: 1, startingRbs: 2, startingWrs: 2, startingTes: 1, flex: 1, bench: 6},
  upcomingSlots: [{overallPick: 11, rosterIndex: 1}, {overallPick: 12, rosterIndex: 0}, {overallPick: 13, rosterIndex: 2}, {overallPick: 14, rosterIndex: 1}, {overallPick: 15, rosterIndex: 2}, {overallPick: 16, rosterIndex: 0}],
  teams: [0, 1, 2].map(rosterIndex => ({rosterIndex, draftedPlayerIds: [], draftedPositionCounts: positions.map(position => ({position, count: 0})), needs: positions.map(position => ({position, openStarterSpots: rosterIndex === 1 ? 1 : 0}))})),
  availablePlayers: players.map(player => ({id: player.id, name: player.fullName, position: player.position, team: player.team, adp: 10, positionRank: 1, userTier: player.ranks[ThirdPartyRanker.HARRIS]?.pprPositionTier?.tierNumber || null})),
  recentPicks: [],
})
const forecast = (): OpponentForecast => ({
  schemaVersion: 1, model: "combined", targetRosterIndex: 0,
  picks: [{overallPick: 11, rosterIndex: 1, positionProbabilities: positions.map(position => ({position, probability: position === FantasyPosition.RUNNING_BACK ? 1 : 0})), playerProbabilities: []}],
  runProbabilities: positions.map(position => ({position, minimumPicks: 3, probability: .9})), tierBoundaryProbabilities: [],
})

const Harness: React.FC<{
  forecastEnabled?: boolean
  materialKey?: string
  visibleTierPositions?: readonly (typeof positions)[number][]
  onVisibleTierPositionsChange?: (selectedPositions: (typeof positions)[number][]) => void
  playerTargets?: Array<{playerId: string; targetAsEarlyAsRound: number}>
}> = ({
  forecastEnabled = false,
  materialKey = "initial",
  visibleTierPositions,
  onVisibleTierPositionsChange,
  playerTargets = [],
}) => {
  const comparisonController = useAdvisorComparisonController({automaticSet: comparisonItems(), materialEventKey: materialKey})
  return <DraftDeskInsightDeck advisorContext={advisorContext()} availablePlayers={players} boardSettings={boardSettings} comparisonController={comparisonController} draftPlan={null} materialEvent={{streamId: "deck-test", draftKey: materialKey}} myRosterIndex={0} onInspectPlayer={jest.fn()} onVisibleTierPositionsChange={onVisibleTierPositionsChange} opponentForecast={forecastEnabled ? forecast() : null} playerTargets={playerTargets} rankingSummaries={[]} recommendations={recommendations()} rosters={[roster(), roster(), roster()]} settings={settings} visibleTierPositions={visibleTierPositions} />
}

describe("DraftDeskInsightDeck", () => {
  it("defaults to an expanded tier market filtered to the visible RB + WR ranking lanes", () => {
    render(<Harness />)
    expect(document.querySelectorAll("[aria-live]")).toHaveLength(1)
    expect(screen.getByRole("region", {name: "Draft insight deck"})).toBeTruthy()
    expect(screen.getByRole("heading", {name: "Position tier density"})).toBeTruthy()
    expect(screen.getByTestId("tier-landscape-lane-RB")).toBeTruthy()
    expect(screen.getByTestId("tier-landscape-lane-WR")).toBeTruthy()
    expect(screen.queryByTestId("tier-landscape-lane-QB")).toBeNull()
    expect(screen.queryByTestId("tier-landscape-lane-TE")).toBeNull()
    expect(screen.getAllByRole("combobox")).toHaveLength(2)
    expect(screen.getAllByRole("option", {name: "Player Lab"})).toHaveLength(2)
    expect((screen.getByRole("combobox", {name: "Decision view view"}) as HTMLSelectElement).value)
      .toBe("current_tier_market")
    expect(screen.getByRole("button", {
      name: "Restore two insight views from Current tier market",
    })).toBeTruthy()
    const decisionMode = screen.getByRole("group", {name: "Decision view mode"})
    expect(within(decisionMode).getByRole("button", {name: "Auto"}).getAttribute("aria-pressed")).toBe("true")
  })

  it("lets the tier surface change the shared position group and marks targets", () => {
    const onVisibleTierPositionsChange = jest.fn()
    render(<Harness
      onVisibleTierPositionsChange={onVisibleTierPositionsChange}
      playerTargets={[{playerId: "rb-one", targetAsEarlyAsRound: 3}]}
    />)
    fireEvent.click(within(screen.getByRole("group", {name: "Position tier groups"}))
      .getByRole("button", {name: "QB + TE"}))
    expect(onVisibleTierPositionsChange).toHaveBeenCalledWith([
      FantasyPosition.QUARTERBACK,
      FantasyPosition.TIGHT_END,
    ])
    expect(screen.getAllByText(/TARGET/).some(element => (
      Boolean(element.closest("[data-target-player='true']"))
    ))).toBe(true)
    const targetedTierRows = Array.from(document.querySelectorAll("[data-target-player='true']"))
    expect(targetedTierRows.some(row => row.querySelector("[data-target-marker='true']")))
      .toBe(true)
  })

  it("updates tier density when the left ranking position pair changes", async () => {
    const view = render(<Harness visibleTierPositions={[
      FantasyPosition.RUNNING_BACK,
      FantasyPosition.WIDE_RECEIVER,
    ]} />)
    expect(screen.getByTestId("tier-landscape-lane-RB")).toBeTruthy()
    expect(screen.getByTestId("tier-landscape-lane-WR")).toBeTruthy()

    view.rerender(<Harness visibleTierPositions={[
      FantasyPosition.QUARTERBACK,
      FantasyPosition.TIGHT_END,
    ]} />)
    await waitFor(() => expect(screen.getByTestId("tier-landscape-lane-QB")).toBeTruthy())
    expect(screen.getByTestId("tier-landscape-lane-TE")).toBeTruthy()
    expect(screen.queryByTestId("tier-landscape-lane-RB")).toBeNull()
    expect(screen.queryByTestId("tier-landscape-lane-WR")).toBeNull()
  })

  it("uses a material boundary to select the two-round market without nested announcers", async () => {
    const view = render(<Harness />)
    view.rerender(<Harness forecastEnabled materialKey="pick-11" />)
    await waitFor(() => expect(screen.getByText("What can run before the next two turns?")).toBeTruthy())
    expect(document.querySelectorAll("[aria-live]")).toHaveLength(1)
    const announcement = screen.getByRole("status").textContent
    view.rerender(<Harness forecastEnabled materialKey="pick-11" />)
    expect(screen.getByRole("status").textContent).toBe(announcement)
  })

  it("derives ordered active-board authority and keeps plan counts descriptive", () => {
    const tiers = buildActiveBoardTierInputs({availablePlayers: players, boardSettings, settings})
    expect(tiers.filter(tier => tier.position === FantasyPosition.RUNNING_BACK)).toEqual([
      {authority: "active_board", position: FantasyPosition.RUNNING_BACK, tier: 1, playerIds: ["rb-one"]},
      {authority: "active_board", position: FantasyPosition.RUNNING_BACK, tier: 2, playerIds: ["rb-two"]},
    ])
    const summary = buildPlanConstraintsEvidenceSummary(buildPlanConstraintsPresentationModel({userRoster: roster(), rosters: [roster(), roster()], myRosterIndex: 0, settings, draftPlan: null}))
    expect(summary).toMatchObject({state: "ready"})
    expect(summary.summary).toContain("Open user starter/FLEX slots: 7")
    expect(summary.summary).toContain("Other-team unmet starter/FLEX slots:")
    expect(summary.summary).not.toContain("Confirmed plan entries:")
  })
})
