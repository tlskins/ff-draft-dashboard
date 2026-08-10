# Phase 10E intra-position risk and reward comparison

Phase 10E is a bounded presentation and interaction candidate for the
`intra_position` decision-workspace view. It makes an immediately rendered,
currently available same-position shortlist useful while preserving the
existing manually run historical Player A / Player B workflow. It does not
change recommendation scoring, candidate selection, rankings, tier methods,
projection methods, navigation arbitration, historical schemas, or the Python
API. It does not mark Phase 10 complete.

## Live shortlist ownership and availability

- `behavior/analysis/intraPosition.ts` accepts the workspace's selected
  QB/RB/WR/TE position, the explicit `availablePlayers` collection, current
  board and fantasy settings, ranking summaries, and the already supplied
  player-status cache.
- The explicit availability collection is the sole live-availability source.
  The model never reads the full player library, historical results,
  recommendation candidates, or another position to fill the list.
- It filters to the selected position, de-duplicates player IDs, and renders
  at most three players. It reports the deduplicated selected-position total,
  visible count, and hidden count.
- These are currently available shortlist options, not deterministic advisor
  candidates. The UI does not call any entry preferred or fallback and does
  not claim that the advisor selected or ordered it.

## Ordering, rank, and tier authority

- The active board ranker owns shortlist order. Players sort by usable active
  positional rank; unranked players follow ranked players, with full name and
  player-ID tie-breakers. ADP, projection values, historical production, and
  status evidence do not reorder them.
- With the Custom board active, its actual custom rank naturally drives the
  order. With any other board active, the model does not silently substitute a
  custom rank.
- Each card labels the active positional-rank source honestly. Actual custom
  position rank and custom/user tier are shown only when the matching custom
  ranking data exists for the current scoring setting. The custom user tier is
  visually primary when present.
- The active board tier is displayed when custom-tier data is absent or
  differs from the active tier; its source label remains visible. No render
  changes the active board ranker or the underlying rank/tier data.

## Projection risk and reward context

- Existing `getAdvisorProjection(...)` output supplies the secondary
  projection tier and floor, median, and ceiling overlay. Floor is labeled as
  downside context, median as expected context, and ceiling as upside context.
- One deterministic PPG scale is shared across only the visible shortlist.
  Exact floor, median, ceiling, and projection-spread text accompanies every
  visual range. The spread is uncertainty context, not a risk score, reward
  score, composite score, confidence percentage, or calibrated confidence.
- Finite reversed endpoints are repaired only for display. Equal and zero
  ranges remain valid; missing and non-finite evidence is unavailable. Fixed
  point and median markers remain inside either scale endpoint.
- A null projection tier from `getAdvisorProjection(...)` makes its zero
  placeholders unavailable projection evidence. It never appears as a real
  zero-PPG projection. Projection tiers are always marked as overlay only and
  remain secondary to actual custom/user tiers.

## Status and deferred evidence

- The supplied `PlayerStatusCacheSnapshot` is the only status input. The
  surface uses `recommendationPlayerStatusEvidence(...)` unchanged, preserving
  selected actionable event source, publication time, fetched time, staleness,
  confidence, and recommendation-impact semantics.
- Status is advisory only and cannot change availability, shortlist order,
  ranks, tiers, or projections. Phase 10E does not add page-level status
  requests to populate the shortlist.
- The surface explicitly leaves bye-week, stack, handcuff, games-missed, role
  or depth-chart uncertainty, weekly-usage trend, injury diagnosis, news
  summaries, roster synergy, team/offense concentration, and age/decline
  evidence unavailable until a reliable structured contract exists. It does
  not fabricate a risk or confidence score.

## Live updates, drawers, and historical drilldown

- Availability, position, rank, tier, projection, and supplied status changes
  rebuild the shortlist deterministically without producing a navigation
  event. The Phase 10A automatic, pinned, pending, and confirmed-manual
  navigation controller remains the owner of workspace navigation.
- A live drawer closes if its player leaves the current visible shortlist or
  the selected position. A historical-result drawer has separate ownership and
  remains open across live-shortlist updates.
- The live surface emits one concise polite update only when its stable
  displayed-evidence fingerprint changes. The fingerprint includes position,
  counts, player identity/team, active/custom rank and tier values and sources,
  projection tier/range/spread, and displayed actionable status evidence.
  Equivalent rerenders are silent.
- Historical Player A and Player B continue to use the full eligible
  same-position library, independently of live availability. Live updates do
  not rewrite those selections or initiate a historical request. The existing
  1-, 3-, and 5-season controls; Standard, Half PPR, and PPR profiles;
  validated dataset; declarative season-grouped line chart; and comparison
  drawer remain manually runnable.
- The bounded intra-position historical query now requests games recorded,
  fantasy-points mean, P10 floor, P50 median, P90 ceiling, and fantasy-points
  standard deviation. It does not label games as games missed.

## Accessibility

- The shortlist is a semantic ordered list with a clear live heading, source
  labels, exact numeric range text, native keyboard-operable inspection
  buttons, and useful no-availability or unavailable-projection states.
- Visual range markers have text alternatives and endpoint-safe positioning;
  color is not the sole source of availability, rank, tier, status, downside,
  or upside meaning. Existing comparison-drawer focus management remains in
  use.
- The same availability, rank, tier, projection, and status inputs are passed
  to desktop and mobile workspaces. Human visual and assistive-technology
  acceptance remains unrecorded and is not claimed by this implementation.
