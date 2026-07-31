/**
 * Explicit, credential-free gates for the Realtime advisor contract.
 *
 * These values deliberately measure the deterministic boundary around a model,
 * rather than pretending a mocked model response is a model-quality score.
 * Recorded model transcripts can be added beside this baseline later without
 * weakening these safety and timing gates.
 */
export const REALTIME_ADVISOR_EVAL_THRESHOLDS = {
  maxToolArguments: 4,
  normalAdviceCooldownPicks: 2,
  maxNormalInterruptionsPerCooldown: 1,
  deterministicDecisionP95Ms: 150,
  expectedRecommendationCount: 3,
} as const

export const percentile = (
  values: number[],
  percentileValue: number,
): number => {
  if (!values.length) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * percentileValue) - 1),
  )
  return sorted[index]
}
