# Phase 11A season rollover and source freshness

## Result and contract ownership

Phase 11A makes `GET /v1/data-readiness` in the Python API the source of
truth for season availability and stored source-freshness evidence. The
versioned OpenAPI v1 document owns the response schema, and the dashboard
consumes the generated TypeScript contract. Dashboard code does not provide a
hardcoded season fallback when readiness metadata is loading, missing, or
unavailable.

The API reports the configured current fantasy season, the reviewed
`completed_season_through` boundary, rankings metadata, identity-catalog
metadata, the latest weekly-stat source for each imported season, identity
misses, and status-source evidence. `generated_at` is only the time the
response was assembled. It is never treated as a provider retrieval or
publication timestamp.

## Completed and current/partial semantics

`FANTASY_SEASON` and `COMPLETED_SEASON_THROUGH` are explicit reviewed
configuration. The defaults for this release line are current season 2026 and
completed through 2025.

- An imported season at or below `completed_season_through` is `completed`.
- The configured current fantasy season is `current_partial`, even when weekly
  rows have been imported.
- A season between the reviewed boundary and current season, or later than the
  current season, is contradictory and is rejected instead of guessed.
- `COMPLETED_SEASON_THROUGH` must be earlier than `FANTASY_SEASON`; application
  startup rejects the opposite configuration.
- A season becomes completed only through a reviewed rollover of the explicit
  boundary. Calendar time does not complete a season.

The dashboard derives its latest one-, three-, and five-season choices from
API-classified completed imports. It offers a choice only when that many
completed seasons exist, preserves non-contiguous season lists exactly in the
analysis request, and never inserts a current/partial season. With the current
release data, the five-season default remains 2021–2025.

## Freshness definitions

Rankings freshness evidence is the snapshot's `cached_at`; its season, source,
player count, and stored-artifact fingerprint are separate fields. Identity
freshness evidence is the catalog import's `retrieved_at` and SHA-256. Weekly
season freshness evidence is the latest stored import retrieval timestamp and
SHA-256 for that season. Readiness queries SQLite metadata and checks that each
referenced Parquet path is an existing regular file, but it does not open or
read the Parquet dataset contents.

Status sources distinguish availability from freshness:

- `never_imported`: no import-run evidence or stored event exists.
- `available`: a successful import run or stored event is evidence that the
  source was available.
- `unavailable`: a recorded import attempt says the source was unavailable and
  includes a reason.
- `fresh` or `stale`: calculated only from a stored retrieval timestamp using
  the source's bounded freshness window.
- `unknown`: stored evidence cannot support a freshness conclusion.

Future injury, weekly-roster, and transaction import runs record source URL,
retrieval time, fingerprint when available, record count, availability, and an
explicit failure reason. Phase 11A did not run those importers.

## Refresh preflight guarantees

`scripts/refresh_preflight.py` builds a deterministic report for rankings,
identity catalog, weekly rosters, transactions, injuries, and weekly stats. It
reports proposed URLs, current fingerprints, injected candidate fingerprints,
availability, the action that would run, the expected season classification,
and a reason for every skipped or unavailable action.

The core builder is pure and accepts current state and probe evidence as
inputs. The CLI does not access the network and does not invoke an importer. It
opens SQLite as an immutable read-only snapshot and reads rankings bytes; it
does not open Parquet. Automated coverage hashes SQLite, Parquet, rankings, and
evidence artifacts before and after the CLI and requires identical files and
file sets.

Unknown evidence fails closed: the action is skipped with a statement that no
candidate or probe evidence was supplied. Optional probing, if added later,
must remain a bounded read-only evidence-collection step outside the pure
builder.

## Failure behavior

Missing rankings or catalog metadata is returned as `unavailable` with null
source timestamps and fingerprints. No imported weekly seasons produces an
empty completed-season list. A latest weekly-source row with a non-Parquet,
blank, missing, or non-file storage path is treated as not imported and omitted
from the existing season lists and identity-miss aggregate. Missing status evidence produces
`never_imported`/`unknown`. The dashboard shows loading, metadata-unavailable,
no-completed-season, reduced-window, and current/partial-exclusion states and
disables historical execution when an exact completed-season selection cannot
be established.

Live recommendations, custom rankings, user tiers, ranking calculations,
prediction models, Realtime behavior, navigation arbitration, drawers, and
accessibility interaction contracts are unchanged.

## Phase 11B handoff

Phase 11B requires these exact reviewed inputs before any release artifact is
changed:

1. Current fantasy season `2026` and reviewed completed-through boundary
   `2025`.
2. Candidate bytes or injected probe evidence for the ESPN 2026 rankings
   endpoint, nflverse player catalog, 2026 weekly rosters, transaction ledger,
   and 2026 injuries endpoint. The 2026 weekly-stat source must remain marked
   unavailable until nflverse publishes regular-season player-week data.
3. SHA-256 fingerprints and retrieval timestamps for every available
   candidate; an explicit reason for every unavailable or intentionally
   skipped candidate.
4. Disposable copies of the release rankings JSON, SQLite database, and
   historical directory, plus an agreed before/after review destination.

Phase 11B must first run the non-mutating preflight with injected evidence,
then fetch candidates into staging, produce additions/removals/rank/team/source
and unresolved-identity diffs, and obtain review before importing into a
candidate release artifact. It must smoke the API and dashboard against that
candidate, verify custom browser ranks and tiers remain untouched, and only
then replace the local release artifact. An unavailable injury provider must
be recorded without blocking rankings, roster, or transaction work. Phase 11C,
not 11B, owns importing 2026 weekly stats when the source exists.

No 2026 rankings, catalog, roster, transaction, injury, or weekly-stat data was
downloaded or imported during Phase 11A.
