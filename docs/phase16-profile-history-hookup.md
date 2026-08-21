# Phase 16 profile history hookup

Status: deployed to production on 2026-08-20.

This post-closeout Phase 16 slice connects the focused-player profile to the
existing stateless historical read API. It changes no ranking, tier, draft,
forecast, or recommendation authority.

## Bounded read contract

The profile waits 250 ms for board focus to settle, then issues one cached
`POST /v1/historical/query` request for the focused player. The request covers
the latest three completed seasons (or the largest available 1/3-season
window), groups by recorded week, requests only games and mean fantasy points,
and is bounded to 100 rows. The existing shared read cache owns deduplication,
TTL, cancellation, and response-generation races.

That single validated response supports three presentation-only views:

| View | Mapping | Auto use |
| --- | --- | --- |
| PPG distribution | `x = y = fantasy_points_mean`, color by season | Leads with at least 12 recorded weeks and no material season gap. |
| Weekly heatmap | week columns, player row, season facets | Leads when recorded playing time differs by at least four weeks between seasons. |
| Weekly trend | week x-axis, fantasy points y-axis, color by season | Leads for a smaller sample. |

Density charts fail closed unless `x` and `y` name the same numeric metric.
Heatmaps fail closed unless `x` and `color` are declared result dimensions.
Facets remain bounded to 12 panels. Changing the view changes only the
presentation metadata and never sends another API request.

## User authority and fallbacks

- `Auto` chooses the deterministic presentation above.
- A manual chart pin persists while player focus changes.
- Actionable structured status can still place Outlook ahead of Production.
- A veteran with ready API history places Production ahead of Draft value.
- Loading, disabled, empty, and failed API states retain embedded seasonal
  history when available and otherwise leave Draft value usable for rookies.
- The historical response is explanatory only and cannot change ranks, tiers,
  player availability, recommendations, or forecasts.

The generic renderer continues to support line, bar, scatter, density, and
heatmap. Box and violin remain fail-closed in the generic renderer; Player Lab
continues to own its specialized, exact distribution box presentation.

## Verification

- API-shaped registry, cache integration, focus coalescing, pin persistence,
  fallback, semantic validation, density, heatmap, and facet regressions.
- Desktop production-export browser check against the local read API: one
  historical query, automatic density, manual three-season heatmap, shared
  week positions, bounded pane scrolling, and no runtime error overlay.
- Production smoke at `https://ff-draft-dashboard.vercel.app`: the live Cloud
  Run API returned 49 recorded weeks for Jahmyr Gibbs across 2023–2025; Auto
  selected PPG distribution and the pinned weekly heatmap rendered all three
  season facets without an error overlay.
- Full test, build, release-preflight, deployment, and production-smoke
  evidence are recorded in the release commit and deployment history.
