import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react"

import {
  ReadApiCache,
  ReadApiLoader,
  ReadApiResourceSnapshot,
} from "./readApiCache"


const fallbackCache = new ReadApiCache()
const ReadApiCacheContext = createContext<ReadApiCache | null>(null)

export const ReadApiProvider: React.FC<{
  cache?: ReadApiCache
  children: React.ReactNode
}> = ({cache, children}) => {
  const ownedCache = useRef<ReadApiCache | null>(null)
  if (!ownedCache.current) ownedCache.current = cache || new ReadApiCache()
  return (
    <ReadApiCacheContext.Provider value={ownedCache.current}>
      {children}
    </ReadApiCacheContext.Provider>
  )
}

export const useReadApiCache = (): ReadApiCache => (
  useContext(ReadApiCacheContext) || fallbackCache
)

interface UseReadApiResourceOptions<Data> {
  enabled?: boolean
  key: string
  loader: ReadApiLoader<Data>
  ttlMs: number
}

export const useReadApiResource = <Data,>({
  enabled = true,
  key,
  loader,
  ttlMs,
}: UseReadApiResourceOptions<Data>): ReadApiResourceSnapshot<Data> => {
  const cache = useReadApiCache()
  const subscribe = useCallback(
    (listener: () => void) => cache.subscribe(key, listener),
    [cache, key],
  )
  const getSnapshot = useCallback(
    () => cache.getSnapshot<Data>(key),
    [cache, key],
  )
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  useEffect(() => {
    if (!enabled) return
    void cache.load(key, loader, {ttlMs})
  }, [cache, enabled, key, loader, ttlMs])

  return snapshot
}

export const useStableReadApiLoader = <Data,>(
  loader: ReadApiLoader<Data>,
): ReadApiLoader<Data> => useMemo(() => loader, [loader])
