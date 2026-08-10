import React from "react"
import { fireEvent, render, waitFor } from "@testing-library/react"

import {
  buildCrossPositionPresentationModel,
  buildMetricComparisonScale,
  metricComparisonPercent,
} from "../behavior/analysis/crossPosition"
import type { AnalysisQueryResponse } from "../behavior/api/historicalAnalysis"
import { executeHistoricalAnalysis } from "../behavior/api/historicalAnalysis"
import type { PlayerStatusEvent } from "../behavior/api/playerStatus"
import type {
  DraftRecommendationCandidate,
  DraftRecommendationSet,
} from "../behavior/draft-advisor/recommendations"
import AnalysisWorkspace from "../components/analysis/AnalysisWorkspace"
import CrossPositionLiveSurface from "../components/analysis/CrossPositionLiveSurface"
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

jest.mock("../behavior/api/historicalAnalysis", () => ({
  ...jest.requireActual("../behavior/api/historicalAnalysis"),
  executeHistoricalAnalysis: jest.fn(),
}))

const mockedExecute = jest.mocked(executeHistoricalAnalysis)

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

describe("cross-position presentation model", () => {
  it("preserves exactly the supplied first-three candidate order without filling positions", () => {
    const supplied = [
      candidate(player("alpha", FantasyPosition.QUARTERBACK, 1), 12.345),
      candidate(player("beta", FantasyPosition.RUNNING_BACK, 1), 11),
      candidate(player("gamma", FantasyPosition.WIDE_RECEIVER, 1), 10),
      candidate(player("delta", FantasyPosition.TIGHT_END, 1), 9),
    ]
    const model = buildModel(supplied)

    expect(model.candidates.map(item => item.player.id)).toEqual([
      "alpha", "beta", "gamma",
    ])
    expect(model.candidates.map(item => item.preferenceLabel)).toEqual([
      "Preferred", "Fallback", "Fallback",
    ])
    expect(model.candidates.map(item => item.fallbackNumber)).toEqual([
      null, 1, 2,
    ])
    expect(model.candidates.map(item => item.advisorScore)).toEqual([
      12.345, 11, 10,
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

describe("live cross-position surface", () => {
  beforeEach(() => {
    localStorage.clear()
    mockedExecute.mockReset()
    mockedExecute.mockResolvedValue(historicalResponse)
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
    const liveRegion = () => view.container.querySelector(
      "[aria-live='polite']",
    )?.textContent

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
      name: "Cross-position comparison",
    }))

    expect(view.getByText("Cross-position comparison", {selector: "h2"})).toBeTruthy()
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
    fireEvent.click(view.getByRole("button", {name: "alpha Player"}))
    expect(view.getByRole("dialog")).toBeTruthy()

    view.rerender(
      <AnalysisWorkspace {...props} recommendations={recommendations([beta])} />,
    )
    expect(view.getByRole("dialog")).toBeTruthy()
    expect(mockedExecute).toHaveBeenCalledTimes(1)
  })
})
