export interface SeasonScopedStorageAdapter {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export const seasonStorageKey = (key: string, season: number): string => {
  if (!Number.isInteger(season) || season < 2000 || season > 2100) {
    throw new Error("Fantasy season must be an integer from 2000 through 2100")
  }
  return `${key}:season:${season}`
}

/** Namespace browser persistence by explicit fantasy season. */
export const seasonScopedStorage = (
  storage: SeasonScopedStorageAdapter,
  season: number,
): SeasonScopedStorageAdapter => ({
  getItem: key => storage.getItem(seasonStorageKey(key, season))
    ?? (season === 2026 ? storage.getItem(key) : null),
  setItem: (key, value) => storage.setItem(seasonStorageKey(key, season), value),
  removeItem: key => storage.removeItem(seasonStorageKey(key, season)),
})
