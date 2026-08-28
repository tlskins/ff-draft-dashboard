import React, { ReactNode } from "react"

import { getPlayerMetrics, getRoundAndPickShortText } from "../../behavior/draft"
import { playerShortName } from "../../behavior/presenters"
import type { BoardSettings, FantasySettings, Player, PlayerTarget } from "../../types"
import styles from "../DraftDesk.module.css"
import TargetMarker from "./TargetMarker"

interface DraftDeskPlayerCardProps {
  player: Player
  fantasySettings: FantasySettings
  boardSettings: BoardSettings
  focused?: boolean
  onFocusPlayer?: (playerId: string) => void
  onPinPlayer?: (playerId: string) => void
  pinned?: boolean
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
  currentPick?: number
  rootProps?: Omit<React.HTMLAttributes<HTMLDivElement>, "aria-label" | "className" | "role">
}

const positionClass = (position: string): string => (
  position === "QB" ? styles.positionQB
    : position === "RB" ? styles.positionRB
      : position === "WR" ? styles.positionWR
        : styles.positionTE
)

const tierFlagClass = (tierNumber: number | undefined): string => {
  if (!tierNumber || tierNumber < 1) return styles.tierFlagUnranked
  if (tierNumber >= 8) return styles.tierFlag8Plus
  return styles[`tierFlag${tierNumber}`]
}

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
  onPinPlayer,
  pinned = false,
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
  currentPick,
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
  const adpRoundDelta = currentPick && adp && adp < 999
    ? (adp - currentPick) / fantasySettings.numTeams
    : null
  const adpTimingLabel = adpRoundDelta === null
    ? null
    : adpRoundDelta > 0.5
      ? `${adpRoundDelta.toFixed(1)} RD EARLY`
      : adpRoundDelta < -0.5
        ? `${Math.abs(adpRoundDelta).toFixed(1)} RD VALUE`
        : "ADP RANGE"
  const adpTimingAccessible = adpRoundDelta === null
    ? null
    : adpRoundDelta > 0.5
      ? `${adpRoundDelta.toFixed(1)} rounds before ${boardSettings.adpRanker} ADP`
      : adpRoundDelta < -0.5
        ? `${Math.abs(adpRoundDelta).toFixed(1)} rounds past ${boardSettings.adpRanker} ADP`
        : `Within half a round of ${boardSettings.adpRanker} ADP`

  return (
    <div
      {...rootProps}
      aria-label={`${player.fullName}, ${player.position}, ${player.team}. ${rankContext || defaultRankContext}. ${adpText}${tierNumber ? `. Tier ${tierNumber}` : ""}${target ? `. Target round ${target.targetAsEarlyAsRound}` : ""}${urgency ? `. ${urgency}` : ""}`}
      className={`${styles.playerCard} ${positionClass(player.position)} ${target ? styles.playerCardTarget : ""} ${focused ? styles.playerCardFocused : ""} ${compact ? styles.playerCardCompact : ""} ${dock ? styles.playerCardDock : ""} ${className}`}
      data-target-player={target ? "true" : undefined}
      onClick={event => {
        rootProps?.onClick?.(event)
        onFocusPlayer?.(player.id)
      }}
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
          <span className={styles.playerCardNameGroup}>
            <span className={styles.playerCardName}>{dock ? playerShortName(player.fullName) : player.fullName}</span>
            {target && <TargetMarker className={styles.playerCardTargetMarker} />}
          </span>
          {!dock && tierNumber && (
            <span className={`${styles.tierFlag} ${tierFlagClass(tierNumber)}`}>T{tierNumber}</span>
          )}
        </div>
        {!dock && (
          <div className={styles.playerCardDetails}>
            <p className={styles.playerCardMeta}>
              <span className="sr-only">{player.position} </span>{player.team} · {rankContext || defaultRankContext}
            </p>
            <div className={styles.playerCardEvidence}>
              {evidence || <span>{adpText}</span>}
              {adpTimingLabel && <span
                aria-label={adpTimingAccessible || undefined}
                className={`${styles.adpTimingCue} ${adpRoundDelta! > 0.5
                  ? styles.adpTimingEarly
                  : adpRoundDelta! < -0.5 ? styles.adpTimingValue : styles.adpTimingRange}`}
                title={`Current pick ${currentPick} · ${boardSettings.adpRanker} ADP ${adp!.toFixed(1)}`}
              >{adpTimingLabel}</span>}
              <>
                {target && <span className={styles.targetFlag}>Target R{target.targetAsEarlyAsRound}</span>}
                {urgency && urgencyCue && <span aria-hidden="true" className={styles.playerCardUrgency} title={urgency}>{urgencyCue}</span>}
              </>
            </div>
          </div>
        )}
        {dock && <p className={styles.playerCardMeta}>{player.team}</p>}
        {actions && <div className={styles.playerCardActions}>{actions}</div>}
        {onPinPlayer && !dock && <button
          aria-label={`${pinned ? "Unlock" : "Lock"} ${player.fullName} in player profile`}
          aria-pressed={pinned}
          className={styles.playerCardPin}
          onClick={event => {
            event.stopPropagation()
            onPinPlayer(player.id)
          }}
          title={pinned ? "Unlock player profile" : "Lock player profile"}
          type="button"
        >{pinned ? "Unlock" : "Lock"}</button>}
      </div>
    </div>
  )
}

export default DraftDeskPlayerCard
