import type {
  FantasySettings,
  PlayerRanking,
  ScoringFormat,
  Tier,
} from "../types"


export const scoringFormatFor = (
  settings: Pick<FantasySettings, "ppr" | "scoringFormat">,
): ScoringFormat => settings.scoringFormat || (settings.ppr ? "ppr" : "standard")

export type ScoringFormatLabel = "Standard" | "Half PPR" | "PPR"

export const scoringFormatLabel = (format: ScoringFormat): ScoringFormatLabel => ({
  standard: "Standard",
  half_ppr: "Half PPR",
  ppr: "PPR",
} as const)[format]

export const settingsWithScoringFormat = (
  settings: FantasySettings,
  scoringFormat: ScoringFormat,
): FantasySettings => ({
  ...settings,
  scoringFormat,
  // Preserve the legacy binary feature for algorithms that have not yet been
  // calibrated separately for half-PPR. Half-PPR is reception-sensitive and
  // therefore uses the PPR branch until a three-profile model is calibrated.
  ppr: scoringFormat !== "standard",
})

export const overallRankFor = (
  ranking: PlayerRanking | null | undefined,
  format: ScoringFormat,
): number | undefined => {
  if (!ranking) return undefined
  if (format === "half_ppr") {
    return ranking.halfPprOverallRank
      ?? ranking.pprOverallRank
      ?? ranking.standardOverallRank
  }
  return format === "ppr" ? ranking.pprOverallRank : ranking.standardOverallRank
}

export const positionRankFor = (
  ranking: PlayerRanking | null | undefined,
  format: ScoringFormat,
): number | undefined => {
  if (!ranking) return undefined
  if (format === "half_ppr") {
    return ranking.halfPprPositionRank
      ?? ranking.pprPositionRank
      ?? ranking.standardPositionRank
  }
  return format === "ppr" ? ranking.pprPositionRank : ranking.standardPositionRank
}

export const positionTierFor = (
  ranking: PlayerRanking | null | undefined,
  format: ScoringFormat,
): Tier | undefined => {
  if (!ranking) return undefined
  if (format === "half_ppr") {
    return ranking.halfPprPositionTier
      ?? ranking.pprPositionTier
      ?? ranking.standardPositionTier
  }
  return format === "ppr" ? ranking.pprPositionTier : ranking.standardPositionTier
}

export const metricValueFor = (
  ranking: PlayerRanking | null | undefined,
  format: ScoringFormat,
): number | undefined => {
  if (!ranking) return undefined
  if (format === "half_ppr") {
    return ranking.metricValueHalfPpr
      ?? ranking.metricValuePpr
      ?? ranking.metricValueStd
  }
  return format === "ppr" ? ranking.metricValuePpr : ranking.metricValueStd
}
