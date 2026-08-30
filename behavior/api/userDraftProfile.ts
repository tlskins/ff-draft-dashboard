import type {components as ApiComponents} from "./schema"


export type UserDraftProfileRecord =
  ApiComponents["schemas"]["UserDraftProfileRecord"]
export type UserDraftProfilePutRequest =
  ApiComponents["schemas"]["UserDraftProfilePutRequest"]

export interface UserDraftProfileApiOptions {
  apiHost?: string
  fetcher?: typeof fetch
  token: string
  season?: number
}

export class UserDraftProfileApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: string,
    public readonly currentRevision?: number,
  ) {
    super(message)
    this.name = "UserDraftProfileApiError"
  }
}

const request = async (
  options: UserDraftProfileApiOptions,
  init?: RequestInit,
): Promise<UserDraftProfileRecord> => {
  const apiHost = options.apiHost || process.env.NEXT_PUBLIC_API_HOST
  if (!apiHost) throw new UserDraftProfileApiError("Cloud profile API is not configured")
  let response: Response
  try {
    response = await (options.fetcher || fetch)(
      `${apiHost.replace(/\/$/, "")}/v1/me/draft-profile?season=${encodeURIComponent(String(options.season ?? 2026))}`,
      {
        ...init,
        headers: {
          ...init?.headers,
          Authorization: `Bearer ${options.token}`,
        },
      },
    )
  } catch (error) {
    throw new UserDraftProfileApiError(
      error instanceof Error ? error.message : "Cloud profile API is unavailable",
    )
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null) as {
      error?: string
      code?: string
      current_revision?: number
    } | null
    throw new UserDraftProfileApiError(
      body?.error || `Cloud profile API returned ${response.status}`,
      response.status,
      body?.code,
      body?.current_revision,
    )
  }
  return response.json() as Promise<UserDraftProfileRecord>
}

export const getUserDraftProfile = (
  options: UserDraftProfileApiOptions,
) => request(options)

export const putUserDraftProfile = (
  body: UserDraftProfilePutRequest,
  options: UserDraftProfileApiOptions,
) => request(options, {
  method: "PUT",
  headers: {"Content-Type": "application/json"},
  body: JSON.stringify(body),
})
