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
import { PlayerRankingDiff } from '../../types/DraftBoardTypes'
import { cloneDeep } from 'lodash'

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
  const [pendingRankings, setPendingRankings] = useState<Rankings | null>(null)
  const [latestRankings, setLatestRankings] = useState<Rankings | null>(null)

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
    const nextPlayerRanks = createPlayerRanks(rankings.players, settings, boardSettings)
    setPlayerRanks(nextPlayerRanks)
    createPlayerLibrary(rankings.players)
    setRankingSummaries(rankings.rankingsSummaries)
    setRankings(rankings)
  }, [boardSettings, settings])

  const onLoadCustomPlayerRanks = useCallback((rankings: Rankings, ranker: ThirdPartyRanker) => {
    // First load the players with the source ranker to get proper rankings
    const tempPlayerRanks = createPlayerRanks(rankings.players, settings, { ...boardSettings, ranker })
    const tempPlayerLib = rankings.players.reduce((acc: PlayerLibrary, player) => {
      acc[player.id] = player
      return acc
    }, {})
    const tempPlayersByPosByTeam = rankings.players.reduce((dict: PlayersByPositionAndTeam, player: Player) => {
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

    // Get all available players from the temporary rankings
    const allAvailablePlayers = [
      ...tempPlayerRanks[FantasyPosition.QUARTERBACK],
      ...tempPlayerRanks[FantasyPosition.RUNNING_BACK],
      ...tempPlayerRanks[FantasyPosition.WIDE_RECEIVER],
      ...tempPlayerRanks[FantasyPosition.TIGHT_END],
    ]

    // Use helper function to create custom rankings for all players
    const { nextPlayerLib, nextRanks, nextPlayersByPosByTeam } = createCustomRankingsForPlayers(
      allAvailablePlayers,
      ranker,
      tempPlayerLib,
      tempPlayerRanks,
      tempPlayersByPosByTeam
    )

    console.log('onLoadCustomPlayerRanks', rankings, boardSettings, nextRanks)
    setPlayerRanks(nextRanks)
    setPlayerLib(nextPlayerLib)
    setPlayersByPosByTeam(nextPlayersByPosByTeam)
    setRankingSummaries(rankings.rankingsSummaries)
    setRankings(rankings)
  }, [boardSettings, settings])

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
  const onCreatePlayerRanks = useCallback((players: Player[]) => {
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

  // Helper function to create custom rankings for all players
  const createCustomRankingsForPlayers = useCallback((
    playersToUpdate: Player[],
    sourceRanker: ThirdPartyRanker,
    currentPlayerLib: PlayerLibrary,
    currentPlayerRanks: PlayerRanks,
    currentPlayersByPosByTeam: PlayersByPositionAndTeam
  ) => {
    const nextPlayerLib = cloneDeep(currentPlayerLib)
    const nextRanks = cloneDeep(currentPlayerRanks)
    const nextPlayersByPosByTeam = cloneDeep(currentPlayersByPosByTeam)
    
    // Copy selected ranker's data to Custom ranker for each player
    playersToUpdate.forEach(player => {
      const sourceRanking = player.ranks?.[sourceRanker]
      if (sourceRanking) {
        // Create or update the Custom ranking for this player
        const updatedPlayer = {
          ...player,
          ranks: {
            ...player.ranks,
            [ThirdPartyRanker.CUSTOM]: {
              ...sourceRanking,
              copiedRanker: sourceRanker,
              ranker: ThirdPartyRanker.CUSTOM,
            }
          }
        }
        
        // Update player in all data structures
        nextPlayerLib[player.id] = updatedPlayer
        nextRanks[player.position as keyof PlayerRanks] = nextRanks[player.position as keyof PlayerRanks].map(p => p.id === player.id ? updatedPlayer : p)
        nextRanks.availPlayersByOverallRank = nextRanks.availPlayersByOverallRank.map(p => p.id === player.id ? updatedPlayer : p)
        nextRanks.availPlayersByAdp = nextRanks.availPlayersByAdp.map(p => p.id === player.id ? updatedPlayer : p)
        
        if (nextPlayersByPosByTeam[player.position]?.[player.team]) {
          nextPlayersByPosByTeam[player.position]![player.team] = nextPlayersByPosByTeam[player.position]![player.team]!.map(p => p.id === player.id ? updatedPlayer : p)
        }
      }
    })
    
    return {
      nextPlayerLib,
      nextRanks,
      nextPlayersByPosByTeam
    }
  }, [])

  const onStartCustomRanking = useCallback((selectedRankerToCopy: ThirdPartyRanker) => {
    if (!canEditCustomRankings()) {
      console.warn("Cannot edit custom rankings when players have been drafted or purged")
      return false
    }

    // If editing custom ranks selected ranker should be the original copied ranker
    if ( selectedRankerToCopy === ThirdPartyRanker.CUSTOM && rankings.copiedRanker ) {
      selectedRankerToCopy = rankings.copiedRanker as ThirdPartyRanker
    }

    // Get all currently available players
    const allAvailablePlayers = [
      ...playerRanks[FantasyPosition.QUARTERBACK],
      ...playerRanks[FantasyPosition.RUNNING_BACK],
      ...playerRanks[FantasyPosition.WIDE_RECEIVER],
      ...playerRanks[FantasyPosition.TIGHT_END],
    ]

    // Use helper function to create custom rankings
    const { nextPlayerLib, nextRanks, nextPlayersByPosByTeam } = createCustomRankingsForPlayers(
      allAvailablePlayers,
      selectedRankerToCopy,
      playerLib,
      playerRanks,
      playersByPosByTeam
    )
    
    // Switch to custom ranker and start editing
    setBoardSettings({ ...boardSettings, ranker: ThirdPartyRanker.CUSTOM })
    setIsEditingCustomRanking(true)
    setPlayerLib(nextPlayerLib)
    setPlayersByPosByTeam(nextPlayersByPosByTeam)
    setPlayerRanks(nextRanks)
    if ( !rankings.copiedRanker ) {
      // Clear any existing diffs when starting fresh
      setCustomAndLatestRankingsDiffs({})
    }
    setRankings({ ...rankings, copiedRanker: selectedRankerToCopy })
    return true
  }, [
    canEditCustomRankings,
    createCustomRankingsForPlayers,
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
    // Clear any pending diffs when finishing custom ranking
    setCustomAndLatestRankingsDiffs({})
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

  // Syncing rankings - stored as state to preserve diffs across ranking updates
  const [customAndLatestRankingsDiffs, setCustomAndLatestRankingsDiffs] = useState<{ [key: string]: PlayerRankingDiff }>({})

  console.log('customAndLatestRankingsDiffs', customAndLatestRankingsDiffs)

  // Helper function to calculate ranking diffs
  const calculateRankingDiffs = useCallback((
    currentRankings: Rankings,
    currentPlayerLib: PlayerLibrary,
    latestRankingsData: Rankings,
    settings: FantasySettings,
    boardSettings: BoardSettings
  ): { [key: string]: PlayerRankingDiff } => {
    if (!currentRankings.copiedRanker || !latestRankingsData || !settings) {
      return {}
    }

    const copiedRanker = currentRankings.copiedRanker as ThirdPartyRanker
    const adpRanker = boardSettings.adpRanker as ThirdPartyADPRanker

    const diffs: { [key: string]: PlayerRankingDiff } = {}

    latestRankingsData.players.forEach(player => {
      const playerRanks = player.ranks?.[copiedRanker]
      const playerAdpRank = player.ranks?.[adpRanker]
      const currRanking = currentPlayerLib[player.id]?.ranks?.[ThirdPartyRanker.CUSTOM]
      const currAdpRank = currentPlayerLib[player.id]?.ranks?.[adpRanker]
      if (playerRanks && currRanking && playerAdpRank && currAdpRank && ((currRanking.standardOverallRank || 999) <= 150 || (currRanking.pprOverallRank || 999) <= 150)) {
        const adpDiff = (currAdpRank?.adp || 999) - (playerAdpRank?.adp || 999)
        const posRankDiff = (settings.ppr ? currRanking.pprPositionRank || 999 : currRanking.standardPositionRank || 999) - (settings.ppr ? playerRanks.pprPositionRank || 999 :  playerRanks.standardPositionRank || 999)
        if (Math.abs(adpDiff) >= 1.0 || posRankDiff !== 0) {
          diffs[player.id] = {
            playerId: player.id,
            playerName: player.fullName,
            adpDiff,
            posRankDiff,
            prevStandardPositionRank: currRanking.standardPositionRank,
            prevPprPositionRank: currRanking.pprPositionRank,
            prevStandardPositionTier: currRanking.standardPositionTier,
            prevPprPositionTier: currRanking.pprPositionTier,
          }
        }
      }
    })

    return diffs
  }, [])

  const onSyncPendingRankings = useCallback(() => {
    if (!latestRankings || !isEditingCustomRanking || !canEditCustomRankings()) return

    // Calculate diffs BEFORE updating rankings to preserve the comparison
    const diffs = calculateRankingDiffs(rankings, playerLib, latestRankings, settings, boardSettings)
    console.log('diffs', diffs)
    if (Object.keys(diffs).length === 0) return

    // Store the diffs in state
    setCustomAndLatestRankingsDiffs(diffs)

    // Copy latest rankings to pending
    const clonedPendingRankings = cloneDeep(latestRankings)
    setPendingRankings(clonedPendingRankings)
    
    // Load the latest rankings with the original ranker
    const updatedRankings = {
      ...clonedPendingRankings,
      copiedRanker: rankings.copiedRanker
    }
    console.log('onSyncPendingRankings', updatedRankings)
    
    onLoadCustomPlayerRanks(updatedRankings, rankings.copiedRanker as ThirdPartyRanker)
    
  }, [latestRankings, isEditingCustomRanking, canEditCustomRankings, calculateRankingDiffs, rankings, playerLib, settings, boardSettings, setPendingRankings, onLoadCustomPlayerRanks]) 

  const onRevertPlayerToPreSync = useCallback((playerId: string) => {
    if (!isEditingCustomRanking || !canEditCustomRankings()) return
    
    const playerDiff = customAndLatestRankingsDiffs[playerId]
    if (!playerDiff) return
    
    const player = playerLib[playerId]
    if (!player || !player.ranks?.[ThirdPartyRanker.CUSTOM]) return
    
    // Revert the player's custom ranking to pre-sync values
    const customRanking = player.ranks[ThirdPartyRanker.CUSTOM]
    const updatedCustomRanking = {
      ...customRanking,
      standardPositionRank: playerDiff.prevStandardPositionRank,
      pprPositionRank: playerDiff.prevPprPositionRank,
      standardPositionTier: playerDiff.prevStandardPositionTier,
      pprPositionTier: playerDiff.prevPprPositionTier,
    }
    
    const updatedPlayer = {
      ...player,
      ranks: {
        ...player.ranks,
        [ThirdPartyRanker.CUSTOM]: updatedCustomRanking
      }
    }
    
    // Update player in all data structures
    const nextPlayerLib = { ...playerLib, [playerId]: updatedPlayer }
    const nextPlayersByPosByTeam = { ...playersByPosByTeam }
    if (nextPlayersByPosByTeam[player.position]?.[player.team]) {
      nextPlayersByPosByTeam[player.position]![player.team] = nextPlayersByPosByTeam[player.position]![player.team]!.map(p => 
        p.id === playerId ? updatedPlayer : p
      )
    }
    
    // Recreate player ranks to reflect the changes
    const nextPlayerRanks = editPlayersInPlayerRanks(playerRanks, [updatedPlayer], settings, boardSettings)
    const nextPlayers = getPlayersFromPlayerRanks(nextPlayerRanks)
    
    setPlayerLib(nextPlayerLib)
    setPlayersByPosByTeam(nextPlayersByPosByTeam)
    setPlayerRanks(nextPlayerRanks)
    setRankings({ ...rankings, editedAt: new Date().toISOString(), players: nextPlayers })
    
    // Remove the diff for this player since it's been reverted
    const updatedDiffs = { ...customAndLatestRankingsDiffs }
    delete updatedDiffs[playerId]
    setCustomAndLatestRankingsDiffs(updatedDiffs)
  }, [
    isEditingCustomRanking,
    canEditCustomRankings,
    customAndLatestRankingsDiffs,
    playerLib,
    playersByPosByTeam,
    playerRanks,
    settings,
    boardSettings,
    rankings,
    setPlayerLib,
    setPlayersByPosByTeam,
    setPlayerRanks,
    setRankings,
  ])

  // Player targeting functions
  const addPlayerTarget = useCallback((player: Player, targetAsEarlyAs: number) => {
    setPlayerTargets(prevTargets => {
      // Check if player is already targeted
      const isAlreadyTargeted = prevTargets.some(target => target.playerId === player.id)
      if (isAlreadyTargeted) return prevTargets

      const newTarget: PlayerTarget = {
        playerId: player.id,
        targetAsEarlyAs
      }
      return [...prevTargets, newTarget]
    })
  }, [])

  const replacePlayerTargets = useCallback((newTargets: PlayerTarget[]) => {
    setPlayerTargets(newTargets)
  }, [])

  const removePlayerTarget = useCallback((playerId: string) => {
    setPlayerTargets(prevTargets => prevTargets.filter(target => target.playerId !== playerId))
  }, [])
  const removePlayerTargets = useCallback((playerIds: string[]) => {
    setPlayerTargets(prevTargets => prevTargets.filter(target => !playerIds.includes(target.playerId)))
  }, [])

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

  const loadCustomRankingsData = useCallback(() => {
    if ( typeof localStorage === 'undefined' ) {
      return null
    }
    try {
      const savedData = localStorage.getItem('ff-draft-custom-rankings')
      if (!savedData) {
        return null
      }

      const parsedData = JSON.parse(savedData)
      const {
        players,
        rankingsSummaries: savedRankingSummaries,
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
        return null
      }

      // Cannot load if draft has started or players are purged
      if (!canEditCustomRankings()) {
        console.warn("Cannot load custom rankings when draft has started or players are purged")
        return null
      }

      return {
        players,
        rankingsSummaries: savedRankingSummaries,
        cachedAt: savedCachedAt,
        editedAt: savedEditedAt,
        copiedRanker: savedCopiedRanker as ThirdPartyRanker,
        settings,
      } as Rankings
    } catch (error) {
      console.error('Failed to load custom rankings:', error)
      return null
    }
  }, [canEditCustomRankings, settings])

  const loadCustomRankings = useCallback(() => {
    const customRankings = loadCustomRankingsData()
    if (!customRankings) {
      return false
    }

    // Load the data into state
    onLoadPlayers(customRankings)
    
    // Switch to custom ranker
    setBoardSettings({ ...boardSettings, ranker: ThirdPartyRanker.CUSTOM })

    return true
  }, [loadCustomRankingsData, onLoadPlayers, boardSettings])

  const hasCustomRankingsSaved = useCallback(() => {
    if ( typeof localStorage === 'undefined' ) {
      return false
    }
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
    latestRankings,
    settings,
    noPlayers,
    draftHistory,
    rosters,
    viewRosterIdx,
    isEditingCustomRanking,
    playerTargets,
    rankings,
    customAndLatestRankingsDiffs,
    setLatestRankings,
    setCustomAndLatestRankingsDiffs,
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
    removePlayerTargets,
    // save/load custom rankings funcs
    saveCustomRankings,
    loadCustomRankings,
    loadCustomRankingsData,
    hasCustomRankingsSaved,
    clearSavedCustomRankings,
    resetBoardSettings,
    // sync functions
    onSyncPendingRankings,
    onRevertPlayerToPreSync,
    // load funcs
    onLoadPlayers,
    onLoadCustomPlayerRanks,
    // helper funcs
    calculateRankingDiffs,
  }
}