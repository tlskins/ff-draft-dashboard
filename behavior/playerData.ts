import { Rankings } from "types";
import ranks from "./playerData.json";
import { toCamelCase } from "./presenters";


export const getPlayerData = (): Rankings => {
  return toCamelCase(ranks) as Rankings;
}
