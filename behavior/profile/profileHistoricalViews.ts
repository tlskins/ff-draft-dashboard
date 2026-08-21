import type {
  AnalysisQuery,
  AnalysisQueryResponse,
  AnalysisVisualization,
  ScoringProfileId,
} from "../api/historicalAnalysis"


export const PROFILE_HISTORICAL_VIEW_IDS = [
  "scoring_density",
  "weekly_heatmap",
  "weekly_trend",
] as const

export type ProfileHistoricalViewId = typeof PROFILE_HISTORICAL_VIEW_IDS[number]

export interface ProfileHistoricalViewDefinition {
  description: string
  id: ProfileHistoricalViewId
  label: string
  visualization: AnalysisVisualization
}

export const PROFILE_HISTORICAL_VIEWS: Record<
  ProfileHistoricalViewId,
  ProfileHistoricalViewDefinition
> = {
  scoring_density: {
    id: "scoring_density",
    label: "PPG distribution",
    description: "Weekly scoring distributions separated by season.",
    visualization: {
      type: "density",
      x: "fantasy_points_mean",
      y: "fantasy_points_mean",
      color: "season",
    },
  },
  weekly_heatmap: {
    id: "weekly_heatmap",
    label: "Weekly heatmap",
    description: "Recorded scoring weeks with one panel per season.",
    visualization: {
      type: "heatmap",
      x: "week",
      y: "fantasy_points_mean",
      color: "player_name",
      facet: "season",
    },
  },
  weekly_trend: {
    id: "weekly_trend",
    label: "Weekly trend",
    description: "Weekly scoring paths separated by season.",
    visualization: {
      type: "line",
      x: "week",
      y: "fantasy_points_mean",
      color: "season",
    },
  },
}

export const buildProfileHistoricalQuery = ({
  playerId,
  scoringProfile,
  seasons,
}: {
  playerId: string
  scoringProfile: ScoringProfileId
  seasons: number[]
}): AnalysisQuery => ({
  player_ids: [playerId],
  positions: [],
  seasons,
  scoring_profile_id: scoringProfile,
  metrics: ["games", "fantasy_points_mean"],
  group_by: "week",
  filters: [],
  sort: {field: "week", direction: "asc"},
  limit: 100,
  visualization: PROFILE_HISTORICAL_VIEWS.weekly_heatmap.visualization,
})

export const presentProfileHistoricalView = (
  response: AnalysisQueryResponse,
  view: ProfileHistoricalViewId,
): AnalysisQueryResponse => ({
  ...response,
  visualization: PROFILE_HISTORICAL_VIEWS[view].visualization,
})

export interface ProfileHistoricalViewDecision {
  explanation: string
  id: ProfileHistoricalViewId
}

export const selectProfileHistoricalView = (
  response: AnalysisQueryResponse,
): ProfileHistoricalViewDecision => {
  const countsBySeason = new Map<string, number>()
  response.rows.forEach(row => {
    const season = String(row.dimensions.season ?? "Unknown")
    countsBySeason.set(season, (countsBySeason.get(season) || 0) + 1)
  })
  const counts = Array.from(countsBySeason.values())
  const maximumRecordedWeeks = Math.max(0, ...counts)
  const hasMaterialPlayingTimeGap = counts.length >= 2 && counts.some(
    count => maximumRecordedWeeks - count >= 4,
  )
  if (hasMaterialPlayingTimeGap) {
    return {
      id: "weekly_heatmap",
      explanation: "The heatmap leads because recorded playing time varies materially by season.",
    }
  }
  if (response.rows.length >= 12) {
    return {
      id: "scoring_density",
      explanation: "The scoring distribution leads because enough recorded weeks are available.",
    }
  }
  return {
    id: "weekly_trend",
    explanation: "The weekly trend leads because the historical sample is still small.",
  }
}

export const historicalSeasonCount = (
  response: AnalysisQueryResponse | null,
): number => response
  ? new Set(response.rows.map(row => row.dimensions.season)).size
  : 0
