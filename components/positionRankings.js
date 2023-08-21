import React, { useState } from "react"
import { TiDelete } from 'react-icons/ti'
import { BsLink } from 'react-icons/bs'
import { 
  AiFillCheckCircle,
  AiFillStar
} from 'react-icons/ai'

import { getPosStyle, getTierStyle, predBgColor, nextPredBgColor } from '../behavior/styles'

const PositionRankings = ({
  playerRanks,
  playerLib,
  nextPredictedPicks,
  predictedPicks,
  showNextPreds,
  isEspnRank,
  isStd,

  onSelectPlayer,
  onPurgePlayer,
  setViewPlayerId,
}) => {
  const [shownPlayerId, setShownPlayerId] = useState(null)
  const [shownPlayerBg, setShownPlayerBg] = useState("")

  return(
    <>
      { playerRanks.filter(([posGroup,])=> posGroup.length > 0).map( ([posGroup, posName], i) => {
        const posStyle = getPosStyle(posName)
        return(
          <div key={i}
            className="flex flex-col"
          >
            <div className={`p-1 rounded m-1 ${posStyle}`}>
              { posName }
            </div>
            { posGroup.slice(0,30).map( ([pId,]) => playerLib[pId] ).filter( p => !!p ).map( player => {
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
              } = player
              let tierStyle
              if ( shownPlayerId === id && !!shownPlayerBg ) {
                tierStyle = shownPlayerBg
              } else if ( showNextPreds && nextPredictedPicks[player.id] ) {
                tierStyle = `${nextPredBgColor} text-white`
              } else if ( !showNextPreds && predictedPicks[player.id] ) {
                tierStyle = `${predBgColor} text-white`
              } else {
                tierStyle = getTierStyle(player.tier)
              }
              const playerUrl = `${firstName.toLowerCase()}-${lastName.toLowerCase()}`
              let rankText
              if ( isEspnRank ) {
                rankText = `ESPN ADP #${espnAdp.toFixed(2)}`
              } else {
                rankText = isStd ? `#${customStdRank}` : `#${customPprRank}`
              }

              return(
                <div key={id} id={id}
                  className={`px-2 py-1 m-1 text-center border rounded shadow-md relative ${tierStyle} `}
                  onMouseEnter={ () => {
                    setShownPlayerId(id) 
                    setViewPlayerId(id)
                  }}
                  onMouseLeave={ () => setShownPlayerId(null) }
                >
                  <div className="flex flex-col text-center">
                    <p className="text-sm font-semibold flex">
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
    </>
  )
}

export default PositionRankings