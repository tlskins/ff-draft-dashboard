

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
        },
        espn: {
            QB: [],
            RB: [],
            WR: [],
            TE: [],
        },
        purge: [],
        availPlayers: players,
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
    ranks.purge = ranks.purge.filter( p => p.id !== player.id )

    return { ...ranks }
}

export const addPlayerToRanks = (ranks, player) => {
    const { isStd } = ranks
    if ( isStd && player.harrisStdRank ) {
        ranks.harris[player.position].push([player.id, player.harrisStdRank])
    } else if ( !isStd && player.harrisPprRank ) {
        ranks.harris[player.position].push([player.id, player.harrisPprRank])
    }
    if ( player.espnAdp ) ranks.espn[player.position].push([player.id, player.espnAdp])
}

export const sortRanks = ranks => {
    rankTypes.forEach( rankType => {
        allPositions.forEach( pos => {
            ranks[rankType][pos] = ranks[rankType][pos].sort(([,rankA],[,rankB]) => rankA - rankB)
        })
    })

    return { ...ranks }
}

export const purgePlayerFromRanks = ( ranks, player ) => {
    console.log('purgePlayerFromRanks', ranks)
    const purgeIdx = ranks.purge.findIndex( ([id,]) => id === player.id )
    if ( purgeIdx === -1 ) {
        ranks.purge.push( [player.id] )
        ranks = removePlayerFromRanks( ranks, player )
    } else {
        ranks.purge = ranks.purge.filter( ([id,]) => id !== player.id )
        addPlayerToRanks( ranks, player )
        ranks = sortRanks( ranks )
    }
    console.log('purgePlayerFromRanks after', ranks)

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

