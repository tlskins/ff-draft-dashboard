import React, { useState } from 'react'
import OptimalRosterDisplay from './OptimalRosterDisplay'
import RankingSummaryDisplay from './RankingSummary'
import { FantasyPosition, NFLTeam } from '../types'
import type { FantasySettings, BoardSettings, RankingSummary, Player } from '../types'

interface OptimalPick {
  player: any
  round: number
}

interface OptimalRoster {
  metric: string
  value: number
  roster: Record<string, OptimalPick>
}

type Position = FantasyPosition.QUARTERBACK | FantasyPosition.RUNNING_BACK | FantasyPosition.WIDE_RECEIVER | FantasyPosition.TIGHT_END | FantasyPosition.DEFENSE

interface MobileTiersViewProps {
  currentOptimalRoster: OptimalRoster | null
  optimalRosters: OptimalRoster[]
  selectedOptimalRosterIdx: number
  setSelectedOptimalRosterIdx: (idx: number) => void
  boardSettings: BoardSettings
  settings: FantasySettings
  rankingSummaries: RankingSummary[]
  ranker: any
}

const MobileTiersView: React.FC<MobileTiersViewProps> = ({
  currentOptimalRoster,
  optimalRosters,
  selectedOptimalRosterIdx,
  setSelectedOptimalRosterIdx,
  boardSettings,
  settings,
  rankingSummaries,
  ranker,
}) => {
  const [selectedPosition, setSelectedPosition] = useState<Position>(FantasyPosition.QUARTERBACK)

  const positions: Position[] = [FantasyPosition.QUARTERBACK, FantasyPosition.RUNNING_BACK, FantasyPosition.WIDE_RECEIVER, FantasyPosition.TIGHT_END, FantasyPosition.DEFENSE]

  // Create a mock player for the selected position to pass to RankingSummaryDisplay
  const mockPlayer: Player = {
    id: `mock-${selectedPosition}`,
    firstName: 'Mock',
    lastName: selectedPosition,
    fullName: `Mock ${selectedPosition}`,
    position: selectedPosition,
    team: NFLTeam.FA,
    ranks: {},

  }

  return (
    <div className="w-full h-full flex flex-col">
      {/* Optimal Roster Display */}
      <div className="mb-4">
        <OptimalRosterDisplay
          currentOptimalRoster={currentOptimalRoster}
          optimalRosters={optimalRosters}
          selectedOptimalRosterIdx={selectedOptimalRosterIdx}
          setSelectedOptimalRosterIdx={setSelectedOptimalRosterIdx}
          boardSettings={boardSettings}
          settings={settings}
          rankingSummaries={rankingSummaries}
        />
      </div>

      {/* Position Dropdown */}
      <div className="mb-4 px-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select Position for Tier Analysis:
        </label>
        <select
          className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          value={selectedPosition}
          onChange={(e) => setSelectedPosition(e.target.value as Position)}
        >
          {positions.map((position) => (
            <option key={position} value={position}>
              {position}
            </option>
          ))}
        </select>
      </div>

      {/* Rankings Summary Display */}
      <div className="flex-1 overflow-y-auto">
        <RankingSummaryDisplay
          activePlayer={mockPlayer}
          rankingSummaries={rankingSummaries}
          settings={settings}
          ranker={ranker}
        />
      </div>
    </div>
  )
}

export default MobileTiersView 