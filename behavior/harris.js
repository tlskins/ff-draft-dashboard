import { get } from "./api/rest"
import { HandleError } from "./errors"


export const GetHarrisRanks = async () => {
  try {
    let { data: { players, posStatsByNumTeamByYear } } = await get("/harris-ranks")
    players = players.filter( p => [ 'QB', 'WR', 'RB', 'TE' ].includes(p.position))

    return { players, posStatsByNumTeamByYear }
  }
  catch( err ) {
    HandleError(err)
    return false
  }
}

export const GetFprosRanks = async () => {
  try {
    const { data: { players } } = await get("/fpros-ranks")

    return players.filter( p => [ 'QB', 'WR', 'RB', 'TE' ].includes(p.position))
  }
  catch( err ) {
    HandleError(err)
    return false
  }
}