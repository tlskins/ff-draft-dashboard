import {
  overallRankFor,
  positionRankFor,
  positionTierFor,
  metricValueFor,
  scoringFormatFor,
  settingsWithScoringFormat,
} from "../behavior/scoringFormat"


const ranking = {
  playerId: "1",
  ranker: "Expert",
  position: "WR" as never,
  standardOverallRank: 30,
  standardPositionRank: 12,
  standardPositionTier: {tierNumber: 3},
  metricValueStd: 100,
  halfPprOverallRank: 20,
  halfPprPositionRank: 8,
  halfPprPositionTier: {tierNumber: 2},
  metricValueHalfPpr: 120,
  pprOverallRank: 10,
  pprPositionRank: 4,
  pprPositionTier: {tierNumber: 1},
  metricValuePpr: 140,
}

describe("three-profile scoring authority", () => {
  it("reads explicit half-PPR ranks and tiers without treating them as PPR", () => {
    expect(overallRankFor(ranking as never, "half_ppr")).toBe(20)
    expect(positionRankFor(ranking as never, "half_ppr")).toBe(8)
    expect(positionTierFor(ranking as never, "half_ppr")?.tierNumber).toBe(2)
    expect(metricValueFor(ranking as never, "half_ppr")).toBe(120)
  })

  it("falls back to a published PPR board when a source has no dedicated half-PPR fields", () => {
    const published = {
      ...ranking,
      halfPprOverallRank: undefined,
      halfPprPositionRank: undefined,
      halfPprPositionTier: undefined,
      metricValueHalfPpr: undefined,
    }
    expect(overallRankFor(published as never, "half_ppr")).toBe(10)
    expect(positionRankFor(published as never, "half_ppr")).toBe(4)
    expect(positionTierFor(published as never, "half_ppr")?.tierNumber).toBe(1)
    expect(metricValueFor(published as never, "half_ppr")).toBe(140)
  })

  it("uses Standard as the final half-PPR compatibility fallback", () => {
    const standardOnly = {
      ...ranking,
      halfPprOverallRank: undefined,
      halfPprPositionRank: undefined,
      halfPprPositionTier: undefined,
      metricValueHalfPpr: undefined,
      pprOverallRank: undefined,
      pprPositionRank: undefined,
      pprPositionTier: undefined,
      metricValuePpr: undefined,
    }
    expect(overallRankFor(standardOnly as never, "half_ppr")).toBe(30)
    expect(positionRankFor(standardOnly as never, "half_ppr")).toBe(12)
    expect(positionTierFor(standardOnly as never, "half_ppr")?.tierNumber).toBe(3)
    expect(metricValueFor(standardOnly as never, "half_ppr")).toBe(100)
  })

  it("keeps legacy ppr compatible while making the explicit format authoritative", () => {
    expect(scoringFormatFor({ppr: true})).toBe("ppr")
    expect(scoringFormatFor({ppr: true, scoringFormat: "half_ppr"})).toBe("half_ppr")
    const half = settingsWithScoringFormat({ppr: false} as never, "half_ppr")
    expect(half).toMatchObject({ppr: true, scoringFormat: "half_ppr"})
  })
})
