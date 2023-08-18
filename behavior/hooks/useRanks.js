import { useMemo, useState, useEffect } from 'react'
import {
  createRanks,
  removePlayerFromRanks,
  addPlayerToRanks,
  purgePlayerFromRanks,
  sortRanks,
  nextPositionPicked,
  nextPickedPlayerId,
  allPositions,
  getPicksUntil,
} from "../draft"


export const useRanks = ({
  isStd,
} = {}) => {
  const [playerLib, setPlayerLib] = useState({})
  const [ranks, setRanks] = useState(createRanks([], isStd))
  const [isEspnRank, setIsEspnRank] = useState(false)
  const { availPlayers, harris, purge } = ranks
  const playerRanks = [
    [harris.QB, "QB"],
    [harris.RB, "RB"],
    [harris.WR, "WR"],
    [harris.TE, "TE"],
    [purge, "Purge"],
  ]

  // funcs
  const onRemovePlayerFromRanks = player => {
    const nextRanks = removePlayerFromRanks( ranks, player )
    setRanks(nextRanks)
  }
  const onAddPlayerToRanks = player => {
    addPlayerToRanks( ranks, player )
    const nextRanks = sortRanks( ranks )
    setRanks(nextRanks)
  }
  const onPurgePlayerFromRanks = player => {
    const nextRanks = purgePlayerFromRanks( ranks, player )
    setRanks(nextRanks)
  }
  const onSortRanksByEspn = byEspn => {
    const nextRanks = sortRanks( ranks, byEspn )
    setRanks( nextRanks )
    setIsEspnRank(byEspn)
  }

  // effects
  useEffect(() => {
    const nextRanks = createRanks( Object.values( playerLib ), isStd)
    setRanks(nextRanks)
}, [isStd])

  return {
    // state
    playerLib, setPlayerLib,
    ranks, setRanks,
    isEspnRank, setIsEspnRank,
    availPlayers, harris, purge,
    playerRanks,
    // funcs
    onRemovePlayerFromRanks,
    onAddPlayerToRanks,
    onPurgePlayerFromRanks,
    onSortRanksByEspn,
  }
}