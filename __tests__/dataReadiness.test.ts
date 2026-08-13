import {
  buildCompletedSeasonWindows,
  formatSeasonList,
  loadDataReadiness,
} from "../behavior/api/dataReadiness"
import {completedDataReadiness} from "../test-support/dataReadiness"


describe("data-readiness API client", () => {
  it("loads the versioned readiness endpoint", async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => completedDataReadiness,
    })

    const result = await loadDataReadiness({
      apiHost: "http://127.0.0.1:5000/",
      fetcher: fetcher as unknown as typeof fetch,
    })

    expect(fetcher).toHaveBeenCalledWith(
      "http://127.0.0.1:5000/v1/data-readiness",
    )
    expect(result).toEqual(completedDataReadiness)
  })

  it("builds only 1/3/5 windows from completed seasons", () => {
    const readiness = {
      ...completedDataReadiness,
      imported_weekly_seasons: [2018, 2020, 2022, 2025].map(season => ({
        ...completedDataReadiness.imported_weekly_seasons[0],
        season,
        fingerprint: `weekly-${season}`,
      })).concat([{
        ...completedDataReadiness.imported_weekly_seasons[0],
        season: 2026,
        classification: "current_partial" as const,
        fingerprint: "weekly-2026",
      }]),
    }

    expect(buildCompletedSeasonWindows(readiness)).toEqual([
      {size: 1, seasons: [2025], label: "2025"},
      {
        size: 3,
        seasons: [2020, 2022, 2025],
        label: "2020, 2022, 2025",
      },
    ])
  })

  it("formats contiguous and non-contiguous returned seasons honestly", () => {
    expect(formatSeasonList([2023, 2024, 2025])).toBe("2023–2025")
    expect(formatSeasonList([2021, 2023, 2025])).toBe("2021, 2023, 2025")
  })
})
