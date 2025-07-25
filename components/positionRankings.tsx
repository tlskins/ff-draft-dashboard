import React, { useState } from "react"
import { TiDelete } from 'react-icons/ti'
import { BsLink } from 'react-icons/bs'
import { AiFillCheckCircle, AiFillStar } from 'react-icons/ai'

import { getPosStyle, getTierStyle, predBgColor, nextPredBgColor, getPickDiffColor } from '../behavior/styles'
import { myCurrentRound } from '../behavior/draft'
import { Player } from "../types"


let viewPlayerIdTimer: NodeJS.Timeout

type PredictedPicks = {
  [key: string]: number
}

type PlayerRanks = { [key: string]: Player[] | undefined }

interface PositionRankingsProps {
  playerRanks: PlayerRanks,
  predictedPicks: PredictedPicks,
  showNextPreds: boolean,
  isEspnRank: boolean,
  isStd: boolean,
  myPickNum: number,
  noPlayers: boolean,
  numTeams: number,
  currPick: number,
  predNextTiers: { [key: string]: number },
  showPredAvailByRound: boolean,
  onSelectPlayer: (player: Player) => void,
  onPurgePlayer: (player: Player) => void,
  setViewPlayerId: (id: string) => void,
}

const PositionRankings = ({
  playerRanks,
  predictedPicks,
  showNextPreds,
  isEspnRank,
  isStd,
  myPickNum,
  noPlayers,
  numTeams,
  currPick,
  predNextTiers,
  showPredAvailByRound,

  onSelectPlayer,
  onPurgePlayer,
  setViewPlayerId,
}: PositionRankingsProps) => {
  const [shownPlayerId, setShownPlayerId] = useState<string | null>(null)
  const [shownPlayerBg, setShownPlayerBg] = useState("")

  const AnyAiFillStar = AiFillStar as any;
  const AnyTiDelete = TiDelete as any;
  const AnyAiFillCheckCircle = AiFillCheckCircle as any;
  const AnyBsLink = BsLink as any;

  let filteredRanks: [string, Player[]][]
  if (showPredAvailByRound) {
    const myCurrRound = myCurrentRound(currPick, myPickNum, numTeams)
    filteredRanks = Object.entries(playerRanks).filter(([,posGroup])=> posGroup && posGroup.length > 0).map(([posName, posGroup])=> {
      const round1Grp = (posGroup as Player[]).filter((player) => !predictedPicks[player.id] || predictedPicks[player.id] >= 2).slice(0, 3)
      const round2Grp = (posGroup as Player[]).filter((player) => !predictedPicks[player.id] || predictedPicks[player.id] >= 3).slice(0, 3)
      const round3Grp = (posGroup as Player[]).filter((player) => !predictedPicks[player.id] || predictedPicks[player.id] >= 4).slice(0, 3)
      const round4Grp = (posGroup as Player[]).filter((player) => !predictedPicks[player.id] || predictedPicks[player.id] >= 5).slice(0, 3)

      return [posName, [
        { name: `Round ${myCurrRound + 0}` } as Player, ...round1Grp,
        { name: `Round ${myCurrRound + 1}` } as Player, ...round2Grp,
        { name: `Round ${myCurrRound + 2}` } as Player, ...round3Grp,
        { name: `Round ${myCurrRound + 3}` } as Player, ...round4Grp,
      ]]
    })
  } else {
    filteredRanks = Object.entries(playerRanks).filter(([,posGroup])=> posGroup && posGroup.length > 0) as [string, Player[]][]
  }


  return(
    noPlayers ?
    <></>
    :
    <div className="flex flex-col p-4 h-screen overflow-y-scroll border border-4 rounded shadow-md bg-white">
      <div className="flex flex-row mb-4 align-center">
        <div className="flex flex-col text-left">
          { !showNextPreds &&
            <>
              <div className="flex flex-row">
                <div className={`w-8 h-2 rounded ${ predBgColor }`} />
                <p className="ml-2 text-xs font-semibold">
                  ({ Object.values(predictedPicks).filter( p => !!p && p > 0 && p < 2 ).length }) players predicted taken before your turn
                </p>
              </div>
              <p className="text-xs mt-1"> 
                hold ALT to see players predicted taken before your NEXT turn
              </p>
            </>
          }
          { showNextPreds &&
            <div className="flex flex-row">
              <div className={`w-8 h-2 rounded ${ nextPredBgColor }`} />
              <p className="ml-2 text-xs">
                ({ Object.values(predictedPicks).filter( p => !!p && p > 0 && p < 3 ).length }) players predicted taken before your NEXT-NEXT turn
              </p>
            </div>
          }
          { !isEspnRank &&
            <p className="text-xs mt-1"> 
              hold SHIFT to see players sorted by ESPN ranking
            </p>
          }
          { !showPredAvailByRound &&
            <p className="text-xs mt-1"> 
              hold Z to see predicted players available to you by round
            </p>
          }
        </div>

        <ul className="list-disc pl-8">
          <li className="font-semibold text-xs text-gray-600 text-left">
            Sorted By <span className="text-blue-600 font-bold underline uppercase">{ isEspnRank ? 'ESPN ADP' : 'custom ranks' }</span>
          </li>
          <li className="font-semibold text-xs text-gray-600 text-justify whitespace-pre">
            Darklighted taken before your <span className="text-blue-600 font-bold underline uppercase">{ showNextPreds? 'next-next' : 'next' }</span> pick
          </li>
        </ul>
      </div>

      <div className="flex flex-row h-full mb-32">
        { filteredRanks.map( ([posName, posGroup], i) => {
          const posStyle = getPosStyle(posName)
          return(
            <div key={i}
              className="flex flex-col"
            >
              <div className={`p-1 rounded m-1 ${posStyle} border-b-4 border-indigo-500`}>
                <span className="font-bold underline">{ posName }</span>
                { Boolean(predNextTiers[posName]) &&
                  <p className="text-xs font-semibold">next-next pick @ tier { predNextTiers[posName] }</p>
                }
              </div>
              { posGroup.slice(0,30).map( (player, playerPosIdx) => {
                const {
                  firstName,
                  lastName,
                  name,
                  id,
                  team,
                  tier,
                  customPprRank,
                  customStdRank,
                  espnAdp,
                  target,
                } = player as Player & { target?: boolean }
                let tierStyle
                if ( shownPlayerId === id && !!shownPlayerBg ) {
                  tierStyle = shownPlayerBg
                } else if ( showNextPreds && predictedPicks[player.id] && predictedPicks[player.id] < 3 ) {
                  tierStyle = `${nextPredBgColor} text-white`
                } else if ( !showNextPreds && predictedPicks[player.id] && predictedPicks[player.id] < 2 ) {
                  tierStyle = `${predBgColor} text-white`
                } else {
                  tierStyle = getTierStyle(player.tier)
                }

                if ( !id ) {
                  return (
                    <div key={`${name}-${playerPosIdx}`} id={`${name}-${playerPosIdx}`}
                      className={`px-2 m-1 text-center border rounded shadow-md relative`}
                    >
                      <div className="flex flex-col text-center items-center">
                        <p className="text-xs font-semibold flex text-center text-white bg-gray-600 rounded px-2">
                          { name }
                        </p>
                      </div>
                    </div>
                  )
                }


                const playerUrl = `${firstName.toLowerCase()}-${lastName.toLowerCase()}`
                const rank = isStd ? customStdRank : customPprRank
                let rankText
                if ( isEspnRank ) {
                  rankText = `ESPN ADP #${espnAdp?.toFixed(1)}`
                } else {
                  rankText = `#${rank}`
                }
                const isBelowAdp = currPick - (espnAdp || 0) >= 0
                const isBelowRank = currPick - (rank || 0) >= 0
                const currAdpDiff = Math.abs(currPick - (espnAdp || 0))
                const currRankDiff = Math.abs(currPick - (rank || 0))

                return(
                  <div key={`${id}-${playerPosIdx}`} id={`${id}-${playerPosIdx}`}
                    className={`px-2 py-1 m-1 text-center border rounded shadow-md relative ${tierStyle} cursor-pointer`}
                    onMouseEnter={ () => {
                      if ( viewPlayerIdTimer ) {
                        clearTimeout( viewPlayerIdTimer )
                      }
                      viewPlayerIdTimer = setTimeout(() => {
                        setShownPlayerId(id) 
                        setViewPlayerId(id)
                      }, 250)
                    }}
                    onMouseLeave={ () => {
                      if ( viewPlayerIdTimer ) {
                        clearTimeout( viewPlayerIdTimer )
                      }
                    }}
                  >
                    <div className="flex flex-col text-center items-center">
                      <p className="text-sm font-semibold flex text-center">
                        { name }
                        { target &&
                          <AnyAiFillStar
                            color="blue"
                            size={24}
                          />
                        }
                      </p>
                      <p className="text-xs">
                        { team } - { rankText } { tier ? ` - Tier ${tier}` : "" }
                      </p>
                      { !isEspnRank &&
                        <p className={`text-xs ${getPickDiffColor(currAdpDiff)} rounded px-1`}>
                          { currAdpDiff.toFixed(1) } { isBelowAdp ? 'BELOW' : 'ABOVE' } ADP
                        </p>
                      }
                      { isEspnRank &&
                        <p className={`text-xs ${getPickDiffColor(currRankDiff)} rounded px-1`}>
                          { currRankDiff.toFixed(1) } { isBelowRank ? 'BELOW' : 'ABOVE' } Rank
                        </p>
                      }

                      { shownPlayerId === id &&
                        <div className={`grid grid-cols-3 mt-1 w-full absolute opacity-60`}>
                          <AnyTiDelete
                            className="cursor-pointer -mt-2"
                            color="red"
                            onClick={ () => onPurgePlayer(player as Player) }
                            onMouseEnter={() => setShownPlayerBg("bg-red-500")}
                            onMouseLeave={() => setShownPlayerBg("")}
                            size={46}
                          />

                          <AnyAiFillCheckCircle
                            className="cursor-pointer -mt-1"
                            color="green"
                            onClick={ () => onSelectPlayer(player as Player) }
                            onMouseEnter={() => setShownPlayerBg("bg-green-400")}
                            onMouseLeave={() => setShownPlayerBg("")}
                            size={33}
                          />

                          <AnyBsLink
                            className="cursor-pointer -mt-2"
                            color="blue"
                            onClick={ () => window.open(`https://www.fantasypros.com/nfl/games/${playerUrl}.php`) }
                            onMouseEnter={() => setShownPlayerBg("bg-blue-400")}
                            onMouseLeave={() => setShownPlayerBg("")}
                            size={40}
                          />
                        </div>
                      }
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default PositionRankings