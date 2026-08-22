import {
  overallRankFor,
  positionRankFor,
  positionTierFor,
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
  halfPprOverallRank: 20,
  halfPprPositionRank: 8,
  halfPprPositionTier: {tierNumber: 2},
  pprOverallRank: 10,
  pprPositionRank: 4,
  pprPositionTier: {tierNumber: 1},
}

describe("three-profile scoring authority", () => {
  it("reads explicit half-PPR ranks and tiers without treating them as PPR", () => {
    expect(overallRankFor(ranking as never, "half_ppr")).toBe(20)
    expect(positionRankFor(ranking as never, "half_ppr")).toBe(8)
    expect(positionTierFor(ranking as never, "half_ppr")?.tierNumber).toBe(2)
  })

  it("keeps legacy ppr compatible while making the explicit format authoritative", () => {
    expect(scoringFormatFor({ppr: true})).toBe("ppr")
    expect(scoringFormatFor({ppr: true, scoringFormat: "half_ppr"})).toBe("half_ppr")
    const half = settingsWithScoringFormat({ppr: false} as never, "half_ppr")
    expect(half).toMatchObject({ppr: true, scoringFormat: "half_ppr"})
  })
})
