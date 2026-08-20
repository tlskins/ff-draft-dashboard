describe("production API build authority", () => {
  const originalProductionHost = process.env.DRAFTY_PRODUCTION_API_HOST
  const originalPublicHost = process.env.NEXT_PUBLIC_API_HOST

  afterEach(() => {
    process.env.DRAFTY_PRODUCTION_API_HOST = originalProductionHost
    process.env.NEXT_PUBLIC_API_HOST = originalPublicHost
    jest.resetModules()
  })

  it("prefers the reviewed production host over a stale platform value", () => {
    process.env.DRAFTY_PRODUCTION_API_HOST = "https://drafty-api.example.run.app"
    process.env.NEXT_PUBLIC_API_HOST = "http://127.0.0.1:5000"
    jest.resetModules()

    const config = require("../next.config.js")

    expect(config.env.NEXT_PUBLIC_API_HOST).toBe(
      "https://drafty-api.example.run.app",
    )
  })

  it("retains the local public host when no production authority is present", () => {
    delete process.env.DRAFTY_PRODUCTION_API_HOST
    process.env.NEXT_PUBLIC_API_HOST = "http://127.0.0.1:5000"
    jest.resetModules()

    const config = require("../next.config.js")

    expect(config.env.NEXT_PUBLIC_API_HOST).toBe("http://127.0.0.1:5000")
  })
})
