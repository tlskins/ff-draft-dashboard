import {
  decideDraftEventAdvice,
  DraftAdviceSnapshot,
} from "../behavior/realtime/eventAdvice"

const snapshot = (
  overrides: Partial<DraftAdviceSnapshot> = {},
): DraftAdviceSnapshot => ({
  sourceEventCount: 10,
  currentPick: 11,
  nextUserPick: 17,
  picksUntilUserPick: 6,
  topCandidateId: "rb-1",
  topCandidateName: "Running Back One",
  topCandidatePosition: "RB",
  highestRunRisk: {
    position: "RB",
    probability: 0.4,
  },
  highestTierRisk: {
    position: "WR",
    probability: 0.4,
  },
  ...overrides,
})

describe("low-interruption draft event advice", () => {
  it("prompts when the user crosses into the approaching-pick window", () => {
    const decision = decideDraftEventAdvice({
      previous: snapshot(),
      current: snapshot({
        sourceEventCount: 11,
        currentPick: 14,
        picksUntilUserPick: 3,
      }),
      lastPromptEventCount: null,
    })

    expect(decision).toMatchObject({
      trigger: "approaching_pick",
      priority: "normal",
      sourceEventCount: 11,
    })
    expect(decision?.prompt).toContain("get_draft_state")
    expect(decision?.prompt).toContain("unconfirmed proposal")
  })

  it("prioritizes a new tier cliff over a positional run", () => {
    const decision = decideDraftEventAdvice({
      previous: snapshot(),
      current: snapshot({
        sourceEventCount: 11,
        highestRunRisk: {
          position: "RB",
          probability: 0.7,
        },
        highestTierRisk: {
          position: "WR",
          probability: 0.75,
        },
      }),
      lastPromptEventCount: null,
    })

    expect(decision).toMatchObject({
      trigger: "tier_cliff",
      reason: "WR tier-cliff risk rose to 75%.",
    })
  })

  it("applies cooldowns to normal advice but not an on-clock alert", () => {
    const cooledDown = decideDraftEventAdvice({
      previous: snapshot(),
      current: snapshot({
        sourceEventCount: 11,
        highestRunRisk: {
          position: "RB",
          probability: 0.7,
        },
      }),
      lastPromptEventCount: 10,
    })
    const urgent = decideDraftEventAdvice({
      previous: snapshot({
        sourceEventCount: 11,
        picksUntilUserPick: 2,
      }),
      current: snapshot({
        sourceEventCount: 12,
        picksUntilUserPick: 1,
      }),
      lastPromptEventCount: 11,
    })

    expect(cooledDown).toBeNull()
    expect(urgent).toMatchObject({
      trigger: "on_clock",
      priority: "urgent",
    })
  })

  it("does not prompt for duplicate revisions or ordinary picks", () => {
    expect(decideDraftEventAdvice({
      previous: snapshot(),
      current: snapshot(),
      lastPromptEventCount: null,
    })).toBeNull()
    expect(decideDraftEventAdvice({
      previous: snapshot(),
      current: snapshot({
        sourceEventCount: 11,
        currentPick: 12,
        picksUntilUserPick: 5,
      }),
      lastPromptEventCount: null,
    })).toBeNull()
  })
})
