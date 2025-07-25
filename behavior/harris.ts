import { get } from "./api/rest"
import { HandleError } from "./errors"
import { HarrisData, Player } from "types";
import ranks from "./api/mocks/harris.json";


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

export const GetHarrisRanksMock = async (): Promise<HarrisData | false> => {
  try {
    const players = ranks.players.filter( (p: any) => [ 'QB', 'WR', 'RB', 'TE' ].includes(p.position))

    return { ...ranks, players } as HarrisData
  }
  catch( err ) {
    HandleError(err)
    return false
  }
}

export const GetFprosRanksMock = async (): Promise<HarrisData | false> => {
  try {
    const players = ranks.players.filter( (p: any) => [ 'QB', 'WR', 'RB', 'TE' ].includes(p.position))

    return { ...ranks, players } as HarrisData
  }
  catch( err ) {
    HandleError(err)
    return false
  }
}