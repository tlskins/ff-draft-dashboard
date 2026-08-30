import type {components as ApiComponents} from "./schema"


export type UserMockDraftPutRequest = ApiComponents["schemas"]["UserMockDraftPutRequest"]
export type UserMockDraftRecord = ApiComponents["schemas"]["UserMockDraftRecord"]
export type UserMockDraftListResponse = ApiComponents["schemas"]["UserMockDraftListResponse"]
export type UserMockDraftSummary = ApiComponents["schemas"]["UserMockDraftSummary"]

export interface UserMockDraftApiOptions {
  apiHost?: string
  fetcher?: typeof fetch
  token: string
  season: number
}

export class UserMockDraftApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: string,
  ) {
    super(message)
    this.name = "UserMockDraftApiError"
  }
}

const endpoint = (options: UserMockDraftApiOptions, mockId?: string): string => {
  const apiHost = options.apiHost || process.env.NEXT_PUBLIC_API_HOST
  if (!apiHost) throw new UserMockDraftApiError("Completed mock API is not configured")
  const item = mockId ? `/${encodeURIComponent(mockId)}` : ""
  return `${apiHost.replace(/\/$/, "")}/v1/me/mock-drafts${item}?season=${encodeURIComponent(String(options.season))}`
}

const request = async <Result>(
  options: UserMockDraftApiOptions,
  mockId?: string,
  init?: RequestInit,
): Promise<Result> => {
  let response: Response
  try {
    response = await (options.fetcher || fetch)(endpoint(options, mockId), {
      ...init,
      headers: {
        ...init?.headers,
        Authorization: `Bearer ${options.token}`,
      },
    })
  } catch (error) {
    throw new UserMockDraftApiError(
      error instanceof Error ? error.message : "Completed mock API is unavailable",
    )
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null) as {
      error?: string
      code?: string
    } | null
    throw new UserMockDraftApiError(
      body?.error || `Completed mock API returned ${response.status}`,
      response.status,
      body?.code,
    )
  }
  return response.json() as Promise<Result>
}

export const listUserMockDrafts = (
  options: UserMockDraftApiOptions,
): Promise<UserMockDraftListResponse> => request(options)

export const getUserMockDraft = (
  mockId: string,
  options: UserMockDraftApiOptions,
): Promise<UserMockDraftRecord> => request(options, mockId)

export const putUserMockDraft = (
  mockId: string,
  body: UserMockDraftPutRequest,
  options: UserMockDraftApiOptions,
): Promise<UserMockDraftRecord> => request(options, mockId, {
  method: "PUT",
  headers: {"Content-Type": "application/json"},
  body: JSON.stringify(body),
})
