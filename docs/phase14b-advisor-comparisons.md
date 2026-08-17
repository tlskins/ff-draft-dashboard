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

## Shared Player Lab authority

The current comparison controller IDs are the default live shortlist and the
historical Player Lab selection. The superseded same-position 3–5-player
automatic seeding was removed, avoiding a second auto-selection implementation.
Player Lab can therefore compare the shared cross-position set. A three-player
set is required for its historical request, while a smaller live subset remains
visible and useful. Set changes only update controls; both historical API calls
remain behind the explicit **Run analysis** action and never block live advice.

## ESPN outlook contract and provenance

`Player.outlook` is a nullable `{text, source, season, observedAt}` object.
`behavior/playerOutlook.ts` accepts that canonical object and the existing
upstream ESPN parser's legacy `playerOutlook` text at the rankings ingestion
boundary. It strips markup/control characters, collapses whitespace, drops
blank or malformed evidence, bounds input work to 20,000 characters, and caps
rendered text at 1,000 characters. It never summarizes or synthesizes text.

Canonical source, season, and observation time are preserved when valid. A
legacy ESPN string receives only the enclosing ranking artifact's ESPN source,
season, and `cachedAt` observation provenance. Profile rendering labels a
matching artifact season normally, older evidence as prior-season, a future or
stale prior-season evidence, a future or mismatched season as not matching active rankings, and missing season as
unknown and not current. Missing outlook renders an explicit unavailable state.
Structured injury, suspension, transaction, recommendation-impact, confidence,
staleness, and structured-summary evidence remains separate and intact.

The authorized dashboard OpenAPI schema does not yet publish an outlook field;
generated types therefore remain generated and unchanged. The compatibility
ingestion path retains the upstream field when supplied, but the checked-in
ranking artifact contains no ESPN outlook evidence. Extending the sibling
Python API model/artifact/OpenAPI producer requires a separately authorized API
worktree and is a known integration limitation, not a hand edit to generated
dashboard types.

## Rollback boundary

The Phase 14A `NEXT_PUBLIC_DRAFT_DESK_ENABLED` flag continues to restore its
accepted Phase 13 desktop composition. It does not migrate comparison state.
A full Phase 14B rollback is a normal revert of the candidate commit: the state
is local and ephemeral, no storage key or backend record is created, and no
ranking/profile authority needs repair.

## Verification evidence

Completed in the isolated worktree on 2026-08-17:

- Focused Phase 14B plus relevant Phase 10/14A, ranking-authority, and
  persistence regression tranche: 22 suites, 194 tests, all passed.
- Full Jest: 96 suites total; 95 passed and 1 skipped. 628 tests total; 626
  passed and 2 skipped; 0 failures, 0 runtime errors, not interrupted.
- Generated API type check passed with `DRAFTY_OPENAPI_SCHEMA` set to the clean
  sibling API's `openapi/v1.json` (the isolated worktree has no default adjacent
  API checkout).
- TypeScript `--noEmit`, Next lint, production export, post-build fixture audit,
  and `git diff --check` passed. The build retained the repository's existing
  Browserslist-age and Tailwind purge-configuration warnings.

Deterministic captures were visually inspected and are kept as untracked review
artifacts, not release assets:

- `artifacts/phase14b/auto-outlook-1440x900.png`
- `artifacts/phase14b/pinned-outlook-1440x900.png`
- `artifacts/phase14b/auto-missing-outlook-1280x800.png`
- `artifacts/phase14b/pinned-focus-isolation-1280x800.png`

## Deferred limitations

- The sibling API producer addition described above is required before live
  API/embedded artifacts can regularly populate ESPN outlooks.
- Phase 14C owns round-aware run probabilities, insight scoring, margins, and
  hysteresis. This candidate uses no new opponent or value calculation.
- Phase 14D owns live extension replay, mobile bottom-sheet acceptance,
  responsive comparison churn, and final migration/removal decisions.
