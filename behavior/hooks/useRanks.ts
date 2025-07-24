import { useState, useEffect } from 'react'
import {
  createRanks,
  removePlayerFromRanks,
  addPlayerToRanks,
  purgePlayerFromRanks,
  sortRanks,
  Ranks,
  PlayerLibrary,
  PlayersByPositionAndTeam,
} from "../draft"
import { Player, PosStatsByNumTeamByYear } from '../../types'


export const useRanks = ({
  isStd = false,
}: { isStd?: boolean } = {}) => {
  const [playerLib, setPlayerLib] = useState<PlayerLibrary>({})
  const [playersByPosByTeam, setPlayersByPosByTeam] = useState<PlayersByPositionAndTeam>({})
  const [ranks, setRanks] = useState<Ranks>(createRanks([], isStd))
  const [isEspnRank, setIsEspnRank] = useState(false)
  const [posStatsByNumTeamByYear, setPosStatsByNumTeamByYear] = useState<PosStatsByNumTeamByYear>({})
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
  const onRemovePlayerFromRanks = (player: Player) => {
    const nextRanks = removePlayerFromRanks( ranks, player )
    setRanks(nextRanks)
  }
  const onAddPlayerToRanks = (player: Player) => {
    addPlayerToRanks( ranks, player )
    const nextRanks = sortRanks( ranks )
    setRanks(nextRanks)
  }
  const onPurgePlayerFromRanks = (player: Player) => {
    const nextRanks = purgePlayerFromRanks( ranks, player )
    setRanks(nextRanks)
  }
  const onSortRanksByEspn = (byEspn: boolean) => {
    const nextRanks = sortRanks( ranks, byEspn )
    setRanks( nextRanks )
    setIsEspnRank(byEspn)
  }

  // effects
  useEffect(() => {
    const nextRanks = createRanks( Object.values( playerLib ), isStd)
    setRanks(nextRanks)
}, [isStd, playerLib])

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