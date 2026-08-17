import {
  getPlayerAdp,
  getRoundNumForPickNum,
  type PlayerRanks,
} from "./draft"
import type {
  BoardSettings,
  FantasySettings,
  Player,
  PlayerTarget,
} from "../types"

export type DeskTargetPositionFilter = "All" | "QB" | "RB" | "WR" | "TE"

export interface DraftDeskTargetChartPlayer {
  player: Player
  adpPick: number | null
  adpRound: number | null
}

export type DraftDeskCurrentPickRelationship = "ahead" | "inside" | "passed"

export interface DraftDeskTargetRoundGroup {
  targetRound: number
  targetStartPick: number
  targetEndPick: number
  currentPickRelationship: DraftDeskCurrentPickRelationship
  players: DraftDeskTargetChartPlayer[]
}

export interface DraftDeskTargetChartModel {
  groups: DraftDeskTargetRoundGroup[]
  playerCount: number
  maxPick: number
  maxRound: number
  roundTicks: number[]
  currentPick: number
}

interface BuildDraftDeskTargetChartModelArgs {
  playerTargets: PlayerTarget[]
  playerLib: {[key: string]: Player}
  playerRanks: PlayerRanks
  fantasySettings: FantasySettings
  boardSettings: BoardSettings
  currPick: number
  positionFilter: DeskTargetPositionFilter
}

export const buildDraftDeskTargetChartModel = ({
  playerTargets,
  playerLib,
  playerRanks,
  fantasySettings,
  boardSettings,
  currPick,
  positionFilter,
}: BuildDraftDeskTargetChartModelArgs): DraftDeskTargetChartModel => {
  const availableIds = new Set(
    playerRanks.availPlayersByOverallRank.map(player => player.id),
  )
  const targetPlayers = playerTargets.flatMap(target => {
    const player = playerLib[target.playerId]
    if (
      !player
      || !availableIds.has(player.id)
      || (positionFilter !== "All" && player.position !== positionFilter)
    ) return []
    const rawAdp = getPlayerAdp(player, fantasySettings, boardSettings)
    const adpPick = Number.isFinite(rawAdp) && rawAdp > 0 && rawAdp < 999
      ? rawAdp
      : null
    return [{
      player,
      targetRound: target.targetAsEarlyAsRound,
      adpPick,
      adpRound: adpPick === null
        ? null
        : getRoundNumForPickNum(adpPick, fantasySettings.numTeams),
    }]
  })

  const groups = Array.from(
    targetPlayers.reduce((byRound, targetPlayer) => {
      const group = byRound.get(targetPlayer.targetRound) || []
      group.push(targetPlayer)
      byRound.set(targetPlayer.targetRound, group)
      return byRound
    }, new Map<number, typeof targetPlayers>()),
  ).sort(([leftRound], [rightRound]) => leftRound - rightRound)
    .map(([targetRound, players]): DraftDeskTargetRoundGroup => {
      const targetStartPick = (targetRound - 1) * fantasySettings.numTeams + 1
      const targetEndPick = targetRound * fantasySettings.numTeams
      return {
        targetRound,
        targetStartPick,
        targetEndPick,
        currentPickRelationship: currPick < targetStartPick
          ? "ahead"
          : currPick <= targetEndPick
            ? "inside"
            : "passed",
        players: players.sort((left, right) => {
          const adpDifference = (left.adpPick ?? Number.POSITIVE_INFINITY)
            - (right.adpPick ?? Number.POSITIVE_INFINITY)
          if (adpDifference !== 0) return adpDifference
          const leftIdentity = `${left.player.fullName}\u0000${left.player.id}`
          const rightIdentity = `${right.player.fullName}\u0000${right.player.id}`
          return leftIdentity < rightIdentity ? -1 : leftIdentity > rightIdentity ? 1 : 0
        }),
      }
    })

  const currentRound = Math.max(1, getRoundNumForPickNum(currPick, fantasySettings.numTeams))
  const maxEvidenceRound = Math.max(
    5,
    currentRound + 1,
    ...groups.flatMap(group => [
      group.targetRound,
      ...group.players.map(player => player.adpRound || 0),
    ]),
  )
  const maxRound = Math.min(15, maxEvidenceRound)
  const tickStep = Math.max(1, Math.ceil(maxRound / 5))
  const roundTicks = Array.from(
    {length: Math.ceil(maxRound / tickStep)},
    (_, index) => 1 + index * tickStep,
  ).filter(round => round <= maxRound)
  if (roundTicks.at(-1) !== maxRound) roundTicks.push(maxRound)

  return {
    groups,
    playerCount: targetPlayers.length,
    maxPick: maxRound * fantasySettings.numTeams,
    maxRound,
    roundTicks,
    currentPick: currPick,
  }
}

export const targetChartPercent = (pick: number, maxPick: number): number =>
  Math.max(0, Math.min(100, ((pick - 1) / Math.max(1, maxPick - 1)) * 100))
