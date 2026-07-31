import {
  BoardSettings,
  FantasyPosition,
  FantasySettings,
} from "../../types"
import {
  getPickInRound,
  nextPositionPicked,
  PlayerRanks,
  PositionCounts,
  predictNextPick,
  Roster,
  roundForPick,
} from "../draft"


export type PredictedPicks = Record<string, number>

export interface GreedyPredictionInput {
  rosters: Roster[]
  playerRanks: PlayerRanks
  settings: FantasySettings
  boardSettings: BoardSettings
  currPick: number
  myPickNum: number
  predictUpToPick: number
}

export const calculatePositionCounts = (
  rosters: Roster[],
): PositionCounts => {
  const positionCounts: PositionCounts = {
    QB: 0,
    RB: 0,
    WR: 0,
    TE: 0,
    DST: 0,
    "": 0,
  }
  rosters.forEach((roster) => {
    Object.values(FantasyPosition).forEach((position) => {
      const players = roster[position as keyof Roster]
      if (Array.isArray(players)) {
        positionCounts[position] =
          (positionCounts[position] || 0) + players.length
      }
    })
  })
  return positionCounts
}

export const predictUpcomingPicksGreedy = ({
  rosters,
  playerRanks,
  settings,
  boardSettings,
  currPick,
  myPickNum,
  predictUpToPick,
}: GreedyPredictionInput): {
  predictedPicks: PredictedPicks
  finalPositionCounts: PositionCounts
} => {
  let predictedPicks: PredictedPicks = {}
  let positionCounts = calculatePositionCounts(rosters)
  let availablePlayers = [...playerRanks.availPlayersByAdp]

  for (
    let pickNum = currPick;
    pickNum < predictUpToPick;
    pickNum += 1
  ) {
    const round = roundForPick(pickNum, settings.numTeams)
    const pickInRound = getPickInRound(pickNum, settings.numTeams)
    const teamNumber = round % 2 === 0
      ? settings.numTeams - pickInRound + 1
      : pickInRound
    const roster = rosters[teamNumber - 1]
    if (!roster) {
      continue
    }

    const positions = nextPositionPicked(
      roster,
      round,
      positionCounts,
    )
    const prediction = predictNextPick(
      availablePlayers,
      settings,
      boardSettings,
      positions,
      predictedPicks,
      positionCounts,
      myPickNum,
      currPick,
      pickNum,
    )
    predictedPicks = prediction.predicted
    positionCounts = prediction.updatedCounts
    if (prediction.pickedPlayer) {
      availablePlayers = availablePlayers.filter(
        (player) => player.id !== prediction.pickedPlayer?.id,
      )
    }
  }

  return {
    predictedPicks,
    finalPositionCounts: positionCounts,
  }
}
