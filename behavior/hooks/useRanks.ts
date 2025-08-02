import { useState } from 'react'
import {
  removePlayerFromBoard,
  PlayerLibrary,
  PlayersByPositionAndTeam,
  PlayerRanks,
  addAvailPlayer,
  purgePlayerFromPlayerRanks,
  SortPlayersByMetric,
  sortPlayerRanksByRank,
  createPlayerRanks,
} from "../draft"
import { FantasySettings, Player, BoardSettings, ThirdPartyRanker, FantasyRanker } from '../../types'

interface UseRanksProps {
  settings: FantasySettings
}

export const useRanks = ({
  settings,
}: UseRanksProps) => {
  const [boardSettings, setBoardSettings] = useState<BoardSettings>({
    ranker: ThirdPartyRanker.HARRIS,
    adpRanker: ThirdPartyRanker.ESPN,
  })
  const [playerLib, setPlayerLib] = useState<PlayerLibrary>({})
  const [playersByPosByTeam, setPlayersByPosByTeam] = useState<PlayersByPositionAndTeam>({})
  const [playerRanks, setPlayerRanks] = useState<PlayerRanks>(createPlayerRanks( [], settings, boardSettings ))
  // const [posStatsByNumTeamByYear, setPosStatsByNumTeamByYear] = useState<PosStatsByNumTeamByYear>({})
  const noPlayers = Object.keys(playerLib).length === 0

  // funcs

  const onSetRanker = (ranker: FantasyRanker) => {
    setBoardSettings({ ...boardSettings, ranker })
  }
  const onSetAdpRanker = (adpRanker: FantasyRanker) => {
    setBoardSettings({ ...boardSettings, adpRanker })
  }
  const onCreatePlayerRanks = (players: Player[]) => {
    const nextPlayerRanks = createPlayerRanks( players, settings, boardSettings )
    setPlayerRanks(nextPlayerRanks)
  }
  const onRemovePlayerFromBoard = (player: Player) => {
    const nextPlayerRanks = removePlayerFromBoard( playerRanks, player )
    setPlayerRanks(nextPlayerRanks)
  }
  const onAddAvailPlayer = (player: Player) => {
    setPlayerRanks(addAvailPlayer( playerRanks, player, settings, boardSettings ))
  }
  const onPurgeAvailPlayer = (player: Player) => {
    setPlayerRanks(purgePlayerFromPlayerRanks( playerRanks, player, settings, boardSettings ))
  }
  const onApplyRankingSortBy = (byAdp: boolean) => {
    const sortBy = byAdp ? SortPlayersByMetric.Adp : SortPlayersByMetric.OverallOrPosRank
    const nextPlayerRanks = sortPlayerRanksByRank( playerRanks, settings, boardSettings, sortBy )
    setPlayerRanks( nextPlayerRanks )
  }

  return {
    // state
    boardSettings,
    playerLib, setPlayerLib,
    playersByPosByTeam, setPlayersByPosByTeam,
    playerRanks,
    settings,
    noPlayers,
    // funcs
    onRemovePlayerFromBoard,
    onAddAvailPlayer,
    onPurgeAvailPlayer,
    onApplyRankingSortBy,
    onCreatePlayerRanks,
    onSetRanker,
    onSetAdpRanker,
  }
}