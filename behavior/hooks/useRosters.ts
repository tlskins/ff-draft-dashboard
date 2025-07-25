import { useState, useEffect } from 'react'
import {
  addToRoster,
  calcCurrRoundPick,
  createRosters,
  getRoundIdxForPickNum,
  removeFromRoster,
  Roster,
} from '../draft'
import { Player } from '../../types'

interface UseRostersProps {
  defaultMyPickNum?: number,
  myPickNum?: number,
  numTeams?: number,
}

export const useRosters = ({
  defaultMyPickNum = 6,
  myPickNum,
  numTeams = 12,
}: UseRostersProps = {}) => {
  const [rosters, setRosters] = useState<Roster[]>([])
  const [viewRosterIdx, setViewRosterIdx] = useState(defaultMyPickNum-1)

  // functions
  const getRosterIdxFromPick = (pickNum: number) => {
    const roundIdx = getRoundIdxForPickNum(pickNum, numTeams)
    const isEvenRound = roundIdx % 2 == 1
    const currRoundPick = calcCurrRoundPick( pickNum, numTeams )
    const rosterIdx = isEvenRound ? numTeams-currRoundPick : currRoundPick-1

    return rosterIdx
  }
  const addPlayerToRoster = ( player: Player, pickNum: number ) => {
    const rosterIdx = getRosterIdxFromPick( pickNum )
    const newRosters = addToRoster( rosters, player, rosterIdx)
    setRosters( newRosters )
  }
  const removePlayerFromRoster = ( player: Player, pickNum: number ) => {
    const rosterIdx = getRosterIdxFromPick( pickNum )
    const nextRosters = removeFromRoster( rosters, player, rosterIdx )
    setRosters( nextRosters )
  }

  // effects
  useEffect(() => {
    setRosters(createRosters(numTeams))
  }, [numTeams])

  useEffect(() => {
    if ( myPickNum != null ) {
      setViewRosterIdx(myPickNum-1)
    }
  }, [myPickNum])

  return {
    // state
    rosters, setRosters,
    viewRosterIdx, setViewRosterIdx,
    // funcs
    getRosterIdxFromPick,
    addPlayerToRoster,
    removePlayerFromRoster,
  }
}