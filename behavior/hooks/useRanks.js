import { useState, useEffect } from 'react'
import {
  createRanks,
  removePlayerFromRanks,
  addPlayerToRanks,
  purgePlayerFromRanks,
  sortRanks,
} from "../draft"


export const useRanks = ({
  isStd,
} = {}) => {
  const [playerLib, setPlayerLib] = useState({})
  const [playersByPosByTeam, setPlayersByPosByTeam] = useState({})
  const [ranks, setRanks] = useState(createRanks([], isStd))
  const [isEspnRank, setIsEspnRank] = useState(false)
  const [posStatsByNumTeamByYear, setPosStatsByNumTeamByYear] = useState({})
  const { availPlayers, harris, purge } = ranks
  const playerRanks = [
    [harris.QB, "QB"],
    [harris.RB, "RB"],
    [harris.WR, "WR"],
    [harris.TE, "TE"],
    [purge, "Purge"],
  ]
  const noPlayers = Object.keys(playerLib).length === 0

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
    playersByPosByTeam, setPlayersByPosByTeam,
    ranks, setRanks,
    posStatsByNumTeamByYear, setPosStatsByNumTeamByYear,
    isEspnRank, setIsEspnRank,
    availPlayers, harris, purge,
    playerRanks,
    noPlayers,
    // funcs
    onRemovePlayerFromRanks,
    onAddPlayerToRanks,
    onPurgePlayerFromRanks,
    onSortRanksByEspn,
  }
}