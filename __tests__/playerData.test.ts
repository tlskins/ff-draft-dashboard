import {
  rankingsAgeInDays,
  rankingsAreStale,
} from "../behavior/playerData"
import { Rankings } from "../types"

const rankings = {
  cachedAt: "2026-07-01T00:00:00Z",
} as Rankings

describe("rankings freshness", () => {
  it("reports the age of the rankings snapshot", () => {
    expect(
      rankingsAgeInDays(
        rankings,
        Date.parse("2026-07-30T00:00:00Z"),
      ),
    ).toBe(29)
  })

  it("flags rankings older than the allowed age", () => {
    expect(
      rankingsAreStale(
        rankings,
        14,
        Date.parse("2026-07-30T00:00:00Z"),
      ),
    ).toBe(true)
  })
})
