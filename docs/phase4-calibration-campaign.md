# Phase 4 live calibration campaign

The Phase 4 replay harness distinguishes regression fixtures from release
evidence. A fixture is useful for deterministic regression even when it is
synthetic; it does not count as a completed ESPN mock unless the campaign
validator accepts it.

Run the current campaign without network access or credentials:

```sh
npm run calibration:campaign -- \
  --manifest calibration-campaign/phase4-espn.json \
  --out /tmp/drafty-phase4-calibration.json
```

The command prints the complete machine-readable JSON report followed by one
concise readiness line. `canonical` has a stable evidence fingerprint;
`runtimeTelemetry` deliberately records the invocation's real local timing and
is not included in that fingerprint.

## What qualifies

Each manifest entry declares an ESPN completed-mock capture method/version and
the full fixture fingerprint. The validator then requires a recorded v1 replay,
an ESPN source record, a complete board, matching rounds/team size/pick count,
valid snake ownership, valid target-roster capacity, and a fully replayable
QB/RB/WR/TE pick sequence. It rejects synthetic fixtures, incomplete or
malformed files, mismatched fingerprints, unsupported schemas, and duplicate
captured-board fingerprints.

The full fixture fingerprint detects an edit relative to the manifest. A
separate capture fingerprint deduplicates a re-exported board even if its file
name, fixture id, rankings, or projection profile changed. Neither hash proves
that ESPN produced the file: capture provenance is explicitly declared evidence,
not cryptographic authentication.

Synthetic/generated/unit fixtures continue to protect calculations, but never
count toward mock count, slot coverage, legality/completeness/rank-order
quality, counterfactual floors, or readiness.

## Current baseline and collection matrix

The manifest counts five complete ESPN exports:
`recorded-espn-2026-slot-9.json` (10-team PPR, slot 9),
`recorded-espn-2026-slot-3-12-team-standard.json` (12-team Standard, slot 3),
`recorded-espn-2026-slot-6-10-team-standard.json` (10-team Standard, slot 6),
`recorded-espn-2026-07-31-league-1788370838-slot-1.json` (10-team PPR, slot
1), and `recorded-espn-2026-07-31-league-510719609-slot-8.json` (10-team PPR,
slot 8). The measured report is **5/5 mocks** and **5/4 distinct slots**. It
covers team sizes 10/12, PPR/Standard, and the explicit target slots 1, 3, 6,
and 9; the campaign has no remaining qualification or coverage gaps.

The slot-6 and slot-1 exports preserve valid forecast labels. Their combined
production-scored evidence has 191 labeled opponent picks across 21 labeled
windows. The slot-8 export is an intentional roster-only recovery artifact:
it qualifies as completed-board evidence but does not contribute opponent
forecast metrics. The two earlier roster-only exports remain valid as well.

## Browser export protocol

1. Finish the ESPN mock and open its **Board** tab. This avoids the scrolling
   pick-history truncation that can hide early picks.
2. Keep the dashboard open while the mock runs. It records a bounded local
   observation whenever the live overall-pick boundary advances; an observation
   contains the true provider-board boundary (normally `currPick - 1`, but also
   including observed K/DST clock picks), the deterministic live-input
   fingerprint/model identity/target roster, and the exact forecast. Duplicate
   renders replace the same boundary and a new draft session clears the local
   buffer. This is local-only: it neither needs nor trusts Realtime/API writes.
3. In the dashboard's advisor panel, use **Export replay fixture** after the
   board is complete. Preserve the exported JSON unchanged. A completed board
   opened only after the fact produces no labels. A cumulative mid-draft
   catch-up may safely record forecasts for picks strictly after its observed
   raw provider boundary, but never retrospective labels for picks already
   present in that snapshot.
4. Name it `recorded-espn-YYYY-MM-DD-league-<leagueId>-slot-<slot>.json` under
   `__tests__/fixtures/`. Keep the generated fixture id and redacted source URL.
5. Add one manifest entry with the relative fixture path, declared capture
   method/version, and its full fixture fingerprint. Never edit a fixture and
   simply reuse an old fingerprint.
6. Run the campaign command above. It must show the expected increased unique
   mock/slot coverage and no evidence failure reason before treating the draft
   as calibration evidence.

The advisor displays its local capture state and a pre-download preflight.
Confirm only after the board count and labeled pick/window counts look right.
No labels is a warning (the roster replay remains exportable); malformed labels
block normal export and require the explicit roster-only recovery path.

Kicker and D/ST picks remain clock events with explicit `advisorEligible:
false`; they must stay in the complete board. No provider news, user decision,
or GPT transcript is required for this Phase 4 evidence contract.

## Opponent forecast evidence

`forecastEvidence` is additive to fixture version 1. Older fixtures remain
valid and truthfully report opponent metrics unavailable. A labeled actual
QB/RB/WR/TE pick is scored once, from the latest valid observation strictly
before that pick. Run precision/recall and tier-crossing use a separate,
non-overlapping window rule: observations with the same terminal opponent
window use the earliest (widest) observation and score its complete original
window. This keeps the run denominator intact instead of scoring an old run
forecast against labels assigned to later forecasts.

Malformed optional evidence never changes roster/counterfactual qualification,
but it makes the campaign opponent result unavailable with explicit reasons;
the campaign does not score a mixture of accepted and rejected labels. Invalid
session, target, boundary, look-ahead, duplicate, probability-vector, model,
or fingerprint data therefore cannot inflate reported opponent metrics.
