import { useMemo, useState, Dispatch, SetStateAction } from 'react';
import { calcCurrRoundPick, getRoundIdxForPickNum } from '../draft';

interface UseDraftBoardProps {
  defaultNumTeams?: number;
  defaultMyPickNum?: number;
}

interface UseDraftBoardReturn {
  numTeams: number;
  setNumTeams: (numTeams: number) => void;
  isStd: boolean;
  setIsStd: Dispatch<SetStateAction<boolean>>;
  draftStarted: boolean;
  setDraftStarted: Dispatch<SetStateAction<boolean>>;
  myPickNum: number;
  setMyPickNum: Dispatch<SetStateAction<number>>;
  currPick: number;
  setCurrPick: Dispatch<SetStateAction<number>>;
  draftHistory: (string | null)[];
  setDraftHistory: Dispatch<SetStateAction<(string | null)[]>>;
  roundIdx: number;
  isEvenRound: boolean;
  currRound: (string | null)[];
  currRoundPick: number;
  currMyPickNum: number;
  getRoundForPickNum: (pickNum: number) => (string | null)[];
  onDraftPlayer: (playerId: string, pickNum: number) => void;
  onRemoveDraftedPlayer: (pickNum: number) => string | null;
  onNavLeft: () => void;
  onNavRight: () => void;
  onNavRoundUp: () => void;
  onNavRoundDown: () => void;
}

export const useDraftBoard = ({
  defaultNumTeams = 12,
  defaultMyPickNum = 6,
}: UseDraftBoardProps = {}): UseDraftBoardReturn => {
  const [numTeams, setNumTeams] = useState<number>(defaultNumTeams);
  const [isStd, setIsStd] = useState<boolean>(false);
  const [draftStarted, setDraftStarted] = useState<boolean>(false);
  const [myPickNum, setMyPickNum] = useState<number>(defaultMyPickNum);

  const [currPick, setCurrPick] = useState<number>(1);
  const [draftHistory, setDraftHistory] = useState<(string | null)[]>(
    new Array(350).fill(null)
  );

  const wrappedSetNumTeams = (numTeams: number) => {
    if (draftStarted) {
      return;
    }
    setNumTeams(numTeams);
  };
  const getRoundForPickNum = (pickNum: number): (string | null)[] => {
    const roundIdx = getRoundIdxForPickNum(pickNum, numTeams);
    return draftHistory.slice(
      numTeams * roundIdx,
      numTeams * roundIdx + numTeams
    );
  };
  const onDraftPlayer = (playerId: string, pickNum: number): void => {
    draftHistory[pickNum - 1] = playerId;
    setDraftHistory(draftHistory);
  };
  const onRemoveDraftedPlayer = (pickNum: number): string | null => {
    const playerId = draftHistory[pickNum - 1];
    draftHistory[pickNum - 1] = null;
    setDraftHistory(draftHistory);
    return playerId;
  };
  const onNavLeft = (): void => {
    if (currPick > 1) {
      isEvenRound ? setCurrPick(currPick + 1) : setCurrPick(currPick - 1);
    }
  };
  const onNavRight = (): void => {
    if (currPick < draftHistory.length) {
      const nextCurrPick = isEvenRound ? currPick - 1 : currPick + 1;
      if (nextCurrPick <= draftHistory.length) {
        setCurrPick(nextCurrPick);
      }
    }
  };
  const onNavRoundUp = (): void => {
    if (isEvenRound) {
      setCurrPick(currPick - (2 * (currRoundPick - 1) + 1));
    } else if (roundIdx > 0) {
      setCurrPick(currPick - (2 * currRoundPick + 1));
    }
  };
  const onNavRoundDown = (): void => {
    const nextCurrPick = currPick + (2 * (numTeams - currRoundPick) + 1);
    if (nextCurrPick <= draftHistory.length) {
      setCurrPick(nextCurrPick);
    }
  };

  const roundIdx = useMemo(
    () => getRoundIdxForPickNum(currPick, numTeams),
    [currPick, numTeams]
  );
  const isEvenRound = useMemo(() => roundIdx % 2 === 1, [roundIdx]);
  const currRound = useMemo(
    () => getRoundForPickNum(currPick),
    [currPick, draftHistory, numTeams]
  );
  const currRoundPick = useMemo(
    () => calcCurrRoundPick(currPick, numTeams),
    [currPick, numTeams]
  );
  const currMyPickNum = useMemo(
    () => (isEvenRound ? numTeams - myPickNum + 1 : myPickNum),
    [isEvenRound, myPickNum, numTeams]
  );

  return {
    numTeams,
    setNumTeams: wrappedSetNumTeams,
    isStd,
    setIsStd,
    draftStarted,
    setDraftStarted,
    myPickNum,
    setMyPickNum,
    currPick,
    setCurrPick,
    draftHistory,
    setDraftHistory,
    roundIdx,
    isEvenRound,
    currRound,
    currRoundPick,
    currMyPickNum,
    getRoundForPickNum,
    onDraftPlayer,
    onRemoveDraftedPlayer,
    onNavLeft,
    onNavRight,
    onNavRoundUp,
    onNavRoundDown,
  };
};