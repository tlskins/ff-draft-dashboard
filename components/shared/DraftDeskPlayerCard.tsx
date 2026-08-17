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
  urgencyCue?: string
  leadingRank?: number | string
  actions?: ReactNode
  evidence?: ReactNode
  compact?: boolean
  dock?: boolean
  className?: string
  rootProps?: Omit<React.HTMLAttributes<HTMLDivElement>, "aria-label" | "className" | "role">
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
  urgencyCue,
  leadingRank,
  actions,
  evidence,
  compact = false,
  dock = false,
  className = "",
  rootProps,
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
      {...rootProps}
      aria-label={`${player.fullName}, ${player.position}, ${player.team}. ${rankContext || defaultRankContext}. ${adpText}${tierNumber ? `. Tier ${tierNumber}` : ""}${target ? `. Target round ${target.targetAsEarlyAsRound}` : ""}${urgency ? `. ${urgency}` : ""}`}
      className={`${styles.playerCard} ${positionClass(player.position)} ${focused ? styles.playerCardFocused : ""} ${compact ? styles.playerCardCompact : ""} ${dock ? styles.playerCardDock : ""} ${className}`}
      onFocus={event => {
        rootProps?.onFocus?.(event)
        onFocusPlayer?.(player.id)
      }}
      onMouseEnter={event => {
        rootProps?.onMouseEnter?.(event)
        onFocusPlayer?.(player.id)
      }}
      role="group"
      tabIndex={onFocusPlayer ? 0 : undefined}
    >
      {leadingRank !== undefined && <span aria-hidden="true" className={styles.playerCardRank}>{leadingRank}</span>}
      <div className={styles.playerCardBody}>
        {dock && <span className={styles.playerCardDockPick}>{rankContext || defaultRankContext}</span>}
        <div className={styles.playerCardHeader}>
          <span className={styles.playerCardName}>{dock ? playerShortName(player.fullName) : player.fullName}</span>
          {!dock && tierNumber && <span className={styles.tierFlag}>T{tierNumber}</span>}
        </div>
        {!dock && (
          <div className={styles.playerCardDetails}>
            <p className={styles.playerCardMeta}>
              <span className="sr-only">{player.position} </span>{player.team} · {rankContext || defaultRankContext}
            </p>
            <div className={styles.playerCardEvidence}>
              {evidence || <>
                <span>{adpText}</span>
                {target && <span className={styles.targetFlag}>Target R{target.targetAsEarlyAsRound}</span>}
                {urgency && urgencyCue && <span aria-hidden="true" className={styles.playerCardUrgency} title={urgency}>{urgencyCue}</span>}
              </>}
            </div>
          </div>
        )}
        {dock && <p className={styles.playerCardMeta}>{player.team}</p>}
        {actions && <div className={styles.playerCardActions}>{actions}</div>}
      </div>
    </div>
  )
}

export default DraftDeskPlayerCard
