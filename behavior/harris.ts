import { get } from "./api/rest"
import { HandleError } from "./errors"
import { HarrisData, Player } from "types";


export const GetHarrisRanks = async (): Promise<HarrisData | false> => {
  try {
    let { data } = await get("/harris-ranks")
    const players = data.players.filter( (p: Player) => [ 'QB', 'WR', 'RB', 'TE' ].includes(p.position))

    return { ...data, players }
  }
  catch( err ) {
    HandleError(err)
    return false
  }
}

export const GetFprosRanks = async (): Promise<HarrisData | false> => {
  try {
    let { data } = await get("/fpros-ranks")
    const players = data.players.filter( (p: Player) => [ 'QB', 'WR', 'RB', 'TE' ].includes(p.position))

    return { ...data, players, }
  }
  catch( err ) {
    HandleError(err)
    return false
  }
}