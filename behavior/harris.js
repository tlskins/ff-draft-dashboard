import { get } from "./api/rest"
import { HandleError } from "./errors"


export const GetHarrisRanks = async () => {
  try {
    const { data } = await get("/harris-ranks")
    return data
  }
  catch( err ) {
    HandleError(err)
    return false
  }
}