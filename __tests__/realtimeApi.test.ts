import {
  createRealtimeClientSecret,
} from "../behavior/api/realtime"

describe("realtime broker API adapter", () => {
  it("requests a bounded client secret without browser-owned configuration", async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        value: "ek_test",
        expires_at: 1785373200,
        draft_session_id: "espn-session",
        realtime_session_id: "sess_test",
        mode: "text",
        model: "gpt-realtime",
      }),
    })

    const result = await createRealtimeClientSecret(
      "espn-session",
      "text",
      {
        apiHost: "http://127.0.0.1:5000/",
        fetcher: fetcher as unknown as typeof fetch,
      },
    )

    expect(result.value).toBe("ek_test")
    expect(fetcher).toHaveBeenCalledWith(
      "http://127.0.0.1:5000/v1/realtime/client-secrets",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          draft_session_id: "espn-session",
          mode: "text",
        }),
      }),
    )
  })

  it("fails closed when the local API is not configured", async () => {
    await expect(createRealtimeClientSecret(
      "espn-session",
      "text",
      {
        apiHost: "",
        fetcher: jest.fn() as unknown as typeof fetch,
      },
    )).rejects.toThrow("Drafty API is not configured")
  })

  it("surfaces the broker's sanitized error", async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({
        error: "OpenAI Realtime is not configured",
      }),
    })

    await expect(createRealtimeClientSecret(
      "espn-session",
      "voice",
      {
        apiHost: "http://127.0.0.1:5000",
        fetcher: fetcher as unknown as typeof fetch,
      },
    )).rejects.toThrow("OpenAI Realtime is not configured")
  })
})
