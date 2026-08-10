# Phase 10D cross-position comparison

Phase 10D is a bounded presentation and interaction candidate for the
`cross_position` decision-workspace view. It makes the current deterministic
advisor candidates immediately useful without changing recommendations,
rankings, tiers, navigation arbitration, historical schemas, or the Python API.
It does not mark Phase 10 complete.

## Candidate and evidence ownership

- `DraftRecommendationSet.candidates` is the only live candidate source. Its
  existing ordering and maximum-three contract are preserved exactly. Candidate
  zero is labeled preferred; later supplied candidates are labeled fallbacks.
  The surface never fills a missing position from the player library,
  `availablePlayers`, or any other source.
- The deterministic advisor owns candidate creation, selection, ordering,
  supplied score, roster role, replacement value, lineup value, tier loss,
  survival, run probability, tier-boundary probability, and flags. The
  presentation model neither recreates nor decomposes the supplied score.
- `PlayerStatusCacheSnapshot` and
  `recommendationPlayerStatusEvidence(...)` remain the sole status boundary.
  Only fresh, actionable selected events appear, with their source,
  publication/fetch timestamps, staleness, confidence, and recommendation
  impact intact. Status remains advisory and cannot change the score or order.

## Rank, tier, and projection labels

The position rank is labeled with the active draft-board source. Actual custom
position rank and custom tier appear only where a custom record exists for the
active scoring setting. The active tier remains visible when it differs from
the custom tier or custom data is absent. Projection tiers are always marked
as overlay only; they never masquerade as user tiers.

The supplied deterministic advisor score is explicitly labeled supplied. It is
displayed as-is when finite rather than being formatted from a reconstructed
valuation. Projection floor, median, and ceiling are separate uncertainty
context, not a fabricated confidence percentage or new risk score. The shared
PPG range scale uses the established safe normalizer: missing and non-finite
values are unavailable, finite reversed endpoints are repaired only for visual
display, and equal or zero ranges remain valid.

## Comparison presentation

Each candidate exposes the supplied immediate lineup, positional, wait-risk,
and applicable bench evidence. Exact numeric text accompanies every metric.
Visual metric bars use a small deterministic scale for that metric across the
currently displayed candidates only. They have no cross-metric meaning and
are never called a score, probability, or projection. Missing or malformed
numeric evidence is unavailable rather than coerced; valid zero stays visible
as zero.

Shared context shows current pick, next user pick, picks before that pick,
league size, and scoring format. A concise source statement explains that
selection, ordering, score, and evidence are deterministic-advisor supplied.

## Live updates, drawers, and historical drilldown

The live comparison renders immediately when `cross_position` is active and
does not wait for or initiate a historical request. Candidate/status updates
replace the model in supplied order without creating navigation events, so
Phase 10A automatic, pinned, and confirmed-manual semantics remain intact.
The live candidate/evidence fingerprint produces one polite update only for a
material order, evidence, source, or status change; equivalent rerenders are
silent.

Live and historical player-drawer ownership are separate. If a player opened
from a live cross-position card is removed from the supplied candidate set, the
drawer closes. A historical-result drawer is retained across live candidate
updates. The historical cross-position controls still select their existing
historical scope, scoring profile, and 1/3/5-season window, then call the same
bounded validated query only after **Run analysis**. Those historical players
are explicitly distinct from the live recommendation candidates.

## Accessibility

The live candidates use a semantic ordered list, heading hierarchy, clear
preferred/fallback labels, visible text for numeric ranges and metrics, and
native keyboard-operable inspection buttons. Visual bars and projection ranges
have text alternatives and do not rely on color for position, preference,
urgency, status, or roster role. Existing drawer focus behavior is retained.
Useful unavailable and empty states remain available on narrow viewports.
Human visual and assistive-technology acceptance is still deferred.

## Deferred work

Phase 10D explicitly defers:

- new advisor weights or weight-editing UX;
- new valuation, confidence, or expected-tier forecasting models;
- bye-week, stack, handcuff, or new roster-fit signals;
- new player-news or status ingestion;
- intra-position risk/reward redesign;
- Realtime copilot refinement;
- human visual and assistive-technology acceptance.
