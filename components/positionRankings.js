import React, { useState } from "react"
import { TiDelete } from 'react-icons/ti'
import { BsLink } from 'react-icons/bs'
import { 
  AiFillCheckCircle,
  AiFillStar
} from 'react-icons/ai'

import { getPosStyle, getTierStyle, predBgColor, nextPredBgColor, getPickDiffColor } from '../behavior/styles'


let viewPlayerIdTimer

const PositionRankings = ({
  playerRanks,
  playerLib,
  nextPredictedPicks,
  predictedPicks,
  showNextPreds,
  isEspnRank,
  isStd,
  noPlayers,
  currPick,
  predNextTiers,
  showPredAvailByRound,

  onSelectPlayer,
  onPurgePlayer,
  setViewPlayerId,
}) => {
  const [shownPlayerId, setShownPlayerId] = useState(null)
  const [shownPlayerBg, setShownPlayerBg] = useState("")

  console.log('showPredAvailByRound', showPredAvailByRound, playerRanks)
  let filteredRanks = playerRanks.filter(([posGroup,])=> posGroup.length > 0)
  if (showPredAvailByRound) {
    filteredRanks = filteredRanks.map(([posGroup, posName])=> {
      const nextGroup = posGroup.filter(([playerId,]) => !predictedPicks[playerId]).slice(0, 2).map( grp => [...grp, 'bg-gray-400'])
      const nextNextGroup = posGroup.filter(([playerId,]) => !predictedPicks[playerId] && !nextPredictedPicks[playerId]).slice(0, 2).map( grp => [...grp, 'bg-gray-600'])

      return [[...nextGroup, ...nextNextGroup], posName]
    })
  }

  return(
    noPlayers ?
    <></>
    :
    <div className="flex flex-col p-4 h-screen overflow-y-scroll border border-4 rounded shadow-md bg-white">
      <div className="flex flex-col mb-4 items-center">
        { !showNextPreds &&
          <>
            <div className="flex flex-row items-center justify-center items-center">
              <div className={`w-8 h-2 rounded ${ predBgColor }`} />
              <p className="ml-2 text-xs text-center font-semibold">
                ({ Object.keys(predictedPicks).length }) players predicted taken before your turn
              </p>
            </div>
            <p className="text-xs mt-1 text-center"> 
              hold ALT to see players predicted taken before your NEXT turn
            </p>
          </>
        }
        { showNextPreds &&
          <div className="flex flex-row items-center justify-center items-center">
            <div className={`w-8 h-2 rounded ${ nextPredBgColor }`} />
            <p className="ml-2 text-xs">
              ({ Object.keys(nextPredictedPicks).length }) players predicted taken before your NEXT-NEXT turn
            </p>
          </div>
        }
        <p className="text-xs mt-1 text-center"> 
          hold SHIFT to see players sorted by ESPN ranking
        </p>
      </div>

      <p className="font-semibold uppercase text-sm text-gray-600">
        Sorted By <span className="text-blue-600 font-bold underline">{ isEspnRank ? 'ESPN ADP' : 'Custom Ranks' }</span>
      </p>
      <p className="font-semibold uppercase text-sm text-gray-600">
        Darklighting players taken before your <span className="text-blue-600 font-bold underline">{ showNextPreds? 'next-next' : 'next' }</span> pick
      </p>

      <div className="flex flex-row h-full">
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
              { posGroup.slice(0,30).map( ([pId,,,bgColor]) => ({ ...playerLib[pId], bgColor })).filter( p => !!p ).map( player => {
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
                } = player
                let tierStyle
                if ( bgColor ) {
                  tierStyle = bgColor
                } else if ( shownPlayerId === id && !!shownPlayerBg ) {
                  tierStyle = shownPlayerBg
                } else if ( showNextPreds && nextPredictedPicks[player.id] ) {
                  tierStyle = `${nextPredBgColor} text-white`
                } else if ( !showNextPreds && predictedPicks[player.id] ) {
                  tierStyle = `${predBgColor} text-white`
                } else {
                  tierStyle = getTierStyle(player.tier)
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
                  <div key={id} id={id}
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