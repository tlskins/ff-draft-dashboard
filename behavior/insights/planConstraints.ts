import {
  buildDraftDeskLeagueNeeds,
  buildDraftDeskRosterSlots,
} from "../draftDesk"
import type {
  DraftDeskLeagueNeed,
  DraftDeskRosterSlot,
} from "../draftDesk"
import type {Roster} from "../draft"
import type {DraftPlanDocument} from "../realtime/contracts"
import type {FantasySettings} from "../../types"

export type PlanConstraintsAvailability = "ready" | "empty" | "unavailable"

export interface PlanConstraintsPlanEntry {
  id: string
  text: string
  sourceEventCount: number
}

export interface PlanConstraintsPlan {
  state: PlanConstraintsAvailability
  revision: number | null
  updatedAt: string | null
  entries: PlanConstraintsPlanEntry[]
  unavailableReason: string | null
}

export interface PlanConstraintsPresentationModel {
  fingerprint: string
  rosterState: PlanConstraintsAvailability
  rosterUnavailableReason: string | null
  userSlots: DraftDeskRosterSlot[]
  leagueNeedsState: PlanConstraintsAvailability
  leagueNeedsUnavailableReason: string | null
  leagueNeeds: DraftDeskLeagueNeed[]
  plan: PlanConstraintsPlan
}

export interface BuildPlanConstraintsPresentationModelParams {
  userRoster: Roster | undefined
  rosters: Roster[]
  myRosterIndex: number
  settings: FantasySettings
  draftPlan: DraftPlanDocument | null
}

const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map(key => (
      `${JSON.stringify(key)}:${stableJson(record[key])}`
    )).join(",")}}`
  }
  return JSON.stringify(value)
}

const fingerprintFor = (value: unknown): string => {
  const serialized = stableJson(value)
  let hash = 0x811c9dc5
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, "0")
}

const rosterStateFor = (
  roster: Roster | undefined,
): PlanConstraintsAvailability => {
  if (!roster) return "unavailable"
  return roster.picks.length === 0 ? "empty" : "ready"
}

const unavailablePlan = (reason: string): PlanConstraintsPlan => ({
  state: "unavailable",
  revision: null,
  updatedAt: null,
  entries: [],
  unavailableReason: reason,
})

const validPlan = (value: unknown): value is DraftPlanDocument => {
  if (!value || typeof value !== "object") return false
  const plan = value as Partial<DraftPlanDocument>
  if (
    plan.schema_version !== 1
    || typeof plan.draft_session_id !== "string"
    || !plan.draft_session_id.trim()
    || typeof plan.revision !== "number"
    || !Number.isSafeInteger(plan.revision)
    || plan.revision < 0
    || typeof plan.updated_at !== "string"
    || !plan.updated_at.trim()
    || Number.isNaN(Date.parse(plan.updated_at))
    || !Array.isArray(plan.entries)
  ) return false
  return plan.entries.every(entry => (
    !!entry
    && typeof entry.id === "string"
    && !!entry.id.trim()
    && typeof entry.text === "string"
    && !!entry.text.trim()
    && typeof entry.source_event_count === "number"
    && Number.isSafeInteger(entry.source_event_count)
    && entry.source_event_count >= 0
    && typeof entry.created_at === "string"
    && !!entry.created_at.trim()
    && !Number.isNaN(Date.parse(entry.created_at))
  ))
}

const planFor = (draftPlan: DraftPlanDocument | null): PlanConstraintsPlan => {
  if (!draftPlan) return unavailablePlan(
    "No confirmed draft plan is available for this session.",
  )
  if (!validPlan(draftPlan)) return unavailablePlan(
    "Confirmed draft plan data is malformed or unavailable for this session.",
  )
  const entries = draftPlan.entries.map(entry => ({
    id: entry.id,
    text: entry.text,
    sourceEventCount: entry.source_event_count,
  }))
  return {
    state: entries.length === 0 ? "empty" : "ready",
    revision: draftPlan.revision,
    updatedAt: draftPlan.updated_at,
    entries,
    unavailableReason: null,
  }
}

const unavailableRosterReason =
  "User roster is unavailable; starter slots are not confirmed empty slots."

/**
 * Read-only Phase 14C evidence. The established draft-desk builders remain
 * the only authority for starter/FLEX and other-team need semantics.
 */
export const buildPlanConstraintsPresentationModel = ({
  userRoster,
  rosters,
  myRosterIndex,
  settings,
  draftPlan,
}: BuildPlanConstraintsPresentationModelParams): PlanConstraintsPresentationModel => {
  const rosterState = rosterStateFor(userRoster)
  const validRosterIndex = Number.isInteger(myRosterIndex)
    && myRosterIndex >= 0
    && myRosterIndex < rosters.length
  const leagueNeedsState: PlanConstraintsAvailability = !validRosterIndex
    ? "unavailable"
    : rosters.length <= 1 ? "empty" : "ready"
  const userSlots = userRoster
    ? buildDraftDeskRosterSlots(userRoster, settings)
    : []
  const leagueNeeds = validRosterIndex
    ? buildDraftDeskLeagueNeeds(rosters, myRosterIndex, settings)
    : []
  const plan = planFor(draftPlan)
  const value = {
    rosterState,
    rosterUnavailableReason: userRoster ? null : unavailableRosterReason,
    userSlots,
    leagueNeedsState,
    leagueNeedsUnavailableReason: validRosterIndex
      ? null
      : "Other-team needs are unavailable because the user roster index is outside the current league.",
    leagueNeeds,
    plan,
  }
  return {...value, fingerprint: fingerprintFor(value)}
}
