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
import { LEGACY_RANKING_PROFILE_STORAGE_KEY } from '../rankingProfileStorage'
import {
  fallbackExpertRanker,
  selectableExpertRankers,
} from '../rankingCatalog'
import {overallRankFor, positionRankFor, scoringFormatFor} from '../scoringFormat'
import {usePersistedPlayerTargets} from './usePersistedPlayerTargets'
import {seasonScopedStorage} from '../seasonScopedStorage'

interface UseRanksProps {
  settings: FantasySettings
  defaultMyPickNum?: number,
  myPickNum?: number,
  persistenceSeason?: number,
}

export const useRanks = ({
  settings,
  defaultMyPickNum = 6,
  myPickNum,
  persistenceSeason = 2026,
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
  const [playerTargets, setPlayerTargets, playerTargetsHydrated] = usePersistedPlayerTargets(persistenceSeason)
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
  }, [settings.ppr, settings.scoringFormat, boardSettings.ranker, boardSettings.adpRanker, playerLib])

  useEffect(() => {
    if (
      rankings.players.length === 0
      || boardSettings.ranker === ThirdPartyRanker.CUSTOM
    ) return
    const selectable = selectableExpertRankers(rankings, settings)
    if (!selectable.includes(boardSettings.ranker)) {
      setBoardSettings(current => ({
        ...current,
        ranker: fallbackExpertRanker(rankings, settings),
      }))
    }
  }, [boardSettings.ranker, rankings, settings])

  const onLoadPlayers = useCallback((
    rankings: Rankings
  ) => {
    const selectable = selectableExpertRankers(rankings, settings)
    const nextRanker = selectable.includes(boardSettings.ranker)
      ? boardSettings.ranker
      : fallbackExpertRanker(rankings, settings)
    const nextBoardSettings = {...boardSettings, ranker: nextRanker}
    const nextPlayerRanks = createPlayerRanks(
      rankings.players, settings, nextBoardSettings,
    )
    if (nextRanker !== boardSettings.ranker) {
      setBoardSettings(nextBoardSettings)
    }
    setPlayerRanks(nextPlayerRanks)
    createPlayerLibrary(rankings.players)
    setRankingSummaries(rankings.rankingsSummaries)
    setRankings(rankings)
  }, [boardSettings, settings])

  // Import supplies a complete, already-validated preference/ranking bundle.
  // Build every derived rank view from that same bundle rather than waiting for
  // separate settings and board-setting state updates to settle.
  const applyImportedRankings = useCallback((
    nextRankings: Rankings,
    nextSettings: FantasySettings,
    nextBoardSettings: BoardSettings,
  ) => {
    const nextPlayerRanks = createPlayerRanks(
      nextRankings.players,
      nextSettings,
      nextBoardSettings,
    )
    setBoardSettings({ ...nextBoardSettings })
    setPlayerRanks(nextPlayerRanks)
    createPlayerLibrary(nextRankings.players)
    setRankingSummaries(nextRankings.rankingsSummaries)
    setRankings(nextRankings)
  }, [])

  const onLoadCustomPlayerRanks = useCallback((rankings: Rankings, ranker: FantasyRanker) => {
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
  const addPlayerToRoster = (
    player: Player,
    pickNum: number,
    rosterIndex?: number,
  ) => {
    const rosterIdx = rosterIndex ?? getRosterIdxFromPick(pickNum)
    setRosters(currentRosters =>
      addToRoster(currentRosters, player, rosterIdx)
    )
  }
  const removePlayerFromRoster = ( player: Player, pickNum: number ) => {
    const rosterIdx = getRosterIdxFromPick( pickNum )
    setRosters(currentRosters =>
      removeFromRoster(currentRosters, player, rosterIdx)
    )
  }

  // draft history

  const onDraftPlayer = (
    playerId: string,
    pickNum: number,
    fallbackPlayer?: Player,
    rosterIndex?: number,
  ): void => {
    const player = playerLib[playerId] || fallbackPlayer
    if (!player) {
      return
    }

    if (!playerLib[playerId]) {
      setPlayerLib(currentPlayerLib => ({
        ...currentPlayerLib,
        [playerId]: player,
      }))
      setPlayersByPosByTeam(currentPlayers => {
        const positionPlayers = currentPlayers[player.position] || {}
        const teamPlayers = positionPlayers[player.team] || []
        return {
          ...currentPlayers,
          [player.position]: {
            ...positionPlayers,
            [player.team]: [...teamPlayers, player],
          },
        }
      })
    }

    setDraftHistory(currentHistory => {
      const nextHistory = [...currentHistory]
      nextHistory[pickNum - 1] = playerId
      return nextHistory
    })
    setPlayerRanks(currentRanks =>
      removePlayerFromBoard(currentRanks, player)
    )
    addPlayerToRoster(player, pickNum, rosterIndex)
  };
  const onRemoveDraftedPlayer = (pickNum: number) => {
    const playerId = draftHistory[pickNum - 1];
    setDraftHistory(currentHistory => {
      const nextHistory = [...currentHistory]
      nextHistory[pickNum - 1] = null
      return nextHistory
    })
    if (playerId) {
      const player = playerLib[playerId]
      if (player) {
        setPlayerRanks(currentRanks =>
          addAvailPlayer(currentRanks, player, settings, boardSettings)
        )
        removePlayerFromRoster( player, pickNum )
      }
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
    setPlayerRanks(currentRanks => {
      const unavailablePlayerIds = new Set([
        ...draftHistory.filter((id): id is string => Boolean(id)),
        ...currentRanks.Purge.map(player => player.id),
      ])
      const nextPlayerRanks = createPlayerRanks(
        Object.values(playerLib).filter(player => !unavailablePlayerIds.has(player.id)),
        settings,
        boardSettings,
      )
      nextPlayerRanks.Purge = currentRanks.Purge.filter(player => (
        !draftHistory.includes(player.id)
      ))
      return nextPlayerRanks
    })
  }, [settings, boardSettings, playerLib, draftHistory])
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
    setPlayerRanks(currentRanks =>
      removePlayerFromBoard(currentRanks, player)
    )
  }
  const onAddAvailPlayer = (player: Player) => {
    setPlayerRanks(currentRanks =>
      addAvailPlayer(currentRanks, player, settings, boardSettings)
    )
  }
  const onPurgeAvailPlayer = (player: Player) => {
    setPlayerRanks(currentRanks =>
      purgePlayerFromPlayerRanks(
        currentRanks,
        player,
        settings,
        boardSettings,
      )
    )
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
    sourceRanker: FantasyRanker,
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

  const onStartCustomRanking = useCallback((selectedRankerToCopy: FantasyRanker) => {
    if (!canEditCustomRankings()) {
      console.warn("Cannot edit custom rankings when players have been drafted or purged")
      return false
    }

    // Resume an existing custom board in place. Re-copying its source ranker
    // here would silently discard the user's previously saved ordering.
    if (
      selectedRankerToCopy === ThirdPartyRanker.CUSTOM
      && rankings.copiedRanker
      && playerRanks.availPlayersByOverallRank.some(player => (
        Boolean(player.ranks?.[ThirdPartyRanker.CUSTOM])
      ))
    ) {
      setIsEditingCustomRanking(true)
      return true
    }

    // If editing custom ranks selected ranker should be the original copied ranker
    if ( selectedRankerToCopy === ThirdPartyRanker.CUSTOM && rankings.copiedRanker ) {
      selectedRankerToCopy = rankings.copiedRanker
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
    const scoringFormat = scoringFormatFor(settings)
    positionPlayers.forEach((p, index) => {
      const customRanking = p.ranks?.[ThirdPartyRanker.CUSTOM]
      if (customRanking) {
        const newRank = index + 1
        if (scoringFormat === "half_ppr") {
          customRanking.halfPprPositionRank = newRank
          if (p.id === playerId) {
            customRanking.halfPprPositionTier = currentPlayer
              ? currentPlayer.ranks?.[ThirdPartyRanker.CUSTOM]?.halfPprPositionTier
              : undefined
          }
        } else if (scoringFormat === "ppr") {
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
        const scoringFormat = scoringFormatFor(settings)
        const tier = scoringFormat === "half_ppr"
          ? customRanking.halfPprPositionTier
          : scoringFormat === "ppr"
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
        
        const scoringFormat = scoringFormatFor(settings)
        if (scoringFormat === "half_ppr") {
          customRanking.halfPprPositionTier = nextTier
        } else if (scoringFormat === "ppr") {
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
      if (playerRanks && currRanking && playerAdpRank && currAdpRank && (
        (overallRankFor(currRanking, scoringFormatFor(settings)) || 999) <= 150
      )) {
        const adpDiff = (currAdpRank?.adp || 999) - (playerAdpRank?.adp || 999)
        const scoringFormat = scoringFormatFor(settings)
        const posRankDiff = (positionRankFor(currRanking, scoringFormat) || 999)
          - (positionRankFor(playerRanks, scoringFormat) || 999)
        if (Math.abs(adpDiff) >= 1.0 || posRankDiff !== 0) {
          diffs[player.id] = {
            playerId: player.id,
            playerName: player.fullName,
            adpDiff,
            posRankDiff,
            prevStandardPositionRank: currRanking.standardPositionRank || 999,
            prevPprPositionRank: currRanking.pprPositionRank || 999,
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
    
    if (rankings.copiedRanker) {
      onLoadCustomPlayerRanks(updatedRankings, rankings.copiedRanker)
    }
    
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
  const addPlayerTarget = useCallback((player: Player, targetAsEarlyAsRound: number) => {
    setPlayerTargets(prevTargets => {
      // Check if player is already targeted
      const isAlreadyTargeted = prevTargets.some(target => target.playerId === player.id)
      if (isAlreadyTargeted) return prevTargets

      const newTarget: PlayerTarget = {
        playerId: player.id,
        targetAsEarlyAsRound
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

  // Legacy reads are retained only for the pre-authority startup migration fallback.
  const loadCustomRankingsData = useCallback(() => {
    if ( typeof localStorage === 'undefined' ) {
      return null
    }
    try {
      const savedData = seasonScopedStorage(localStorage, persistenceSeason)
        .getItem(LEGACY_RANKING_PROFILE_STORAGE_KEY)
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
  }, [canEditCustomRankings, persistenceSeason, settings])

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
    playerTargetsHydrated,
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
    loadCustomRankingsData,
    resetBoardSettings,
    // sync functions
    onSyncPendingRankings,
    onRevertPlayerToPreSync,
    // load funcs
    onLoadPlayers,
    applyImportedRankings,
    onLoadCustomPlayerRanks,
    // helper funcs
    calculateRankingDiffs,
  }
}
