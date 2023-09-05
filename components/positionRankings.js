import React, { useState } from "react"
import { TiDelete } from 'react-icons/ti'
import { BsLink } from 'react-icons/bs'
import { AiFillCheckCircle, AiFillStar } from 'react-icons/ai'

import { getPosStyle, getTierStyle, predBgColor, nextPredBgColor, getPickDiffColor } from '../behavior/styles'
import { myCurrentRound } from '../behavior/draft'


let viewPlayerIdTimer

const PositionRankings = ({
  playerRanks,
  playerLib,
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
}) => {
  const [shownPlayerId, setShownPlayerId] = useState(null)
  const [shownPlayerBg, setShownPlayerBg] = useState("")

  let filteredRanks
  if (showPredAvailByRound) {
    const myCurrRound = myCurrentRound(currPick, myPickNum, numTeams)
    filteredRanks = playerRanks.filter(([posGroup,])=> posGroup.length > 0).map(([posGroup, posName])=> {
      const round1Grp = posGroup.filter(([playerId,]) => !predictedPicks[playerId] || predictedPicks[playerId] >= 2).slice(0, 3)
      const round2Grp = posGroup.filter(([playerId,]) => !predictedPicks[playerId] || predictedPicks[playerId] >= 3).slice(0, 3)
      const round3Grp = posGroup.filter(([playerId,]) => !predictedPicks[playerId] || predictedPicks[playerId] >= 4).slice(0, 3)
      const round4Grp = posGroup.filter(([playerId,]) => !predictedPicks[playerId] || predictedPicks[playerId] >= 5).slice(0, 3)

      return [[
        [,,,'bg-gray-700', `Round ${myCurrRound + 0}`], ...round1Grp,
        [,,,'bg-gray-700', `Round ${myCurrRound + 1}`], ...round2Grp,
        [,,,'bg-gray-700', `Round ${myCurrRound + 2}`], ...round3Grp,
        [,,,'bg-gray-700', `Round ${myCurrRound + 3}`], ...round4Grp,
      ], posName]
    })
  } else {
    filteredRanks = playerRanks.filter(([posGroup,])=> posGroup.length > 0)
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
        { filteredRanks.map( ([posGroup, posName], i) => {
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
              { posGroup.slice(0,30).map( ([pId,,,bgColor,text]) => ({ ...playerLib[pId], bgColor, text })).map( (player, playerPosIdx) => {
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
                  bgColor,
                  text,
                } = player
                let tierStyle
                if ( bgColor ) {
                  tierStyle = bgColor
                } else if ( shownPlayerId === id && !!shownPlayerBg ) {
                  tierStyle = shownPlayerBg
                } else if ( showNextPreds && predictedPicks[player.id] && predictedPicks[player.id] < 3 ) {
                  tierStyle = `${nextPredBgColor} text-white`
                } else if ( !showNextPreds && predictedPicks[player.id] && predictedPicks[player.id] < 2 ) {
                  tierStyle = `${predBgColor} text-white`
                } else {
                  tierStyle = getTierStyle(player.tier)
                }

                if ( text ) {
                  return (
                    <div key={`${text}-${playerPosIdx}`} id={`${text}-${playerPosIdx}`}
                      className={`px-2 m-1 text-center border rounded shadow-md relative ${tierStyle}`}
                    >
                      <div className="flex flex-col text-center items-center">
                        <p className="text-xs font-semibold flex text-center text-white">
                          { text }
                        </p>
                      </div>
                    </div>
                  )
                }


                const playerUrl = `${firstName.toLowerCase()}-${lastName.toLowerCase()}`
                const rank = isStd ? customStdRank : customPprRank
                let rankText
                if ( isEspnRank ) {
                  rankText = `ESPN ADP #${espnAdp.toFixed(1)}`
                } else {
                  rankText = `#${rank}`
                }
                const isBelowAdp = currPick - espnAdp >= 0
                const isBelowRank = currPick - rank >= 0
                const currAdpDiff = Math.abs(currPick - espnAdp)
                const currRankDiff = Math.abs(currPick - rank)

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
                          <AiFillStar
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
                          <TiDelete
                            className="cursor-pointer -mt-2"
                            color="red"
                            onClick={ () => onPurgePlayer( player) }
                            onMouseEnter={() => setShownPlayerBg("bg-red-500")}
                            onMouseLeave={() => setShownPlayerBg("")}
                            size={46}
                          />

                          <AiFillCheckCircle
                            className="cursor-pointer -mt-1"
                            color="green"
                            onClick={ () => onSelectPlayer( player ) }
                            onMouseEnter={() => setShownPlayerBg("bg-green-400")}
                            onMouseLeave={() => setShownPlayerBg("")}
                            size={33}
                          />

                          <BsLink
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