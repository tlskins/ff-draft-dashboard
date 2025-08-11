import { useState, useEffect, useCallback, useMemo } from 'react'
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
  editPlayersInPlayerRanks,
  getPlayersFromPlayerRanks,
} from "../draft"
import {
  FantasySettings,
  Player,
  BoardSettings,
  ThirdPartyRanker,
  FantasyRanker,
  RankingSummary,
  FantasyPosition,
  PlayerTarget,
  ThirdPartyADPRanker,
  Rankings,
  Tier,
} from '../../types'

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
    adpRanker: ThirdPartyADPRanker.ESPN,
  })
  const [rankings, setRankings] = useState<Rankings>({
    players: [],
    rankingsSummaries: [],
    cachedAt: '',
    editedAt: '',
    settings,
    copiedRanker: undefined,
  } as Rankings)

  const [playerLib, setPlayerLib] = useState<PlayerLibrary>({})
  const [playersByPosByTeam, setPlayersByPosByTeam] = useState<PlayersByPositionAndTeam>({})
  const [playerTargets, setPlayerTargets] = useState<PlayerTarget[]>([])
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

  useEffect(() => {
    onRecalculatePlayerRanks()
  }, [settings.ppr, boardSettings.ranker, boardSettings.adpRanker, playerLib])

  const onLoadPlayers = useCallback((
    rankings: Rankings
  ) => {
    onCreatePlayerRanks(rankings.players, boardSettings)
    createPlayerLibrary(rankings.players)
    setRankingSummaries(rankings.rankingsSummaries)
    setRankings(rankings)
  }, [boardSettings])

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

  const onRecalculatePlayerRanks = useCallback(() => {
    const nextPlayerRanks = createPlayerRanks(Object.values(playerLib), settings, boardSettings)
    setPlayerRanks(nextPlayerRanks)
  }, [settings, boardSettings, playerLib])
  const onSetRanker = (ranker: FantasyRanker) => {
    setBoardSettings({ ...boardSettings, ranker })
  }
  const onSetAdpRanker = (adpRanker: ThirdPartyADPRanker) => {
    setBoardSettings({ ...boardSettings, adpRanker })
  }
  const onCreatePlayerRanks = useCallback((players: Player[], boardSettings: BoardSettings) => {
    const nextPlayerRanks = createPlayerRanks( players, settings, boardSettings )
    setPlayerRanks(nextPlayerRanks)
  }, [settings])
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
  const onApplyRankingSortBy = useCallback((byAdp: boolean) => {
    const sortBy = byAdp ? SortPlayersByMetric.Adp : SortPlayersByMetric.PosRank
    setPlayerRanks(currentPlayerRanks => {
      const nextPlayerRanks = sortPlayerRanksByRank( currentPlayerRanks, settings, boardSettings, sortBy )
      return nextPlayerRanks
    })
  }, [settings, boardSettings])
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

  const onStartCustomRanking = useCallback((selectedRankerToCopy: ThirdPartyRanker) => {
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
              copiedRanker: selectedRankerToCopy,
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
    setRankings({ ...rankings, copiedRanker: selectedRankerToCopy })
    return true
  }, [
    canEditCustomRankings,
    playerLib,
    playerRanks,
    playersByPosByTeam,
    rankings,
    boardSettings,
    setBoardSettings,
    setIsEditingCustomRanking,
    setPlayerLib,
    setPlayersByPosByTeam,
    setPlayerRanks,
    setRankings,
  ])

  const onFinishCustomRanking = () => {
    setIsEditingCustomRanking(false)
  }

  const onReorderPlayerInPosition = useCallback((playerId: string, position: keyof PlayerRanks, newIndex: number) => {
    if (!isEditingCustomRanking || !canEditCustomRankings()) return

    const positionPlayers = [...playerRanks[position]]
    const currentPlayer = positionPlayers[newIndex]
    const currentIndex = positionPlayers.findIndex(p => p.id === playerId)
    if (currentIndex === -1) return

    // Remove player from current position and insert at new position
    const [player] = positionPlayers.splice(currentIndex, 1)
    positionPlayers.splice(newIndex, 0, player)
    
    // Update the position ranks for all players in this position
    const editedPlayers = [] as Player[]
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
        editedPlayers.push(p)
      }
    })

    // Recreate player ranks to reflect the changes
    const nextPlayerRanks = editPlayersInPlayerRanks( playerRanks, editedPlayers, settings, boardSettings )
    const nextPlayers = getPlayersFromPlayerRanks(nextPlayerRanks)
    setPlayerRanks(nextPlayerRanks)
    setRankings({ ...rankings, editedAt: new Date().toISOString(), players: nextPlayers })
  }, [
    isEditingCustomRanking,
    canEditCustomRankings,
    playerRanks,
    settings,
    boardSettings,
    playerLib,
    rankings,
    setPlayerRanks,
    setRankings,
  ])

  const onUpdateTierBoundary = (position: keyof PlayerRanks, tierNumber: number, newBoundaryIndex: number) => {
    if (!isEditingCustomRanking || !canEditCustomRankings() || newBoundaryIndex < 1) return

    const positionPlayers = [...playerRanks[position]]
    
    // Get current tier boundaries
    const tierBoundaries: number[] = []
    const tiersMap = {} as { [key: number]: Tier }
    let currentTierNum: number | undefined = undefined
    positionPlayers.forEach((player, index) => {
      const customRanking = player.ranks?.[ThirdPartyRanker.CUSTOM]
      if (customRanking) {
        const tier = settings.ppr 
        ? customRanking.pprPositionTier 
        : customRanking.standardPositionTier
        const tierNum = tier?.tierNumber
        
        if (tierNum !== currentTierNum && currentTierNum !== undefined) {
          tierBoundaries.push(index)
        }
        currentTierNum = tierNum
        if (tierNum) {
          tiersMap[tierNum] = tier
        }
      }
    })
    
    // Update the specific boundary
    if (tierNumber <= tierBoundaries.length) {
      tierBoundaries[tierNumber - 1] = newBoundaryIndex
    }
    
    // Reassign tier numbers based on new boundaries
    const editedPlayers = [] as Player[]
    let currentTier = 1
    positionPlayers.forEach((player, index) => {
      const customRanking = player.ranks?.[ThirdPartyRanker.CUSTOM]
      if (customRanking) {
        // Check if we've crossed a tier boundary
        if (tierBoundaries.includes(index)) {
          currentTier++
        }

        const nextTier = tiersMap[currentTier]
        
        if (settings.ppr) {
          customRanking.pprPositionTier = nextTier
        } else {
          customRanking.standardPositionTier = nextTier
        }
        editedPlayers.push(player)
        
        // Update the player in the library
        playerLib[player.id] = { ...player, ranks: { ...player.ranks, [ThirdPartyRanker.CUSTOM]: customRanking } }
      }
    })
    
    // Recreate player ranks to reflect the changes
    const nextPlayerRanks = editPlayersInPlayerRanks( playerRanks, editedPlayers, settings, boardSettings )
    const nextPlayers = getPlayersFromPlayerRanks(nextPlayerRanks)
    setPlayerRanks(nextPlayerRanks)
    setRankings({ ...rankings, editedAt: new Date().toISOString(), players: nextPlayers })
  }

  // Player targeting functions
  const addPlayerTarget = useCallback((player: Player, targetBelowPick: number) => {
    // Check if player is already targeted
    const isAlreadyTargeted = playerTargets.some(target => target.playerId === player.id)
    if (isAlreadyTargeted) return

    const newTarget: PlayerTarget = {
      playerId: player.id,
      targetBelowPick
    }
    setPlayerTargets([...playerTargets, newTarget])
  }, [playerTargets])

  const replacePlayerTargets = useCallback((newTargets: PlayerTarget[]) => {
    setPlayerTargets(newTargets)
  }, [playerTargets])

  const removePlayerTarget = useCallback((playerId: string) => {
    setPlayerTargets(playerTargets.filter(target => target.playerId !== playerId))
  }, [playerTargets])

  // Save/Load custom rankings functionality
  const saveCustomRankings = useCallback(() => {
    if (!isEditingCustomRanking && boardSettings.ranker !== ThirdPartyRanker.CUSTOM) {
      console.warn("Cannot save custom rankings when not using custom ranker")
      return false
    }

    const saveData = { ...rankings } as Rankings

    try {
      localStorage.setItem('ff-draft-custom-rankings', JSON.stringify(saveData))
      console.log('Custom rankings saved successfully')
      return true
    } catch (error) {
      console.error('Failed to save custom rankings:', error)
      return false
    }
  }, [
    playerLib,
    rankingSummaries,
    rankings,
    isEditingCustomRanking,
    boardSettings.ranker,
    settings,
  ])

  const loadCustomRankings = useCallback(() => {
    try {
      const savedData = localStorage.getItem('ff-draft-custom-rankings')
      if (!savedData) {
        return false
      }

      const parsedData = JSON.parse(savedData)
      const {
        players,
        rankingSummaries: savedRankingSummaries,
        cachedAt: savedCachedAt,
        copiedRanker: savedCopiedRanker,
        editedAt: savedEditedAt,
      } = parsedData

      // Verify that we have valid custom rankings in the saved data
      const hasCustomRankings = players.some((player: Player) => 
        player.ranks && player.ranks[ThirdPartyRanker.CUSTOM]
      )

      if (!hasCustomRankings) {
        console.warn("No custom rankings found in saved data")
        return false
      }

      // Cannot load if draft has started or players are purged
      if (!canEditCustomRankings()) {
        console.warn("Cannot load custom rankings when draft has started or players are purged")
        return false
      }

      // Load the data
      onLoadPlayers({
        players,
        rankingsSummaries: savedRankingSummaries,
        cachedAt: savedCachedAt,
        editedAt: savedEditedAt,
        copiedRanker: savedCopiedRanker as ThirdPartyRanker,
        settings,
      } as Rankings)
      
      // Switch to custom ranker
      setBoardSettings({ ...boardSettings, ranker: ThirdPartyRanker.CUSTOM })

      console.log('Custom rankings loaded successfully')
      return true
    } catch (error) {
      console.error('Failed to load custom rankings:', error)
      return false
    }
  }, [onLoadPlayers, boardSettings, canEditCustomRankings])

  const hasCustomRankingsSaved = useCallback(() => {
    try {
      const savedData = localStorage.getItem('ff-draft-custom-rankings')
      if (!savedData) return false

      const parsedData = JSON.parse(savedData)
      const { players } = parsedData

      // Check if saved data has custom rankings
      return players.some((player: Player) => 
        player.ranks && player.ranks[ThirdPartyRanker.CUSTOM]
      )
    } catch (error) {
      console.error('Error checking for saved custom rankings:', error)
      return false
    }
  }, [])

  const clearSavedCustomRankings = useCallback(() => {
    try {
      localStorage.removeItem('ff-draft-custom-rankings')
      console.log('Saved custom rankings cleared')
      return true
    } catch (error) {
      console.error('Failed to clear saved custom rankings:', error)
      return false
    }
  }, [])

  const resetBoardSettings = useCallback(() => {
    setBoardSettings({
      ranker: ThirdPartyRanker.HARRIS,
      adpRanker: ThirdPartyADPRanker.ESPN,
    })
  }, [setBoardSettings])

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
    playerTargets,
    rankings,
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
    onReorderPlayerInPosition,
    onUpdateTierBoundary,
    // player targeting funcs
    addPlayerTarget,
    replacePlayerTargets,
    removePlayerTarget,
    // save/load custom rankings funcs
    saveCustomRankings,
    loadCustomRankings,
    hasCustomRankingsSaved,
    clearSavedCustomRankings,
    resetBoardSettings,
    // load funcs
    onLoadPlayers,
  }
}