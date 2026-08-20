# Phase 16 read API and adaptive insight convergence

Status: implementation in progress on `phase/16-read-api-insight-convergence`.
Realtime GPT/voice and unrelated feature work remain deferred until the exit
gate below passes.

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
