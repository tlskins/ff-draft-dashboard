# Phase 8 integration baseline

This record establishes a reproducible Phase 8 integration baseline for the
dashboard, embedded Chrome extension, and companion Flask API. It is
documentation and verification only; it changes no application behavior.

## Provenance

- Dashboard Phase 8A source: `993af66426a44c32407c2566cbe8ba85a36b75b6` on
  `codex/phase-8a-roadmap-reset`.
- Expected Phase 8A parent: `a447eadd041a23f8a7c6461899430560a81df4e9`
  (`feat: add run-only shadow capture`).
- The Phase 8A commit is exactly one descendant of that parent and changes
  only `README.md` and documentation files.
- Candidate branch: `codex/phase-8b-integration-baseline`, created from the
  exact Phase 8A source commit above.
- Companion API: `2a07eb3fb2d9650cfc7b7216f745a3756b59eb36` on
  `refactor/realtime-foundation`.
- Embedded extension manifest: `public/manifest.json` version `0.0.0.8`.
- The Phase 8A worktree, original dashboard checkout, and API checkout were
  clean at their required commits, and no unexpected worktree or branch
  collision was present.

## Verification

All required gates passed on 2026-08-01. The checks were credential-free and
local/fixture-backed. No OpenAI, ESPN, nflverse, ranking refresh, or provider
import/refresh command was run.

| Command | Result |
| --- | --- |
| `npm run api:types:check` | PASS — generated API types are current. The first invocation was blocked before validation by the worktree-relative sibling API path; after adding a disposable symlink outside both repositories to the unchanged authoritative API checkout, the exact command passed. |
| `npm test -- --runInBand` | PASS — 63 suites passed and 1 skipped (63/64 total); 260 tests passed and 2 skipped (262 total); 220.838s. |
| `npm run build` | PASS — production build compiled successfully, generated 3 static pages, and completed `lint:build`; existing Browserslist/Tailwind warnings were non-fatal. |
| `npm run eval:phase7` | PASS — 10 evaluation suites and 16 tests passed in 156.122s; API `tests.test_realtime_eval` ran 3 tests and returned `OK`. |
| `npm run e2e:espn` | PASS — 1 suite and 2 tests passed in 1.14s, including local HTTP/SQLite round-trip and outage fallback. |
| `npm run calibration:campaign -- --manifest calibration-campaign/phase4-espn.json --out /var/folders/yd/ff1j31716dj8rgnng5s710700000gn/T/drafty-phase8b-calibration.ADd0I0Vr` | PASS — `READY`; 5/5 qualifying mocks, 5/4 distinct target slots, no remaining gaps; canonical fingerprint `d43e0754c60937794fabcf3fbf89cf7cad43fea6133274255d56008271f6c652`. |
| `.venv/bin/python -m unittest discover -s tests` (from the unchanged API checkout) | PASS — 71 tests ran in 2.844s; `OK`. |

The campaign report covered team sizes 10/12 and PPR/Standard formats. Its
qualifying draft slots were 1, 3, 6, 8, and 9, with a target distinct-slot
count of 4.

The frozen v1 opponent model remains live. The empirical-base and bounded-
residual run-only challengers remain observation-only; no challenger was
promoted.

## Operationally unverified roadmap checks

The following remain unverified and are not silently treated as passed:

- Credential-backed Realtime browser/device smoke.
- Rankings/tiers usability review.
- Four-view visual review.
- Manual screen-reader and narrow-viewport audit.

## Integration closeout

The root orchestrator reviewed the candidate and fast-forward integrated it
into `refactor/realtime-foundation`. The annotated baseline tag is created as
part of this closeout; Phase 8 integration is complete. This closeout does not
change the operationally unverified checks above or promote a model.

- Annotated baseline tag: `phase8-integration-baseline-2026-08-01`.
- Rollback boundary: dashboard `a447ead` plus API
  `2a07eb3fb2d9650cfc7b7216f745a3756b59eb36`.
