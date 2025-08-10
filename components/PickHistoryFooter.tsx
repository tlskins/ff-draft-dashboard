import React from 'react'
import { Player, FantasySettings } from '../types'
import { getPosStyle } from '../behavior/styles'

interface PickHistoryFooterProps {
  roundIdx: number
  currRoundPick: number
  currPick: number
  isEvenRound: boolean
  currRound: (string | null)[]
  playerLib: { [playerId: string]: Player }
  settings: FantasySettings
  currMyPickNum: number
  onRemovePick: (pickNum: number) => void
  setCurrPick: (pickNum: number) => void
  setViewPlayerId: (playerId: string | null) => void
}

const PickHistoryFooter: React.FC<PickHistoryFooterProps> = ({
  roundIdx,
  currRoundPick,
  currPick,
  isEvenRound,
  currRound,
  playerLib,
  settings,
  currMyPickNum,
  onRemovePick,
  setCurrPick,
  setViewPlayerId,
}) => {
  return (
    <div className="flex items-center justify-center w-full h-24 border-t border-gray-300 fixed bottom-0 z-10 bg-gray-200">
      <div className="flex flex-col items-center">
        <p className="font-semibold underline text-center rounded py-1">
          Round {roundIdx + 1} Pick {currRoundPick} (#{currPick} Overall)
        </p>
        <table className="table-auto">
          <tbody>
            <tr className={`flex justify-between ${isEvenRound ? 'flex-row-reverse' : ''}`}>
              {currRound.map((pickedPlayerId: string | null, i: number) => {
                let bgColor = ""
                let hover = ""
                const player = pickedPlayerId ? playerLib[pickedPlayerId] : null
                if (i + 1 === currRoundPick) {
                  bgColor = "bg-yellow-400"
                  hover = "hover:bg-yellow-300"
                } else if (!!player) {
                  bgColor = getPosStyle(player.position)
                  hover = "hover:bg-red-300"
                } else {
                  bgColor = "bg-gray-100"
                  hover = "hover:bg-yellow-200"
                }
                const myPickStyle = i + 1 === currMyPickNum ? "border-4 border-green-400" : "border"
                const pickNum = roundIdx * settings.numTeams + (i + 1)
                return (
                  <td
                    className={`flex flex-col p-1 m-1 rounded ${myPickStyle} ${hover} cursor-pointer text-sm ${bgColor} items-center`}
                    onClick={pickedPlayerId ? () => onRemovePick(pickNum) : () => setCurrPick(pickNum)}
                    key={i}
                    onMouseEnter={() => {
                      if (pickedPlayerId) {
                        setViewPlayerId(pickedPlayerId)
                      }
                    }}
                  >
                    <p className="font-semibold">
                      {`#${pickNum}`} {pickedPlayerId ? ` | Rd ${roundIdx + 1} Pick ${i + 1}` : ""}
                    </p>
                    {player && <p> {player.fullName} </p>}
                  </td>
                )
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default PickHistoryFooter 