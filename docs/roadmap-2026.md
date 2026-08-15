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

Phase 12B2b should next wire canonical v2 through an explicit API/dashboard
consumer and portable-v2 startup/import/export contract. Rebase apply remains a
later independent Phase 12B2 slice. Phase 12A, 12B1, and 12B2a grant no ranking
source refresh/apply/promotion, profile rebase apply, overlay, recommendation,
provider, deployment, or Phase 11C authority.

### Phase 13: draft-season release readiness

Dependency: Phases 10-12 are integrated. Frozen prediction v1 is an acceptable
release model while Phase 9 remains evidence-blocked; neither prediction-v2 nor
Realtime GPT promotion is a release prerequisite.

Complete extension selector smoke, startup/recovery/migration checks, one full
local mock acceptance, refreshed-data/API smoke, fallback and rollback checks,
and the deferred manual VoiceOver/device audit. Verify that current rankings,
status availability, completed historical windows, and any partial 2026 data
are labeled consistently across the release.

Exit gate: all release checks pass, operational and accessibility limitations
are documented, frozen v1 rollback remains tested, and no unresolved
release-critical blocker remains.

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
