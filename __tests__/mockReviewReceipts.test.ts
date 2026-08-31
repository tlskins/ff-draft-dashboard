import {
  markLocalMockReviewReviewed,
  readLocalMockReviewReceipts,
} from "../behavior/mockDraft/reviewReceipts"

describe("season-scoped mock review receipts", () => {
  beforeEach(() => localStorage.clear())

  it("records review state separately from immutable mock evidence", () => {
    expect(readLocalMockReviewReceipts(localStorage, 2026)).toEqual({})
    markLocalMockReviewReviewed(
      localStorage,
      2026,
      "mock-one",
      "2026-08-31T12:00:00Z",
    )
    expect(readLocalMockReviewReceipts(localStorage, 2026)).toEqual({
      "mock-one": "2026-08-31T12:00:00Z",
    })
    expect(readLocalMockReviewReceipts(localStorage, 2027)).toEqual({})
  })

  it("fails closed for malformed receipts", () => {
    expect(() => markLocalMockReviewReviewed(
      localStorage,
      2026,
      "has spaces",
      "not-a-date",
    )).toThrow("invalid")
  })
})
