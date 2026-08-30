# Phase 19: season-scoped mock archive and deterministic review

Status: implementation and automated validation complete; production
acceptance remains pending. Phase 18B custom-origin WebMCP activation remains
deferred.

## Product outcome

Drafty retains each completed mock as immutable evidence, presents a transparent
roster scorecard, and can replay bounded alternatives such as RB-WR instead of
WR-RB. The calculations are deterministic. WebMCP exposes the same evidence so
an agent can synthesize tradeoffs without inventing picks, availability, tiers,
or score deltas.

## Season authority

Fantasy season is explicit persisted data, not a value inferred from the wall
clock at read time.

- Canonical rankings, targets, and completed mocks are isolated by season.
- The active season comes from the validated rankings snapshot selected by the
  dashboard and is sent explicitly to every authenticated persistence request.
- Existing unscoped authenticated profile data migrates non-destructively to
  season 2026. The legacy document remains available for rollback, but is no
  longer authoritative after migration.
- Browser storage and synchronization markers use the same season namespace.
- A new season starts with a separate rankings/targets profile and mock archive.
  Prior seasons remain readable and must never be silently rebased onto a new
  provider player universe.
- A completed mock records its season and rejects a fixture whose captured
  rankings provenance conflicts with that season.

## 19A: authenticated archive contracts

Persist a bounded roster-only form of the existing
`RecordedCompletedDraftReplay`. Do not store calibration forecast/shadow
evidence in the user archive. A record contains:

- schema version, stable mock ID, owner-scoped season, platform, completion
  time, league settings, user draft slot, and source title;
- the complete canonical board, including explicit non-advisor K/DST picks;
- the captured player identity, position, team, configured ADP, positional
  rank, user tier, projection range, and replacement level inputs;
- the targets, ranking source, and ADP source that were authoritative when the
  draft completed;
- an input fingerprint so duplicate completion observations are idempotent.

Firestore owns one document per mock beneath the verified Firebase user and
season. The API never accepts a UID. Browser-local persistence retains a
bounded offline copy and retries the bounded queue after authentication, on a
later mount, and when the browser returns online. Archive records are
immutable; recalculated analyses are derived from their frozen inputs.

## 19B: transparent scorecard

The first scorecard reports category scores and a visible weighted composite
from 0 to 100. Initial weights are configuration constants and can be made
user-editable later.

1. **Tier capital:** best tier and count by tier for QB/RB/WR/TE, with starters
   and bench separated. User tiers are authoritative.
2. **Starter quality:** legality, starter completeness, projected starter
   points, and projected starter points above replacement using the existing
   optimized-lineup calculation.
3. **Bench upside:** captured ceiling above replacement.
4. **Target conversion:** both secured / total saved targets and secured /
   targets attainable at at least one user pick.
5. **Handcuff value:** a deliberately labeled v1 configured-ADP backfield
   proxy: the first same-team RB is treated as the starter and the second as
   the backup, and the backup must fall within the first ten rounds. It is not
   presented as an official depth-chart relationship.

Every category exposes its numerator, denominator, inputs, and explanation.
Missing relationship or projection evidence produces `unavailable`, never a
fabricated zero.

## 19C: deterministic counterfactual replay

Counterfactuals accept either a bounded position sequence (for example
`["RB", "WR"]`) or exact player overrides at user picks.

- At an overridden current boundary, the alternative must have been unselected
  on the recorded board at that pick.
- At a later user pick, a player is forecast available only when configured
  overall-pick ADP is present, `ADP >= overallPick`, and the simulated branch
  has not already selected the player.
- Opponent picks retain their recorded slots and players when available.
- If the user took an opponent's later recorded player, that opponent receives
  the next undrafted player by configured ADP, with stable player ID as the
  final tie-breaker. The replacement and collision reason are retained.
- A bounded beam search returns at most three alternatives and cannot violate
  roster capacity or hard lineup legality. Search limits are contract fields
  and regression-tested.
- Results distinguish recorded facts, ADP availability assumptions, opponent
  collision replacements, and optimizer choices.

## 19D: review experience

Add a season-grouped mock history and a post-draft review surface. The default
comparison shows actual versus best alternative, score/category deltas, a
pick-by-pick decision ledger, and positional tier outcomes. Users can choose a
position path or exact player override and inspect up to three alternatives.

## 19E: WebMCP

Expose compact read-only tools:

- `drafty_list_mock_drafts`: list bounded mock summaries for an explicit
  season;
- `drafty_review_mock_draft`: return the actual scorecard and up to three
  deterministic counterfactuals for a mock ID, optional position sequence,
  and up to four exact user-pick player overrides;
- `drafty_open_mock_review`: optionally open one selected review in the UI.

The review tool returns structured evidence and never asks an LLM to calculate
availability or scores. Agent prose is synthesis only. Tool output is bounded,
labels untrusted source copy, and identifies unavailable evidence explicitly.

## 19F: gates

- legacy 2026 profile migration and strict 2026/2027 isolation;
- owner isolation, authentication, optimistic mutation, idempotency, payload
  size, archive-list bounds, and offline queue recovery;
- immutable replay capture and source-season mismatch rejection;
- score/category golden cases, including no targets and unavailable handcuff
  evidence;
- ADP threshold boundaries, snake ownership, collision replacement, no
  duplicate players, stable tie-breaking, and deterministic repeatability;
- actual-versus-alternate UI accessibility and WebMCP schema/task-corpus
  regressions.

Exit gate: a signed-in user completes a mock, reopens it on another device,
sees the same frozen scorecard, generates the same three bounded alternatives,
and lets a compatible WebMCP agent explain the result from structured evidence.
