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
  draftHistory: (string | null)[];
  setDraftHistory: Dispatch<SetStateAction<(string | null)[]>>;
  roundIdx: number;
  isEvenRound: boolean;
  currRound: (string | null)[];
  currRoundPick: number;
  currMyPickNum: number;
  setNumTeams: (numTeams: number) => void;
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
  const [draftHistory, setDraftHistory] = useState<(string | null)[]>(
    new Array(350).fill(null)
  );

  useEffect(() => {
    setSettings({ ...settings, numTeams: defaultNumTeams })
  }, [defaultNumTeams])

  const setNumTeams = (numTeams: number) => {
    if (draftStarted) {
      return;
    }
    setSettings({ ...settings, numTeams });
  };
  const setIsPpr = (isPpr: boolean) => {
    setSettings({ ...settings, ppr: isPpr })
  }
  const getRoundForPickNum = (pickNum: number): (string | null)[] => {
    const roundIdx = getRoundIdxForPickNum(pickNum, settings.numTeams);
    return draftHistory.slice(
      settings.numTeams * roundIdx,
      settings.numTeams * roundIdx + settings.numTeams
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
  const currRound = useMemo(
    () => getRoundForPickNum(currPick),
    [currPick, draftHistory, settings.numTeams]
  );
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