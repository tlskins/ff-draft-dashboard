

export const createPlayerLibrary = players => players.reduce((acc, player) => {
    acc[player.id] = player
    return acc
}, {})

// const players = [
//     {id: 1, position: 'QB', harrisPprRank: 2, espnAdp: 3},
//     {id: 2, position: 'QB', harrisPprRank: 1, espnAdp: 2},
//     {id: 3, position: 'QB', harrisPprRank: undefined, espnAdp: 1},
//     {id: 4, position: 'QB', harrisPprRank: 5, espnAdp: undefined},
// ]

export const allPositions = ['QB', 'RB', 'WR', 'TE']
export const rankTypes = ['harris', 'espn']

// ranks

export const createRanks = (players, isStd) => {
    const ranks = {
        isStd,
        harris: {
            QB: [],
            RB: [],
            WR: [],
            TE: [],
            Purge: [],
        },
        espn: {
            QB: [],
            RB: [],
            WR: [],
            TE: [],
            Purge: [],
        },
        availPlayers: players,
    }
    players.forEach( p => {
        if ( isStd && p.harrisStdRank ) {
            ranks.harris[p.position].push([p.id, p.harrisStdRank])
        } else if ( !isStd && p.harrisPprRank ) {
            ranks.harris[p.position].push([p.id, p.harrisPprRank])
        }
        if ( p.espnAdp ) ranks.espn[p.position].push([p.id, p.espnAdp])
    })
    rankTypes.forEach( rankType => {
        allPositions.forEach( pos => {
            console.log('createRanks', rankType, pos, ranks[rankType][pos])
            ranks[rankType][pos] = ranks[rankType][pos].sort(([,rankA],[,rankB]) => rankA - rankB)
        })
    })

    return ranks
}

export const removePlayerFromRanks = ( ranks, player ) => {
    rankTypes.forEach( rankType => {
        const posRank = ranks[rankType][player.position]
        ranks[rankType][player.position] = posRank.filter( p => p[0] !== player.id )
    })
    ranks.availPlayers = ranks.availPlayers.filter( p => p.id !== player.id )

    return { ...ranks }
}

export const addPlayerToRanks = ( ranks, player ) => {
    rankTypes.forEach( rankType => {
        const posRank = ranks[rankType][player.position]
        ranks[rankType][player.position] = posRank.push([player])
    })
    ranks.availPlayers.push(player)

    return { ...ranks }
}

export const purgePlayerFromRanks = ( ranks, player ) => {
    const purgeIdx = ranks.Purge.findIndex( p => p.id === player.id )
    if ( purgeIdx === -1 ) {
        ranks.Purge = ranks.Purge.push( player.id )
    } else {
        ranks.Purge = ranks.Purge.filter( id => id !== player.id )
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
    roster.Picks.push(player.id)
    roster[player.position].push(player.id)

    return [
        ...rosters.slice(0, rosterIdx),
        roster,
        ...rosters.slice(rosterIdx+1, rosters.length),
    ]
}

export const removeFromRoster = ( rosters, player, rosterIdx ) => {
    const roster = rosters[rosterIdx]
    roster.Picks = roster.Picks.filter( id => id !== player.id )
    roster[player.position] = roster[player.position].filter( id => id !== player.id )

    return [
        ...rosters.slice(0, rosterIdx),
        roster,
        ...rosters.slice(rosterIdx+1, rosters.length),
    ]
}




// class Ranks {
//     constructor(players, isStd) {
//         this.allPositions = ['QB', 'RB', 'WR', 'TE']
//         this.rankTypes = ['harris', 'espn']
//         this.harris = {
//             QB: [],
//             RB: [],
//             WR: [],
//             TE: [],
//             Purge: [],
//         }
//         this.espn = {
//             QB: [],
//             RB: [],
//             WR: [],
//             TE: [],
//             Purge: [],
//         }
        
//         const playerLib = players.reduce((acc, p) => {
//             acc[p.id] = p
//             if ( isStd && p.harrisStdRank ) {
//                 this.harris[p.position].push([p.id, p.harrisStdRank])
//             } else if ( !isStd && p.harrisPprRank ) {
//                 this.harris[p.position].push([p.id, p.harrisPprRank])
//             }
//             if ( p.espnAdp ) this.espn[p.position].push([p.id, p.espnAdp])
//             return acc
//         }, {})
//         this.playerLib = playerLib
//         this.rankTypes.forEach( rankType => {
//             this.allPositions.forEach( pos => {
//                 console.log(rankType, pos, this[rankType][pos])
//                 this[rankType][pos] = this[rankType][pos].sort(([,rankA],[,rankB]) => rankA - rankB)
//             })
//         })
//     }

//     addPlayer( player ) {

//     }
// }