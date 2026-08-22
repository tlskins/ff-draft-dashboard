import {
  type FantasyRanker,
  type FantasySettings,
  type Rankings,
  ThirdPartyRanker,
} from "../types"
import {positionRankFor, scoringFormatFor} from "./scoringFormat"


const LEGACY_EXPERT_RANKERS: FantasyRanker[] = [
  ThirdPartyRanker.HARRIS,
  ThirdPartyRanker.ESPN,
  ThirdPartyRanker.FPROS,
]

const finitePositive = (value: unknown): boolean => (
  typeof value === "number" && Number.isFinite(value) && value > 0
)

export const publishedExpertRankers = (
  rankings: Pick<Rankings, "players" | "allThirdPartyRankers">,
): FantasyRanker[] => {
  const declared = rankings.allThirdPartyRankers?.length
    ? rankings.allThirdPartyRankers
    : LEGACY_EXPERT_RANKERS
  const observed = new Set(rankings.players.flatMap(player => (
    Object.keys(player.ranks || {})
  )))
  return Array.from(new Set(declared)).filter(ranker => observed.has(ranker))
}

export const selectableExpertRankers = (
  rankings: Pick<Rankings, "players" | "allThirdPartyRankers">,
  settings: Pick<FantasySettings, "ppr" | "scoringFormat">,
): FantasyRanker[] => {
  const scoringFormat = scoringFormatFor(settings)
  const compatible = publishedExpertRankers(rankings).filter(ranker => (
    rankings.players.some(player => finitePositive(
      positionRankFor(player.ranks?.[ranker], scoringFormat),
    ))
  ))
  return [...compatible, ThirdPartyRanker.CUSTOM]
}

export const fallbackExpertRanker = (
  rankings: Pick<Rankings, "players" | "allThirdPartyRankers">,
  settings: Pick<FantasySettings, "ppr" | "scoringFormat">,
): FantasyRanker => (
  selectableExpertRankers(rankings, settings).find(
    ranker => ranker !== ThirdPartyRanker.CUSTOM,
  ) || ThirdPartyRanker.CUSTOM
)
