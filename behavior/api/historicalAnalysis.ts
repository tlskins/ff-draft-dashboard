import type { components as ApiComponents } from "./schema"


export type AnalysisQuery =
  ApiComponents["schemas"]["AnalysisQuery"]
export type AnalysisQueryResponse =
  ApiComponents["schemas"]["AnalysisQueryResponse"]
export type AnalysisVisualization =
  ApiComponents["schemas"]["AnalysisVisualization"]
export type ScoringProfileId =
  ApiComponents["schemas"]["ScoringProfileId"]

export interface ExecuteHistoricalAnalysisOptions {
  apiHost?: string
  fetcher?: typeof fetch
  signal?: AbortSignal
}

export const executeHistoricalAnalysis = async (
  query: AnalysisQuery,
  {
    apiHost = process.env.NEXT_PUBLIC_API_HOST,
    fetcher,
    signal,
  }: ExecuteHistoricalAnalysisOptions = {},
): Promise<AnalysisQueryResponse> => {
  if (!apiHost) {
    throw new Error("Historical analysis API is not configured")
  }
  const response = await (fetcher || fetch)(
    `${apiHost.replace(/\/$/, "")}/v1/historical/query`,
    {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(query),
      signal,
    },
  )
  if (!response.ok) {
    const error = await response.json().catch(() => null) as {
      error?: string
    } | null
    throw new Error(
      error?.error ||
      `Historical analysis API returned ${response.status}`,
    )
  }
  return response.json() as Promise<AnalysisQueryResponse>
}
