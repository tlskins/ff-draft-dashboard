import React from "react"
import {renderHook} from "@testing-library/react"

import {ReadApiProvider} from "../behavior/api/readApiContext"
import {useInsightReadEvidence} from "../behavior/hooks/useInsightReadEvidence"


describe("insight read evidence", () => {
  const apiHost = process.env.NEXT_PUBLIC_API_HOST
  const historicalEnabled = process.env.NEXT_PUBLIC_HISTORICAL_COMPARISON_ENABLED

  afterEach(() => {
    process.env.NEXT_PUBLIC_API_HOST = apiHost
    process.env.NEXT_PUBLIC_HISTORICAL_COMPARISON_ENABLED = historicalEnabled
  })

  it("fails closed instead of loading forever when the read API is unconfigured", () => {
    process.env.NEXT_PUBLIC_API_HOST = ""
    process.env.NEXT_PUBLIC_HISTORICAL_COMPARISON_ENABLED = "true"
    const wrapper = ({children}: {children: React.ReactNode}) => (
      <ReadApiProvider>{children}</ReadApiProvider>
    )

    const {result} = renderHook(() => useInsightReadEvidence({
      playerIds: ["4429160"],
      scoringProfile: "ppr",
    }), {wrapper})

    expect(result.current.history.state).toBe("unavailable")
    expect(result.current.history.unavailableReason)
      .toBe("Data-readiness API is not configured")
  })

  it("names an explicitly disabled deployment without starting a request", () => {
    process.env.NEXT_PUBLIC_API_HOST = ""
    process.env.NEXT_PUBLIC_HISTORICAL_COMPARISON_ENABLED = "false"
    const wrapper = ({children}: {children: React.ReactNode}) => (
      <ReadApiProvider>{children}</ReadApiProvider>
    )

    const {result} = renderHook(() => useInsightReadEvidence({
      playerIds: ["4429160"],
      scoringProfile: "ppr",
    }), {wrapper})

    expect(result.current.history.state).toBe("unavailable")
    expect(result.current.history.unavailableReason)
      .toBe("Historical comparison is disabled for this deployment.")
  })
})
