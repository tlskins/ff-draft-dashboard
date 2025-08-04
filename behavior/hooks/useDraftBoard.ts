import { useMemo, useState, Dispatch, SetStateAction, useEffect } from 'react';
import { calcCurrRoundPick, getRoundIdxForPickNum } from '../draft';
import { FantasySettings } from 'types';

interface UseDraftBoardProps {
  defaultNumTeams?: number;
  defaultMyPickNum?: number;
}

interface UseDraftBoardReturn {
  settings: FantasySettings;
  setIsPpr: (isPpr: boolean) => void;
  draftStarted: boolean;
  setDraftStarted: Dispatch<SetStateAction<boolean>>;
  myPickNum: number;
  setMyPickNum: Dispatch<SetStateAction<number>>;
  currPick: number;
  setCurrPick: Dispatch<SetStateAction<number>>;
  roundIdx: number;
  isEvenRound: boolean;
  currRoundPick: number;
  currMyPickNum: number;
  setNumTeams: (numTeams: number) => void;
  onNavLeft: () => void;
  onNavRight: (draftHistory: (string | null)[]) => void;
  onNavRoundUp: () => void;
  onNavRoundDown: (draftHistory: (string | null)[]) => void;
}

export const useDraftBoard = ({
  defaultNumTeams = 12,
  defaultMyPickNum = 6,
}: UseDraftBoardProps = {}): UseDraftBoardReturn => {
  const [settings, setSettings] = useState<FantasySettings>({
    ppr: false,
    numTeams: defaultNumTeams,
    numStartingQbs: 1,
    numStartingRbs: 2,
    numStartingWrs: 2,
    numStartingTes: 1,
    numFlexPositions: 1,
    numBenchPlayers: 5,
  })
  const [draftStarted, setDraftStarted] = useState<boolean>(false);
  const [myPickNum, setMyPickNum] = useState<number>(defaultMyPickNum);

  const [currPick, setCurrPick] = useState<number>(1);

  useEffect(() => {
    setSettings({ ...settings, numTeams: defaultNumTeams })
  }, [defaultNumTeams])

  // settings management

  const setNumTeams = (numTeams: number) => {
    if (draftStarted) {
      return;
    }
    setSettings({ ...settings, numTeams });
  };
  const setIsPpr = (isPpr: boolean) => {
    setSettings({ ...settings, ppr: isPpr })
  }

  // board navigation

  const onNavLeft = (): void => {
    if (currPick > 1) {
      isEvenRound ? setCurrPick(currPick + 1) : setCurrPick(currPick - 1);
    }
  };
  const onNavRight = (draftHistory: (string | null)[]): void => {
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
  const onNavRoundDown = (draftHistory: (string | null)[]): void => {
    const nextCurrPick = currPick + (2 * (settings.numTeams - currRoundPick) + 1);
    if (nextCurrPick <= draftHistory.length) {
      setCurrPick(nextCurrPick);
    }
  };


  const roundIdx = useMemo(
    () => getRoundIdxForPickNum(currPick, settings.numTeams),
    [currPick, settings.numTeams]
  );
  const isEvenRound = useMemo(() => roundIdx % 2 === 1, [roundIdx]);
  const currRoundPick = useMemo(
    () => calcCurrRoundPick(currPick, settings.numTeams),
    [currPick, settings.numTeams]
  );
  const currMyPickNum = useMemo(
    () => (isEvenRound ? settings.numTeams - myPickNum + 1 : myPickNum),
    [isEvenRound, myPickNum, settings.numTeams]
  );

  return {
    settings,
    setNumTeams,
    setIsPpr,
    draftStarted,
    setDraftStarted,
    myPickNum,
    setMyPickNum,
    currPick,
    setCurrPick,
    roundIdx,
    isEvenRound,
    currRoundPick,
    currMyPickNum,
    onNavLeft,
    onNavRight,
    onNavRoundUp,
    onNavRoundDown,
  };
};