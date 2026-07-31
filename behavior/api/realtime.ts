import type {
  RealtimeClientSecretResponse,
  RealtimeMode,
} from "../realtime/contracts"

interface RealtimeApiOptions {
  apiHost?: string
  fetcher?: typeof fetch
}

export const createRealtimeClientSecret = async (
  draftSessionId: string,
  mode: RealtimeMode,
  {
    apiHost = process.env.NEXT_PUBLIC_API_HOST,
    fetcher = fetch,
  }: RealtimeApiOptions = {},
): Promise<RealtimeClientSecretResponse> => {
  if (!apiHost) {
    throw new Error("Drafty API is not configured")
  }
  const response = await fetcher(
    `${apiHost.replace(/\/$/, "")}/v1/realtime/client-secrets`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        draft_session_id: draftSessionId,
        mode,
      }),
    },
  )
  if (!response.ok) {
    let message = `Realtime broker returned ${response.status}`
    try {
      const body = await response.json() as { error?: string }
      if (body.error) message = body.error
    } catch {
      // The status-only error remains safe and actionable.
    }
    throw new Error(message)
  }
  return response.json() as Promise<RealtimeClientSecretResponse>
}
