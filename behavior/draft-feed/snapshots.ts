import {
  DraftSnapshot,
  EspnDraftPick,
  NflDraftPick,
  RawDraftPick,
} from "./types"

const pickKey = (
  snapshot: DraftSnapshot,
  pick: RawDraftPick,
): string => {
  if (snapshot.platform === "ESPN") {
    const espnPick = pick as EspnDraftPick
    const pickNumber = espnPick.pick.match(/^R(\d+), P(\d+)\b/)
    return pickNumber
      ? `${pickNumber[1]}:${pickNumber[2]}`
      : `${espnPick.pick}:${espnPick.imgUrl}`
  }

  return String((pick as NflDraftPick).pick)
}

export const mergeDraftSnapshots = (
  previous: DraftSnapshot | undefined,
  incoming: DraftSnapshot,
): DraftSnapshot => {
  if (!previous || previous.id !== incoming.id) {
    return incoming
  }

  const picks = new Map<string, RawDraftPick>()
  previous.picks.forEach((pick) => {
    picks.set(pickKey(previous, pick), pick)
  })
  incoming.picks.forEach((pick) => {
    picks.set(pickKey(incoming, pick), pick)
  })

  return {
    ...incoming,
    picks: Array.from(picks.values()),
    capturedAt: Math.max(previous.capturedAt, incoming.capturedAt),
  }
}

/**
 * Provider-board progress includes K/DST clock events that the advisor rightly
 * excludes from its player state. Consumers that need a leakage boundary must
 * use this raw value rather than the eligible-player current pick.
 */
export const getSnapshotObservedThroughOverallPick = (
  snapshot: DraftSnapshot | null | undefined,
  fallbackNumTeams: number,
): number | undefined => {
  if (!snapshot) return undefined
  const numTeams = snapshot.completion?.numTeams
    || snapshot.numTeams
    || fallbackNumTeams
  const picks = snapshot.picks.map(pick => {
    if (snapshot.platform === "NFL") {
      return typeof pick.pick === "number" ? pick.pick : 0
    }
    if (typeof pick.pick !== "string") return 0
    const coordinate = pick.pick.match(/^R(\d+), P(\d+)\b/)
    return coordinate
      ? (Number.parseInt(coordinate[1], 10) - 1) * numTeams
        + Number.parseInt(coordinate[2], 10)
      : 0
  })
  const maximum = Math.max(0, ...picks)
  return maximum > 0 ? maximum : undefined
}

/**
 * A connected platform snapshot owns draft completion. The eligible-player
 * count is only a legacy fallback when no platform source is attached.
 */
export const isDraftCaptureComplete = (
  activeSnapshot: DraftSnapshot | null | undefined,
  eligibleHistoryCount: number,
  legacyExpectedPickCount: number,
): boolean => {
  if (activeSnapshot) return activeSnapshot.completion?.complete === true
  return eligibleHistoryCount === legacyExpectedPickCount
}
