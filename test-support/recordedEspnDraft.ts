import recordedFixture from "../__tests__/fixtures/recorded-espn-2026-slot-9.json"
import {
  RecordedCompletedDraftReplay,
} from "../behavior/draft-advisor/completedDraftReplay"
import {
  CanonicalDraftEvent,
  createDraftSessionReducerState,
  reduceDraftSnapshot,
} from "../behavior/draft-feed/session"
import type {
  DraftSnapshot,
  EspnDraftPick,
} from "../behavior/draft-feed/types"


export const recordedEspnReplay =
  recordedFixture as unknown as RecordedCompletedDraftReplay

export type RecordedEspnSnapshot = DraftSnapshot & {
  platform: "ESPN"
  picks: EspnDraftPick[]
}

export const recordedEspnSnapshot = (): RecordedEspnSnapshot => {
  const replay = recordedEspnReplay
  const players = new Map(
    replay.players.map(player => [player.id, player]),
  )
  const numTeams = replay.settings.numTeams
  const leagueId = replay.source?.sourceUrl?.match(
    /[?&]leagueId=(\d+)/,
  )?.[1] || "recorded"

  return {
    id: `ESPN:${leagueId}`,
    title: replay.source?.title || replay.id,
    platform: "ESPN",
    capturedAt: replay.source?.capturedAt || 0,
    sourceUrl: replay.source?.sourceUrl,
    numTeams,
    targetRosterIndex: replay.targetRosterIndex,
    scoringFormat: replay.settings.ppr ? "PPR" : "STANDARD",
    completion: {
      complete: true,
      totalPicks: replay.actualPicks.length,
      numRounds: replay.source?.numRounds || 0,
      numTeams,
      platformRosterSize: replay.source?.platformRosterSize || 0,
      targetRosterIndex: replay.targetRosterIndex,
      excludedPositions: replay.source?.excludedPositions || [],
      scoringFormat: replay.settings.ppr ? "PPR" : "STANDARD",
    },
    picks: replay.actualPicks.map(pick => {
      const player = pick.playerId
        ? players.get(pick.playerId)
        : undefined
      const round = Math.floor((pick.overallPick - 1) / numTeams) + 1
      const pickInRound = (pick.overallPick - 1) % numTeams + 1
      return {
        imgUrl: player
          ? `https://a.espncdn.com/i/headshots/nfl/players/full/${
              player.id
            }.png`
          : "",
        name: pick.name || player?.name || "Platform pick",
        team: player?.team || "",
        position: pick.position || player?.position || "",
        pick: `R${round}, P${pickInRound}`,
      }
    }),
  }
}

export const recordedEspnCanonicalEvents = (): {
  snapshot: DraftSnapshot
  events: CanonicalDraftEvent[]
} => {
  const snapshot = recordedEspnSnapshot()
  const result = reduceDraftSnapshot(
    createDraftSessionReducerState(),
    snapshot,
    {
      numTeams: recordedEspnReplay.settings.numTeams,
      playersByPositionAndTeam: {},
    },
  )
  return {
    snapshot,
    events: result.events,
  }
}
