import {
  AnalysisViewId,
  AnalysisViewNavigationEvent,
  AutomaticAnalysisViewEvent,
  ConfirmedManualAnalysisViewEvent,
} from "./viewState"


export interface AnalysisViewEventArbitrationState {
  streamId: string
  lastAcknowledgedAutomaticRevision: number | null
  acknowledgedConfirmedEventIds: string[]
  nextConfirmedSequence: number
  pendingConfirmedEvent: ConfirmedManualAnalysisViewEvent | null
}

export interface ConfirmedAnalysisViewProposal {
  eventId: string
  view: AnalysisViewId
  explanation: string
  supersedesAutomaticRevision: number
}

export interface AnalysisViewEventsByLayout {
  desktop: AnalysisViewNavigationEvent | null
  mobile: AnalysisViewNavigationEvent | null
}

export const MAX_ACKNOWLEDGED_CONFIRMED_EVENT_IDS = 50

export const createAnalysisViewEventArbitrationState = (
  streamId: string,
): AnalysisViewEventArbitrationState => ({
  streamId,
  lastAcknowledgedAutomaticRevision: null,
  acknowledgedConfirmedEventIds: [],
  nextConfirmedSequence: 1,
  pendingConfirmedEvent: null,
})

const isValidRevision = (value: number): boolean => (
  Number.isSafeInteger(value) && value >= 0
)

const forStream = (
  state: AnalysisViewEventArbitrationState,
  streamId: string,
): AnalysisViewEventArbitrationState => state.streamId === streamId
  ? state
  : createAnalysisViewEventArbitrationState(streamId)

/**
 * Queue a confirmed proposal as a distinct manual event. Its local sequence
 * orders confirmed events only; automatic revisions remain a separate clock.
 */
export const queueConfirmedAnalysisViewEvent = (
  current: AnalysisViewEventArbitrationState,
  streamId: string,
  proposal: ConfirmedAnalysisViewProposal,
): AnalysisViewEventArbitrationState => {
  const state = forStream(current, streamId)
  if (
    !proposal.eventId
    || !isValidRevision(proposal.supersedesAutomaticRevision)
    || !proposal.explanation
    || (
      state.pendingConfirmedEvent?.eventId === proposal.eventId
      || state.acknowledgedConfirmedEventIds.includes(proposal.eventId)
    )
  ) return state

  return {
    ...state,
    nextConfirmedSequence: state.nextConfirmedSequence + 1,
    pendingConfirmedEvent: {
      kind: "confirmed_manual",
      streamId,
      eventId: proposal.eventId,
      sequence: state.nextConfirmedSequence,
      view: proposal.view,
      explanation: proposal.explanation,
      supersedesAutomaticRevision: proposal.supersedesAutomaticRevision,
    },
  }
}

const resolveAnalysisViewEvent = (
  current: AnalysisViewEventArbitrationState,
  automaticEvent: AutomaticAnalysisViewEvent,
): AnalysisViewNavigationEvent | null => {
  const state = forStream(current, automaticEvent.streamId)
  if (state.pendingConfirmedEvent) return state.pendingConfirmedEvent
  if (!isValidRevision(automaticEvent.revision)) return null
  if (
    state.lastAcknowledgedAutomaticRevision !== null
    && automaticEvent.revision <= state.lastAcknowledgedAutomaticRevision
  ) return null
  return automaticEvent
}

/**
 * The parent resolves once, then gives both responsive render paths the exact
 * same event identity. A confirmed manual event takes priority until it is
 * acknowledged; otherwise only an unacknowledged automatic revision is live.
 */
export const arbitrateAnalysisViewEventsByLayout = (
  state: AnalysisViewEventArbitrationState,
  automaticEvent: AutomaticAnalysisViewEvent,
): AnalysisViewEventsByLayout => {
  const resolved = resolveAnalysisViewEvent(state, automaticEvent)
  return {desktop: resolved, mobile: resolved}
}

export const acknowledgeAnalysisViewEvent = (
  current: AnalysisViewEventArbitrationState,
  event: AnalysisViewNavigationEvent,
): AnalysisViewEventArbitrationState => {
  const state = forStream(current, event.streamId)
  if (event.kind === "automatic") {
    if (!isValidRevision(event.revision)) return state
    if (
      state.lastAcknowledgedAutomaticRevision !== null
      && event.revision <= state.lastAcknowledgedAutomaticRevision
    ) return state
    return {
      ...state,
      lastAcknowledgedAutomaticRevision: event.revision,
    }
  }

  if (
    !event.eventId
    || !isValidRevision(event.sequence)
    || !isValidRevision(event.supersedesAutomaticRevision)
  ) return state

  const pendingMatches = state.pendingConfirmedEvent?.eventId === event.eventId
  const alreadyAcknowledged = state.acknowledgedConfirmedEventIds.includes(
    event.eventId,
  )
  if (alreadyAcknowledged && !pendingMatches) return state

  const acknowledgedConfirmedEventIds = alreadyAcknowledged
    ? state.acknowledgedConfirmedEventIds
    : [...state.acknowledgedConfirmedEventIds, event.eventId].slice(
        -MAX_ACKNOWLEDGED_CONFIRMED_EVENT_IDS,
      )

  return {
    ...state,
    lastAcknowledgedAutomaticRevision: Math.max(
      state.lastAcknowledgedAutomaticRevision ?? -1,
      event.supersedesAutomaticRevision,
    ),
    acknowledgedConfirmedEventIds,
    pendingConfirmedEvent: pendingMatches
      ? null
      : state.pendingConfirmedEvent,
  }
}
