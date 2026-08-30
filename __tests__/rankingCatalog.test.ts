import {
  fallbackExpertRanker,
  publishedExpertRankers,
  selectableExpertRankers,
} from "../behavior/rankingCatalog"
import {FantasyPosition, NFLTeam, ThirdPartyRanker} from "../types"


const player = {
  id: "1",
  firstName: "Puka",
  lastName: "Nacua",
  fullName: "Puka Nacua",
  team: NFLTeam.LAR,
  position: FantasyPosition.WIDE_RECEIVER,
  historicalStats: {},
  ranks: {
    Harris: {
      playerId: "1", ranker: "Harris", position: FantasyPosition.WIDE_RECEIVER,
      standardPositionRank: 1, pprPositionRank: 1,
    },
    "Matt Harmon": {
      playerId: "1", ranker: "Matt Harmon", position: FantasyPosition.WIDE_RECEIVER,
      halfPprPositionRank: 1, pprPositionRank: 2,
    },
    "Josh Norris": {
      playerId: "1", ranker: "Josh Norris", position: FantasyPosition.WIDE_RECEIVER,
      halfPprPositionRank: 3,
    },
  },
}

const rankings = {
  players: [player],
  allThirdPartyRankers: ["Harris", "Matt Harmon", "Josh Norris", "Ghost"],
}

describe("ranking catalog authority", () => {
  it("retains only separately published boards with observed player data", () => {
    expect(publishedExpertRankers(rankings)).toEqual([
      "Harris", "Matt Harmon", "Josh Norris",
    ])
  })

  it("filters sources that do not publish the active scoring format", () => {
    expect(selectableExpertRankers(rankings, {ppr: true})).toEqual([
      "Harris", "Matt Harmon", ThirdPartyRanker.CUSTOM,
    ])
    expect(selectableExpertRankers(rankings, {ppr: false})).toEqual([
      "Harris", ThirdPartyRanker.CUSTOM,
    ])
    expect(selectableExpertRankers(rankings, {
      ppr: true,
      scoringFormat: "half_ppr",
    })).toEqual([
      "Harris", "Matt Harmon", "Josh Norris", ThirdPartyRanker.CUSTOM,
    ])
  })

  it("chooses the first compatible published board as a safe fallback", () => {
    expect(fallbackExpertRanker({
      players: [player],
      allThirdPartyRankers: ["Matt Harmon", "Harris"],
    }, {ppr: true})).toBe("Matt Harmon")
    expect(fallbackExpertRanker({
      players: [player],
      allThirdPartyRankers: ["Harris"],
    }, {ppr: true, scoringFormat: "half_ppr"})).toBe("Harris")
  })
})
