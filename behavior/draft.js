import Moment from 'moment'

// helpers

const min = (a, b, c) => {
return Math.min(a, Math.min(b, c))
}
  
const levenshteinDistance = (str1, str2) => {
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

const validPositions = ['QB','RB','WR','TE']

export const parseEspnDraftEvents = draftPicksData => {
    return draftPicksData.map( data => {
        const imgMatch = data.imgUrl.match(/headshots\/nfl\/players\/full\/(\d+)\.png/)
        return {
            ...data,
            id: imgMatch && parseInt(imgMatch[1]) || null,
            pickStr: data.pick,
            round: parseInt(data.pick.match(/^R(\d+), P(\d+) /)[1]),
            pick: parseInt(data.pick.match(/^R(\d+), P(\d+) /)[2]),
        }
    })
}

const normalizeNflName = name => name.toLowerCase().replace(/[^a-zA-Z\s]/g, '')
    .replace('iii', '')
    .replace('ii', '')
    .replace(' jr', '')
    .trim()
const playerToNflName = player => `${ player.firstName[0].toLowerCase() } ${ normalizeNflName( player.lastName )}`
const parseNflTeamToPlayerTeam = nflTeam => {
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

export const parseNflDraftEvents = ( draftPicksData, playersByPosByTeam ) => {
    return draftPicksData.map(draftEvent => {
        console.log('matching nfl event', draftEvent, playersByPosByTeam)
        const { name, team: nflTeam, position, pick: ovrPick } = draftEvent
        const team = parseNflTeamToPlayerTeam( nflTeam )
        if ( !validPositions.includes( position )) {
            return
        }

        const posPlayers = playersByPosByTeam[position][team] || []
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

export const createPlayerLibrary = players => players.reduce((acc, player) => {
    acc[player.id] = player
    return acc
}, {})

export const allPositions = ['QB', 'RB', 'WR', 'TE']
export const rankTypes = ['harris', 'espn']

export const addDefaultTiers = (playerLib, isStd, numTeams) => {
    const players = Object.values(playerLib)
    players.forEach( player => {
        const rank = isStd ? player.customStdRank : player.customPprRank
        if ( rank ) {
            if ( ['RB', 'WR'].includes( player.position )) {
                player.tier = parseInt(rank / numTeams) + 1
                playerLib[player.id] = player
            } else {
                player.tier = Math.min( numTeams, rank )
                playerLib[player.id] = player
            }
        }
    })

    return playerLib
}

// rank tiers are statistical wr1, wr2, etc based on num teams
// differs from tiers as there can be multiple tiers within wr1, wr2 etc
export const addRankTiers = (playerLib, numTeams, posStatsByNumTeamByYear) => {
    const arePosStatsEmpty = Object.keys( posStatsByNumTeamByYear ).length === 0
    const lastYear = parseInt(Moment().format('YYYY')) - 1
    console.log('addRankTiers', posStatsByNumTeamByYear)

    Object.keys(playerLib).forEach( playerId => {
        // add rank tiers
        let player = playerLib[playerId]
        if (['WR','RB'].includes(player.position)) {
            player.stdRankTier = player.customStdRank ? parseInt(player.customStdRank / numTeams) + 1 : null
            player.pprRankTier = player.customPprRank ? parseInt(player.customPprRank / numTeams) + 1 : null
        } else {
            player.stdRankTier = player.customStdRank ? Math.min(player.customStdRank, numTeams) : null
            player.pprRankTier = player.customPprRank ? Math.min(player.customPprRank, numTeams) : null
        }

        // add last year tier
        if ( !arePosStatsEmpty ) {
            const posStats = posStatsByNumTeamByYear[numTeams][lastYear][player.position]
            const seasonStats = player.seasonStats.find( ssnStats => ssnStats.year === lastYear )
            if ( seasonStats ) {
                if ( seasonStats.totalPoints >= posStats.tier1Stats.minTotalPts ) {
                    player.lastYrTier = 1
                } else if ( seasonStats.totalPoints >= posStats.tier2Stats.minTotalPts ) {
                    player.lastYrTier = 2
                } else if ( seasonStats.totalPoints >= posStats.tier3Stats.minTotalPts ) {
                    player.lastYrTier = 3
                } else if ( seasonStats.totalPoints >= posStats.tier4Stats.minTotalPts ) {
                    player.lastYrTier = 4
                } else if ( seasonStats.totalPoints >= posStats.tier5Stats.minTotalPts ) {
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

export const calcCurrRoundPick = ( pickNum, numTeams ) => {
    const roundRem = pickNum % numTeams
    return roundRem === 0 ? numTeams : roundRem
}

export const getRoundIdxForPickNum = (pickNum, numTeams) => Math.floor((pickNum-1) / numTeams)

// ranks

export const createRanks = (players, isStd) => {
    const ranks = {
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

export const removePlayerFromRanks = ( ranks, player ) => {
    rankTypes.forEach( rankType => {
        const posRank = ranks[rankType][player.position]
        ranks[rankType][player.position] = posRank.filter( p => p[0] !== player.id )
    })
    ranks.availPlayers = ranks.availPlayers.filter( p => p.id !== player.id )
    ranks.purge = ranks.purge.filter( p => p[0] !== player.id )

    return { ...ranks }
}

export const addPlayerToRanks = (ranks, player) => {
    const { isStd } = ranks
    if ( isStd && player.customStdRank ) {
        ranks.harris[player.position].push([player.id, player.customStdRank, player.espnAdp])
    } else if ( !isStd && player.customPprRank ) {
        ranks.harris[player.position].push([player.id, player.customPprRank, player.espnAdp])
    }
    if ( player.espnAdp ) ranks.espn[player.position].push([player.id, player.espnAdp, player.espnAdp])
    ranks.availPlayers.push( player )
}

export const sortRanks = (ranks, byEspn = false) => {
    rankTypes.forEach( rankType => {
        allPositions.forEach( pos => {
            if ( byEspn ) {
                ranks[rankType][pos] = ranks[rankType][pos].sort(([,,rankA],[,,rankB]) => (rankA || 9999) - (rankB || 9999))
            } else {
                ranks[rankType][pos] = ranks[rankType][pos].sort(([,rankA],[,rankB]) => (rankA || 9999) - (rankB || 9999))
            }
        })
    })

    return { ...ranks }
}

export const purgePlayerFromRanks = ( ranks, player ) => {
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

export const createRosters = numTeams => {
    const rosters = new Array(numTeams).fill({
        Picks: [],
        QB: [],
        RB: [],
        WR: [],
        TE: []
    })

    return rosters
}

export const addToRoster = ( rosters, player, rosterIdx ) => {
    const roster = rosters[rosterIdx]
    if ( roster.Picks.includes(player.id)) {
        return rosters
    }

    return [
        ...rosters.slice(0, rosterIdx),
        {
            ...roster,
            Picks: [...roster.Picks, player.id],
            [player.position]: [...roster[player.position], player.id],
        },
        ...rosters.slice(rosterIdx+1, rosters.length),
    ]
}

export const removeFromRoster = ( rosters, player, rosterIdx ) => {
    const roster = rosters[rosterIdx]
    const newRosters = [
        ...rosters.slice(0, rosterIdx),
        {
            ...roster,
            Picks: roster.Picks.filter( id => id !== player.id ),
            [player.position]: roster[player.position].filter( id => id !== player.id ),
        },
        ...rosters.slice(rosterIdx+1, rosters.length),
    ]

    return newRosters
}

// Roster = 1x flex
export const nextPositionPicked = ( roster, roundNum, posCounts ) => {
    let pos = { QB: 1, WR: 1, RB: 1, TE: 1 }
    if ( roundNum <= 3 ) {
        if ( roster.QB.length >= 1 ) delete pos.QB
        if ( roster.TE.length >= 1 ) delete pos.TE
        if ( roundNum <= 2 && posCounts.TE >= 1 ) delete pos.TE
        if ( roundNum <= 2 && posCounts.QB >= 1 ) delete pos.QB
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

    return Object.keys( pos )
}

export const nextPickedPlayerId = ( ranks, positions, predicted, predictNum, posCounts ) => {
    let hiRank, hiRankPos
    positions.forEach( pos => {
        const posRanks = ranks.espn[pos]
        for (let i=0; i<posRanks.length; i++) {
            if ( predicted[posRanks[i][0]] ) continue
            if  ( !hiRank || hiRank[1] > posRanks[i][1]) {
                hiRank = posRanks[i]
                hiRankPos = pos
                break
            }
        }
   })
   const playerId = hiRank?.[0]
   const posCount = posCounts[hiRankPos]

   if ( !playerId ) {
       return { predicted, updatedCounts: posCounts }
   } else {
       return {
           predicted: { ...predicted, [playerId]: predictNum },
           updatedCounts: { ...posCounts, [hiRankPos]: posCount+1 }
        }
   }
}

// Round management

export const getPicksUntil = (myPickNum, currPick, numTeams) => {
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

var timer = undefined

export const delay = ( action, timeout=400 ) => {
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
