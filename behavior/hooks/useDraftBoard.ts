import { useMemo, useState, Dispatch, SetStateAction, useEffect } from 'react';
import { calcCurrRoundPick, getRoundIdxForPickNum, getMyPicksBetween } from '../draft';
import { FantasySettings, ScoringFormat } from 'types';
import {settingsWithScoringFormat} from '../scoringFormat';

interface UseDraftBoardProps {
  defaultNumTeams?: number;
  defaultMyPickNum?: number;
}

interface UseDraftBoardReturn {
  settings: FantasySettings;
  replaceSettings: (settings: FantasySettings) => void;
  /** Applies metadata from an accepted, authoritative live draft source. */
  applyAuthoritativeDraftSettings: (
    metadata: Partial<Pick<FantasySettings, "numTeams" | "ppr" | "scoringFormat">>,
  ) => void;
  setIsPpr: (isPpr: boolean) => void;
  setScoringFormat: (scoringFormat: ScoringFormat) => void;
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
  myPicks: number[];
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
    scoringFormat: "standard",
    numTeams: defaultNumTeams,
    numStartingQbs: 1,
    numStartingRbs: 2,
    numStartingWrs: 2,
    numStartingTes: 1,
    numFlex: 1,
    numBenchPlayers: 5,
  })
  const [draftStarted, setDraftStarted] = useState<boolean>(false);
  const [myPickNum, setMyPickNum] = useState<number>(defaultMyPickNum);
  const [currPick, setCurrPick] = useState<number>(1);
  const [myPicks, setMyPicks] = useState<number[]>([])

  useEffect(() => {
    setSettings({ ...settings, numTeams: defaultNumTeams })
  }, [defaultNumTeams])

  useEffect(() => {
    const picksPerPlayer = 14
    setMyPicks(getMyPicksBetween(0, settings.numTeams * picksPerPlayer, myPickNum, settings.numTeams))
  }, [myPickNum, settings.numTeams])

  // settings management

  const setNumTeams = (numTeams: number) => {
    if (draftStarted) {
      return;
    }
    setSettings({ ...settings, numTeams });
  };
  const setIsPpr = (isPpr: boolean) => {
    setSettings(settingsWithScoringFormat(settings, isPpr ? "ppr" : "standard"))
  }
  const setScoringFormat = (scoringFormat: ScoringFormat) => {
    setSettings(settingsWithScoringFormat(settings, scoringFormat))
  }
  const replaceSettings = (nextSettings: FantasySettings) => {
    if (draftStarted) return
    setSettings({ ...nextSettings })
  }
  // Manual controls remain locked once drafting begins. A snapshot accepted by
  // the user is different: ESPN is the authority for its league format, and
  // this functional update keeps its related fields in one state transition.
  const applyAuthoritativeDraftSettings = (
    metadata: Partial<Pick<FantasySettings, "numTeams" | "ppr" | "scoringFormat">>,
  ) => {
    setSettings(current => {
      const next = { ...current, ...metadata }
      if (metadata.scoringFormat) {
        return settingsWithScoringFormat(next, metadata.scoringFormat)
      }
      return metadata.ppr === undefined ? next : settingsWithScoringFormat(
        next, metadata.ppr ? "ppr" : "standard",
      )
    })
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
    replaceSettings,
    applyAuthoritativeDraftSettings,
    setNumTeams,
    setIsPpr,
    setScoringFormat,
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
    myPicks,
    onNavLeft,
    onNavRight,
    onNavRoundUp,
    onNavRoundDown,
  };
};
