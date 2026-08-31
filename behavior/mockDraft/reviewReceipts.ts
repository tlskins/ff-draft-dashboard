export const MOCK_REVIEW_RECEIPTS_KEY = "drafty.mock-review-receipts.v1"
export const MOCK_REVIEW_RECEIPTS_CHANGED_EVENT = "drafty:mock-review-receipts-changed"

export type MockReviewReceipts = Record<string, string>

const storageKey = (season: number): string => `${MOCK_REVIEW_RECEIPTS_KEY}:season:${season}`

const validSeason = (season: number): boolean => Number.isInteger(season)
  && season >= 2000
  && season <= 2100

const validReceipt = (mockId: string, reviewedAt: unknown): reviewedAt is string => (
  /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(mockId)
  && typeof reviewedAt === "string"
  && !Number.isNaN(Date.parse(reviewedAt))
)

export const readLocalMockReviewReceipts = (
  storage: Pick<Storage, "getItem">,
  season: number,
): MockReviewReceipts => {
  if (!validSeason(season)) return {}
  try {
    const raw = storage.getItem(storageKey(season))
    if (!raw) return {}
    const value = JSON.parse(raw) as unknown
    if (!value || typeof value !== "object" || Array.isArray(value)) return {}
    return Object.fromEntries(Object.entries(value)
      .filter(([mockId, reviewedAt]) => validReceipt(mockId, reviewedAt))
      .sort((left, right) => String(right[1]).localeCompare(String(left[1])))
      .slice(0, 100))
  } catch {
    return {}
  }
}

export const markLocalMockReviewReviewed = (
  storage: Pick<Storage, "getItem" | "setItem">,
  season: number,
  mockId: string,
  reviewedAt = new Date().toISOString(),
): MockReviewReceipts => {
  if (!validSeason(season) || !validReceipt(mockId, reviewedAt)) {
    throw new Error("Mock review receipt is invalid")
  }
  const current = readLocalMockReviewReceipts(storage, season)
  const next = Object.fromEntries(Object.entries({...current, [mockId]: reviewedAt})
    .sort((left, right) => right[1].localeCompare(left[1]))
    .slice(0, 100))
  storage.setItem(storageKey(season), JSON.stringify(next))
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(MOCK_REVIEW_RECEIPTS_CHANGED_EVENT, {
      detail: {season, mockId, reviewedAt},
    }))
  }
  return next
}
