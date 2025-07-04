export type Position = "QB" | "RB" | "WR" | "TE" | "DST" | "";

export interface Stats {
  year: number;
  totalPoints: number;
  minTotalPts: number;
  maxTotalPts: number;
  ppg: number;
  minPPG?: number;
  maxPPG?: number;
  gamesPlayed: number;
  rushAttempts: number;
  rushYards: number;
  rushTds: number;
  recs: number;
  recYards: number;
  recTds: number;
  passAttempts: number;
  passCompletions: number;
  passYards: number;
  passTds: number;
  passInts: number;
}

export interface Player {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  matchName: string;
  position: Position;
  team: string;
  tier: string;
  customStdRank?: number;
  customPprRank?: number;
  customStdOvrRank?: number;
  customPprOvrRank?: number;
  espnOvrPprRank?: number;
  espnOvrStdRank?: number;
  espnAdp?: number;
  espnPlayerOutlook?: string;
  seasonStats: Stats[];
  lastYrTier: number;
  lastYrOvrRank: number;
  stdRankTier: number;
  pprRankTier: number;
  pros: string;
  cons: string;
}

export interface SeasonPositionalStats {
  id: string;
  year: number;
  position: Position;
  tier1Stats: Stats | null;
  tier2Stats: Stats | null;
  tier3Stats: Stats | null;
  tier4Stats: Stats | null;
  tier5Stats: Stats | null;
  tier6Stats: Stats | null;
}

export type PosStatsByNumTeamByYear = {
  [numTeams: number]: {
    [year: number]: {
      [pos: string]: SeasonPositionalStats | null;
    };
  };
};

export interface HarrisData {
  players: Player[];
  posStatsByNumTeamByYear: PosStatsByNumTeamByYear;
} 