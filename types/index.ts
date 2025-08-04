export enum FantasyPosition {
    QUARTERBACK = "QB",
    RUNNING_BACK = "RB",
    WIDE_RECEIVER = "WR",
    TIGHT_END = "TE",
    DEFENSE = "DST",
    KICKER = "K",
    NONE = "",
}

export enum NFLTeam {
    FA = "FA",
    ATL = "ATL",
    BUF = "BUF",
    CHI = "CHI",
    CIN = "CIN",
    CLE = "CLE",
    DAL = "DAL",
    DEN = "DEN",
    DET = "DET",
    GB = "GB",
    TEN = "TEN",
    IND = "IND",
    KC = "KC",
    LV = "LV",
    LAR = "LAR",
    MIA = "MIA",
    MIN = "MIN",
    NE = "NE",
    NO = "NO",
    NYG = "NYG",
    NYJ = "NYJ",
    PHL = "PHL",
    ARI = "ARI",
    PIT = "PIT",
    LAC = "LAC",
    SF = "SF",
    SEA = "SEA",
    TB = "TB",
    WAS = "WAS",
    CAR = "CAR",
    JAC = "JAC",
    BAL = "BAL",
    HOU = "HOU",
}

export enum ThirdPartyRanker {
    HARRIS = "Harris",
    ESPN = "ESPN",
    FPROS = "FantasyPros",
}

export enum DataRanker {
    LAST_SSN_TTL_FPTS = "Last Season Total FPTS",
    LAST_SSN_PPG = "Last Season PPG",
    LAST_SSN_PPGS = "Last Season PPG Started",
}

export type RankBuckets = FantasyPosition.QUARTERBACK | FantasyPosition.RUNNING_BACK | FantasyPosition.WIDE_RECEIVER | FantasyPosition.TIGHT_END | "Purge"

export type FantasyRanker = DataRanker | ThirdPartyRanker;

export interface FantasySettings {
    ppr: boolean;
    numTeams: number;
    numStartingQbs: number;
    numStartingRbs: number;
    numStartingWrs: number;
    numStartingTes: number;
    numFlexPositions: number;
    numBenchPlayers: number;
}

export interface BoardSettings {
    ranker: FantasyRanker;
    adpRanker: FantasyRanker;
}

export const BaseStats = [
    'team',
    'Age',
    'G',
]

export const PassingStats = [
    'Pass Cmp',
    'Pass Att',
    'Pass Yds',
    'Pass TD',
    'Int',
]

export const RushingStats = [
    'Rush Att',
    'Rush Yds',
    'Rush Y/A',
    'Rush TD',
    'Fmb',
    'FL',
]

export const ReceivingStats = [
    'Rec Tgt',
    'Rec',
    'Rec Yds',
    'Rec Y/R',
    'Rec TD',
]

export interface PlayerStats {
    Rk: number;
    Player: string;
    name: string;
    Tm: NFLTeam;
    team: string;
    FantPos: FantasyPosition;
    position: string;
    Age?: number;
    G?: number;
    GS?: number;
    "Pass Cmp"?: number;
    "Pass Att"?: number;
    "Pass Yds"?: number;
    "Pass TD"?: number;
    Int?: number;
    "Rush Att"?: number;
    "Rush Yds"?: number;
    "Rush Y/A"?: number;
    "Rush TD"?: number;
    Fmb?: number;
    FL?: number;
    "Rec Tgt"?: number;
    Rec?: number;
    "Rec Yds"?: number;
    "Rec Y/R"?: number | null;
    "Rec TD"?: number;
    TD?: number;
    "2Pm"?: number | null;
    "2PP"?: number;
    FantPt?: number;
    PPR?: number;
    DKPt?: number;
    FDPt?: number;
    VBD?: number;
    PosRank?: number | null;
    OvRank?: number | null;
    playerId: string; // pro-football-reference id
    fantasy_points_per_game?: number;
    fantasy_points_per_game_started?: number;
    ppr_points_per_game?: number;
    ppr_points_per_game_started?: number;
    year?: number | string;
}

export interface Tier {
    tierNumber: number;
    upperLimitPlayerIdx: number;
    upperLimitValue: number;
    lowerLimitPlayerIdx: number;
    lowerLimitValue: number;
}

export interface PlayerMetrics {
    overallRank: number | undefined;
    posRank: number;
    tier: Tier | undefined;
    adp: number | undefined;
    overallOrPosRank: number | undefined;
}

export interface PlayerRanking {
    playerId: string;
    ranker: FantasyRanker;
    position: FantasyPosition;
    metricValuePpr?: number;
    metricValueStd?: number;
    standardOverallRank?: number;
    pprOverallRank?: number;
    standardPositionRank: number; // positional rank must exist
    standardPositionTier?: Tier;
    pprPositionRank: number; // positional rank must exist
    pprPositionTier?: Tier;
}

export interface RankingSummary {
    ranker: FantasyRanker;
    ppr: boolean;
    replacementLevels: { [key: string]: [number, number] };
    stdDevs: { [key: string]: number };
    tiers: { [key: string]: Tier[] };
}

export interface Player {
    id: string;
    firstName: string;
    lastName: string;
    fullName: string;
    team: NFLTeam;
    position: FantasyPosition;
    ranks: { [key in FantasyRanker]: PlayerRanking };
    historicalStats?: { [key: string]: PlayerStats };
    seasonStats?: PlayerStats[];
    lastYrTier?: number;
    lastYrOvrRank?: number;
    stdRankTier?: number;
    pprRankTier?: number;
    pros?: string;
    cons?: string;

    // TODO - need to handle "target"
}

// export type PosStatsByNumTeamByYear = {
//     [numTeams: number]: {
//         [year: number]: {
//             [pos: string]: {
//                 tier1Stats: PlayerStats,
//                 tier2Stats: PlayerStats,
//                 tier3Stats: PlayerStats,
//                 tier4Stats: PlayerStats,
//                 tier5Stats: PlayerStats,
//                 tier6Stats: PlayerStats,
//             }
//         }
//     }
// };

export interface Rankings {
    players: Player[];
    rankingsSummaries: RankingSummary[];
    settings: FantasySettings;
}

export enum DraftView {
  RANKING = "Ranking View",
  BEST_AVAILABLE = "Best Available By Round",
}

export enum RankingView {
  DEFAULT = "Sort By Ranks",
  ADP = "Sort By ADP",
  NEXT_TAKEN = "Show Next Taken",
} 

