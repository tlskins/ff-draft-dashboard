import { FantasyPosition } from "../types"
import type { FantasySettings } from "../types"
import type { Roster } from "./draft"

export const DRAFT_DESK_PANE_IDS = [
  "profile",
  "rankings",
  "insight",
] as const

export type DraftDeskPaneId = typeof DRAFT_DESK_PANE_IDS[number]
export type DraftDeskPanePlacement = DraftDeskPaneId[]

export const DEFAULT_DRAFT_DESK_PANE_PLACEMENT: DraftDeskPanePlacement = [
  "rankings",
  "profile",
  "insight",
]

export const DRAFT_DESK_PANE_STORAGE_KEY = "drafty-draft-desk-pane-placement"

/**
 * The desk deliberately supports only a whole-pane placement permutation.
 * This is not a resizing or arbitrary-layout schema.
 */
export const isDraftDeskPanePlacement = (
  value: unknown,
): value is DraftDeskPanePlacement => Array.isArray(value)
  && value.length === DRAFT_DESK_PANE_IDS.length
  && value.every(item => DRAFT_DESK_PANE_IDS.includes(item as DraftDeskPaneId))
  && new Set(value).size === DRAFT_DESK_PANE_IDS.length

export const restoreDraftDeskPanePlacement = (
  value: unknown,
): DraftDeskPanePlacement => isDraftDeskPanePlacement(value)
  ? [...value]
  : [...DEFAULT_DRAFT_DESK_PANE_PLACEMENT]

export const swapDraftDeskPanePlacement = (
  placement: DraftDeskPanePlacement,
): DraftDeskPanePlacement => [
  placement[0],
  placement[2],
  placement[1],
]

type StarterPosition =
  | FantasyPosition.QUARTERBACK
  | FantasyPosition.RUNNING_BACK
  | FantasyPosition.WIDE_RECEIVER
  | FantasyPosition.TIGHT_END

export interface DraftDeskRosterSlot {
  id: string
  label: string
  position: StarterPosition | "FLEX"
  required: number
  observed: number
  filled: boolean
  description: string
}

export interface DraftDeskLeagueNeed {
  id: string
  label: string
  position: StarterPosition | "FLEX"
  teamsMissing: number
  description: string
}

const starterDefinitions = (
  settings: FantasySettings,
): Array<{position: StarterPosition, required: number}> => [
  {position: FantasyPosition.QUARTERBACK, required: settings.numStartingQbs},
  {position: FantasyPosition.RUNNING_BACK, required: settings.numStartingRbs},
  {position: FantasyPosition.WIDE_RECEIVER, required: settings.numStartingWrs},
  {position: FantasyPosition.TIGHT_END, required: settings.numStartingTes},
]

const slotLabel = (position: StarterPosition, slot: number): string => (
  slot === 1
    && position !== FantasyPosition.RUNNING_BACK
    && position !== FantasyPosition.WIDE_RECEIVER
    ? position
    : `${position}${slot}`
)

const positionCount = (roster: Roster | undefined, position: StarterPosition): number =>
  roster?.[position]?.length || 0

/**
 * FLEX is intentionally an unallocated, format-level slot. It is filled only
 * by surplus RB/WR/TE counts after their direct starter slots, never assigned
 * to a guessed position.
 */
export const observedFlexCount = (
  roster: Roster | undefined,
  settings: FantasySettings,
): number => Math.min(settings.numFlex, ([
  FantasyPosition.RUNNING_BACK,
  FantasyPosition.WIDE_RECEIVER,
  FantasyPosition.TIGHT_END,
] as StarterPosition[]).reduce(
  (total, position) => total + Math.max(
    0,
    positionCount(roster, position)
      - (starterDefinitions(settings).find(item => item.position === position)
        ?.required || 0),
  ),
  0,
))

export const buildDraftDeskRosterSlots = (
  roster: Roster | undefined,
  settings: FantasySettings,
): DraftDeskRosterSlot[] => {
  const directSlots = starterDefinitions(settings).flatMap(({position, required}) => (
    Array.from({length: required}, (_, index) => {
      const observed = positionCount(roster, position)
      const slot = index + 1
      return {
        id: `${position}-${slot}`,
        label: slotLabel(position, slot),
        position,
        required: 1,
        observed,
        filled: observed >= slot,
        description: `${slotLabel(position, slot)} starter slot`,
      }
    })
  ))
  const flexObserved = observedFlexCount(roster, settings)
  return [
    ...directSlots,
    ...Array.from({length: settings.numFlex}, (_, index) => ({
      id: `FLEX-${index + 1}`,
      label: settings.numFlex === 1 ? "FLEX" : `FLEX${index + 1}`,
      position: "FLEX" as const,
      required: 1,
      observed: flexObserved,
      filled: flexObserved >= index + 1,
      description: "FLEX starter slot; filled by surplus eligible RB, WR, or TE only",
    })),
  ]
}

export const buildDraftDeskLeagueNeeds = (
  rosters: Roster[],
  myRosterIndex: number,
  settings: FantasySettings,
): DraftDeskLeagueNeed[] => {
  const otherRosters = rosters.filter((_, index) => index !== myRosterIndex)
  const directNeeds = starterDefinitions(settings).flatMap(({position, required}) => (
    Array.from({length: required}, (_, index) => {
      const slot = index + 1
      const label = slotLabel(position, slot)
      return {
        id: `${position}-${slot}`,
        label,
        position,
        teamsMissing: otherRosters.filter(roster =>
          positionCount(roster, position) < slot).length,
        description: `Other teams missing the ${label} starter slot`,
      }
    })
  ))
  return [
    ...directNeeds,
    ...Array.from({length: settings.numFlex}, (_, index) => {
      const slot = index + 1
      const label = settings.numFlex === 1 ? "FLEX" : `FLEX${slot}`
      return {
        id: `FLEX-${slot}`,
        label,
        position: "FLEX" as const,
        teamsMissing: otherRosters.filter(roster =>
          observedFlexCount(roster, settings) < slot).length,
        description: `Other teams missing the ${label} starter slot; not assigned to RB or WR`,
      }
    }),
  ]
}

export const isDraftDeskEnabled = (
  enabled = process.env.NEXT_PUBLIC_DRAFT_DESK_ENABLED,
): boolean => enabled === "true"
