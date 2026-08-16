import React from 'react'
import { Player, FantasySettings, BoardSettings, PlayerTarget } from '../../types'
import { getPlayerAdp, getPlayerMetrics, getRoundAndPickShortText } from '../../behavior/draft'
import { PositionFilter } from '../../behavior/hooks/useADPView'
import DraftDeskPlayerCard from './DraftDeskPlayerCard'

interface ADPPlayerCardProps {
  player: Player
  fantasySettings: FantasySettings
  boardSettings: BoardSettings
  viewPlayerId: string | null
  setViewPlayerId: (id: string) => void
  positionFilter: PositionFilter
  // Target-related props
  isPlayerTargeted?: boolean
  playerTarget?: PlayerTarget
  userPickForRound?: number
  addPlayerTarget?: (player: Player, targetAsEarlyAsRound: number) => void
  removePlayerTarget?: (playerId: string) => void
  // Optional styling overrides
  showAdpRound?: boolean // Show ADP round instead of availability
  className?: string
}

export const ADPPlayerCard: React.FC<ADPPlayerCardProps> = ({
  player,
  fantasySettings,
  boardSettings,
  viewPlayerId,
  setViewPlayerId,
  positionFilter: _positionFilter,
  isPlayerTargeted = false,
  playerTarget,
  userPickForRound,
  addPlayerTarget,
  removePlayerTarget,
  showAdpRound: _showAdpRound = false,
  className = '',
}) => {
  const adp = getPlayerAdp(player, fantasySettings, boardSettings)
  const metrics = getPlayerMetrics(player, fantasySettings, boardSettings)
  const { overallRank } = metrics

  const isHoveringPlayer = viewPlayerId === player.id
  const adpRoundAndPick = getRoundAndPickShortText(adp, fantasySettings.numTeams)

  return (
    <DraftDeskPlayerCard
      actions={<>
        {!isPlayerTargeted && userPickForRound && addPlayerTarget && (
          <button className="rounded border border-emerald-300 px-1 py-0.5 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-50" onClick={event => { event.stopPropagation(); addPlayerTarget(player, userPickForRound) }} type="button">Target</button>
        )}
        {isPlayerTargeted && removePlayerTarget && (
          <button className="rounded border border-rose-300 px-1 py-0.5 text-[10px] font-semibold text-rose-700 hover:bg-rose-50" onClick={event => { event.stopPropagation(); removePlayerTarget(player.id) }} type="button">Remove</button>
        )}
      </>}
      boardSettings={boardSettings}
      className={className}
      compact
      fantasySettings={fantasySettings}
      focused={isHoveringPlayer}
      onFocusPlayer={setViewPlayerId}
      player={player}
      rankContext={`ADP ${adpRoundAndPick} · Rank ${overallRank ? getRoundAndPickShortText(overallRank, fantasySettings.numTeams) : "—"}`}
      target={playerTarget}
    />
  )
}

export default ADPPlayerCard
