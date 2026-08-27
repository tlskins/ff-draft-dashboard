import {
  readStoredPlayerTargets,
  serializePlayerTargets,
  validateStoredPlayerTargets,
} from "../behavior/playerTargetStorage"

describe("player target browser storage", () => {
  it("round-trips the existing target payload shape", () => {
    const targets = [
      {playerId: "12345", targetAsEarlyAsRound: 3},
      {playerId: "player-slug", targetAsEarlyAsRound: 11},
    ]
    expect(readStoredPlayerTargets(serializePlayerTargets(targets))).toEqual({
      status: "ready",
      targets,
    })
  })

  it.each([
    null,
    {},
    [{playerId: "", targetAsEarlyAsRound: 2}],
    [{playerId: "1", targetAsEarlyAsRound: 0}],
    [{playerId: "1", targetAsEarlyAsRound: 2, extra: true}],
    [
      {playerId: "1", targetAsEarlyAsRound: 2},
      {playerId: "1", targetAsEarlyAsRound: 3},
    ],
  ])("rejects malformed target data without partially accepting it", value => {
    expect(() => validateStoredPlayerTargets(value)).toThrow()
  })

  it("reports invalid JSON as rejected and a missing key as missing", () => {
    expect(readStoredPlayerTargets("{")).toMatchObject({status: "rejected", targets: []})
    expect(readStoredPlayerTargets(null)).toEqual({status: "missing", targets: []})
  })
})
