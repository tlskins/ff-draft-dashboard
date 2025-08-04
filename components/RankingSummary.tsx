import React from 'react';
import { RankingSummary, Player, DataRanker, FantasySettings, FantasyRanker } from '../types';
import { getProjectedTier } from 'behavior/draft';

interface RankingSummaryProps {
  settings: FantasySettings;
  activePlayer: Player | null;
  rankingSummaries: RankingSummary[];
  ranker: FantasyRanker;
}

const RankingSummaryDisplay: React.FC<RankingSummaryProps> = ({ settings, activePlayer, rankingSummaries, ranker }) => {
  if (!activePlayer) {
    return null;
  }
  
  const position = activePlayer.position;
  const summary = rankingSummaries.find(s => s.ranker === DataRanker.LAST_SSN_PPG && s.ppr === settings.ppr);
  const projPlayerTier = getProjectedTier(activePlayer, ranker, DataRanker.LAST_SSN_PPG, settings, rankingSummaries);
  const expAvgProjPlayerPts = projPlayerTier ? (projPlayerTier.upperLimitValue + projPlayerTier.lowerLimitValue) / 2 : 0;

  if (!summary) {
    return (
      <div className="flex flex-col py-2 px-4">
        <p className="font-semibold underline py-2">
          Ranking Summary for {position}
        </p>
        <p className="font-semibold">
          No summary available for this position.
        </p>
      </div>
    );
  }

  const replacementLevel = summary.replacementLevels[position];
  const stdDev = summary.stdDevs[position];
  const tiers = summary.tiers[position] || [];

  if (tiers.length === 0) {
      return (
        <div className="flex flex-col py-2 px-4">
            <p className="font-semibold underline py-2">
                Ranking Summary for {position}
            </p>
            <p className="font-semibold">No tiers available for this position.</p>
        </div>
      );
  }

  const expPtsAboveReplacement = expAvgProjPlayerPts ? (expAvgProjPlayerPts - replacementLevel[1]) : undefined;

  return (
    <div className="py-2 px-4 justify-center">
      <p className="font-semibold underline py-2">
        {summary.ranker} - {position} ({summary.ppr ? 'PPR' : 'Standard'})
      </p>
      <div className="flex flex-row justify-center">
        <table className="table-auto text-sm border-separate border-spacing-0 border border-slate-500 shadow-md mt-4">
            <thead>
                <tr className="text-left">
                    <th className="border-2 border-slate-700 bg-blue-100 p-2">Std Dev</th>
                    <th className="border-2 border-slate-700 bg-blue-100 p-2">Repl. Rank</th>
                    <th className="border-2 border-slate-700 bg-blue-100 p-2">Repl. Points</th>
                    <th className="border-2 border-slate-700 bg-blue-100 p-2">Exp. Points Above Repl.</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td className="border-2 border-slate-700 text-center p-2">{stdDev.toFixed(2)}</td>
                    <td className="border-2 border-slate-700 text-center p-2">{replacementLevel[0]}</td>
                    <td className="border-2 border-slate-700 text-center p-2">{replacementLevel[1].toFixed(2)}</td>
                    <td className={`border-2 border-slate-700 text-center p-2 ${(expPtsAboveReplacement || 0.0) > 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {expPtsAboveReplacement ? expPtsAboveReplacement.toFixed(1) : 'N/A'}
                    </td>
                </tr>
            </tbody>
        </table>
      </div>
      <div className="flex flex-row justify-center">
        <table className="table-auto text-sm border-separate border-spacing-0 border border-slate-500 shadow-md mt-4">
          <thead>
            <tr className="text-left">
              <th className="border-2 border-slate-700 bg-blue-100 p-2">
                Tier
              </th>
              <th className="border-2 border-slate-700 bg-blue-100 p-2">
                Players In Tier Last Yr
              </th>
              <th className="border-2 border-slate-700 bg-blue-100 p-2">
                PPG Range
              </th>
              <th className="border-2 border-slate-700 bg-blue-100 p-2">
                Avg. PPG
              </th>
            </tr>
          </thead>
          <tbody>
            {tiers.map((tier) => {
              const isPlayerTier = tier.tierNumber === projPlayerTier?.tierNumber;
              const tierColor = isPlayerTier ? 'bg-green-100' : 'bg-blue-100';
              const tierAvg = (tier.lowerLimitValue + tier.upperLimitValue) / 2;
              return (
              <tr key={tier.tierNumber}>
                <td key={`tier-${tier.tierNumber}`} className={`border-2 border-slate-700 text-center p-2 ${tierColor}`}>
                  {tier.tierNumber}
                </td>
                <td key={`tier-${tier.tierNumber}-players`} className={`border-2 border-slate-700 text-center p-2 ${tierColor}`}>
                  {tier.lowerLimitPlayerIdx-tier.upperLimitPlayerIdx}
                </td>
                <td key={`tier-${tier.tierNumber}-range`} className={`border-2 border-slate-700 text-center p-2 ${tierColor}`}>
                  {tier.lowerLimitValue} - {tier.upperLimitValue}
                </td>
                <td key={`tier-${tier.tierNumber}-avg`} className={`border-2 border-slate-700 text-center p-2 ${tierColor}`}>
                  {tierAvg.toFixed(2)}
                </td>
              </tr>
            )})}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default RankingSummaryDisplay; 