import React, { ReactNode } from "react"

import { getPlayerMetrics, getRoundAndPickShortText } from "../../behavior/draft"
import { playerShortName } from "../../behavior/presenters"
import type { BoardSettings, FantasySettings, Player, PlayerTarget } from "../../types"
import styles from "../DraftDesk.module.css"

interface DraftDeskPlayerCardProps {
  player: Player
  fantasySettings: FantasySettings
  boardSettings: BoardSettings
  focused?: boolean
  onFocusPlayer?: (playerId: string) => void
  target?: PlayerTarget
  rankContext?: string
  urgency?: string
  actions?: ReactNode
  compact?: boolean
  dock?: boolean
  className?: string
}

const positionClass = (position: string): string => (
  position === "QB" ? styles.positionQB
    : position === "RB" ? styles.positionRB
      : position === "WR" ? styles.positionWR
        : styles.positionTE
)

/**
 * The desk's single player identity treatment. Position stays available to
 * assistive technology while the visual position signal is a narrow edge,
 * leaving the card itself neutral and dense.
 */
const DraftDeskPlayerCard = ({
  player,
  fantasySettings,
  boardSettings,
  focused = false,
  onFocusPlayer,
  target,
  rankContext,
  urgency,
  actions,
  compact = false,
  dock = false,
  className = "",
}: DraftDeskPlayerCardProps) => {
  const { tier, adp, overallRank, posRank } = getPlayerMetrics(
    player,
    fantasySettings,
    boardSettings,
  )
  const tierNumber = tier?.tierNumber
  const defaultRankContext = overallRank
    ? `Rank ${overallRank}${posRank ? ` · ${player.position}${posRank}` : ""}`
    : "Unranked"
  const adpText = adp && adp < 999
    ? `ADP ${getRoundAndPickShortText(adp, fantasySettings.numTeams)}`
    : "ADP —"

  return (
    <div
      aria-label={`${player.fullName}, ${player.position}, ${player.team}. ${rankContext || defaultRankContext}. ${adpText}${tierNumber ? `. Tier ${tierNumber}` : ""}`}
      className={`${styles.playerCard} ${positionClass(player.position)} ${focused ? styles.playerCardFocused : ""} ${compact ? styles.playerCardCompact : ""} ${dock ? styles.playerCardDock : ""} ${className}`}
      onFocus={() => onFocusPlayer?.(player.id)}
      onMouseEnter={() => onFocusPlayer?.(player.id)}
      role="group"
      tabIndex={onFocusPlayer ? 0 : undefined}
    >
      <div className={styles.playerCardHeader}>
        <span className={styles.playerCardName}>{playerShortName(player.fullName)}</span>
        {target && <span className={styles.targetFlag}>Target R{target.targetAsEarlyAsRound}</span>}
      </div>
      <p className={styles.playerCardMeta}>
        <span className="sr-only">{player.position} </span>{player.team} · {rankContext || defaultRankContext}
      </p>
      {!dock && (
        <p className={styles.playerCardMeta}>
          {adpText}{tierNumber ? ` · Tier ${tierNumber}` : ""}
        </p>
      )}
      {urgency && <p className={styles.playerCardUrgency}>{urgency}</p>}
      {actions && <div className={styles.playerCardActions}>{actions}</div>}
    </div>
  )
}

export default DraftDeskPlayerCard
