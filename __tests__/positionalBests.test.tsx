import React from "react"
import {
  fireEvent,
  render,
  waitFor,
} from "@testing-library/react"

import type { AnalysisQueryResponse } from "../behavior/api/historicalAnalysis"
import type { PlayerStatusEvent } from "../behavior/api/playerStatus"
import {
  buildPositionalBestsPresentationModel,
  buildProjectionScale,
  normalizeProjectionRange,
} from "../behavior/analysis/positionalBests"
import type {
  DraftRecommendationCandidate,
  DraftRecommendationSet,
} from "../behavior/draft-advisor/recommendations"
import { executeHistoricalAnalysis } from "../behavior/api/historicalAnalysis"
import AnalysisWorkspace from "../components/analysis/AnalysisWorkspace"
import PositionalBestsLiveSurface from "../components/analysis/PositionalBestsLiveSurface"
import {
  FantasyPosition,
  FantasySettings,
  NFLTeam,
  Player,
  Tier,
  ThirdPartyADPRanker,
  ThirdPartyRanker,
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
  ranker: ThirdPartyRanker,
  position: FantasyPosition,
  positionRank: number,
  tierNumber?: number,
) => ({
  playerId,
  ranker,
  position,
  pprPositionRank: positionRank,
  standardPositionRank: positionRank,
  ...(tierNumber === undefined ? {} : {
    pprPositionTier: tier(tierNumber),
    standardPositionTier: tier(tierNumber),
  }),
})

const makePlayer = (
  id: string,
  positionRank: number,
  customRank?: number,
  customTier?: number,
): Player => ({
  id,
  firstName: id,
  lastName: "Player",
  fullName: `${id} Player`,
  team: NFLTeam.BUF,
  position: FantasyPosition.RUNNING_BACK,
  ranks: {
    [ThirdPartyRanker.HARRIS]: ranking(
      id,
      ThirdPartyRanker.HARRIS,
      FantasyPosition.RUNNING_BACK,
      positionRank,
      1,
    ),
    [ThirdPartyRanker.ESPN]: {
      ...ranking(
        id,
        ThirdPartyRanker.ESPN,
        FantasyPosition.RUNNING_BACK,
        positionRank,
      ),
      adp: positionRank * 10,
    },
    ...(customRank === undefined ? {} : {
      [ThirdPartyRanker.CUSTOM]: ranking(
        id,
        ThirdPartyRanker.CUSTOM,
        FantasyPosition.RUNNING_BACK,
        customRank,
        customTier,
      ),
    }),
  },
})

const makeCandidate = (
  player: Player,
  overrides: Partial<DraftRecommendationCandidate["evidence"]> = {},
): DraftRecommendationCandidate => ({
  player,
  positionRank: 1,
  score: 10,
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

const makeRecommendations = (
  candidates: DraftRecommendationCandidate[],
): DraftRecommendationSet => ({
  schemaVersion: 1,
  currentPick: 6,
  nextUserPick: 8,
  preferredView: "positional_bests",
  viewExplanation: "Review current positional bests.",
  candidates,
})

const statusEvent = (
  overrides: Partial<PlayerStatusEvent> = {},
): PlayerStatusEvent => ({
  schema_version: 1,
  id: "status-current",
  player_id: "one",
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

const response: AnalysisQueryResponse = {
  query: {
    player_ids: [],
    positions: ["RB"],
    seasons: {start: 2023, end: 2025},
    scoring_profile_id: "ppr",
    metrics: ["games", "fantasy_points_mean"],
    group_by: "player",
    filters: [],
    sort: {field: "fantasy_points_mean", direction: "desc"},
    limit: 24,
    visualization: {
      type: "bar",
      x: "player_name",
      y: "fantasy_points_mean",
    },
  },
  scoring_profile: {id: "ppr", weights: {}},
  sources: [],
  columns: {
    dimensions: ["player_id", "player_name", "position"],
    metrics: ["games", "fantasy_points_mean"],
  },
  visualization: {
    type: "bar",
    x: "player_name",
    y: "fantasy_points_mean",
  },
  row_count: 1,
  truncated: false,
  rows: [{
    dimensions: {
      player_id: "one",
      player_name: "one Player",
      position: "RB",
    },
    metrics: {games: 17, fantasy_points_mean: 15},
  }],
}

describe("positional bests presentation model", () => {
  it("preserves supplied order and applies the maximum-three render bound", () => {
    const players = [
      makePlayer("one", 1, 4, 2),
      makePlayer("two", 2),
      makePlayer("three", 3),
      makePlayer("four", 4),
    ]
    const model = buildPositionalBestsPresentationModel({
      recommendations: makeRecommendations(
        players.map(player => makeCandidate(player)),
      ),
      boardSettings,
      settings,
    })

    expect(model.candidates.map(candidate => candidate.player.id)).toEqual([
      "one", "two", "three",
    ])
    expect(model.candidates.map(candidate => candidate.preferenceLabel)).toEqual([
      "Preferred", "Fallback", "Fallback",
    ])
    expect(model.candidates.map(candidate => candidate.fallbackNumber)).toEqual([
      null, 1, 2,
    ])
  })

  it("labels custom data only when it exists and keeps active-source labels honest", () => {
    const [custom, activeOnly] = [
      makePlayer("custom", 1, 5, 3),
      makePlayer("active-only", 2),
    ]
    const model = buildPositionalBestsPresentationModel({
      recommendations: makeRecommendations([
        makeCandidate(custom),
        makeCandidate(activeOnly, {userTier: 2}),
      ]),
      boardSettings,
      settings,
    })

    expect(model.candidates[0]).toMatchObject({
      positionRank: 1,
      positionRankSourceLabel: "Harris draft board",
      customPositionRank: 5,
      customTier: 3,
      activeTier: 1,
      activeTierSourceLabel: "Harris draft board",
    })
    expect(model.candidates[1]).toMatchObject({
      customPositionRank: null,
      customTier: null,
      activeTier: 2,
      activeTierSourceLabel: "Harris draft board",
    })
  })

  it("counts every pick before the next user pick and safely handles unavailable pick context", () => {
    const candidate = makeCandidate(makePlayer("one", 1))
    const betweenPicks = buildPositionalBestsPresentationModel({
      recommendations: makeRecommendations([candidate]),
      boardSettings,
      settings,
    })
    const onClock = buildPositionalBestsPresentationModel({
      recommendations: {
        ...makeRecommendations([candidate]),
        currentPick: 8,
        nextUserPick: 8,
      },
      boardSettings,
      settings,
    })
    const unavailable = buildPositionalBestsPresentationModel({
      recommendations: {
        ...makeRecommendations([candidate]),
        currentPick: 0,
      },
      boardSettings,
      settings,
    })

    expect(betweenPicks.picksRemainingUntilNextUserPick).toBe(2)
    expect(onClock.picksRemainingUntilNextUserPick).toBe(0)
    expect(unavailable.picksRemainingUntilNextUserPick).toBeNull()
  })

  it("creates one deterministic scale and safely normalizes equal, zero, missing, and malformed ranges", () => {
    expect(normalizeProjectionRange({
      floor: 12,
      median: 12,
      ceiling: 12,
    })).toMatchObject({
      floor: 12,
      median: 12,
      ceiling: 12,
      rangeFloor: 12,
      rangeCeiling: 12,
    })
    expect(normalizeProjectionRange({
      floor: 0,
      median: 0,
      ceiling: 0,
    }).rangeFloor).toBe(0)
    expect(normalizeProjectionRange({
      floor: undefined,
      median: 5,
      ceiling: Number.POSITIVE_INFINITY,
    })).toMatchObject({
      floor: null,
      median: 5,
      ceiling: null,
      rangeFloor: 5,
      rangeCeiling: 5,
    })
    expect(normalizeProjectionRange({
      floor: 20,
      median: 15,
      ceiling: 10,
    })).toMatchObject({
      floor: 10,
      median: 15,
      ceiling: 20,
      rangeFloor: 10,
      rangeCeiling: 20,
    })
    expect(normalizeProjectionRange({
      floor: Number.NaN,
      median: Number.POSITIVE_INFINITY,
      ceiling: undefined,
    })).toMatchObject({
      floor: null,
      median: null,
      ceiling: null,
      rangeFloor: null,
      rangeCeiling: null,
    })
    expect(buildProjectionScale([
      normalizeProjectionRange({floor: 10, median: 10, ceiling: 10}),
      normalizeProjectionRange({floor: 20, median: 20, ceiling: 20}),
    ])).toEqual({
      minimum: 10,
      maximum: 20,
      hasFiniteValues: true,
    })
    expect(buildProjectionScale([
      normalizeProjectionRange({floor: 0, median: 0, ceiling: 0}),
    ])).toEqual({
      minimum: 0,
      maximum: 1,
      hasFiniteValues: true,
    })
  })
})

describe("realtime positional bests surface", () => {
  beforeEach(() => {
    localStorage.clear()
    mockedExecute.mockReset()
    mockedExecute.mockResolvedValue(response)
  })

  it("renders deterministic evidence, status filtering, projection text, and keyboard inspection", () => {
    const player = makePlayer("one", 1, 4, 2)
    const candidate = makeCandidate(player, {
      rosterRole: "flex_upgrade",
      survivalProbability: 0.25,
      tierLossIfDeferred: 3.5,
      flags: ["User-tier cliff", "Unlikely to survive to next pick"],
    })
    const onInspectPlayer = jest.fn()
    const view = render(
      <PositionalBestsLiveSurface
        model={buildPositionalBestsPresentationModel({
          recommendations: makeRecommendations([candidate]),
          boardSettings,
          settings,
          playerStatus: {
            one: {
              playerId: "one",
              state: "ready",
              loadedAt: Date.now(),
              response: {
                schema_version: 1,
                player_id: "one",
                last_updated_at: "2026-08-09T10:00:00Z",
                events: [
                  statusEvent(),
                  statusEvent({
                    id: "stale",
                    short_summary: "Old stale report.",
                    stale: true,
                  }),
                  statusEvent({
                    id: "none",
                    short_summary: "No recommendation impact.",
                    recommendation_impact: "none",
                  }),
                ],
              },
            },
          },
        })}
        onInspectPlayer={onInspectPlayer}
      />,
    )

    expect(view.getByText("Preferred candidate")).toBeTruthy()
    expect(view.getByText("RB1")).toBeTruthy()
    expect(view.getByText("Custom position rank")).toBeTruthy()
    expect(view.getByText("Custom tier")).toBeTruthy()
    expect(view.getByText("Active ranking tier · Harris draft board")).toBeTruthy()
    expect(view.getByText("10.0 PPG")).toBeTruthy()
    expect(view.getByText("15.0 PPG")).toBeTruthy()
    expect(view.getByText("20.0 PPG")).toBeTruthy()
    expect(view.getByText("25%")).toBeTruthy()
    expect(view.getByText("3.5 PPG")).toBeTruthy()
    expect(view.getByText("Flex upgrade")).toBeTruthy()
    expect(view.getByText("Unlikely to survive to next pick")).toBeTruthy()
    expect(view.getByText(/Limited — structured report\./)).toBeTruthy()
    expect(view.queryByText("Old stale report.")).toBeNull()
    expect(view.queryByText("No recommendation impact.")).toBeNull()
    expect(view.getByText(/90% confidence/)).toBeTruthy()
    expect(view.getByText(/published 2026-08-08 10:00 UTC/)).toBeTruthy()
    expect(view.getByText(/fetched 2026-08-09 10:00 UTC/)).toBeTruthy()
    expect(view.getByRole("img", {
      name: /floor 10.0 PPG, median 15.0 PPG, ceiling 20.0 PPG/,
    })).toBeTruthy()

    const inspect = view.getByRole("button", {
      name: "Inspect one Player comparison",
    })
    expect(inspect.tagName).toBe("BUTTON")
    inspect.focus()
    fireEvent.keyDown(inspect, {key: "Enter"})
    fireEvent.click(inspect)
    expect(onInspectPlayer).toHaveBeenCalledWith(player)
  })

  it("announces material recommendation-evidence updates but not equivalent rerenders", () => {
    const player = makePlayer("one", 1, 4, 2)
    const initialModel = buildPositionalBestsPresentationModel({
      recommendations: makeRecommendations([makeCandidate(player)]),
      boardSettings,
      settings,
      playerStatus: {
        one: {
          playerId: "one",
          state: "ready",
          loadedAt: 1,
          response: {
            schema_version: 1,
            player_id: "one",
            last_updated_at: "2026-08-09T10:00:00Z",
            events: [statusEvent()],
          },
        },
      },
    })
    const view = render(
      <PositionalBestsLiveSurface
        model={initialModel}
        onInspectPlayer={jest.fn()}
      />,
    )

    view.rerender(
      <PositionalBestsLiveSurface
        model={buildPositionalBestsPresentationModel({
          recommendations: makeRecommendations([makeCandidate(player)]),
          boardSettings,
          settings,
          playerStatus: {
            one: {
              playerId: "one",
              state: "ready",
              loadedAt: 2,
              response: {
                schema_version: 1,
                player_id: "one",
                last_updated_at: "2026-08-09T10:00:00Z",
                events: [statusEvent()],
              },
            },
          },
        })}
        onInspectPlayer={jest.fn()}
      />,
    )
    expect(view.queryByText(/Deterministic advisor recommendations updated/)).toBeNull()

    view.rerender(
      <PositionalBestsLiveSurface
        model={buildPositionalBestsPresentationModel({
          recommendations: makeRecommendations([
            makeCandidate(player, {survivalProbability: 0.2}),
          ]),
          boardSettings,
          settings,
          playerStatus: {
            one: {
              playerId: "one",
              state: "ready",
              loadedAt: 3,
              response: {
                schema_version: 1,
                player_id: "one",
                last_updated_at: "2026-08-09T10:00:00Z",
                events: [statusEvent()],
              },
            },
          },
        })}
        onInspectPlayer={jest.fn()}
      />,
    )
    expect(view.getByText(/Deterministic advisor recommendations updated.*Update 1/)).toBeTruthy()

    view.rerender(
      <PositionalBestsLiveSurface
        model={buildPositionalBestsPresentationModel({
          recommendations: makeRecommendations([
            makeCandidate(player, {survivalProbability: 0.2}),
          ]),
          boardSettings,
          settings,
          playerStatus: {
            one: {
              playerId: "one",
              state: "ready",
              loadedAt: 4,
              response: {
                schema_version: 1,
                player_id: "one",
                last_updated_at: "2026-08-09T10:00:00Z",
                events: [statusEvent()],
              },
            },
          },
        })}
        onInspectPlayer={jest.fn()}
      />,
    )
    expect(view.getByText(/Deterministic advisor recommendations updated.*Update 1/)).toBeTruthy()
  })

  it("keeps an equal maximum projection range inside the shared scale", () => {
    const player = makePlayer("one", 1)
    const model = buildPositionalBestsPresentationModel({
      recommendations: makeRecommendations([
        makeCandidate(player, {
          projectedFloor: 20,
          projectedMedian: 20,
          projectedCeiling: 20,
        }),
        makeCandidate(makePlayer("two", 2), {
          projectedFloor: 10,
          projectedMedian: 15,
          projectedCeiling: 20,
        }),
      ]),
      boardSettings,
      settings,
    })
    const view = render(
      <PositionalBestsLiveSurface model={model} onInspectPlayer={jest.fn()} />,
    )

    const range = view.getByTestId("projection-range-one")
    expect(range.getAttribute("style")).toContain("left: 99%")
    expect(range.getAttribute("style")).toContain("width: 1%")
    expect(view.getByRole("img", {
      name: /floor 20.0 PPG, median 20.0 PPG, ceiling 20.0 PPG/,
    })).toBeTruthy()
  })

  it("does not fabricate unsupported flags and renders safe empty/unavailable states", () => {
    const player = makePlayer("one", 1)
    const view = render(
      <PositionalBestsLiveSurface
        model={buildPositionalBestsPresentationModel({
          recommendations: makeRecommendations([
            makeCandidate(player, {flags: []}),
          ]),
          boardSettings,
          settings,
        })}
        onInspectPlayer={jest.fn()}
      />,
    )
    expect(view.container.textContent).not.toContain("bye")
    expect(view.container.textContent).not.toContain("stack")
    expect(view.container.textContent).not.toContain("handcuff")

    view.rerender(
      <PositionalBestsLiveSurface
        model={buildPositionalBestsPresentationModel({
          recommendations: makeRecommendations([]),
          boardSettings,
          settings,
        })}
        onInspectPlayer={jest.fn()}
      />,
    )
    expect(view.getByText("No legal recommendation candidates remain.")).toBeTruthy()
    view.rerender(
      <PositionalBestsLiveSurface
        model={null}
        onInspectPlayer={jest.fn()}
      />,
    )
    expect(view.getByText("Live positional bests unavailable")).toBeTruthy()
  })
})

describe("workspace live and historical boundaries", () => {
  const players = [
    makePlayer("one", 1, 4, 2),
    makePlayer("two", 2),
  ]
  const recommendations = makeRecommendations(
    players.map(player => makeCandidate(player)),
  )
  const workspaceProps = {
    activePlayer: players[0],
    availablePlayers: players,
    boardSettings,
    players,
    rankingSummaries: [],
    recommendations,
    settings,
  }

  beforeEach(() => {
    localStorage.clear()
    mockedExecute.mockReset()
    mockedExecute.mockResolvedValue(response)
  })

  it("renders live candidates without issuing a historical request, while keeping the drilldown runnable", async () => {
    const view = render(<AnalysisWorkspace {...workspaceProps} />)
    fireEvent.click(view.getByRole("button", {
      name: "Position tiers",
    }))
    fireEvent.click(view.getByRole("button", {name: /RB 2 tiered/}))

    expect(view.getByText("Where will each tier run out?")).toBeTruthy()
    expect(view.getAllByText("one Player").length).toBeGreaterThan(0)
    expect(mockedExecute).not.toHaveBeenCalled()

    fireEvent.click(view.getByRole("button", {name: "Run analysis"}))
    await waitFor(() => expect(mockedExecute).toHaveBeenCalledTimes(1))
    expect(mockedExecute.mock.calls[0][0]).toEqual(expect.objectContaining({
      positions: ["RB"],
      group_by: "player",
    }))
  })

  it("keeps position tiers independent of recommendations and closes an unavailable player's drawer", () => {
    const view = render(<AnalysisWorkspace {...workspaceProps} />)
    fireEvent.click(view.getByRole("button", {
      name: "Position tiers",
    }))
    fireEvent.click(view.getByRole("button", {name: /RB 2 tiered/}))
    fireEvent.click(view.getByRole("button", {
      name: "Inspect one Player",
    }))
    expect(view.getByRole("dialog")).toBeTruthy()

    view.rerender(
      <AnalysisWorkspace
        {...workspaceProps}
        availablePlayers={[players[1]]}
        recommendations={makeRecommendations([
          makeCandidate(players[1]),
        ])}
      />,
    )
    expect(view.queryByText("one Player")).toBeNull()
    expect(view.queryByRole("dialog")).toBeNull()
    expect(view.getAllByText("two Player").length).toBeGreaterThan(0)
  })

  it("gives equivalent recommendation inputs to independently rendered workspace paths", () => {
    const view = render(
      <div>
        <AnalysisWorkspace {...workspaceProps} />
        <AnalysisWorkspace {...workspaceProps} />
      </div>,
    )
    const liveButtons = view.getAllByRole("button", {
      name: "Position tiers",
    })
    fireEvent.click(liveButtons[0])
    fireEvent.click(liveButtons[1])
    view.getAllByRole("button", {name: /RB 2 tiered/})
      .forEach(button => fireEvent.click(button))
    expect(view.getAllByRole("button", {name: "Inspect one Player"}))
      .toHaveLength(2)
  })
})
