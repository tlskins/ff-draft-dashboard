import React, { useState } from "react"
import Moment from 'moment'

const currYear = parseInt(Moment().format('YYYY'))
const currYearSub1 = currYear - 1
const currYearSub2 = currYear - 2
const currYearSub3 = currYear - 3

const StatsSection = ({
  viewPlayerId,
  playerLib,
  posStatsByNumTeamByYear,
  numTeams,
}) => {
  const viewPlayer = playerLib[viewPlayerId]
  console.log('viewPlayer', viewPlayerId, viewPlayer)
  const {
    tier1Stats,
    tier2Stats,
    tier3Stats,
    tier4Stats,
    tier5Stats,
    tier6Stats,
  } = viewPlayer && posStatsByNumTeamByYear[numTeams][currYearSub1][viewPlayer.position] || {}
  const leagueStats = [
    tier1Stats,
    tier2Stats,
    tier3Stats,
    tier4Stats,
    tier5Stats,
    tier6Stats,
  ]
  const highlightTier = viewPlayer?.lastYrTier
  const playerStats = viewPlayer?.seasonStats.filter( s => s.year !== currYear && s.year >= currYearSub3 ) || []
  const position = viewPlayer?.position
  return (
    <div className="flex flex-col py-2">
      {/* League POS Stats */}
      <div className="flex flex-col">
        <p className="font-semibold underline">
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
        <p className="font-semibold underline">
          { viewPlayer?.name || 'Player' } { highlightTier && `(${currYearSub1} ${ position }${ highlightTier } | ${ position }${ viewPlayer.lastYrOvrRank || 'NA' } OVR)` || '' } Recent Stats
        </p>

        {/* Player Stats */}
        { position === 'QB' &&
          <QbStats
            allStats={ playerStats }
            showYear={true}
          />
        }
        { position === 'RB' &&
          <RbStats
            allStats={ playerStats }
            showYear={true}
          />
        }
        { position === 'WR' &&
          <WrStats
            allStats={ playerStats }
            showYear={true}
          />
        }

        {/* Player Pro / Cons */}
        <div className="mt-4 w-96 border-2 border-slate-700 rounded-md p-1">
          { viewPlayer?.pros.split('\n').map( (lineTxt, idx) => (
            <p className={`w-full text-sm text-${ idx === 0 ? "center" : "left" } ${ idx === 0 ? "underline font-semibold" : "" }`}>
              { lineTxt }
            </p>
          ))}
        </div>

        <div className="mt-4 w-96 border-2 border-slate-700 rounded-md p-1">
          { viewPlayer?.cons.split('\n').map( (lineTxt, idx) => (
            <p className={`w-full text-sm text-${ idx === 0 ? "center" : "left" } ${ idx === 0 ? "underline font-semibold" : "" }`}>
              { lineTxt }
            </p>
          ))}
        </div>
      </div>
    </div>
  )
}

const QbStats = ({
  allStats,
  highlightTier,
  showTier,
  showYear,
}) => {
  if ( allStats.length === 0 ) {
    return <p className="font-semibold">None</p>
  }
  return (
    <table class="table-auto text-sm border-separate border-spacing-2 border border-slate-500 ">
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
            <tr>
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
              <td className={`border-2 border-slate-700 ${bgColor}`}>
                { stats.gamesPlayed?.toFixed( 1 ) }
              </td>
              <td className={`border-2 border-slate-700 ${bgColor}`}>
                { stats.passAttempts?.toFixed( 1 ) } / { stats.passCompletions?.toFixed( 1 ) }
              </td>
              <td className={`border-2 border-slate-700 ${bgColor}`}>
                { stats.passTds?.toFixed( 1 ) } / { stats.passInts?.toFixed( 1 ) }
                </td>
                <td className={`border-2 border-slate-700 ${bgColor}`}>
                { stats.rushAttempts?.toFixed( 1 ) }
              </td>
              <td className={`border-2 border-slate-700 ${bgColor}`}>
                { stats.rushYards?.toFixed( 1 ) }
              </td>
              <td className={`border-2 border-slate-700 ${bgColor}`}>
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
  showTier,
  showYear,
}) => {
  if ( allStats.length === 0 ) {
    return <p className="font-semibold">None</p>
  }
  return (
    <table class="table-auto text-sm border-separate border-spacing-2 border border-slate-500 ">
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
          const bgColor = idx + 1 === highlightTier ? 'bg-yellow-300' : ''
          return(
            <tr>
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
              <td className={`border-2 border-slate-700 ${bgColor}`}>
                { stats.gamesPlayed?.toFixed( 1 ) }
              </td>
              <td className={`border-2 border-slate-700 ${bgColor}`}>
                { stats.rushAttempts?.toFixed( 1 ) }
              </td>
              <td className={`border-2 border-slate-700 ${bgColor}`}>
                { stats.rushYards?.toFixed( 1 ) }
              </td>
              <td className={`border-2 border-slate-700 ${bgColor}`}>
                { stats.rushTds?.toFixed( 1 ) }
              </td>
              <td className={`border-2 border-slate-700 ${bgColor}`}>
                { stats.recs?.toFixed( 1 ) }
              </td>
              <td className={`border-2 border-slate-700 ${bgColor}`}>
                { stats.recYards?.toFixed( 1 ) }
              </td>
              <td className={`border-2 border-slate-700 ${bgColor}`}>
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
  showTier,
  showYear,
  position,
}) => {
  if ( allStats.length === 0 ) {
    return <p className="font-semibold">None</p>
  }
  return (
    <table class="table-auto text-sm border-separate border-spacing-2 border border-slate-500 ">
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
            <tr>
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
              <td className={`border-2 border-slate-700 ${bgColor}`}>
                { stats.gamesPlayed?.toFixed( 1 ) }
              </td>
              <td className={`border-2 border-slate-700 ${bgColor}`}>
                { stats.recs?.toFixed( 1 ) }
              </td>
              <td className={`border-2 border-slate-700 ${bgColor}`}>
                { stats.recYards?.toFixed( 1 ) }
              </td>
              <td className={`border-2 border-slate-700 ${bgColor}`}>
                { stats.recTds?.toFixed( 1 ) }
              </td>
              <td className={`border-2 border-slate-700 ${bgColor}`}>
                { stats.rushAttempts?.toFixed( 1 ) }
              </td>
              <td className={`border-2 border-slate-700 ${bgColor}`}>
                { stats.rushYards?.toFixed( 1 ) }
              </td>
              <td className={`border-2 border-slate-700 ${bgColor}`}>
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