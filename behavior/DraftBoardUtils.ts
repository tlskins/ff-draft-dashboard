import { FantasyPosition } from "../types"
import { PlayerRanks } from "./draft"
import { DraftBoard, DraftBoardColumn, DraftBoardTitleCard, PredictedPicks, DraftBoardCard } from "../types/DraftBoardTypes"

const DraftBoardColumns = [FantasyPosition.QUARTERBACK, FantasyPosition.WIDE_RECEIVER, FantasyPosition.RUNNING_BACK, FantasyPosition.TIGHT_END, 'Purge']

export const getDraftBoard = (
  playerRanks: PlayerRanks,
  predictedPicks: PredictedPicks,
  myCurrRound: number,
): DraftBoard => {
  const draftBoard: DraftBoard = {
    standardView: DraftBoardColumns.map((columnGroup)=> {
      const posGroup = playerRanks[columnGroup as keyof PlayerRanks]
      return {
        columnTitle: columnGroup,
        cards: posGroup ? [...posGroup] as DraftBoardCard[] : []
      }
    }),
    predictAvailByRoundView: DraftBoardColumns.map((columnGroup)=> {
      const posGroup = playerRanks[columnGroup as keyof PlayerRanks]
      const futureRoundAvailPlayers = [1,2,3,4].map(futureRound => {
        // show top 3 options in each future round
        const topPlayersPerRound = posGroup.filter((player) => !predictedPicks[player.id] || predictedPicks[player.id] >= futureRound + 1).slice(0, 3)
        return [
          { bgColor: 'bg-gray-700', title: `Round ${myCurrRound + futureRound - 1}` } as DraftBoardTitleCard,
          ...topPlayersPerRound,
        ]
      }).flat() as DraftBoardCard[]

      return {
        columnTitle: columnGroup,
        cards: futureRoundAvailPlayers
      }
    }).filter(Boolean) as DraftBoardColumn[],
  }

  return draftBoard
}

// Shared icon types to avoid redeclaring in each component
export const getIconTypes = () => {
  const { TiDelete } = require('react-icons/ti')
  const { BsLink } = require('react-icons/bs')
  const { AiFillCheckCircle } = require('react-icons/ai')
  
  return {
    AnyTiDelete: TiDelete as any,
    AnyAiFillCheckCircle: AiFillCheckCircle as any,
    AnyBsLink: BsLink as any,
  }
} 