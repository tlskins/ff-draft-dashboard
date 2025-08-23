import React from 'react';
import {
  Player,
  FantasySettings,
  BoardSettings,
  ThirdPartyRanker,
  PlayerMetrics,
} from '../types';
import { getPlayerMetrics, getRoundAndPickShortText } from '../behavior/draft';

interface PlayerRankingTableProps {
  player: Player | null;
  settings: FantasySettings;
  boardSettings: BoardSettings;
}

const PlayerRankingTable: React.FC<PlayerRankingTableProps> = ({ 
  player, 
  settings, 
  boardSettings 
}) => {
  if (!player) {
    return (
      <div className="flex flex-col py-2 px-4">
        <p className="font-semibold underline py-2">
          Player Rankings
        </p>
        <p className="font-semibold">
          Hover on player to view rankings...
        </p>
      </div>
    );
  }

  // Helper function to get ranking data for a specific ranker
  const getRankingData = (ranker: ThirdPartyRanker) => {
    const ranking = player.ranks?.[ranker];
    if (!ranking) {
      return {
        overallRank: undefined,
        posRank: undefined,
        roundAndPick: 'N/A'
      };
    }

    const overallRank = settings.ppr ? ranking.pprOverallRank : ranking.standardOverallRank;
    const posRank = settings.ppr ? ranking.pprPositionRank : ranking.standardPositionRank;
    const roundAndPick = overallRank 
      ? getRoundAndPickShortText(overallRank, settings.numTeams)
      : 'N/A';

    return {
      overallRank,
      posRank,
      roundAndPick
    };
  };

  // Get ADP data
  const getAdpData = () => {
    const adpRanking = player.ranks?.[boardSettings.adpRanker];
    if (!adpRanking?.adp) {
      return {
        adp: undefined,
        roundAndPick: 'N/A'
      };
    }

    const adp = adpRanking.adp;
    const roundAndPick = getRoundAndPickShortText(adp, settings.numTeams);

    return {
      adp: parseFloat(adp.toFixed(1)),
      roundAndPick
    };
  };

  const harrisData = getRankingData(ThirdPartyRanker.HARRIS);
  const fprosData = getRankingData(ThirdPartyRanker.FPROS);
  const adpData = getAdpData();

  return (
    <div className="py-2 px-4 text-sm w-full">
      <p className="font-semibold underline py-2">
        {player.fullName} ({player.position}) - {player.team} Rankings
      </p>
      <div className="overflow-x-auto w-full">
        <div className="flex flex-row md:justify-center">
          <table className="table-fixed text-xs border-separate border-spacing-0 border border-slate-500 shadow-md min-w-full md:min-w-0">
            <thead>
              <tr className="text-left bg-gray-100">
                <th className="border-2 border-slate-700 px-2 py-1">Source</th>
                <th className="border-2 border-slate-700 px-2 py-1">Overall</th>
                <th className="border-2 border-slate-700 px-2 py-1">Pos Rank</th>
                <th className="border-2 border-slate-700 px-2 py-1">Round.Pick</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border-2 border-slate-700 px-2 py-1 font-medium">Harris</td>
                <td className="border-2 border-slate-700 px-2 py-1 text-center">
                  {harrisData.overallRank || '-'}
                </td>
                <td className="border-2 border-slate-700 px-2 py-1 text-center">
                  {harrisData.posRank || '-'}
                </td>
                <td className="border-2 border-slate-700 px-2 py-1 text-center">
                  {harrisData.roundAndPick}
                </td>
              </tr>
              <tr>
                <td className="border-2 border-slate-700 px-2 py-1 font-medium">FantasyPros</td>
                <td className="border-2 border-slate-700 px-2 py-1 text-center">
                  {fprosData.overallRank || '-'}
                </td>
                <td className="border-2 border-slate-700 px-2 py-1 text-center">
                  {fprosData.posRank || '-'}
                </td>
                <td className="border-2 border-slate-700 px-2 py-1 text-center">
                  {fprosData.roundAndPick}
                </td>
              </tr>
              <tr>
                <td className="border-2 border-slate-700 px-2 py-1 font-medium">
                  ADP ({boardSettings.adpRanker})
                </td>
                <td className="border-2 border-slate-700 px-2 py-1 text-center">
                  {adpData.adp || '-'}
                </td>
                <td className="border-2 border-slate-700 px-2 py-1 text-center">
                  -
                </td>
                <td className="border-2 border-slate-700 px-2 py-1 text-center">
                  {adpData.roundAndPick}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default PlayerRankingTable;
