import {PlayerTarget} from "../types"

export const PLAYER_TARGETS_STORAGE_KEY = "ff-draft-favorites"

export const playerTargetsStorageKey = (season: number): string =>
  `${PLAYER_TARGETS_STORAGE_KEY}:season:${season}`

const MAX_PLAYER_TARGETS = 500
const MAX_PLAYER_ID_LENGTH = 128
const MAX_TARGET_ROUND = 100

export type StoredPlayerTargetsResult =
  | {status: "ready"; targets: PlayerTarget[]}
  | {status: "missing"; targets: []}
  | {status: "rejected"; targets: []; reason: string}

const isPlainRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null
  && typeof value === "object"
  && !Array.isArray(value)
  && Object.getPrototypeOf(value) === Object.prototype
)

export const validateStoredPlayerTargets = (value: unknown): PlayerTarget[] => {
  if (!Array.isArray(value)) throw new Error("Stored targets must be an array")
  if (value.length > MAX_PLAYER_TARGETS) throw new Error("Stored targets exceed the supported limit")

  const seen = new Set<string>()
  return value.map((target, index) => {
    if (!isPlainRecord(target)) throw new Error(`Stored target ${index} must be an object`)
    const keys = Object.keys(target)
    if (
      keys.length !== 2
      || !keys.includes("playerId")
      || !keys.includes("targetAsEarlyAsRound")
    ) throw new Error(`Stored target ${index} has unsupported fields`)

    const playerId = target.playerId
    const targetAsEarlyAsRound = target.targetAsEarlyAsRound
    if (
      typeof playerId !== "string"
      || playerId.length === 0
      || playerId.length > MAX_PLAYER_ID_LENGTH
    ) throw new Error(`Stored target ${index} has an invalid player id`)
    if (seen.has(playerId)) throw new Error(`Stored target ${index} duplicates a player id`)
    if (
      !Number.isInteger(targetAsEarlyAsRound)
      || Number(targetAsEarlyAsRound) < 1
      || Number(targetAsEarlyAsRound) > MAX_TARGET_ROUND
    ) throw new Error(`Stored target ${index} has an invalid target round`)

    seen.add(playerId)
    return {playerId, targetAsEarlyAsRound: Number(targetAsEarlyAsRound)}
  })
}

export const readStoredPlayerTargets = (serialized: string | null): StoredPlayerTargetsResult => {
  if (serialized === null) return {status: "missing", targets: []}
  try {
    return {status: "ready", targets: validateStoredPlayerTargets(JSON.parse(serialized) as unknown)}
  } catch (error) {
    return {
      status: "rejected",
      targets: [],
      reason: error instanceof Error ? error.message : "Stored targets are invalid",
    }
  }
}

export const serializePlayerTargets = (targets: PlayerTarget[]): string => (
  JSON.stringify(validateStoredPlayerTargets(targets))
)
