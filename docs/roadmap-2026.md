# Post-Phase-7 execution roadmap

The [product specification](ff-draft-harness-product-spec.md) remains the
product and architecture truth. This document is the execution and status
truth: it records what is implemented,
what still needs operational verification, and the bounded work planned after
Phase 7. It is intentionally concise and does not replace the specification.

## Phase 0-7 status

| Phase | Status | Remaining check or boundary |
| --- | --- | --- |
| 0. Contracts and replay foundation | Complete | No pending foundation implementation. |
| 1. Historical data foundation | Complete | No pending implementation. |
| 2. Rankings and tiers | Core implementation complete | Phase 10 accepted tier clarity; refresh operations and ranking-editor refinement move to Phase 12. |
| 3. Manual analysis workspace | Complete | Phase 10 completed and accepted the Decision Cockpit, Position Tiers, and Player Lab redesign. |
| 4. Deterministic live advisor | Complete | The campaign has 5/5 qualifying recorded mocks and 5/4 distinct target slots, with no coverage gaps. |
| 5. Realtime text and voice | Implementation complete; product track deferred | Credential-backed Realtime and voice-quality work is not on the current release critical path. |
| 6. Status enrichment | Complete | No pending implementation. |
| 7. Hardening | Complete | Narrow-viewport acceptance passed in Phase 10; VoiceOver-specific validation remains deferred to the release audit. |

“Complete” means the implementation and its recorded or automated gates are
complete as stated in the source documents. Manual or credential-backed checks
are called out separately and are not silently treated as passed.
Those remaining checks are operationally unverified; the active phases and
explicitly deferred tracks below are the current execution order.

The live opponent model remains frozen v1. Offline challengers and the bounded
residual run-only shadow capture are observation-only. Only two existing
fixtures carry labeled opponent forecast evidence, and the new challenger has
no prospective accuracy evidence yet. Offline tuning and in-sample artifact
parity are not prospective evidence and do not establish promotion readiness.
Exact-player prediction is not a promotion gate; position/run calibration is.

## Active phases 8-13

### Phase 8: Program reset and stable integration baseline

Dependency: the completed Phase 0-7 implementation and the current
refactor/realtime-foundation source state.

Reset the program around this roadmap, retire the completed foundation slice as
current work, and establish a stable integration baseline. Phase 8B owns the
integration, merge, and tag of that baseline; Phase 8A is documentation-only
and does not merge or push.

Phase 8A documentation reset is complete at
`993af66426a44c32407c2566cbe8ba85a36b75b6`, whose expected parent is
`a447eadd041a23f8a7c6461899430560a81df4e9`.

The verified Phase 8B integration-baseline candidate on
`codex/phase-8b-integration-baseline` received root-orchestrator review and
was fast-forward integrated into `refactor/realtime-foundation`. The annotated
baseline tag `phase8-integration-baseline-2026-08-01` is created as part of
this closeout, so Phase 8 is complete. The remaining credentialed and manual
operational checks remain unverified as recorded in the
[Phase 8 integration baseline](baselines/phase8-integration.md); no
application behavior changed.

Exit gate: complete. The integration baseline is root-orchestrator reviewed,
reproducible, fast-forward integrated, and annotated-tagged; the roadmap and
session-packet workflow are the active planning references; and no application
behavior was changed by the reset.

### Phase 9: Prospective positional-run shadow validation

Dependency: the stable Phase 8 baseline, the frozen v1 forecast, and the
bounded run-only shadow boundary.

Build the evaluator and a low-token capture workflow, collect varied newly
completed mocks, and assemble a promotion dossier. Pair frozen v1 and shadow
forecasts at the same valid pre-pick boundaries, score position and run
calibration only on newly labeled horizons, and report coverage and
fail-closed reasons. The dossier is evidence for a later decision, not a
promotion action in Phase 9.

Exit gate: the predeclared prospective position/run gates pass on eligible new
evidence, the varied-format coverage and paired-boundary integrity are
documented, and no invalid or retrospective labels are counted. If evidence
is unavailable or fails, the result is explicitly evidence-blocked; v1 remains
live.

Phase 9A evaluator foundation is implemented and hardened: the immutable,
hash-bound prospective campaign contract, canonical-validator-backed paired
run-shadow evaluator, complete-window and marginal-coverage gates, deterministic
report command, focused adversarial regression coverage, and capture-only
handoff are in place. The evidence-free policy amendment (policy v2) requires
only the `QB1-RB2-WR2-TE1-FLEX1-BENCH7` roster shape. Other structurally valid
shapes remain supported but prospectively uncalibrated and informational; they
cannot satisfy calibrated fixture, subgroup, aggregate, or promotion-gate
requirements. The checked-in campaign admits no new fixture, so Phase 9 remains
evidence-blocked pending completed mocks and a later promotion dossier; this
foundation does not mark Phase 9 complete or change the live model.

### Phase 10: Decision-workspace UX refinement

Dependency: the Phase 8 integration baseline and the existing Phase 2/3
implementation. Outstanding manual usability and visual reviews may inform
this work.

Refine the decision workspace across the tier landscape, realtime positional
bests, cross-position comparison, intra-position comparison, and
automatic/pinned navigation. Preserve authoritative advisor, ranking,
projection, opponent-model, and API ownership; preserve user-tier authority
and the distinction between automatic navigation and a user pin. Bounded
presentation-derived estimates may support the workspace when their inputs,
fallbacks, and limitations are explicit and they do not reorder or replace the
authoritative advisor output.

Bounded Phase 10A slice completed: the workspace now has explicit automatic
and pinned navigation semantics, ordered/idempotent advisor transitions,
bounded confirmed-manual Realtime arbitration with desktop/mobile parity,
schema-enforced persistence, newest-only pending recommendations while pinned,
accessible selected-state and live announcements, and regression coverage. See
`docs/phase10a-decision-workspace-navigation.md`. Individual visualization
enrichment and human visual/usability acceptance remain open.

Bounded Phase 10B candidate: enrich only the realtime positional-bests view
with the existing ordered maximum-three deterministic recommendation set,
honest active/custom rank and tier labels, projection-range comparison,
actionable player-status context, and existing comparison-drawer access. Keep
the historical positional drilldown manually runnable and independent of live
updates; preserve Phase 10A navigation arbitration and all calculation
ownership. See `docs/phase10b-realtime-positional-bests.md`. This candidate
does not mark Phase 10 complete.

Bounded Phase 10C candidate: enrich only the positional tier-landscape view
with an explicit currently available `PlayerRanks` surface, fixed QB/RB/WR/TE
lanes, honest custom/active tier authority, bounded density and projection
overlays, and supplied deterministic opponent-forecast evidence through the
next user pick. Keep the historical positional drilldown manually runnable;
preserve Phase 10A navigation and all ranking, recommendation, tier, and
opponent-model ownership. See `docs/phase10c-positional-tier-landscape.md`.
This candidate does not mark Phase 10 complete.

Bounded Phase 10D candidate: enrich only the cross-position view with the
existing ordered maximum-three deterministic recommendation candidates,
supplied roster/replacement/tier/survival/run evidence, honest rank/tier
labels, shared projection ranges, actionable status context, and existing
comparison-drawer access. Keep the historical cross-position drilldown
manually runnable and explicitly separate from the live candidates; preserve
Phase 10A navigation and all calculation ownership. See
`docs/phase10d-cross-position-comparison.md`. This candidate does not mark
Phase 10 complete.

Bounded Phase 10E candidate: enrich only the intra-position view with an
immediately available maximum-three live shortlist drawn solely from explicit
currently available same-position players, active-rank ordering, honest
active/custom rank and tier authority, shared projection risk/reward ranges,
and supplied actionable status context. Keep historical Player A / Player B
comparison manually runnable and explicitly separate from the live shortlist;
preserve Phase 10A navigation and all availability, ranking, recommendation,
tier, projection, and historical-query ownership. See
`docs/phase10e-intra-position-comparison.md`. This candidate does not mark
Phase 10 complete.

Bounded Phase 10F acceptance and redesign candidate: the original four-view
integration gate covers navigation arbitration, ownership, live/history
separation, drawer and live-region behavior, responsive parity, and the
unchanged Phase 9 promotion boundary. The human-directed run recorded the
original checklist, exposed P2 usability failures, and approved a consolidation
into Decision Cockpit, Position Tiers, and Player Lab. The redesign made
material presentation-model and interaction changes, including bounded
next-option and waiting-cost estimates; it was not a calculation-neutral
restyle. See `docs/phase10f-cross-view-acceptance.md`.

Phase 10G hardening candidate: the deterministic maximum-three advisor list
remains authoritative for **Preferred now**, its fallback order, and its
supplied detailed evidence. The four Decision Cockpit positional leaders are
separate rank-driven analyses of explicitly available QB/RB/WR/TE players, not
four advisor recommendations. The preferred candidate's position selects the
initial displayed scenario when possible; fixed QB/RB/WR/TE lane order is the
deterministic fallback. The next-option estimate walks rank order only through
players with supplied survival evidence and stops at the first uncovered rank;
the waiting-cost estimate compares supplied projection medians across the next
visible board/user tier and uses supplied boundary/current-tier evidence for
exhaustion. Both are bounded display-derived estimates: missing evidence stays
unavailable, and shared projection-tier medians can produce `No modeled tier
drop` even when board/user tiers differ. Neither estimate changes advisor or
ranking ownership. Player Lab now compares three to five manually selected
same-position players, discloses pools below three, and keeps historical runs
manual. User-facing navigation aliases both internal positional view IDs as
Position Tiers while retaining the internal four-ID state/event boundary.

The resumed post-rewrite human run passed narrow/mobile behavior across all
three workspaces, non-VoiceOver keyboard controls, the visible Player Lab
drawer routes, and automatic/pinned Position Tiers alias behavior. The operator
explicitly deferred every VoiceOver-specific check as an accepted non-blocking
limitation; those table and live-announcement observations are not a human pass
and do not constitute WCAG certification. Confirmed-manual Realtime remains an
environment limitation rather than a pass because no credentialed live draft
or mock was started. With no Phase 10 acceptance blocker remaining, the Phase
10 exit gate is satisfied. The accepted redesign and hardening close at
annotated milestone `phase10g-decision-workspace-acceptance-2026-08-12` and
Phase 10 is complete. Phase 11 has not begun.

Exit gate: the four views and their transitions have a coherent acceptance
review, pinned and automatic navigation behave as specified, and manual
usability/visual checks are recorded. Authoritative advisor, ranking,
projection, opponent-model, and API behavior remains unchanged; any bounded
presentation-derived calculation is documented, tested, and prevented from
changing that ownership.

### Phase 11: 2026 season data readiness

Dependency: the accepted Phase 10 workspace, the existing local-first API, and
the Phase 1 nflverse import/repository foundation.

Move draft-season data readiness ahead of optional model work. Current local
state on August 12, 2026 is a 436-player season-2026 rankings snapshot cached
July 30, an 8,364-player nflverse identity catalog cached July 30, completed
weekly stat seasons 2021-2025, and no imported production status events. The
dashboard still hardcodes completed historical windows through 2025. Treat
current rankings/rosters, completed historical seasons, and an in-progress
weekly season as three distinct data products.

#### Phase 11A: season rollover and source-freshness foundation

- Make the API the source of truth for imported weekly seasons, completed versus
  current/partial season state, rankings season/cache time, identity-catalog
  freshness, status-source availability, and identity misses.
- Replace dashboard hardcoded completed-season arrays and labels with validated
  API metadata while preserving an honest empty/unavailable state.
- Add a deterministic, non-mutating refresh preflight that reports proposed
  source URLs, source availability, current versus candidate fingerprints,
  expected season classification, and the imports that would run.
- Keep 2021-2025 as the default completed historical window. Phase 11A does not
  import mutable 2026 data, silently include a partial season in historical
  distributions, or change user ranks and tiers.

Exit gate: API and generated dashboard contracts agree; missing or partial
sources fail closed; the dashboard renders API-owned season/freshness metadata;
the preflight is deterministic and non-mutating; focused cross-repository tests,
type checks, builds, and contract generation pass.

Phase 11A implementation result: the API now owns a versioned data-readiness
contract, explicit reviewed completed-through policy, metadata-only weekly
season/source queries, status-source evidence states, and a pure deterministic
refresh preflight with an immutable read-only CLI collector. The dashboard uses
the generated contract to construct exact completed-season windows and renders
loading, unavailable, reduced-history, no-history, and partial-season exclusion
states. The five-season default remains 2021-2025, and non-contiguous imports
remain exact season lists rather than inferred ranges. See
`docs/phase11a-season-rollover.md`. This result does not import 2026 mutable
data and does not begin or complete Phase 11B, 11C, or Phase 11 as a whole.

#### Phase 11B: reviewed 2026 preseason refresh

- Refresh the ESPN 2026 player universe, ranks, and ADP; refresh the nflverse
  identity catalog; and import available 2026 weekly rosters and transactions.
- Attempt structured injury ingestion only when its source exists. Record an
  unavailable provider without blocking rankings or drafting.
- Produce a reviewable before/after report for player additions/removals, rank
  changes, team changes, source fingerprints, and unresolved identities before
  replacing the local release artifact.
- Preserve browser-owned custom positional ranks and tiers and keep source rank
  refreshes distinct from user authority.

Stage A preview completed from frozen August 12 provider candidates. The
non-mutating preflight proposed only rankings, catalog, roster, and transaction
actions; injuries were recorded unavailable and 2026 weekly stats remained
intentionally skipped. The disposable preview and review reports are complete,
with historical/user-data preservation, logical replay idempotency, and focused
Flask smoke passing. The canonical reconciled report is under
`phase-11b-2026-08-12/reconciled-preview-r1` and includes every bounded identity
addition, removal, and retained change; browser-owned ranks and tiers were
out of scope and not touched, without an unsupported browser byte-proof claim.

After explicit Stage A approval, Stage B created a fresh candidate-release copy
from the original Phase 11A artifacts and replayed only the frozen A bytes. Its
rankings, path-normalized logical SQLite state, semantic report evidence, and
completed Parquet history agree with the approved R1 preview. Exact replay is
idempotent. The full API gate passed 97/97; the full dashboard gate passed 74
runnable suites and 452 runnable tests, and its optimized build, lint/type
validation, static export, API-types check, candidate API/dashboard startup, and
required live smokes passed. No 2026 weekly stats were imported, browser-owned
custom rank/tier code remained unchanged, and optional injury unavailability
remains nonblocking. The candidate is preserved under
`phase-11b-2026-08-12/candidate-release-rehearsal-v1`.

After separate approval, the reviewed rankings and SQLite candidate were
atomically promoted into the authoritative API checkout. Historical source
paths were rebound to the authoritative, hash-verified 2021–2025 Parquet
artifacts; all 15 normalized logical tables remained equal to the reviewed
candidate and SQLite integrity passed. A fresh provider-free replay was
idempotent and did not mutate the promoted artifacts. The post-promotion API
gate passed 97/97, the dashboard gate passed 74 runnable suites and 452 runnable
tests, API types and the optimized static export passed, and all required live
HTTP smokes returned 200. Integration and promotion evidence is preserved under
`phase-11b-2026-08-12/post-promotion-evidence-20260813T123143Z`. Phase 11B's
historical technical gate passed for that candidate. The two local checkpoint commits exist:
API `959bcc5295ddb5eb28df07ecceedf01255808792` and dashboard
`d247a30bb59caf99283e346be091171c5424b5ce`; tag, push, deployment, and the
separately scoped Phase 11C remain gated.

That 436-player promotion is superseded for player-universe semantics. The
stable-universe correction was rebuilt from post-Phase-12 checkpoints using
only frozen evidence and the pre-promotion Phase 11A backup. Its 455-player
artifact retains all 19 ESPN-absent players, separates ESPN source presence from
normalized availability, removes stale ESPN rank/ADP from active calculations,
and preserves current ESPN lineage for catalog-suppressed players. Frozen RLS
evidence for Brandon Aiyuk is a regression case: he remains present/ranked but
is not automatically recommended. The correction changes no reviewed SQLite
rows relative to the promoted database; its disposable database adds only the
empty Phase 12 ranking-source observation table. The correction is integrated
on the authoritative branches at API `1a30e29` and dashboard `d4837de`. Its
post-integration gate passed 124 API tests, 20 focused dashboard regressions,
generated API-type freshness, lint, the optimized production build, and a
scripted local HTTP smoke of the 455-player store. Phase 11B is complete; Phase
11C has not begun. See `docs/phase11b-2026-preseason-refresh.md`.

Exit gate: the reviewed refresh is reproducible, provenance is recorded, the
API and dashboard smoke against the refreshed local store, unresolved mappings
are explicit, and no optional provider can block drafting.

#### Phase 11C: in-season weekly ingestion

Begins when nflverse publishes 2026 regular-season player-week data. Import it
incrementally as the current partial season, expose it as an explicit selectable
scope, and never blend a small partial sample into the default three-to-five
completed-season distributions. After the season is complete and verified, roll
the default five-season window from 2021-2025 to 2022-2026.

Exit gate: repeated weekly imports are idempotent and provenance-preserving;
partial-season labeling is visible; missing weeks are not treated as zero; and
the completed-season rollover requires an explicit reviewed state change.

### Phase 12: ranking and tier operations

Dependency: Phase 11A metadata contracts and the reviewed Phase 11B preseason
snapshot.

Make rank sources refreshable and auditable from the local-first product,
surface source age and failure independently, and refine the frontend editor for
user-owned positional ranks and tiers. Rebuild derived rank/tier/projection
overlays only from versioned inputs. User ranks and tiers remain primary and are
never overwritten by a provider refresh. Current-roster considerations remain
secondary flags rather than the primary player-value order.

Exit gate: source refresh and derived-overlay boundaries are explicit; user
edits survive refresh, export/import, and restart; stale/unavailable sources are
visible; and the ranking/tier editor receives bounded human usability review.

#### Phase 12A: provider-free ranking-source visibility and preview

The additive, provider-free implementation is complete and checkpointed at API
`70f093a4daa599104310b407f16d41ac730c2036` and dashboard
`7ccb0fa71d34bad031fd2bf337a0a2008fef1b1d`. It separates server-owned provider identity from
SQLite transport; independently preserves attempt, success, failure, retrieval,
season, scoring, fingerprint, and count evidence; retains last-good data on
failure; and offers list/detail plus bounded inline deterministic read-only
refresh preview. Preview reports differences and affected profile player IDs;
unavailable/stale sources remain visible and `/players/latest` remains ungated.
It grants no apply/promotion authority and mutates no rank/profile/artifact,
overlay, or recommendation state.

The executable implementation boundary is eleven paths: API `openapi/v1.json`,
`app/__init__.py`, `app/api/ranking_sources.py`,
`app/repositories/ranking_sources.py`, `app/services/ranking_sources.py`,
`tests/test_ranking_sources.py`, and `tests/test_openapi_contract.py`; dashboard
`behavior/api/rankingSources.ts`, `behavior/api/schema.d.ts`,
`__tests__/rankingSources.test.ts`, and
`docs/phase12a-ranking-source-contract.md`. This roadmap amendment makes the
working closure boundary twelve paths but is not executable implementation.
Its implementation started from API `959bcc5295ddb5eb28df07ecceedf01255808792`
and dashboard `d247a30bb59caf99283e346be091171c5424b5ce`; its accepted checkpoints are the
newer hashes above on `refactor/realtime-foundation`.

Two consecutive frozen focused gates passed on unchanged hashes: API 35/35 and
dashboard 4 suites, 11/11 each run; `api:types:check` is current, and
`git diff --check` plus static syntax/OpenAPI audit passed. A fresh independent
Sol integrated review returned GO with no P1/P2, relying on the reported gates
rather than rerunning them. The correction budget is consumed: two semantic
rounds (timezone-aware timestamp validation and metadata-only
diff/`would_change` semantics) plus one generated-types continuation.

Phase 12B1 defines the canonical profile-v2 validation with one 500-player
active-plus-unresolved ceiling, pure legacy adapters, and a deterministic
read-only rebase preview whose HTTP surface binds caller assertions to
server-held Phase 12A rank evidence and player-position membership, as described in
`docs/phase12b-profile-v2-rebase.md`. Its authority correction adds separately
retained last-success provider attribution, conservative legacy backfill, and
bounded timezone-aware validation of retained success/retrieval timestamps.
The technical implementation is complete and locally checkpointed at API
`40da04065b896fbce4d2e6968704ae8963c4156e` and dashboard
`971ac7a54e36df7a1a2fd6b61bb6120a71f0c5b6`, followed by dashboard build
hardening `fe020286a8a89186c37af5adb1e058862163555a`. Its implementation boundary
is exactly 20 paths (10 API and 10 dashboard); the original frozen gates
recorded API 34/34, dashboard three suites 21/21, current generated types,
byte-identical fixtures, and clean path/status/hash/index audits. The
independent checkpoint audit also passed API 115/115, dashboard 76 suites and
470 tests (two existing skips), lint, Python compilation, generated-type
freshness, and—after the compile-only hardening correction—the focused 21/21
and optimized production build. The retained nonblocking P3 is bounded
timezone-aware `datetime.fromisoformat` ISO-8601 acceptance rather than strict
RFC 3339. The exact boundary, hashes, correction history, and rollback
procedure are recorded in `docs/phase12b-profile-v2-rebase.md`.

Phase 12A remains checkpointed at API `70f093a4daa599104310b407f16d41ac730c2036`
and dashboard `7ccb0fa71d34bad031fd2bf337a0a2008fef1b1d`; Phase 12B1 is independently
reviewed and checkpointed. Phase 12B2a now adds the first bounded persistence
slice at API `ce211c60b0f4b27bfa18e0937c8657f156d4bcb0`: serialized, additive,
idempotent SQLite storage for canonical v2 revision history and restart-safe
metadata/undo/redo pointers, with legacy rows retained unchanged and the v1
repository/HTTP contract preserved. API authority hardening at
`7422fb3cf667933bba69a09dd454eff41f532bb8` adds a durable discriminator:
existing profiles remain legacy-authoritative, native v2 profiles are
v2-authoritative, and an explicit v2 revision atomically promotes a legacy
profile. Legacy mutations reject after promotion, preventing loss of canonical
tombstones or provenance. The dashboard adds unwired pure migration and storage
helpers that fail closed for corrupt, unsupported, or malformed claimed-v2
input; retain the legacy source and a rollback record; read-verify the
destination; and reload identically after simulated restart. Its hardened
rollback is compare-and-swap: source or destination divergence returns a
structured conflict without overwriting newer user data. The exact boundary,
validation evidence, and rollback procedure are recorded in
`docs/phase12b-profile-v2-rebase.md`.

Phase 12B2b is implemented in isolated API and dashboard worktrees. It adds the
explicit additive `/v1/ranking-profiles-v2` list/read/create/revision/undo/redo
contract with generated dashboard types and an adapter that remains local-first
when the API is absent or unavailable. Legacy v1 routes and payloads are
unchanged; v2 responses expose `mutation_authority`, and v2 conflicts and
validation failures are bounded structured errors. Production portable export
now emits version 2 with the canonical `ranking_profile` (order, tiers,
tombstones, scoring, and provenance), while the explicit portable-v1 adapter
remains accepted and malformed claimed-v2 input never falls back to v1.
Startup checks committed browser authority first; only an initial legacy
migration waits for the trusted player universe. That migration verifies the
production legacy key `ff-draft-custom-rankings`, preserves source and backup,
read-verifies the canonical destination, and reports bounded
migrated/current/unavailable/rejected status without overwriting divergent
values. The Phase 12B2b hardening pass adds a versioned browser authority
record bound to the canonical profile fingerprint and a recoverable
write-ahead journal. Once authority is established by migration, portable-v2
import, API save, local fallback save, profile selection, undo, or redo,
startup loads the exact validated canonical snapshot and no longer
reinterprets the retained legacy source. Normal commits preserve the original
legacy bytes and migration backup. Import commits canonical data, authority,
favorites, and an optional draft plan atomically with exact readback; failures
restore prior values or retain an explicit recoverable journal. Corrupt
authority, canonical data, backup, journal, or impossible mixed state fails
closed, while rejected API conflicts and validation errors leave browser state
byte-identical. Rebase apply remains a later independent Phase 12B slice. Phase 12A,
12B1, and 12B2a grant no ranking-source refresh/apply/promotion, profile rebase
apply, overlay, recommendation, provider, deployment, or Phase 11C authority.

The final Phase 12B2b UI reconciliation removes the duplicate desktop and
mobile legacy Save controls and the legacy Load/Delete menu. The shared
ranking-profile create/save-revision control is the only visible save
authority. Desktop and mobile Clear commit `canonical_empty` before reloading
or reporting success, retain the legacy source and migration backup, and stay
empty after restart. Remaining legacy-key access is read-only and limited to
initial migration evidence plus the pre-authority startup fallback; established
canonical authority is never replaced from that evidence.

Phase 12B2b integration order is additive API first, followed by the dashboard
consumer and browser-authority hardening together. The pre-hardening dashboard
consumer is not a deployable endpoint. Full rollback reverses that order:
dashboard hardening and consumer together first, then the additive API.

#### Phase 12C1a: provenance-checked Harris candidate

The checked-in artifact labels the aggregate snapshot as season 2026, but its
214 Harris records are semantically the same records produced by the July 30
full rebuild and do not match Harris Football's current 2026 pages. The live
August 15 RB page, for example, begins Gibbs, Robinson, Taylor, and McCaffrey,
while the artifact begins Barkley, Robinson, Gibbs, and Henry. Aggregate
snapshot metadata must therefore not be treated as source-specific freshness.

Phase 12C1a adds a read-only Harris collector that requires all five source
pages to visibly identify the requested season, requires and normalizes each
page's published update timestamp, enforces bounded position counts, records
raw-page and semantic candidate fingerprints, matches against the stable
player universe, and reports additions, removals, field-level changes,
team differences, and unresolved or ambiguous identities. It neither updates
the release artifact nor writes a ranking-source observation or user profile.

The first two live collections were semantically identical at candidate
fingerprint `b1051a7f…e0e81f2`: 252 source players, 248 matched, 66 additions,
32 removals, 182 changed retained players, no unchanged retained player, four
unmatched source players, and no ambiguous match. At the 12C1a boundary,
promotion remained blocked pending review of removals and unresolved
identities; Phase 12C2 records the later approval and promotion. Scoring-aware
source observations and profile rebase apply remain later bounded slices.

#### Phase 12C2: 2026 Harris and FantasyPros API refresh

Status: implemented and promoted locally on 2026-08-16. The user authorized
the current 2026 provider baseline after verifying Harris against its official
site. The API now has a deterministic joint preview/apply command: Harris keeps
the five-page provenance checks from 12C1a, while FantasyPros reads its two
official server-rendered standard/PPR draft payloads without browser automation
or credentials and rejects season/type/scoring/date/count drift. The old
headed parser's rest-of-season overall source is retired.

The first promotion writes 248 Harris and 373 FantasyPros ranks into the stable
455-player universe, removes 32 and 9 obsolete provider-rank objects without
removing players, nulls provider ADP/projection/tier fields that the rank-only
sources did not refresh, and leaves custom profiles and user tiers untouched.
Both candidates must validate before an
atomic file replacement; failure preserves the byte-identical last-good API
artifact. The dashboard remains API-first and its release fallback is synced to
the promoted artifact. API responses now require revalidation with a content
ETag, so the file-backed API serves the new artifact without restart.

Daily collection is an external scheduler concern, not a Flask background
thread. A repository wrapper and launchd example are landed but intentionally
not installed. See `docs/phase12c2-provider-ranking-refresh.md`. Scoring-aware
source observations/profile rebase, provider freshness UI, and a Mongo-backed
promotion adapter remain later bounded work; the legacy single-overall-rank
observation contract is not overloaded.

Production ranking delivery is intentionally lightweight. Rankings do not
need in-session polling, snapshot history, source-version browsing, or a
ranking database. The operator's computer may run the existing daily refresh
and upload the one validated JSON artifact to static/object storage; Drafty
loads it only at startup and retains its checked-in fallback. If a production
API is deployed for Drafty's other capabilities, prefer serving that same file
from `GET /players/latest` instead of adding a second ranking service. A
single-server persistent file, S3-compatible object, or equivalent durable
blob is sufficient. Provider failure continues to preserve the last-good
artifact. Scheduler installation, artifact upload, and the final production
URL remain deployment tasks rather than a product-data redesign.

### Phase 13: draft-season release readiness

Dependency: Phases 10-12 are integrated. Frozen prediction v1 is an acceptable
release model while Phase 9 remains evidence-blocked; neither prediction-v2 nor
Realtime GPT promotion is a release prerequisite.

Status: completed locally on 2026-08-16 through Phase 13C. The deterministic
extension package, provider-free preflight, human-directed Chrome/ESPN mock,
completed-draft recovery, API persistence repair, and clean-tree release gates
passed. VoiceOver and physical-device verification remain explicitly deferred;
deployment and push remain separate release decisions.

Complete extension selector smoke, startup/recovery/migration checks, one full
local mock acceptance, refreshed-data/API smoke, fallback and rollback checks,
and the deferred manual VoiceOver/device audit. Verify that current rankings,
status availability, completed historical windows, and any partial 2026 data
are labeled consistently across the release.

Exit gate: all release checks pass, operational and accessibility limitations
are documented, frozen v1 rollback remains tested, and no unresolved
release-critical blocker remains.

#### Phase 13A: provider-free automated preflight foundation

Phase 13A adds a dashboard-only, non-destructive command and versioned JSON
report for the release checks automation can honestly own. Its full evidence
mode validates the MV3 extension manifest/assets and checked-in selector/mock
test boundary; coordinates the existing startup, migration, portability,
fallback, recovery, data-readiness, player-availability, generated-type,
lint, type, and production-build gates; records explicit dashboard/API Git
inputs; and checks byte-identical dashboard/API ranking artifacts with stored
season/cache metadata. It performs no network/provider request, browser run,
server startup, data mutation, extension packaging, deployment, push, or tag.

The current manifest/archive version gap is reported as a release-blocking
stale packaged-extension boundary rather than silently accepted or repaired.
Human browser acceptance, the local live mock, VoiceOver/device checks,
deployment/tag/push, and Phase 11C/external-data decisions remain unrun and
must not be represented as passed. Frozen prediction v1 remains acceptable;
Phase 9 remains evidence-blocked and Realtime GPT/voice is deferred. This
preparatory slice does not complete Phase 13 or waive separate Phase 12 rebase
apply, source promotion, or ranking-editor work.

#### Phase 13B: deterministic extension package

Phase 13B closes the previously reported packaged-extension boundary with a
repository-local deterministic ZIP builder. It derives the archive name from
the unchanged MV3 manifest version, emits the manifest and every local
manifest-referenced asset at the ZIP root in stable manifest order, preserves
the extractor-before-content-script ordering, and never silently overwrites an
archive. The tracked `0.0.0.8` package is byte-reproducible from unchanged
source bytes and is validated by Phase 13A for tracked ZIP readability,
semantic manifest equality, and referenced-asset byte parity. It does not
change extension permissions/matches, begin browser acceptance, or complete
Phase 13.

#### Phase 13C: live acceptance and advisor-persistence hardening

Phase 13C closes the release blocker found during the human-directed 0.0.0.8
Chrome/ESPN acceptance. The full standard mock captured 167 unique
QB/RB/WR/TE events without duplicates; the remaining 25 provider-board picks
were intentionally excluded K and D/ST selections. Completed-draft refresh and
reselection reconstructed the modeled roster without duplicates. The external
MetaMask extension could still trigger Next's development error overlay, so
the acceptance used the production export to isolate Drafty runtime behavior.

The API now advertises `PUT` for allowed local CORS origins, matching the
existing recommendation and opponent-forecast routes. The dashboard replaces
its unbounded persistence promise chain with a latest-state coordinator:
equivalent rerenders are ignored, materially changed evidence is retained,
queued intermediate states coalesce to the latest snapshot, and a failed
unchanged snapshot is not retried on every render. Unit, type, lint, production
build, real preflight, and live local API replay gates cover the repair. See
`docs/phase13c-advisor-persistence-hardening.md` for the closeout evidence and
rollback boundary.

### Phase 14: integrated draft desk and visual redesign

Dependency: the accepted Phase 13 live draft path and Phase 10 analytics
models. Realtime GPT/voice remains deferred and is not required for this work.
Status: Phase 14A implemented, visually accepted, and integrated on 2026-08-17.
Phase 14B was independently reviewed, hardened, and integrated with its API
producer on 2026-08-17. Live-extension draft acceptance remains assigned to
Phase 14D. Phase 14C was integrated and deployed on 2026-08-20; its remaining
browser and migration acceptance is folded into the broader Phase 16 closeout.
Realtime GPT/voice remains deferred.

Replace the current mutually exclusive standard-layout versus analysis-page
interaction with one responsive draft desk. The rankings board, live draft
state, deterministic recommendations, roster context, tier/run pressure, and
historical comparison must remain simultaneously reachable without page
navigation. Treat the existing analytics presentation models as trusted inputs;
this phase changes composition and interaction, not recommendation, opponent,
tier, projection, or ranking authority.

Use an approachable trading-terminal visual language: dense but calm,
high-contrast tabular data, restrained semantic color, compact workspace
panes, and optional expansion for deep analysis. Avoid neon-finance styling,
independent card grids, and permanent display of every metric. Preserve the
existing accessible table semantics, keyboard operation, live-region
boundaries, responsive behavior, and reduced-motion behavior.

The accepted desktop composition has three center panes with stable roles but
user-swappable placement: one mandatory rankings pane; one player profile and
history pane that follows board focus; and one deterministic insight pane that
selects the strongest material analysis not already represented. Rankings use
mutually exclusive Position and ADP-round modes. Position uses paired RB+WR or
QB+TE lanes; tier is embedded in each player card and the standalone rankings
tier-map mode is removed. Best Available and Targets Visualization remain
reachable through the established ADP subview selector. The insight pane keeps
candidate comparison and the existing cross-position market evidence visible;
urgent run outlook remains a state of modeled evidence rather than new
round-aware probability calculation.

The fixed header becomes a compact application bar. Configuration, source
selection, extension/mock links, imports, and other setup operations move to a
drawer or pre-draft setup surface. The fixed footer retains an always-visible
current-pick/round/next-user-pick strip and adds a secondary toggle between
Current round, My roster, and League needs. My roster begins as a horizontal
starter-slot summary with expandable vertical detail. League needs reports the
number of other teams still missing each explicit starter slot; FLEX remains
separate from QB/RB/WR/TE starter counts and observed counts remain visually
distinct from modeled run probabilities.

#### Phase 14A: shared shell, pane state, and design-system foundation

- Introduce the compact application bar and move existing configuration into
  an accessible drawer without changing setting ownership or draft locks.
- Turn the existing footer into a two-level draft dock: the pick/round/next-pick
  tape is permanent, while Current round, My roster, and League needs are
  user-selected modes. Compute roster/league-needs summaries deterministically
  from existing settings and rosters; do not change opponent forecasts.
- Establish the three center-pane shell and explicit pane-placement state. The
  rankings pane is mandatory; initial placement follows the accepted rankings /
  profile / insight order, and a bounded swap control may reorder panes.
- Render existing rankings, player context, and accepted Phase 10 surfaces in
  the shell without redesigning their internal calculations or introducing a
  new insight-selection algorithm in this slice. Primary visual targets are
  1440px and wider, then compact desktop at 1280–1439px; below 1280px retain
  task-focused/single-pane behavior. Keep cross-position charts structurally
  visible, including their ranges, markers, replacement, tier, and modeled
  survival/run evidence.
- Establish typography, spacing, density, color tokens, table/row states,
  chart styling, borders, elevation, focus rings, and motion rules before
  rewriting individual views.
- Remove the desktop-only `analysisOpen` replacement-page interaction behind a
  feature flag while retaining an accepted Phase 13 rollback path.
- Cover wide desktop and narrow laptop; preserve the accepted mobile layout in
  this slice except for shared token changes that are proven non-regressive.

#### Phase 14B: advisor-owned comparison sets

Status: independently reviewed, hardened, and integrated on 2026-08-17. See
`docs/phase14b-advisor-comparisons.md`.

- Seed the comparison surface automatically from the maximum-three live
  recommendation candidates; never require search/dropdown selection before
  useful analysis appears.
- Build a bounded comparison pool from preferred-now candidates, top available
  positional alternatives, imminent tier-cliff players, and explicit user
  targets. Deduplicate deterministically and disclose why each player is in
  play.
- Support `Auto` and `Pinned` modes. Auto updates only on a material draft
  event; pinning freezes the set while picks continue. One-click row actions,
  keyboard shortcuts, and a single add-player affordance remain available for
  manual overrides.
- Use the same automatic set for live cross-position comparison and as the
  default historical Player Lab query. Historical API execution remains
  explicit and does not block live evidence.
- Keep board focus independent: focus updates the player profile/history pane,
  while only an explicit pin/compare action changes a pinned comparison set.
- Add a provenance-preserving player profile contract. ESPN `playerOutlook` is
  already present in the upstream parser model but is not retained in the
  active player artifact; carry a bounded source/season/observed-at outlook and
  existing structured status/news evidence into the profile. Do not add LLM
  summarization in this phase.

#### Phase 14C: round-aware run market and deterministic insight controller

Status: integrated and deployed on 2026-08-20 at implementation commit
`06b5b7c`. Development-fixture acceptance and automated production smoke
passed; live-extension and human acceptance remain Phase 14D. See
`docs/phase14c-insight-deck.md` for the registered-view, authority, rollback,
and verification record.

- Extend the opponent forecast presentation/model boundary from only the next
  user-pick window to exactly two bounded buckets: frozen-v1 positional
  evidence before the next user turn, then a clearly provisional static-board
  estimate before the following turn. Tier simulation uses the static board,
  full bounded available pool, and at most two tiers per lane without
  double-counting players.
- Build the cross-position market from four positional lanes that combine tier
  depth, survival, round-aware run evidence, and observed other-roster starter
  needs while clearly labeling observed versus modeled evidence. FLEX remains
  unallocated rather than inferred as RB/WR demand.
- Score candidate-comparison and cross-position/run insights deterministically.
  Switch only on material draft events, require a significance margin, dwell,
  and deduplication, use a stable tie-break, announce through one deck owner,
  and respect session-local per-slot pins until Auto is restored.
- Keep a compact three-player comparison available in the insight pane,
  including rank/tier authority, role, projection range, survival/run evidence,
  and one-line inclusion rationale. Use the committed Phase 14B comparison set;
  frozen v1, recommendations, and presentation estimates remain non-authority
  for promotion or model replacement.
- The desktop deck is rollback-gated by
  `NEXT_PUBLIC_PHASE14C_INSIGHT_DECK_ENABLED=false`, which restores the accepted
  Phase 13/14A inline analysis workspace without a backend migration. Player
  Lab remains a manually selected workspace view, not a directly opened route.

#### Phase 14D: responsive acceptance and migration

Status: not begun. It owns the remaining browser/visual/human acceptance for
the Phase 14C implementation and does not treat synthetic replay or focused
tests as live-extension acceptance. Realtime GPT/voice remains deferred.

- Validate no-navigation drafting, automatic comparison churn, pin/unpin,
  keyboard flow, screen-reader table structure, and live announcements during
  replay and a human-directed mock.
- Preserve mobile's task-focused modes while exposing the same automatic
  shortlist in a bottom sheet; do not shrink the full desktop terminal onto a
  phone.
- Remove superseded layout controls only after parity is demonstrated. Keep a
  feature-flagged rollback to the accepted Phase 13 layout through closeout;
  preserve the Phase 14C deck rollback until this acceptance is complete.

Exit gate: a user can monitor the board, understand the current recommendation,
compare the players genuinely in play, inspect tier/run context, and open a
historical deep dive without leaving the primary draft workspace or manually
assembling an initial comparison set.

### Phase 15: stateless production release boundary

Status: completed and deployed on 2026-08-20 ahead of Phase 14C. This phase
does not replace or complete the remaining Phase 14 product work. See
`docs/phase15-stateless-production-release.md` for release evidence and the
rollback boundary.

Deploy the static dashboard at its existing Vercel origin and serve published
rankings, status evidence, readiness metadata, and bounded historical queries
from a public Google Cloud Run service. The first production API is explicitly
read-only, scales to zero, has no persistent disk or OpenAI credential, and
ships only a generated runtime bundle. Browser storage remains authoritative
for draft sessions, plans, advisor state, and custom ranking profiles.

- Separate API reads from every persistence capability in the dashboard.
  A public API host must never implicitly enable draft-session, advisor,
  ranking-profile, or Realtime writes.
- Generate a disposable runtime bundle from trusted local artifacts. Remove
  and vacuum user draft/profile rows, retain only the published data required
  by allowed read routes, and prove the bundle remains valid after relocation.
- Run the API in a production-enforced read-only mode with an explicit route
  allowlist, immutable SQLite access, origin-scoped CORS, and fail-closed
  configuration checks.
- Deploy Cloud Run in `us-east1` with zero minimum and one maximum instance,
  then compile its HTTPS URL and disabled mutation flags into the Vercel build.
- Gate release with the complete dashboard/API regressions, Phase 13 release
  preflight, production API smoke checks, and public dashboard availability.
  A later live ESPN extension acceptance can also satisfy Phase 14D's deployed
  live-path requirement; VoiceOver remains separately deferred.

Exit gate: the public dashboard reads current 2026 rankings/status/history
from a healthy scale-to-zero API while all personal draft/profile state remains
local, blocked mutation routes fail closed, and both deployments have a
documented rollback path.

### Phase 16: read API and adaptive insight convergence

Status: integrated and deployed on 2026-08-20. See
`docs/phase16-read-api-insight-convergence.md`.

Dependency: the deployed Phase 14C deck and Phase 15 stateless read API.
Realtime GPT/voice and unrelated feature work remain deferred until this phase
passes its exit gate.

- Centralize published rankings, readiness, ranking-source metadata/details,
  player status, historical comparison, and validated historical queries in a
  typed, bounded application read cache with deduplication, TTLs, cancellation,
  race protection, and explicit provenance states.
- Expand the closed three-slot registry to cover live cross-position and
  intra-position decisions, current and two-turn markets, historical risk and
  production, rank/tier disagreement, actionable status, plan/roster
  constraints, and manual source diagnostics.
- Turn queued alternatives into manual controls while preserving session pins,
  deterministic Auto scoring, view deduplication, one announcement owner, and
  the Phase 14C rollback.
- Keep custom ranks/tiers, deterministic recommendations, frozen forecasts,
  and roster logic authoritative. API evidence remains explanatory and cannot
  silently promote, tune, reorder, or rescore those decisions.
- Consolidate remaining Phase 14D browser/migration acceptance into the Phase
  16 production closeout, including all registered views and live read states.

Exit gate: every user-facing production read contract is either visibly
consumed or explicitly operational-only; every registered compact insight can
be manually selected and pinned and every Auto-eligible insight can be chosen
deterministically from ready evidence without leaving the draft desk; all
automated, replay, visual, live API, production browser, deployment, and
rollback gates pass while Realtime remains disabled. **Passed at dashboard
implementation commit `823cbc4` with Cloud Run revision
`drafty-read-api-00002-r7r`.**

Post-closeout amendment: the focused-player profile now consumes one bounded,
cached weekly historical query and deterministically presents a scoring
density, season-faceted weekly heatmap, or weekly trend with manual pins and
honest local fallbacks. The generic renderer now enforces type-specific
density and heatmap semantics. See
`docs/phase16-profile-history-hookup.md`.

### Phase 17: WebMCP agent interface

Status: Phases 17A and 17B are implemented. Phase 17C's deterministic corpus,
evaluator, payload budgets, progressive fallback, and production token boundary
are implemented; the production origin is enrolled and configured in Vercel,
and the token-bearing production deployment is verified. Native compatible-
agent discovery and invocation remain open.
Realtime GPT/voice remains deferred.

Expose a bounded imperative WebMCP surface over Drafty's existing state and
commands so compatible browser agents can configure the workspace, navigate
rankings/profile/insight views, search players and licensed analyst notes, set
targets, and edit positional ranks without DOM actuation. WebMCP remains a
progressive enhancement; the human UI and canonical local/cloud profile remain
authoritative. See `docs/phase17-webmcp-agent-interface.md` for the proposed
tool catalog, security boundary, Codex compatibility caveat, and 17A-17C exit
gates.

Phase 17A registers five page-owned read/navigation/configuration tools and one
insight-deck tool, with strict validation, bounded untrusted search output,
cancellation/lifecycle cleanup, shared human/agent state, and unsupported-
browser progressive enhancement. The full dashboard gate passes 133 suites and
842 tests, lint, TypeScript, and the optimized build.

Phase 17B adds four bounded page-owned write tools for one-player target
add/update/remove, safe custom-rank editing start/resume, one-player positional
rank moves, and canonical save/finish. The commands reuse the existing local
target/profile stores and authenticated cloud reconciliation, preserve live-
draft and purge locks, reject unavailable target additions and unsafe source
switches, and expose no bulk-clear or draft-pick operation. The expanded full
gate passes 133 suites and 844 tests plus lint, TypeScript, and the optimized
build. Chrome inspector enumeration and live execution of the natural-language
task corpus remain pending in Phase 17C.

Phase 17C now has a six-journey natural-language corpus, reproducible trace
evaluator, catalog/output-budget regressions, and optional validated first-party
origin-trial meta injection. The local Chrome fallback probe correctly reports
unsupported with zero tools while the testing flag is disabled. TypeScript,
lint, the optimized build, and the expanded full gate of 135 suites and 850
tests pass. The testing flag was subsequently enabled in Chrome 150, but the
current Codex Chrome-control surface exposes neither WebMCP discovery nor tool
invocation and its page-inspection channel timed out with the flag active. The
native six-journey run therefore remains an inspector or future-agent gate, not
a recorded Drafty failure. The exact Vercel origin was registered on August 30,
2026, and its expiring token was added to the Vercel production environment;
the stable production alias now returns HTTP 200 with exactly one valid token
meta tag. Native tool discovery/invocation remains deferred to Chrome's Model
Context Tool Inspector or a compatible agent surface. See
`docs/phase17c-webmcp-acceptance.md`.

### Phase 18: authenticated profile production closeout

Status: Phase 18A is implemented and production-accepted on 2026-08-30 for
desktop bootstrap, mobile adoption, mobile-to-desktop target propagation, and
explicit conflict resolution. The real extension-fed first-pick sync-lock
observation remains pending; its deterministic transition regression passes.
See `docs/authenticated-profile-sync.md`.

#### Phase 18A: desktop/mobile sync acceptance

- Prove the first desktop upload, clean mobile adoption, and a mobile target
  mutation against the production Firestore record.
- Force a real two-device divergence and prove neither copy is overwritten
  until the user selects **Use cloud copy** or **Keep this device**.
- Keep an unresolved conflict visually stable. Dashboard commit `5d2db14`
  removes apply-callback identity from synchronization authority and freezes
  the conflict boundary until an explicit choice.
- Pause every cloud read/write after a live draft begins. Automated coverage
  proves the synced-to-draft-active transition; observe the same state during
  the next extension-fed first pick rather than manufacturing a production
  draft event.
- Preserve independent feature-flag rollback for the dashboard sync client and
  Cloud Run profile endpoint.

Exit gate: one Google account can carry canonical ranks and targets between
desktop and mobile, concurrent changes fail closed behind an explicit choice,
and a live draft cannot accept or publish a cloud profile. All gates pass
except the final live extension-fed lock observation.

## Deferred product tracks

### Prediction-v2 promotion decision

Phase 9 remains evidence-blocked pending eligible prospective position/run
labels. Promotion is deferred and does not block Phases 11-13. Promote only if
the predeclared prospective gates pass; otherwise retain frozen v1 and record
the evidence still needed. Exact-player prediction is not a promotion gate.

### Realtime GPT text and voice quality

The Phase 5 implementation and Phase 7 credential-free safety gates remain in
the codebase, but credentialed browser/device smoke, model-versioned transcript
evaluation, and voice interruption/timing work are explicitly deferred until
after the local-first data, ranking, and release path is stable. The
deterministic advisor, confirmation boundary, and outage fallback remain
mandatory; deferred verification must never be represented as a pass.

## Ordering and session policy

Prospective Phase 9 evidence collection may run opportunistically, but it does
not block the active Phase 11-13 data and release path. Parallel capture does
not authorize promotion, model changes, or cross-session scope expansion.

The main planning thread is the orchestrator: it owns architecture,
prioritization, integration review, and promotion decisions. Separate Codex
sessions own bounded implementation. Prefer lower-cost models for
documentation, tests, and routine bounded work; reserve higher-effort or
frontier review for algorithms, migrations, cross-repo contracts, and
milestone gates.

Each session makes one implementation commit and runs focused tests or
acceptance commands. Full cross-repo gates run at milestone integration.
Browser sessions are separate, script-first, and minimize tabs and screenshots.
K3 repository-bounded review is optional at major milestone gates, not every
slice. Use [the session-packet template](session-packets/TEMPLATE.md) for the
handoff contract; keep one repository and one objective per session unless an
explicit cross-repo task requires otherwise.
