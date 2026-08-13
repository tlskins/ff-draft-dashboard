import {useEffect, useState} from "react"

import type {components as ApiComponents} from "./schema"


export type DataReadinessResponse =
  ApiComponents["schemas"]["DataReadinessResponse"]
export type CompletedSeasonWindowSize = 1 | 3 | 5

export interface CompletedSeasonWindow {
  size: CompletedSeasonWindowSize
  seasons: number[]
  label: string
}

interface LoadDataReadinessOptions {
  apiHost?: string
  fetcher?: typeof fetch
}

export const formatSeasonList = (seasons: number[]): string => {
  if (seasons.length === 0) return "No completed seasons"
  if (seasons.length === 1) return String(seasons[0])
  const contiguous = seasons.every((season, index) => (
    index === 0 || season === seasons[index - 1] + 1
  ))
  return contiguous
    ? `${seasons[0]}–${seasons[seasons.length - 1]}`
    : seasons.join(", ")
}

export const buildCompletedSeasonWindows = (
  readiness: DataReadinessResponse,
): CompletedSeasonWindow[] => {
  const completed = Array.from(new Set(
    readiness.imported_weekly_seasons
      .filter(source => source.classification === "completed")
      .map(source => source.season),
  )).sort((left, right) => left - right)

  return ([1, 3, 5] as CompletedSeasonWindowSize[])
    .filter(size => completed.length >= size)
    .map(size => {
      const seasons = completed.slice(-size)
      return {size, seasons, label: formatSeasonList(seasons)}
    })
}

export const loadDataReadiness = async ({
  apiHost = process.env.NEXT_PUBLIC_API_HOST,
  fetcher,
}: LoadDataReadinessOptions = {}): Promise<DataReadinessResponse> => {
  if (!apiHost) {
    throw new Error("Data-readiness API is not configured")
  }
  const response = await (fetcher || fetch)(
    `${apiHost.replace(/\/$/, "")}/v1/data-readiness`,
  )
  if (!response.ok) {
    throw new Error(`Data-readiness API returned ${response.status}`)
  }
  return response.json() as Promise<DataReadinessResponse>
}

export interface DataReadinessState {
  data: DataReadinessResponse | null
  error: string | null
  loading: boolean
}

export const useDataReadiness = (): DataReadinessState => {
  const [state, setState] = useState<DataReadinessState>({
    data: null,
    error: null,
    loading: true,
  })

  useEffect(() => {
    let cancelled = false
    loadDataReadiness()
      .then(data => {
        if (!cancelled) setState({data, error: null, loading: false})
      })
      .catch((error: Error) => {
        if (!cancelled) {
          setState({data: null, error: error.message, loading: false})
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  return state
}
