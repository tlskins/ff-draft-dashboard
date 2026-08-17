import React, {useMemo} from "react"

import {
  buildDraftDeskTargetChartModel,
  targetChartPercent,
  type DeskTargetPositionFilter,
  type DraftDeskCurrentPickRelationship,
} from "../../behavior/draftDeskTargetChart"
import {getRoundAndPickShortText, type PlayerRanks} from "../../behavior/draft"
import type {
  BoardSettings,
  FantasySettings,
  Player,
  PlayerTarget,
} from "../../types"
import styles from "../DraftDesk.module.css"

interface DraftDeskTargetChartProps {
  playerTargets: PlayerTarget[]
  playerLib: {[key: string]: Player}
  playerRanks: PlayerRanks
  fantasySettings: FantasySettings
  boardSettings: BoardSettings
  currPick: number
  positionFilter: DeskTargetPositionFilter
  setPositionFilter: (filter: DeskTargetPositionFilter) => void
  onBack: () => void
}

const markerClass = (position: string): string => position === "QB"
  ? styles.targetMarkerQB
  : position === "RB"
    ? styles.targetMarkerRB
    : position === "WR"
      ? styles.targetMarkerWR
      : styles.targetMarkerTE

const positionClass = (position: string): string => position === "QB"
  ? styles.positionQB
  : position === "RB"
    ? styles.positionRB
    : position === "WR"
      ? styles.positionWR
      : styles.positionTE

const currentPickCopy = (
  currentPick: number,
  relationship: DraftDeskCurrentPickRelationship,
): string => `Current pick ${currentPick} · ${relationship === "inside"
  ? "inside target round"
  : relationship === "ahead"
    ? "target round ahead"
    : "target round passed"}`

const DraftDeskTargetChart = ({
  playerTargets,
  playerLib,
  playerRanks,
  fantasySettings,
  boardSettings,
  currPick,
  positionFilter,
  setPositionFilter,
  onBack,
}: DraftDeskTargetChartProps) => {
  const model = useMemo(() => buildDraftDeskTargetChartModel({
    playerTargets,
    playerLib,
    playerRanks,
    fantasySettings,
    boardSettings,
    currPick,
    positionFilter,
  }), [
    boardSettings,
    currPick,
    fantasySettings,
    playerLib,
    playerRanks,
    playerTargets,
    positionFilter,
  ])
  const currentPickPercent = targetChartPercent(model.currentPick, model.maxPick)

  return (
    <section aria-label="Player target windows" className={styles.targetChart} data-testid="draft-desk-target-chart">
      <header className={styles.targetChartHeader}>
        <button onClick={onBack} type="button">← Back to ADP rounds</button>
        <label>
          <span>Position</span>
          <select
            aria-label="Target position filter"
            onChange={event => setPositionFilter(event.target.value as DeskTargetPositionFilter)}
            value={positionFilter}
          >
            <option value="All">All positions</option>
            <option value="QB">QB only</option><option value="RB">RB only</option>
            <option value="WR">WR only</option><option value="TE">TE only</option>
          </select>
        </label>
      </header>
      <div className={styles.targetChartIntro}>
        <div><strong>Targets by round</strong><span>{model.playerCount} available players · {model.groups.length} round windows</span></div>
        <div className={styles.targetChartLegend} aria-label="Target chart legend">
          <span><i className={styles.targetWindowLegend} />Round window</span>
          <span><i className={styles.adpLegend} />Player ADP</span>
          <span><i className={styles.currentPickLegend} />Current pick</span>
        </div>
      </div>
      {model.groups.length === 0 ? (
        <div className={styles.targetChartEmpty} role="status">
          No available targets match this position. Return to ADP rounds to add a target.
        </div>
      ) : (
        <div className={styles.targetChartBody}>
          <div aria-hidden="true" className={styles.targetChartScale}>
            <span>PICK SCALE</span>
            <div>{model.roundTicks.map(round => (
              <span key={round} style={{left: `${targetChartPercent((round - 1) * fantasySettings.numTeams + 1, model.maxPick)}%`}}>R{round}</span>
            ))}</div>
          </div>
          <div className={styles.targetRoundGroups}>
            {model.groups.map(group => {
              const targetLeft = targetChartPercent(group.targetStartPick, model.maxPick)
              const targetRight = targetChartPercent(group.targetEndPick, model.maxPick)
              const relationshipCopy = currentPickCopy(model.currentPick, group.currentPickRelationship)
              return (
                <section
                  aria-label={`Round ${group.targetRound} targets, picks ${group.targetStartPick} through ${group.targetEndPick}. ${relationshipCopy}.`}
                  className={styles.targetRoundGroup}
                  data-testid={`target-round-group-${group.targetRound}`}
                  key={group.targetRound}
                >
                  <header className={styles.targetRoundHeader}>
                    <div>
                      <strong>ROUND {group.targetRound} · PICKS {group.targetStartPick}–{group.targetEndPick}</strong>
                      <span>{group.players.length} {group.players.length === 1 ? "player" : "players"} · {relationshipCopy}</span>
                    </div>
                    <div className={styles.targetGroupTrack}>
                      <span className={styles.currentPickLine} style={{left: `${currentPickPercent}%`}}><i>Pick {model.currentPick}</i></span>
                      <span
                        aria-hidden="true"
                        className={styles.targetRoundWindow}
                        style={{left: `${targetLeft}%`, width: `${Math.max(2, targetRight - targetLeft)}%`}}
                      ><i>R{group.targetRound}</i></span>
                    </div>
                  </header>
                  <ol className={styles.targetGroupPlayers}>
                    {group.players.map(({player, adpPick, adpRound}) => {
                      const adpLabel = adpPick === null
                        ? "ADP unavailable"
                        : `ADP ${adpPick.toFixed(1)} · ${getRoundAndPickShortText(adpPick, fantasySettings.numTeams)}`
                      return (
                        <li
                          aria-label={`${player.fullName}, ${player.position}, ${player.team}. Target round ${group.targetRound}, picks ${group.targetStartPick} through ${group.targetEndPick}. ${adpLabel}. ${relationshipCopy}.`}
                          className={`${styles.targetGroupPlayer} ${positionClass(player.position)}`}
                          key={player.id}
                        >
                          <div className={styles.targetChartIdentity}>
                            <strong>{player.fullName}</strong>
                            <span>{player.position} · {player.team} · {adpPick === null ? "ADP unavailable" : `ADP R${adpRound}`}</span>
                          </div>
                          <div className={styles.targetPlayerPlot}>
                            <span aria-hidden="true" className={styles.targetPlayerBaseline} />
                            {adpPick !== null && <span
                              className={`${styles.targetAdpMarker} ${markerClass(player.position)}`}
                              style={{left: `${targetChartPercent(adpPick, model.maxPick)}%`}}
                            ><i>{adpPick.toFixed(1)}</i></span>}
                            <span className={styles.targetPlayerValue}>{adpLabel}</span>
                          </div>
                        </li>
                      )
                    })}
                  </ol>
                </section>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}

export default DraftDeskTargetChart
