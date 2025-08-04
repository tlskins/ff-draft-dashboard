import { useState, useEffect } from 'react'
import {
  addToRoster,
  calcCurrRoundPick,
  getRoundIdxForPickNum,
  removePlayerFromBoard,
  PlayerLibrary,
  PlayersByPositionAndTeam,
  PlayerRanks,
  addAvailPlayer,
  purgePlayerFromPlayerRanks,
  SortPlayersByMetric,
  sortPlayerRanksByRank,
  createPlayerRanks,
  Roster,
  createRosters,
  removeFromRoster,
} from "../draft"
import { FantasySettings, Player, BoardSettings, ThirdPartyRanker, FantasyRanker } from '../../types'

interface UseRanksProps {
  settings: FantasySettings
  defaultMyPickNum?: number,
  myPickNum?: number,
}

export const useRanks = ({
  settings,
  defaultMyPickNum = 6,
  myPickNum,
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

  // TODO - 350 should come from player length in backend
  const [draftHistory, setDraftHistory] = useState<(string | null)[]>(
    new Array(350).fill(null)
  );

  // rosters

  const [rosters, setRosters] = useState<Roster[]>([])
  const [viewRosterIdx, setViewRosterIdx] = useState(defaultMyPickNum-1)

  useEffect(() => {
    setRosters(createRosters(settings.numTeams))
  }, [settings.numTeams])

  useEffect(() => {
    if ( myPickNum != null ) {
      setViewRosterIdx(myPickNum-1)
    }
  }, [myPickNum])

  const getRosterIdxFromPick = (pickNum: number) => {
    const roundIdx = getRoundIdxForPickNum(pickNum, settings.numTeams)
    const isEvenRound = roundIdx % 2 == 1
    const currRoundPick = calcCurrRoundPick( pickNum, settings.numTeams )
    const rosterIdx = isEvenRound ? settings.numTeams-currRoundPick : currRoundPick-1

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

  // draft history

  const onDraftPlayer = (playerId: string, pickNum: number): void => {
    draftHistory[pickNum - 1] = playerId;
    setDraftHistory(draftHistory);
    const player = playerLib[playerId]
    onRemovePlayerFromBoard(player)
    addPlayerToRoster(player, pickNum)
  };
  const onRemoveDraftedPlayer = (pickNum: number) => {
    const playerId = draftHistory[pickNum - 1];
    draftHistory[pickNum - 1] = null;
    setDraftHistory(draftHistory);
    if (playerId) {
      const player = playerLib[playerId]
      onAddAvailPlayer( player )
      removePlayerFromRoster( player, pickNum )
    }
  };
  const getDraftRoundForPickNum = (pickNum: number): (string | null)[] => {
    const roundIdx = getRoundIdxForPickNum(pickNum, settings.numTeams);
    return draftHistory.slice(
      settings.numTeams * roundIdx,
      settings.numTeams * roundIdx + settings.numTeams
    );
  };

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
  const createPlayerLibrary = (players: Player[]) => {
    const playerLib = players.reduce((acc: PlayerLibrary, player) => {
      acc[player.id] = player
      return acc
    }, {})
    setPlayerLib( playerLib )
    const playersByPosByTeam = players.reduce((dict: PlayersByPositionAndTeam, player: Player) => {
      if (player.position) {
        if ( !dict[player.position] ) {
          dict[player.position] = {}
        }
        if (dict[player.position] && !dict[player.position]![player.team] ) {
          dict[player.position]![player.team] = []
        }
        dict[player.position]![player.team]!.push(player)
      }
      return dict
    }, {})
    setPlayersByPosByTeam( playersByPosByTeam )
  }

  return {
    // state
    boardSettings,
    playerLib,
    playersByPosByTeam, setPlayersByPosByTeam,
    playerRanks,
    settings,
    noPlayers,
    draftHistory,
    rosters,
    viewRosterIdx,
    // funcs
    onDraftPlayer,
    onRemoveDraftedPlayer,
    getDraftRoundForPickNum,
    onPurgeAvailPlayer,
    onApplyRankingSortBy,
    onCreatePlayerRanks,
    createPlayerLibrary,
    onSetRanker,
    onSetAdpRanker,
  }
}