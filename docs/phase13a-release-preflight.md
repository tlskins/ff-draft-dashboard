# Phase 13A provider-free release preflight

Phase 13A is a bounded dashboard-only preparation slice. It adds repeatable,
non-destructive evidence for checks that automation can honestly own; it does
not close Phase 13, replace browser/device acceptance, or modify the companion
API, release data, extension runtime assets, or archives.

## Runbook and report

From the dashboard checkout, point to the API checkout explicitly when it is
not the safe sibling default (`../ff-draft-dashboard-python-api`):

```sh
npm run release:preflight -- --api-repo "/path/with spaces/ff-draft-dashboard-python-api"
node scripts/release-preflight.mjs --mode quick --api-repo /path/to/api --report /tmp/phase13a.json
```

`release:preflight` is **full mode**, the automated release-evidence command.
Quick mode is inspection-only: it records the focused Jest command manifest but
does not execute it. Full mode executes the existing focused selector/mock,
startup/migration/authority/journal/rollback, portable-v1/v2,
canonical-empty, API-unavailable fallback, draft-listener recovery,
data-readiness, availability, and artifact tests; generated API types against
the explicitly resolved API OpenAPI file; `tsc --noEmit`; lint; and the
production build.

The command writes exactly one versioned JSON document to stdout and optionally
to `--report`. Its top-level fields are `report_version`, `kind`, `mode`,
`release_evidence`, `overall`, `duration_ms`, `inputs`, `gates`,
`human_checks`, and `limitations`. Each executed command records its argument
array, display command, cwd, status, duration, exit/signal/error, and bounded
stdout/stderr tails. A non-zero command or an inspection failure makes the
preflight non-zero. The runner uses `spawnSync` argument arrays, never a shell.

The report records dashboard/API paths, branches, exact Git heads, dirty state,
the resolved OpenAPI path, ranking-artifact SHA-256 values, byte parity, and
stored season/cache/player-count metadata. It reports metadata as-is and does
not invent a freshness policy.

## Automated Phase 13A gates

The runner validates `public/manifest.json` as MV3, Chrome numeric version
syntax, required dashboard/local and ESPN draft matches, extractor-before-
content-script order, service worker, popup, icons, every local manifest asset,
and absence of a newly broadened `permissions`/`host_permissions` boundary. It
also records the existing ESPN DOM selector fixture and recorded mock command
as the focused command manifest.

It compares `behavior/playerData.json` byte-for-byte with the API's
`latest_player_rankings.json`, reports both SHA-256 values and the artifact
metadata, and requires the API OpenAPI file before running generated-type
freshness.

The current manifest is `0.0.0.8` while the tracked `ext_release_*` archives
end at `0.0.0.4`. Therefore the preflight reports a **release-blocking stale
packaged-extension boundary**. It never creates, updates, or overwrites an
archive. A passing Phase 13A automated report is impossible until an explicitly
reviewed matching archive is supplied in a separately authorized packaging
step.

## Human-owned remainder

These checks are deliberately reported as pending, deferred, blocked, or
decision-required rather than passed:

- Human-directed dashboard and extension browser acceptance, including the
  actual ESPN selector smoke.
- Deferred VoiceOver and physical-device checks.
- One live local mock acceptance.
- Deployment, version/tag, push, and release/archive decisions.
- External-data readiness and Phase 11C in-season ingestion dependencies.

Frozen prediction v1 remains release-acceptable. Phase 9 remains
evidence-blocked, and Realtime GPT/voice remains deferred; neither is converted
to a pass by this preflight.

Phase 12 rebase apply, source promotion, and any remaining ranking-editor
refinements remain separate work if incomplete. Phase 13A does not waive the
Phase 12B2b API-first/dashboard-hardening integration and rollback boundary.

## Rollback

This slice is dashboard-only and has no runtime data migration. Roll it back
with a normal Git revert of the Phase 13A dashboard commit. Do not delete or
replace extension archives as part of that revert. If the Phase 12B2b release
sequence is also being rolled back, retain its documented order: dashboard
hardening and consumer together before the additive API commit.
