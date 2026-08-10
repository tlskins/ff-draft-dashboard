# Phase 10B realtime positional bests

Phase 10B is a bounded presentation slice of Phase 10. It enriches the
existing `positional_bests` decision-workspace view without changing advisor
calculation ownership, navigation arbitration, or the historical API.

## Source-of-truth boundaries

- `DraftRecommendationSet` remains the sole source of current recommendation
  candidates, their order, and their maximum-three limit.
- The first supplied candidate is preferred. Later supplied candidates are
  fallbacks. The presentation model preserves that order and applies only a
  defensive three-candidate render bound.
- Candidate evidence remains deterministic advisor evidence. The UI does not
  recompute score, selection, roster legality, survival, tier loss, or flags.
- `PlayerStatusCacheSnapshot` is the only status input to this surface.
  `recommendationPlayerStatusEvidence(...)` remains the filtering and ordering
  boundary for actionable status context.
- `BoardSettings` and the player rank records identify rank and tier sources;
  they do not change the active draft-board ranker.

## Rank and tier labeling

The supplied `positionRank` is labeled with the active draft-board source. A
custom position rank or tier is shown only when the player has actual custom
rank data for the active scoring mode. When the active tier differs from the
custom tier, or custom tier data is unavailable, the active tier is shown with
its source label. Projection tiers and ranges are explicitly labeled as
overlays and never presented as user tiers.

## Projection-range visualization

The presentation model normalizes finite floor, median, and ceiling values,
repairs reversed finite endpoints for display safety, preserves missing values
as unavailable text, and creates one deterministic PPG scale across the
displayed candidates. The focused SVG-free presentation uses a range bar and a
median marker plus numeric floor, median, and ceiling text. Equal, zero, empty,
and non-finite ranges fail safely without a charting dependency.

## Live-update semantics

The live comparison renders as soon as the active workspace view is
`positional_bests`; it does not wait for or trigger a historical request. When
the supplied recommendation set changes, the model and candidate cards replace
the previous display in supplied order. A removed candidate cannot retain the
comparison drawer. A polite screen-reader status announces recommendation-set
changes only when the live candidate identity/evidence key changes, not on
unrelated rerenders.

The desktop and mobile page paths receive the same recommendation and status
snapshot. Existing Phase 10A automatic, pinned, manual, and confirmed-Realtime
navigation semantics remain owned by `viewState` and its event arbitration.

## Player-status boundary

Only fresh actionable events selected by the existing status helper appear in
recommendation cards. Each displayed event retains source, confidence,
publication time when available, fetched time, staleness state, and
recommendation impact. Status is advisory context only: it does not reorder
candidates or change recommendation scores. Missing status providers leave
the deterministic recommendation surface usable.

## Historical drilldown behavior

The live comparison is independent of the existing bounded historical
analysis. Users can still choose a position, 1-, 3-, or 5-season window, and
scoring profile, then run the existing validated query manually. The returned
declarative chart, validated dataset, and player-comparison drawer remain
available. Picks do not automatically issue historical requests, and existing
historical results are not cleared by recommendation evidence updates unless
the active view actually changes.

## Deferred features

This slice explicitly defers:

- bye-week concentration;
- QB stack and handcuff flags;
- new player-status ingestion;
- cross-position valuation visualization;
- tier-landscape redesign;
- intra-position risk/reward redesign;
- human visual and assistive-technology acceptance.
