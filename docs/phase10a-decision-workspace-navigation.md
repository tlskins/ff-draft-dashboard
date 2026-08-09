# Phase 10A decision-workspace navigation

Phase 10A is the bounded navigation and interaction slice of Phase 10. It
does not complete the four visualization redesign.

## Navigation semantics

- **Automatic navigation** is the default unpinned mode. The advisor may
  change the active view when it presents a newer recommendation. The active
  view still reports whether its current selection came from the advisor or a
  manual user action.
- **Pinned navigation** keeps the current view stable. Manual view selection
  remains available and does not unpin the workspace. Advisor updates are
  retained as a newest-only pending recommendation and are shown in a
  non-destructive banner.
- **Manual selection** is an explicit transition to one of the four views:
  positional tier landscape, realtime positional bests, cross-position
  comparison, or intra-position comparison. A real view change clears the
  previous view's result, error, and comparison drawer state.
- **Confirmed Realtime proposals** are bounded manual navigation events. A
  confirmed event may change a pinned view without unpinning it, clears any
  older pending advisor recommendation, and is acknowledged after the
  workspace handles it. A same-view confirmation updates the manual context
  without discarding a valid result.
- Reviewing/adopting a pending recommendation is a manual transition and
  preserves pinned navigation. Returning to automatic navigation applies the
  newest pending recommendation once, then clears it.

## Revision and idempotency rules

The pure controller in `behavior/analysis/viewState.ts` treats advisor
recommendations as ordered events. A recommendation is accepted only when its
revision is newer than the last processed revision. Equal or older revisions
are ignored, so a stale prop rerender cannot undo a later manual selection.
While pinned, each accepted event replaces the pending event; only the newest
event can be reviewed or applied after unpinning. An explanation-only update
for the current view updates the explanation and announcement without
invalidating the valid analysis result.

Automatic recommendations and confirmed-manual proposals use separate event
identities. Automatic events are ordered by revision within a draft-session
stream. Confirmed events use the stable Realtime proposal ID plus a monotonic
confirmed-event sequence. Accepting a confirmed event records the automatic
revision it supersedes, so acknowledging the confirmation cannot expose that
same automatic revision and immediately undo the manual choice. The next
automatic revision may navigate normally when unpinned or become the
newest-only pending advice when pinned. A confirmed event clears stale pending
advice even when the effective view does not change.

The newest 50 acknowledged confirmed proposal IDs are retained within a
bounded runtime window, matching the Realtime proposal collection limit. An
acknowledged ID cannot be queued or acknowledged again while it remains in
that window, including an `A → B → A` sequence. The collection is runtime-only
and resets with the draft-session stream; an unacknowledged queued proposal is
not recorded as consumed.

The page owns the acknowledgement boundary and resolves one event object for
both desktop and mobile render paths. Realtime confirmation opens the analysis
surface appropriate to the active viewport; both paths therefore receive the
same event kind, identity, ordering, and acknowledgement behavior. Once an
event is acknowledged, unrelated rerenders or workspace remounts do not turn
it back into a live event. Starting a different draft session resets both
runtime clocks without combining their numeric values.

The workspace also invalidates an in-flight historical request when the active
view changes. A response from that prior request cannot repopulate the new
view.

## Persistence boundary

The existing `drafty-analysis-view-state` local-storage key remains the only
browser persistence boundary. It stores the validated navigation view, pin
state, source label, and explanation under `schemaVersion: 1`. Advisor
revision tracking, confirmed-event identities, stream identity, and pending
recommendations are runtime state and are not persisted. A valid version 1
record restores its navigation base, and a valid legacy record with no
`schemaVersion` remains supported. Any explicitly present version other than
numeric `1`—including malformed versions—falls back to the default workspace.
Malformed JSON, invalid runtime revisions, and invalid base state also fall
back without throwing.

## Later Phase 10 work

Later slices still need to enrich the individual four-view visualizations with
the product-spec evidence surfaces, complete narrow-viewport and human
screen-reader usability review, and record the manual visual acceptance pass.
Those slices must preserve deterministic calculation ownership, user-tier
authority, the realtime contracts, and the Phase 9 evidence boundary.
