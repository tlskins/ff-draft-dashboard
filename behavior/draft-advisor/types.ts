import { FantasyPosition } from "types"

export interface DraftAdvisorPlayer {
  id: string
  name: string
  position: FantasyPosition
  team: string
  adp: number | null
  positionRank: number
}

export interface DraftAdvisorTeam {
  rosterIndex: number
  draftedPlayerIds: string[]
  needs: Array<{
    position: FantasyPosition
    openStarterSpots: number
  }>
}

export interface UpcomingDraftSlot {
  overallPick: number
  rosterIndex: number
}

export interface DraftAdvisorContext {
  schemaVersion: 1
  league: {
    numTeams: number
    ppr: boolean
  }
  currentPick: number
  upcomingSlots: UpcomingDraftSlot[]
  teams: DraftAdvisorTeam[]
  availablePlayers: DraftAdvisorPlayer[]
  recentPicks: Array<{
    overallPick: number
    playerId: string
    name: string
    position: FantasyPosition
    team: string
  }>
}

export interface PredictedPlayerPick {
  playerId: string
  probability: number
  reason: string
}

export interface DraftPickPrediction {
  overallPick: number
  rosterIndex: number
  candidates: PredictedPlayerPick[]
}

/**
 * An advisor can be backed by deterministic rules, recorded fixtures, or a
 * Realtime session without changing draft state or presentation components.
 */
export interface DraftAdvisor {
  predictUpcomingPicks(
    context: DraftAdvisorContext,
    signal?: AbortSignal,
  ): Promise<DraftPickPrediction[]>
}
