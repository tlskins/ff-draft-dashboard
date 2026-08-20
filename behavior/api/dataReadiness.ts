import type {components as ApiComponents} from "./schema"
import {useReadApiResource} from "./readApiContext"
import type {
  ReadApiLoader,
  ReadApiResourceState,
} from "./readApiCache"


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
  signal?: AbortSignal
}

export const DATA_READINESS_RESOURCE_KEY = "read-api:data-readiness:v1"
export const DATA_READINESS_TTL_MS = 15 * 60 * 1000

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
  signal,
}: LoadDataReadinessOptions = {}): Promise<DataReadinessResponse> => {
  if (!apiHost) {
    throw new Error("Data-readiness API is not configured")
  }
  const request = fetcher || fetch
  const url = `${apiHost.replace(/\/$/, "")}/v1/data-readiness`
  const response = signal
    ? await request(url, {signal})
    : await request(url)
  if (!response.ok) {
    throw new Error(`Data-readiness API returned ${response.status}`)
  }
  return response.json() as Promise<DataReadinessResponse>
}

export interface DataReadinessState {
  data: DataReadinessResponse | null
  error: string | null
  loading: boolean
  resourceState?: ReadApiResourceState
  staleReason?: string
  unavailableReason?: string
  updatedAt?: number | null
}

const readinessLoader: ReadApiLoader<DataReadinessResponse> = ({signal}) => (
  loadDataReadiness({signal})
)

export const useDataReadiness = (): DataReadinessState => {
  const configured = Boolean(process.env.NEXT_PUBLIC_API_HOST)
  const resource = useReadApiResource({
    enabled: configured,
    key: DATA_READINESS_RESOURCE_KEY,
    loader: readinessLoader,
    ttlMs: DATA_READINESS_TTL_MS,
  })
  return {
    data: resource.data,
    error: configured ? resource.error : "Data-readiness API is not configured",
    loading: configured
      && (resource.state === "idle" || resource.state === "loading"),
    resourceState: configured ? resource.state : "unavailable",
    staleReason: resource.staleReason,
    unavailableReason: resource.unavailableReason,
    updatedAt: resource.updatedAt,
  }
}
