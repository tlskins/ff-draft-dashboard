import Moment from 'moment'
import { Player, Position, PosStatsByNumTeamByYear } from 'types'

// Type Definitions
interface EspnDraftEventRaw {
    imgUrl: string
    pick: string
    [key: string]: any
}

interface EspnDraftEventParsed {
    imgUrl: string
    [key: string]: any
    id: number | null
    pickStr: string
    round: number
    pick: number
}

interface NflDraftEvent {
    name: string
    team: string
    position: Position | string
    pick: number
}

interface ParsedNflDraftEvent {
    id: string
    ovrPick: number
}

export type PlayerLibrary = {
    [id: string]: Player
}

export type PlayersByPositionAndTeam = {
    [pos in Position]?: {
        [team: string]: Player[]
    }
}

type RankTuple = [string, number, number]
type PurgeTuple = [string]

type PositionRanks = {
    [pos in Position]?: RankTuple[]
}

export interface Ranks {
    isStd: boolean
    harris: PositionRanks
    espn: PositionRanks
    purge: PurgeTuple[]
    availPlayers: Player[]
}

interface Roster {
    Picks: string[]
    QB: string[]
    RB: string[]
    WR: string[]
    TE: string[]
}

type PositionCounts = {
    [key in Position]?: number
}

type PredictedPicks = {
    [playerId: string]: number
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

const validPositions: Position[] = ['QB', 'RB', 'WR', 'TE']

export const parseEspnDraftEvents = (draftPicksData: EspnDraftEventRaw[]): EspnDraftEventParsed[] => {
    return draftPicksData.map( data => {
        const imgMatch = data.imgUrl.match(/headshots\/nfl\/players\/full\/(\d+)\.png/)
        const pickMatch = data.pick.match(/^R(\d+), P(\d+) /)
        return {
            ...data,
            id: imgMatch && parseInt(imgMatch[1]),
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

export const parseNflDraftEvents = ( draftPicksData: NflDraftEvent[], playersByPosByTeam: PlayersByPositionAndTeam ): ParsedNflDraftEvent[] => {
    return draftPicksData.map(draftEvent => {
        console.log('matching nfl event', draftEvent, playersByPosByTeam)
        const { name, team: nflTeam, position, pick: ovrPick } = draftEvent
        const team = parseNflTeamToPlayerTeam( nflTeam )
        if ( !validPositions.includes( position as Position )) {
            return null
        }

        const posPlayers = playersByPosByTeam[position as Position]?.[team] || []
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

// players

export const createPlayerLibrary = (players: Player[]): PlayerLibrary => players.reduce((acc: PlayerLibrary, player) => {
    acc[player.id] = player
    return acc
}, {})

export const allPositions: Position[] = ['QB', 'RB', 'WR', 'TE']
export const rankTypes = ['harris', 'espn']

export const addDefaultTiers = (playerLib: PlayerLibrary, isStd: boolean, numTeams: number): PlayerLibrary => {
    const players = Object.values(playerLib)
    if ( players.some( p => p.tier )) {
        return playerLib
    }
    players.forEach( player => {
        const rank = isStd ? player.customStdRank : player.customPprRank
        if ( rank ) {
            if ( ['RB', 'WR'].includes( player.position )) {
                player.tier = (parseInt(String(rank / numTeams)) + 1).toString()
                playerLib[player.id] = player
            } else {
                player.tier = Math.min( numTeams, rank ).toString()
                playerLib[player.id] = player
            }
        }
    })

    return playerLib
}

// rank tiers are statistical wr1, wr2, etc based on num teams
// differs from tiers as there can be multiple tiers within wr1, wr2 etc
export const addRankTiers = (playerLib: PlayerLibrary, numTeams: number, posStatsByNumTeamByYear: PosStatsByNumTeamByYear): void => {
    const arePosStatsEmpty = Object.keys( posStatsByNumTeamByYear ).length === 0
    const lastYear = parseInt(Moment().format('YYYY'), 10) - 1
    console.log('addRankTiers', posStatsByNumTeamByYear)

    Object.keys(playerLib).forEach( playerId => {
        // add rank tiers
        let player = playerLib[playerId]
        if (['WR','RB'].includes(player.position)) {
            player.stdRankTier = player.customStdRank ? parseInt(String(player.customStdRank / numTeams)) + 1 : 0
            player.pprRankTier = player.customPprRank ? parseInt(String(player.customPprRank / numTeams)) + 1 : 0
        } else {
            player.stdRankTier = player.customStdRank ? Math.min(player.customStdRank, numTeams) : 0
            player.pprRankTier = player.customPprRank ? Math.min(player.customPprRank, numTeams) : 0
        }

        // add last year tier
        if ( !arePosStatsEmpty ) {
            const posStats = posStatsByNumTeamByYear[numTeams][lastYear][player.position]
            const seasonStats = player.seasonStats.find( ssnStats => ssnStats.year === lastYear )
            if ( seasonStats && posStats ) {
                if (
                    posStats.tier1Stats &&
                    seasonStats.totalPoints >= posStats.tier1Stats.minTotalPts
                ) {
                    player.lastYrTier = 1
                } else if (
                    posStats.tier2Stats &&
                    seasonStats.totalPoints >= posStats.tier2Stats.minTotalPts
                ) {
                    player.lastYrTier = 2
                } else if (
                    posStats.tier3Stats &&
                    seasonStats.totalPoints >= posStats.tier3Stats.minTotalPts
                ) {
                    player.lastYrTier = 3
                } else if (
                    posStats.tier4Stats &&
                    seasonStats.totalPoints >= posStats.tier4Stats.minTotalPts
                ) {
                    player.lastYrTier = 4
                } else if (
                    posStats.tier5Stats &&
                    seasonStats.totalPoints >= posStats.tier5Stats.minTotalPts
                ) {
                    player.lastYrTier = 5
                } else {
                    player.lastYrTier = 6
                }
            }
        }

        // add back to lib
        playerLib[playerId] = player
    })
}

// rosters

export const calcCurrRoundPick = ( pickNum: number, numTeams: number ): number => {
    const roundRem = pickNum % numTeams
    return roundRem === 0 ? numTeams : roundRem
}

export const getRoundIdxForPickNum = (pickNum: number, numTeams: number): number => Math.floor((pickNum-1) / numTeams)

// ranks

export const createRanks = (players: Player[], isStd: boolean): Ranks => {
    const ranks: Ranks = {
        isStd,
        harris: {
            QB: [],
            RB: [],
            WR: [],
            TE: [],
        },
        espn: {
            QB: [],
            RB: [],
            WR: [],
            TE: [],
        },
        purge: [],
        availPlayers: [],
    }
    players.forEach( player => addPlayerToRanks( ranks, player ))
    sortRanks( ranks )

    return ranks
}

export const removePlayerFromRanks = ( ranks: Ranks, player: Player ): Ranks => {
    rankTypes.forEach( rankType => {
        const posRank = ranks[rankType as 'harris' | 'espn'][player.position]
        if (posRank) {
            ranks[rankType as 'harris' | 'espn'][player.position] = posRank.filter( p => p[0] !== player.id )
        }
    })
    ranks.availPlayers = ranks.availPlayers.filter( p => p.id !== player.id )
    ranks.purge = ranks.purge.filter( p => p[0] !== player.id )

    return { ...ranks }
}

export const addPlayerToRanks = (ranks: Ranks, player: Player): void => {
    const { isStd } = ranks
    const harrisRanks = ranks.harris[player.position]
    const espnRanks = ranks.espn[player.position]

    if ( isStd && player.customStdRank && harrisRanks ) {
        harrisRanks.push([player.id, player.customStdRank, player.espnAdp || 0])
    } else if ( !isStd && player.customPprRank && harrisRanks ) {
        harrisRanks.push([player.id, player.customPprRank, player.espnAdp || 0])
    }
    if ( player.espnAdp && espnRanks ) {
        espnRanks.push([player.id, player.espnAdp, player.espnAdp])
    }
    ranks.availPlayers.push( player )
}

export const sortRanks = (ranks: Ranks, byEspn = false): Ranks => {
    rankTypes.forEach( rankType => {
        allPositions.forEach( pos => {
            const posRanks = ranks[rankType as 'harris' | 'espn'][pos]
            if ( posRanks ) {
                if ( byEspn ) {
                    ranks[rankType as 'harris' | 'espn'][pos] = posRanks.sort(([,,rankA],[,,rankB]) => (rankA || 9999) - (rankB || 9999))
                } else {
                    ranks[rankType as 'harris' | 'espn'][pos] = posRanks.sort(([,rankA],[,rankB]) => (rankA || 9999) - (rankB || 9999))
                }
            }
        })
    })

    return { ...ranks }
}

export const purgePlayerFromRanks = ( ranks: Ranks, player: Player ): Ranks => {
    const purgeIdx = ranks.purge.findIndex( ([id,]) => id === player.id )
    if ( purgeIdx === -1 ) {
        ranks = removePlayerFromRanks( ranks, player )
        ranks.purge.push( [player.id] )
    } else {
        ranks.purge = ranks.purge.filter( ([id,]) => id !== player.id )
        addPlayerToRanks( ranks, player )
        ranks = sortRanks( ranks )
    }

    return { ...ranks }
}

// Rosters

export const createRosters = (numTeams: number): Roster[] => {
    const rosters = new Array(numTeams).fill(null).map(() => ({
        Picks: [],
        QB: [],
        RB: [],
        WR: [],
        TE: []
    }))

    return rosters
}

export const addToRoster = ( rosters: Roster[], player: Player, rosterIdx: number ): Roster[] => {
    const roster = rosters[rosterIdx]
    if ( roster.Picks.includes(player.id)) {
        return rosters
    }

    return [
        ...rosters.slice(0, rosterIdx),
        {
            ...roster,
            Picks: [...roster.Picks, player.id],
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
            Picks: roster.Picks.filter( id => id !== player.id ),
            [player.position]: roster[player.position as 'QB' | 'RB' | 'WR' | 'TE'].filter( id => id !== player.id ),
        },
        ...rosters.slice(rosterIdx+1, rosters.length),
    ]

    return newRosters
}

// Roster = 1x flex
export const nextPositionPicked = ( roster: Roster, roundNum: number, posCounts: PositionCounts ): Position[] => {
    let pos: PositionCounts = { QB: 1, WR: 1, RB: 1, TE: 1 }
    if ( roundNum <= 3 ) {
        if ( roster.QB.length >= 1 ) delete pos.QB
        if ( roster.TE.length >= 1 ) delete pos.TE
        if ( roundNum <= 2 && posCounts.TE && posCounts.TE >= 1 ) delete pos.TE
        if ( roundNum <= 2 && posCounts.QB && posCounts.QB >= 1 ) delete pos.QB
    } else if ( roundNum <= 6 ) {
        if ( roster.QB.length >= 1 ) delete pos.QB
        if ( roster.TE.length >= 1 ) delete pos.TE
        if ( roster.RB.length >= 3 ) delete pos.RB
        if ( roster.WR.length >= 3 ) delete pos.WR
    } else {
        if ( roster.QB.length >= 2 ) delete pos.QB
        if ( roster.TE.length >= 2 ) delete pos.TE
        if ( roster.RB.length >= 5 ) delete pos.RB
        if ( roster.WR.length >= 5 ) delete pos.WR
    }
    // console.log( 'nextPositionPicked', roundNum, posCounts, Object.keys( pos ) )

    return Object.keys( pos ) as Position[]
}

export const nextPickedPlayerId = ( ranks: Ranks, positions: Position[], predicted: PredictedPicks, posCounts: PositionCounts, myPickNum: number, currPick: number, nextPick: number, numTeams: number ): { predicted: PredictedPicks; updatedCounts: PositionCounts } => {
    let hiRank: RankTuple | undefined;
    let hiRankPos: Position | undefined;
    positions.forEach((pos) => {
        const posRanks = ranks.espn[pos];
        if (posRanks) {
            for (let i = 0; i < posRanks.length; i++) {
                if (predicted[posRanks[i][0]]) continue;
                if (!hiRank || hiRank[1] > posRanks[i][1]) {
                    hiRank = posRanks[i];
                    hiRankPos = pos;
                    break;
                }
            }
        }
    });
    const playerId = hiRank?.[0];

    if (!playerId || !hiRankPos) {
        return { predicted, updatedCounts: posCounts };
    } else {
        const posCount = posCounts[hiRankPos] || 0;
        return {
            predicted: {
                ...predicted,
                [playerId]: picksSinceCurrPick(currPick, nextPick, myPickNum, numTeams),
            },
            updatedCounts: { ...posCounts, [hiRankPos]: posCount + 1 },
        };
    }
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

const getPickInRound = ( pickNum: number, numTeams: number ): number => {
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
