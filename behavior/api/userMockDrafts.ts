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

const MOCK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/

const validateOptions = (
  options: UserMockDraftApiOptions,
  mockId?: string,
): string => {
  if (!Number.isInteger(options.season) || options.season < 2000 || options.season > 2100) {
    throw new UserMockDraftApiError("Completed mock API requires a fantasy season from 2000 through 2100")
  }
  const token = options.token.trim()
  if (!token) throw new UserMockDraftApiError("Completed mock API requires an authentication token")
  if (mockId !== undefined && (
    mockId.length < 1
    || mockId.length > 128
    || !MOCK_ID_PATTERN.test(mockId)
  )) {
    throw new UserMockDraftApiError("Completed mock API requires a valid stable mock ID")
  }
  return token
}

const endpoint = (options: UserMockDraftApiOptions, mockId?: string): string => {
  validateOptions(options, mockId)
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
  const token = validateOptions(options, mockId)
  let response: Response
  try {
    response = await (options.fetcher || fetch)(endpoint(options, mockId), {
      ...init,
      headers: {
        ...init?.headers,
        Authorization: `Bearer ${token}`,
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
