# Phase 12A ranking-source contract

Phase 12A adds provider-free visibility and refresh previews for ranking
sources. It does not fetch, apply, promote, or replace rankings.

## Authority boundary

Provider identity describes who produced rankings. Storage transport describes
how the last-good observation is retained. They are separate contract fields;
neither may be inferred from the other.

The source status keeps these facts independent:

- last attempted refresh time;
- last successful provider identity, refresh time, and retrieval time;
- the latest failure reason;
- season and scoring type;
- canonical fingerprint and record count;
- availability and staleness.

A failed attempt updates attempt/failure evidence only. It never clears or
rewrites the last successful observation, including its provider attribution.
The public `provider_id`, provider name, and storage transport continue to
describe the currently configured source; nullable `last_success_provider_id`
identifies the provider that produced retained last-good ranks. Legacy rows are
backfilled only when their latest attempt was an unambiguous success. A legacy
failed-last-attempt row remains unattributed until a fresh success rather than
guessing from its latest-attempt provider. An unavailable or stale source
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

The additive `last_success_provider_id` migration is serialized in one
`BEGIN IMMEDIATE` transaction, is safe to repeat, and conservatively backfills
only unambiguous legacy successes. Phase 12B1 accepts retained
`last_success_at` and `retrieved_at` evidence only when each is a bounded string
of at most 64 characters parsed by `datetime.fromisoformat` as a timezone-aware
ISO-8601 value. Strict RFC 3339 normalization remains out of scope.

Future provider ingestion, application/promotion, profile rebasing, derived
overlay recalculation, and production migration require separate phases and
authorization.

## Closure evidence and next boundary

Phase 12A is already checkpointed at API
`70f093a4daa599104310b407f16d41ac730c2036` and dashboard
`7ccb0fa71d34bad031fd2bf337a0a2008fef1b1d`; its historical closure evidence
above is retained. Only the Phase 12B1 authority correction is complete and
checkpoint-ready but not staged, committed, or checkpointed.

That correction preserves the Phase 12A non-authorities and adds durable,
nullable last-success provider attribution through an additive serialized
migration, conservative backfill, bounded timestamp validation, and an
injected-legacy-repository compatibility seam. Its closure evidence, exact
20-path boundary, hashes, frozen-gate results, review, and rollback procedure
are recorded in `phase12b-profile-v2-rebase.md`.

The exceptional correction budgets (initial provider/key/cap fixes; durable
attribution/backfill/timestamp work; mechanical Node gate continuation; and
legacy repository compatibility) are exhausted, not an ongoing allowance. The
retained non-blocking P3 is deliberately limited to accepting bounded
timezone-aware `datetime.fromisoformat` ISO-8601 values rather than strict
RFC 3339.

Before the Phase 12B1 checkpoint, rollback means reverting or removing exactly
its 20 working paths to the two checkpoints above. No active database or data
rollback exists because only disposable test databases were used. After a
checkpoint, rollback is a normal Git revert of the two intended local commits;
no active schema migration has been run. Phase 12B2 remains separately
authorized work and Phase 12A grants no refresh apply or promotion authority.
