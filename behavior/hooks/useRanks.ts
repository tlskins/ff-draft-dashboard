import { useState, useEffect, useCallback } from 'react'
import { cloneDeep } from 'lodash'
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
import { FantasySettings, Player, BoardSettings, ThirdPartyRanker, FantasyRanker, RankingSummary, FantasyPosition } from '../../types'

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
  const [playerRanks, setPlayerRanks] = useState<PlayerRanks>({
    [FantasyPosition.QUARTERBACK]: [],
    [FantasyPosition.RUNNING_BACK]: [],
    [FantasyPosition.WIDE_RECEIVER]: [],
    [FantasyPosition.TIGHT_END]: [],
    'Purge': [],
    availPlayersByOverallRank: [],
    availPlayersByAdp: [],
  })
  const [rankingSummaries, setRankingSummaries] = useState<RankingSummary[]>([])
  const noPlayers = Object.keys(playerLib).length === 0
  
  // Custom ranking state
  const [isEditingCustomRanking, setIsEditingCustomRanking] = useState(false)

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
  const onCreatePlayerRanks = useCallback((players: Player[]) => {
    console.log('onCreatePlayerRanks', players, settings, boardSettings)
    const nextPlayerRanks = createPlayerRanks( players, settings, boardSettings )
    setPlayerRanks(nextPlayerRanks)
  }, [settings, boardSettings])
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
    const sortBy = byAdp ? SortPlayersByMetric.Adp : SortPlayersByMetric.PosRank
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

  // Custom ranking functions
  const canEditCustomRankings = () => {
    // Can only edit if no players have been drafted and no players are purged
    const hasDraftedPlayers = draftHistory.some(pick => pick !== null)
    const hasPurgedPlayers = playerRanks.Purge.length > 0
    return !hasDraftedPlayers && !hasPurgedPlayers
  }

  const onStartCustomRanking = (selectedRankerToCopy: ThirdPartyRanker) => {
    if (!canEditCustomRankings()) {
      console.warn("Cannot edit custom rankings when players have been drafted or purged")
      return false
    }

    // Get all currently available players
    const allAvailablePlayers = [
      ...playerRanks[FantasyPosition.QUARTERBACK],
      ...playerRanks[FantasyPosition.RUNNING_BACK],
      ...playerRanks[FantasyPosition.WIDE_RECEIVER],
      ...playerRanks[FantasyPosition.TIGHT_END],
    ]

    const nextPlayerLib = { ...playerLib }
    const nextRanks = { ...playerRanks }
    const nextPlayersByPosByTeam = { ...playersByPosByTeam }
    
    // Copy selected ranker's data to Custom ranker for each player
    allAvailablePlayers.forEach(player => {
      const sourceRanking = player.ranks?.[selectedRankerToCopy]
      if (sourceRanking) {
        // Create or update the Custom ranking for this player
        const updatedPlayer = {
          ...player,
          ranks: {
            ...player.ranks,
            [ThirdPartyRanker.CUSTOM]: {
              ...sourceRanking,
              ranker: ThirdPartyRanker.CUSTOM,
            }
          }
        }
        // Update player
        nextPlayerLib[player.id] = updatedPlayer
        nextRanks[player.position as keyof PlayerRanks] = nextRanks[player.position as keyof PlayerRanks].map(p => p.id === player.id ? updatedPlayer : p)
        nextRanks.availPlayersByOverallRank = nextRanks.availPlayersByOverallRank.map(p => p.id === player.id ? updatedPlayer : p)
        nextRanks.availPlayersByAdp = nextRanks.availPlayersByAdp.map(p => p.id === player.id ? updatedPlayer : p)
        nextPlayersByPosByTeam[player.position]![player.team] = nextPlayersByPosByTeam[player.position]![player.team]!.map(p => p.id === player.id ? updatedPlayer : p)
      }
    })
    
    // Switch to custom ranker and start editing
    setBoardSettings({ ...boardSettings, ranker: ThirdPartyRanker.CUSTOM })
    setIsEditingCustomRanking(true)
    setPlayerLib({ ...nextPlayerLib })
    setPlayersByPosByTeam({ ...nextPlayersByPosByTeam })
    setPlayerRanks({ ...nextRanks })
    console.log('start custom ranking', nextPlayerLib, nextPlayersByPosByTeam, nextRanks)
    return true
  }

  const onFinishCustomRanking = () => {
    setIsEditingCustomRanking(false)
  }

  const onClearCustomRanking = () => {
    console.log('onClearCustomRanking', playerLib, playerRanks)
    // Remove custom rankings from all players
    Object.values(playerLib).forEach(player => {
      if (player.ranks?.[ThirdPartyRanker.CUSTOM]) {
        // Create new ranks object without Custom ranking
        const newRanks = { ...player.ranks }
        delete newRanks[ThirdPartyRanker.CUSTOM]
        player.ranks = newRanks
      }
    })
    
    setIsEditingCustomRanking(false)
    setBoardSettings({ ...boardSettings, ranker: ThirdPartyRanker.HARRIS }) // Reset to default
    
    // Recreate player ranks without custom rankings
    const nextPlayerRanks = createPlayerRanks(Object.values(playerLib), settings, { ...boardSettings, ranker: ThirdPartyRanker.HARRIS })
    setPlayerRanks(nextPlayerRanks)
  }

  const onReorderPlayerInPosition = (playerId: string, position: keyof PlayerRanks, newIndex: number) => {
    console.log('onReorderPlayerInPosition', playerId, position, newIndex)
    if (!isEditingCustomRanking || !canEditCustomRankings()) return

    const positionPlayers = [...playerRanks[position]]
    const currentPlayer = positionPlayers[newIndex]
    const currentIndex = positionPlayers.findIndex(p => p.id === playerId)
    if (currentIndex === -1) return

    // Remove player from current position and insert at new position
    const [player] = positionPlayers.splice(currentIndex, 1)
    positionPlayers.splice(newIndex, 0, player)
    
    // Update the position ranks for all players in this position
    positionPlayers.forEach((p, index) => {
      const customRanking = p.ranks?.[ThirdPartyRanker.CUSTOM]
      if (customRanking) {
        const newRank = index + 1
        if (settings.ppr) {
          customRanking.pprPositionRank = newRank
          // update tier to match the tier of index of player being replaced
          if ( p.id === playerId ) {
            if ( currentPlayer ) {
              customRanking.pprPositionTier = currentPlayer.ranks?.[ThirdPartyRanker.CUSTOM]?.pprPositionTier
            } else {
              customRanking.pprPositionTier = undefined
            }
          }
        } else {
          customRanking.standardPositionRank = newRank
          // update tier to match the tier of index of player being replaced
          if ( p.id === playerId ) {
            if ( currentPlayer ) {
              customRanking.standardPositionTier = currentPlayer.ranks?.[ThirdPartyRanker.CUSTOM]?.standardPositionTier
            } else {
              customRanking.standardPositionTier = undefined
            }
          }
        }
      }
    })
    
    // Recreate player ranks to reflect the changes
    const nextPlayerRanks = createPlayerRanks(Object.values(playerLib), settings, boardSettings)
    setPlayerRanks(nextPlayerRanks)
  }

  const onUpdateTierBoundary = (position: keyof PlayerRanks, tierNumber: number, newBoundaryIndex: number) => {
    console.log('onUpdateTierBoundary', position, tierNumber, newBoundaryIndex)
    if (!isEditingCustomRanking || !canEditCustomRankings()) return

    const positionPlayers = [...playerRanks[position]]
    
    // Get current tier boundaries
    const tierBoundaries: number[] = []
    let currentTierNum: number | undefined = undefined
    
    positionPlayers.forEach((player, index) => {
      const customRanking = player.ranks?.[ThirdPartyRanker.CUSTOM]
      if (customRanking) {
        const tierNum = settings.ppr 
          ? customRanking.pprPositionTier?.tierNumber 
          : customRanking.standardPositionTier?.tierNumber
        
        if (tierNum !== currentTierNum && currentTierNum !== undefined) {
          tierBoundaries.push(index)
        }
        currentTierNum = tierNum
      }
    })
    
    // Update the specific boundary
    if (tierNumber <= tierBoundaries.length) {
      tierBoundaries[tierNumber - 1] = newBoundaryIndex
    }
    
    // Reassign tier numbers based on new boundaries
    let currentTier = 1
    positionPlayers.forEach((player, index) => {
      const customRanking = player.ranks?.[ThirdPartyRanker.CUSTOM]
      if (customRanking) {
        // Check if we've crossed a tier boundary
        if (tierBoundaries.includes(index)) {
          currentTier++
        }
        
        const tierData = {
          tierNumber: currentTier,
          upperLimitPlayerIdx: index,
          upperLimitValue: 0, // Placeholder - would need actual metric values
          lowerLimitPlayerIdx: index,
          lowerLimitValue: 0, // Placeholder - would need actual metric values
        }
        
        if (settings.ppr) {
          customRanking.pprPositionTier = tierData
        } else {
          customRanking.standardPositionTier = tierData
        }
        
        // Update the player in the library
        playerLib[player.id] = { ...player, ranks: { ...player.ranks, [ThirdPartyRanker.CUSTOM]: customRanking } }
      }
    })
    
    // Recreate player ranks to reflect the tier changes
    const nextPlayerRanks = createPlayerRanks(Object.values(playerLib), settings, boardSettings)
    setPlayerRanks(nextPlayerRanks)
  }

  return {
    // state
    rankingSummaries,
    boardSettings,
    playerLib,
    playersByPosByTeam,
    playerRanks,
    settings,
    noPlayers,
    draftHistory,
    rosters,
    viewRosterIdx,
    isEditingCustomRanking,
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
    setRankingSummaries,
    setPlayersByPosByTeam,
    // custom ranking funcs
    canEditCustomRankings,
    onStartCustomRanking,
    onFinishCustomRanking,
    onClearCustomRanking,
    onReorderPlayerInPosition,
    onUpdateTierBoundary,
  }
}