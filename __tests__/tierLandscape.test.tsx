import React from "react"
import {
  fireEvent,
  render,
  waitFor,
} from "@testing-library/react"

import {
  buildTierLandscapePresentationModel,
  MAX_VISIBLE_PLAYERS_PER_TIER_BAND,
  MAX_VISIBLE_TIER_BANDS_PER_LANE,
  normalizeSuppliedProbability,
  survivalFromSuppliedForecast,
} from "../behavior/analysis/tierLandscape"
import {
  executeHistoricalAnalysis,
} from "../behavior/api/historicalAnalysis"
import type {
  AnalysisQueryResponse,
} from "../behavior/api/historicalAnalysis"
import type {
  DraftRecommendationSet,
} from "../behavior/draft-advisor/recommendations"
import type { OpponentForecast } from "../behavior/draft-advisor/types"
import AnalysisWorkspace from "../components/analysis/AnalysisWorkspace"
import TierLandscapeLiveSurface from "../components/analysis/TierLandscapeLiveSurface"
import {
  BoardSettings,
  DataRanker,
  FantasyPosition,
  FantasySettings,
  NFLTeam,
  Player,
  RankingSummary,
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

const boardSettings: BoardSettings = {
  ranker: ThirdPartyRanker.HARRIS,
  adpRanker: ThirdPartyADPRanker.ESPN,
}

const tier = (
  tierNumber: number,
  rank: number,
  upper = 20 - rank,
  lower = 10 - rank,
): Tier => ({
  tierNumber,
  upperLimitPlayerIdx: rank - 1,
  lowerLimitPlayerIdx: rank - 1,
  upperLimitValue: upper,
  lowerLimitValue: lower,
})

const playerRanking = (
  id: string,
  ranker: ThirdPartyRanker,
  position: FantasyPosition,
  positionRank: number,
  tierNumber?: number,
) => ({
  playerId: id,
  ranker,
  position,
  pprPositionRank: positionRank,
  standardPositionRank: positionRank,
  ...(tierNumber === undefined ? {} : {
    pprPositionTier: tier(tierNumber, positionRank),
    standardPositionTier: tier(tierNumber, positionRank),
  }),
})

const makePlayer = (
  id: string,
  position: FantasyPosition,
  positionRank: number,
  activeTier = Math.ceil(positionRank / 2),
  options: {
    customTier?: number
    customRank?: number
  } = {},
): Player => ({
  id,
  firstName: id,
  lastName: "Player",
  fullName: `${id} Player`,
  team: NFLTeam.BUF,
  position,
  ranks: {
    [ThirdPartyRanker.HARRIS]: playerRanking(
      id,
      ThirdPartyRanker.HARRIS,
      position,
      positionRank,
      activeTier,
    ),
    [ThirdPartyRanker.ESPN]: {
      ...playerRanking(
        id,
        ThirdPartyRanker.ESPN,
        position,
        positionRank,
      ),
      adp: positionRank * 10,
    },
    ...(options.customTier === undefined ? {} : {
      [ThirdPartyRanker.CUSTOM]: playerRanking(
        id,
        ThirdPartyRanker.CUSTOM,
        position,
        options.customRank ?? positionRank,
        options.customTier,
      ),
    }),
  },
})

type ProjectionOverrides = Partial<Record<
  FantasyPosition,
  Record<number, Tier>
>>

const projectionTiers = (
  position: FantasyPosition,
  overrides: ProjectionOverrides,
): Tier[] => Array.from({length: 12}, (_, index) => (
  overrides[position]?.[index + 1]
  || tier(Math.ceil((index + 1) / 2), index + 1)
))

const projectionSummary = (
  overrides: ProjectionOverrides = {},
): RankingSummary => ({
  ranker: DataRanker.LAST_SSN_PPG,
  ppr: true,
  replacementLevels: {
    QB: [12, 8],
    RB: [24, 8],
    WR: [24, 8],
    TE: [12, 6],
    DST: [1, 0],
    K: [1, 0],
    "": [1, 0],
  },
  stdDevs: {
    QB: 2,
    RB: 2,
    WR: 2,
    TE: 2,
    DST: 0,
    K: 0,
    "": 0,
  },
  tiers: {
    QB: projectionTiers(FantasyPosition.QUARTERBACK, overrides),
    RB: projectionTiers(FantasyPosition.RUNNING_BACK, overrides),
    WR: projectionTiers(FantasyPosition.WIDE_RECEIVER, overrides),
    TE: projectionTiers(FantasyPosition.TIGHT_END, overrides),
    DST: [],
    K: [],
    "": [],
  },
})

const recommendations = (
  overrides: Partial<DraftRecommendationSet> = {},
): DraftRecommendationSet => ({
  schemaVersion: 1,
  currentPick: 10,
  nextUserPick: 14,
  preferredView: "tier_landscape",
  viewExplanation: "Monitor available tier density.",
  candidates: [],
  ...overrides,
})

const forecast = (
  overrides: Partial<OpponentForecast> = {},
): OpponentForecast => ({
  schemaVersion: 1,
  model: "combined",
  targetRosterIndex: 0,
  picks: [
    {
      overallPick: 11,
      rosterIndex: 1,
      positionProbabilities: [{
        position: FantasyPosition.RUNNING_BACK,
        probability: 0.6,
      }],
      playerProbabilities: [{
        playerId: "rb-a",
        name: "rb-a Player",
        position: FantasyPosition.RUNNING_BACK,
        conditionalProbability: 1,
        overallProbability: 0.2,
      }],
    },
    {
      overallPick: 12,
      rosterIndex: 2,
      positionProbabilities: [{
        position: FantasyPosition.RUNNING_BACK,
        probability: 0.7,
      }],
      playerProbabilities: [{
        playerId: "rb-a",
        name: "rb-a Player",
        position: FantasyPosition.RUNNING_BACK,
        conditionalProbability: 1,
        overallProbability: 0.25,
      }],
    },
  ],
  runProbabilities: [{
    position: FantasyPosition.RUNNING_BACK,
    minimumPicks: 3,
    probability: 0.4,
  }],
  tierBoundaryProbabilities: [{
    position: FantasyPosition.RUNNING_BACK,
    userTier: 1,
    playerIds: ["rb-a", "rb-b"],
    probability: 0.55,
  }],
  ...overrides,
})

const landscapePlayers = (): Player[] => [
  makePlayer("qb-a", FantasyPosition.QUARTERBACK, 1),
  makePlayer("qb-b", FantasyPosition.QUARTERBACK, 2),
  makePlayer("rb-a", FantasyPosition.RUNNING_BACK, 1),
  makePlayer("rb-b", FantasyPosition.RUNNING_BACK, 2),
  makePlayer("wr-a", FantasyPosition.WIDE_RECEIVER, 1),
  makePlayer("wr-b", FantasyPosition.WIDE_RECEIVER, 2),
  makePlayer("te-a", FantasyPosition.TIGHT_END, 1),
  makePlayer("te-b", FantasyPosition.TIGHT_END, 2),
]

const modelFor = (
  availablePlayers = landscapePlayers(),
  options: {
    recommendations?: DraftRecommendationSet | null
    opponentForecast?: OpponentForecast | null
    rankingSummaries?: RankingSummary[]
  } = {},
) => buildTierLandscapePresentationModel({
  availablePlayers,
  boardSettings,
  settings,
  rankingSummaries: options.rankingSummaries || [projectionSummary()],
  recommendations: options.recommendations === undefined
    ? recommendations()
    : options.recommendations,
  opponentForecast: options.opponentForecast === undefined
    ? forecast()
    : options.opponentForecast,
})

const historicalResponse: AnalysisQueryResponse = {
  query: {
    player_ids: [],
    positions: ["RB"],
    seasons: {start: 2023, end: 2025},
    scoring_profile_id: "ppr" as const,
    metrics: ["games", "fantasy_points_mean"],
    group_by: "player" as const,
    filters: [],
    sort: {field: "fantasy_points_mean", direction: "desc"},
    limit: 100,
    visualization: {
      type: "bar" as const,
      x: "player_name",
      y: "fantasy_points_mean",
    },
  },
  scoring_profile: {id: "ppr" as const, weights: {}},
  sources: [],
  columns: {
    dimensions: ["player_id", "player_name", "position"],
    metrics: ["games", "fantasy_points_mean"],
  },
  visualization: {
    type: "bar" as const,
    x: "player_name",
    y: "fantasy_points_mean",
  },
  row_count: 1,
  truncated: false,
  rows: [{
    dimensions: {
      player_id: "rb-a",
      player_name: "rb-a Player",
      position: "RB",
    },
    metrics: {games: 17, fantasy_points_mean: 15},
  }],
}

describe("live positional tier landscape presentation model", () => {
  it("always returns QB, RB, WR, TE lanes and excludes players not supplied as available", () => {
    const available = landscapePlayers()
    const drafted = makePlayer("drafted-rb", FantasyPosition.RUNNING_BACK, 1)
    const model = modelFor(available)

    expect(model.lanes.map(lane => lane.position)).toEqual([
      "QB", "RB", "WR", "TE",
    ])
    expect(model.lanes.flatMap(lane => lane.visibleTierBands)
      .flatMap(band => band.players)
      .map(player => player.player.id)).not.toContain(drafted.id)
    expect(model.lanes.find(lane => lane.position === "RB")?.availablePlayerCount)
      .toBe(2)
  })

  it("orders players by active positional rank then ID regardless of supplied order", () => {
    const tiedA = makePlayer("rb-a", FantasyPosition.RUNNING_BACK, 1)
    const tiedB = makePlayer("rb-b", FantasyPosition.RUNNING_BACK, 1)
    const model = modelFor([tiedB, tiedA])
    const rb = model.lanes.find(lane => lane.position === "RB")!

    expect(rb.visibleTierBands[0].players.map(player => player.player.id))
      .toEqual(["rb-a", "rb-b"])
  })

  it("uses actual custom tiers first and labels active-tier fallback honestly", () => {
    const custom = makePlayer(
      "rb-custom",
      FantasyPosition.RUNNING_BACK,
      1,
      2,
      {customRank: 6, customTier: 4},
    )
    const activeOnly = makePlayer("rb-active", FantasyPosition.RUNNING_BACK, 2, 3)
    const model = modelFor([custom, activeOnly], {
      opponentForecast: forecast({
        tierBoundaryProbabilities: [{
          position: FantasyPosition.RUNNING_BACK,
          userTier: 2,
          playerIds: ["rb-custom"],
          probability: 0.45,
        }],
      }),
    })
    const rb = model.lanes.find(lane => lane.position === "RB")!

    expect(rb.primaryTierSourceLabel).toContain("Custom user tiers")
    expect(rb.visibleTierBands[0]).toMatchObject({
      label: "Custom user tier 4",
      sourceLabel: "Custom user tier",
    })
    expect(rb.visibleTierBands[1]).toMatchObject({
      label: "Harris draft board tier 3",
      sourceLabel: "Harris draft board tier",
    })
    expect(rb.visibleTierBands[0].players[0].positionRankSourceLabel)
      .toBe("Harris draft board")
    expect(rb.currentTopAvailableTier).toMatchObject({
      exhaustionProbability: null,
      activeTierBoundary: {
        tier: 2,
        probability: 0.45,
      },
    })
    expect(rb.currentTopAvailableTier?.exhaustionUnavailableReason)
      .toContain("active draft-board tier")
  })

  it("keeps projection tiers and projection ranges explicitly secondary", () => {
    const activeOnly = makePlayer("rb-active", FantasyPosition.RUNNING_BACK, 1, 2)
    const model = modelFor([activeOnly])
    const rb = model.lanes.find(lane => lane.position === "RB")!
    const player = rb.visibleTierBands[0].players[0]

    expect(player.primaryTierSourceLabel).toBe("Harris draft board tier")
    expect(player.projectionTier).toBe(1)
    const view = render(
      <TierLandscapeLiveSurface model={model} onInspectPlayer={jest.fn()} />,
    )
    expect(view.getByText("Projection tier · overlay only")).toBeTruthy()
    expect(view.queryByText("Custom user tier")).toBeNull()
  })

  it("groups density correctly and bounds rendered tier bands and players", () => {
    const qbs = [
      makePlayer("qb-1", FantasyPosition.QUARTERBACK, 1, 1),
      makePlayer("qb-2", FantasyPosition.QUARTERBACK, 2, 1),
      makePlayer("qb-3", FantasyPosition.QUARTERBACK, 3, 1),
      makePlayer("qb-4", FantasyPosition.QUARTERBACK, 4, 1),
      makePlayer("qb-5", FantasyPosition.QUARTERBACK, 5, 2),
      makePlayer("qb-6", FantasyPosition.QUARTERBACK, 6, 3),
      makePlayer("qb-7", FantasyPosition.QUARTERBACK, 7, 4),
      makePlayer("qb-8", FantasyPosition.QUARTERBACK, 8, 5),
    ]
    const model = modelFor(qbs)
    const qb = model.lanes.find(lane => lane.position === "QB")!

    expect(qb.currentTopAvailableTier?.availablePlayerCount).toBe(4)
    expect(qb.availablePlayerCount).toBe(8)
    expect(qb.totalTierBandCount).toBe(5)
    expect(qb.hiddenTierBandCount).toBe(2)
    expect(qb.visibleTierBands).toHaveLength(MAX_VISIBLE_TIER_BANDS_PER_LANE)
    expect(qb.visibleTierBands[0]).toMatchObject({
      availablePlayerCount: 4,
      hiddenPlayerCount: 1,
    })
    expect(qb.visibleTierBands[0].players).toHaveLength(
      MAX_VISIBLE_PLAYERS_PER_TIER_BAND,
    )
  })

  it("safely displays equal, zero, missing, reversed, and non-finite projection ranges", () => {
    const players = [
      makePlayer("qb-equal", FantasyPosition.QUARTERBACK, 1),
      makePlayer("qb-zero", FantasyPosition.QUARTERBACK, 2),
      makePlayer("qb-reversed", FantasyPosition.QUARTERBACK, 3),
      makePlayer("qb-nonfinite", FantasyPosition.QUARTERBACK, 4),
      makePlayer("qb-missing", FantasyPosition.QUARTERBACK, 5),
    ]
    const summaries = [projectionSummary({
      QB: {
        1: tier(1, 1, 12, 12),
        2: tier(1, 2, 0, 0),
        3: tier(2, 3, 10, 20),
        4: tier(2, 4, Number.NaN, Number.POSITIVE_INFINITY),
        5: {
          ...tier(3, 5),
          upperLimitPlayerIdx: 99,
          lowerLimitPlayerIdx: 99,
        },
      },
    })]
    const model = modelFor(players, {rankingSummaries: summaries})
    const qb = model.lanes.find(lane => lane.position === "QB")!
    const byId = Object.fromEntries(qb.visibleTierBands.flatMap(band =>
      band.players.map(player => [player.player.id, player])))

    expect(byId["qb-equal"].projection).toMatchObject({
      floor: 12,
      median: 12,
      ceiling: 12,
    })
    expect(byId["qb-zero"].projection).toMatchObject({
      floor: 0,
      median: 0,
      ceiling: 0,
    })
    expect(byId["qb-reversed"].projection).toMatchObject({
      floor: 10,
      ceiling: 20,
    })
    expect(byId["qb-nonfinite"].projection).toMatchObject({
      floor: null,
      median: null,
      ceiling: null,
    })
    expect(byId["qb-missing"].projection).toMatchObject({
      floor: null,
      median: null,
      ceiling: null,
    })
  })

  it("uses only supplied forecast evidence for context, survival, runs, and tier exhaustion", () => {
    const model = modelFor()
    const rb = model.lanes.find(lane => lane.position === "RB")!
    const player = rb.visibleTierBands[0].players.find(candidate =>
      candidate.player.id === "rb-a")!

    expect(model).toMatchObject({
      currentPick: 10,
      nextUserPick: 14,
      picksBeforeNextUserPick: 4,
      forecastHorizon: {
        pickCount: 2,
        firstOverallPick: 11,
        lastOverallPick: 12,
      },
    })
    expect(player.survivalProbability).toBeCloseTo(0.6)
    expect(rb.run).toEqual({probability: 0.4, minimumPicks: 3})
    expect(rb.currentTopAvailableTier?.exhaustionProbability).toBe(0.55)
    expect(survivalFromSuppliedForecast("not-in-forecast", forecast())).toBeNull()
  })

  it("fails safely for missing or malformed forecast evidence and never creates a later-pick expected tier", () => {
    const malformed = {
      schemaVersion: 1,
      model: "combined",
      targetRosterIndex: 0,
      picks: [{overallPick: "not-a-pick", playerProbabilities: "bad"}],
      runProbabilities: [{position: "RB", probability: Number.NaN, minimumPicks: -1}],
      tierBoundaryProbabilities: [{position: "RB", userTier: 1, probability: Infinity}],
    } as unknown as OpponentForecast
    const model = modelFor(landscapePlayers(), {
      opponentForecast: malformed,
    })
    const rb = model.lanes.find(lane => lane.position === "RB")!

    expect(model.forecastHorizon).toEqual({
      pickCount: 0,
      firstOverallPick: null,
      lastOverallPick: null,
    })
    expect(rb.run).toEqual({probability: null, minimumPicks: null})
    expect(rb.currentTopAvailableTier?.exhaustionProbability).toBeNull()
    expect(normalizeSuppliedProbability(1.4)).toBe(1)
    expect(normalizeSuppliedProbability(-0.2)).toBe(0)
    expect(normalizeSuppliedProbability(Number.POSITIVE_INFINITY)).toBeNull()
    expect((model as unknown as {futureExpectedTier?: unknown}).futureExpectedTier)
      .toBeUndefined()
    expect(() => render(
      <TierLandscapeLiveSurface model={model} onInspectPlayer={jest.fn()} />,
    )).not.toThrow()
  })
})

describe("live positional tier landscape surface", () => {
  beforeEach(() => {
    localStorage.clear()
    mockedExecute.mockReset()
    mockedExecute.mockResolvedValue(historicalResponse)
  })

  it("renders semantic lanes, supplied evidence, projection text, and a keyboard-focusable inspect action", () => {
    const model = modelFor()
    const onInspectPlayer = jest.fn()
    const view = render(
      <TierLandscapeLiveSurface
        model={model}
        onInspectPlayer={onInspectPlayer}
      />,
    )

    expect(view.getAllByTestId(/tier-landscape-lane-/).map(lane =>
      lane.getAttribute("data-testid"))).toEqual([
      "tier-landscape-lane-QB",
      "tier-landscape-lane-RB",
      "tier-landscape-lane-WR",
      "tier-landscape-lane-TE",
    ])
    expect(view.getByText("Current pick")).toBeTruthy()
    expect(view.getByText("Supplied opponent-pick horizon")).toBeTruthy()
    expect(view.getAllByText("Current-tier exhaustion · supplied forecast"))
      .toHaveLength(4)
    expect(view.getAllByText("Modeled positional run · supplied"))
      .toHaveLength(4)
    expect(view.getByText("40% · at least 3 positional picks")).toBeTruthy()
    expect(view.getAllByText("2 available players across 1 tier band."))
      .toHaveLength(4)
    expect(view.getByText(/Later-user-pick expected tiers are unavailable:/)).toBeTruthy()
    expect(view.getByRole("img", {
      name: /rb-a Player projection range overlay: floor/,
    })).toBeTruthy()

    const inspect = view.getByRole("button", {
      name: "Inspect rb-a Player comparison",
    })
    expect(inspect.tagName).toBe("BUTTON")
    inspect.focus()
    expect(document.activeElement).toBe(inspect)
    fireEvent.click(inspect)
    expect(onInspectPlayer).toHaveBeenCalledWith(
      expect.objectContaining({id: "rb-a"}),
    )
  })

  it("does not repeat announcements for equivalent rerenders and announces one material update", () => {
    const initial = modelFor()
    const view = render(
      <TierLandscapeLiveSurface model={initial} onInspectPlayer={jest.fn()} />,
    )

    view.rerender(
      <TierLandscapeLiveSurface
        model={modelFor([...landscapePlayers()].reverse())}
        onInspectPlayer={jest.fn()}
      />,
    )
    expect(view.queryByText(/Live tier landscape updated/)).toBeNull()

    view.rerender(
      <TierLandscapeLiveSurface
        model={modelFor(landscapePlayers().filter(player => player.id !== "rb-a"))}
        onInspectPlayer={jest.fn()}
      />,
    )
    expect(view.getByText(/Live tier landscape updated.*Update 1/)).toBeTruthy()

    view.rerender(
      <TierLandscapeLiveSurface
        model={modelFor(landscapePlayers().filter(player => player.id !== "rb-a"))}
        onInspectPlayer={jest.fn()}
      />,
    )
    expect(view.getByText(/Live tier landscape updated.*Update 1/)).toBeTruthy()
  })

  it("announces a displayed rank-source-only update once and remains silent for its equivalent rerender", async () => {
    const customAvailable = landscapePlayers().map(player => ({
      ...player,
      ranks: {
        ...player.ranks,
        [ThirdPartyRanker.CUSTOM]: playerRanking(
          player.id,
          ThirdPartyRanker.CUSTOM,
          player.position,
          1,
          1,
        ),
      },
    }))
    const initial = modelFor(customAvailable)
    const sourceChanged = {
      ...initial,
      lanes: initial.lanes.map(lane => ({
        ...lane,
        visibleTierBands: lane.visibleTierBands.map(band => ({
          ...band,
          players: band.players.map(player => ({
            ...player,
            positionRankSourceLabel: "ESPN draft board",
          })),
        })),
      })),
    }
    expect(initial.lanes.every(lane =>
      lane.primaryTierSourceLabel === "Custom user tiers")).toBe(true)
    expect(sourceChanged.lanes.flatMap(lane => lane.visibleTierBands)
      .flatMap(band => band.players)
      .every(player => player.primaryTierSourceLabel === "Custom user tier"))
      .toBe(true)
    const view = render(
      <TierLandscapeLiveSurface model={initial} onInspectPlayer={jest.fn()} />,
    )

    view.rerender(
      <TierLandscapeLiveSurface
        model={sourceChanged}
        onInspectPlayer={jest.fn()}
      />,
    )
    await waitFor(() => expect(view.getByText(
      /Live tier landscape updated.*Update 1/,
    )).toBeTruthy())

    view.rerender(
      <TierLandscapeLiveSurface
        model={sourceChanged}
        onInspectPlayer={jest.fn()}
      />,
    )
    expect(view.queryByText(/Update 2/)).toBeNull()
  })

  it("discloses total density and later tier bands omitted by the bounded display", () => {
    const qbs = Array.from({length: 5}, (_, index) => makePlayer(
      `qb-tier-${index + 1}`,
      FantasyPosition.QUARTERBACK,
      index + 1,
      index + 1,
    ))
    const model = modelFor(qbs)
    const view = render(
      <TierLandscapeLiveSurface model={model} onInspectPlayer={jest.fn()} />,
    )

    expect(view.getByTestId("tier-landscape-lane-QB").textContent).toContain(
      "5 available players across 5 tier bands. 2 later tier bands are omitted from this bounded landscape.",
    )
  })

  it("keeps empty availability and missing recommendation or forecast states useful", () => {
    const model = modelFor([], {
      recommendations: null,
      opponentForecast: null,
    })
    const view = render(
      <TierLandscapeLiveSurface model={model} onInspectPlayer={jest.fn()} />,
    )

    expect(view.getByText("Current pick")).toBeTruthy()
    expect(view.getAllByText(/No explicitly available .* players are supplied/))
      .toHaveLength(4)
    expect(view.getAllByText("Unavailable").length).toBeGreaterThan(0)
  })
})

describe("tier landscape workspace boundaries", () => {
  const allPlayers = [
    ...landscapePlayers(),
    makePlayer("drafted-rb", FantasyPosition.RUNNING_BACK, 3),
  ]
  const availablePlayers = allPlayers.filter(player => player.id !== "drafted-rb")
  const workspaceProps = {
    activePlayer: allPlayers[2],
    availablePlayers,
    boardSettings,
    players: allPlayers,
    rankingSummaries: [projectionSummary()],
    recommendations: recommendations(),
    opponentForecast: forecast(),
    settings,
  }

  beforeEach(() => {
    localStorage.clear()
    mockedExecute.mockReset()
    mockedExecute.mockResolvedValue(historicalResponse)
  })

  it("renders live availability without an API request and keeps historical tier drilldown manual", async () => {
    const view = render(<AnalysisWorkspace {...workspaceProps} />)

    expect(view.getByText("Positional tier landscape")).toBeTruthy()
    expect(view.getByText("rb-a Player")).toBeTruthy()
    expect(view.queryByText("drafted-rb Player")).toBeNull()
    expect(mockedExecute).not.toHaveBeenCalled()

    fireEvent.click(view.getByRole("button", {name: "Run analysis"}))
    await waitFor(() => expect(mockedExecute).toHaveBeenCalledTimes(1))
    expect(mockedExecute.mock.calls[0][0]).toEqual(expect.objectContaining({
      positions: ["RB"],
      group_by: "player",
    }))
  })

  it("removes a drafted player, closes its live drawer, and does not fabricate navigation events", async () => {
    const onAnalysisViewEventHandled = jest.fn()
    const view = render(
      <AnalysisWorkspace
        {...workspaceProps}
        onAnalysisViewEventHandled={onAnalysisViewEventHandled}
      />,
    )
    fireEvent.click(view.getByRole("button", {
      name: "Inspect rb-a Player comparison",
    }))
    expect(view.getByRole("dialog")).toBeTruthy()

    view.rerender(
      <AnalysisWorkspace
        {...workspaceProps}
        availablePlayers={availablePlayers.filter(player => player.id !== "rb-a")}
        opponentForecast={forecast({
          runProbabilities: [{
            position: FantasyPosition.RUNNING_BACK,
            minimumPicks: 4,
            probability: 0.6,
          }],
        })}
        onAnalysisViewEventHandled={onAnalysisViewEventHandled}
      />,
    )
    await waitFor(() => expect(view.queryByRole("dialog")).toBeNull())
    expect(view.queryByText("rb-a Player")).toBeNull()
    expect(onAnalysisViewEventHandled).not.toHaveBeenCalled()
    expect(view.getByRole("button", {
      name: "Positional tier landscape",
    }).getAttribute("aria-pressed")).toBe("true")
  })

  it("passes equivalent availability, recommendation, and forecast inputs to desktop and mobile workspace instances", () => {
    const view = render(
      <div>
        <AnalysisWorkspace {...workspaceProps} />
        <AnalysisWorkspace {...workspaceProps} />
      </div>,
    )

    expect(view.getAllByText("rb-a Player")).toHaveLength(2)
    expect(view.getAllByText("55%")).toHaveLength(2)
    expect(view.getAllByRole("list", {
      name: "RB Harris draft board tier 1 leading available players",
    })).toHaveLength(2)
  })

  it("preserves Phase 10A pinned navigation while live landscape inputs update", async () => {
    const view = render(<AnalysisWorkspace {...workspaceProps} />)
    fireEvent.click(view.getByRole("button", {name: "Pin current view"}))

    view.rerender(
      <AnalysisWorkspace
        {...workspaceProps}
        availablePlayers={availablePlayers.filter(player => player.id !== "rb-a")}
      />,
    )

    await waitFor(() => expect(view.getByRole("button", {
      name: "Return to automatic navigation",
    })).toBeTruthy())
    expect(view.getByRole("button", {
      name: "Positional tier landscape",
    }).getAttribute("aria-pressed")).toBe("true")
  })
})
