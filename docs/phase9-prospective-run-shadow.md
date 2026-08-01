# Phase 9A prospective run-shadow evaluator

Phase 9A is a deterministic, provider-free evidence evaluator. It does not
capture a browser draft, fit a model, change candidate weights, or promote a
challenger. The frozen live identity remains `combined` /
`deterministic_opponent_v1`; `bounded_residual_run_shadow_v1` remains
observation-only.

Run the empty checked-in campaign with:

```sh
npm run eval:phase9-prospective -- \
  --manifest prospective-campaign/phase9-prospective-run-shadow.json \
  --out /tmp/drafty-phase9-prospective-report.json
```

The initial report is intentionally `status: "evidence_blocked"` with zero
eligible fixtures and no aggregate metrics. Missing metrics are omitted rather
than zero-filled. The report is deterministic JSON with stable fixture,
coverage, reason-code, and metric ordering.

Version 2 is pinned to policy SHA-256
`c4d950474e7dd6aae37cc18ba18b356dba2668cd6d626aaa4b5048e5fd29aad7`. The
manifest baseline, policy contents, and fingerprint must all match this
binding; adding evidence entries does not change it. A policy change requires a
new policy version and fingerprint.

## Admission and scoring boundary

An entry in the versioned campaign manifest binds a fixture path, raw-file
SHA-256, fixture ID, ESPN completed-mock provenance, and the Phase 8 baseline
commit/tag. The evaluator hashes raw content before parsing it. A changed file,
unlisted input, duplicate fixture, legacy capture, malformed envelope, or
retrospective capture is excluded or invalid with a stable reason code.

An eligible fixture must be a complete future capture after the Phase 8
baseline, have matching session and target roster identity, and contain paired
frozen-v1 and bounded-residual observations at every non-empty canonical
static-window boundary. The evaluator reports expected, captured, comparable,
scored, missing, and extra window counts and rejects partial, duplicate,
shifted, or truncated topology. Shadow phase provenance must be `known_total`;
the canonical run-only validator pins model identity, artifact ID, artifact
fingerprint, training corpus fingerprint, and forecast/envelope identity
consistency. Frozen run probabilities must match both the stored v1 forecast
and its canonical probability-of-at-least-three calculation. Labels are mapped
only from actual opponent picks strictly after the observation boundary; K/DST
slots remain in the horizon but are not positive QB/RB/WR/TE labels.

The live recorder may also retain valid paired observations between canonical
target-pick boundaries. Every stored observation is still integrity-validated
for provenance, session, target roster, boundary, horizon, phase, fingerprints,
probabilities, and future labels. The complete canonical subset alone supplies
`captured`, `comparable`, `scored`, denominators, labels, metrics, and gates;
valid noncanonical observations are reported in `windowCoverage.extra` but
cannot affect scoring. An invalid extra observation fails closed, and a missing
canonical observation remains evidence-blocking even when extras are present.

Position metrics are the stored frozen-v1 reference: position Brier score,
top-position accuracy, and fixed-bin calibration. The current run-only shadow
envelope stores no challenger position probabilities, so challenger position
metrics are explicitly unavailable. Run metrics use the existing canonical
three-pick event and 0.50 threshold: Brier/log loss, calibration signal,
precision, recall, and F1 for frozen v1 and the challenger, with explicit
deltas and directional outcomes. Exact-player results are not emitted and
cannot affect any gate.

## Predeclared policy

The campaign requires five eligible calibrated fixtures, four distinct draft
slots, both 10- and 12-team coverage, both PPR and Standard, the calibrated
roster shape `QB1-RB2-WR2-TE1-FLEX1-BENCH7`, and at least two complete windows
in every required marginal subgroup. The five-fixture/four-slot counts reuse
the existing Phase 4/8 campaign sufficiency semantics. The complete-window
support guard is explicit because fixture count alone could otherwise admit
partial drafts.

Other structurally valid roster configurations remain supported but are not
prospectively calibrated. They continue through structural validation and
their roster metadata is reported as informational evidence, but they do not
count toward the five calibrated fixtures, calibrated aggregates, promotion
gates, or required subgroups, and they cannot replace a calibrated-shape
fixture. No numeric confidence penalty is assigned. A future runtime slice
may use roster settings for deterministic demand adjustments; this evaluator
does not. The product should eventually show an “unvalidated league format”
warning when predictions are used outside the calibrated shape.

The position policy is reference-only in this run-only slice: frozen-v1
position Brier, top-position accuracy, and calibration verify the frozen
reference surface, while challenger position comparison is unavailable and
has no inactive numerical threshold. The run policy reuses the existing
static-window tolerances: Brier/log-loss regression no worse than 0.01,
precision/recall/F1 regression no worse than 0.05 at 0.50, and aggregate
material Brier or log-loss improvement of 0.002. Each adequately supported
scoring-format, team-count, and roster-shape subgroup must satisfy the no-harm
limits; a subgroup need not independently improve, but under-support blocks the
report. Exact-player metrics are never emitted or gated. A passing report is
still evidence for a later dossier, never a promotion result.

## Later capture-only handoff

After a completed draft has captured both envelopes, keep its raw JSON
unchanged under `prospective-campaign/fixtures/`. Compute its hash, then add
one manifest entry with the exact path, fixture ID, SHA-256, baseline commit and
tag, and capture provenance. Run the unchanged evaluator and pass the admitted
path:

```sh
npm run eval:phase9-prospective -- \
  --manifest prospective-campaign/phase9-prospective-run-shadow.json \
  --fixture prospective-campaign/fixtures/<completed-fixture>.json \
  --out /tmp/drafty-phase9-prospective-report.json
```

The capture session must not edit evaluator logic, infer labels from an old
fixture, rewrite a fixture after hashing, or treat a passing observation gate
as permission to switch the live model. Add only the raw fixture and one
hash-bound manifest declaration; do not add a new policy fingerprint. The
report's `evidence`, per-fixture/aggregate `windowCoverage`, `stratified`,
`coverage`, `gates`, `nextCaptureNeeds`, and `promotion.promoted: false` fields
are the inputs for the later Phase 9 dossier.

Phase 9B may resume capture against this amended policy. The calibrated
campaign requires only `QB1-RB2-WR2-TE1-FLEX1-BENCH7`.

Important reason codes include `fixture_hash_mismatch`,
`unlisted_evidence`, `retrospective_evidence`, `fixture_incomplete`,
`session_mismatch`, `target_roster_mismatch`, `duplicate_boundary`,
`boundary_mismatch`, `horizon_mismatch`, `fallback_phase_provenance`,
`frozen_probability_mismatch`, `challenger_model_identity_mismatch`,
`challenger_artifact_fingerprint_mismatch`, `policy_fingerprint_mismatch`,
`malformed_fixture_json`, `malformed_probability`,
`canonical_window_incomplete`, `uncalibrated_roster_shape`,
`required_subgroup_insufficient`,
`zero_eligible_fixtures`, `coverage_insufficient`, and `run_gate_insufficient`.
