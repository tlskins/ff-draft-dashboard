import React, { useState } from 'react'
import { Player, FantasySettings, BoardSettings, PlayerTarget } from '../../types'
import { PlayerRanks } from '../../behavior/draft'
import { PositionFilter } from '../../behavior/hooks/useADPView'
import MobileViewFooter from '../MobileViewFooter'
import PlayersByRoundView from './PlayersByRoundView'
import PlayersByADPRoundView from './PlayersByADPRoundView'
import PlayerTargetsView from './PlayerTargetsView'
import PlayerSearchModal from '../PlayerSearchModal'

type ViewType = 'playersByRound' | 'playersByADPRound' | 'playerTargets'

interface ADPViewProps {
  playerRanks: PlayerRanks
  fantasySettings: FantasySettings
  boardSettings: BoardSettings
  viewPlayerId: string | null
  myPicks: number[]
  currPick: number
  onSelectPlayer: (player: Player) => void
  setViewPlayerId: (id: string) => void
  playerTargets: PlayerTarget[]
  playerLib: { [key: string]: Player }
  addPlayerTarget: (player: Player, targetAsEarlyAs: number) => void
  replacePlayerTargets: (targets: PlayerTarget[]) => void
  removePlayerTarget: (playerId: string) => void
  removePlayerTargets: (playerIds: string[]) => void
  rankingSummaries: any[]
  myPickNum: number
}

const ADPView: React.FC<ADPViewProps> = ({
  playerRanks,
  fantasySettings,
  boardSettings,
  viewPlayerId,
  myPicks,
  currPick,
  setViewPlayerId,
  playerTargets,
  playerLib,
  addPlayerTarget,
  replacePlayerTargets,
  removePlayerTarget,
  removePlayerTargets,
  rankingSummaries,
  myPickNum,
}) => {
  const [currentView, setCurrentView] = useState<ViewType>('playersByRound')
  const [positionFilter, setPositionFilter] = useState<PositionFilter>('All')
  const [isMobileViewOpen, setIsMobileViewOpen] = useState(false)
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false)

  const handleSwitchToTargetsView = () => {
    setCurrentView('playerTargets')
  }

  const handleSwitchToRoundsView = () => {
    setCurrentView('playersByRound')
  }

  const handleSwitchToADPRoundsView = () => {
    setCurrentView('playersByADPRound')
  }

  return (
    <div className="h-screen bg-white p-2 w-full flex flex-col">
      {/* Desktop Header */}
      <div className="mb-4 hidden md:block flex-shrink-0">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-lg font-semibold text-gray-800">
            {currentView === 'playersByRound' ? 'Available By Round' : 
             currentView === 'playersByADPRound' ? 'Players by ADP Round' : 
             'Player Targets Visualization'}
            {(currentView === 'playersByRound' || currentView === 'playersByADPRound') && positionFilter !== 'All' && ` - ${positionFilter} Only`}
          </h2>
          <div className="flex items-center space-x-2">
            <select
              value={currentView}
              onChange={(e) => setCurrentView(e.target.value as ViewType)}
              className="px-2 py-1 text-sm border border-gray-300 rounded bg-white text-gray-700 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="playersByRound">Highest Ranked Avail Players by Round</option>
              <option value="playersByADPRound">Players Expected to be Drafted by Round</option>
              <option value="playerTargets">Targets Visualization</option>
            </select>
          </div>
        </div>
        {currentView === 'playersByRound' && (
          <div className="flex flex-col text-left">
            <p className="text-sm text-gray-600">
              Grayed out players you can still get in the next round
            </p>
            <p className="text-sm text-gray-600">
              Shows players available in each round based on their Average Draft Position
              {positionFilter !== 'All' && ` (filtered to ${positionFilter} players only)`}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Use ← → arrow keys or buttons to navigate between round groups
            </p>
          </div>
        )}
        {currentView === 'playersByADPRound' && (
          <div className="flex flex-col text-left">
            <p className="text-sm text-gray-600">
              Shows all players expected to be drafted in each round, sorted by overall rank
            </p>
            <p className="text-sm text-gray-600">
              Rank differential shows how much higher/lower a player is ranked vs their ADP
              {positionFilter !== 'All' && ` (filtered to ${positionFilter} players only)`}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Use ← → arrow keys or buttons to navigate between round groups
            </p>
          </div>
        )}
      </div>

      {/* Mobile Header */}
      <div className="mb-4 md:hidden flex-shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800 text-center flex-1">
            {currentView === 'playersByRound' ? 'Highest Ranked Avail Players by Round' : 
             currentView === 'playersByADPRound' ? 'Players by ADP Round' : 
             'Targets Visualization'}
            {(currentView === 'playersByRound' || currentView === 'playersByADPRound') && positionFilter !== 'All' && ` - ${positionFilter}`}
          </h2>
          <button
            onClick={() => setIsSearchModalOpen(true)}
            className="ml-3 p-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg shadow transition-colors flex-shrink-0"
            title="Search Players"
          >
            🔍
          </button>
        </div>
      </div>
      
      {/* Main Content */}
      <div className="flex-1 mb-20 md:mb-4 overflow-hidden">
        {currentView === 'playersByRound' ? (
          <PlayersByRoundView
            playerRanks={playerRanks}
            fantasySettings={fantasySettings}
            boardSettings={boardSettings}
            viewPlayerId={viewPlayerId}
            myPicks={myPicks}
            currPick={currPick}
            setViewPlayerId={setViewPlayerId}
            playerTargets={playerTargets}
            playerLib={playerLib}
            addPlayerTarget={addPlayerTarget}
            replacePlayerTargets={replacePlayerTargets}
            removePlayerTarget={removePlayerTarget}
            removePlayerTargets={removePlayerTargets}
            positionFilter={positionFilter}
            setPositionFilter={setPositionFilter}
            onSwitchToTargetsView={handleSwitchToTargetsView}
          />
        ) : currentView === 'playersByADPRound' ? (
          <PlayersByADPRoundView
            playerRanks={playerRanks}
            fantasySettings={fantasySettings}
            boardSettings={boardSettings}
            viewPlayerId={viewPlayerId}
            myPicks={myPicks}
            currPick={currPick}
            setViewPlayerId={setViewPlayerId}
            playerTargets={playerTargets}
            playerLib={playerLib}
            addPlayerTarget={addPlayerTarget}
            replacePlayerTargets={replacePlayerTargets}
            removePlayerTarget={removePlayerTarget}
            removePlayerTargets={removePlayerTargets}
            positionFilter={positionFilter}
            setPositionFilter={setPositionFilter}
            onSwitchToTargetsView={handleSwitchToTargetsView}
          />
        ) : (
          <PlayerTargetsView
            playerTargets={playerTargets}
            playerLib={playerLib}
            fantasySettings={fantasySettings}
            boardSettings={boardSettings}
            playerRanks={playerRanks}
            currPick={currPick}
          />
        )}
      </div>

      {/* Mobile Footer */}
      <MobileViewFooter
        dropdowns={[
          {
            label: currentView === 'playersByRound' ? 'Rounds View' : 
                   currentView === 'playersByADPRound' ? 'ADP Rounds View' : 
                   'Targets View',
            isOpen: isMobileViewOpen,
            onToggle: () => {
              setIsMobileViewOpen(!isMobileViewOpen)
            },
            variant: 'primary',
            items: [
              {
                label: 'Highest Ranked Avail Players by Round',
                onClick: () => {
                  handleSwitchToRoundsView()
                  setIsMobileViewOpen(false)
                },
                isSelected: currentView === 'playersByRound'
              },
              {
                label: 'Players Expected to be Drafted by Round',
                onClick: () => {
                  handleSwitchToADPRoundsView()
                  setIsMobileViewOpen(false)
                },
                isSelected: currentView === 'playersByADPRound'
              },
              {
                label: 'Targets Visualization',
                onClick: () => {
                  handleSwitchToTargetsView()
                  setIsMobileViewOpen(false)
                },
                isSelected: currentView === 'playerTargets',
                disabled: playerTargets.length === 0
              }
            ]
          }
        ]}
        buttons={[]}
        onClickOutside={() => {
          setIsMobileViewOpen(false)
        }}
      />

      {/* Player Search Modal */}
      <PlayerSearchModal
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
        playerLib={playerLib}
        fantasySettings={fantasySettings}
        boardSettings={boardSettings}
        rankingSummaries={rankingSummaries}
        playerTargets={playerTargets}
        addPlayerTarget={addPlayerTarget}
        removePlayerTarget={removePlayerTarget}
        myPickNum={myPickNum}
        currPick={currPick}
      />
    </div>
  )
}

export default ADPView 