import React, { useState, useMemo, useRef, useEffect } from 'react'
import { Player, FantasySettings, BoardSettings, RankingSummary, PlayerTarget } from '../types'
import { getPlayerAdp, getPlayerMetrics, getRoundAndPickShortText, getMyPicksBetween, getRoundIdxForPickNum } from '../behavior/draft'
import { getPosStyle, getTierStyle } from '../behavior/styles'
import HistoricalStats from './HistoricalStats'
import { playerShortName } from '../behavior/presenters'

interface PlayerSearchModalProps {
  isOpen: boolean
  onClose: () => void
  playerLib: { [key: string]: Player }
  fantasySettings: FantasySettings
  boardSettings: BoardSettings
  rankingSummaries: RankingSummary[]
  playerTargets: PlayerTarget[]
  addPlayerTarget: (player: Player, targetAsEarlyAs: number) => void
  removePlayerTarget: (playerId: string) => void
  myPickNum: number
  currPick: number
}

const PlayerSearchModal: React.FC<PlayerSearchModalProps> = ({
  isOpen,
  onClose,
  playerLib,
  fantasySettings,
  boardSettings,
  rankingSummaries,
  playerTargets,
  addPlayerTarget,
  removePlayerTarget,
  myPickNum,
  currPick
}) => {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)
  const [showTargetingSelect, setShowTargetingSelect] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  console.log('player search', rankingSummaries)

  // Get available players from playerLib
  const allPlayers = Object.values(playerLib)

  // Filter players based on search term (regex-safe)
  const filteredPlayers = useMemo(() => {
    if (!searchTerm.trim()) return []
    
    // Escape special regex characters for safe search
    const escapedTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(escapedTerm, 'i')
    
    return allPlayers
      .filter(player => {
        // Remove non a-z characters from player name and convert to lowercase
        const normalizedPlayerName = player.fullName.replace(/[^a-zA-Z]/g, '').toLowerCase()
        return regex.test(normalizedPlayerName)
      })
      .sort((a, b) => {
        const aMetrics = getPlayerMetrics(a, fantasySettings, boardSettings)
        const bMetrics = getPlayerMetrics(b, fantasySettings, boardSettings)
        return (aMetrics.overallRank || 999) - (bMetrics.overallRank || 999)
      })
      .slice(0, 20) // Limit to top 20 results
  }, [searchTerm, allPlayers, fantasySettings, boardSettings])

  // Calculate user's pick options for targeting
  const targetingOptions = useMemo(() => {
    const startPick = currPick > 0 ? currPick : 1
    const myPicks = getMyPicksBetween(startPick - 1, fantasySettings.numTeams * 15, myPickNum, fantasySettings.numTeams)
    
    return myPicks.map(pick => ({
      pick,
      round: getRoundIdxForPickNum(pick, fantasySettings.numTeams) + 1,
      label: getRoundAndPickShortText(pick, fantasySettings.numTeams)
    })).slice(0, 15) // Limit to next 15 picks
  }, [currPick, myPickNum, fantasySettings.numTeams])

  // Get player favorite status
  const getPlayerFavorite = (playerId: string): PlayerTarget | undefined => {
    return playerTargets.find(target => target.playerId === playerId)
  }

  // Get ranking summary for player's position
  const getPositionRankingSummary = (): RankingSummary | undefined => {
    return rankingSummaries.find(summary => 
      summary.ppr === fantasySettings.ppr
    )
  }

  // Handle player selection from dropdown
  const handlePlayerSelect = (player: Player) => {
    setSelectedPlayer(player)
    setSearchTerm(player.fullName)
    setShowDropdown(false)
    setShowTargetingSelect(false)
  }

  // Handle targeting
  const handleAddTarget = (targetPick: number) => {
    if (selectedPlayer) {
      addPlayerTarget(selectedPlayer, targetPick)
      setShowTargetingSelect(false)
    }
  }

  const handleRemoveTarget = () => {
    if (selectedPlayer) {
      removePlayerTarget(selectedPlayer.id)
    }
  }

  // Handle clicks outside dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Reset modal state when closed
  useEffect(() => {
    if (!isOpen) {
      setSearchTerm('')
      setSelectedPlayer(null)
      setShowDropdown(false)
      setShowTargetingSelect(false)
    }
  }, [isOpen])

  // Focus search input when modal opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus()
    }
  }, [isOpen])

  if (!isOpen) return null

  const playerFavorite = selectedPlayer ? getPlayerFavorite(selectedPlayer.id) : undefined
  const positionSummary = selectedPlayer ? getPositionRankingSummary() : undefined

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-2 md:p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full h-screen md:h-5/6 flex flex-col relative">
        {/* Header */}
        <div className="flex-shrink-0 bg-white border-b p-3 md:p-4 flex justify-between items-center rounded-t-lg">
          <h2 className="text-lg md:text-xl font-bold">Search Players</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl"
          >
            ×
          </button>
        </div>

        {/* Search Section - Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-3 md:p-4 min-h-0">
          <div className="relative" ref={dropdownRef}>
            {/* Search Input */}
            <div className="relative">
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search for a player..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value)
                  setShowDropdown(true)
                }}
                onFocus={() => setShowDropdown(true)}
                className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="absolute right-3 top-3 text-gray-400 text-lg">
                🔍
              </div>
            </div>

            {/* Dropdown Results */}
            {showDropdown && filteredPlayers.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-96 overflow-y-auto">
                {filteredPlayers.map((player) => {
                  const posStyle = getPosStyle(player.position)
                  return (
                    <div
                      key={player.id}
                      onClick={() => handlePlayerSelect(player)}
                      className={`px-4 py-3 cursor-pointer hover:bg-gray-100 border-b last:border-b-0 ${posStyle}`}
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <span className="font-medium text-sm md:text-base">{player.fullName}</span>
                          <span className="text-xs md:text-sm text-gray-600 ml-2">
                            {player.position} | {player.team}
                          </span>
                        </div>
                        <div className="text-xs md:text-sm text-gray-500">
                          ADP {getRoundAndPickShortText(getPlayerAdp(player, fantasySettings, boardSettings), fantasySettings.numTeams)}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Selected Player Profile */}
          {selectedPlayer && (
            <div className="mt-6 space-y-4 md:space-y-6">
              {/* Player Header */}
              <div className="bg-gray-50 rounded-lg p-3 md:p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <h3 className="text-base md:text-lg font-bold">{selectedPlayer.fullName}</h3>
                    {/* Favorite Star */}
                    <div className="relative">
                      {playerFavorite ? (
                        <button
                          onClick={handleRemoveTarget}
                          className="text-blue-500 hover:text-blue-600 text-xl"
                          title="Remove from favorites"
                        >
                          ★
                        </button>
                      ) : (
                        <button
                          onClick={() => setShowTargetingSelect(true)}
                          className="text-gray-300 hover:text-blue-500 text-xl"
                          title="Add to favorites"
                        >
                          ☆
                        </button>
                      )}
                      
                      {/* Targeting Select Dropdown */}
                      {showTargetingSelect && (
                        <div className="absolute top-8 left-0 bg-white border border-gray-300 rounded-lg shadow-lg p-3 z-20 min-w-48 max-h-60 overflow-y-auto">
                          <p className="text-sm font-medium mb-2">Select earliest round to target:</p>
                          <div className="space-y-1">
                            {targetingOptions.map((option) => (
                              <button
                                key={option.pick}
                                onClick={() => handleAddTarget(option.pick)}
                                className="block w-full text-left px-2 py-2 text-sm hover:bg-gray-100 rounded"
                              >
                                Round {option.round}: {option.label}
                              </button>
                            ))}
                          </div>
                          <button
                            onClick={() => setShowTargetingSelect(false)}
                            className="mt-2 text-xs text-gray-500 hover:text-gray-700"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs md:text-sm text-gray-600">
                      {selectedPlayer.position} | {selectedPlayer.team}
                    </div>
                    {playerFavorite && (
                      <div className="text-xs text-blue-600 font-medium">
                        Target: {getRoundAndPickShortText(playerFavorite.targetAsEarlyAs, fantasySettings.numTeams)}
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Player Stats */}
                <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4 text-xs md:text-sm">
                  <div>
                    <span className="font-medium">ADP:</span> {getRoundAndPickShortText(getPlayerAdp(selectedPlayer, fantasySettings, boardSettings), fantasySettings.numTeams)}
                  </div>
                  <div>
                    <span className="font-medium">Overall Rank:</span> {getPlayerMetrics(selectedPlayer, fantasySettings, boardSettings).overallRank || 'N/A'}
                  </div>
                  <div>
                    <span className="font-medium">Position Rank:</span> {getPlayerMetrics(selectedPlayer, fantasySettings, boardSettings).posRank || 'N/A'}
                  </div>
                  <div>
                    <span className="font-medium">Tier:</span> {getPlayerMetrics(selectedPlayer, fantasySettings, boardSettings).tier?.tierNumber || 'N/A'}
                  </div>
                </div>
              </div>

              {/* Historical Stats */}
              <div>
                <h4 className="text-base md:text-lg font-bold mb-3">Historical Stats</h4>
                <div className="bg-white rounded-lg border overflow-hidden">
                  <HistoricalStats player={selectedPlayer} settings={fantasySettings} />
                </div>
              </div>

              {/* Position Ranking Summary */}
              {positionSummary && (
                <div className="pb-4">
                  <h4 className="text-base md:text-lg font-bold mb-3">
                    {selectedPlayer.position} Position Summary ({boardSettings.ranker})
                  </h4>
                  <div className="bg-gray-50 rounded-lg p-3 md:p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 text-xs md:text-sm">
                      <div>
                        <span className="font-medium">Replacement Level:</span>{' '}
                        {positionSummary.replacementLevels[selectedPlayer.position as keyof typeof positionSummary.replacementLevels]?.[1]?.toFixed(1) || 'N/A'} points
                      </div>
                      <div>
                        <span className="font-medium">Standard Deviation:</span>{' '}
                        {positionSummary.stdDevs[selectedPlayer.position as keyof typeof positionSummary.stdDevs]?.toFixed(1) || 'N/A'}
                      </div>
                    </div>
                    
                    {/* Tiers */}
                    <div className="mt-4">
                      <h5 className="font-medium mb-2 text-sm">Position Tiers:</h5>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-40 overflow-y-auto">
                        {positionSummary.tiers[selectedPlayer.position as keyof typeof positionSummary.tiers]?.map((tier) => (
                          <div
                            key={tier.tierNumber}
                            className={`text-xs p-2 rounded ${getTierStyle(tier.tierNumber)}`}
                          >
                            <div className="font-medium">Tier {tier.tierNumber}</div>
                            <div>{tier.lowerLimitValue?.toFixed(1)} - {tier.upperLimitValue?.toFixed(1)} pts</div>
                          </div>
                        )) || <div className="text-gray-500 text-xs">No tier data available</div>}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default PlayerSearchModal 