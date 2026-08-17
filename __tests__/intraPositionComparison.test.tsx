import React from "react"
import {
  fireEvent,
  render,
  waitFor,
} from "@testing-library/react"

import type {
  AnalysisQueryResponse,
} from "../behavior/api/historicalAnalysis"
import {
  executeHistoricalAnalysis,
} from "../behavior/api/historicalAnalysis"
import {useDataReadiness} from "../behavior/api/dataReadiness"
import {
  buildIntraPositionPresentationModel,
  MAX_INTRA_POSITION_SHORTLIST_PLAYERS,
} from "../behavior/analysis/intraPosition"
import type {
  IntraPosition,
} from "../behavior/analysis/intraPosition"
import { buildAnalysisViewQuery } from "../behavior/analysis/presets"
import type { PlayerStatusEvent } from "../behavior/api/playerStatus"
import AnalysisWorkspace from "../test-support/TestAnalysisWorkspace"
import IntraPositionLiveSurface from "../components/analysis/IntraPositionLiveSurface"
import {
  BoardSettings,
  DataRanker,
  FantasyPosition,
  FantasySettings,
  NFLTeam,
  Player,
  PlayerRanking,
  RankingSummary,
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

const boardSettings: BoardSettings = {
  ranker: ThirdPartyRanker.HARRIS,
  adpRanker: ThirdPartyADPRanker.ESPN,
}

const tier = (
  tierNumber: number,
  rank: number,
  upper = 20,
  lower = 10,
): Tier => ({
  tierNumber,
  upperLimitPlayerIdx: rank - 1,
  lowerLimitPlayerIdx: rank - 1,
  upperLimitValue: upper,
  lowerLimitValue: lower,
})

const ranking = (
  id: string,
  ranker: ThirdPartyRanker,
  position: FantasyPosition,
  positionRank: number,
  tierNumber = 1,
): PlayerRanking => ({
  playerId: id,
  ranker,
  position,
  pprPositionRank: positionRank,
  standardPositionRank: positionRank,
  pprPositionTier: tier(tierNumber, positionRank),
  standardPositionTier: tier(tierNumber, positionRank),
})

const makePlayer = (
  id: string,
  options: {
    position?: FantasyPosition
    activeRank?: number
    activeTier?: number
    customRank?: number
    customTier?: number
    fullName?: string
    team?: NFLTeam
    adp?: number
  } = {},
): Player => {
  const position = options.position || FantasyPosition.RUNNING_BACK
  const activeRank = options.activeRank ?? 1
  const activeTier = options.activeTier ?? 1
  return {
    id,
    firstName: id,
    lastName: "Player",
    fullName: options.fullName || `${id} Player`,
    team: options.team || NFLTeam.BUF,
    position,
    ranks: {
      [ThirdPartyRanker.HARRIS]: ranking(
        id,
        ThirdPartyRanker.HARRIS,
        position,
        activeRank,
        activeTier,
      ),
      [ThirdPartyRanker.ESPN]: {
        ...ranking(
          id,
          ThirdPartyRanker.ESPN,
          position,
          activeRank,
          activeTier,
        ),
        adp: options.adp ?? activeRank * 10,
      },
      ...(options.customRank === undefined ? {} : {
        [ThirdPartyRanker.CUSTOM]: ranking(
          id,
          ThirdPartyRanker.CUSTOM,
          position,
          options.customRank,
          options.customTier ?? 1,
        ),
      }),
    },
  }
}

const projectionTiers = (
  overrides: Record<number, Tier> = {},
): Tier[] => Array.from({length: 24}, (_, index) => (
  overrides[index + 1] || tier(
    Math.ceil((index + 1) / 2),
    index + 1,
    20 - index,
    10 - index,
  )
))

const projectionSummary = (
  overrides: Partial<Record<FantasyPosition, Record<number, Tier>>> = {},
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
    QB: projectionTiers(overrides.QB),
    RB: projectionTiers(overrides.RB),
    WR: projectionTiers(overrides.WR),
    TE: projectionTiers(overrides.TE),
    DST: [],
    K: [],
    "": [],
  },
})

const statusEvent = (
  overrides: Partial<PlayerStatusEvent> = {},
): PlayerStatusEvent => ({
  schema_version: 1,
  id: "current-status",
  player_id: "rb-one",
  type: "injury",
  status: "review",
  short_summary: "Limited — structured report.",
  source: "nflverse_injuries",
  source_url: "https://example.test/status",
  source_published_at: "2026-08-08T10:00:00Z",
  fetched_at: "2026-08-09T10:00:00Z",
  confidence: 0.9,
  recommendation_impact: "review",
  stale: false,
  ...overrides,
})

const modelFor = (
  availablePlayers: Player[],
  options: {
    position?: "QB" | "RB" | "WR" | "TE"
    currentBoardSettings?: BoardSettings
    rankingSummaries?: RankingSummary[]
    playerStatus?: Record<string, {
      playerId: string
      state: "loading" | "ready" | "unavailable"
      response: {events: PlayerStatusEvent[]} | null
      loadedAt: number | null
    }>
  } = {},
) => buildIntraPositionPresentationModel({
  position: (options.position || "RB") as IntraPosition,
  availablePlayers,
  boardSettings: options.currentBoardSettings || boardSettings,
  settings,
  rankingSummaries: options.rankingSummaries || [projectionSummary()],
  playerStatus: options.playerStatus as Parameters<
    typeof buildIntraPositionPresentationModel
  >[0]["playerStatus"],
})

const historicalResponse: AnalysisQueryResponse = {
  query: {
    player_ids: ["historical-only", "rb-one"],
    positions: [],
    seasons: {start: 2023, end: 2025},
    scoring_profile_id: "ppr",
    metrics: [
      "games",
      "fantasy_points_mean",
      "fantasy_points_p10",
      "fantasy_points_p50",
      "fantasy_points_p90",
      "fantasy_points_std_dev",
    ],
    group_by: "season",
    filters: [],
    sort: {field: "season", direction: "asc"},
    limit: 100,
    visualization: {
      type: "line",
      x: "season",
      y: "fantasy_points_mean",
      color: "player_name",
    },
  },
  scoring_profile: {id: "ppr", weights: {}},
  sources: [],
  columns: {
    dimensions: ["player_id", "player_name", "position", "season"],
    metrics: [
      "games",
      "fantasy_points_mean",
      "fantasy_points_p10",
      "fantasy_points_p50",
      "fantasy_points_p90",
      "fantasy_points_std_dev",
    ],
  },
  visualization: {
    type: "line",
    x: "season",
    y: "fantasy_points_mean",
    color: "player_name",
  },
  row_count: 2,
  truncated: false,
  rows: [
    {
      dimensions: {
        player_id: "historical-only",
        player_name: "Historical Only",
        position: "RB",
        season: 2025,
      },
      metrics: {
        games: 17,
        fantasy_points_mean: 16,
        fantasy_points_p10: 7,
        fantasy_points_p50: 15,
        fantasy_points_p90: 25,
        fantasy_points_std_dev: 5,
      },
    },
    {
      dimensions: {
        player_id: "rb-one",
        player_name: "rb-one Player",
        position: "RB",
        season: 2025,
      },
      metrics: {
        games: 16,
        fantasy_points_mean: 14,
        fantasy_points_p10: 6,
        fantasy_points_p50: 13,
        fantasy_points_p90: 22,
        fantasy_points_std_dev: 4,
      },
    },
  ],
}

describe("intra-position live presentation model", () => {
  it("uses only explicitly available same-position players, de-duplicates IDs, caps display, and reports counts", () => {
    const rbOne = makePlayer("rb-one", {activeRank: 2})
    const rbTwo = makePlayer("rb-two", {activeRank: 1})
    const rbThree = makePlayer("rb-three", {activeRank: 3})
    const rbFour = makePlayer("rb-four", {activeRank: 4})
    const draftedOnlyInLibrary = makePlayer("drafted-only", {activeRank: 1})
    const wrongPosition = makePlayer("wr-one", {
      position: FantasyPosition.WIDE_RECEIVER,
      activeRank: 1,
    })
    const model = modelFor([
      rbOne,
      wrongPosition,
      rbTwo,
      rbOne,
      rbThree,
      rbFour,
    ])

    expect(model.players.map(player => player.player.id)).toEqual([
      "rb-two", "rb-one", "rb-three", "rb-four",
    ])
    expect(model.players).toHaveLength(4)
    expect(MAX_INTRA_POSITION_SHORTLIST_PLAYERS).toBe(5)
    expect(model.players.map(player => player.player.id))
      .not.toContain(draftedOnlyInLibrary.id)
    expect(model).toMatchObject({
      position: "RB",
      totalAvailablePlayerCount: 4,
      visiblePlayerCount: 4,
      hiddenPlayerCount: 0,
    })
  })

  it("orders by active rank only, puts unranked players last, and uses full name then ID ties", () => {
    const tiedLaterId = makePlayer("rb-z", {
      activeRank: 1,
      fullName: "Alpha Runner",
    })
    const tiedEarlierId = makePlayer("rb-a", {
      activeRank: 1,
      fullName: "Alpha Runner",
    })
    const namedLater = makePlayer("rb-b", {
      activeRank: 1,
      fullName: "Zulu Runner",
    })
    const unranked = makePlayer("rb-unranked", {
      activeRank: 9999,
      fullName: "Able Runner",
    })
    const model = modelFor([
      unranked,
      namedLater,
      tiedLaterId,
      tiedEarlierId,
    ])

    expect(model.players.map(player => player.player.id)).toEqual([
      "rb-a", "rb-z", "rb-b", "rb-unranked",
    ])
    expect(model.hiddenPlayerCount).toBe(0)

    const allUnranked = modelFor([
      makePlayer("rb-unranked-z", {
        activeRank: 9999,
        fullName: "Zulu Runner",
      }),
      makePlayer("rb-unranked-a", {
        activeRank: 9999,
        fullName: "Able Runner",
      }),
    ])
    expect(allUnranked.players.map(player => player.player.id)).toEqual([
      "rb-unranked-a", "rb-unranked-z",
    ])
  })

  it("does not let ADP, projections, historical fields, or status evidence reorder the active-rank shortlist", () => {
    const first = makePlayer("rb-first", {activeRank: 1, adp: 400})
    const second = {
      ...makePlayer("rb-second", {activeRank: 2, adp: 1}),
      historicalStats: {
        2025: {
          rk: 1,
          player: "rb-second",
          name: "rb-second Player",
          tm: NFLTeam.BUF,
          team: "BUF",
          fantPos: FantasyPosition.RUNNING_BACK,
          position: "RB",
          playerId: "rb-second",
          fantasyPointsPerGame: 99,
        },
      },
    }
    const playerStatus = {
      "rb-second": {
        playerId: "rb-second",
        state: "ready" as const,
        response: {events: [statusEvent({player_id: "rb-second"})]},
        loadedAt: 1,
      },
    }
    const model = modelFor([second, first], {playerStatus})

    expect(model.players.map(player => player.player.id)).toEqual([
      "rb-first", "rb-second",
    ])
    expect(model.players[1].statusEvidence).toHaveLength(1)
  })

  it("shows custom data only when actual custom records exist and labels active-source fallback honestly", () => {
    const custom = makePlayer("rb-custom", {
      activeRank: 1,
      activeTier: 2,
      customRank: 5,
      customTier: 4,
    })
    const activeOnly = makePlayer("rb-active", {
      activeRank: 2,
      activeTier: 3,
    })
    const model = modelFor([custom, activeOnly], {
      currentBoardSettings: {
        ...boardSettings,
        ranker: ThirdPartyRanker.ESPN,
      },
    })

    expect(model.players[0]).toMatchObject({
      positionRankSourceLabel: "ESPN draft board",
      activeTierSourceLabel: "ESPN draft board",
      customPositionRank: 5,
      customTier: 4,
      activeTier: 2,
    })
    expect(model.players[1]).toMatchObject({
      customPositionRank: null,
      customTier: null,
      activeTier: 3,
    })

    const customLeader = makePlayer("custom-leader", {
      activeRank: 2,
      customRank: 1,
      customTier: 1,
    })
    const activeLeader = makePlayer("active-leader", {
      activeRank: 1,
      customRank: 2,
      customTier: 1,
    })
    expect(modelFor([customLeader, activeLeader]).players.map(player =>
      player.player.id)).toEqual(["active-leader", "custom-leader"])
    expect(modelFor([customLeader, activeLeader], {
      currentBoardSettings: {
        ...boardSettings,
        ranker: ThirdPartyRanker.CUSTOM,
      },
    }).players.map(player => player.player.id)).toEqual([
      "custom-leader", "active-leader",
    ])
  })

  it("uses a deterministic shared scale and safely handles equal, zero, reversed, missing, and non-finite range evidence", () => {
    const equal = makePlayer("rb-equal", {activeRank: 1})
    const zero = makePlayer("rb-zero", {activeRank: 2})
    const reversed = makePlayer("rb-reversed", {activeRank: 3})
    const nonFinite = makePlayer("rb-nonfinite", {activeRank: 4})
    const missing = makePlayer("rb-missing", {activeRank: 99})
    const summaries = [projectionSummary({
      RB: {
        1: tier(1, 1, 12, 12),
        2: tier(1, 2, 0, 0),
        3: tier(2, 3, 10, 20),
        4: tier(2, 4, Number.NaN, Number.POSITIVE_INFINITY),
      },
    })]

    const equalModel = modelFor([equal], {rankingSummaries: summaries})
    const zeroModel = modelFor([zero], {rankingSummaries: summaries})
    const reversedModel = modelFor([reversed], {rankingSummaries: summaries})
    const nonFiniteModel = modelFor([nonFinite], {rankingSummaries: summaries})
    const missingModel = modelFor([missing], {rankingSummaries: summaries})

    expect(equalModel.players[0].projection).toMatchObject({
      floor: 12,
      median: 12,
      ceiling: 12,
    })
    expect(equalModel.players[0].projectionSpread).toBe(0)
    expect(zeroModel.players[0].projection).toMatchObject({
      floor: 0,
      median: 0,
      ceiling: 0,
    })
    expect(reversedModel.players[0].projection).toMatchObject({
      floor: 10,
      median: 15,
      ceiling: 20,
    })
    expect(reversedModel.players[0].projectionSpread).toBe(10)
    expect(nonFiniteModel.players[0].projection).toMatchObject({
      floor: null,
      median: null,
      ceiling: null,
    })
    expect(missingModel.players[0]).toMatchObject({
      projectionTier: null,
      projectionSpread: null,
      projection: {floor: null, median: null, ceiling: null},
    })

    const forward = modelFor([equal, zero, reversed], {
      rankingSummaries: summaries,
    })
    const backward = modelFor([reversed, zero, equal], {
      rankingSummaries: summaries,
    })
    expect(forward.projectionScale).toEqual(backward.projectionScale)
    expect(forward.projectionScale).toEqual({
      minimum: 0,
      maximum: 20,
      hasFiniteValues: true,
    })
  })

  it("uses only actionable status evidence without changing the shortlist order", () => {
    const first = makePlayer("rb-one", {activeRank: 1})
    const second = makePlayer("rb-two", {activeRank: 2})
    const model = modelFor([second, first], {
      playerStatus: {
        "rb-two": {
          playerId: "rb-two",
          state: "ready",
          response: {
            events: [
              statusEvent({id: "current", player_id: "rb-two"}),
              statusEvent({
                id: "stale",
                player_id: "rb-two",
                stale: true,
                short_summary: "Old report.",
              }),
              statusEvent({
                id: "none",
                player_id: "rb-two",
                recommendation_impact: "none",
                short_summary: "No impact.",
              }),
            ],
          },
          loadedAt: 1,
        },
      },
    })

    expect(model.players.map(player => player.player.id)).toEqual([
      "rb-one", "rb-two",
    ])
    expect(model.players[1].statusEvidence.map(event => event.id)).toEqual([
      "current",
    ])
  })
})

describe("intra-position live surface", () => {
  beforeEach(() => {
    localStorage.clear()
    mockedExecute.mockReset()
    mockedExecute.mockResolvedValue(historicalResponse)
  })

  it("renders semantic shortlist order, authority labels, exact projection values and spread, status, and keyboard inspection", () => {
    const player = makePlayer("rb-one", {
      activeRank: 1,
      activeTier: 2,
      customRank: 4,
      customTier: 3,
    })
    const onInspect = jest.fn()
    const view = render(
      <IntraPositionLiveSurface
        model={modelFor([player], {
          playerStatus: {
            "rb-one": {
              playerId: "rb-one",
              state: "ready",
              response: {events: [statusEvent()]},
              loadedAt: 1,
            },
          },
        })}
        onInspectPlayer={onInspect}
      />,
    )

    expect(view.getByRole("list", {
      name: "Currently available RB live shortlist",
    })).toBeTruthy()
    expect(view.getByText("Shortlist order 1")).toBeTruthy()
    expect(view.getByText("Custom user tier")).toBeTruthy()
    expect(view.getByText("Custom user position rank")).toBeTruthy()
    expect(view.getByText("Active position rank · Harris draft board"))
      .toBeTruthy()
    expect(view.getByText("Active tier · Harris draft board")).toBeTruthy()
    expect(view.getByText("Projection tier · overlay only")).toBeTruthy()
    expect(view.getByText("Floor · downside")).toBeTruthy()
    expect(view.getByText("Median · expected")).toBeTruthy()
    expect(view.getByText("Ceiling · upside")).toBeTruthy()
    expect(view.getByText("Projection spread · uncertainty")).toBeTruthy()
    expect(view.getAllByText("10.0 PPG")).toHaveLength(2)
    expect(view.getByText("15.0 PPG")).toBeTruthy()
    expect(view.getByText("20.0 PPG")).toBeTruthy()
    expect(view.getByText(/Limited — structured report\./)).toBeTruthy()
    expect(view.getByText(/90% confidence/)).toBeTruthy()
    expect(view.getByRole("img", {
      name: /floor 10.0 PPG, median 15.0 PPG, ceiling 20.0 PPG, spread 10.0 PPG/,
    })).toBeTruthy()
    expect(view.container.textContent).not.toMatch(/preferred|fallback/i)
    expect(view.container.textContent).not.toContain("advisor selected")

    const inspect = view.getByRole("button", {
      name: "Inspect rb-one Player comparison",
    })
    expect(inspect.tagName).toBe("BUTTON")
    inspect.focus()
    expect(document.activeElement).toBe(inspect)
    fireEvent.keyDown(inspect, {key: "Enter"})
    fireEvent.click(inspect)
    expect(onInspect).toHaveBeenCalledWith(player)
  })

  it("does not let a null projection tier masquerade as a zero-PPG projection and provides empty states", () => {
    const unavailableProjection = makePlayer("rb-missing", {activeRank: 99})
    const view = render(
      <IntraPositionLiveSurface
        model={modelFor([unavailableProjection])}
        onInspectPlayer={jest.fn()}
      />,
    )

    expect(view.getByText("Projection tier · overlay only")).toBeTruthy()
    expect(view.getAllByText("Unavailable").length).toBeGreaterThan(0)
    expect(view.queryByText("Custom user tier")).toBeNull()
    expect(view.queryByText("Custom user position rank")).toBeNull()
    expect(view.container.textContent).not.toContain("0.0 PPG")
    expect(view.getByText("Shared PPG scale unavailable")).toBeTruthy()

    view.rerender(
      <IntraPositionLiveSurface
        model={modelFor([])}
        onInspectPlayer={jest.fn()}
      />,
    )
    expect(view.getByText("No currently available RB players.")).toBeTruthy()
    expect(view.queryByRole("list", {
      name: "Currently available RB live shortlist",
    })).toBeNull()
  })

  it("keeps fixed-width point and median markers inside both shared-scale endpoints", () => {
    const minimum = makePlayer("rb-minimum", {activeRank: 1})
    const maximum = makePlayer("rb-maximum", {activeRank: 2})
    const model = modelFor([minimum, maximum], {
      rankingSummaries: [projectionSummary({
        RB: {
          1: tier(1, 1, 0, 0),
          2: tier(1, 2, 10, 10),
        },
      })],
    })
    const view = render(
      <IntraPositionLiveSurface model={model} onInspectPlayer={jest.fn()} />,
    )

    const minimumPoint = view.getByTestId(
      "intra-position-projection-point-rb-minimum",
    )
    const maximumPoint = view.getByTestId(
      "intra-position-projection-point-rb-maximum",
    )
    const minimumMedian = view.getByTestId(
      "intra-position-projection-median-rb-minimum",
    )
    const maximumMedian = view.getByTestId(
      "intra-position-projection-median-rb-maximum",
    )
    expect(minimumPoint.getAttribute("style"))
      .toContain("left: 0%; transform: translateX(0) translateY(-50%);")
    expect(maximumPoint.getAttribute("style"))
      .toContain("left: 100%; transform: translateX(-100%) translateY(-50%);")
    expect(minimumMedian.getAttribute("style"))
      .toContain("left: 0%; transform: translateX(0);")
    expect(maximumMedian.getAttribute("style"))
      .toContain("left: 100%; transform: translateX(-100%);")
  })

  it("defers unsupported risk and synergy evidence instead of fabricating it", () => {
    const view = render(
      <IntraPositionLiveSurface
        model={modelFor([makePlayer("rb-one")])}
        onInspectPlayer={jest.fn()}
      />,
    )

    expect(view.getByText(/Additional risk and synergy evidence/)).toBeTruthy()
    expect(view.getByText(/remains unavailable until reliable structured contracts exist/))
      .toBeTruthy()
    expect(view.queryByText("Games missed")).toBeNull()
    expect(view.queryByText("Risk score")).toBeNull()
    expect(view.container.textContent).not.toMatch(/bye|stack|handcuff/i)
  })

  it("announces each material identity, source, projection, count, or status update once while silencing equivalent rerenders", async () => {
    const first = makePlayer("rb-one", {activeRank: 1})
    const second = makePlayer("rb-two", {activeRank: 2})
    const view = render(
      <IntraPositionLiveSurface
        model={modelFor([first, second])}
        onInspectPlayer={jest.fn()}
      />,
    )
    const liveRegion = () => view.container.querySelector(
      "[aria-live='polite']",
    )?.textContent

    view.rerender(
      <IntraPositionLiveSurface
        model={modelFor([second, first])}
        onInspectPlayer={jest.fn()}
      />,
    )
    expect(liveRegion()).toBe("")

    view.rerender(
      <IntraPositionLiveSurface
        model={modelFor([first])}
        onInspectPlayer={jest.fn()}
      />,
    )
    await waitFor(() => expect(liveRegion()).toContain("Update 1."))

    const espnBoardSettings = {
      ...boardSettings,
      ranker: ThirdPartyRanker.ESPN,
    }
    view.rerender(
      <IntraPositionLiveSurface
        model={modelFor([first], {
          currentBoardSettings: espnBoardSettings,
        })}
        onInspectPlayer={jest.fn()}
      />,
    )
    await waitFor(() => expect(liveRegion()).toContain("Update 2."))

    const projectionChanged = [projectionSummary({
      RB: {1: tier(1, 1, 30, 20)},
    })]
    view.rerender(
      <IntraPositionLiveSurface
        model={modelFor([first], {
          currentBoardSettings: espnBoardSettings,
          rankingSummaries: projectionChanged,
        })}
        onInspectPlayer={jest.fn()}
      />,
    )
    await waitFor(() => expect(liveRegion()).toContain("Update 3."))

    const readyWithoutActionableEvidence = {
      "rb-one": {
        playerId: "rb-one",
        state: "ready" as const,
        response: {events: []},
        loadedAt: 1,
      },
    }
    view.rerender(
      <IntraPositionLiveSurface
        model={modelFor([first], {
          currentBoardSettings: espnBoardSettings,
          rankingSummaries: projectionChanged,
          playerStatus: readyWithoutActionableEvidence,
        })}
        onInspectPlayer={jest.fn()}
      />,
    )
    expect(liveRegion()).toContain("Update 3.")

    view.rerender(
      <IntraPositionLiveSurface
        model={modelFor([first], {
          currentBoardSettings: espnBoardSettings,
          rankingSummaries: projectionChanged,
          playerStatus: {
            "rb-one": {
              playerId: "rb-one",
              state: "loading",
              response: null,
              loadedAt: null,
            },
          },
        })}
        onInspectPlayer={jest.fn()}
      />,
    )
    await waitFor(() => expect(liveRegion()).toContain("Update 4."))
    expect(view.getByText("Loading advisory status evidence…")).toBeTruthy()

    view.rerender(
      <IntraPositionLiveSurface
        model={modelFor([first], {
          currentBoardSettings: espnBoardSettings,
          rankingSummaries: projectionChanged,
          playerStatus: {
            "rb-one": {
              playerId: "rb-one",
              state: "loading",
              response: null,
              loadedAt: null,
            },
          },
        })}
        onInspectPlayer={jest.fn()}
      />,
    )
    expect(liveRegion()).toContain("Update 4.")

    view.rerender(
      <IntraPositionLiveSurface
        model={modelFor([first], {
          currentBoardSettings: espnBoardSettings,
          rankingSummaries: projectionChanged,
          playerStatus: {
            "rb-one": {
              playerId: "rb-one",
              state: "unavailable",
              response: null,
              loadedAt: 2,
            },
          },
        })}
        onInspectPlayer={jest.fn()}
      />,
    )
    await waitFor(() => expect(liveRegion()).toContain("Update 5."))
    expect(view.getByText(/Status provider unavailable/)).toBeTruthy()

    const actionableStatus = statusEvent()
    view.rerender(
      <IntraPositionLiveSurface
        model={modelFor([first], {
          currentBoardSettings: espnBoardSettings,
          rankingSummaries: projectionChanged,
          playerStatus: {
            "rb-one": {
              playerId: "rb-one",
              state: "ready",
              response: {events: [actionableStatus]},
              loadedAt: 3,
            },
          },
        })}
        onInspectPlayer={jest.fn()}
      />,
    )
    await waitFor(() => expect(liveRegion()).toContain("Update 6."))
    expect(view.getByText(/Limited — structured report\./)).toBeTruthy()

    view.rerender(
      <IntraPositionLiveSurface
        model={modelFor([first], {
          currentBoardSettings: espnBoardSettings,
          rankingSummaries: projectionChanged,
          playerStatus: {
            "rb-one": {
              playerId: "rb-one",
              state: "ready",
              response: {events: [actionableStatus]},
              loadedAt: 4,
            },
          },
        })}
        onInspectPlayer={jest.fn()}
      />,
    )
    expect(liveRegion()).toContain("Update 6.")

    view.rerender(
      <IntraPositionLiveSurface
        model={modelFor([first], {
          currentBoardSettings: espnBoardSettings,
          rankingSummaries: projectionChanged,
          playerStatus: {
            "rb-one": {
              playerId: "rb-one",
              state: "ready",
              response: {
                events: [statusEvent({short_summary: "Updated report."})],
              },
              loadedAt: 5,
            },
          },
        })}
        onInspectPlayer={jest.fn()}
      />,
    )
    await waitFor(() => expect(liveRegion()).toContain("Update 7."))

    view.rerender(
      <IntraPositionLiveSurface
        model={modelFor([first], {
          currentBoardSettings: espnBoardSettings,
          rankingSummaries: projectionChanged,
          playerStatus: readyWithoutActionableEvidence,
        })}
        onInspectPlayer={jest.fn()}
      />,
    )
    await waitFor(() => expect(liveRegion()).toContain("Update 8."))

    view.rerender(
      <IntraPositionLiveSurface
        model={modelFor([second], {
          currentBoardSettings: espnBoardSettings,
          rankingSummaries: projectionChanged,
        })}
        onInspectPlayer={jest.fn()}
      />,
    )
    await waitFor(() => expect(liveRegion()).toContain("Update 9."))
  })
})

describe("intra-position workspace and historical boundaries", () => {
  const liveOne = makePlayer("rb-one", {activeRank: 1})
  const libraryLiveOne = {
    ...liveOne,
    fullName: "Library rb-one Player",
  }
  const liveTwo = makePlayer("rb-two", {activeRank: 2})
  const historicalOnly = makePlayer("historical-only", {activeRank: 3})
  const qb = makePlayer("qb-one", {
    position: FantasyPosition.QUARTERBACK,
    activeRank: 1,
  })
  const workspaceProps = {
    activePlayer: liveOne,
    availablePlayers: [liveOne, liveTwo, qb],
    boardSettings,
    players: [libraryLiveOne, liveTwo, historicalOnly, qb],
    rankingSummaries: [projectionSummary()],
    settings,
    comparisonController: {
      mode: "pinned" as const,
      items: [libraryLiveOne, historicalOnly, liveTwo].map(player => ({
        player, reasonCode: "manual_pin" as const, reasonLabel: "Manual pin",
      })),
      announcement: "",
      pinCurrent: jest.fn(), restoreAuto: jest.fn(), addPinnedPlayer: jest.fn(), removePinnedPlayer: jest.fn(),
    },
  }

  beforeEach(() => {
    localStorage.clear()
    mockedExecute.mockReset()
    mockedExecute.mockResolvedValue(historicalResponse)
  })

  it("renders the live shortlist without a historical request and keeps the shared pinned set controlled", async () => {
    const view = render(<AnalysisWorkspace {...workspaceProps} />)
    fireEvent.click(view.getByRole("button", {
      name: "Player lab",
    }))

    expect(view.getByText("Compare RB options"))
      .toBeTruthy()
    expect(view.getByText("rb-one Player", {selector: "h3"})).toBeTruthy()
    expect(mockedExecute).not.toHaveBeenCalled()
    expect(view.getByRole("group", {name: "Shared Player Lab set · 3/3"}))
      .toBeTruthy()

    view.rerender(
      <AnalysisWorkspace
        {...workspaceProps}
        availablePlayers={[liveTwo, qb]}
      />,
    )
    expect(view.getByRole("group", {name: "Shared Player Lab set · 3/3"}))
      .toBeTruthy()
    expect(view.queryByText("rb-one Player", {selector: "h3"})).toBeNull()
    expect(mockedExecute).not.toHaveBeenCalled()

    fireEvent.click(view.getByRole("button", {name: "Run analysis"}))
    await waitFor(() => expect(mockedExecute).toHaveBeenCalledTimes(1))
    expect(mockedExecute.mock.calls[0][0]).toEqual(expect.objectContaining({
      player_ids: ["rb-one", "historical-only", "rb-two"],
      group_by: "season",
      metrics: [
        "games",
        "fantasy_points_mean",
        "fantasy_points_p10",
        "fantasy_points_p50",
        "fantasy_points_p90",
        "fantasy_points_std_dev",
      ],
    }))
    await waitFor(() => expect(view.getByRole("button", {
      name: "Historical Only",
    })).toBeTruthy())
    expect(view.queryByText("Historical Only", {selector: "h3"})).toBeNull()
    expect(view.getByRole("list", {
      name: "Currently available RB live shortlist",
    })).toBeTruthy()
  })

  it("keeps live and historical drawers separate while closing a removed or position-incompatible live drawer", async () => {
    const view = render(<AnalysisWorkspace {...workspaceProps} />)
    fireEvent.click(view.getByRole("button", {
      name: "Player lab",
    }))
    fireEvent.click(view.getByRole("button", {
      name: "Inspect rb-one Player comparison",
    }))
    const dialog = view.getByRole("dialog")
    expect(dialog.textContent).toContain("rb-one Player")
    expect(dialog.textContent).not.toContain("Library rb-one Player")

    view.rerender(
      <AnalysisWorkspace
        {...workspaceProps}
        availablePlayers={[liveTwo, qb]}
      />,
    )
    await waitFor(() => expect(view.queryByRole("dialog")).toBeNull())

    fireEvent.click(view.getByRole("button", {
      name: "Inspect rb-two Player comparison",
    }))
    expect(view.getByRole("dialog")).toBeTruthy()
    fireEvent.change(view.getByLabelText("Analysis position"), {
      target: {value: "QB"},
    })
    await waitFor(() => expect(view.queryByRole("dialog")).toBeNull())

    fireEvent.change(view.getByLabelText("Analysis position"), {
      target: {value: "RB"},
    })
    fireEvent.click(view.getByRole("button", {name: "Run analysis"}))
    await waitFor(() => expect(mockedExecute).toHaveBeenCalledTimes(1))
    await waitFor(() => fireEvent.click(view.getByRole("button", {name: "Historical Only"})))
    expect(view.getByRole("dialog")).toBeTruthy()

    view.rerender(
      <AnalysisWorkspace
        {...workspaceProps}
        availablePlayers={[qb]}
      />,
    )
    expect(view.getByRole("dialog")).toBeTruthy()
  })

  it("does not create navigation events for live shortlist changes and gives equivalent desktop/mobile workspace inputs", () => {
    const onHandled = jest.fn()
    const view = render(
      <div>
        <AnalysisWorkspace {...workspaceProps} onAnalysisViewEventHandled={onHandled} />
        <AnalysisWorkspace {...workspaceProps} onAnalysisViewEventHandled={onHandled} />
      </div>,
    )
    const viewButtons = view.getAllByRole("button", {
      name: "Player lab",
    })
    fireEvent.click(viewButtons[0])
    fireEvent.click(viewButtons[1])
    expect(view.getAllByRole("list", {
      name: "Currently available RB live shortlist",
    })).toHaveLength(2)
    expect(view.getAllByText("rb-one Player", {selector: "h3"}))
      .toHaveLength(2)
    view.rerender(
      <div>
        <AnalysisWorkspace
          {...workspaceProps}
          availablePlayers={[liveTwo, qb]}
          onAnalysisViewEventHandled={onHandled}
        />
        <AnalysisWorkspace
          {...workspaceProps}
          availablePlayers={[liveTwo, qb]}
          onAnalysisViewEventHandled={onHandled}
        />
      </div>,
    )
    expect(onHandled).not.toHaveBeenCalled()
  })
})

describe("intra-position historical query controls", () => {
  it("retains the 1/3/5-season and all scoring-profile manual query options with required metrics", () => {
    const combinations: Array<{
      seasonWindow: 1 | 3 | 5
      scoringProfile: "standard" | "half_ppr" | "ppr"
    }> = [
      {seasonWindow: 1, scoringProfile: "standard"},
      {seasonWindow: 3, scoringProfile: "half_ppr"},
      {seasonWindow: 5, scoringProfile: "ppr"},
    ]
    combinations.forEach(({seasonWindow, scoringProfile}) => {
      const query = buildAnalysisViewQuery({
        view: "intra_position",
        playerIds: ["rb-one", "rb-two"],
        crossPositionPlayerIds: [],
        position: "RB",
        seasons: Array.from(
          {length: seasonWindow},
          (_, index) => 2025 - seasonWindow + index + 1,
        ),
        scoringProfile,
      })
      expect(query.seasons).toEqual(Array.from(
        {length: seasonWindow},
        (_, index) => 2025 - seasonWindow + index + 1,
      ))
      expect(query.scoring_profile_id).toBe(scoringProfile)
      expect(query.metrics).toEqual([
        "games",
        "fantasy_points_mean",
        "fantasy_points_p10",
        "fantasy_points_p50",
        "fantasy_points_p90",
        "fantasy_points_std_dev",
      ])
      expect(query.visualization).toEqual({
        type: "line",
        x: "season",
        y: "fantasy_points_mean",
        color: "player_name",
      })
    })
  })
})
