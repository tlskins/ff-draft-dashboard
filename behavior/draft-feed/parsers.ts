import { FantasyPosition, Player } from "types"
import {
  EspnDraftPick,
  NflDraftPick,
} from "./types"
import {
  PlayersByPositionAndTeam,
} from "../draft"

export interface ParsedDraftPick {
  id: string
  overallPick: number
  name: string
  team: string
  position: string
}

const levenshteinDistance = (left: string, right: string): number => {
  const matrix = new Array(left.length + 1)
    .fill(null)
    .map(() => new Array(right.length + 1).fill(0))

  for (let index = 0; index <= left.length; index += 1) {
    matrix[index][0] = index
  }
  for (let index = 0; index <= right.length; index += 1) {
    matrix[0][index] = index
  }

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost =
        left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1
      matrix[leftIndex][rightIndex] = Math.min(
        matrix[leftIndex - 1][rightIndex] + 1,
        matrix[leftIndex][rightIndex - 1] + 1,
        matrix[leftIndex - 1][rightIndex - 1] + substitutionCost,
      )
    }
  }

  return matrix[left.length][right.length]
}

const normalizePlayerName = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\b(iii|ii|jr|sr)\b/g, "")
    .replace(/\s+/g, " ")
    .trim()

const normalizeEspnPosition = (position: string): string =>
  position.split(",")[0]?.trim() || position

const espnPlayerId = (
  pick: EspnDraftPick,
  playersByPositionAndTeam: PlayersByPositionAndTeam,
): string | null => {
  const imageMatch = pick.imgUrl.match(
    /headshots\/nfl\/players\/full\/(\d+)\.png/,
  )
  if (imageMatch) return imageMatch[1]

  const position = normalizeEspnPosition(pick.position)
  const teamAliases = {
    JAX: "JAC",
    PHI: "PHL",
    WSH: "WAS",
  } as Record<string, string>
  const team = teamAliases[pick.team] || pick.team
  const candidates = playersByPositionAndTeam[
    position as FantasyPosition
  ]?.[team] || []
  const normalizedName = normalizePlayerName(pick.name)
  return candidates.find(player =>
    normalizePlayerName(player.fullName) === normalizedName)?.id || null
}

export const parseEspnDraftPicks = (
  picks: EspnDraftPick[],
  numTeams: number,
  playersByPositionAndTeam: PlayersByPositionAndTeam = {},
): ParsedDraftPick[] =>
  picks.flatMap((pick) => {
    const pickMatch = pick.pick.match(/^R(\d+), P(\d+)\b/)
    const position = normalizeEspnPosition(pick.position)
    if (!draftablePositions.has(position) || !pickMatch) {
      return []
    }
    const playerId = espnPlayerId(pick, playersByPositionAndTeam)
    if (!playerId) return []

    const round = Number.parseInt(pickMatch[1], 10)
    const pickInRound = Number.parseInt(pickMatch[2], 10)
    return [{
      id: playerId,
      overallPick: (round - 1) * numTeams + pickInRound,
      name: pick.name,
      team: pick.team,
      position,
    }]
  })

const normalizeNflName = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .replace(/\b(iii|ii|jr)\b/g, "")
    .replace(/\s+/g, " ")
    .trim()

const playerToNflName = (player: Player): string =>
  `${player.firstName[0].toLowerCase()} ${normalizeNflName(player.lastName)}`

const normalizeNflTeam = (team: string): string => {
  switch (team) {
    case "JAX":
      return "JAC"
    case "PHI":
      return "PHL"
    case "LA":
      return "LAR"
    default:
      return team
  }
}

const draftablePositions = new Set<string>([
  FantasyPosition.QUARTERBACK,
  FantasyPosition.RUNNING_BACK,
  FantasyPosition.WIDE_RECEIVER,
  FantasyPosition.TIGHT_END,
])

export const parseNflDraftPicks = (
  picks: NflDraftPick[],
  playersByPositionAndTeam: PlayersByPositionAndTeam,
): ParsedDraftPick[] =>
  picks.flatMap((pick) => {
    if (!draftablePositions.has(pick.position)) {
      return []
    }

    const position = pick.position as FantasyPosition
    const team = normalizeNflTeam(pick.team)
    const candidates = playersByPositionAndTeam[position]?.[team] || []
    const normalizedName = normalizeNflName(pick.name)
    const exactPlayer = candidates.find(
      (player) => playerToNflName(player) === normalizedName,
    )
    if (exactPlayer) {
      return [{
        id: exactPlayer.id,
        overallPick: pick.pick,
        name: pick.name,
        team: pick.team,
        position: pick.position,
      }]
    }

    const similarPlayer = candidates
      .map((player) => ({
        player,
        distance: levenshteinDistance(
          playerToNflName(player),
          normalizedName,
        ),
      }))
      .filter(({ distance }) => distance <= 5)
      .sort((left, right) => left.distance - right.distance)[0]?.player

    return similarPlayer
      ? [{
          id: similarPlayer.id,
          overallPick: pick.pick,
          name: pick.name,
          team: pick.team,
          position: pick.position,
        }]
      : []
  })
