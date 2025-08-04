import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'react-toastify';
import {
  FantasyPosition,
  FantasySettings,
  BoardSettings,
} from '../../types';
import {
  Roster,
  PlayerRanks,
  PositionCounts,
  nextPositionPicked,
  predictNextPick,
  getPlayerMetrics,
  rankablePositions,
} from '../draft';

type PredictedPicks = { [playerId: string]: number };
type TierPredictions = {
  [key: string]: number;
  [FantasyPosition.QUARTERBACK]: number;
  [FantasyPosition.RUNNING_BACK]: number;
  [FantasyPosition.WIDE_RECEIVER]: number;
  [FantasyPosition.TIGHT_END]: number;
};

interface UsePredictionsProps {
  rosters: Roster[];
  playerRanks: PlayerRanks;
  settings: FantasySettings;
  boardSettings: BoardSettings;
  currPick: number;
  myPickNum: number;
  currRoundPick: number;
  draftStarted: boolean;
}

export const usePredictions = ({
  rosters,
  playerRanks,
  settings,
  boardSettings,
  currPick,
  myPickNum,
  currRoundPick,
  draftStarted,
}: UsePredictionsProps) => {
  const [predictedPicks, setPredictedPicks] = useState<PredictedPicks>({});
  const [predRunTiers, setPredRunTiers] = useState<TierPredictions>({
    [FantasyPosition.QUARTERBACK]: 0,
    [FantasyPosition.RUNNING_BACK]: 0,
    [FantasyPosition.WIDE_RECEIVER]: 0,
    [FantasyPosition.TIGHT_END]: 0,
  });
  const [predNextTiers, setPredNextTiers] = useState<TierPredictions>({
    [FantasyPosition.QUARTERBACK]: 0,
    [FantasyPosition.RUNNING_BACK]: 0,
    [FantasyPosition.WIDE_RECEIVER]: 0,
    [FantasyPosition.TIGHT_END]: 0,
  });
  const [numPostPredicts, setNumPostPredicts] = useState(0);

  const maxCurrPick = useRef(0);

  const predictPicks = useCallback(() => {
    if (rosters.length === 0 || !draftStarted) {
      return;
    }
    if (currPick <= maxCurrPick.current) {
      return;
    }

    maxCurrPick.current = currPick;
    let posCounts: PositionCounts = { QB: 0, RB: 0, WR: 0, TE: 0, DST: 0, "": 0 };
    rosters.forEach(roster => {
      rankablePositions.forEach(pos => {
        if (pos in roster && posCounts[pos] !== undefined) {
          posCounts[pos] += (roster[pos as keyof Roster] as string[]).length;
        }
      });
    });

    let pickPredicts: PredictedPicks = {};
    Array.from(Array(5 * settings.numTeams)).forEach((_, i) => {
      if (currRoundPick > 0) {
        const roster = rosters[currRoundPick - 1];
        const roundNum = Math.floor((currPick + i - 1) / settings.numTeams) + 1;
        const positions = nextPositionPicked(roster, roundNum, posCounts);
        const { predicted, updatedCounts } = predictNextPick(
          playerRanks.availPlayersByAdp,
          settings,
          boardSettings,
          positions,
          pickPredicts,
          posCounts,
          myPickNum,
          currPick,
          currPick + i
        );
        pickPredicts = predicted;
        posCounts = updatedCounts as { [key in FantasyPosition]: number };
      }
    });

    let runDetected = false;
    const minTierDiffRun = 2;
    const tierRunAlerts: string[] = [];
    const nextRunTiers = { ...predRunTiers };

    Object.keys(predRunTiers).forEach(pos => {
      const posPlayersByAdp = playerRanks.availPlayersByAdp.filter(p => p.position === pos);
      const posTopPlayer = posPlayersByAdp[0];
      if (!posTopPlayer) {
        return;
      }
      const posNextTopPlayer = posPlayersByAdp[1];
      if (posNextTopPlayer) {
        const nextTopPlayerMetrics = getPlayerMetrics(posNextTopPlayer, settings, boardSettings);
        if (nextTopPlayerMetrics.tier) {
          const currTier = nextTopPlayerMetrics.tier.tierNumber;
          nextRunTiers[pos as keyof TierPredictions] = currTier;

          const nextPosPlayersByAdp = posPlayersByAdp.filter(p => ![1, 2].includes(pickPredicts[p.id]));
          const nextPosTopPlayer = nextPosPlayersByAdp[0];
          const nextTier = nextPosTopPlayer && getPlayerMetrics(nextPosTopPlayer, settings, boardSettings).tier?.tierNumber;
          if (!nextTier || (currTier > predRunTiers[pos as keyof TierPredictions] && nextTier - currTier >= minTierDiffRun)) {
            runDetected = true;
            const playersTaken = posPlayersByAdp.length - nextPosPlayersByAdp.length;
            tierRunAlerts.push(
              `Run on ${pos} down to tier ${nextTier || 'end'} after your next pick with ${playersTaken} ${pos}s taken`,
            );
          }
        }
      }
    });

    tierRunAlerts.forEach(alert => {
      toast(alert, {
        type: 'warning',
        position: 'top-right',
        theme: 'colored',
        autoClose: 10000,
      });
    });

    if (runDetected) {
      setPredRunTiers(nextRunTiers);
    }
    
    setPredNextTiers(predNextTiers);
    setPredictedPicks(pickPredicts);
  }, [
    settings,
    boardSettings,
    playerRanks,
    rosters,
    myPickNum,
    currPick,
    currRoundPick,
    predRunTiers,
    draftStarted,
    predNextTiers,
  ]);

  useEffect(() => {
    predictPicks();
  }, [predictPicks, numPostPredicts]);


  return { predictedPicks, predNextTiers, setNumPostPredicts };
}; 