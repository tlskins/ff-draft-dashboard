

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
    ranks.availPlayers.push( player )
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
    roster.Picks = roster.Picks.filter( id => id !== player.id )
    roster[player.position] = roster[player.position].filter( id => id !== player.id )

    return [
        ...rosters.slice(0, rosterIdx),
        roster,
        ...rosters.slice(rosterIdx+1, rosters.length),
    ]
}

// Roster 1x flex
export const nextPositionPicked = ( roster, roundNum, posCounts ) => {
    console.log('nextPositionPicked st', roster)
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
    console.log( 'nextPositionPicked', roundNum, posCounts, Object.keys( pos ) )

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
       return { predicted, updatedCounts }
   } else {
       return {
           predicted: { ...predicted, [playerId]: predictNum },
           updatedCounts: { ...posCounts, [hiRankPos]: posCount+1 }
        }
   }
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
