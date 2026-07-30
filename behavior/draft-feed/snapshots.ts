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
