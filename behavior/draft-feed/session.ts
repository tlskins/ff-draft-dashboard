import { FantasyPosition, NFLTeam, Player } from "../../types"
import type { components as ApiComponents } from "../api/schema"
import { PlayersByPositionAndTeam } from "../draft"
import {
  ParsedDraftPick,
  parseEspnDraftPicks,
  parseNflDraftPicks,
} from "./parsers"
import {
  DraftSnapshot,
  EspnDraftPick,
  NflDraftPick,
} from "./types"

export const CANONICAL_DRAFT_EVENT_VERSION = 1 as const

export type CanonicalDraftPick =
  ApiComponents["schemas"]["CanonicalDraftPick"]
export type DraftPickRecordedEvent =
  ApiComponents["schemas"]["DraftPickRecordedEvent"]
export type CanonicalDraftEvent =
  ApiComponents["schemas"]["CanonicalDraftEvent"]

export interface DraftSessionReducerState {
  processedEventIds: string[]
  lastOverallPickByDraft: Record<string, number>
}

export interface DraftSnapshotReducerContext {
  numTeams: number
  playersByPositionAndTeam: PlayersByPositionAndTeam
}

export interface DraftSnapshotReducerResult {
  state: DraftSessionReducerState
  events: CanonicalDraftEvent[]
  lastProcessedPick: number | null
}

export const createDraftSessionReducerState = (): DraftSessionReducerState => ({
  processedEventIds: [],
  lastOverallPickByDraft: {},
})

export const getRosterIndexForPick = (
  overallPick: number,
  numTeams: number,
): number => {
  const roundIndex = Math.floor((overallPick - 1) / numTeams)
  const pickIndex = (overallPick - 1) % numTeams
  return roundIndex % 2 === 0
    ? pickIndex
    : numTeams - pickIndex - 1
}

const eventIdForPick = (
  draftId: string,
  overallPick: number,
): string => `${draftId}:pick:${overallPick}`

const parseSnapshot = (
  snapshot: DraftSnapshot,
  context: DraftSnapshotReducerContext,
): ParsedDraftPick[] =>
  snapshot.platform === "ESPN"
    ? parseEspnDraftPicks(
        snapshot.picks as EspnDraftPick[],
        context.numTeams,
        context.playersByPositionAndTeam,
      )
    : parseNflDraftPicks(
        snapshot.picks as NflDraftPick[],
        context.playersByPositionAndTeam,
      )

const toCanonicalEvent = (
  snapshot: DraftSnapshot,
  parsedPick: ParsedDraftPick,
  numTeams: number,
): CanonicalDraftEvent => ({
  version: CANONICAL_DRAFT_EVENT_VERSION,
  kind: "draft-pick-recorded",
  eventId: eventIdForPick(snapshot.id, parsedPick.overallPick),
  draftId: snapshot.id,
  draftTitle: snapshot.title,
  platform: snapshot.platform,
  capturedAt: snapshot.capturedAt,
  pick: {
    playerId: parsedPick.id,
    overallPick: parsedPick.overallPick,
    rosterIndex: getRosterIndexForPick(parsedPick.overallPick, numTeams),
    name: parsedPick.name,
    team: parsedPick.team,
    position: parsedPick.position,
  },
})

export const reduceDraftSnapshot = (
  state: DraftSessionReducerState,
  snapshot: DraftSnapshot,
  context: DraftSnapshotReducerContext,
): DraftSnapshotReducerResult => {
  const processedEventIds = new Set(state.processedEventIds)
  const events: CanonicalDraftEvent[] = []
  parseSnapshot(snapshot, context).forEach((pick) => {
    const event = toCanonicalEvent(snapshot, pick, context.numTeams)
    if (processedEventIds.has(event.eventId)) return

    processedEventIds.add(event.eventId)
    events.push(event)
  })
  const lastProcessedPick = events.reduce<number | null>(
    (latest, event) =>
      latest === null
        ? event.pick.overallPick
        : Math.max(latest, event.pick.overallPick),
    null,
  )

  return {
    state: {
      processedEventIds: Array.from(processedEventIds),
      lastOverallPickByDraft: lastProcessedPick === null
        ? state.lastOverallPickByDraft
        : {
            ...state.lastOverallPickByDraft,
            [snapshot.id]: Math.max(
              state.lastOverallPickByDraft[snapshot.id] || 0,
              lastProcessedPick,
            ),
          },
    },
    events,
    lastProcessedPick,
  }
}

const fallbackPosition = (position: string): FantasyPosition => {
  const positions = Object.values(FantasyPosition) as string[]
  return positions.includes(position)
    ? position as FantasyPosition
    : FantasyPosition.NONE
}

const fallbackTeam = (team: string): NFLTeam => {
  const normalizedTeam = team === "PHI" ? NFLTeam.PHL : team
  const teams = Object.values(NFLTeam) as string[]
  return teams.includes(normalizedTeam)
    ? normalizedTeam as NFLTeam
    : NFLTeam.FA
}

export const createFallbackPlayerFromDraftEvent = (
  event: CanonicalDraftEvent,
): Player => {
  const { playerId, name, team, position } = event.pick
  const [firstName = name, ...lastNameParts] = name.trim().split(/\s+/)
  return {
    id: playerId,
    firstName,
    lastName: lastNameParts.join(" "),
    fullName: name,
    team: fallbackTeam(team),
    position: fallbackPosition(position),
    ranks: {},
  }
}
