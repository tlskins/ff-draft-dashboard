import React, { FC } from "react"
import { Roster, rankablePositions } from "../behavior/draft"
import { Player, OptimalRoster } from "../types"

interface RostersProps {
  draftStarted: boolean
  viewRosterIdx: number
  setViewRosterIdx: (idx: number) => void
  rosters: Roster[]
  optimalRoster: OptimalRoster
  playerLib: { [key: string]: Player }
}

const Rosters: FC<RostersProps> = ({
  draftStarted,
  viewRosterIdx,
  setViewRosterIdx,
  rosters,
  optimalRoster,
  playerLib,
}) => {
  return (
    <div className="col-span-2 flex flex-col rounded h-full overflow-y-auto ml-2 p-1 w-64 border border-gray-300">
      <p className="font-semibold underline py-2">Rosters</p>

      {!draftStarted && <p className="font-semibold">Waiting for draft...</p>}

      {draftStarted && (
        <div className="flex flex-col mr-1 mb-2 text-sm px-2 py-1 bg-gray-100 shadow-md border">
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

      {draftStarted && optimalRoster && Object.keys(optimalRoster.roster).length > 0 && (
        <div className="flex flex-col mr-1 mb-2 text-sm px-2 py-1 bg-blue-50 shadow-md border border-blue-200">
          <p className="font-semibold underline text-blue-800 mb-2">
            Optimal Roster (Value: {optimalRoster.value.toFixed(1)})
          </p>
          {Object.entries(optimalRoster.roster)
            .sort(([pickA], [pickB]) => parseInt(pickA) - parseInt(pickB))
            .map(([pick, optimalPick]) => {
              const player = optimalPick.player
              return (
                <div className="text-xs mb-1 text-left" key={pick}>
                  <span className="font-medium text-blue-700">
                    R{optimalPick.round}, P{pick}:
                  </span>{" "}
                  <span className="font-medium">{player.fullName}</span> ({player.position}) - {player.team}
                </div>
              )
            })}
        </div>
      )}
    </div>
  )
}

export default Rosters 