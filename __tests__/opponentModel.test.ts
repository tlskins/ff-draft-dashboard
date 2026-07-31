import fixture from "./fixtures/opponent-model-replay.json"
import {
  createOpponentForecast,
  probabilityOfAtLeast,
} from "../behavior/draft-advisor/opponentModel"
import type {
  OpponentReplayCase,
} from "../behavior/draft-advisor/replayMetrics"

const cases = fixture.cases as unknown as OpponentReplayCase[]

describe("probabilistic opponent model", () => {
  it("calculates exact at-least probabilities", () => {
    expect(probabilityOfAtLeast([0.5, 0.5], 1)).toBeCloseTo(0.75)
    expect(probabilityOfAtLeast([0.5, 0.5], 2)).toBeCloseTo(0.25)
    expect(probabilityOfAtLeast([0.5], 2)).toBe(0)
  })

  it("stops forecasts before the user's pick and normalizes output", () => {
    const replay = cases[0]
    const forecast = createOpponentForecast(replay.context, {
      model: "combined",
      targetRosterIndex: replay.targetRosterIndex,
    })

    expect(forecast.picks.map(pick => pick.overallPick)).toEqual([2, 3])
    forecast.picks.forEach(pick => {
      expect(pick.positionProbabilities.reduce(
        (sum, item) => sum + item.probability,
        0,
      )).toBeCloseTo(1)
      pick.positionProbabilities.forEach(item => {
        expect(item.probability).toBeGreaterThanOrEqual(0)
        expect(item.probability).toBeLessThanOrEqual(1)
      })
    })
  })

  it("reports run and configured user-tier boundary probabilities", () => {
    const replay = cases[2]
    const first = createOpponentForecast(replay.context, {
      model: "combined",
      targetRosterIndex: replay.targetRosterIndex,
    })
    const repeated = createOpponentForecast(replay.context, {
      model: "combined",
      targetRosterIndex: replay.targetRosterIndex,
    })
    const rbRun = first.runProbabilities.find(run =>
      run.position === "RB")
    const rbBoundary = first.tierBoundaryProbabilities.find(boundary =>
      boundary.position === "RB")

    expect(first).toEqual(repeated)
    expect(rbRun?.minimumPicks).toBe(3)
    expect(rbRun?.probability).toBeGreaterThan(0)
    expect(rbBoundary).toMatchObject({
      userTier: 1,
      playerIds: ["rb-run-1", "rb-run-2", "rb-run-3", "rb-run-4"],
    })
    expect(rbBoundary?.probability).toBeGreaterThanOrEqual(0)
    expect(rbBoundary?.probability).toBeLessThanOrEqual(1)
  })
})
