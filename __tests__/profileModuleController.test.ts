import {
  selectProfileModule,
} from "../behavior/profile/profileModuleController"

const evidence = {
  hasDraftContext: true,
  historySeasonCount: 0,
  hasOutlook: false,
  hasPlayerNotes: false,
  statusImpact: "none" as const,
}

describe("adaptive player-profile module controller", () => {
  it("leads with draft context for rookies without NFL history", () => {
    expect(selectProfileModule(evidence)).toMatchObject({
      id: "draft_context",
      explanation: expect.stringContaining("no NFL production history"),
    })
  })

  it("leads with multi-season production when no actionable status exists", () => {
    expect(selectProfileModule({...evidence, historySeasonCount: 3})).toMatchObject({
      id: "production",
      explanation: expect.stringContaining("3 seasons"),
    })
  })

  it("puts material and review status evidence ahead of production", () => {
    expect(selectProfileModule({
      ...evidence,
      historySeasonCount: 3,
      hasOutlook: true,
      statusImpact: "material",
    }).id).toBe("outlook")
    expect(selectProfileModule({
      ...evidence,
      historySeasonCount: 3,
      statusImpact: "review",
    }).id).toBe("outlook")
  })

  it("uses a stable registry order to break equal scores", () => {
    const first = selectProfileModule(evidence)
    const second = selectProfileModule({...evidence})
    expect(second).toEqual(first)
  })
})
