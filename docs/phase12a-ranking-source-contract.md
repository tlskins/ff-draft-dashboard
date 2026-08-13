# Phase 12A ranking-source contract

Phase 12A adds provider-free visibility and refresh previews for ranking
sources. It does not fetch, apply, promote, or replace rankings.

## Authority boundary

Provider identity describes who produced rankings. Storage transport describes
how the last-good observation is retained. They are separate contract fields;
neither may be inferred from the other.

The source status keeps these facts independent:

- last attempted refresh time;
- last successful refresh time and retrieval time;
- the latest failure reason;
- season and scoring type;
- canonical fingerprint and record count;
- availability and staleness.

A failed attempt updates attempt/failure evidence only. It never clears or
rewrites the last successful observation. An unavailable or stale source
remains in the source collection and does not gate `/players/latest`.

## HTTP surface

- `GET /v1/ranking-sources` lists every configured source, including sources
  without a successful observation.
- `GET /v1/ranking-sources/{source_id}` returns one source status.
- `POST /v1/ranking-sources/{source_id}/refresh-preview` compares a bounded,
  inline synthetic or frozen candidate with the last-good observation.

The preview request accepts no provider URL, local filesystem path, artifact
locator, or transport override. Candidate player records are bounded and use
canonical player IDs already present in the candidate or local profiles.
Malformed, duplicate, extra, and oversized input is rejected.

The preview response identifies season, scoring-type, retrieval-time, added,
removed, and rank-changed source differences, plus the affected player IDs
that occur in current ranking profiles.
Its canonical candidate fingerprint is also its logical idempotency key. The
same source state and candidate therefore produce the same preview.

Preview is read-only. It does not write source observations, ranking-profile
revisions, the release ranking artifact, the dashboard fallback, projection
overlays, or recommendation state. There is deliberately no apply or promotion
endpoint in Phase 12A.

## Persistence and testing

Source observation metadata and last-good records use additive SQLite tables
only through the configured repository database. Tests create disposable
temporary databases and frozen fixtures. Phase 12A development does not inspect
or initialize an active database, contact a provider, or use the network.

Future provider ingestion, application/promotion, profile rebasing, derived
overlay recalculation, and production migration require separate phases and
authorization.

## Closure evidence and next boundary

The additive provider-free implementation is complete and checkpoint-ready, not
yet checkpointed. Its executable boundary is exactly eleven paths:

- API: `openapi/v1.json`, `app/__init__.py`, `app/api/ranking_sources.py`,
  `app/repositories/ranking_sources.py`, `app/services/ranking_sources.py`,
  `tests/test_ranking_sources.py`, and `tests/test_openapi_contract.py`.
- Dashboard: `behavior/api/rankingSources.ts`, `behavior/api/schema.d.ts`,
  and `__tests__/rankingSources.test.ts`.
- This contract document is the eleventh path; the roadmap reconciliation is a
  twelfth working-closure path, not executable implementation.

Starting HEADs remain API `959bcc5295ddb5eb28df07ecceedf01255808792` and
dashboard `d247a30bb59caf99283e346be091171c5424b5ce`, both on
`refactor/realtime-foundation`, with empty indexes. On unchanged frozen hashes,
two consecutive focused runs passed: API 35/35 and dashboard 4 suites, 11/11
per run; `api:types:check` is current, and `git diff --check` plus static
syntax/OpenAPI audit passed. A fresh independent Sol integrated review returned
GO with no P1/P2 and relied on those reported gates rather than rerunning them.
The correction budget is consumed: two semantic rounds (timezone-aware
timestamp validation; metadata-only diff/`would_change` semantics) and one
generated-types continuation.

Retained non-blocking P3 follow-ups are strict-RFC3339 normalization beyond the
timezone-aware ISO forms accepted by `datetime.fromisoformat`, and a direct
focused stale stored-observation test. They do not reopen Phase 12A.

Before checkpoint, rollback is limited to reverting or removing the twelve
Phase 12A working-tree paths. No data rollback is needed: no provider/source
apply, active database, release artifact, user profile, embedded fallback,
overlay, or recommendation state was mutated.

Phase 12B must define the canonical profile-v2/rebase and portability contract,
including source fingerprint/season/scoring binding, added/removed-player
policy, unknown/missing IDs, and consistent survival across SQLite profile
revisions, browser-restart storage, and portable export/import. It alone may
consider later authority; Phase 12A grants no refresh apply/promotion authority.
