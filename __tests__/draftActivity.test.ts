import {appendDraftActivity} from "../behavior/draftActivity"

describe("draft activity", () => {
  it("moves a repeated deterministic event to latest with its current evidence", () => {
    const result = appendDraftActivity([
      {id: "run-rb", label: "RB run", detail: "30%", tone: "warning", occurredAt: 1},
      {id: "pick-two", label: "Pick", tone: "neutral", occurredAt: 2},
    ], [
      {id: "run-rb", label: "RB run", detail: "55%", tone: "warning", occurredAt: 3},
    ])

    expect(result.map(item => item.id)).toEqual(["pick-two", "run-rb"])
    expect(result.at(-1)).toMatchObject({detail: "55%", occurredAt: 3})
  })
})
