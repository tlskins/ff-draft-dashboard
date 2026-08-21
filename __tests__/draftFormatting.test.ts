import {getRankRoundsAheadOfAdp, getRoundAndPickShortText} from "../behavior/draft"

describe("draft slot formatting", () => {
  it("maps overall picks to legal one-based round slots", () => {
    expect(getRoundAndPickShortText(1, 12)).toBe("1.1")
    expect(getRoundAndPickShortText(12, 12)).toBe("1.12")
    expect(getRoundAndPickShortText(13, 12)).toBe("2.1")
    expect(getRoundAndPickShortText(100.28, 12)).toBe("9.4")
  })

  it("fails safely for invalid league sizes", () => {
    expect(getRoundAndPickShortText(10, 0)).toBe("—")
  })

  it("reports configured rank rounds ahead of ADP with the user-facing sign", () => {
    expect(getRankRoundsAheadOfAdp(49, 73, 12)).toBe(2)
    expect(getRankRoundsAheadOfAdp(73, 49, 12)).toBe(-2)
    expect(getRankRoundsAheadOfAdp(49, 55, 12)).toBe(0)
    expect(getRankRoundsAheadOfAdp(undefined, 73, 12)).toBeNull()
  })
})
