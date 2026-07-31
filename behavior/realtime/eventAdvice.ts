import type {
  RealtimeToolContext,
} from "./toolDispatcher"

export type DraftAdviceTrigger =
  | "on_clock"
  | "approaching_pick"
  | "tier_cliff"
  | "positional_run"
  | "top_choice_changed"

export interface DraftAdviceSnapshot {
  sourceEventCount: number
  currentPick: number
  nextUserPick: number
  picksUntilUserPick: number
  topCandidateId: string | null
  topCandidateName: string | null
  topCandidatePosition: string | null
  highestRunRisk: {
    position: string
    probability: number
  } | null
  highestTierRisk: {
    position: string
    probability: number
  } | null
}

export interface DraftAdviceDecision {
  trigger: DraftAdviceTrigger
  priority: "normal" | "urgent"
  reason: string
  prompt: string
  sourceEventCount: number
}

const highestCandidateRisk = (
  context: RealtimeToolContext,
  field: "positionalRunProbability" | "tierBoundaryProbability",
): {
  position: string
  probability: number
} | null => {
  const candidate = [...context.recommendations.candidates]
    .sort((left, right) =>
      right.evidence[field] - left.evidence[field])[0]
  if (!candidate) return null
  return {
    position: candidate.player.position,
    probability: candidate.evidence[field],
  }
}

export const createDraftAdviceSnapshot = (
  context: RealtimeToolContext,
): DraftAdviceSnapshot => {
  const recommendation = context.recommendations
  const topCandidate = recommendation.candidates[0] || null
  return {
    sourceEventCount: context.sourceEventCount,
    currentPick: recommendation.currentPick,
    nextUserPick: recommendation.nextUserPick,
    picksUntilUserPick: Math.max(
      0,
      recommendation.nextUserPick - recommendation.currentPick,
    ),
    topCandidateId: topCandidate?.player.id || null,
    topCandidateName: topCandidate?.player.fullName || null,
    topCandidatePosition: topCandidate?.player.position || null,
    highestRunRisk: highestCandidateRisk(
      context,
      "positionalRunProbability",
    ),
    highestTierRisk: highestCandidateRisk(
      context,
      "tierBoundaryProbability",
    ),
  }
}

interface CandidateTrigger {
  trigger: DraftAdviceTrigger
  priority: "normal" | "urgent"
  score: number
  reason: string
}

const crossedRiskThreshold = (
  previous: { position: string; probability: number } | null,
  current: { position: string; probability: number } | null,
  threshold: number,
): boolean => Boolean(
  current
  && current.probability >= threshold
  && (
    !previous
    || previous.probability < threshold
    || previous.position !== current.position
  ),
)

const buildPrompt = (
  trigger: CandidateTrigger,
  current: DraftAdviceSnapshot,
): string => [
  `Material draft update at event ${current.sourceEventCount}:`,
  trigger.reason,
  "Use get_draft_state and get_recommendations before advising.",
  "Respond in at most two concise sentences.",
  "If a view or plan change would help, create an unconfirmed proposal.",
].join(" ")

export const decideDraftEventAdvice = ({
  previous,
  current,
  lastPromptEventCount,
  cooldownPicks = 2,
}: {
  previous: DraftAdviceSnapshot
  current: DraftAdviceSnapshot
  lastPromptEventCount: number | null
  cooldownPicks?: number
}): DraftAdviceDecision | null => {
  if (current.sourceEventCount <= previous.sourceEventCount) return null

  const candidates: CandidateTrigger[] = []
  if (
    current.picksUntilUserPick <= 1
    && previous.picksUntilUserPick > 1
  ) {
    candidates.push({
      trigger: "on_clock",
      priority: "urgent",
      score: 100,
      reason: `The user is ${current.picksUntilUserPick === 0
        ? "on the clock"
        : "one pick away"}.`,
    })
  }
  if (
    current.picksUntilUserPick <= 3
    && previous.picksUntilUserPick > 3
  ) {
    candidates.push({
      trigger: "approaching_pick",
      priority: "normal",
      score: 70,
      reason: `The user's pick is ${current.picksUntilUserPick} picks away.`,
    })
  }
  if (crossedRiskThreshold(
    previous.highestTierRisk,
    current.highestTierRisk,
    0.6,
  )) {
    candidates.push({
      trigger: "tier_cliff",
      priority: "normal",
      score: 90,
      reason: `${current.highestTierRisk!.position} tier-cliff risk rose to ${Math.round(
        current.highestTierRisk!.probability * 100,
      )}%.`,
    })
  }
  if (crossedRiskThreshold(
    previous.highestRunRisk,
    current.highestRunRisk,
    0.55,
  )) {
    candidates.push({
      trigger: "positional_run",
      priority: "normal",
      score: 80,
      reason: `${current.highestRunRisk!.position} run risk rose to ${Math.round(
        current.highestRunRisk!.probability * 100,
      )}%.`,
    })
  }
  if (
    current.picksUntilUserPick <= 5
    && previous.topCandidateId
    && current.topCandidateId
    && previous.topCandidateId !== current.topCandidateId
  ) {
    candidates.push({
      trigger: "top_choice_changed",
      priority: "normal",
      score: 60,
      reason: `The preferred option changed to ${current.topCandidateName}.`,
    })
  }

  const selected = candidates.sort((left, right) =>
    right.score - left.score)[0]
  if (!selected) return null
  if (
    selected.priority !== "urgent"
    && lastPromptEventCount !== null
    && current.sourceEventCount - lastPromptEventCount < cooldownPicks
  ) {
    return null
  }
  return {
    trigger: selected.trigger,
    priority: selected.priority,
    reason: selected.reason,
    prompt: buildPrompt(selected, current),
    sourceEventCount: current.sourceEventCount,
  }
}
