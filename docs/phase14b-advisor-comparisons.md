# Phase 14B advisor comparisons candidate

Status: implemented as a bounded dashboard candidate on 2026-08-17; awaiting
independent review and human feedback. Phase 14C probability work and Phase 14D
live-extension acceptance remain deferred.

## Ownership and selection policy

`behavior/advisorComparisonSet.ts` is the single pure selection model. The page
builds its automatic set once from the existing recommendation set, live
available-player array, and explicit targets. `useAdvisorComparisonController`
is the single UI state owner; it passes the current set to the compact live
surface and `AnalysisWorkspace`, including Player Lab. Profile focus is not an
input to either owner.

The first valid occurrence wins and the result is capped at three:

1. Existing deterministic recommendation candidates, in supplied advisor
   order. Their reason is **Recommended now**.
2. Remaining per-position recommendation candidates with a positive deferred
   tier loss or existing tier-cliff/exhaustion flag. They sort by
   `tierLossIfDeferred * (1 - survivalProbability)` descending, then position
   rank, fixed RB/WR/QB/TE order, and player ID. Their reason is **Tier cliff**.
3. Explicit targets, by target round ascending, active overall-or-position
   rank, fixed position order, and player ID. Their reason is **User target**.
4. The top active-ranked available player at each position, sorted by active
   overall-or-position rank, fixed position order, and player ID. Their reason
   is **Top QB/RB/WR/TE**.

Every candidate is re-resolved through the current available-player map. Blank
identity, unsupported position, missing active rank, terminal/ineligible
availability, duplicate, missing, drafted, and purged players fail closed. The
model never rescales or invents rank, projection, tier, role, availability, or
risk evidence.

## Material boundary and Auto/Pinned transitions

A material draft event is an add, removal, correction, or replacement in the
existing `draftHistory` pick array. Its key contains the occupied overall-pick
index and canonical player ID. It uses no timer, polling, hydration signal,
layout state, or profile focus. Auto also reconciles when the selected IDs or
their inclusion reason materially change. Equivalent input signatures do not
announce.

- Auto begins with the deterministic set and presents one restrained reason
  cue per player. One changed set is announced once in the comparison surface's
  polite live region. The embedded legacy cross-position live region is muted
  so it cannot duplicate that ownership.
- Choosing Pinned snapshots the current set. Pick/evidence updates continue to
  update the latest Auto result but cannot replace the pinned snapshot.
  Explicit unpin and one add-player affordance can edit it up to three.
- Choosing Auto immediately discards the manual snapshot and reconciles to the
  latest deterministic result. The comparison state is intentionally not
  persisted; no backend or browser migration is introduced.

The existing analysis-view Auto/Pinned state remains a separate navigation
owner. It controls which analysis view is visible, not which players are in the
comparison set.

## Shared live and historical authority

The ordered `comparisonController.items` array is the sole player identity
authority for **Players in play**, the live cross-position chart, historical
cross-position defaults, and Player Lab defaults. `AnalysisWorkspace` performs
no second selection. It joins existing recommendation evidence by selected ID;
a manually pinned player without that evidence remains in the requested slot
with active rank/tier and structured status where available, while advisor
score, projection, survival, replacement value, and recommendation-only fields
render as unavailable. It never substitutes a different player.

The historical query-scope signature is the JSON encoding of the ordered
selected IDs. When that signature changes, completed results and errors are
cleared, loading is cancelled logically by advancing the request generation,
and responses started under the old signature are ignored. Equivalent IDs
preserve results even if profile focus, layout, player metadata, or reason copy
changes. A three-player set is required for the bounded historical request, and
neither invalidation nor a new default set executes a request: both historical
API calls remain behind the explicit **Run analysis** action.

## ESPN outlook contract and provenance

The sibling Python API commit
`669764c4eebac24b7191f25e4a04526d93d8d2e4` publishes a nullable
`Player.outlook` model with `{text, source: "espn", season, observed_at}` through
ranking construction, cache/sync artifacts, `RankingsResponse`, and the checked
OpenAPI artifact. The dashboard hardening is the commit containing this
document, based on Phase 14B candidate `77cee9d`; its exact hash is reported in
the delivery handoff because a commit cannot contain its own hash.

Both producers and `behavior/playerOutlook.ts` strip markup/control characters,
collapse whitespace, drop blank or malformed evidence, bound input work to
20,000 characters, and cap rendered text at 1,000 characters. They never
summarize or synthesize text. The API uses the ranking artifact season and the
same timezone-aware observation timestamp used for `cached_at`. Its OpenAPI
field follows Python conventions (`observed_at`); generated dashboard types are
regenerated from that schema, and dashboard ingestion converts it to the domain
`observedAt` key.

Canonical source, season, and observation time are preserved when valid. A
legacy ESPN string receives only the enclosing ranking artifact's ESPN source,
season, and `cachedAt` observation provenance. Profile rendering labels a
matching artifact season normally, older evidence as prior-season, a future or
mismatched season as not matching active rankings, and missing season as
unknown and not current. Missing outlook renders an explicit unavailable state.
Structured injury, suspension, transaction, recommendation-impact, confidence,
staleness, and structured-summary evidence remains separate and intact.

## Rollback boundary

The Phase 14A `NEXT_PUBLIC_DRAFT_DESK_ENABLED` flag continues to restore its
accepted Phase 13 desktop composition. It does not migrate comparison state.
A full Phase 14B rollback is a normal revert of the candidate commit: the state
is local and ephemeral, no storage key or backend record is created, and no
ranking/profile authority needs repair.

## Verification evidence

Completed in the isolated worktree on 2026-08-17:

- Dashboard named Phase 10/14 regression tranche: 13 suites and 98 tests, all
  passed.
- Dashboard full Jest: 96 suites total; 95 passed and 1 skipped. 634 tests
  total; 632 passed and 2 skipped; 0 failures.
- Python API focused outlook/model/ranking/OpenAPI tranche: 26 tests passed.
- Python API full unit suite: 144 tests passed with 0 failures.
- Generated dashboard API type regeneration and check passed with
  `DRAFTY_OPENAPI_SCHEMA` set to the isolated API worktree's amended
  `openapi/v1.json`; generated declarations were not hand-edited.
- Dashboard TypeScript `--noEmit`, lint, production build/post-build audit, and
  `git diff --check` passed. API compile/static checks, JSON validation, and
  `git diff --check` passed.

Deterministic captures were visually inspected and are kept as untracked review
artifacts, not release assets:

- `artifacts/phase14b/hardening-auto-1440x900.png`
- `artifacts/phase14b/hardening-pinned-1440x900.png`

## Deferred limitations

- Deployment still requires the two independently reviewable commits to be
  integrated in dependency order (API schema/producer, then regenerated
  dashboard client). Existing ranking artifacts remain valid and expose null
  until the next normal ESPN-backed artifact refresh.
- Phase 14C owns round-aware run probabilities, insight scoring, margins, and
  hysteresis. This candidate uses no new opponent or value calculation.
- Phase 14D owns live extension replay, mobile bottom-sheet acceptance,
  responsive comparison churn, and final migration/removal decisions.
