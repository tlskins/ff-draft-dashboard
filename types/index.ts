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
    'age',
    'g',
]

export const PassingStats = [
    'passCmp',
    'passAtt',
    'passYds',
    'passTd',
    'int',
]

export const RushingStats = [
    'rushAtt',
    'rushYds',
    'rushYA',
    'rushTd',
    'fmb',
    'fl',
]

export const ReceivingStats = [
    'recTgt',
    'rec',
    'recYds',
    'recYR',
    'recTd',
]

export interface PlayerStats {
    rk: number;
    player: string;
    name: string;
    tm: NFLTeam;
    team: string;
    fantPos: FantasyPosition;
    position: string;
    age?: number;
    g?: number;
    gs?: number;
    passCmp?: number;
    passAtt?: number;
    passYds?: number;
    passTd?: number;
    int?: number;
    rushAtt?: number;
    rushYds?: number;
    rushYA?: number;
    rushTd?: number;
    fmb?: number;
    fl?: number;
    recTgt?: number;
    rec?: number;
    recYds?: number;
    recYR?: number | null;
    recTd?: number;
    td?: number;
    "2Pm"?: number | null;
    "2Pp"?: number;
    FantPt?: number;
    PPR?: number;
    DKPt?: number;
    FDPt?: number;
    VBD?: number;
    PosRank?: number | null;
    OvRank?: number | null;
    playerId: string; // pro-football-reference id
    fantasyPointsPerGame?: number;
    fantasyPointsPerGameStarted?: number;
    pprPointsPerGame?: number;
    pprPointsPerGameStarted?: number;
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
    replacementLevels: { [key in FantasyPosition]: [number, number] }; // [position index, points]
    stdDevs: { [key in FantasyPosition]: number };
    tiers: { [key in FantasyPosition]: Tier[] };
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

