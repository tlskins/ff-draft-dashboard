import React, { useState } from "react"
import Moment from 'moment'

import {
  Player,
  PosStatsByNumTeamByYear,
  Stats,
} from '../types'

const currYear = parseInt(Moment().format('YYYY'))
const currYearSub1 = currYear - 1
const currYearSub2 = currYear - 2
const currYearSub3 = currYear - 3

const significantStatDiffBg = (
  playerStats: Stats,
  tierStatsComp: Stats,
  statType: keyof Stats,
  defaultBg: string,
  diffPctGt = 0.25
) => {
  if ( !playerStats || !tierStatsComp ) {
    return defaultBg
  }
  const playerStat = playerStats[statType] as number
  const compStat = tierStatsComp[statType] as number
  const statDiff = compStat ? ( playerStat - compStat ) / compStat :  playerStat - compStat
  if ( statDiff >= diffPctGt ) {
    return 'bg-green-500'
  }
  if ( statDiff <= diffPctGt * -1 ) {
    return 'bg-red-500'
  }
  return defaultBg
} 

interface StatsSectionProps {
  viewPlayerId: string;
  playerLib: { [id: string]: Player };
  posStatsByNumTeamByYear: PosStatsByNumTeamByYear;
  numTeams: number;
  isStd: boolean;
}

const StatsSection = ({
  viewPlayerId,
  playerLib,
  posStatsByNumTeamByYear,
  numTeams,
  isStd,
}: StatsSectionProps) => {
  if ( !viewPlayerId ) {
    return (
      <div className="flex flex-col py-2 px-4">
        <p className="font-semibold underline py-2">
          Stats
        </p>

        <p className="font-semibold">
          Hover on player to view stats...
        </p>
      </div>
    )
  }
  const viewPlayer = playerLib[viewPlayerId]
  const statsByPosYear = (viewPlayer && posStatsByNumTeamByYear?.[numTeams]?.[currYearSub1]?.[viewPlayer.position]) || null
  const {
    tier1Stats,
    tier2Stats,
    tier3Stats,
    tier4Stats,
    tier5Stats,
    tier6Stats,
  } = statsByPosYear || {}
  const leagueStats = [
    tier1Stats,
    tier2Stats,
    tier3Stats,
    tier4Stats,
    tier5Stats,
    tier6Stats,
  ].filter(Boolean) as Stats[]
  const highlightTier = viewPlayer?.lastYrTier
  const playerStats = viewPlayer?.seasonStats.filter( s => s.year !== currYear && s.year >= currYearSub3 ) || []
  const position = viewPlayer?.position
  const playerProjTier = isStd ? viewPlayer?.stdRankTier : viewPlayer?.pprRankTier
  const tierStatsComp = playerProjTier && playerProjTier <= 6 && (statsByPosYear as any)?.[`tier${playerProjTier}Stats`]
  return (
    <div className="flex flex-col py-2 px-4">
      {/* League POS Stats */}
      <div className="flex flex-col">
        <p className="font-semibold underline mb-2">
          { currYearSub1 } { position || '' } Stats By Tiers
        </p>
        { position === 'QB' &&
          <QbStats
            allStats={ leagueStats }
            highlightTier= { highlightTier }
            showTier={true}
          />
        }
        { position === 'RB' &&
          <RbStats
            allStats={ leagueStats }
            highlightTier= { highlightTier }
            showTier={true}
          />
        }
        { ['WR', 'TE'].includes( position ) &&
          <WrStats
            allStats={ leagueStats }
            highlightTier= { highlightTier }
            showTier={true}
            position={position}
          />
        }
      </div>

      {/* Player Profile */}
      <div className="flex flex-col mt-4 items-center">
        <p className="font-semibold underline mb-2">
          { viewPlayer?.name || 'Player' } { highlightTier && `(${currYearSub1} ${ position }${ viewPlayer.lastYrOvrRank || 'NA' } OVR | ${ position }${ highlightTier })` || '' } Recent Stats
        </p>

        {/* Player Stats */}
        { position === 'QB' &&
          <QbStats
            tierStatsComp={ tierStatsComp }
            allStats={ playerStats }
            showYear={true}
          />
        }
        { position === 'RB' &&
          <RbStats
            tierStatsComp={ tierStatsComp }
            allStats={ playerStats }
            showYear={true}
          />
        }
        { ['WR', 'TE'].includes( position ) &&
          <WrStats
            tierStatsComp={ tierStatsComp }
            allStats={ playerStats }
            showYear={true}
          />
        }

        {/* Player Pro / Cons */}
        <div className="mt-4 w-96 border-2 border-slate-700 rounded-md p-1 shadow-md bg-green-100">
          <p className="w-full text-sm uppercase text-center underline font-bold">
            { viewPlayer?.pros.split('\n')[0] }
          </p>
          <ul className="list-disc pl-4">
            { viewPlayer?.pros.split('\n').slice(1).map( (lineTxt, idx) => (
              <li key={idx} className="text-left text-sm">{ lineTxt.replace('- ', '') }</li>
            ))}
          </ul>
        </div>

        <div className="mt-4 w-96 border-2 border-slate-700 rounded-md p-1 shadow-md bg-yellow-100">
          <p className="w-full text-sm uppercase text-center underline font-bold">
            { viewPlayer?.cons.split('\n')[0] }
          </p>
          <ul className="list-disc pl-4">
            { viewPlayer?.cons.split('\n').slice(1).map( (lineTxt, idx) => (
              <li key={idx} className="text-left text-sm">{ lineTxt.replace('- ', '') }</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

interface AllStatsProps {
  allStats: Stats[];
  highlightTier?: number;
  tierStatsComp?: Stats | false;
  showTier?: boolean;
  showYear?: boolean;
  position?: string;
}

const QbStats = ({
  allStats,
  highlightTier,
  tierStatsComp,
  showTier,
  showYear,
}: AllStatsProps) => {
  if ( allStats.length === 0 ) {
    return <p className="font-semibold">None</p>
  }
  return (
    <table className="table-auto text-sm border-separate border-spacing-2 border border-slate-500 shadow-md">
      <thead>
        <tr>
          { showTier && <th>Tier</th> }
          { showYear && <th>Year</th> }
          <th>PPG / Total</th>
          <th>Games</th>
          <th>Att/Pass</th>
          <th>TD/Ints</th>
          <th>Rushes</th>
          <th>Rush Yds</th>
          <th>Rush Tds</th>
        </tr>
      </thead>
      <tbody>
        { allStats.map( (stats, idx) => {
          const bgColor = idx + 1 === highlightTier ? 'bg-yellow-300' : ''
          return(
            <tr key={idx}>
              { showTier &&
                <td className={`border-2 border-slate-700 ${bgColor}`}>
                  QB{ idx+1 }
                </td>
              }
              { showYear &&
                <td className={`border-2 border-slate-700 ${bgColor}`}>
                  { stats.year }
                </td>
              }
              <td className={`border-2 border-slate-700 ${bgColor}`}>
                { stats.ppg?.toFixed( 1 ) } / { stats.totalPoints?.toFixed( 1 ) }
              </td>
              <td className={`border-2 border-slate-700 ${significantStatDiffBg(stats, tierStatsComp as Stats, 'gamesPlayed', bgColor)}`}>
                { stats.gamesPlayed?.toFixed( 1 ) }
              </td>
              <td className={`border-2 border-slate-700 ${significantStatDiffBg(stats, tierStatsComp as Stats, 'passAttempts', bgColor)}`}>
                { stats.passAttempts?.toFixed( 0 ) } / { stats.passCompletions?.toFixed( 0 ) }
              </td>
              <td className={`border-2 border-slate-700 ${significantStatDiffBg(stats, tierStatsComp as Stats, 'passTds', bgColor)}`}>
                { stats.passTds?.toFixed( 1 ) } / { stats.passInts?.toFixed( 1 ) }
                </td>
                <td className={`border-2 border-slate-700 ${significantStatDiffBg(stats, tierStatsComp as Stats, 'rushAttempts', bgColor)}`}>
                { stats.rushAttempts?.toFixed( 1 ) }
              </td>
              <td className={`border-2 border-slate-700 ${significantStatDiffBg(stats, tierStatsComp as Stats, 'rushYards', bgColor)}`}>
                { stats.rushYards?.toFixed( 0 ) }
              </td>
              <td className={`border-2 border-slate-700 ${significantStatDiffBg(stats, tierStatsComp as Stats, 'rushTds', bgColor)}`}>
                { stats.rushTds?.toFixed( 1 ) }
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

const RbStats = ({
  allStats,
  highlightTier,
  tierStatsComp,
  showTier,
  showYear,
}: AllStatsProps) => {
  if ( allStats.length === 0 ) {
    return <p className="font-semibold">None</p>
  }
  return (
    <table className="table-auto text-sm border-separate border-spacing-2 border border-slate-500 shadow-md">
      <thead>
        <tr>
          { showTier && <th>Tier</th> }
          { showYear && <th>Year</th> }
          <th>PPG</th>
          <th>Games</th>
          <th>Rushes</th>
          <th>Rush Yds</th>
          <th>Rush Tds</th>
          <th>Recs</th>
          <th>Rec Yds</th>
          <th>Rec Tds</th>
        </tr>
      </thead>
      <tbody>
        { allStats.map( (stats, idx) => {
          let bgColor = idx + 1 === highlightTier ? 'bg-yellow-300' : ''
          return(
            <tr key={idx}>
              { showTier &&
                <td className={`border-2 border-slate-700 ${bgColor}`}>
                  RB{ idx+1 }
                </td>
              }
              { showYear &&
                <td className={`border-2 border-slate-700 ${bgColor}`}>
                  { stats.year }
                </td>
              }
              <td className={`border-2 border-slate-700 ${bgColor}`}>
                { stats.ppg?.toFixed( 1 ) } / { stats.totalPoints?.toFixed( 1 ) }
              </td>
              <td className={`border-2 border-slate-700 ${significantStatDiffBg(stats, tierStatsComp as Stats, 'gamesPlayed', bgColor)}`}>
                { stats.gamesPlayed?.toFixed( 1 ) }
              </td>
              <td className={`border-2 border-slate-700 ${significantStatDiffBg(stats, tierStatsComp as Stats, 'rushAttempts', bgColor)}`}>
                { stats.rushAttempts?.toFixed( 1 ) }
              </td>
              <td className={`border-2 border-slate-700 ${significantStatDiffBg(stats, tierStatsComp as Stats, 'rushYards', bgColor)}`}>
                { stats.rushYards?.toFixed( 0 ) }
              </td>
              <td className={`border-2 border-slate-700 ${significantStatDiffBg(stats, tierStatsComp as Stats, 'rushTds', bgColor)}`}>
                { stats.rushTds?.toFixed( 1 ) }
              </td>
              <td className={`border-2 border-slate-700 ${significantStatDiffBg(stats, tierStatsComp as Stats, 'recs', bgColor)}`}>
                { stats.recs?.toFixed( 1 ) }
              </td>
              <td className={`border-2 border-slate-700 ${significantStatDiffBg(stats, tierStatsComp as Stats, 'recYards', bgColor)}`}>
                { stats.recYards?.toFixed( 0 ) }
              </td>
              <td className={`border-2 border-slate-700 ${significantStatDiffBg(stats, tierStatsComp as Stats, 'recTds', bgColor)}`}>
                { stats.recTds?.toFixed( 1 ) }
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

const WrStats = ({
  allStats,
  highlightTier,
  tierStatsComp,
  showTier,
  showYear,
  position,
}: AllStatsProps) => {
  if ( allStats.length === 0 ) {
    return <p className="font-semibold">None</p>
  }
  return (
    <table className="table-auto text-sm border-separate border-spacing-2 border border-slate-500 shadow-md">
      <thead>
        <tr>
          { showTier && <th>Tier</th> }
          { showYear && <th>Year</th> }
          <th>PPG</th>
          <th>Games</th>
          <th>Recs</th>
          <th>Rec Yds</th>
          <th>Rec Tds</th>
          <th>Rushes</th>
          <th>Rush Yds</th>
          <th>Rush Tds</th>
        </tr>
      </thead>
      <tbody>
        { allStats.map( (stats, idx) => {
          const bgColor = idx + 1 === highlightTier ? 'bg-yellow-300' : ''
          return(
            <tr key={idx}>
              { showTier &&
                <td className={`border-2 border-slate-700 ${bgColor}`}>
                  {position}{ idx+1 }
                </td>
              }
              { showYear &&
                <td className={`border-2 border-slate-700 ${bgColor}`}>
                  { stats.year }
                </td>
              }
              <td className={`border-2 border-slate-700 ${bgColor}`}>
                { stats.ppg?.toFixed( 1 ) } / { stats.totalPoints?.toFixed( 1 ) }
              </td>
              <td className={`border-2 border-slate-700 ${significantStatDiffBg(stats, tierStatsComp as Stats, 'gamesPlayed', bgColor)}`}>
                { stats.gamesPlayed?.toFixed( 1 ) }
              </td>
              <td className={`border-2 border-slate-700 ${significantStatDiffBg(stats, tierStatsComp as Stats, 'recs', bgColor)}`}>
                { stats.recs?.toFixed( 1 ) }
              </td>
              <td className={`border-2 border-slate-700 ${significantStatDiffBg(stats, tierStatsComp as Stats, 'recYards', bgColor)}`}>
                { stats.recYards?.toFixed( 0 ) }
              </td>
              <td className={`border-2 border-slate-700 ${significantStatDiffBg(stats, tierStatsComp as Stats, 'recTds', bgColor)}`}>
                { stats.recTds?.toFixed( 1 ) }
              </td>
              <td className={`border-2 border-slate-700 ${significantStatDiffBg(stats, tierStatsComp as Stats, 'rushAttempts', bgColor)}`}>
                { stats.rushAttempts?.toFixed( 1 ) }
              </td>
              <td className={`border-2 border-slate-700 ${significantStatDiffBg(stats, tierStatsComp as Stats, 'rushYards', bgColor)}`}>
                { stats.rushYards?.toFixed( 0 ) }
              </td>
              <td className={`border-2 border-slate-700 ${significantStatDiffBg(stats, tierStatsComp as Stats, 'rushTds', bgColor)}`}>
                { stats.rushTds?.toFixed( 1 ) }
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

export default StatsSection