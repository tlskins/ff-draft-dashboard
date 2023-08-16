import next from 'next'
import { useMemo, useState } from 'react'


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
  const getRoundIdxForPickNum = pickNum => Math.floor((pickNum-1) / numTeams)
  const getRoundForPickNum = pickNum => {
    const roundIdx = getRoundIdxForPickNum(pickNum)
    return draftHistory.slice(numTeams*roundIdx, numTeams*roundIdx+numTeams)
  }
  const onDraftPlayer = (playerId, pickNum) => {
    setDraftHistory([...draftHistory.slice(0, pickNum), playerId, ...draftHistory.slice(pickNum+1, draftHistory.length)])
  }
  const onRemoveDraftedPlayer = (pickNum) => {
    setDraftHistory([...draftHistory.slice(0, pickNum), null, ...draftHistory.slice(pickNum+1, draftHistory.length)])
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
  const roundIdx = useMemo(() => getRoundIdxForPickNum(currPick), [currPick, numTeams])
  const isEvenRound = useMemo(() => roundIdx % 2 == 1, [currPick, numTeams])
  const currRound = useMemo(() => {
    const round = getRoundForPickNum(currPick)
    return isEvenRound ? round.reverse() : round
  }, [currPick, draftHistory, numTeams, roundIdx])
  const currRoundPick = useMemo(() => {
    return currPick % numTeams === 0 ? 12 : currPick % numTeams
  }, [currPick, numTeams])
  const currMyPickNum = useMemo(() => {
    return isEvenRound ? numTeams - myPickNum + 1 : myPickNum
  }, [isEvenRound, currPick, numTeams, myPickNum])

  return {
    // state
    numTeams, setNumTeams,
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