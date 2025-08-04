import { FantasyPosition, Rankings } from "types";
import ranks from "./playerData.json";
import { toCamelCase } from "./presenters";


export const getPlayerData = (): Rankings => {
  const skiplist = Object.values(FantasyPosition);
  console.log('skiplist', skiplist)
  return toCamelCase(ranks, skiplist) as Rankings;
}
