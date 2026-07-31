# Player status enrichment

## V1 boundary

Phase 6 enriches draft decisions with structured status, not a general news
feed. Provider adapters produce a bounded `PlayerStatusObservation` containing
one injury, suspension, transaction, team-change, or ESPN profile-news state.
Summaries are limited to 280 characters and retain source URL, source and fetch
timestamps, confidence, and deterministic recommendation impact.

```text
provider adapter
  -> PlayerStatusObservation
  -> PlayerStatusService validation and semantic fingerprint
  -> SQLite event history
  -> GET /v1/players/{player_id}/status
  -> generated dashboard types and recommendation/status UI
```

Missing provider data returns a successful empty response. Rankings, drafting,
and the deterministic advisor do not depend on status ingestion.

## Diff and refresh semantics

The event ID is derived from semantic content: player, event type, status,
summary, source, source URL, source publication time, and recommendation
impact. Polling the same state again refreshes its `fetched_at` and confidence
without creating another event. A semantic state change creates a new event,
which gives adapters a deterministic `changed` signal for alerts.

The dashboard retains history but considers only the newest state per
event-type/source channel when producing recommendation flags. A newer active
injury state therefore suppresses an older questionable state.

## Freshness

Staleness is calculated at read time from `source_published_at` when the
provider supplies it, otherwise from `fetched_at`:

- Injury: 24 hours.
- Suspension: 72 hours.
- Transaction: 72 hours.
- Team change: 7 days.
- ESPN profile news: 72 hours.

The response always exposes `stale`; stale status can remain visible for
context but cannot become an actionable recommendation flag.

## Provider adapters

The nflverse injury adapter is implemented. It reads the documented weekly
injury-report CSV, selects the newest report week and latest update per player,
maps GSIS through the nflverse player catalog to the dashboard ESPN ID, and
uses conservative deterministic impact rules. `Out` and `Doubtful` are
material; `Questionable`, limited practice, and non-participation require
review; full practice alone has no recommendation impact.

The nflverse movement adapter is also implemented:

- Weekly roster status `SUS` creates a material suspension state.
- A later non-`SUS` weekly state explicitly resolves that suspension.
- A team change between the two latest weekly snapshots creates a review-level
  team-change event.
- Player rows in the nflverse trade ledger create dated, review-level
  transaction events.
- GSIS is used for weekly rosters and PFR ID for trades; both must resolve
  through the canonical catalog to an ESPN dashboard ID.

The ESPN profile-news adapter is implemented as a deliberately narrow optional
source. It consumes only metadata from the observed public athlete-overview
payload for explicitly selected ESPN player IDs. Because a player's payload
can contain general team stories, the adapter:

- Requires a valid publication timestamp and an HTTPS `espn.com` article URL.
- Requires the player's normalized full name in the headline, link text, or
  description; surname-only and general team matches are rejected.
- Selects at most the newest matching item.
- Stores only a bounded snippet and provenance with `none` recommendation
  impact. It never reads or stores article bodies.
- Emits no observation when the payload is absent, malformed, or unmatched.

The payload is observed rather than documented as a stable public API, so the
adapter remains fixture-backed and fail-closed. Its command accepts an explicit
set of at most 25 players instead of crawling the player catalog.
The observed endpoint shape is
`https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/{espn_id}/overview`;
the stored article link remains the user-facing ESPN player-news provenance.

## Dashboard cache and recommendation evidence

The dashboard uses one shared, five-minute status cache for the three current
recommendations and the player open in the detail sidebar. Concurrent requests
for the same ESPN player ID share one promise, fresh successful or unavailable
results are reused, and active IDs are refreshed on the cache interval. A
failure for one player does not affect other players.

Recommendation cards show at most two current actionable events. Material
events are shown before review events; stale events, no-impact events, and
superseded states are omitted. Each visible event retains its short summary,
source link, publication date, confidence, and impact. Provider-unavailable
states stay quiet on recommendation cards to avoid interruption.

Status is presentation evidence only. It does not change the deterministic
candidate score, custom positional order, or recommendation count. The detail
sidebar uses the same cached response but continues to show stale and no-impact
history for inspection.

## Structured-event summary

Phase 6 is complete. The status response optionally includes a
`PlayerStatusSummary` with its text, method, model, generation time, and the
exact event IDs used.

The read path never calls an LLM. It selects at most four newest current,
non-stale provider channels and produces a deterministic one-sentence fallback.
An explicit local command can refresh a cached OpenAI summary for selected
players after status ingestion. The optional model receives only event type,
status, bounded short summary, publication time, confidence, and impact. Player
IDs, source URLs, raw provider payloads, and article bodies are excluded.

Model output uses a strict JSON schema, is limited to 240 characters, and is
rejected unless it is one sentence. The cached output is keyed by the exact
semantic event IDs; any current-state change immediately falls back to a fresh
deterministic summary until another optional refresh succeeds. Missing keys,
upstream errors, malformed outputs, and stale events never block the API,
ranking board, or live advisor.

The nflverse release URL is
`https://github.com/nflverse/nflverse-data/releases/download/injuries/injuries_{season}.csv`.
Before a season's weekly reports are published, the asset may not exist; that
is an expected provider-unavailable state and does not affect the application.

The weekly-roster release URL is
`https://github.com/nflverse/nflverse-data/releases/download/weekly_rosters/roster_weekly_{season}.csv`.
The trade ledger is
`https://raw.githubusercontent.com/nflverse/nfldata/master/data/trades.csv`.
The movement importer treats those feeds independently so one unavailable
provider does not block ingestion from the other.
