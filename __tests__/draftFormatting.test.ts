import {getRoundAndPickShortText} from "../behavior/draft"

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
})
