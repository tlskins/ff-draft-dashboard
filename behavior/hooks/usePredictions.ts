import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'react-toastify';
import {
  FantasyPosition,
  FantasySettings,
  BoardSettings,
  DataRanker,
  OptimalRoster,
} from '../../types';
import {
  Roster,
  PlayerRanks,
  PositionCounts,
  nextPositionPicked,
  predictNextPick,
  getPlayerMetrics,
  rankablePositions,
  roundForPick,
  getPickInRound,
  getMyPicksBetween,
  getProjectedTier,
  getRoundIdxForPickNum,
} from '../draft';
import { Player, RankingSummary } from 'types';

type PredictedPicks = { [playerId: string]: number };
type TierPredictions = {
  [key: string]: number;
  [FantasyPosition.QUARTERBACK]: number;
  [FantasyPosition.RUNNING_BACK]: number;
  [FantasyPosition.WIDE_RECEIVER]: number;
  [FantasyPosition.TIGHT_END]: number;
};

const calculatePositionCounts = (rosters: Roster[]): PositionCounts => {
    const posCounts: PositionCounts = { QB: 0, RB: 0, WR: 0, TE: 0, DST: 0, '': 0 };
    rosters.forEach(roster => {
      rankablePositions.forEach(pos => {
        if (pos in roster && posCounts[pos] !== undefined) {
          const rosterPos = roster[pos as keyof Roster];
          if(Array.isArray(rosterPos)) {
            posCounts[pos]! += rosterPos.length;
          }
        }
      });
    });
    return posCounts;
};

const predictFuturePicks = (
    { rosters, playerRanks, settings, boardSettings, currPick, myPickNum }: {
        rosters: Roster[];
        playerRanks: PlayerRanks;
        settings: FantasySettings;
        boardSettings: BoardSettings;
        currPick: number;
        myPickNum: number;
    },
    initialPosCounts: PositionCounts,
    predictUpToPick: number,
): { predictedPicks: PredictedPicks; finalPosCounts: PositionCounts } => {
    let pickPredicts: PredictedPicks = {};
    let posCounts = { ...initialPosCounts };
    let availablePlayers = [...playerRanks.availPlayersByAdp];

    for (let i = 0; i < predictUpToPick - currPick; i++) {
        const pickNum = currPick + i;
        if (pickNum >= predictUpToPick) break;

        const round = roundForPick(pickNum, settings.numTeams);
        const pickInRound = getPickInRound(pickNum, settings.numTeams);
        const isEven = round % 2 === 0;
        const teamNum = isEven ? settings.numTeams - pickInRound + 1 : pickInRound;
        const roster = rosters[teamNum - 1];

        if (roster) {
            const positions = nextPositionPicked(roster, round, posCounts);
            const { predicted, updatedCounts, pickedPlayer } = predictNextPick(
                availablePlayers,
                settings,
                boardSettings,
                positions,
                pickPredicts,
                posCounts,
                myPickNum,
                currPick,
                pickNum
            );
            pickPredicts = predicted;
            posCounts = updatedCounts as { [key in FantasyPosition]: number };
            if (pickedPlayer) {
                availablePlayers = availablePlayers.filter(p => p.id !== pickedPlayer.id);
            }
        }
    }

    return { predictedPicks: pickPredicts, finalPosCounts: posCounts };
}

const detectTierRuns = (
    { playerRanks, settings, boardSettings }: {
        playerRanks: PlayerRanks;
        settings: FantasySettings;
        boardSettings: BoardSettings;
    },
    predictedPicks: PredictedPicks,
    predRunTiers: TierPredictions
): { tierRunAlerts: string[]; nextRunTiers: TierPredictions; runDetected: boolean } => {
    let runDetected = false;
    const minTierDiffRun = 2;
    const tierRunAlerts: string[] = [];
    const nextRunTiers = { ...predRunTiers };

    Object.keys(predRunTiers).forEach(pos => {
        const posPlayersByAdp = playerRanks.availPlayersByAdp.filter(p => p.position === pos);
        if (posPlayersByAdp.length < 2) return;

        const posNextTopPlayer = posPlayersByAdp[1];
        
        const nextTopPlayerMetrics = getPlayerMetrics(posNextTopPlayer, settings, boardSettings);
        if (nextTopPlayerMetrics.tier) {
            const currTier = nextTopPlayerMetrics.tier.tierNumber;
            nextRunTiers[pos as keyof TierPredictions] = currTier;

            const nextPosPlayersByAdp = posPlayersByAdp.filter(p => ![1, 2].includes(predictedPicks[p.id]));
            if (nextPosPlayersByAdp.length === 0) return;
            
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
    });

    return { tierRunAlerts, nextRunTiers, runDetected };
};

const showTierRunAlerts = (alerts: string[]) => {
    alerts.forEach(alert => {
        toast(alert, {
            type: 'warning',
            position: 'top-right',
            theme: 'colored',
            autoClose: 10000,
        });
    });
};

interface UsePredictionsProps {
  rosters: Roster[];
  playerRanks: PlayerRanks;
  settings: FantasySettings;
  boardSettings: BoardSettings;
  currPick: number;
  myPickNum: number;
  draftStarted: boolean;
  rankingSummaries: RankingSummary[];
}

export const usePredictions = ({
  rosters,
  playerRanks,
  settings,
  boardSettings,
  currPick,
  myPickNum,
  draftStarted,
  rankingSummaries,
}: UsePredictionsProps) => {
  const [predictedPicks, setPredictedPicks] = useState<PredictedPicks>({});
  const [optimalRoster, setOptimalRoster] = useState<OptimalRoster>({ value: 0, roster: {} });
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

  const predictOptimalRoster = useCallback(() => {
    const myPicks = getMyPicksBetween(currPick-1, settings.numTeams * 10, myPickNum, settings.numTeams);
    const getPlayerRank = (player: Player) => {
        return settings.ppr ? player.pprRankTier || 999 : player.stdRankTier || 999;
    }
    const getPlayerAdp = (player: Player) => {
        return getPlayerMetrics(player, settings, boardSettings).adp || 9999;
    }
    const playerRanksByPos = rankablePositions.reduce((acc, pos) => {
        acc[pos] = playerRanks[pos as keyof PlayerRanks].sort((a, b) => getPlayerRank(a) - getPlayerRank(b));
        return acc;
    }, {} as { [key in FantasyPosition]: Player[] });

    let availablePlayersByRound: { [round: number]: Player[] } = {};
    myPicks.forEach(myPick => {
        availablePlayersByRound[myPick] = rankablePositions.map(pos => {
            // Get players available at this pick (ADP >= myPick means they should still be available)
            const availablePlayersForPos = playerRanksByPos[pos].filter(p => {
                const adp = getPlayerAdp(p);
                return adp >= myPick && adp < 999; // Exclude players with no ADP data (9999)
            });
            
            // If no players with valid ADP, fall back to rank-based selection
            if (availablePlayersForPos.length === 0) {
                const rankBasedPlayers = playerRanksByPos[pos].slice(0, Math.max(1, Math.floor(myPick / 2)));
                return rankBasedPlayers[0];
            }
            
            return availablePlayersForPos[0];
        }).filter((p): p is Player => p !== undefined);
    });
    
    let bestRoster: OptimalRoster = { value: 0, roster: {} };

    const findBestRoster = (
        pickIndex: number,
        currentRoster: OptimalRoster,
        currentValue: number,
        posCounts: PositionCounts,
        selectedPlayerIds: Set<string> = new Set(),
    ) => {
        // Check if all required positions are filled
        const { numStartingQbs, numStartingRbs, numStartingWrs, numStartingTes, numFlex } = settings;
        const totalPositionsFilled = (posCounts.QB || 0) + (posCounts.RB || 0) + (posCounts.WR || 0) + (posCounts.TE || 0);
        const totalRequiredPositions = numStartingQbs + numStartingRbs + numStartingWrs + numStartingTes + numFlex;
        const allPositionsFilled = totalPositionsFilled >= totalRequiredPositions;
        
        if (pickIndex >= myPicks.length || allPositionsFilled) {
            if (currentValue > bestRoster.value) {
                bestRoster = { roster: currentRoster.roster, value: currentValue };
            }
            return;
        }

        const pick = myPicks[pickIndex];
        const playersToConsider = availablePlayersByRound[pick];

        if (!playersToConsider || playersToConsider.length === 0) {
            return;
        }

        // Filter out already selected players
        const availablePlayers = playersToConsider.filter(player => !selectedPlayerIds.has(player.id));

        if (availablePlayers.length === 0) {
            return;
        }

        availablePlayers.forEach((player) => {
            const position = player.position as FantasyPosition;
            const currentPositionCount = posCounts[position] || 0;
            const { numStartingQbs, numStartingRbs, numStartingWrs, numStartingTes, numFlex } = settings;

            let maxForPosition = 0;
            if (position === FantasyPosition.QUARTERBACK) maxForPosition = numStartingQbs;
            else if (position === FantasyPosition.RUNNING_BACK) maxForPosition = numStartingRbs + numFlex;
            else if (position === FantasyPosition.WIDE_RECEIVER) maxForPosition = numStartingWrs + numFlex;
            else if (position === FantasyPosition.TIGHT_END) maxForPosition = numStartingTes + numFlex;

            if (currentPositionCount < maxForPosition) {
                const tier = getProjectedTier(player, boardSettings.ranker, DataRanker.LAST_SSN_PPG, settings, rankingSummaries);
                const tierValue = tier ? (tier.lowerLimitValue + tier.upperLimitValue) / 2 : 0;
                
                let newPosCounts = { ...posCounts, [position]: currentPositionCount + 1 };
                let newSelectedPlayerIds = new Set(selectedPlayerIds);
                newSelectedPlayerIds.add(player.id);

                findBestRoster(
                    pickIndex + 1,
                    {
                      ...currentRoster,
                      roster: {
                        ...currentRoster.roster,
                        [pick]: { player, round: getRoundIdxForPickNum(pick, settings.numTeams) + 1 }
                      },
                    },
                    currentValue + tierValue,
                    newPosCounts,
                    newSelectedPlayerIds,
                );
            }
        });
    }

    findBestRoster(0, { value: 0, roster: {} }, 0, { QB: 0, RB: 0, WR: 0, TE: 0 });
    setOptimalRoster(bestRoster);
  }, [boardSettings, currPick, myPickNum, playerRanks, rankingSummaries, rosters, settings]);

  const predictPicks = useCallback(() => {
    if (rosters.length === 0 || !draftStarted) {
      return;
    }
    if (currPick <= maxCurrPick.current) {
      return;
    }

    maxCurrPick.current = currPick;
    const initialPosCounts = calculatePositionCounts(rosters);

    const { predictedPicks: pickPredicts } = predictFuturePicks(
        { rosters, playerRanks, settings, boardSettings, currPick, myPickNum },
        initialPosCounts,
        myPickNum
    );
    
    const { tierRunAlerts, nextRunTiers, runDetected } = detectTierRuns(
        { playerRanks, settings, boardSettings },
        pickPredicts,
        predRunTiers
    );

    showTierRunAlerts(tierRunAlerts);

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
    predRunTiers,
    draftStarted,
    predNextTiers,
    rosters,
    playerRanks,
    boardSettings,
    rankingSummaries,
  ]);

  useEffect(() => {
    predictPicks();
    if (draftStarted) {
        predictOptimalRoster();
    }
  }, [predictPicks, numPostPredicts, draftStarted, predictOptimalRoster]);


  return { predictedPicks, predNextTiers, setNumPostPredicts, optimalRoster };
}; 