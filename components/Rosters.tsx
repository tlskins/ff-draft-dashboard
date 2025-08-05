import React, { FC } from "react"
import { Roster, rankablePositions, getProjectedTier } from "../behavior/draft"
import { DataRanker, Player, OptimalRoster, RankingSummary, BoardSettings, FantasySettings } from "../types"

interface RostersProps {
  draftStarted: boolean
  viewRosterIdx: number
  setViewRosterIdx: (idx: number) => void
  rosters: Roster[]
  optimalRoster: OptimalRoster
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
  optimalRoster,
  playerLib,
  rankingSummaries,
  boardSettings,
  settings,
}) => {
  return (
    <div className="flex flex-col rounded h-full w-full overflow-y-auto ml-2 p-1 border border-gray-300">

      {draftStarted && optimalRoster && Object.keys(optimalRoster.roster).length > 0 && (
        <div className="flex flex-col mr-1 mb-2 text-sm px-2 py-1 bg-blue-50 shadow-md border border-blue-200">
          <p className="font-semibold underline mb-2">
            Your Optimal {optimalRoster.type} Roster ({optimalRoster.value.toFixed(1)} {optimalRoster.metric})
          </p>
          <div className="overflow-x-auto text-left">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-blue-300">
                  <th className="text-left py-1 px-2 font-medium text-blue-700">Round</th>
                  <th className="text-left py-1 px-2 font-medium text-blue-700">Pick</th>
                  <th className="text-left py-1 px-2 font-medium text-blue-700">Player</th>
                  <th className="text-left py-1 px-2 font-medium text-blue-700">Pos</th>
                  <th className="text-left py-1 px-2 font-medium text-blue-700">Team</th>
                  <th className="text-left py-1 px-2 font-medium text-blue-700">{optimalRoster.metric}</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(optimalRoster.roster)
                  .sort(([pickA], [pickB]) => parseInt(pickA) - parseInt(pickB))
                  .map(([pick, optimalPick]) => {
                    const player = optimalPick.player
                    const tier = getProjectedTier(player, boardSettings.ranker, DataRanker.LAST_SSN_PPG, settings, rankingSummaries);
                    const tierValue = tier ? (tier.lowerLimitValue + tier.upperLimitValue) / 2 : 0;
                    return (
                      <tr key={pick} className="border-b border-blue-200 hover:bg-blue-100">
                        <td className="py-1 px-2 font-medium">{optimalPick.round}</td>
                        <td className="py-1 px-2 font-medium">{pick}</td>
                        <td className="py-1 px-2 font-medium">{player.fullName}</td>
                        <td className="py-1 px-2">{player.position}</td>
                        <td className="py-1 px-2">{player.team}</td>
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
        <div className="flex flex-col mr-1 mb-2 text-sm px-2 py-1 shadow-md border">
          <p className="font-semibold underline py-2">Rosters</p>
          <select
            className="rounded p-1 border font-semibold"
            value={viewRosterIdx}
            onChange={(e) => setViewRosterIdx(parseInt(e.target.value))}
          >
            {rosters.map((_, i) => {
              return (
                <option key={i} value={i}>
                  {" "}
                  Team {i + 1}{" "}
                </option>
              )
            })}
          </select>
          {rankablePositions
            .map(
              (pos) =>
                [rosters[viewRosterIdx][pos as keyof Roster], pos] as [
                  string[],
                  string
                ]
            )
            .filter(([posGroup]) => posGroup.length > 0)
            .map(([posGroup, pos]) => {
              return (
                <div className="mt-1 text-left" key={pos}>
                  <p className="font-semibold">
                    {" "}
                    {pos} ({posGroup.length}){" "}
                  </p>
                  {posGroup.map((playerId: string) => {
                    const player = playerLib[playerId]
                    return (
                      <p className="text-xs" key={playerId}>
                        {" "}
                        {player.fullName} - {player.team}{" "}
                      </p>
                    )
                  })}
                </div>
              )
            })}
        </div>
      )}

    </div>
  )
}

export default Rosters 