import React from 'react'
import { getPosStyle, getTierStyle } from "../behavior/styles"
import { getProjectedTier } from "../behavior/draft"
import { DataRanker } from "../types"
import type { FantasySettings, BoardSettings, RankingSummary } from "../types"

interface OptimalPick {
  player: any
  round: number
}

interface OptimalRoster {
  metric: string
  value: number
  roster: Record<string, OptimalPick>
}

interface OptimalRosterDisplayProps {
  currentOptimalRoster: OptimalRoster | null
  optimalRosters: OptimalRoster[]
  selectedOptimalRosterIdx: number
  setSelectedOptimalRosterIdx: (idx: number) => void
  boardSettings: BoardSettings
  settings: FantasySettings
  rankingSummaries: RankingSummary[]
}

const OptimalRosterDisplay: React.FC<OptimalRosterDisplayProps> = ({
  currentOptimalRoster,
  optimalRosters,
  selectedOptimalRosterIdx,
  setSelectedOptimalRosterIdx,
  boardSettings,
  settings,
  rankingSummaries,
}) => {
  if (!currentOptimalRoster || Object.keys(currentOptimalRoster.roster).length === 0) {
    return null
  }

  return (
    <div className="flex flex-col mr-1 mb-2 text-sm px-2 py-2 shadow-md border border-blue-200 bg-white">
      <div className="flex items-center justify-between mb-2">
        <p className="font-semibold underline">
          Optimal Total {currentOptimalRoster.metric} Roster Using Ranking Tiers vs ADP ({currentOptimalRoster.value.toFixed(1)} {currentOptimalRoster.metric})
        </p>
        {optimalRosters.length > 1 && (
          <select
            className="ml-2 px-2 py-1 text-xs border border-blue-300 rounded bg-white"
            value={selectedOptimalRosterIdx}
            onChange={(e) => setSelectedOptimalRosterIdx(parseInt(e.target.value))}
          >
            {optimalRosters.map((roster, idx) => (
              <option key={idx} value={idx}>
                #{idx + 1} ({roster.value.toFixed(1)} {roster.metric})
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="overflow-x-auto text-left">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-blue-300">
              <th className="text-left py-1 px-2 font-medium text-blue-700">Pick</th>
              <th className="text-left py-1 px-2 font-medium text-blue-700">Pos</th>
              <th className="text-left py-1 px-2 font-medium text-blue-700">Player</th>
              <th className="text-left py-1 px-2 font-medium text-blue-700">Team</th>
              <th className="text-left py-1 px-2 font-medium text-blue-700">Tier</th>
              <th className="text-left py-1 px-2 font-medium text-blue-700">{currentOptimalRoster.metric}</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(currentOptimalRoster.roster)
              .sort(([pickA], [pickB]) => parseInt(pickA) - parseInt(pickB))
              .map(([pick, optimalPick]) => {
                const player = optimalPick.player
                const tier = getProjectedTier(player, boardSettings.ranker, DataRanker.LAST_SSN_PPG, settings, rankingSummaries);
                const tierValue = tier ? (tier.lowerLimitValue + tier.upperLimitValue) / 2 : 0;
                return (
                  <tr key={pick} className="border-b border-blue-200 hover:bg-blue-100">
                    <td className="py-1 px-2 font-medium">R{optimalPick.round} (P{pick})</td>
                    <td className={`py-1 px-2 rounded-md ${getPosStyle(player.position)}`}>{player.position}</td>
                    <td className="py-1 px-2 font-medium">{player.fullName}</td>
                    <td className="py-1 px-2">{player.team}</td>
                    <td className={`py-1 px-2 ${getTierStyle(tier?.tierNumber || 0)}`}>{tier?.tierNumber || "N/A"}</td>
                    <td className="py-1 px-2">{tierValue.toFixed(1)}</td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default OptimalRosterDisplay 