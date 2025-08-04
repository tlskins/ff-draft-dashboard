import React from 'react';
import {
  Player,
  PlayerStats,
  FantasyPosition,
  BaseStats,
  PassingStats,
  RushingStats,
  ReceivingStats,
  FantasySettings,
} from '../types';

interface HistoricalStatsProps {
  player: Player | null;
  settings: FantasySettings;
}

const formatHeader = (key: string) => {
    return key
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, (str) => str.toUpperCase());
};

const STAT_ABBREVIATION_MAP: { [key: string]: string } = {
    'g': 'Gms',
    'gs': 'Gms St',
    'passCmp': 'Cmp',
    'passAtt': 'Pa Atts',
    'passYds': 'Pa Yds',
    'passTd': 'Pa TDs',
    'int': 'Ints',
    'rushAtt': 'Ru Atts',
    'rushYds': 'Ru Yds',
    'rushYA': 'Yd/Att',
    'rushTd': 'Ru TDs',
    'fmb': 'Fmb',
    'fl': 'Fmb Lost',
    'recTgt': 'Tgts',
    'rec': 'Recs',
    'recYds': 'Rec Yds',
    'recYR': 'Yd/Rec',
    'recTd': 'Rec TDs',
    'fantasyPointsPerGame': 'PPG',
    'pprPointsPerGame': 'PPR PPG',
};

const STAT_CATEGORY_COLORS: { [key: string]: string } = {
    base: 'bg-blue-100',
    passing: 'bg-green-100',
    rushing: 'bg-red-100',
    receiving: 'bg-yellow-100',
};

const formatHeaderV2 = (key: string) => {
    return STAT_ABBREVIATION_MAP[key] ?? formatHeader(key);
}

type HistoricalStat = PlayerStats & { year: string };

const HistoricalStats: React.FC<HistoricalStatsProps> = ({ player, settings }) => {
  if (!player) {
    return (
      <div className="flex flex-col py-2 px-4">
        <p className="font-semibold underline py-2">
          Historical Stats
        </p>
        <p className="font-semibold">
          Hover on player to view historical stats...
        </p>
      </div>
    );
  }

  const historicalStatsArray: HistoricalStat[] = player.historicalStats 
    ? Object.entries(player.historicalStats)
        .map(([year, stats]) => ({ ...stats, year }))
        .sort((a, b) => parseInt(b.year) - parseInt(a.year))
    : [];
  
  if (historicalStatsArray.length === 0) {
    return (
        <div className="flex flex-col py-2 px-4">
            <p className="font-semibold underline py-2">
                {player.fullName} Historical Stats
            </p>
            <p className="font-semibold">No historical stats available.</p>
        </div>
    );
  }
  
  const baseStatKeys = [...BaseStats, settings.ppr ? 'pprPointsPerGame' : 'fantasyPointsPerGame'];
  let passingStatKeys: string[] = [];
  let rushingStatKeys: string[] = [];
  let receivingStatKeys: string[] = [];
  
  switch (player.position) {
    case FantasyPosition.QUARTERBACK:
        passingStatKeys = [...PassingStats];
        rushingStatKeys = [...RushingStats];
        break;
    case FantasyPosition.RUNNING_BACK:
        rushingStatKeys = [...RushingStats];
        receivingStatKeys = [...ReceivingStats];
        break;
    case FantasyPosition.WIDE_RECEIVER:
    case FantasyPosition.TIGHT_END:
        receivingStatKeys = [...ReceivingStats];
        break;
  }

  const renderHeader = (keys: string[], category: string) => (
    keys.map(key => <th key={key} className={`${STAT_CATEGORY_COLORS[category]} border-2 border-slate-700`}>{formatHeaderV2(key)}</th>)
  );

  const renderRow = (stats: HistoricalStat, keys: string[], category: string) => (
    keys.map(key => <td key={key} className={`${STAT_CATEGORY_COLORS[category]} border-2 border-slate-700 text-center`}>
        {(stats as any)[key] ?? '-'}
    </td>)
  );

  console.log('historicalStatsArray', historicalStatsArray, passingStatKeys)

  return (
    <div className="py-2 px-4 justify-center">
      <p className="font-semibold underline py-2">
        {player.fullName} ({player.position}) Historical Stats
      </p>
      <div className="flex flex-row justify-center">
        <table className="table-fixed text-sm border-separate border-spacing-0 border border-slate-500 shadow-md">
          <thead>
            <tr className="text-left">
              <th className="border-2 border-slate-700">Year</th>
              {renderHeader(baseStatKeys, 'base')}
              {renderHeader(passingStatKeys, 'passing')}
              {renderHeader(rushingStatKeys, 'rushing')}
              {renderHeader(receivingStatKeys, 'receiving')}
            </tr>
          </thead>
          <tbody>
            {historicalStatsArray.map((stats) => (
              <tr key={stats.year}>
                <td className="border-2 border-slate-700 text-center">{stats.year}</td>
                {renderRow(stats, baseStatKeys, 'base')}
                {renderRow(stats, passingStatKeys, 'passing')}
                {renderRow(stats, rushingStatKeys, 'rushing')}
                {renderRow(stats, receivingStatKeys, 'receiving')}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default HistoricalStats; 