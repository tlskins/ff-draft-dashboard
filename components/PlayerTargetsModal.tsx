import React, { useMemo } from 'react'
import { Player, FantasySettings, BoardSettings, PlayerTarget } from '../types'
import { getPlayerAdp, getRoundNumForPickNum, getRoundIdxForPickNum, getRoundAndPickShortText } from '../behavior/draft'
import { playerShortName } from '../behavior/presenters'

interface PlayerTargetsModalProps {
  isOpen: boolean
  onClose: () => void
  playerTargets: PlayerTarget[]
  playerLib: { [key: string]: Player }
  fantasySettings: FantasySettings
  boardSettings: BoardSettings
}

interface ChartData {
  player: Player
  target: PlayerTarget
  targetRoundStart: number // Start pick of targetAsEarlyAs round
  targetPick: number // targetAsEarlyAs pick
  playerAdp: number
  adpRoundEnd: number // End pick of ADP round
  sortKey: number // For sorting
}

const PlayerTargetsModal: React.FC<PlayerTargetsModalProps> = ({
  isOpen,
  onClose,
  playerTargets,
  playerLib,
  fantasySettings,
  boardSettings,
}) => {
  // Calculate chart data for each player target
  const chartData = useMemo(() => {
    if (!playerTargets.length) return []

    const data: ChartData[] = playerTargets
      .map(target => {
        const player = playerLib[target.playerId]
        if (!player) return null

        const targetPick = target.targetAsEarlyAs
        const playerAdp = getPlayerAdp(player, fantasySettings, boardSettings)
        
        // Calculate round boundaries
        const targetRound = getRoundNumForPickNum(targetPick, fantasySettings.numTeams)
        const targetRoundIdx = getRoundIdxForPickNum(targetPick, fantasySettings.numTeams)
        const targetRoundStart = targetRoundIdx * fantasySettings.numTeams + 1
        
        const adpRound = getRoundNumForPickNum(playerAdp, fantasySettings.numTeams)
        const adpRoundIdx = getRoundIdxForPickNum(playerAdp, fantasySettings.numTeams)
        const adpRoundEnd = (adpRoundIdx + 1) * fantasySettings.numTeams

        return {
          player,
          target,
          targetRoundStart,
          targetPick,
          playerAdp,
          adpRoundEnd,
          sortKey: targetPick * 1000 + playerAdp // Sort by target pick first, then ADP
        }
      })
      .filter((item): item is ChartData => item !== null)
      .sort((a, b) => a.sortKey - b.sortKey)

    return data
  }, [playerTargets, playerLib, fantasySettings, boardSettings])

  // Calculate Y-axis labels and colors for rounds 1-10
  const roundLabels = useMemo(() => {
    const rounds = []
    for (let round = 1; round <= 10; round++) {
      const roundIdx = round - 1
      const startPick = roundIdx * fantasySettings.numTeams + 1
      const endPick = round * fantasySettings.numTeams
      
      // Different colors for each round
      const colors = [
        'bg-red-100', 'bg-orange-100', 'bg-yellow-100', 'bg-green-100', 'bg-blue-100',
        'bg-indigo-100', 'bg-purple-100', 'bg-pink-100', 'bg-gray-100', 'bg-teal-100'
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

  const maxPick = 10 * fantasySettings.numTeams // Round 10 end
  const chartHeight = 600 // Fixed height for the chart
  const chartWidth = Math.max(chartData.length * 80, 600) // Dynamic width based on number of targets

  const getPickPosition = (pick: number) => {
    // Clamp pick to valid range
    const clampedPick = Math.max(1, Math.min(pick, maxPick))
    // Invert Y-axis: pick 1 at top (0), maxPick at bottom (chartHeight)
    return ((clampedPick - 1) / maxPick) * chartHeight
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-auto relative">
        <button
          className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 text-2xl font-bold z-10"
          onClick={onClose}
        >
          ×
        </button>
        
        <div className="p-6">
          <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">
            Player Targets Visualization
          </h2>
          
          {chartData.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              No player targets to display
            </div>
          ) : (
            <div className="flex flex-col">
              {/* Chart container */}
              <div className="flex border border-gray-300 rounded-lg overflow-hidden">
                                 {/* Y-axis (rounds/picks) */}
                 <div className="w-20 flex flex-col relative" style={{ height: chartHeight }}>
                   {roundLabels.map(round => (
                     <div
                       key={round.round}
                       className={`${round.color} border-b border-gray-200 flex items-center justify-center text-xs font-semibold text-gray-700`}
                       style={{ height: chartHeight / 10 }}
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

                     {/* Player target bars */}
                                         {chartData.map((data, idx) => {
                       const x = idx * 80 + 40 // Center each bar in its column
                       const barWidth = 60

                       // Calculate bar segments (Y-axis inverted: smaller picks at top)
                       const topY = getPickPosition(data.targetRoundStart)
                       const targetY = getPickPosition(data.targetPick)
                       const adpY = getPickPosition(data.playerAdp)
                       const bottomY = getPickPosition(data.adpRoundEnd)

                       return (
                         <div key={data.player.id} className="absolute border-2 border-black" style={{ 
                           left: x - barWidth/2,
                           top: topY,
                           height: bottomY - topY,
                           width: barWidth
                         }}>
                           {/* Segment 1: Round start to target pick */}
                           <div
                             className="absolute bg-blue-300"
                             style={{
                               top: 0,
                               height: targetY - topY,
                               width: '100%',
                             }}
                           />
                           
                           {/* Segment 2: Target pick (highlighted) */}
                           <div
                             className="absolute bg-blue-600"
                             style={{
                               top: targetY - topY - 2,
                               height: 4,
                               width: '100%',
                             }}
                           />
                           
                           {/* Segment 3: Target pick to ADP */}
                           {adpY > targetY && (
                             <div
                               className="absolute bg-red-300"
                               style={{
                                 top: targetY - topY,
                                 height: adpY - targetY,
                                 width: '100%',
                               }}
                             />
                           )}
                           
                           {/* Segment 4: ADP to round end */}
                           {bottomY > adpY && (
                             <div
                               className="absolute bg-red-600"
                               style={{
                                 top: adpY - topY,
                                 height: bottomY - adpY,
                                 width: '100%',
                               }}
                             />
                           )}

                           {/* ADP marker */}
                           <div
                             className="absolute bg-red-900"
                             style={{
                               top: adpY - topY - 2,
                               height: 4,
                               width: '100%',
                             }}
                           />
                         </div>
                       )
                     })}
                  </div>
                </div>
              </div>

              {/* X-axis labels */}
              <div className="flex mt-4 ml-20">
                <div className="relative" style={{ width: chartWidth }}>
                  {chartData.map((data, idx) => (
                    <div
                      key={data.player.id}
                      className="absolute text-xs text-center"
                      style={{
                        left: idx * 80 + 40,
                        width: 80,
                        transform: 'translateX(-50%)'
                      }}
                    >
                      <div className="font-semibold truncate">{playerShortName(data.player.fullName)}</div>
                      <div className="text-gray-600">{data.player.position} | {data.player.team}</div>
                      <div className="text-gray-500">T: {data.targetPick}</div>
                      <div className="text-gray-500">ADP: {Math.round(data.playerAdp)}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Legend */}
              <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                <h3 className="text-lg font-semibold mb-3">Legend</h3>
                <div className="grid grid-cols-3 md:grid-cols-5 gap-4">
                   <div className="flex items-center">
                     <div className="w-4 h-4 bg-blue-300 border-2 border-black mr-2"></div>
                     <span className="text-sm">Rd start to target</span>
                   </div>
                   <div className="flex items-center">
                     <div className="w-4 h-4 bg-blue-600 border-2 border-black mr-2"></div>
                     <span className="text-sm">Target pick</span>
                   </div>
                   <div className="flex items-center">
                     <div className="w-4 h-4 bg-red-300 border-2 border-black mr-2"></div>
                     <span className="text-sm">Target to ADP</span>
                   </div>
                   <div className="flex items-center">
                     <div className="w-4 h-4 bg-red-900 border-2 border-black mr-2"></div>
                     <span className="text-sm">ADP</span>
                   </div>
                   <div className="flex items-center">
                     <div className="w-4 h-4 bg-red-600 border-2 border-black mr-2"></div>
                     <span className="text-sm">ADP to round end</span>
                   </div>
                 </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default PlayerTargetsModal 