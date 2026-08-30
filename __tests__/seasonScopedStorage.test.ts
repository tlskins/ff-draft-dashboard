import {seasonScopedStorage, seasonStorageKey} from "../behavior/seasonScopedStorage"


describe("season-scoped browser persistence", () => {
  beforeEach(() => localStorage.clear())

  it("copies legacy reads into 2026 authority without deleting the source", () => {
    localStorage.setItem("profile", "legacy-2026")
    const storage = seasonScopedStorage(localStorage, 2026)
    expect(storage.getItem("profile")).toBe("legacy-2026")
    storage.setItem("profile", "season-2026")
    expect(localStorage.getItem("profile")).toBe("legacy-2026")
    expect(localStorage.getItem(seasonStorageKey("profile", 2026))).toBe("season-2026")
    expect(storage.getItem("profile")).toBe("season-2026")
  })

  it("never leaks a legacy or another-season value into a later season", () => {
    localStorage.setItem("profile", "legacy-2026")
    seasonScopedStorage(localStorage, 2026).setItem("profile", "season-2026")
    expect(seasonScopedStorage(localStorage, 2027).getItem("profile")).toBeNull()
    seasonScopedStorage(localStorage, 2027).setItem("profile", "season-2027")
    expect(seasonScopedStorage(localStorage, 2026).getItem("profile")).toBe("season-2026")
    expect(seasonScopedStorage(localStorage, 2027).getItem("profile")).toBe("season-2027")
  })

  it("rejects invalid season namespaces", () => {
    expect(() => seasonStorageKey("profile", 1999)).toThrow(/Fantasy season/)
    expect(() => seasonStorageKey("profile", 2026.5)).toThrow(/Fantasy season/)
  })
})
