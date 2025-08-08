import { Player, FantasyPosition, FantasySettings, PlayerMetrics, BoardSettings, Tier, RankingSummary, DataRanker, FantasyRanker } from 'types'

// Type Definitions
export interface EspnDraftEventRaw {
    imgUrl: string
    pick: string
    [key: string]: any
}

export interface EspnDraftEventParsed {
    imgUrl: string
    [key: string]: any
    id: string | null
    pickStr: string
    round: number
    pick: number
}

export interface NflDraftEvent {
    name: string
    team: string
    position: FantasyPosition | string
    pick: number
}

export interface ParsedNflDraftEvent {
    id: string
    ovrPick: number
}

export type PlayerLibrary = {
    [id: string]: Player
}

export type PlayersByPositionAndTeam = {
    [pos in FantasyPosition]?: {
        [team: string]: Player[]
    }
}

export interface Roster {
    picks: string[]
    [FantasyPosition.QUARTERBACK]: string[]
    [FantasyPosition.RUNNING_BACK]: string[]
    [FantasyPosition.WIDE_RECEIVER]: string[]
    [FantasyPosition.TIGHT_END]: string[]
}

export type PositionCounts = {
    [key in FantasyPosition]?: number
}

type PredictedPicks = {
    [playerId: string]: number
}

// presenters

export enum PlayerRankingsBy {
    PPROverall = 'pprOverall',
    StandardOverall = 'standardOverall',
    PPRByPosition = 'pprByPosition',
    StandardByPosition = 'standardByPosition',
}

export const getPlayerMetrics = (
    player: Player,
    settings: FantasySettings,
    boardSettings: BoardSettings,
): PlayerMetrics => {
    const ranks = player.ranks?.[boardSettings.ranker]
    const adpRanks = player.ranks?.[boardSettings.adpRanker]
    if ( !ranks || !adpRanks ) {
        return {
            overallRank: undefined,
            posRank: 9999,
            tier: undefined,
            adp: undefined,
            overallOrPosRank: undefined,
        }
    }
    const overallRank = settings.ppr ? ranks.pprOverallRank : ranks.standardOverallRank
    const posRank = settings.ppr ? ranks.pprPositionRank : ranks.standardPositionRank
    const adp = adpRanks.adp || 999

    return {
        overallRank,
        posRank,
        tier: settings.ppr ? ranks.pprPositionTier : ranks.standardPositionTier,
        adp: parseFloat(adp.toFixed(1)),
        overallOrPosRank: overallRank == null ? posRank : overallRank,
    }
}

export const getPlayerAdp = (player: Player, settings: FantasySettings, boardSettings: BoardSettings) => {
    return getPlayerMetrics(player, settings, boardSettings).adp || 9999;
}

export const getProjectedTier = (
    player: Player,
    ranker: FantasyRanker,
    projDataRanker: DataRanker,
    settings: FantasySettings,
    rankingSummaries: RankingSummary[],
): Tier | undefined => {
    const summary = rankingSummaries.find(s => s.ranker === projDataRanker && s.ppr === settings.ppr);
    const playerRanks = player.ranks?.[ranker];
    if ( !playerRanks ) {
        return undefined
    }

    const playerTier = settings.ppr ? playerRanks.pprPositionTier : playerRanks.standardPositionTier;

    if ( !summary || !playerTier ) {
        return undefined
    }

    const tiers = summary.tiers[player.position] || []
    return tiers.find(t => t.tierNumber === playerTier.tierNumber)
}

// helpers

const min = (a: number, b: number, c: number): number => {
    return Math.min(a, Math.min(b, c))
}
  
const levenshteinDistance = (str1: string, str2: string): number => {
    const m = str1.length
    const n = str2.length

    const matrix = new Array(m + 1).fill(null).map(() => new Array(n + 1).fill(0))

    for (let i = 0; i <= m; i++) {
        matrix[i][0] = i
    }

    for (let j = 0; j <= n; j++) {
        matrix[0][j] = j
    }

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
        const cost = str1[i - 1] !== str2[j - 1] ? 1 : 0
        matrix[i][j] = min(
            matrix[i - 1][j] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j - 1] + cost
        );
        }
    }

    return matrix[m][n]
}

// draft listener

export const rankablePositions: FantasyPosition[] = [
    FantasyPosition.QUARTERBACK,
    FantasyPosition.RUNNING_BACK,
    FantasyPosition.WIDE_RECEIVER,
    FantasyPosition.TIGHT_END,
]

export const parseEspnDraftEvents = (draftPicksData: EspnDraftEventRaw[]): EspnDraftEventParsed[] => {
    return draftPicksData.map( data => {
        const imgMatch = data.imgUrl.match(/headshots\/nfl\/players\/full\/(\d+)\.png/)
        const pickMatch = data.pick.match(/^R(\d+), P(\d+) /)
        return {
            ...data,
            id: imgMatch && imgMatch[1].toString(), // TODO - changed this id to string - need to test
            pickStr: data.pick,
            round: pickMatch ? parseInt(pickMatch[1]) : 0,
            pick: pickMatch ? parseInt(pickMatch[2]) : 0,
        }
    })
}

const normalizeNflName = (name: string): string => name.toLowerCase().replace(/[^a-zA-Z\s]/g, '')
    .replace('iii', '')
    .replace('ii', '')
    .replace(' jr', '')
    .trim()

const playerToNflName = (player: Player): string => `${ player.firstName[0].toLowerCase() } ${ normalizeNflName( player.lastName )}`

const parseNflTeamToPlayerTeam = (nflTeam: string): string => {
switch(nflTeam) {
    case 'JAX':
        return 'JAC'
    case 'PHI':
        return 'PHL'
    case 'LA':
        return 'LAR'
    default:
        return nflTeam
    }
}

export const parseNflDraftEvents = (
    draftPicksData: NflDraftEvent[],
    playersByPosByTeam: PlayersByPositionAndTeam,
): ParsedNflDraftEvent[] => {
    return draftPicksData.map(draftEvent => {
        console.log('matching nfl event', draftEvent, playersByPosByTeam)
        const { name, team: nflTeam, position, pick: ovrPick } = draftEvent
        const team = parseNflTeamToPlayerTeam( nflTeam )
        if ( !rankablePositions.includes( position as FantasyPosition )) {
            return null
        }

        const posPlayers = playersByPosByTeam[position as FantasyPosition]?.[team] || []
        const playerByExactName = posPlayers.find( p => playerToNflName( p ) === normalizeNflName( name ) )
        if ( playerByExactName ) {
            return { id: playerByExactName.id, ovrPick}
        }

        let minScore = 100
        let minIdx = -1
        posPlayers.forEach( (p, idx) => {
            const simScore = levenshteinDistance( playerToNflName(p), name )
            if ( simScore <= 5 && simScore < minScore ) {
                minScore = simScore
                minIdx = idx
            }
        })
        if ( minIdx > -1 ) {
            const simPlayer = posPlayers[minIdx]
            return { id: simPlayer.id, ovrPick }
        }

        console.log('parseNflDraftEvents failed for ', draftEvent)

        return null
    }).filter( p => !!p )
}

// rosters

export const calcCurrRoundPick = ( pickNum: number, numTeams: number ): number => {
    const roundRem = pickNum % numTeams
    return roundRem === 0 ? numTeams : roundRem
}

export const getRoundIdxForPickNum = (pickNum: number, numTeams: number): number => Math.floor((pickNum-1) / numTeams)

// ranks

export type PlayerRanks = {
    [FantasyPosition.QUARTERBACK]: Player[]
    [FantasyPosition.RUNNING_BACK]: Player[]
    [FantasyPosition.WIDE_RECEIVER]: Player[]
    [FantasyPosition.TIGHT_END]: Player[]
    'Purge': Player[]
    availPlayersByOverallRank: Player[]
    availPlayersByAdp: Player[]
}

export const createPlayerRanks = (players: Player[], settings: FantasySettings, boardSettings: BoardSettings): PlayerRanks => {
    let playerRanks: PlayerRanks = {
        [FantasyPosition.QUARTERBACK]: [],
        [FantasyPosition.RUNNING_BACK]: [],
        [FantasyPosition.WIDE_RECEIVER]: [],
        [FantasyPosition.TIGHT_END]: [],
        'Purge': [],
        availPlayersByOverallRank: [],
        availPlayersByAdp: [],
    }
    players.forEach( player => {
        playerRanks = addAvailPlayer( playerRanks, player, settings, boardSettings )
    })
    playerRanks = sortPlayerRanksByRank( playerRanks, settings, boardSettings, SortPlayersByMetric.PosRank )
    
    console.log('createPlayerRanks', settings, boardSettings, playerRanks)

    return playerRanks
}

export const removePlayerFromBoard = ( playerRanks: PlayerRanks, player: Player ): PlayerRanks => {
    playerRanks.availPlayersByOverallRank = playerRanks.availPlayersByOverallRank.filter( p => p.id !== player.id )
    playerRanks.availPlayersByAdp = playerRanks.availPlayersByAdp.filter( p => p.id !== player.id )
    playerRanks.Purge = playerRanks.Purge.filter( p => p.id !== player.id )
    const playerPos = player.position as keyof PlayerRanks
    const nextPlayerPosRanks = playerRanks[playerPos].filter( p => p.id !== player.id )
    playerRanks[playerPos] = nextPlayerPosRanks

    return { ...playerRanks }
}

export const addAvailPlayer = (playerRanks: PlayerRanks, player: Player, settings: FantasySettings, boardSettings: BoardSettings): PlayerRanks => {
    playerRanks.availPlayersByOverallRank.push( player )
    playerRanks.availPlayersByAdp.push( player )
    playerRanks.availPlayersByOverallRank = playerRanks.availPlayersByOverallRank.sort((a, b) => {
        const aRank = getPlayerMetrics(a, settings, boardSettings).overallRank
        const bRank = getPlayerMetrics(b, settings, boardSettings).overallRank
        return (aRank || 9999) - (bRank || 9999)
    })
    playerRanks.availPlayersByAdp = playerRanks.availPlayersByAdp.sort((a, b) => {
        const aAdp = getPlayerMetrics(a, settings, boardSettings).adp
        const bAdp = getPlayerMetrics(b, settings, boardSettings).adp
        return (aAdp || 9999) - (bAdp || 9999)
    })
    const playerPos = player.position as keyof PlayerRanks
    const playerPosRanks = playerRanks[playerPos]
    playerPosRanks.push(player)
    playerRanks[playerPos] = sortPlayersByRank( [...playerPosRanks], settings, boardSettings, SortPlayersByMetric.PosRank )

    return { ...playerRanks }
}

export enum SortPlayersByMetric {
    OverallRank = 'overallRank',
    PosRank = 'posRank',
    OverallOrPosRank = 'overallOrPosRank',
    Adp = 'adp',
}

export const sortPlayersByRank = (players: Player[], settings: FantasySettings, boardSettings: BoardSettings, sortBy: SortPlayersByMetric): Player[] => {
    return players.sort((a, b) => {
        const aRank = getPlayerMetrics(a, settings, boardSettings)[sortBy]
        const bRank = getPlayerMetrics(b, settings, boardSettings)[sortBy]
        return (aRank || 9999) - (bRank || 9999)
    })
}

export const sortPlayerRanksByRank = (playerRanks: PlayerRanks, settings: FantasySettings, boardSettings: BoardSettings, sortBy: SortPlayersByMetric): PlayerRanks => {
    rankablePositions.forEach( pos => {
        const players = playerRanks[pos as keyof PlayerRanks]
        playerRanks[pos as keyof PlayerRanks] = sortPlayersByRank( players, settings, boardSettings, sortBy )
    })
    playerRanks.availPlayersByOverallRank = sortPlayersByRank( playerRanks.availPlayersByOverallRank, settings, boardSettings, SortPlayersByMetric.OverallRank )
    playerRanks.availPlayersByAdp = sortPlayersByRank( playerRanks.availPlayersByAdp, settings, boardSettings, SortPlayersByMetric.Adp )

    return { ...playerRanks }
}

export const purgePlayerFromPlayerRanks = ( playerRanks: PlayerRanks, player: Player, settings: FantasySettings, boardSettings: BoardSettings ): PlayerRanks => {
    const purgeIdx = playerRanks.Purge.findIndex( p => p.id === player.id )
    if ( purgeIdx === -1 ) {
        playerRanks = removePlayerFromBoard( playerRanks, player )
        playerRanks.Purge.push( player )
    } else {
        playerRanks.Purge = playerRanks.Purge.filter( p => p.id !== player.id )
        playerRanks = addAvailPlayer( playerRanks, player, settings, boardSettings )
        playerRanks.availPlayersByOverallRank = sortPlayersByRank(
            playerRanks.availPlayersByOverallRank,
            settings,
            boardSettings,
            SortPlayersByMetric.PosRank,
        )
        playerRanks.availPlayersByAdp = sortPlayersByRank(
            playerRanks.availPlayersByAdp,
            settings,
            boardSettings,
            SortPlayersByMetric.Adp,
        )
    }

    return { ...playerRanks }
}

// Rosters

export const createRosters = (numTeams: number): Roster[] => {
    const rosters = new Array(numTeams).fill(null).map(() => ({
        picks: [],
        QB: [],
        RB: [],
        WR: [],
        TE: []
    }))

    return rosters
}

export const addToRoster = ( rosters: Roster[], player: Player, rosterIdx: number ): Roster[] => {
    const roster = rosters[rosterIdx]
    if ( roster.picks.includes(player.id)) {
        return rosters
    }

    return [
        ...rosters.slice(0, rosterIdx),
        {
            ...roster,
            picks: [...roster.picks, player.id],
            [player.position]: [...roster[player.position as 'QB' | 'RB' | 'WR' | 'TE'], player.id],
        },
        ...rosters.slice(rosterIdx+1, rosters.length),
    ]
}

export const removeFromRoster = ( rosters: Roster[], player: Player, rosterIdx: number ): Roster[] => {
    const roster = rosters[rosterIdx]
    const newRosters = [
        ...rosters.slice(0, rosterIdx),
        {
            ...roster,
            picks: roster.picks.filter( id => id !== player.id ),
            [player.position]: roster[player.position as 'QB' | 'RB' | 'WR' | 'TE'].filter( id => id !== player.id ),
        },
        ...rosters.slice(rosterIdx+1, rosters.length),
    ]

    return newRosters
}

// TODO - make this account for board settings
// Roster = 1x flex
type RosterBuild = {
    round: number;
    max: number;
    position: FantasyPosition;
}

const standardRosterBuild: RosterBuild[] = [
    { round: 3, position: FantasyPosition.QUARTERBACK, max: 1 },
    { round: 3, position: FantasyPosition.TIGHT_END, max: 1 },
    { round: 6, position: FantasyPosition.QUARTERBACK, max: 1 },
    { round: 6, position: FantasyPosition.TIGHT_END, max: 1 },
    { round: 6, position: FantasyPosition.RUNNING_BACK, max: 3 },
    { round: 6, position: FantasyPosition.WIDE_RECEIVER, max: 3 },
    { round: 16, position: FantasyPosition.QUARTERBACK, max: 2 },
    { round: 16, position: FantasyPosition.TIGHT_END, max: 2 },
    { round: 16, position: FantasyPosition.RUNNING_BACK, max: 5 },
    { round: 16, position: FantasyPosition.WIDE_RECEIVER, max: 5 },
];

export const nextPositionPicked = ( roster: Roster, roundNum: number, posCounts: PositionCounts ): FantasyPosition[] => {
    let availablePositions = new Set<FantasyPosition>([
        FantasyPosition.QUARTERBACK,
        FantasyPosition.RUNNING_BACK,
        FantasyPosition.WIDE_RECEIVER,
        FantasyPosition.TIGHT_END,
    ]);

    standardRosterBuild.forEach(rule => {
        if (roundNum <= rule.round) {
            const positionCount = roster[rule.position as keyof Roster]?.length || 0;
            if (positionCount >= rule.max) {
                availablePositions.delete(rule.position);
            }
        }
    });

    // Special case for early rounds to not over-draft TE/QB
    if (roundNum <= 2) {
        if (posCounts.TE && posCounts.TE >= 1) availablePositions.delete(FantasyPosition.TIGHT_END);
        if (posCounts.QB && posCounts.QB >= 1) availablePositions.delete(FantasyPosition.QUARTERBACK);
    }

    return Array.from(availablePositions);
}

export const predictNextPick = (
    availPlayersByAdp: Player[],
    settings: FantasySettings,
    boardSettings: BoardSettings,
    predictedPositions: FantasyPosition[],
    predicted: PredictedPicks,
    posCounts: PositionCounts,
    myPickNum: number,
    currPick: number,
    nextPick: number,
): { predicted: PredictedPicks; updatedCounts: PositionCounts, pickedPlayer: Player | null } => {
    const sortedAvailPlayers = sortPlayersByRank( availPlayersByAdp, settings, boardSettings, SortPlayersByMetric.Adp )

    const nextPlayer = sortedAvailPlayers.find( p => !predicted[p.id] && predictedPositions.includes( p.position as FantasyPosition ))
    
    if ( !nextPlayer ) {
        return { predicted, updatedCounts: posCounts, pickedPlayer: null }
    }

    const nextPos = nextPlayer.position as FantasyPosition
    const nextPosCount = posCounts[nextPos] || 0

    return {
        predicted: {
            ...predicted,
            [nextPlayer.id]: picksSinceCurrPick(currPick, nextPick, myPickNum, settings.numTeams),
        },
        updatedCounts: { ...posCounts, [nextPos]: nextPosCount + 1 },
        pickedPlayer: nextPlayer,
    };
}

export const picksSinceCurrPick = (currPick: number, nextPick: number, myPickNum: number, numTeams: number): number => {
    if ( currPick === nextPick && isMyPick(nextPick, myPickNum, numTeams) ) { 
        return 0
    }

    const myPicks = getMyPicksBetween( currPick, nextPick, myPickNum, numTeams )
    return myPicks.length + 1
}

// exclusive of startPick and inclusive endPick
export const getMyPicksBetween = ( startPick: number, endPick: number, myPickNum: number, numTeams: number ): number[] => {
    let myNextPick = startPick
    const myPicks = []
    
    // Special case: if startPick is 0 (before draft starts), find my first pick directly
    if (startPick === 0 && myPickNum <= endPick) {
        myPicks.push(myPickNum);
        myNextPick = myPickNum;
    }
    
    while ( myNextPick < endPick ) {
        myNextPick = getMyNextPick( myNextPick, myPickNum, numTeams )
        if ( myNextPick <= endPick ) {
            myPicks.push( myNextPick )
        }
    }

    return myPicks
}

export const getMyNextPick = ( pickNum: number, myPickNum: number, numTeams: number ): number => {
    const round = roundForPick( pickNum, numTeams )
    const pickInRound = getPickInRound( pickNum, numTeams )
    const myPickInRound = getMyPickInRound( myPickNum, pickNum, numTeams )
    if ( pickInRound < myPickInRound ) {
        return getMyAbsPickInRound( myPickNum, round, numTeams )
    } else {
        return getMyAbsPickInRound( myPickNum, round + 1, numTeams )
    }
}

export const getPickInRound = ( pickNum: number, numTeams: number ): number => {
    const rem = pickNum % numTeams
    return rem === 0 ? numTeams : rem
}

const getMyPickInRound = ( myPickNum: number, pickNum: number, numTeams: number ): number => {
    const round = roundForPick( pickNum, numTeams )
    return isEvenRound( round ) ? numTeams - myPickNum + 1 : myPickNum
}

const getMyAbsPickInRound = ( myPickNum: number, round: number, numTeams: number ): number => {
    let pickNum = ( round - 1 ) * numTeams
    pickNum += round % 2 === 0 ? numTeams - myPickNum + 1 : myPickNum
    return pickNum
}

export const roundForPick = ( pickNum: number, numTeams: number ): number => {
    return parseInt(String((pickNum - 1) / numTeams), 10) + 1
}

const isEvenRound = (round: number): boolean => round % 2 === 0

export const isMyPick = ( pickNum: number, myPickNum: number, numTeams: number ): boolean => {
    const round = roundForPick( pickNum, numTeams )
    const isEven = isEvenRound( round )
    const rem = pickNum % numTeams
    if ( isEven ) {
        const myEvenPick = numTeams - myPickNum + 1
        return myEvenPick === rem
    } else {
        const pickInRound = rem === 0 ? numTeams : rem
        return pickInRound === myPickNum
    }
}

// ignores current pick - pick 10 / my pick 10 / 10 teams = round 2
export const myCurrentRound = ( pickNum: number, myPickNum: number, numTeams: number ): number => {
    let round = roundForPick( pickNum, numTeams )
    const pickInRound = getPickInRound(pickNum, numTeams)
    const myPickInRound = getMyPickInRound(myPickNum, pickNum, numTeams )
    if ( pickInRound >= myPickInRound ) {
        round += 1
    }

    return round
}

// Round management

export const getPicksUntil = (myPickNum: number, currPick: number, numTeams: number): [number, number] => {
    const roundIdx = Math.floor( (currPick-1) / numTeams )
    const isEvenRound = roundIdx % 2 == 1
    const currRoundPick = currPick % numTeams === 0 ? 12 : currPick % numTeams
    const currMyPickNum = isEvenRound ? numTeams - myPickNum + 1 : myPickNum
    const nextMyPickNum = isEvenRound ? myPickNum : numTeams - myPickNum + 1

    let picksUntil, nextPicksUntil
    if ( currMyPickNum > currRoundPick + 1 ) {
      picksUntil = currMyPickNum - currRoundPick - 1
      nextPicksUntil = picksUntil + (numTeams - currMyPickNum + 1) + (nextMyPickNum - 1)
    } else {
      picksUntil = (numTeams - currRoundPick + 1) + (nextMyPickNum - 1) - 1
      nextPicksUntil = picksUntil + (numTeams - nextMyPickNum + 1) + (currMyPickNum - 1)
    }

    return [picksUntil, nextPicksUntil]
}

// helpers

var timer: NodeJS.Timeout | undefined = undefined

export const delay = ( action: () => void, timeout=400 ): void => {
  if ( timer ) {
    clearTimeout( timer )
  }
  timer = undefined
  timer = setTimeout(() => {
    if ( timer ) {
      clearTimeout( timer )
    }
    timer = undefined
    action()
  }, timeout )
}


