import React, { useMemo, useState, useEffect } from 'react'
import { Player, FantasySettings, BoardSettings, PlayerTarget } from '../../types'
import { getPlayerAdp, getRoundNumForPickNum, getRoundIdxForPickNum, getRoundAndPickShortText, PlayerRanks } from '../../behavior/draft'
import { playerShortName } from '../../behavior/presenters'
import { PositionFilter } from '../../behavior/hooks/useADPView'

// Helper function to create extra short names for mobile (first initial + last initial)
const getPlayerInitials = (fullName: string): string => {
  const nameParts = fullName.trim().split(/\s+/)
  if (nameParts.length === 0) return ''
  if (nameParts.length === 1) return nameParts[0].charAt(0).toUpperCase()
  
  const firstInitial = nameParts[0].charAt(0).toUpperCase()
  const lastInitial = nameParts[nameParts.length - 1].charAt(0).toUpperCase()
  return `${firstInitial}${lastInitial}`
}

interface PlayerTargetsViewProps {
  playerTargets: PlayerTarget[]
  playerLib: { [key: string]: Player }
  fantasySettings: FantasySettings
  boardSettings: BoardSettings
  playerRanks: PlayerRanks
  currPick: number
  positionFilter: PositionFilter
  setPositionFilter: (filter: PositionFilter) => void
}

interface ChartData {
  player: Player
  target: PlayerTarget
  targetRound: number // targetAsEarlyAsRound
  playerAdp: number
  adpRound: number // ADP round
  sortKey: number // For sorting
}

const PlayerTargetsView: React.FC<PlayerTargetsViewProps> = ({
  playerTargets,
  playerLib,
  fantasySettings,
  boardSettings,
  playerRanks,
  currPick,
  positionFilter,
  setPositionFilter,
}) => {
  const [isMobile, setIsMobile] = useState(false)
  const [hoveredPlayerId, setHoveredPlayerId] = useState<string | null>(null)
  const [popoverPosition, setPopoverPosition] = useState({ x: 0, y: 0 })

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    
    checkMobile() // Initial check
    window.addEventListener('resize', checkMobile)
    
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Calculate chart data for each player target
  const chartData = useMemo(() => {
    if (!playerTargets.length) return []

    // Create a set of available player IDs for fast lookup
    const availablePlayerIds = new Set(playerRanks.availPlayersByOverallRank.map(player => player.id))

    const data: ChartData[] = playerTargets
      .map(target => {
        const player = playerLib[target.playerId]
        if (!player || !availablePlayerIds.has(player.id)) return null

        // Apply position filter
        if (positionFilter !== 'All' && player.position !== positionFilter) return null

        const targetRound = target.targetAsEarlyAsRound
        const playerAdp = getPlayerAdp(player, fantasySettings, boardSettings)
        const adpRound = getRoundNumForPickNum(playerAdp, fantasySettings.numTeams)

        return {
          player,
          target,
          targetRound,
          playerAdp,
          adpRound,
          sortKey: targetRound * 1000 + adpRound // Sort by target round first, then ADP round
        }
      })
      .filter((item): item is ChartData => item !== null)
      .sort((a, b) => a.sortKey - b.sortKey)

    return data
  }, [playerTargets, playerLib, fantasySettings, boardSettings, playerRanks, positionFilter])

  // Calculate Y-axis labels and colors for rounds 1-15
  const roundLabels = useMemo(() => {
    const rounds = []
    for (let round = 1; round <= 15; round++) {
      const roundIdx = round - 1
      const startPick = roundIdx * fantasySettings.numTeams + 1
      const endPick = round * fantasySettings.numTeams
      
      // Different colors for each round
      const colors = [
        'bg-red-100', 'bg-orange-100', 'bg-yellow-100', 'bg-green-100', 'bg-blue-100',
        'bg-indigo-100', 'bg-purple-100', 'bg-pink-100', 'bg-gray-100', 'bg-teal-100',
        'bg-rose-100', 'bg-amber-100', 'bg-lime-100', 'bg-cyan-100', 'bg-violet-100'
      ]
      
      rounds.push({
        round,
        startPick,
        endPick,
        color: colors[roundIdx] || 'bg-gray-100'
      })
    }
    return rounds
  }, [fantasySettings.numTeams])

  const maxPick = 15 * fantasySettings.numTeams // Round 15 end
  const chartHeight = isMobile ? 600 : 700 // Increased height for better visibility
  const chartWidth = Math.max(chartData.length * (isMobile ? 60 : 80), isMobile ? 250 : 600) // Dynamic width based on number of targets

  const getPickPosition = (pick: number) => {
    // Clamp pick to valid range
    const clampedPick = Math.max(1, Math.min(pick, maxPick))
    // Invert Y-axis: pick 1 at top (0), maxPick at bottom (chartHeight)
    return ((clampedPick - 1) / maxPick) * chartHeight
  }

  const handlePlayerClick = (playerId: string, event: React.MouseEvent) => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    setPopoverPosition({
      x: rect.left + rect.width / 2,
      y: rect.top - 10
    })
    setHoveredPlayerId(playerId)
  }

  const handleClickOutside = () => {
    setHoveredPlayerId(null)
  }

  return (
    <div className="h-full bg-white flex flex-col overflow-hidden" onClick={handleClickOutside}>
      <div className="p-3 md:p-6 overflow-auto flex-1 flex flex-col">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-2 md:mb-4 flex-shrink-0">
          <h2 className="text-lg md:text-2xl font-bold text-gray-800 text-center md:text-left">
            Player Targets Visualization
            {positionFilter !== 'All' && ` - ${positionFilter} Only`}
          </h2>
          
          {/* Position Filter Dropdown */}
          <div className="flex justify-center md:justify-end mt-2 md:mt-0">
            <select
              value={positionFilter}
              onChange={(e) => setPositionFilter(e.target.value as PositionFilter)}
              className="px-3 py-2 text-sm border border-gray-300 rounded bg-white text-gray-700 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="All">All Positions</option>
              <option value="QB">QB Only</option>
              <option value="RB">RB Only</option>
              <option value="WR">WR Only</option>
              <option value="TE">TE Only</option>
            </select>
          </div>
        </div>
        
        {chartData.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            {positionFilter !== 'All' 
              ? `No ${positionFilter} player targets to display`
              : 'No player targets to display'
            }
          </div>
        ) : (
          <div className="flex flex-col flex-1 min-h-0">
            {/* Chart container */}
            <div className="flex border border-gray-300 rounded-lg overflow-hidden flex-shrink-0 relative">
              {/* Y-axis (rounds/picks) */}
              <div className={`${isMobile ? 'w-12' : 'w-20'} flex flex-col relative`} style={{ height: chartHeight }}>
                {roundLabels.map(round => (
                  <div
                    key={round.round}
                    className={`${round.color} border-b border-gray-200 flex items-center justify-center text-xs font-semibold text-gray-700`}
                    style={{ height: chartHeight / 15 }}
                  >
                    R{round.round}
                  </div>
                ))}
               
               {/* Pick number labels */}
               <div className="absolute inset-0 flex flex-col justify-between text-xs text-gray-500 pointer-events-none">
                 <div className="text-center">Pick 1</div>
                 <div className="text-center" style={{ transform: 'translateY(-50%)' }}>
                   Pick {Math.floor(maxPick / 2)}
                 </div>
                 <div className="text-center">Pick {maxPick}</div>
               </div>
             </div>

             {/* Chart area */}
             <div className="flex-1 relative overflow-x-auto">
               <div className="relative" style={{ width: chartWidth, height: chartHeight }}>
                 {/* Round boundary lines */}
                 {/* Top boundary line (pick 1) */}
                 <div
                   className="absolute w-full border-b border-gray-300"
                   style={{ top: 0 }}
                 />
                 {roundLabels.map(round => (
                   <div
                     key={`line-${round.round}`}
                     className="absolute w-full border-b border-gray-300"
                     style={{
                       top: getPickPosition(round.endPick)
                     }}
                   />
                 ))}

                 {/* Current pick line */}
                 {currPick <= maxPick && (
                   <div
                     className="absolute w-full border-b-2 border-purple-900 z-10"
                     style={{
                       top: getPickPosition(currPick)
                     }}
                   />
                 )}

                                 {/* Player target bars */}
                {chartData.map((data, idx) => {
                  const barSpacing = isMobile ? 60 : 80
                  const x = idx * barSpacing + barSpacing/2 // Center each bar in its column
                  const barWidth = isMobile ? 45 : 60

                  // Calculate round positions (Y-axis inverted: round 1 at top)
                  const targetRoundStart = (data.targetRound - 1) * fantasySettings.numTeams + 1
                  const targetRoundEnd = data.targetRound * fantasySettings.numTeams
                  const adpRoundStart = (data.adpRound - 1) * fantasySettings.numTeams + 1
                  const adpRoundEnd = data.adpRound * fantasySettings.numTeams
                  
                  const topY = getPickPosition(targetRoundStart)
                  const targetEndY = getPickPosition(targetRoundEnd)
                  const adpStartY = getPickPosition(adpRoundStart)
                  const adpEndY = getPickPosition(adpRoundEnd)

                  // Calculate the full range from target round to ADP round
                  const earliestRound = Math.min(data.targetRound, data.adpRound)
                  const latestRound = Math.max(data.targetRound, data.adpRound)
                  const fullRangeStart = (earliestRound - 1) * fantasySettings.numTeams + 1
                  const fullRangeEnd = latestRound * fantasySettings.numTeams
                  const fullTopY = getPickPosition(fullRangeStart)
                  const fullEndY = getPickPosition(fullRangeEnd)

                  return (
                    <>
                      {/* Player name above the segment */}
                      <div
                        className="absolute text-xs font-bold text-center pointer-events-none"
                        style={{
                          left: x - barWidth/2,
                          top: fullTopY - 20,
                          width: barWidth,
                          color: '#333'
                        }}
                      >
                        {isMobile ? getPlayerInitials(data.player.fullName) : playerShortName(data.player.fullName)}
                      </div>

                      <div 
                        key={data.player.id} 
                        className="absolute border-2 border-black cursor-pointer hover:shadow-lg transition-shadow" 
                        style={{ 
                          left: x - barWidth/2,
                          top: fullTopY,
                          height: fullEndY - fullTopY,
                          width: barWidth
                        }}
                        onClick={(e) => {
                          e.stopPropagation()
                          handlePlayerClick(data.player.id, e)
                        }}
                      >
                        {/* Show ADP round segment if target and ADP rounds are the same, otherwise show full range in target color */}
                        {data.adpRound === data.targetRound ? (
                          <div
                            className="absolute bg-red-400"
                            style={{
                              top: 0,
                              height: fullEndY - fullTopY,
                              width: '100%',
                            }}
                          />
                        ) : (
                          <>
                            {/* Full range from target round to ADP round in target color */}
                            <div
                              className="absolute bg-blue-400"
                              style={{
                                top: 0,
                                height: fullEndY - fullTopY,
                                width: '100%',
                              }}
                            />
                            
                            {/* ADP round segment overlay in ADP color */}
                            <div
                              className="absolute bg-red-400"
                              style={{
                                top: adpStartY - fullTopY,
                                height: adpEndY - adpStartY,
                                width: '100%',
                              }}
                            />
                          </>
                        )}

                        {/* ADP marker */}
                        <div
                          className="absolute bg-red-900"
                          style={{
                            top: getPickPosition(data.playerAdp) - fullTopY - 2,
                            height: 4,
                            width: '100%',
                          }}
                        />
                      </div>
                    </>
                  )
                })}
               </div>
             </div>
             
             {/* Current pick label - positioned sticky to right side of chart container */}
             {currPick <= maxPick && (
               <div
                 className="absolute bg-purple-900 text-white text-xs px-2 py-1 rounded font-semibold z-30 pointer-events-none"
                 style={{
                   top: getPickPosition(currPick) - 12,
                   right: 8
                 }}
               >
                 {getRoundAndPickShortText(currPick, fantasySettings.numTeams)}
               </div>
             )}

             {/* Player name popover */}
             {hoveredPlayerId && (
               <div
                 className="fixed bg-black text-white text-sm px-3 py-2 rounded shadow-lg z-50 pointer-events-none"
                 style={{
                   left: popoverPosition.x,
                   top: popoverPosition.y,
                   transform: 'translateX(-50%) translateY(-100%)'
                 }}
               >
                 {playerLib[hoveredPlayerId]?.fullName}
                 <div className="text-xs text-gray-300 mt-1">
                   {playerLib[hoveredPlayerId]?.position} | {playerLib[hoveredPlayerId]?.team}
                 </div>
               </div>
             )}
           </div>

           {/* X-axis labels */}
           <div className={`flex mt-2 ${isMobile ? 'ml-12' : 'ml-20'} flex-shrink-0`}>
             <div className="relative overflow-x-auto" style={{ width: chartWidth, height: isMobile ? '60px' : '90px' }}>
               {chartData.map((data, idx) => {
                 const barSpacing = isMobile ? 60 : 80
                 return (
                   <div
                     key={data.player.id}
                     className="absolute text-xs text-center"
                     style={{
                       left: idx * barSpacing + barSpacing/2,
                       width: barSpacing,
                       transform: 'translateX(-50%)'
                     }}
                   >
                                         <div className="font-semibold truncate">{playerShortName(data.player.fullName)}</div>
                    <div className="text-gray-600">{data.player.position} | {data.player.team}</div>
                    <div className="text-gray-500">Early as RD {data.targetRound}</div>
                    <div className="text-gray-500">ADP: {getRoundAndPickShortText(Math.round(data.playerAdp), fantasySettings.numTeams)}</div>
                   </div>
                 )
               })}
             </div>
           </div>

                     {/* Legend */}
          <div className={`${isMobile ? 'mt-2' : 'mt-4'} p-2 md:p-3 bg-gray-50 rounded-lg flex-shrink-0`}>
            <h3 className={`text-base md:text-lg font-semibold ${isMobile ? 'mb-1' : 'mb-2 md:mb-3'}`}>Legend</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 md:gap-4">
              <div className="flex items-center">
                <div className="w-3 h-3 md:w-4 md:h-4 bg-blue-400 border-2 border-black mr-1 md:mr-2"></div>
                <span className="text-xs md:text-sm">Target round</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 md:w-4 md:h-4 bg-red-400 border-2 border-black mr-1 md:mr-2"></div>
                <span className="text-xs md:text-sm">ADP round</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 md:w-4 md:h-4 bg-red-900 border-2 border-black mr-1 md:mr-2"></div>
                <span className="text-xs md:text-sm">ADP pick</span>
              </div>
              <div className="flex items-center">
                <div className="w-6 h-0.5 md:w-8 md:h-0.5 bg-purple-900 mr-1 md:mr-2"></div>
                <span className="text-xs md:text-sm">Current pick</span>
              </div>
            </div>
          </div>
         </div>
        )}
      </div>
    </div>
  )
}

export default PlayerTargetsView 