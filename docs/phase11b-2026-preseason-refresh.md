# Phase 11B reviewed 2026 preseason refresh

## Stable-universe correction candidate

The original, technically validated 436-player candidate below was promoted by
an older parallel continuation and checkpointed at API `959bcc5`. That result is
historically valid evidence, but its replacement semantics are superseded: one
ESPN response is source-presence evidence, not authority to delete a previously
known player. The authoritative `refactor/realtime-foundation` checkout remains
on that 436-player artifact while this correction is reviewed and integrated.

The correction was rebuilt from post-Phase-12 baselines API `40da040` and
dashboard `53697b5`. A provider-free replay used only the frozen August 13
source bytes and the verified pre-promotion Phase 11A backup. Its fresh evidence
is under `stable-player-universe-stage-b-v3`; the generated rankings SHA-256 is
`82d3f8025f8dc67355f9eef6f6111843ac29b315ceb81d0a1a84e69810f41b81`.
The correction worktrees and embedded dashboard snapshot contain that exact
455-player artifact.

The corrected result has 19 newly ranked players, 417 still present in ESPN,
and 19 retained players absent from the current ESPN response, with zero stable
identity losses. ESPN-absent players have no active ESPN rank; their last rank
is isolated as lineage metadata. Normalized availability is 426 ranked/current
and automatically recommendable, 15 active-unranked, three reserve, one free
agent, ten unknown/unmapped, and zero terminal inactive. The ten suppressed
ESPN-present players retain current rank lineage; notably, frozen RLS evidence
suppresses Brandon Aiyuk without deleting his ESPN ranks. Only RET is terminal;
INA and EXE are nonterminal reserve states.

SQLite reconciliation found the correction changes rankings semantics, not the
reviewed Phase 11B identity/status imports. Against both the promoted 436-player
SQLite and superseded Stage B database, every existing path-normalized table
and row is equal. The corrected disposable database adds only the empty Phase
12 `ranking_source_observations` table created during app initialization. From
the Phase 11A backup, the same reviewed changes remain: 20 retained/additional
canonical identities, 29 external IDs, eight status events, three source runs,
and one additional identity-source observation. Completed 2021–2025 Parquet
artifacts remain byte-identical and 2026 weekly stats remain absent.

Phase 11B remains open until the correction commits are reviewed and integrated
into the authoritative branches. No provider request, deployment, tag, push,
Phase 11C import, or authoritative SQLite promotion occurred during this
correction.

## Authoritative promotion result and gate

After explicit Stage B approval, the reviewed candidate rankings and SQLite
were atomically promoted into the authoritative API checkout on August 13,
2026. The exact integrated 15 API and two dashboard paths were first frozen in
the non-Git packet
`phase-11b-2026-08-12/detached-input-evidence-20260813T123004Z` (manifest
SHA-256 `2b257619a97beac89cbe2f076c2cde5a3a3fc7778da4f6984f967a007a903c0e`).
The active isolated worktrees were not consulted during this continuation.

The promoted rankings SHA-256 is
`17b6c651d0970e866ad27b864e720b0996fcc5ce6753ead55a030d21203c07ad`.
The promoted SQLite raw SHA-256 is
`b81be04950f5c7ec76f911d9df123cedfc08e9127bad1c6618d8ce55bb80a3b7`;
it differs from the disposable candidate bytes only because its five historical
storage paths were rebound to the authoritative files. A newly specified
canonical digest over all 15 logical tables is
`11aefd30606a9f7f0fd181f97ea9c0317318854370c1147729c8bea3fde8dccb`
for the candidate, rebound temporary copy, and promoted database. SQLite
integrity passed, the repository contains 8,384 identities and eight status
events, and the completed 2021–2025 Parquet files remain byte-identical. There
is no 2026 weekly-stat source or file.

A fresh provider-free replay from the promoted release was logically
idempotent and did not mutate it. The post-promotion API gate passed 97/97;
the dashboard gate passed 74 runnable suites and 452 runnable tests, with one
suite and two tests intentionally skipped. Generated API types, optimized
build, lint/type validation, static export, and candidate-host embedding passed.
Live API/dashboard smoke returned HTTP 200 for readiness, rankings, changed and
unchanged status, 2021–2025 historical comparison, and the dashboard root.

Complete post-promotion evidence is under
`phase-11b-2026-08-12/post-promotion-evidence-20260813T123143Z`. The verified
rollback backup remains at
`phase-11b-2026-08-12/pre-promotion-backup-20260813T120914Z` with manifest
SHA-256 `a744960257b8b8bbb8ec2f337800dd35d56f805c9c4246292b87380150dbad28`.
No staging, commit, tag, push, deployment, provider request, installation, or
2026 weekly-stat import occurred in that historical continuation. Its technical
gate passed for the superseded replacement policy; the stable-universe Phase
11B gate remains open as described above.

## Stage B candidate result

Stage A was approved and the Stage B candidate-release rehearsal completed on
August 13, 2026. The candidate reproduced the approved R1 preview from the exact
frozen A bytes and passed full proportionate API/dashboard gates. It is
preserved at
`/Users/timothylee/Projects/ff-draft-refresh-state/phase-11b-2026-08-12/candidate-release-rehearsal-v1`.
Its human report is
`reports/phase11b-stage-b-candidate.md` and its complete machine evidence is
`reports/phase11b-stage-b-candidate.json` beneath that root.

The candidate rankings are byte-identical to R1 at
`17b6c651d0970e866ad27b864e720b0996fcc5ce6753ead55a030d21203c07ad`.
Every path-normalized logical SQLite table and row is identical to R1 at
`30df1b58b765211ed9b3abaee8c181ae275c3309c7e9b7299799726c32238295`;
raw SQLite file bytes differ because each disposable copy contains its own
absolute historical storage paths. All five completed Parquet snapshots remain
byte-identical. Repeat import is logically idempotent.

API tests passed 97/97. Dashboard tests passed 74 runnable suites and 452
runnable tests, with one suite and two tests intentionally skipped. The
optimized build, lint/type validation, static export, generated API-types check,
candidate API startup, dashboard startup, and required live HTTP smokes passed.
The browser-owned custom-rank/tier implementation is unchanged and the
rehearsal did not access browser local storage.

At this Stage B gate no authoritative artifact had yet been replaced. The later
separately authorized promotion is recorded above. No staging, commit, tag,
push, provider request, or 2026 weekly-stat import occurred during Stage B.

## Stage A result and gate

Stage A completed from the integrated Phase 11A baselines on August 12, 2026
(America/New_York) and was explicitly approved before Stage B began. At the
Stage A gate no candidate-release copy had been created and no authoritative
release artifact had been replaced.

The three locations remain distinct:

- Raw staging:
  `/Users/timothylee/Projects/ff-draft-refresh-state/phase-11b-2026-08-12/raw`
- Reconciled disposable preview:
  `/Users/timothylee/Projects/ff-draft-refresh-state/phase-11b-2026-08-12/reconciled-preview-r1`
- Candidate release: subsequently created by the approved Stage B rehearsal at
  `phase-11b-2026-08-12/candidate-release-rehearsal-v1`.

The reconciled human report is
`reconciled-preview-r1/reports/phase11b-stage-a-preview.md` (SHA-256
`e0fe922f63c3b3cfcc33574c7a4e94ec60c98463cdfc27b7669d01878b50ae6d`),
the complete machine report is
`reconciled-preview-r1/reports/phase11b-stage-a-preview.json` (SHA-256
`61de0c25e76281b5e623cde5517e3c808084b92e96ce910ee048be269e36525b`), and its
executed non-mutating preflight is
`reconciled-preview-r1/reports/refresh-preflight.json` beneath that root. The
earlier `preview/`, `reconciled-preview/`, and `reconciled-preview-pre-final/`
outputs are preserved as historical Stage A evidence but are no longer the
canonical review report.

## Provenance and frozen candidates

The bounded staging command recorded the original URL, final result, retrieval
time, HTTP status, exact bytes, and SHA-256 in `raw/source-manifest.json`.
Preview importers read only the staged files and explicit retrieval timestamps.

| Source | State | HTTP | Retrieved (UTC) | SHA-256 |
| --- | --- | ---: | --- | --- |
| ESPN 2026 rankings | available | 200 | 2026-08-13T03:43:50.093200Z | `b03899a6a4b7d6ab6420ee1b34055f7e48d3f8d21f83c0dfd5264fde5df183db` |
| nflverse players | available | 200 | 2026-08-13T03:43:50.920000Z | `944cfe5559ef5f8f922a1ae2fd3b2af4851333ad91bd5946053941c4270905e3` |
| nflverse 2026 weekly rosters | available | 200 | 2026-08-13T03:43:51.267511Z | `9fd78cf6a9a6b1e1cbb0a611a1bbfc569e8514428dcc7ca028b8c5a570e20ae3` |
| nflverse transactions | available | 200 | 2026-08-13T03:43:51.431137Z | `3180574aca356c5f89488ecce6babe88703967109f98775bce7c1620ef4c9f53` |
| nflverse 2026 injuries | unavailable | 404 | 2026-08-13T03:43:51.593795Z | none |
| nflverse 2026 weekly stats | intentionally skipped | not probed | n/a | none |

The injury URL returned HTTP 404. This optional source is recorded as
unavailable and does not block drafting. Weekly player statistics were not
probed or imported because Phase 11C owns the current/partial 2026 weekly-stat
product.

## Preflight and proposed actions

The canonical preview command invoked the modified Phase 11A preflight itself
against the authoritative rankings file and sidecar-aware SQLite view before
creating or importing into the preview. Its machine record includes the exact
command, monotonic start/finish timing, return code, stdout hash, and
before/after hashes. It classified 2026 as `current_partial`, reported
`mutates_data: false`, and proposed exactly:

- `refresh_rankings`
- `refresh_identity_catalog`
- `import_weekly_rosters`
- `import_transactions`

It skipped injuries with the HTTP 404 reason and skipped weekly stats with the
Phase 11C reason. Before/after hashes of rankings, SQLite plus its WAL/SHM
sidecars, all five Parquet files, the source manifest, every available frozen
provider file, and injected preflight evidence were identical.

## Rankings preview

The superseded rankings snapshot remained 436 players, with 19 additions and 19
removals. The correction above retains all 19 removals in a 455-player stable
universe.
The additions are Laquon Treadwell, Ko Kieft, Jack Stoll, Kene Nwangwu, DeeJay
Dallas, Brycen Tremayne, Dylan Laube, Isaac Guerendo, Jacob Saylors, Sam Howell,
Luke McCaffrey, Bam Knight, Josh Williams, Brashard Smith, CJ Daniels, Rasheen
Ali, Barion Brown, Drew Allar, and Justin Joly.

The removals are Teddy Bridgewater, Chris Manhertz, Tyreek Hill, Mason Rudolph,
JuJu Smith-Schuster, Braxton Berrios, Van Jefferson, Gardner Minshew II, David
Moore, Lucas Krull, Joe Milton III, Devin Culp, Blake Whiteheart, Ricky
Pearsall, Arian Smith, Trey Benson, Mason Tipton, Chris Brazzell II, and Kameron
Johnson.

Two retained identity fields changed: Stefon Diggs moved from free agent to
Washington, and Deebo Samuel became Deebo Samuel Sr. and moved from free agent
to San Francisco. Among retained players, 415 had at least one ESPN rank or ADP
change: ADP changed for 400, PPR overall rank for 280, PPR positional rank for
253, standard overall rank for 296, and standard positional rank for 269.

Using the report's bounded material threshold of 12 PPR overall-rank places, 97
retained players moved materially. The largest movements are shown in the
human report; several are fringe/fullback records with very large changes, so
this is an explicit review item rather than an automatic acceptance signal.

For every retained player, Harris, FantasyPros, every other non-ESPN ranking
payload, and `historical_stats` were byte-for-byte equivalent as canonical
JSON. The reconciled generated candidate rankings fingerprint is
`17b6c651d0970e866ad27b864e720b0996fcc5ce6753ead55a030d21203c07ad`.

## Identity catalog preview

The frozen source contains 8,368 fantasy-position identities versus 8,364 in
the July 30 source: 20 additions, 16 source removals, and 96 changed retained
identities. Changed fields comprise 70 team changes, 52 status changes, one
position change, and one name change; a row can contribute to more than one
field count.

The repository retains all prior canonical rows and aliases so completed
historical identity resolution is not lost. It contains 8,384 canonical rows
after adding/updating the new source, while readiness honestly reports the new
source row count of 8,368. All 16 source removals remain as historical aliases.
The machine report contains all 20 added, all 16 removed, and all 96 changed
retained identities; none of these arrays is truncated.

## Rosters, transactions, injuries, and unresolved identities

The weekly-roster asset has 2,930 source rows and 915 current fantasy players.
It contains only week 1, with no previous week, so the adapter correctly emits
zero suspension, resolution, or team-change events.

The transaction ledger has 4,975 total source rows and 26 player rows for 2026.
Eight mapped events were generated:

- David Montgomery: Detroit to Houston, March 2.
- DJ Moore: Chicago to Buffalo, March 5.
- Michael Pittman Jr.: Indianapolis to Pittsburgh, March 9.
- Geno Smith: Las Vegas to the New York Jets, March 10.
- Justin Fields: the New York Jets to Kansas City, March 16.
- Jaylen Waddle: Miami to Denver, March 17.
- Andy Dalton: Carolina to Philadelphia, March 18.
- Dontayvion Wicks: Green Bay to Philadelphia, April 10.

Every unresolved identity is retained in the machine report and grouped here:

- `espn_rankings / no_nflverse_espn_mapping` (9): Kyle Juszczyk,
  Michael Burton, Andrew Beck, Alec Ingold, Adam Prentice, Connor Heyward,
  Travis Hunter, Mike Washington Jr., and Riley Nowakowski.
- `transactions / no_canonical_pfr_mapping` (18): Colby Wooden, Garrett
  Bradbury, Jermaine Johnson, Juice Scruggs, Kai Kroeger, Maason Smith, Marte
  Mapu, Minkah Fitzpatrick, Osa Odighizuwa, Rashan Gary, Ruke Orhorhoro, Solomon
  Thomas, Sydney Brown, T'Vondre Sweat, Taron Johnson, Trent McDuffie, Tytus
  Howard, and Zaire Franklin.

The unresolved transaction rows are predominantly non-fantasy positions and
did not trigger guessed mappings.

## Preservation, readiness, and idempotency

The five completed Parquet artifacts are byte-identical before and after the
preview copy. Their file SHA-256 fingerprints are:

| Season | File SHA-256 |
| ---: | --- |
| 2021 | `0f93a1336f5bbba9554da1f97617f7d811ed72fcc1b26ba72b51c0a780b53d3c` |
| 2022 | `29320b35368eb64039f12fd7c8cef04bf1f227f2af8b2adf8acc513914318312` |
| 2023 | `92b32f3ea0c26f6aba3d64c78c27f240335b3ada53779b456e35549a08796eb5` |
| 2024 | `fac09ff77236b6ad3c53e83ce60178e821e84c935735d83e989e5b0a36140cb7` |
| 2025 | `9aaf02ab242634881a427180eb3bcae0b64463bba3a5510cd2420d320a3281d6` |

Readiness before and after keeps `completed_season_through: 2025`, completed
seasons exactly 2021–2025, and no current/partial weekly season. After refresh,
rankings and the catalog carry the frozen fingerprints; rosters and
transactions are available; injuries are unavailable with the HTTP 404 reason.
There is no 2026 row in `historical_sources`.

Ranking-profile and revision tables are unchanged. Browser-owned custom
positional ranks and tiers are outside this API-only workflow and were not
touched; no browser-asset byte-preservation claim is made. Repeating the exact preview import produces
the same logical fingerprints for rankings, identities, status events, source
runs, and historical files; exact replay is logically idempotent.

The historical focused preview smoke passed for `GET /v1/data-readiness`, the
then-436-player rankings endpoint, a changed-player transaction status, an
unchanged-player empty status, and a five-source 2021–2025 historical
comparison. The correction reruns these gates against 455 players.

## Historical replacement and integration boundary

Stage B created and validated the fresh candidate-release copy after explicit
approval. At that historical gate, replacement remained separately gated. The
subsequently authorized detached-input continuation promoted only the reviewed
rankings and SQLite artifacts and ran the complete post-promotion gates. It did
not stage, commit, tag, push, deploy, import 2026 weekly stats, or alter any
completed historical Parquet artifact.
