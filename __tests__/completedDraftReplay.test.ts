import fixture from "./fixtures/completed-draft-replay.json"
import {
  RecordedCompletedDraftReplay,
  runCompletedDraftReplay,
} from "../behavior/draft-advisor/completedDraftReplay"
import { getRosterIndexForPick } from "../behavior/draft-feed/session"

const replay = fixture as unknown as RecordedCompletedDraftReplay

describe("completed draft replay", () => {
  it("records valid snake ownership for every pick", () => {
    replay.actualPicks.forEach(pick => {
      expect(pick.rosterIndex).toBe(getRosterIndexForPick(
        pick.overallPick,
        replay.settings.numTeams,
      ))
    })
  })

  it.each([
    "combined",
    "adp_only",
    "need_only",
    "rank_only",
  ] as const)("produces a deterministic legal %s roster", strategy => {
    const first = runCompletedDraftReplay(replay, strategy)
    const repeated = runCompletedDraftReplay(replay, strategy)

    expect(first.selectedPlayerIds).toEqual(repeated.selectedPlayerIds)
    expect(first.quality).toEqual(repeated.quality)
    expect(first.quality.legal).toBe(true)
    expect(first.selectedPlayerIds).toHaveLength(6)
    expect(first.positionalRankViolations).toBe(0)
  })
})
