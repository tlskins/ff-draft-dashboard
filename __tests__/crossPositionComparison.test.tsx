import React from "react"
import { fireEvent, render, waitFor, within } from "@testing-library/react"

import {
  buildCrossPositionPresentationModel,
  buildCrossPositionDecisionPresentationModel,
  buildMetricComparisonScale,
  metricComparisonPercent,
} from "../behavior/analysis/crossPosition"
import type { AnalysisQueryResponse } from "../behavior/api/historicalAnalysis"
import { executeHistoricalAnalysis } from "../behavior/api/historicalAnalysis"
import {useDataReadiness} from "../behavior/api/dataReadiness"
import type { PlayerStatusEvent } from "../behavior/api/playerStatus"
import type {
  DraftRecommendationCandidate,
  DraftRecommendationSet,
} from "../behavior/draft-advisor/recommendations"
import AnalysisWorkspace from "../components/analysis/AnalysisWorkspace"
import CrossPositionLiveSurface, {
  expectedNextOption,
  waitCostEstimate,
} from "../components/analysis/CrossPositionLiveSurface"
import type {
  TierLandscapeLaneModel,
  TierLandscapePlayerModel,
  TierLandscapePresentationModel,
} from "../behavior/analysis/tierLandscape"
import {
  FantasyPosition,
  FantasySettings,
  NFLTeam,
  Player,
  PlayerRanking,
  ThirdPartyADPRanker,
  ThirdPartyRanker,
  Tier,
} from "../types"
import {completedDataReadinessState} from "../test-support/dataReadiness"

jest.mock("../behavior/api/historicalAnalysis", () => ({
  ...jest.requireActual("../behavior/api/historicalAnalysis"),
  executeHistoricalAnalysis: jest.fn(),
}))
jest.mock("../behavior/api/dataReadiness", () => ({
  ...jest.requireActual("../behavior/api/dataReadiness"),
  useDataReadiness: jest.fn(),
}))

const mockedExecute = jest.mocked(executeHistoricalAnalysis)
jest.mocked(useDataReadiness).mockReturnValue(completedDataReadinessState)

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

const boardSettings = {
  ranker: ThirdPartyRanker.HARRIS,
  adpRanker: ThirdPartyADPRanker.ESPN,
}

const tier = (tierNumber: number): Tier => ({
  tierNumber,
  upperLimitPlayerIdx: tierNumber - 1,
  lowerLimitPlayerIdx: tierNumber - 1,
  upperLimitValue: 20,
  lowerLimitValue: 10,
})

const ranking = (
  playerId: string,
  position: FantasyPosition,
  positionRank: number,
  tierNumber?: number,
): PlayerRanking => ({
  playerId,
  ranker: ThirdPartyRanker.HARRIS,
  position,
  pprPositionRank: positionRank,
  standardPositionRank: positionRank,
  ...(tierNumber === undefined ? {} : {
    pprPositionTier: tier(tierNumber),
    standardPositionTier: tier(tierNumber),
  }),
})

const player = (
  id: string,
  position: FantasyPosition,
  positionRank: number,
  custom?: {rank: number; tier: number},
): Player => ({
  id,
  firstName: id,
  lastName: "Player",
  fullName: `${id} Player`,
  team: NFLTeam.BUF,
  position,
  ranks: {
    [ThirdPartyRanker.HARRIS]: ranking(id, position, positionRank, 1),
    ...(custom ? {
      [ThirdPartyRanker.CUSTOM]: {
        ...ranking(id, position, custom.rank, custom.tier),
        ranker: ThirdPartyRanker.CUSTOM,
      },
    } : {}),
  },
})

const candidate = (
  selectedPlayer: Player,
  score: number,
  overrides: Partial<DraftRecommendationCandidate["evidence"]> = {},
): DraftRecommendationCandidate => ({
  player: selectedPlayer,
  positionRank: 1,
  score,
  evidence: {
    projectedFloor: 10,
    projectedMedian: 15,
    projectedCeiling: 20,
    replacementLevel: 8,
    pointsAboveReplacement: 7,
    marginalLineupPoints: 4,
    benchUtility: 0,
    tierLossIfDeferred: 2.5,
    survivalProbability: 0.4,
    positionalRunProbability: 0.2,
    tierBoundaryProbability: 0.3,
    userTier: 1,
    projectionTier: 2,
    rosterRole: "open_starter",
    flags: ["User-tier cliff"],
    ...overrides,
  },
})

const recommendations = (
  candidates: DraftRecommendationCandidate[],
): DraftRecommendationSet => ({
  schemaVersion: 1,
  currentPick: 6,
  nextUserPick: 8,
  preferredView: "cross_position",
  viewExplanation: "Compare current roster-adjusted candidates.",
  candidates,
})

const statusEvent = (
  overrides: Partial<PlayerStatusEvent> = {},
): PlayerStatusEvent => ({
  schema_version: 1,
  id: "current-status",
  player_id: "alpha",
  type: "injury",
  status: "review",
  short_summary: "Structured status evidence.",
  source: "nflverse_injuries",
  source_url: "https://example.test/status",
  source_published_at: "2026-08-08T10:00:00Z",
  fetched_at: "2026-08-09T10:00:00Z",
  confidence: 0.9,
  recommendation_impact: "review",
  stale: false,
  ...overrides,
})

const historicalResponse: AnalysisQueryResponse = {
  query: {
    player_ids: ["alpha"],
    positions: [],
    seasons: {start: 2023, end: 2025},
    scoring_profile_id: "ppr",
    metrics: ["games", "fantasy_points_mean"],
    group_by: "player",
    filters: [],
    sort: {field: "fantasy_points_p50", direction: "desc"},
    limit: 100,
    visualization: {
      type: "scatter",
      x: "fantasy_points_p10",
      y: "fantasy_points_p90",
      color: "position",
    },
  },
  scoring_profile: {id: "ppr", weights: {}},
  sources: [],
  columns: {
    dimensions: ["player_id", "player_name", "position"],
    metrics: ["games", "fantasy_points_mean"],
  },
  visualization: {
    type: "scatter",
    x: "fantasy_points_p10",
    y: "fantasy_points_p90",
    color: "position",
  },
  row_count: 1,
  truncated: false,
  rows: [{
    dimensions: {
      player_id: "alpha",
      player_name: "alpha Player",
      position: "QB",
    },
    metrics: {games: 17, fantasy_points_mean: 20},
  }],
}

const buildModel = (
  suppliedCandidates: DraftRecommendationCandidate[],
  playerStatus = {},
  currentBoardSettings = boardSettings,
) => buildCrossPositionPresentationModel({
  recommendations: recommendations(suppliedCandidates),
  boardSettings: currentBoardSettings,
  settings,
  playerStatus,
})

const tierPlayer = (
  selectedPlayer: Player,
  median = 15,
  survivalProbability: number | null = .5,
): TierLandscapePlayerModel => ({
  player: selectedPlayer,
  positionRank: 1,
  positionRankSourceLabel: "Harris rank",
  primaryTier: 1,
  primaryTierSourceLabel: "Harris tier",
  projectionTier: 1,
  projection: {
    floor: median - 2,
    median,
    ceiling: median + 2,
    rangeFloor: median - 2,
    rangeCeiling: median + 2,
    startPercent: 0,
    medianPercent: 50,
    endPercent: 100,
  },
  survivalProbability,
})

const tierLane = (
  position: FantasyPosition,
  lanePlayers: TierLandscapePlayerModel[],
  overrides: Partial<TierLandscapeLaneModel> = {},
): TierLandscapeLaneModel => ({
  position,
  players: lanePlayers,
  currentTopAvailableTier: {
    tier: 1,
    availablePlayerCount: lanePlayers.length,
    exhaustionProbability: .3,
  },
  run: {probability: .2, minimumPicks: 3},
  ...overrides,
} as TierLandscapeLaneModel)

describe("cross-position presentation model", () => {
  it("preserves the supplied four-position candidate order without filling positions", () => {
    const supplied = [
      candidate(player("alpha", FantasyPosition.QUARTERBACK, 1), 12.345),
      candidate(player("beta", FantasyPosition.RUNNING_BACK, 1), 11),
      candidate(player("gamma", FantasyPosition.WIDE_RECEIVER, 1), 10),
      candidate(player("delta", FantasyPosition.TIGHT_END, 1), 9),
    ]
    const model = buildModel(supplied)

    expect(model.candidates.map(item => item.player.id)).toEqual([
      "alpha", "beta", "gamma", "delta",
    ])
    expect(model.candidates.map(item => item.preferenceLabel)).toEqual([
      "Preferred", "Fallback", "Fallback", "Fallback",
    ])
    expect(model.candidates.map(item => item.fallbackNumber)).toEqual([
      null, 1, 2, 3,
    ])
    expect(model.candidates.map(item => item.advisorScore)).toEqual([
      12.345, 11, 10, 9,
    ])
  })

  it("uses shared safe projection scaling and only per-metric evidence scales", () => {
    const model = buildModel([
      candidate(player("equal", FantasyPosition.QUARTERBACK, 1), 3, {
        projectedFloor: 0,
        projectedMedian: 0,
        projectedCeiling: 0,
        marginalLineupPoints: 0,
        survivalProbability: 0,
      }),
      candidate(player("reversed", FantasyPosition.RUNNING_BACK, 1), 2, {
        projectedFloor: 20,
        projectedMedian: 15,
        projectedCeiling: 10,
        marginalLineupPoints: 4,
        survivalProbability: 1,
      }),
      candidate(player("missing", FantasyPosition.WIDE_RECEIVER, 1), 1, {
        projectedFloor: Number.NaN,
        projectedMedian: Number.POSITIVE_INFINITY,
        projectedCeiling: Number.NEGATIVE_INFINITY,
        tierLossIfDeferred: Number.NaN,
      }),
    ])

    expect(model.projectionScale).toEqual({
      minimum: 0,
      maximum: 20,
      hasFiniteValues: true,
    })
    expect(model.candidates[1].projection).toMatchObject({
      floor: 10,
      median: 15,
      ceiling: 20,
    })
    expect(model.candidates[2].projection).toMatchObject({
      floor: null,
      median: null,
      ceiling: null,
    })
    expect(model.metricScales.marginalLineupPoints).toEqual({
      minimum: 0,
      maximum: 4,
      hasFiniteValues: true,
    })
    expect(model.metricScales.tierLossIfDeferred.hasFiniteValues).toBe(true)
    expect(model.candidates[2].metricValues.tierLossIfDeferred).toBeNull()
    expect(metricComparisonPercent(0, model.metricScales.marginalLineupPoints)).toBe(0)
    expect(buildMetricComparisonScale([
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ])).toEqual({minimum: 0, maximum: 1, hasFiniteValues: false})
  })

  it("fails closed for invalid probability evidence while preserving valid zero and one", () => {
    const belowRange = candidate(player("below", FantasyPosition.QUARTERBACK, 1), 3, {
      survivalProbability: -0.1,
      tierBoundaryProbability: -0.2,
      positionalRunProbability: -0.5,
    })
    const aboveRange = candidate(player("above", FantasyPosition.RUNNING_BACK, 1), 2, {
      survivalProbability: 1.1,
      tierBoundaryProbability: 1.2,
      positionalRunProbability: 1.5,
    })
    const valid = candidate(player("valid", FantasyPosition.WIDE_RECEIVER, 1), 1, {
      survivalProbability: 0,
      tierBoundaryProbability: 1,
      positionalRunProbability: 0,
    })
    const model = buildModel([belowRange, aboveRange, valid])

    expect(model.candidates[0].metricValues).toMatchObject({
      survivalProbability: null,
      tierBoundaryProbability: null,
      positionalRunProbability: null,
    })
    expect(model.candidates[1].metricValues).toMatchObject({
      survivalProbability: null,
      tierBoundaryProbability: null,
      positionalRunProbability: null,
    })
    expect(model.candidates[2].metricValues).toMatchObject({
      survivalProbability: 0,
      tierBoundaryProbability: 1,
      positionalRunProbability: 0,
    })
    expect(model.metricScales.survivalProbability).toEqual({
      minimum: 0,
      maximum: 0,
      hasFiniteValues: true,
    })
    expect(model.metricScales.tierBoundaryProbability).toEqual({
      minimum: 1,
      maximum: 1,
      hasFiniteValues: true,
    })

    const view = render(
      <CrossPositionLiveSurface model={model} onInspectPlayer={jest.fn()} />,
    )
    expect(view.getAllByRole("img", {
      name: "Survival to next user pick: unavailable",
    })).toHaveLength(2)
    expect(view.getAllByRole("img", {
      name: "Current-tier boundary / exhaustion probability: unavailable",
    })).toHaveLength(2)
    expect(view.getAllByRole("img", {
      name: "Positional-run probability: unavailable",
    })).toHaveLength(2)
    expect(view.queryByTestId(
      "cross-position-metric-survivalProbability-below",
    )).toBeNull()
    expect(view.queryByTestId(
      "cross-position-metric-tierBoundaryProbability-below",
    )).toBeNull()
    expect(view.queryByTestId(
      "cross-position-metric-positionalRunProbability-below",
    )).toBeNull()
    expect(view.queryByTestId(
      "cross-position-metric-survivalProbability-above",
    )).toBeNull()
    expect(view.queryByTestId(
      "cross-position-metric-tierBoundaryProbability-above",
    )).toBeNull()
    expect(view.queryByTestId(
      "cross-position-metric-positionalRunProbability-above",
    )).toBeNull()
    expect(view.getByTestId(
      "cross-position-metric-survivalProbability-valid",
    )).toBeTruthy()
  })

  it("only exposes actual custom rank and tier data while keeping the active source honest", () => {
    const model = buildModel([
      candidate(player("custom", FantasyPosition.QUARTERBACK, 1, {
        rank: 4,
        tier: 3,
      }), 5),
      candidate(player("active", FantasyPosition.RUNNING_BACK, 2), 4, {
        userTier: 2,
      }),
    ])

    expect(model.candidates[0]).toMatchObject({
      customPositionRank: 4,
      customTier: 3,
      positionRankSourceLabel: "Harris draft board",
      activeTierSourceLabel: "Harris draft board",
    })
    expect(model.candidates[1]).toMatchObject({
      customPositionRank: null,
      customTier: null,
      activeTier: 2,
      projectionTier: 2,
    })
  })
})

describe("decision cockpit next-pick estimate", () => {
  it("produces an expected option when every supplied survival value is below fifty percent", () => {
    const lanePlayer = (
      id: string,
      median: number,
      survivalProbability: number,
    ): TierLandscapePlayerModel => ({
      player: player(id, FantasyPosition.RUNNING_BACK, 1),
      positionRank: 1,
      positionRankSourceLabel: "Harris rank",
      primaryTier: 1,
      primaryTierSourceLabel: "Harris tier",
      projectionTier: 1,
      projection: {
        floor: median - 4,
        median,
        ceiling: median + 4,
        rangeFloor: median - 4,
        rangeCeiling: median + 4,
        startPercent: 0,
        medianPercent: 50,
        endPercent: 100,
      },
      survivalProbability,
    })
    const lane = {
      position: FantasyPosition.RUNNING_BACK,
      players: [
        lanePlayer("drafted", 22, 0.2),
        lanePlayer("next-one", 20, 0.3),
        lanePlayer("next-two", 15, 0.4),
        lanePlayer("next-three", 10, 0.4),
      ],
    } as TierLandscapeLaneModel

    const estimate = expectedNextOption(lane, "drafted", [])

    expect(estimate.player?.player.id).toBe("next-one")
    expect(estimate.suppliedPlayerCount).toBe(3)
    expect(estimate.expectedMedian).toBeCloseTo(15.9, 1)
  })

  it("compares the current top with the next tier and keeps exhaustion risk separate", () => {
    const lanePlayer = (
      id: string,
      median: number,
      survivalProbability: number | null,
      primaryTier = 1,
    ): TierLandscapePlayerModel => ({
      player: player(id, FantasyPosition.RUNNING_BACK, 1),
      positionRank: 1,
      positionRankSourceLabel: "Harris rank",
      primaryTier,
      primaryTierSourceLabel: "Harris tier",
      projectionTier: 1,
      projection: {
        floor: median - 4,
        median,
        ceiling: median + 4,
        rangeFloor: median - 4,
        rangeCeiling: median + 4,
        startPercent: 0,
        medianPercent: 50,
        endPercent: 100,
      },
      survivalProbability,
    })
    const lane = {
      position: FantasyPosition.RUNNING_BACK,
      players: [
        lanePlayer("drafted", 22, 0.2),
        lanePlayer("leader", 20, 0.3),
        lanePlayer("same-tier", 20, null),
        lanePlayer("fallback", 15, null, 2),
      ],
      currentTopAvailableTier: {
        exhaustionProbability: 0.4,
      },
    } as TierLandscapeLaneModel

    expect(waitCostEstimate(lane, "drafted", [])).toMatchObject({
      cost: 5,
      expectedLoss: 2,
      tierGoneProbability: 0.4,
      current: {player: {id: "leader"}},
      fallback: {player: {id: "fallback"}},
    })
    expect(waitCostEstimate({
      ...lane,
      players: lane.players.slice(0, 3),
    }, "drafted", [])).toBeNull()
  })
})

describe("live cross-position surface", () => {
  beforeEach(() => {
    localStorage.clear()
    mockedExecute.mockReset()
    mockedExecute.mockResolvedValue(historicalResponse)
  })

  it("renders four accessible decision rows with honest PAR, risk, tier, and run semantics", () => {
    const supplied = [
      candidate(player("qb", FantasyPosition.QUARTERBACK, 1), 12, {
        pointsAboveReplacement: 2.1, survivalProbability: .18,
      }),
      candidate(player("rb", FantasyPosition.RUNNING_BACK, 1), 11, {
        pointsAboveReplacement: 6.4, survivalProbability: 1,
      }),
      candidate(player("wr", FantasyPosition.WIDE_RECEIVER, 1), 10, {
        pointsAboveReplacement: 4.8, survivalProbability: 0,
      }),
      candidate(player("te", FantasyPosition.TIGHT_END, 1), 9, {
        pointsAboveReplacement: 3.9, survivalProbability: -1,
      }),
    ]
    const model = buildModel(supplied)
    const tierModel = {
      lanes: supplied.map((item, index) => ({
        position: item.player.position,
        players: [{player: item.player}],
        currentTopAvailableTier: {
          tier: index === 2 ? 2 : 1,
          availablePlayerCount: index + 1,
          exhaustionProbability: [.2, .72, .28, .65][index],
        },
        run: {probability: [.12, .61, .24, .43][index], minimumPicks: 3},
      })),
    } as unknown as TierLandscapePresentationModel
    const presentation = buildCrossPositionDecisionPresentationModel(model, tierModel)
    expect(presentation.rows[0].riskBeforeNextPick).toBeCloseTo(.82)
    expect(presentation.rows.slice(1).map(row => row.riskBeforeNextPick)).toEqual([
      0, 1, null,
    ])
    expect(presentation.rows.map(row => row.tierAvailablePlayerCount)).toEqual([
      1, 2, 3, 4,
    ])

    const view = render(
      <CrossPositionLiveSurface
        model={model}
        onInspectPlayer={jest.fn()}
        tierModel={tierModel}
      />,
    )
    const table = view.getByRole("table", {name: "Cross-position decision matrix"})
    expect(within(table).getAllByRole("row")).toHaveLength(5)
    expect(within(table).getAllByRole("columnheader")).toHaveLength(5)
    expect(within(table).getAllByRole("rowheader")).toHaveLength(4)
    expect(within(table).getAllByRole("cell")).toHaveLength(16)
    expect(within(table).getByText("+6.4 PAR")).toBeTruthy()
    expect(within(table).getByText("82%")).toBeTruthy()
    expect(within(table).getByText("0%")).toBeTruthy()
    expect(within(table).getByText("100%")).toBeTruthy()
    expect(within(table).getAllByText(/3\+ picks/)).toHaveLength(4)
    expect(view.queryByTestId("cross-position-risk-TE")).toBeNull()
    expect(view.getByTestId("cross-position-value-RB").firstElementChild
      ?.getAttribute("style")).toContain("width: 100%")
    expect(view.getByTestId("cross-position-risk-WR").firstElementChild
      ?.getAttribute("style")).toContain("width: 100%")
  })

  it("keeps candidate identity, inspection, PAR, and risk aligned when the lane leader differs", () => {
    const laneLeader = player("lane-leader", FantasyPosition.RUNNING_BACK, 1)
    const recommendable = candidate(
      player("recommendable", FantasyPosition.RUNNING_BACK, 2),
      10,
      {pointsAboveReplacement: 6.2, survivalProbability: .25},
    )
    const model = buildModel([recommendable])
    const tierModel = {
      lanes: [tierLane(
        FantasyPosition.RUNNING_BACK,
        [tierPlayer(laneLeader), tierPlayer(recommendable.player)],
      )],
    } as TierLandscapePresentationModel
    const presentation = buildCrossPositionDecisionPresentationModel(model, tierModel)
    expect(presentation.rows[0]).toMatchObject({
      player: {id: "recommendable"},
      identitySource: "candidate",
      pointsAboveReplacement: 6.2,
      riskBeforeNextPick: .75,
    })

    const onInspect = jest.fn()
    const view = render(
      <CrossPositionLiveSurface model={model} onInspectPlayer={onInspect} tierModel={tierModel} />,
    )
    const rowHeader = view.getByRole("rowheader", {name: /recommendable Player/})
    expect(rowHeader.textContent).not.toContain("lane-leader Player")
    const row = rowHeader.parentElement as HTMLElement
    expect(within(row).getByText("+6.2 PAR")).toBeTruthy()
    expect(within(row).getByText("75%")).toBeTruthy()
    fireEvent.click(within(rowHeader).getByRole("button", {
      name: "Inspect recommendable Player, RB",
    }))
    expect(onInspect).toHaveBeenCalledWith(recommendable.player)

    const unavailable = render(
      <CrossPositionLiveSurface
        model={buildModel([])}
        onInspectPlayer={jest.fn()}
        tierModel={tierModel}
      />,
    )
    expect(unavailable.getByRole("rowheader", {name: /lane-leader Player/}).textContent)
      .toContain("Recommendation evidence unavailable")
  })

  it("renders truthful positive, trailing, tied, and unavailable PAR relationships", () => {
    const whyNow = (preferredPar: number, alternativePar: number) => {
      const preferred = candidate(
        player("preferred", FantasyPosition.TIGHT_END, 1),
        10,
        {pointsAboveReplacement: preferredPar},
      )
      const alternative = candidate(
        player("alternative", FantasyPosition.RUNNING_BACK, 1),
        9,
        {pointsAboveReplacement: alternativePar},
      )
      const model = buildModel([preferred, alternative])
      const tierModel = {
        lanes: [
          tierLane(FantasyPosition.TIGHT_END, [tierPlayer(preferred.player)]),
          tierLane(FantasyPosition.RUNNING_BACK, [tierPlayer(alternative.player)]),
        ],
      } as TierLandscapePresentationModel
      return buildCrossPositionDecisionPresentationModel(model, tierModel).whyNow
    }

    expect(whyNow(7, 5)).toContain("TE leads RB by 2.0 PAR.")
    expect(whyNow(4, 5)).toContain(
      "TE trails RB by 1.0 PAR, but remains the deterministic preference.",
    )
    expect(whyNow(5.04, 5)).toContain("TE and RB are tied on PAR.")
    expect(whyNow(Number.NaN, 5)).toContain("TE is the deterministic preference.")
  })

  it("restores all positional scenarios as compact secondary evidence and follows preference changes", async () => {
    const positions = [
      FantasyPosition.QUARTERBACK,
      FantasyPosition.RUNNING_BACK,
      FantasyPosition.WIDE_RECEIVER,
      FantasyPosition.TIGHT_END,
    ]
    const leaders = positions.map(position => player(`${position.toLowerCase()}-one`, position, 1))
    const fallbacks = positions.map(position => player(`${position.toLowerCase()}-two`, position, 2))
    const supplied = leaders.map((item, index) => candidate(item, 10 - index))
    const tierModel = {
      lanes: positions.map((position, index) => tierLane(position, [
        tierPlayer(leaders[index], 18 - index, .6),
        tierPlayer(fallbacks[index], 14 - index, .7),
      ])),
    } as TierLandscapePresentationModel
    const view = render(
      <CrossPositionLiveSurface
        model={buildModel(supplied)}
        onInspectPlayer={jest.fn()}
        tierModel={tierModel}
      />,
    )

    fireEvent.click(view.getByText("Detailed recommendation evidence"))
    fireEvent.click(view.getByText("Test positional scenarios"))
    const selector = view.getByRole("group", {name: "Draft choice scenario"})
    expect(within(selector).getAllByRole("button")).toHaveLength(4)
    const qb = within(selector).getByRole("button", {name: /Test QB scenario/})
    expect(qb.tagName).toBe("BUTTON")
    expect(qb.getAttribute("aria-pressed")).toBe("true")

    const rb = within(selector).getByRole("button", {name: /Test RB scenario/})
    rb.focus()
    expect(document.activeElement).toBe(rb)
    fireEvent.click(rb)
    expect(view.getByRole("heading", {name: "rb-one Player · RB"})).toBeTruthy()
    expect(view.getByText("rb-two Player")).toBeTruthy()

    view.rerender(
      <CrossPositionLiveSurface
        model={buildModel([supplied[2], supplied[0], supplied[1], supplied[3]])}
        onInspectPlayer={jest.fn()}
        tierModel={tierModel}
      />,
    )
    await waitFor(() => expect(within(selector).getByRole("button", {
      name: /Test WR scenario/,
    }).getAttribute("aria-pressed")).toBe("true"))
  })

  it("renders supplied evidence, valid zero bench utility, filtered status, and keyboard-accessible inspection", () => {
    const alpha = candidate(player("alpha", FantasyPosition.QUARTERBACK, 1), 12.345, {
      replacementLevel: 8.25,
      pointsAboveReplacement: 7.75,
      marginalLineupPoints: 4.5,
      benchUtility: 0,
      tierLossIfDeferred: 2.25,
      survivalProbability: 0.4,
      positionalRunProbability: 0.2,
      tierBoundaryProbability: 0.3,
      rosterRole: "bench",
      flags: ["User-tier cliff"],
    })
    const playerStatus = {
      alpha: {
        playerId: "alpha",
        state: "ready" as const,
        response: {
          player_id: "alpha",
          events: [
            statusEvent(),
            statusEvent({
              id: "stale",
              stale: true,
              short_summary: "Do not show this status.",
            }),
          ],
        },
        loadedAt: 1,
      },
    }
    const model = buildModel([alpha], playerStatus)
    expect(model.candidates[0].statusEvidence.map(event => event.id)).toEqual([
      "current-status",
    ])
    const onInspect = jest.fn()
    const view = render(
      <CrossPositionLiveSurface
        model={model}
        onInspectPlayer={onInspect}
      />,
    )

    expect(view.getByText("Deterministic advisor score · supplied")).toBeTruthy()
    expect(view.getByText("12.345")).toBeTruthy()
    expect(view.getByText("4.5")).toBeTruthy()
    expect(view.getByText("7.75")).toBeTruthy()
    expect(view.getByText("8.25")).toBeTruthy()
    expect(view.getByText("0")).toBeTruthy()
    expect(view.getByText("0.4 (40.0%)")).toBeTruthy()
    expect(view.queryByText("Open starter")).toBeNull()
    expect(view.getByText("Bench")).toBeTruthy()
    expect(view.getByText("User-tier cliff")).toBeTruthy()
    const statusEvidence = view.getByLabelText(
      "alpha Player actionable status evidence",
    )
    expect(statusEvidence.textContent).toContain("Structured status evidence.")
    expect(statusEvidence.textContent).not.toContain("Do not show this status.")
    expect(view.queryByText(/bye week|stack|handcuff/i)).toBeNull()
    expect(view.getByText("12 teams")).toBeTruthy()
    expect(view.getByText("PPR")).toBeTruthy()
    expect(view.getByTestId("cross-position-metric-benchUtility-alpha"))
      .toBeTruthy()

    const inspectButton = view.getByRole("button", {
      name: "Inspect alpha Player comparison",
    })
    expect(inspectButton.tagName).toBe("BUTTON")
    fireEvent.click(inspectButton)
    expect(onInspect).toHaveBeenCalledWith(alpha.player)
  })

  it("announces material order, source, evidence, and status changes once without equivalent rerender noise", async () => {
    const alpha = candidate(player("alpha", FantasyPosition.QUARTERBACK, 1), 3)
    const beta = candidate(player("beta", FantasyPosition.RUNNING_BACK, 1), 2)
    const view = render(
      <CrossPositionLiveSurface model={buildModel([alpha, beta])} onInspectPlayer={jest.fn()} />,
    )
    const liveRegion = () => view.getByTestId(
      "cross-position-live-update",
    ).textContent

    view.rerender(
      <CrossPositionLiveSurface model={buildModel([alpha, beta])} onInspectPlayer={jest.fn()} />,
    )
    expect(liveRegion()).toBe("")

    view.rerender(
      <CrossPositionLiveSurface model={buildModel([beta, alpha])} onInspectPlayer={jest.fn()} />,
    )
    await waitFor(() => expect(liveRegion()).toContain(
      "Live cross-position comparison updated. Preferred candidate: beta Player. Update 1.",
    ))

    const espnBoardSettings = {
      ...boardSettings,
      ranker: ThirdPartyRanker.ESPN,
    }
    view.rerender(
      <CrossPositionLiveSurface model={buildModel([beta, alpha], {}, espnBoardSettings)} onInspectPlayer={jest.fn()} />,
    )
    await waitFor(() => expect(liveRegion()).toContain("Update 2."))

    const evidenceChanged = candidate(beta.player, beta.score, {
      ...beta.evidence,
      tierLossIfDeferred: 3.5,
    })
    view.rerender(
      <CrossPositionLiveSurface model={buildModel([evidenceChanged, alpha], {}, espnBoardSettings)} onInspectPlayer={jest.fn()} />,
    )
    await waitFor(() => expect(liveRegion()).toContain("Update 3."))

    view.rerender(
      <CrossPositionLiveSurface model={buildModel([evidenceChanged, alpha], {
        beta: {
          playerId: "beta",
          state: "ready",
          response: {player_id: "beta", events: [statusEvent({
            id: "beta-status",
            player_id: "beta",
          })]},
          loadedAt: 2,
        },
      }, espnBoardSettings)} onInspectPlayer={jest.fn()} />,
    )
    await waitFor(() => expect(liveRegion()).toContain("Update 4."))

    view.rerender(
      <CrossPositionLiveSurface model={buildModel([evidenceChanged, alpha], {
        beta: {
          playerId: "beta",
          state: "ready",
          response: {player_id: "beta", events: [statusEvent({
            id: "beta-status",
            player_id: "beta",
          })]},
          loadedAt: 2,
        },
      }, espnBoardSettings)} onInspectPlayer={jest.fn()} />,
    )
    expect(liveRegion()).toContain("Update 4.")
  })

  it("announces rendered tier-only changes once and ignores equivalent or internal-only rerenders", async () => {
    const alpha = candidate(player("alpha", FantasyPosition.QUARTERBACK, 1), 3)
    const model = buildModel([alpha])
    const lanePlayer = tierPlayer(alpha.player)
    const tierModel = {
      lanes: [tierLane(FantasyPosition.QUARTERBACK, [lanePlayer])],
    } as TierLandscapePresentationModel
    const view = render(
      <CrossPositionLiveSurface model={model} onInspectPlayer={jest.fn()} tierModel={tierModel} />,
    )
    const liveRegion = () => view.getByTestId("cross-position-live-update").textContent
    expect(liveRegion()).toBe("")

    const renderedTierChange = {
      lanes: [{
        ...tierModel.lanes[0],
        currentTopAvailableTier: {
          ...tierModel.lanes[0].currentTopAvailableTier!,
          availablePlayerCount: 2,
        },
      }],
    } as TierLandscapePresentationModel
    view.rerender(
      <CrossPositionLiveSurface model={model} onInspectPlayer={jest.fn()} tierModel={renderedTierChange} />,
    )
    await waitFor(() => expect(liveRegion()).toContain("Update 1."))

    view.rerender(
      <CrossPositionLiveSurface
        model={model}
        onInspectPlayer={jest.fn()}
        tierModel={{lanes: renderedTierChange.lanes.map(lane => ({...lane}))} as TierLandscapePresentationModel}
      />,
    )
    expect(liveRegion()).toContain("Update 1.")

    const internalOnlyChange = {
      lanes: [{
        ...renderedTierChange.lanes[0],
        players: [{
          ...renderedTierChange.lanes[0].players[0],
          projection: {
            ...renderedTierChange.lanes[0].players[0].projection,
            median: 99,
          },
        }],
      }],
    } as TierLandscapePresentationModel
    view.rerender(
      <CrossPositionLiveSurface model={model} onInspectPlayer={jest.fn()} tierModel={internalOnlyChange} />,
    )
    expect(liveRegion()).toContain("Update 1.")
  })

  it("announces an explanation-only change once and ignores an equivalent rerender", async () => {
    const alpha = candidate(player("alpha", FantasyPosition.QUARTERBACK, 1), 3)
    const model = buildModel([alpha])
    const view = render(
      <CrossPositionLiveSurface model={model} onInspectPlayer={jest.fn()} />,
    )
    const liveRegion = () => view.getByTestId("cross-position-live-update").textContent
    expect(liveRegion()).toBe("")

    const explanationChanged = {
      ...model,
      explanation: "The current roster construction makes quarterback the deterministic preference.",
    }
    view.rerender(
      <CrossPositionLiveSurface model={explanationChanged} onInspectPlayer={jest.fn()} />,
    )
    await waitFor(() => expect(liveRegion()).toContain("Update 1."))

    view.rerender(
      <CrossPositionLiveSurface model={{...explanationChanged}} onInspectPlayer={jest.fn()} />,
    )
    expect(liveRegion()).toContain("Update 1.")
  })

  it("keeps unavailable and empty live states useful without inventing candidates", () => {
    const unavailable = render(
      <CrossPositionLiveSurface model={null} onInspectPlayer={jest.fn()} />,
    )
    expect(unavailable.getByText("Live cross-position comparison unavailable"))
      .toBeTruthy()

    const empty = render(
      <CrossPositionLiveSurface model={buildModel([])} onInspectPlayer={jest.fn()} />,
    )
    expect(empty.getByText("No legal recommendation candidates remain.")).toBeTruthy()
    expect(empty.queryByRole("list", {
      name: "Deterministic cross-position recommendation candidates",
    })).toBeNull()
  })

  it("keeps an equal projection median at the shared maximum inside its track", () => {
    const minimum = candidate(player("minimum", FantasyPosition.QUARTERBACK, 1), 3, {
      projectedFloor: 0,
      projectedMedian: 0,
      projectedCeiling: 0,
    })
    const maximum = candidate(player("maximum", FantasyPosition.RUNNING_BACK, 1), 2, {
      projectedFloor: 10,
      projectedMedian: 10,
      projectedCeiling: 10,
    })
    const view = render(
      <CrossPositionLiveSurface
        model={buildModel([minimum, maximum])}
        onInspectPlayer={jest.fn()}
      />,
    )

    const marker = view.getByTestId("cross-position-projection-median-maximum")
    expect(marker.getAttribute("style")).toContain("left: 100%")
    expect(marker.getAttribute("style")).toContain(
      "transform: translateX(-100%)",
    )
  })

  it("renders live candidates before a historical request and keeps historical drawer ownership separate", async () => {
    const alpha = candidate(player("alpha", FantasyPosition.QUARTERBACK, 1), 5)
    const beta = candidate(player("beta", FantasyPosition.RUNNING_BACK, 1), 4)
    const props = {
      activePlayer: alpha.player,
      boardSettings,
      players: [alpha.player, beta.player],
      rankingSummaries: [],
      recommendations: recommendations([alpha, beta]),
      settings,
    }
    const view = render(<AnalysisWorkspace {...props} />)
    fireEvent.click(view.getByRole("button", {
      name: "Decision cockpit",
    }))

    expect(view.getByText("Decision cockpit", {selector: "h2"})).toBeTruthy()
    expect(mockedExecute).not.toHaveBeenCalled()
    fireEvent.click(view.getByRole("button", {
      name: "Inspect alpha Player comparison",
    }))
    expect(view.getByRole("dialog")).toBeTruthy()

    view.rerender(
      <AnalysisWorkspace {...props} recommendations={recommendations([beta])} />,
    )
    await waitFor(() => expect(view.queryByRole("dialog")).toBeNull())
    expect(mockedExecute).not.toHaveBeenCalled()

    fireEvent.click(view.getByRole("button", {name: "Run analysis"}))
    await waitFor(() => expect(mockedExecute).toHaveBeenCalledTimes(1))
    await waitFor(() => fireEvent.click(view.getByRole("button", {name: "alpha Player"})))
    expect(view.getByRole("dialog")).toBeTruthy()

    view.rerender(
      <AnalysisWorkspace {...props} recommendations={recommendations([beta])} />,
    )
    expect(view.getByRole("dialog")).toBeTruthy()
    expect(mockedExecute).toHaveBeenCalledTimes(1)
  })
})
