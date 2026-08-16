# Phase 12C2: 2026 provider ranking refresh

Status: implemented locally on 2026-08-16; scheduler installation and remote
deployment remain explicit operator actions.

## Outcome

The file-backed API now owns current provider rankings. Drafty continues to
request `GET /players/latest` at startup when `NEXT_PUBLIC_API_HOST` is set and
falls back to the checked-in byte-identical artifact only when the API is
unavailable.

The refresh command collects Harris and FantasyPros before its only active
artifact write. Harris retains its five-page season and timestamp evidence.
FantasyPros no longer uses headed Playwright, credentials, randomized sleeps,
or the rest-of-season page: it parses the official server-rendered 2026
standard and PPR draft payloads and validates season, ranking type, scoring,
source update date, source counts, and page fingerprints.
The two page requests honor FantasyPros' published five-second crawl delay.

The first promoted baseline contains:

| Provider | Source records | Stable-universe matches | Unmatched source | Ambiguous | Team conflicts | Removed old source ranks |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Harris | 252 | 248 | 4 | 0 | 0 | 32 |
| FantasyPros | 452 | 373 | 79 | 0 | 0 | 9 |

FantasyPros' unmatched records begin beyond overall rank 250 and represent
players outside the current 455-player stable universe. They are retained in the audit
report but do not silently expand that universe. Removing a source rank does
not remove the player; it marks that provider as no longer ranking the player.

## Promotion and failure boundary

`scripts/refresh_provider_rankings.py` previews by default. `--apply` first
constructs both complete candidates, rejects season drift, ambiguous identity,
team conflict, duplicate IDs, blank IDs, or unknown stable-universe IDs, then
atomically replaces `latest_player_rankings.json`. A collection or validation
failure leaves the prior artifact byte-identical. Promotion changes only the
four standard/PPR position/overall provider rank fields, explicitly nulls
provider ADP/projection/tier fields that the rank-only sources did not refresh,
and leaves player identities, historical data, custom ranks, and
canonical user tiers unchanged.

The API reads the file on every request and now returns a content ETag with
`Cache-Control: no-cache`; no server restart is required. The macOS launchd
example runs the repository wrapper daily outside Flask, preventing duplicate
refresh workers under reload or multi-process serving. It is not installed by
this slice.

## Evidence

- API unit suite: 141 passed.
- Focused Harris/FantasyPros/promotion tests: 6 passed.
- Live semantic candidate fingerprints:
  - Harris: `b1051a7fc39db313cfeda5d32fff3336aa062937e46ddc69ec8078712e0e81f2`
  - FantasyPros: `972893ff5624943d7d8d7590a3a3bcdf5e9be3d885079fcb979826359246d87b`
- Promoted API and embedded dashboard artifacts are byte-identical.

## Deferred

- Installing/enabling the launchd job on the operator machine.
- A Mongo-backed promotion adapter.
- Persisting scoring-aware provider observations for automatic canonical
  profile rebase; the older single-rank observation contract is intentionally
  not overloaded.
- A UI freshness surface for each provider. Aggregate `cached_at` remains
  visible through the existing data-readiness path.
