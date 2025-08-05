import React, { FC, useState } from "react"
import { Roster, rankablePositions, getProjectedTier } from "../behavior/draft"
import {
  DataRanker,
  Player,
  OptimalRoster,
  RankingSummary,
  BoardSettings,
  FantasySettings,
} from "../types"
import { getPosStyle, getTierStyle } from "../behavior/styles"

interface RostersProps {
  draftStarted: boolean
  viewRosterIdx: number
  setViewRosterIdx: (idx: number) => void
  rosters: Roster[]
  optimalRosters: OptimalRoster[]
  playerLib: { [key: string]: Player }
  rankingSummaries: RankingSummary[]
  boardSettings: BoardSettings
  settings: FantasySettings
  }

const Rosters: FC<RostersProps> = ({
  draftStarted,
  viewRosterIdx,
  setViewRosterIdx,
  rosters,
  optimalRosters,
  playerLib,
  rankingSummaries,
  boardSettings,
  settings,
}) => {
  const [selectedOptimalRosterIdx, setSelectedOptimalRosterIdx] = useState(0);
  const currentOptimalRoster = optimalRosters[selectedOptimalRosterIdx] || optimalRosters[0];

  return (
    <div className="flex flex-col rounded h-full w-full overflow-y-auto ml-2 p-1">

      {draftStarted && currentOptimalRoster && Object.keys(currentOptimalRoster.roster).length > 0 && (
        <div className="flex flex-col mr-1 mb-2 text-sm px-2 py-2 bg-blue-50 shadow-md border border-blue-200">
          <div className="flex items-center justify-between mb-2">
            <p className="font-semibold underline">
              Your Optimal {currentOptimalRoster.type} Roster ({currentOptimalRoster.value.toFixed(1)} {currentOptimalRoster.metric})
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
      )}

      {!draftStarted && <p className="font-semibold">Waiting for draft...</p>}
      {draftStarted && (
        <div className="flex flex-col mr-1 mb-2 text-sm px-2 py-2 shadow-md border">
          <div className="flex items-center justify-between mb-2">
            <p className="font-semibold underline">Rosters</p>
            <select
              className="ml-2 px-2 py-1 text-xs border border-gray-300 rounded bg-white"
              value={viewRosterIdx}
              onChange={(e) => setViewRosterIdx(parseInt(e.target.value))}
            >
              {rosters.map((_, i) => {
                return (
                  <option key={i} value={i}>
                    Team {i + 1}
                  </option>
                )
              })}
            </select>
          </div>
          <div className="overflow-x-auto text-left">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-gray-300">
                  <th className="text-left py-1 px-2 font-medium text-gray-700">Pos</th>
                  <th className="text-left py-1 px-2 font-medium text-gray-700">Team</th>
                  <th className="text-left py-1 px-2 font-medium text-gray-700">Player</th>
                </tr>
              </thead>
              <tbody>
                {rankablePositions
                  .flatMap((pos) => 
                    rosters[viewRosterIdx][pos as keyof Roster].map((playerId: string) => ({
                      position: pos,
                      playerId,
                      player: playerLib[playerId]
                    }))
                  )
                  .filter(({ player }) => player) // Filter out any missing players
                  .map(({ position, playerId, player }) => (
                    <tr key={playerId} className="border-b border-gray-200 hover:bg-gray-100">
                      <td className={`py-1 px-2 rounded-md ${getPosStyle(player.position)}`}>{player.position}</td>
                      <td className="py-1 px-2">{player.team}</td>
                      <td className="py-1 px-2 font-medium">{player.fullName}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  )
}

export default Rosters 