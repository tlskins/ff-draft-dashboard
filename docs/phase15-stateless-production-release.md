# Phase 15 stateless production release

Status: deployed and automatically verified on 2026-08-20.

## Release identities

| Boundary | Identity |
| --- | --- |
| Dashboard production origin | `https://ff-draft-dashboard.vercel.app` |
| Dashboard release commit | `865bda8` |
| Cloud Run service | `drafty-read-api` in `ff-draft-dashboard/us-east1` |
| Cloud Run URL | `https://drafty-read-api-708070733429.us-east1.run.app` |
| Cloud Run revision | `drafty-read-api-00001-4rw` |
| API source commit | `543d0e1` |

The API source commit is preserved on
`origin/refactor/realtime-foundation` in the API repository. The dashboard
release commits are on `origin/main`.

## Accepted production boundary

- Cloud Run has zero minimum instances, one maximum instance, concurrency 8,
  no persistent disk, and no OpenAI credential.
- Production config enforces read-only mode, requires the generated runtime
  artifacts, and permits browser CORS only from the production dashboard.
- The runtime SQLite copy contains zero draft sessions, draft events, advisor
  snapshots, ranking profiles, or ranking-profile revisions. Its historical
  paths are relative and passed a relocated-runtime smoke test.
- Public reads serve 455 players for the 2026 season, 2021–2025 weekly history,
  readiness metadata, ranking-source evidence, and player status evidence.
  Draft/profile/admin/Realtime mutation routes fail closed with HTTP 403 and
  `code: read_only_mode`.
- Vercel's older loopback API environment value is intentionally superseded by
  the reviewed `DRAFTY_PRODUCTION_API_HOST` build authority. The deployed JS
  contains the Cloud Run URL and contains no `127.0.0.1:5000` API origin.
- Browser draft state, draft plans, custom rankings, and advisor state remain
  local. Realtime remains disabled.

## Automated evidence

- Dashboard: 96 suites passed, 639 tests passed, 2 tests skipped; TypeScript,
  lint, and production export passed.
- API: 148 tests passed; the Cloud Run bundle and relocation preflight passed.
- Cross-repository full release preflight passed at dashboard `dd9ce6d` and API
  `543d0e1`, including byte-identical rankings, generated API types, extension
  0.0.0.8 package parity, focused integration tests, lint, and build. The later
  `865bda8` build-authority correction passed its focused regression, lint,
  production build, and deployed-bundle inspection.
- Live API smoke returned HTTP 200 for health, readiness, rankings, status,
  historical comparison, and historical query. The deployed rankings report
  season 2026 and cache time `2026-08-16T13:31:21.881293Z`.
- Live dashboard smoke returned HTTP 200 with the integrated draft desk and
  advisor comparison UI rendered from Vercel production.

The packaged status snapshot remains honest about source freshness: the
weekly-roster and transaction evidence was retrieved on 2026-08-13, and the
2026 nflverse injury source reported its upstream 404. Ranking/status refresh
automation is a later operational slice, not represented as part of this
deployment.

## Rollback

The dashboard and API are independent. Redeploy dashboard commit `4343a8c` to
restore the production version that preceded Phase 15. Because this is the
first Cloud Run revision, there is no older API revision to receive traffic;
leaving it unused costs no idle instance allocation, or the service can be
deleted after the dashboard no longer references it. For later API revisions,
use the revision traffic command in the API repository's `docs/cloud-run.md`.

## Remaining human and product work

This release does not complete Phase 14C's round-aware run market or Phase
14D's deployed live ESPN/extension acceptance. VoiceOver remains deferred by
the accepted roadmap decision. A future live mock should test the deployed
dashboard and extension together without changing this release's read-only
server boundary.
