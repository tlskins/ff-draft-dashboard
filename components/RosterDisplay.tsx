import React from "react"
import { Roster, getRoundIdxForPickNum } from '../behavior/draft'
import { Player, FantasySettings, FantasyPosition } from "../types"
import { getPosStyle } from '../behavior/styles'

interface RosterDisplayProps {
  rosters: Roster[]
  draftHistory: (string | null)[]
  playerLib: { [key: string]: Player }
  settings: FantasySettings
  viewRosterIdx: number
}

interface DraftedPlayer extends Player {
  pickNum: number
  round: number
  rosterIdx: number
}

const RosterDisplay = ({
  rosters,
  draftHistory,
  playerLib,
  settings,
  viewRosterIdx,
}: RosterDisplayProps) => {
  
  // Get all drafted players across all rosters
  const getAllDraftedPlayers = (): DraftedPlayer[] => {
    const allPlayers: DraftedPlayer[] = []
    
    rosters.forEach((roster, rosterIdx) => {
      const rosterPlayerIds = roster.picks || []
      
      rosterPlayerIds.forEach(playerId => {
        const player = playerLib[playerId]
        if (!player) return
        
        const pickNum = draftHistory.findIndex(pick => pick === playerId) + 1
        if (pickNum === 0) return
        
        const roundIdx = getRoundIdxForPickNum(pickNum, settings.numTeams)
        const round = roundIdx + 1
        
        allPlayers.push({
          ...player,
          pickNum,
          round,
          rosterIdx,
        })
      })
    })
    
    return allPlayers.sort((a, b) => a.pickNum - b.pickNum)
  }
  
  // Calculate position counts by round
  const getPositionCountsByRound = () => {
    const allPlayers = getAllDraftedPlayers()
    const maxRound = Math.max(...allPlayers.map(p => p.round), 0)
    
    const counts: { [round: number]: { [position: string]: number } } = {}
    
    for (let round = 1; round <= maxRound; round++) {
      counts[round] = {
        [FantasyPosition.QUARTERBACK]: 0,
        [FantasyPosition.RUNNING_BACK]: 0,
        [FantasyPosition.WIDE_RECEIVER]: 0,
        [FantasyPosition.TIGHT_END]: 0,
      }
    }
    
    allPlayers.forEach(player => {
      if (counts[player.round] && counts[player.round][player.position] !== undefined) {
        counts[player.round][player.position]++
      }
    })
    
    return { counts, maxRound }
  }
  
  // Get players by roster and round for alignment
  const getPlayersByRosterAndRound = () => {
    const allPlayers = getAllDraftedPlayers()
    const maxRound = Math.max(...allPlayers.map(p => p.round), 0)
    
    const playersByRosterAndRound: { [rosterIdx: number]: { [round: number]: DraftedPlayer[] } } = {}
    
    // Initialize structure
    rosters.forEach((_, rosterIdx) => {
      playersByRosterAndRound[rosterIdx] = {}
      for (let round = 1; round <= maxRound; round++) {
        playersByRosterAndRound[rosterIdx][round] = []
      }
    })
    
    // Fill with players
    allPlayers.forEach(player => {
      if (playersByRosterAndRound[player.rosterIdx] && playersByRosterAndRound[player.rosterIdx][player.round]) {
        playersByRosterAndRound[player.rosterIdx][player.round].push(player)
      }
    })
    
    return { playersByRosterAndRound, maxRound }
  }
  
  const { counts: positionCounts, maxRound } = getPositionCountsByRound()
  const { playersByRosterAndRound } = getPlayersByRosterAndRound()

  return (
    <div className="bg-white rounded-lg shadow-xl p-6 w-[95vw] max-w-none max-h-[85vh] overflow-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Team Rosters</h2>
      </div>
      
      <div className="flex gap-6">
        {/* Position Counts Table */}
        <div className="flex-shrink-0 w-48">
          <h3 className="text-lg font-semibold mb-4 text-center">Position Counts by Round</h3>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-100">
                  <th className="p-2 border-r">Round</th>
                  <th className="p-1 border-r">QB</th>
                  <th className="p-1 border-r">RB</th>
                  <th className="p-1 border-r">WR</th>
                  <th className="p-1">TE</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: maxRound }, (_, i) => i + 1).map(round => (
                  <tr key={round} className={round % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                    <td className="p-2 border-r font-semibold text-center">{round}</td>
                    <td className="p-1 border-r text-center">{positionCounts[round]?.[FantasyPosition.QUARTERBACK] || 0}</td>
                    <td className="p-1 border-r text-center">{positionCounts[round]?.[FantasyPosition.RUNNING_BACK] || 0}</td>
                    <td className="p-1 border-r text-center">{positionCounts[round]?.[FantasyPosition.WIDE_RECEIVER] || 0}</td>
                    <td className="p-1 text-center">{positionCounts[round]?.[FantasyPosition.TIGHT_END] || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        
        {/* Rosters */}
        <div className="flex-1 overflow-x-auto">
          <div className="flex gap-3 min-w-max">
            {rosters.map((roster, rosterIdx) => {
              const isUserRoster = rosterIdx === viewRosterIdx
              
              return (
                <div
                  key={`roster-${rosterIdx}`}
                  className={`flex-shrink-0 w-32 ${
                    isUserRoster 
                      ? 'border-4 border-blue-500 bg-blue-50' 
                      : 'border border-gray-200 bg-gray-50'
                  } rounded-lg`}
                >
                  {/* Team Header */}
                  <div className={`text-center p-2 rounded-t-lg ${
                    isUserRoster ? 'bg-blue-600 text-white' : 'bg-gray-600 text-white'
                  }`}>
                    <h3 className="font-bold text-xs">
                      Team {rosterIdx + 1}
                      {isUserRoster && ' (You)'}
                    </h3>
                  </div>
                  
                  {/* Players by round */}
                  <div className="p-2">
                    {Array.from({ length: maxRound }, (_, i) => i + 1).map(round => {
                      const roundPlayers = playersByRosterAndRound[rosterIdx]?.[round] || []
                      
                      return (
                        <div key={`${rosterIdx}-round-${round}`} className="mb-2">
                          {/* Round header */}
                          <div className="text-xs font-semibold text-gray-600 bg-gray-200 px-1 py-0.5 rounded mb-1 text-center">
                            R{round}
                          </div>
                          
                          {/* Players in this round */}
                          <div className="space-y-1 min-h-[2rem]">
                                                         {roundPlayers.length === 0 ? (
                               <div className="h-6">{/* Empty space to maintain alignment */}</div>
                             ) : (
                              roundPlayers.map(player => {
                                const posStyle = getPosStyle(player.position)
                                
                                return (
                                  <div
                                    key={`${rosterIdx}-${player.id}`}
                                    className={`px-1 py-0.5 rounded text-xs border ${posStyle}`}
                                    title={`${player.fullName} - ${player.position} - ${player.team} (Pick #${player.pickNum})`}
                                  >
                                    <div className="font-semibold text-center truncate">
                                      {player.fullName.split(' ').map(name => name.charAt(0)).join('.')}
                                    </div>
                                    <div className="text-center text-xs opacity-75">
                                      {player.position}
                                    </div>
                                  </div>
                                )
                              })
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

export default RosterDisplay 