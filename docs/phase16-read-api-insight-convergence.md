# Phase 16 read API and adaptive insight convergence

Status: integrated and deployed on 2026-08-20. The implementation commit is
`823cbc4`; Vercel reported the production deployment successful at
`https://ff-draft-dashboard.vercel.app`. Realtime GPT/voice and unrelated
feature work remain deferred.

## Product boundary

Phase 16 makes the stateless Cloud Run read API and every distinct compact
analysis surface reachable from the existing three-slot insight deck. It does
not add API persistence, ranking refresh writes, Realtime credentials, a new
recommendation model, or another analysis route.

The rankings pane continues to own Position, ADP Round, Best Available, Targets,
and Edit Rankings. The profile pane continues to own the focused player's
identity, outlook/status summary, and detailed history. `PositionalBests` is
not registered separately because its useful board-order evidence is already
represented by the rankings pane, current-tier market, and intra-position
comparison.

## Published read contracts

| Contract | Front-end ownership |
| --- | --- |
| `GET /players/latest` | Shared rankings resource with typed domain normalization and an explicit embedded-fallback state. It remains the source of published ranks and tiers. |
| `GET /v1/data-readiness` | Shared readiness resource used for exact completed-season windows and provider readiness. |
| `GET /v1/ranking-sources` | Shared aggregate ranking-source provenance shown in the manual source view. |
| `GET /v1/ranking-sources/{source_id}` | On-demand shared source detail when a user expands one published source. |
| `GET /v1/players/{player_id}/status` | Shared, bounded candidate/focus cache. Only fresh actionable events become status-alert evidence. |
| `GET /v1/historical/comparison` | Shared maximum-three comparison resource used by compact risk/reward and production views and Player Lab. |
| `POST /v1/historical/query` | Shared explicit-query resource used by the expanded Analysis Workspace. It is a read-only query despite its HTTP method. |
| `GET /health` | Operational smoke/preflight only. It is intentionally not dashboard content. |

All public mutation and Realtime routes remain disabled in production. Empty,
stale, unavailable, and failed providers remain visible as those states. The
front end does not synthesize an outlook, source success, injury, or historical
record when the API does not publish one.

## Shared read-resource contract

`ReadApiCache` is application-scoped through `ReadApiProvider` and bounded to
128 inactive entries, pruning the oldest inactive entries first. Each resource has a typed key, TTL,
stable evidence fingerprint, and one of `idle`, `loading`, `ready`, `stale`,
`unavailable`, or `error`.

- Concurrent matching requests share one promise.
- A refresh retains matching prior data as explicitly stale.
- Invalidated generations and aborted requests cannot overwrite newer state.
- An error may retain the last matching payload, but remains an error.
- Historical comparison is limited to three unique players and the latest five
  requested completed seasons.
- Historical resources are keyed by player order, scoring profile, seasons,
  and validated query. A changed comparison signature cannot display an old
  result as current.
- Pure view scoring and deck reducers perform no I/O.

## Registered view catalog

| Slot | Registered compact views | Auto policy |
| --- | --- | --- |
| Primary decision | Candidate comparison; intra-position comparison; historical risk & reward; historical production | Ready evidence may compete deterministically. Live recommendation evidence retains its existing authority. |
| Market watch | Current tier market; two-round run matrix; rank & tier disagreement | Ready evidence may compete. Rank disagreement compares displayed source ranks only and never changes draft value. |
| Plan & constraints | Plan constraints; player status alerts; published data sources | Material/review status may compete. Published data sources is manual-only operational context. |

Queued alternatives are buttons. Selecting one pins it for the current draft
session; Auto restores the strongest distinct Auto-eligible view. A view cannot
occupy two slots. Same-material-event API completion may refresh the selected
view and queue, but cannot switch the selected view. One deck-owned polite live
region announces a materially displayed selected-evidence refresh once.

## Authority invariants

- Custom positional ranks/tiers remain draft-value authority.
- Existing deterministic recommendations remain preferred-now authority.
- Frozen opponent forecasts remain run-probability authority.
- Existing roster/settings logic remains roster-need authority.
- Historical, status, and source metadata explain, compare, or warn; they do
  not silently rescore or reorder recommendations.
- Rankings and player identity order are never inferred from API request timing.

## Rollback and exit gate

`NEXT_PUBLIC_PHASE14C_INSIGHT_DECK_ENABLED=false` continues to restore the
accepted compact Analysis Workspace in the right pane. The shared rankings
resource still fails safely to the embedded snapshot under that rollback; no
backend migration is involved.

Phase 16 closes only after `npm run test:phase16`, API type checks, TypeScript,
lint, production build, full release preflight, deterministic replay, visual
checks at 1440px and 1280px, live Cloud Run contract smoke, and a production
browser smoke all succeed. The development-only deterministic browser fixture
must exercise each queued view, manual pin/Auto restoration,
loading/stale/unavailable states, source-detail expansion, bounded scrolling,
one live-region owner, and no runtime console errors. The production browser
smoke separately verifies the deployed application, compiled Cloud Run origin,
fixture guard, and absence of runtime errors without publishing fixture state.
Deployment and rollback URLs/revisions must be recorded before the goal is
marked complete.

## Closeout evidence

- `npm run test:phase16` passed 20 suites and 106 tests. The complete Jest run
  passed 114 suites and 744 tests, with one suite and two tests intentionally
  skipped.
- Generated API types, TypeScript, lint, `git diff --check`, and the production
  build passed. The clean full release preflight passed at dashboard commit
  `823cbc4` and API commit `8fb884b`, including extension 0.0.0.8 parity,
  byte-identical ranking artifacts, 455 players for season 2026, and 118
  focused release tests.
- The deterministic browser fixture exercised all ten registered views,
  queued selection/pinning, Auto restoration, ready/loading/stale/unavailable
  evidence, on-demand source detail, one live-region owner, and independent
  scroll-to-end behavior at 1440px and 1280px. Real published player IDs keep
  historical fixture evidence representative instead of rendering unknown
  zero-value players.
- Production browser smoke hydrated current rankings and tiers, rendered the
  three adaptive slots, loaded a real three-player historical risk comparison,
  expanded the source diagnostic, retained one deck live region and no page
  overflow, and reported no runtime console errors. The production-only fixture
  guard continued to return HTTP 404.
- Cloud Run returned HTTP 200 for health, rankings, readiness, ranking-source
  list/detail, player status, historical comparison, and historical query.
  Draft-session creation, ranking refresh preview, and Realtime client-secret
  creation continued to fail closed with HTTP 403. The service remained on
  revision `drafty-read-api-00002-r7r`; Phase 16 changed no API code.

## Release and rollback identities

| Boundary | Accepted identity | Rollback |
| --- | --- | --- |
| Dashboard source | `823cbc4` on `origin/main` | Redeploy `bf61256` to restore the accepted Phase 14C integration. |
| Dashboard production | `https://ff-draft-dashboard.vercel.app` | Use the Vercel deployment for `bf61256`; the API can remain running and unused. |
| Cloud Run API | `drafty-read-api-00002-r7r` at `https://drafty-read-api-708070733429.us-east1.run.app` | No Phase 16 API deployment occurred; retain the existing revision or follow `docs/cloud-run.md` if a later API revision must be rolled back. |
| API source | `8fb884b` | No source rollback is required for Phase 16 because its API contracts were consumed without modification. |

The Phase 14C environment rollback remains independently viable:
`NEXT_PUBLIC_PHASE14C_INSIGHT_DECK_ENABLED=false` restores the prior compact
Analysis Workspace while the shared ranking loader retains its explicit
embedded fallback. No backend migration or personal draft-state write is
involved.
