import { useMemo, useState } from 'react'
import { calcCurrRoundPick, getRoundIdxForPickNum } from '../draft'

export const useDraftBoard = ({
  defaultNumTeams = 12,
  defaultMyPickNum = 6,
} = {}) => {

  const [numTeams, setNumTeams] = useState(defaultNumTeams)
  const [isStd, setIsStd] = useState(false)
  const [draftStarted, setDraftStarted] = useState(false)
  const [myPickNum, setMyPickNum] = useState(defaultMyPickNum)

  const [currPick, setCurrPick] = useState(1)
  const [draftHistory, setDraftHistory] = useState(new Array(350).fill(null))

  // functions
  const wrappedSetNumTeams = numTeams => {
    if ( draftStarted ) {
      return
    }
    setNumTeams(numTeams)
  }
  const getRoundForPickNum = pickNum => {
    const roundIdx = getRoundIdxForPickNum(pickNum, numTeams)
    return draftHistory.slice(numTeams*roundIdx, numTeams*roundIdx+numTeams)
  }
  const onDraftPlayer = (playerId, pickNum) => {
    draftHistory[pickNum-1] = playerId
    setDraftHistory(draftHistory)
  }
  const onRemoveDraftedPlayer = (pickNum) => {
    const playerId = draftHistory[pickNum-1]
    draftHistory[pickNum-1] = null
    setDraftHistory(draftHistory)
    return playerId
  }
  const onNavLeft = () => {
    if (currPick > 1) {
      isEvenRound ? setCurrPick(currPick+1) : setCurrPick(currPick-1)
    }
  }
  const onNavRight = () => {
    if (currPick < draftHistory.length) {
      const nextCurrPick = isEvenRound ? currPick-1 : currPick+1
      if ( nextCurrPick <= draftHistory.length ) {
        setCurrPick(nextCurrPick)
      }
    }
  }
  const onNavRoundUp = () => {
    if ( isEvenRound ) {
      setCurrPick(currPick - (2*(currRoundPick-1)+1))
    } else if ( roundIdx > 0 ) {
      setCurrPick(currPick - (2*currRoundPick)+1)
    }
  }
  const onNavRoundDown = () => {
    const nextCurrPick = currPick + (2*(numTeams-currRoundPick)+1)
    if ( nextCurrPick <= draftHistory.length) {
      setCurrPick(nextCurrPick)
    }
  }

  // memos
  const roundIdx = useMemo(() => getRoundIdxForPickNum(currPick, numTeams), [currPick, numTeams])
  const isEvenRound = useMemo(() => roundIdx % 2 == 1, [currPick, numTeams])
  const currRound = useMemo(() => {
    const round = getRoundForPickNum(currPick)
    return round
  }, [currPick, draftHistory, numTeams, roundIdx])
  const currRoundPick = useMemo(() => calcCurrRoundPick( currPick, numTeams ), [currPick, numTeams])
  const currMyPickNum = useMemo(() => {
    return isEvenRound ? numTeams - myPickNum + 1 : myPickNum
  }, [isEvenRound, currPick, numTeams, myPickNum])

  return {
    // state
    numTeams, setNumTeams: wrappedSetNumTeams,
    isStd, setIsStd,
    draftStarted, setDraftStarted,
    myPickNum, setMyPickNum,
    currPick, setCurrPick,
    draftHistory, setDraftHistory,
    // memo
    roundIdx,
    isEvenRound,
    currRound,
    currRoundPick,
    currMyPickNum,
    // funcs
    getRoundForPickNum,
    onDraftPlayer,
    onRemoveDraftedPlayer,
    onNavLeft,
    onNavRight,
    onNavRoundUp,
    onNavRoundDown,
  }
}