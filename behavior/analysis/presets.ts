import {
  AnalysisQuery,
  AnalysisVisualization,
} from "../api/historicalAnalysis"
import { AnalysisViewId } from "./viewState"


export type AnalysisPresetId =
  | "weekly_trend"
  | "floor_ceiling"
  | "volume_value"
  | "leaderboard"
export type AnalysisPosition =
  AnalysisQuery["positions"][number]

export interface AnalysisPreset {
  id: AnalysisPresetId
  label: string
  description: string
  playerScopeOnly?: boolean
}

export const ANALYSIS_PRESETS: AnalysisPreset[] = [
  {
    id: "weekly_trend",
    label: "Weekly trend",
    description: "Season-by-season weekly scoring for selected players.",
    playerScopeOnly: true,
  },
  {
    id: "floor_ceiling",
    label: "Floor vs ceiling",
    description: "Compare weekly P10 downside with P90 upside.",
  },
  {
    id: "volume_value",
    label: "Volume vs points",
    description: "Compare opportunity volume with weekly scoring.",
  },
  {
    id: "leaderboard",
    label: "Historical leaders",
    description: "Rank the current scope by average weekly scoring.",
  },
]

interface BuildAnalysisQueryOptions {
  preset: AnalysisPresetId
  playerIds: string[]
  position: AnalysisPosition
  positionScope: boolean
  seasonWindow: 1 | 3 | 5
  scoringProfile: "standard" | "half_ppr" | "ppr"
  endSeason?: number
}

const volumeMetric = (position: AnalysisPosition) => {
  if (position === "QB") {
    return "attempts_total" as const
  }
  if (position === "RB") {
    return "carries_total" as const
  }
  return "targets_total" as const
}

export const buildAnalysisQuery = ({
  preset,
  playerIds,
  position,
  positionScope,
  seasonWindow,
  scoringProfile,
  endSeason = 2025,
}: BuildAnalysisQueryOptions): AnalysisQuery => {
  const shared = {
    player_ids: positionScope ? [] : playerIds,
    positions: positionScope ? [position] : [],
    seasons: {
      start: endSeason - seasonWindow + 1,
      end: endSeason,
    },
    scoring_profile_id: scoringProfile,
    filters: [],
  } satisfies Partial<AnalysisQuery>

  if (preset === "weekly_trend") {
    return {
      ...shared,
      metrics: [
        "games",
        "fantasy_points_mean",
        "fantasy_points_p10",
        "fantasy_points_p90",
      ],
      group_by: "season",
      sort: {field: "season", direction: "asc"},
      limit: 100,
      visualization: {
        type: "line",
        x: "season",
        y: "fantasy_points_mean",
        color: "player_name",
      },
    }
  }

  if (preset === "floor_ceiling") {
    return {
      ...shared,
      metrics: [
        "games",
        "fantasy_points_mean",
        "fantasy_points_std_dev",
        "fantasy_points_p10",
        "fantasy_points_p50",
        "fantasy_points_p90",
      ],
      group_by: "player",
      sort: {field: "fantasy_points_p50", direction: "desc"},
      limit: 100,
      visualization: {
        type: "scatter",
        x: "fantasy_points_p10",
        y: "fantasy_points_p90",
        color: "position",
      },
    }
  }

  if (preset === "volume_value") {
    const xMetric = volumeMetric(position)
    return {
      ...shared,
      metrics: [
        "games",
        "fantasy_points_mean",
        xMetric,
      ],
      group_by: "player",
      sort: {field: "fantasy_points_mean", direction: "desc"},
      limit: 100,
      visualization: {
        type: "scatter",
        x: xMetric,
        y: "fantasy_points_mean",
        color: "position",
      },
    }
  }

  const visualization: AnalysisVisualization = {
    type: "bar",
    x: "player_name",
    y: "fantasy_points_mean",
    color: "position",
  }
  return {
    ...shared,
    metrics: [
      "games",
      "fantasy_points_mean",
      "fantasy_points_p10",
      "fantasy_points_p90",
    ],
    group_by: "player",
    sort: {field: "fantasy_points_mean", direction: "desc"},
    limit: 24,
    visualization,
  }
}

interface BuildAnalysisViewQueryOptions {
  view: AnalysisViewId
  playerIds: string[]
  crossPositionPlayerIds: string[]
  position: AnalysisPosition
  seasonWindow: 1 | 3 | 5
  scoringProfile: "standard" | "half_ppr" | "ppr"
  endSeason?: number
}

export const buildAnalysisViewQuery = ({
  view,
  playerIds,
  crossPositionPlayerIds,
  position,
  seasonWindow,
  scoringProfile,
  endSeason,
}: BuildAnalysisViewQueryOptions): AnalysisQuery => {
  if (view === "tier_landscape") {
    return buildAnalysisQuery({
      preset: "floor_ceiling",
      playerIds: [],
      position,
      positionScope: true,
      seasonWindow,
      scoringProfile,
      endSeason,
    })
  }
  if (view === "positional_bests") {
    return buildAnalysisQuery({
      preset: "leaderboard",
      playerIds: [],
      position,
      positionScope: true,
      seasonWindow,
      scoringProfile,
      endSeason,
    })
  }
  if (view === "cross_position") {
    return buildAnalysisQuery({
      preset: "floor_ceiling",
      playerIds: crossPositionPlayerIds,
      position,
      positionScope: false,
      seasonWindow,
      scoringProfile,
      endSeason,
    })
  }
  return buildAnalysisQuery({
    preset: "weekly_trend",
    playerIds,
    position,
    positionScope: false,
    seasonWindow,
    scoringProfile,
    endSeason,
  })
}
