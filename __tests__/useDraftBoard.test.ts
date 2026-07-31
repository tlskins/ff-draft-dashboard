import { act, renderHook } from "@testing-library/react"
import { useDraftBoard } from "../behavior/hooks/useDraftBoard"

describe("useDraftBoard authoritative draft metadata", () => {
  it("applies accepted source format after the manual settings lock begins", () => {
    const { result } = renderHook(() => useDraftBoard({
      defaultNumTeams: 12,
      defaultMyPickNum: 6,
    }))

    act(() => result.current.setDraftStarted(true))
    act(() => result.current.setNumTeams(10))
    expect(result.current.settings.numTeams).toBe(12)

    act(() => result.current.applyAuthoritativeDraftSettings({
      numTeams: 10,
      ppr: true,
    }))

    expect(result.current.settings).toMatchObject({
      numTeams: 10,
      ppr: true,
    })
  })
})
