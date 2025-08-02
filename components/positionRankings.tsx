import React, { useState, useMemo } from "react"
import { TiDelete } from 'react-icons/ti'
import { BsLink } from 'react-icons/bs'
import { AiFillCheckCircle, AiFillStar } from 'react-icons/ai'

import { getPosStyle, getTierStyle, predBgColor, nextPredBgColor, getPickDiffColor } from '../behavior/styles'
import { myCurrentRound, getPlayerMetrics, PlayerRanks } from '../behavior/draft'
import { Player, FantasySettings, FantasyPosition, BoardSettings } from "../types"


let viewPlayerIdTimer: NodeJS.Timeout

type DraftBoardTitleCard = {
  bgColor: string
  title: string
}

const isTitleCard = (card: DraftBoardCard): card is DraftBoardTitleCard => {
  return 'title' in card &&
    'bgColor' in card
}

type DraftBoardCard = Player | DraftBoardTitleCard

interface DraftBoardColumn {
  columnTitle: string
  cards: DraftBoardCard[]
}

interface DraftBoard {
  standardView: DraftBoardColumn[]
  predictAvailByRoundView: DraftBoardColumn[]
}

type PredictedPicks = {
  [key: string]: number
}

const DraftBoardColumns = [FantasyPosition.QUARTERBACK, FantasyPosition.WIDE_RECEIVER, FantasyPosition.RUNNING_BACK, FantasyPosition.TIGHT_END, 'Purge']

export const getDraftBoard = (
  playerRanks: PlayerRanks,
  predictedPicks: PredictedPicks,
  myCurrRound: number,
): DraftBoard => {
  const draftBoard: DraftBoard = {
    standardView: DraftBoardColumns.map((columnGroup)=> {
      const posGroup = playerRanks[columnGroup as keyof PlayerRanks]
      return {
        columnTitle: columnGroup,
        cards: posGroup ? [...posGroup] as DraftBoardCard[] : []
      }
    }),
    predictAvailByRoundView: DraftBoardColumns.map((columnGroup)=> {
      const posGroup = playerRanks[columnGroup as keyof PlayerRanks]
      const futureRoundAvailPlayers = [1,2,3,4].map(futureRound => {
        // show top 3 options in each future round
        const topPlayersPerRound = posGroup.filter((player) => !predictedPicks[player.id] || predictedPicks[player.id] >= futureRound + 1).slice(0, 3)
        return [
          { bgColor: 'bg-gray-700', title: `Round ${myCurrRound + futureRound - 1}` } as DraftBoardTitleCard,
          ...topPlayersPerRound,
        ]
      }).flat() as DraftBoardCard[]

      return {
        columnTitle: columnGroup,
        cards: futureRoundAvailPlayers
      }
    }).filter(Boolean) as DraftBoardColumn[],
  }

  return draftBoard
}

interface PositionRankingsProps {
  playerRanks: PlayerRanks,
  predictedPicks: PredictedPicks,
  showNextPreds: boolean,
  myPickNum: number,
  noPlayers: boolean,
  fantasySettings: FantasySettings,
  boardSettings: BoardSettings,
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
  myPickNum,
  noPlayers,
  currPick,
  predNextTiers,
  showPredAvailByRound,
  fantasySettings,
  boardSettings,

  onSelectPlayer,
  onPurgePlayer,
  setViewPlayerId,
}: PositionRankingsProps) => {
  const [rankByAdp, setRankByAdp] = useState(false)
  const [shownPlayerId, setShownPlayerId] = useState<string | null>(null)
  const [shownPlayerBg, setShownPlayerBg] = useState("")

  // const AnyAiFillStar = AiFillStar as any;
  const AnyTiDelete = TiDelete as any;
  const AnyAiFillCheckCircle = AiFillCheckCircle as any;
  const AnyBsLink = BsLink as any;

  const draftBoard = useMemo(() => {
    const myCurrRound = myCurrentRound(currPick, myPickNum, fantasySettings.numTeams)
    return getDraftBoard(playerRanks, predictedPicks, myCurrRound)
  }, [playerRanks, predictedPicks, myPickNum, fantasySettings.numTeams, currPick])

  const draftBoardView = showPredAvailByRound ? draftBoard.predictAvailByRoundView : draftBoard.standardView

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
          { !rankByAdp &&
            <p className="text-xs mt-1"> 
              hold SHIFT to see players sorted by { boardSettings.adpRanker } ranking
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
            Sorted By <span className="text-blue-600 font-bold underline uppercase">{ rankByAdp ? `${boardSettings.adpRanker} ADP` : 'custom ranks' }</span>
          </li>
          <li className="font-semibold text-xs text-gray-600 text-justify whitespace-pre">
            Darklighted taken before your <span className="text-blue-600 font-bold underline uppercase">{ showNextPreds? 'next-next' : 'next' }</span> pick
          </li>
        </ul>
      </div>

      <div className="flex flex-row h-full mb-32">
        { draftBoardView.map( (draftBoardColumn, i) => {
          const { columnTitle, cards } = draftBoardColumn

          const posStyle = getPosStyle(columnTitle)
          return(
            <div key={i}
              className="flex flex-col"
            >
              <div className={`p-1 rounded m-1 ${posStyle} border-b-4 border-indigo-500`}>
                <span className="font-bold underline">{ columnTitle }</span>
                { Boolean(predNextTiers[columnTitle]) &&
                  <p className="text-xs font-semibold">next-next pick @ tier { predNextTiers[columnTitle] }</p>
                }
              </div>

              { cards.slice(0,30).map( (card, playerPosIdx) => {
                if ( isTitleCard(card) ) {
                  return (
                    <div key={`${card.title}-${playerPosIdx}`} id={`${card.title}-${playerPosIdx}`}
                      className={`px-2 m-1 text-center border rounded shadow-md relative ${card.bgColor}`}
                    >
                      <div className="flex flex-col text-center items-center">
                        <p className="text-xs font-semibold flex text-center text-white">
                          { card.title }
                        </p>
                      </div>
                    </div>
                  )
                } else {
                  const player = card as Player
                  const {
                    firstName,
                    lastName,
                    fullName,
                    id,
                    team,
                    // target, TODO - need to handle "target"
                  } = player

                  const metrics = getPlayerMetrics(player, fantasySettings, boardSettings)
                  console.log('playerMetrics', metrics)
                  const { tier, adp, overallOrPosRank } = metrics
                  const tierValue = tier?.tierNumber
                  
                  let tierStyle
                  if ( shownPlayerId === id && !!shownPlayerBg ) {
                    tierStyle = shownPlayerBg
                  } else if ( showNextPreds && predictedPicks[id] && predictedPicks[id] < 3 ) {
                    tierStyle = `${nextPredBgColor} text-white`
                  } else if ( !showNextPreds && predictedPicks[id] && predictedPicks[id] < 2 ) {
                    tierStyle = `${predBgColor} text-white`
                  } else {
                    tierStyle = getTierStyle(tierValue)
                  }
  
                  const playerUrl = `${firstName.toLowerCase()}-${lastName.toLowerCase()}`
                  let rankText
                  if ( rankByAdp ) {
                    rankText = `${boardSettings.adpRanker} ADP #${adp?.toFixed(1)}`
                  } else {
                    rankText = overallOrPosRank === undefined ? 'Unranked' : `#${overallOrPosRank}`
                  }
                  const isBelowAdp = currPick - (adp || 0) >= 0
                  const isBelowRank = currPick - (overallOrPosRank || 0) >= 0
                  const currAdpDiff = Math.abs(currPick - (adp || 0))
                  const currRankDiff = Math.abs(currPick - (overallOrPosRank || 0))
  
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
                          { fullName }
                          {/* { target &&
                            <AnyAiFillStar
                              color="blue"
                              size={24}
                            />
                          } */}
                        </p>
                        <p className="text-xs">
                          { team } - { rankText } { tier ? ` - Tier ${tierValue}` : "" }
                        </p>
                        { !rankByAdp &&
                          <p className={`text-xs ${getPickDiffColor(currAdpDiff)} rounded px-1`}>
                            { currAdpDiff.toFixed(1) } { isBelowAdp ? 'BELOW' : 'ABOVE' } ADP
                          </p>
                        }
                        { rankByAdp &&
                          <p className={`text-xs ${getPickDiffColor(currRankDiff)} rounded px-1`}>
                            { currRankDiff.toFixed(1) } { isBelowRank ? 'BELOW' : 'ABOVE' } Rank
                          </p>
                        }
  
                        { shownPlayerId === id &&
                          <div className={`grid grid-cols-3 mt-1 w-full absolute opacity-60`}>
                            <AnyTiDelete
                              className="cursor-pointer -mt-2"
                              color="red"
                              onClick={ () => onPurgePlayer(player) }
                              onMouseEnter={() => setShownPlayerBg("bg-red-500")}
                              onMouseLeave={() => setShownPlayerBg("")}
                              size={46}
                            />
  
                            <AnyAiFillCheckCircle
                              className="cursor-pointer -mt-1"
                              color="green"
                              onClick={ () => onSelectPlayer(player) }
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
                }
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default PositionRankings