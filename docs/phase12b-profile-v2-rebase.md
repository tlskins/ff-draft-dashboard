# Phase 12B1: profile v2 and rebase preview

Phase 12B1 defines a provider-free, additive, read-only contract. It validates
canonical profile-v2 snapshots, converts legacy values in memory, and previews
how a user-owned board would rebase onto an explicitly supplied and verified
target source. It does not persist v2, migrate browser storage, update an active
profile, refresh a ranking source, or modify player artifacts.

## Authority and canonical data

User positional order is authoritative and tier membership is primary. A
canonical snapshot contains only `schema_version: 2`,
`rebase_version: "profile_rebase_v1"`, scoring type, exact QB/RB/WR/TE arrays,
bounded unresolved tombstones, and provenance. One shared ceiling allows at
most 500 unique player IDs across all four active arrays plus unresolved
players; validation and preview output enforce the same ceiling. Active entries contain only a
player ID and user tier; array position is the user rank. Profile names, IDs,
API revisions, timestamps, transport labels, provider display names, and source
rank deltas stay outside the snapshot.

Bound provenance records source/provider IDs, season and scoring, the Phase 12A
source-observation fingerprint, and a distinct player-universe fingerprint.
The latter hashes canonical player-ID/position pairs and must not be confused
with the Phase 12A fingerprint over source candidate ranks and metadata. Legacy
adapters produce `legacy_unbound` provenance with null evidence; in particular,
`source_ranker` never implies server source or provider identity.

## Deterministic preview

The target request contains bounded data plus expected and observed source and
universe fingerprints, but those caller values are only stale-request/TOCTOU
assertions. They are not authority. Before the HTTP preview, the API reads the
configured Phase 12A source definition and last-good observation and verifies
the requested provider against configuration and the separately retained
last-success provider attribution, then validates bounded timezone-aware
last-success/retrieval timestamps, availability, season, scoring, observation
fingerprint, and the exact stored player-ID/overall-rank records. Unknown
legacy attribution and provider changes fail closed until a new matching
success; a later failed attempt from another provider does not relabel or
discard correctly attributed last-good evidence. It separately checks every
target player ID and position against the current server-held player universe.
Any missing evidence or mismatch fails with a machine-readable code. The pure
Python and TypeScript preview functions accept an already trusted target and do
not claim to perform server verification themselves.

Retained players keep exact relative order and tier membership even when source
ranks change. Empty surviving tier groups are compacted. Added players are
sorted by target overall rank and canonical ID, then appended within their
position as one new trailing tier. Missing players and position changes become
explicit tombstones. Existing tombstones are retained and are never
automatically resurrected. The response includes canonical input/output
fingerprints, a deterministic preview key bound to the input profile, exact
target source/provider/season/scoring/observation metadata, a fingerprint of
the exact canonical rank-bearing target, exact target universe, output profile,
and rebase version, exact change
counts and IDs, and `would_change`.

The HTTP surface is only
`POST /v1/ranking-profiles/{profile_id}/rebase-preview`. It reads the existing
profile and checks `expected_revision`; unknown and stale profiles fail 404 and
409. It converts a stored v1 snapshot in memory and invokes the pure preview.
No repository write follows, and there is no apply route.

The dashboard legacy adapters are also pure. The full Rankings adapter extracts
Custom positional order and tier only against a separately trusted universe.
The portable-v1 adapter retains unknown or moved IDs as tombstones. Neither
adapter reads or writes storage, invents missing provenance, or falls back to
Harris. These legacy-only adapters reject input that claims schema v2. A caller
that accepts both versions must dispatch schema v2 to the explicit v2 validator
and must never retry malformed v2 input as a legacy format.

## Verification and rollback

The API and dashboard consume byte-identical synthetic fixtures. Phase 12B1 is
technically complete and locally checkpointed at API
`40da04065b896fbce4d2e6968704ae8963c4156e` and dashboard
`971ac7a54e36df7a1a2fd6b61bb6120a71f0c5b6`, followed by dashboard build
hardening `fe020286a8a89186c37af5adb1e058862163555a`. The implementation boundary
is exactly these 20 paths (10 API and 10 dashboard):

- API: `openapi/v1.json`; `app/api/ranking_profiles.py`;
  `app/repositories/ranking_sources.py`; `app/services/ranking_profile_rebase.py`;
  `app/services/ranking_sources.py`; `tests/fixtures/ranking_profile_rebase_v1.json`;
  `tests/test_ranking_profile_rebase.py`; `tests/test_ranking_profiles.py`;
  `tests/test_ranking_sources.py`; `tests/test_openapi_contract.py`.
- Dashboard: `behavior/rankingProfileV2.ts`; `behavior/api/rankingProfiles.ts`;
  `behavior/api/schema.d.ts`; `__tests__/fixtures/rankingProfileRebaseV1.json`;
  `__tests__/rankingProfileV2.test.ts`; `__tests__/rankingProfiles.test.ts`;
  `__tests__/rankingSources.test.ts`; `docs/phase12a-ranking-source-contract.md`;
  `docs/phase12b-profile-v2-rebase.md`; `docs/roadmap-2026.md`.

The 17 non-document final hashes are frozen as follows:

- API: `openapi/v1.json` `e139a66bceda9aa737335f1355dfea76a8bc64257bf21bd9888295cfcc583325`;
  `app/api/ranking_profiles.py` `1fd1cc8906a24b139686f7768f65b218207dd8a1d0f68a535df6f62cd10a8b01`;
  `app/repositories/ranking_sources.py` `977b39df42aaa541e03f39365a9849794eb4d09d91f13ea01c422451e2300601`;
  `app/services/ranking_profile_rebase.py` `565867fd091cc4d4b253d89432697d5285421471b07a169bec2e4a14aaf92552`;
  `app/services/ranking_sources.py` `079f7c6a57e86f9883b9e7b538f4d06a788b1acad2e51334acfc73bda51d4be7`;
  `tests/fixtures/ranking_profile_rebase_v1.json` `f69c4c0b4697a1719b8d5bdcc4c6d6beb0fce273dde42a042711858a4df0ae12`;
  `tests/test_ranking_profile_rebase.py` `62b43dd9e992fc37ab33b84d3ba40aed3aaad3baafa59c128ec2d1e90b3083a3`;
  `tests/test_ranking_profiles.py` `c06085a6fc16bec32f09b49b5d6d48cdba4457571ba724068d54fd579b79c7db`;
  `tests/test_ranking_sources.py` `416569aff9a681ef7d104a1556a17a1c1f0fc6722d2223cdee93e8270823e648`;
  `tests/test_openapi_contract.py` `dd24fa5ba9a2de408e7c9c775d2689f34a4e997d4278d162af2d13f432d7ca63`.
- Dashboard: `behavior/rankingProfileV2.ts` `fccf094b5ed8a0ede018f05ab94ec30d87c8f20b6340b42b841894c0c164128f`;
  `behavior/api/rankingProfiles.ts` `43935239eb6721af800b3ca59acc23b99cd17856307f5e95d2869cdb91903f6e`;
  `behavior/api/schema.d.ts` `fbb4f308bb6ed85c664fb10fedc77ff6065ac74a9540bc03157bb9cbd4241b43`;
  `__tests__/fixtures/rankingProfileRebaseV1.json` `f69c4c0b4697a1719b8d5bdcc4c6d6beb0fce273dde42a042711858a4df0ae12`;
  `__tests__/rankingProfileV2.test.ts` `2afd7b0168c5d16e0afcb4d086de0f7c5d248e111ba44dc8673917da824f6a54`;
  `__tests__/rankingProfiles.test.ts` `a6d65f51ff838b63689ebebee20dcd5c2480448132473fab51fa645a04d386d6`;
  `__tests__/rankingSources.test.ts` `2ee3b9c3c9d8ddbbdadbef9ca1517a2dd8a11ab0eabab3053417d23fbf4d0423`.

Closure-document hashes are intentionally not embedded here, avoiding
self-referential stale values.

Two corrected frozen gates passed with Node `v22.22.0`: API 34/34 and dashboard
three suites 21/21 on each pass, generated API types current on each pass, and
fixture `cmp`, diff/status/hash/index audits passed. The boundary was exactly
20 paths, fixtures were byte-identical, and no edits followed pass one. A fresh
independent Sol review returned GO with no P1/P2, verified the legacy
compatibility seam and fail-closed rebase, matched the static boundary, and did
not rerun gates. The retained nonblocking P3 is that bounded timezone-aware
`datetime.fromisoformat` accepts ISO-8601 forms rather than strictly RFC 3339.

The independent checkpoint audit additionally passed the API full suite
(115/115), dashboard full suite (76 suites and 470 tests, with two existing
skips), dashboard lint, Python compilation, and generated-type freshness. The
production build then exposed compile-only TypeScript narrowing and typed-map
construction defects in `behavior/rankingProfileV2.ts`; the hardening commit
above corrected them without changing the contract. The final hardening state
passed the three focused dashboard suites (21/21), generated-type freshness,
and a complete optimized production build.

The exceptional, exhausted correction history is: initial provider/key/cap
fixes; durable nullable `last_success_provider_id` additive serialized migration
with conservative backfill and timestamp validation; the mechanical Node gate
continuation; and the injected legacy repository compatibility correction.

Rollback uses normal Git reverts of the local Phase 12B checkpoint sequence,
including dashboard hardening and closeout documentation. Its pre-Phase-12B
bases are API `70f093a4daa599104310b407f16d41ac730c2036` and dashboard
`7ccb0fa71d34bad031fd2bf337a0a2008fef1b1d`. No active DB/data rollback is
needed because only disposable test databases were used, and no active schema
migration has run.

Phase 12B2 remains separate. This work does not authorize durable profile-v2
persistence, localStorage migration, portable-v2 production wiring, revision
or rebase apply, source refresh/apply/promotion, ranking overlay changes, or any
consumer/page/component integration.
