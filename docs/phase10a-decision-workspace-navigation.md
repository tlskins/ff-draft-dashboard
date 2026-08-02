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

The workspace also invalidates an in-flight historical request when the active
view changes. A response from that prior request cannot repopulate the new
view.

## Persistence boundary

The existing `drafty-analysis-view-state` local-storage key remains the only
browser persistence boundary. It stores the validated navigation view, pin
state, source label, and explanation under `schemaVersion: 1`. Advisor
revision tracking and pending recommendations are runtime state and are not
persisted, so a remounted workspace starts a fresh advisor event stream.
Legacy valid state is normalized; bad, malformed, or unsupported state falls
back to the default automatic workspace without throwing.

## Later Phase 10 work

Later slices still need to enrich the individual four-view visualizations with
the product-spec evidence surfaces, complete narrow-viewport and human
screen-reader usability review, and record the manual visual acceptance pass.
Those slices must preserve deterministic calculation ownership, user-tier
authority, the realtime contracts, and the Phase 9 evidence boundary.
