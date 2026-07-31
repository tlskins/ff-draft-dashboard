import {
  REALTIME_ADVISOR_EVAL_THRESHOLDS,
  percentile,
} from "../evals/realtimeAdvisorBaseline"
import {
  REALTIME_ADVISOR_TOOL_DEFINITIONS,
  REALTIME_ADVISOR_TOOL_NAMES,
} from "../behavior/realtime/contracts"
import {
  materializeCompletedDraftReplay,
  RecordedCompletedDraftReplay,
} from "../behavior/draft-advisor/completedDraftReplay"
import {
  createDraftRecommendations,
} from "../behavior/draft-advisor/recommendations"
import {
  createRosters,
  getPlayerMetrics,
  PlayerRanks,
} from "../behavior/draft"
import {
  decideDraftEventAdvice,
  DraftAdviceSnapshot,
} from "../behavior/realtime/eventAdvice"
import {
  createAnalysisViewProposal,
  createRealtimeAdvisorState,
  queueProposal,
  resolveProposal,
} from "../behavior/realtime/proposals"
import completedReplayFixture from "../__tests__/fixtures/completed-draft-replay.json"
import { FantasyPosition } from "../types"

const completedReplay =
  completedReplayFixture as unknown as RecordedCompletedDraftReplay

const snapshot = (
  overrides: Partial<DraftAdviceSnapshot> = {},
): DraftAdviceSnapshot => ({
  sourceEventCount: 20,
  currentPick: 21,
  nextUserPick: 27,
  picksUntilUserPick: 6,
  topCandidateId: "rb-1",
  topCandidateName: "Running Back One",
  topCandidatePosition: "RB",
  highestRunRisk: { position: "RB", probability: 0.4 },
  highestTierRisk: { position: "WR", probability: 0.4 },
  ...overrides,
})

describe("Realtime advisor contract baseline", () => {
  it("exposes only bounded, non-mutating model tools", () => {
    expect(REALTIME_ADVISOR_TOOL_NAMES).toEqual([
      "get_draft_state",
      "get_recommendations",
      "compare_players",
      "propose_analysis_view",
      "propose_draft_plan",
    ])
    expect(REALTIME_ADVISOR_TOOL_DEFINITIONS).toHaveLength(5)

    for (const tool of REALTIME_ADVISOR_TOOL_DEFINITIONS) {
      expect(tool.parameters).toMatchObject({
        type: "object",
        additionalProperties: false,
      })
      expect(tool.description.length).toBeGreaterThan(20)
      expect(tool.name).not.toContain("accept")
      expect(tool.name).not.toContain("reject")
      expect(tool.name).not.toContain("draft_player")
    }

    const compare = REALTIME_ADVISOR_TOOL_DEFINITIONS.find(tool =>
      tool.name === "compare_players")!
    expect(compare.parameters).toMatchObject({
      required: ["player_ids"],
      properties: {
        player_ids: {
          minItems: 2,
          maxItems: REALTIME_ADVISOR_EVAL_THRESHOLDS.maxToolArguments,
          uniqueItems: true,
        },
      },
    })
  })

  it("grounds every automatic prompt in a revision and deterministic reads", () => {
    const decision = decideDraftEventAdvice({
      previous: snapshot(),
      current: snapshot({
        sourceEventCount: 21,
        currentPick: 24,
        picksUntilUserPick: 3,
      }),
      lastPromptEventCount: null,
    })

    expect(decision).toMatchObject({
      trigger: "approaching_pick",
      sourceEventCount: 21,
    })
    expect(decision?.prompt).toContain("event 21")
    expect(decision?.prompt).toContain("get_draft_state")
    expect(decision?.prompt).toContain("get_recommendations")
    expect(decision?.prompt).toContain("at most two concise sentences")
    expect(decision?.prompt).toContain("unconfirmed proposal")
    expect(decision?.prompt).not.toContain("accept the proposal")
  })

  it("keeps the model-facing shortlist at three ranked deterministic candidates", () => {
    const replay = materializeCompletedDraftReplay(completedReplay)
    const available = Object.values(replay.playerLib)
    const byPosition = (position: FantasyPosition) => available
      .filter(player => player.position === position)
      .sort((left, right) =>
        getPlayerMetrics(left, replay.settings, replay.boardSettings).posRank
        - getPlayerMetrics(right, replay.settings, replay.boardSettings).posRank)
    const ranks: PlayerRanks = {
      QB: byPosition(FantasyPosition.QUARTERBACK),
      RB: byPosition(FantasyPosition.RUNNING_BACK),
      WR: byPosition(FantasyPosition.WIDE_RECEIVER),
      TE: byPosition(FantasyPosition.TIGHT_END),
      Purge: [],
      availPlayersByOverallRank: [...available],
      availPlayersByAdp: [...available],
    }
    const recommendations = createDraftRecommendations({
      settings: replay.settings,
      boardSettings: replay.boardSettings,
      rankingSummaries: replay.rankingSummaries,
      playerRanks: ranks,
      playerLib: replay.playerLib,
      roster: createRosters(replay.settings.numTeams)[
        completedReplay.targetRosterIndex
      ],
      currentPick: 1,
      myPickNum: completedReplay.targetRosterIndex + 1,
    })

    expect(recommendations.candidates).toHaveLength(
      REALTIME_ADVISOR_EVAL_THRESHOLDS.expectedRecommendationCount,
    )
    expect(recommendations.candidates.every(candidate => [
      FantasyPosition.QUARTERBACK,
      FantasyPosition.RUNNING_BACK,
      FantasyPosition.WIDE_RECEIVER,
      FantasyPosition.TIGHT_END,
    ].includes(candidate.player.position))).toBe(true)
  })

  it("limits ordinary interruptions while retaining an urgent on-clock alert", () => {
    const decisions = [
      decideDraftEventAdvice({
        previous: snapshot(),
        current: snapshot({
          sourceEventCount: 21,
          highestRunRisk: { position: "RB", probability: 0.7 },
        }),
        lastPromptEventCount: null,
        cooldownPicks:
          REALTIME_ADVISOR_EVAL_THRESHOLDS.normalAdviceCooldownPicks,
      }),
      decideDraftEventAdvice({
        previous: snapshot({
          sourceEventCount: 21,
          highestRunRisk: { position: "RB", probability: 0.7 },
        }),
        current: snapshot({
          sourceEventCount: 22,
          highestRunRisk: { position: "WR", probability: 0.7 },
        }),
        lastPromptEventCount: 21,
        cooldownPicks:
          REALTIME_ADVISOR_EVAL_THRESHOLDS.normalAdviceCooldownPicks,
      }),
      decideDraftEventAdvice({
        previous: snapshot({
          sourceEventCount: 22,
          picksUntilUserPick: 2,
        }),
        current: snapshot({
          sourceEventCount: 23,
          picksUntilUserPick: 1,
        }),
        lastPromptEventCount: 22,
        cooldownPicks:
          REALTIME_ADVISOR_EVAL_THRESHOLDS.normalAdviceCooldownPicks,
      }),
    ]
    const ordinary = decisions.filter(decision =>
      decision?.priority === "normal")

    expect(ordinary).toHaveLength(
      REALTIME_ADVISOR_EVAL_THRESHOLDS.maxNormalInterruptionsPerCooldown,
    )
    expect(decisions[1]).toBeNull()
    expect(decisions[2]).toMatchObject({
      trigger: "on_clock",
      priority: "urgent",
    })
  })

  it("requires explicit, current confirmation before a proposal has an effect", () => {
    const now = "2026-07-30T22:00:00Z"
    const state = createRealtimeAdvisorState("espn-session", 20, now)
    const proposal = createAnalysisViewProposal({
      id: "view-proposal",
      draftSessionId: "espn-session",
      sourceEventCount: 20,
      createdAt: now,
      view: "tier_landscape",
      explanation: "A deterministic tier cliff is material before the pick.",
    })
    const pending = queueProposal(state, proposal)

    const ambiguous = resolveProposal(
      pending,
      proposal.id,
      "ambiguous",
      20,
      now,
    )
    const stale = resolveProposal(
      pending,
      proposal.id,
      "accept",
      21,
      now,
    )

    expect(ambiguous.effect).toBeNull()
    expect(ambiguous.state).toEqual(pending)
    expect(stale.reason).toBe("stale")
    expect(stale.effect).toBeNull()
  })

  it("keeps deterministic event decision latency below the local gate", () => {
    const measurements = Array.from({ length: 200 }, (_, index) => {
      const start = performance.now()
      decideDraftEventAdvice({
        previous: snapshot({ sourceEventCount: index + 1 }),
        current: snapshot({
          sourceEventCount: index + 2,
          picksUntilUserPick: 3,
        }),
        lastPromptEventCount: null,
      })
      return performance.now() - start
    })

    expect(percentile(measurements, 0.95)).toBeLessThan(
      REALTIME_ADVISOR_EVAL_THRESHOLDS.deterministicDecisionP95Ms,
    )
  })
})
