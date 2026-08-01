# Draft advisor evals

Run the deterministic eval suite with:

```sh
npm run eval
```

The first baseline replays the cumulative ESPN fixture and freezes the current
greedy opponent-pick model. Future fixtures should record the draft state,
configured preferences, advice timestamps, predictions, accepted decisions,
and final roster so the suite can score:

1. calculation correctness;
2. faithfulness to configured preferences;
3. positional-run prediction;
4. final-roster quality;
5. interruption count and advice timing; and
6. agreement with eventual user decisions.

Model or prompt evals may add probabilistic scorers later, but deterministic
contract, replay, and calculation failures remain hard failures.

## Phase 7 Realtime advisor baseline

Run the Phase 7 gate from the dashboard repository:

```sh
npm run eval:phase7
```

It first verifies generated API types, then runs every dashboard eval and the
API's credential-free server-owned Realtime prompt/tool-contract eval. It does
not contact OpenAI or require an API key.

The baseline intentionally evaluates the deterministic boundary around a
model, not mocked prose as if it were model quality. It hard-fails on:

- a missing, unbounded, or state-mutating model tool;
- prompt guidance that omits deterministic reads, current-revision refresh,
  explicit confirmation safety, concise advice, or an outage fallback;
- automatic advice without its source event or deterministic read grounding;
- more than one normal interruption inside the two-pick cooldown, or a missed
  urgent one-pick-away alert;
- an ambiguous or stale confirmation causing an effect; and
- p95 deterministic advice-decision latency at or above 150 ms.

The existing replay evals remain part of the same gate. They require zero
positional-rank violations, legal starter-complete rosters, the combined
opponent model to beat both simple baselines on Brier score and top-position
accuracy, and all existing local latency thresholds. A future credentialed
transcript suite should score tool-selection accuracy, evidence fidelity, and
user-decision agreement by model version; it must run in addition to this
offline safety baseline, never instead of it.

The Phase 4 opponent-model replay additionally runs the same recorded states
through `adp_only`, `need_only`, and `combined` models. It hard-fails when the
combined model no longer improves both position Brier score and top-position
accuracy over the two simple baselines, regresses run precision or recall, or
exceeds the 150 ms local p95 calculation target.

## Offline opponent-model v2 challenger

Run the format-aware challenger report with:

```sh
npm run eval:opponent-v2
```

Run its deterministic, offline tuning report with:

```sh
npm run eval:opponent-v2-tuning
```

## Offline empirical opponent-model v2

Run the five-recorded-draft empirical report with:

```sh
npm run eval:opponent-empirical-v2
```

It walks each completed fixture once and emits one canonical, teacher-forced
pre-pick example for each mapped opponent QB/RB/WR/TE pick. The feature surface
is fixed before evaluation: smoothed log ADP, direct-team-need, and recent-run
position probabilities; a normalized draft phase; position-specific
intercepts; and, only for the format model, the fixed marginal-scarcity
residual. The base model has 20 parameters (four positions × intercept plus
four base features); the format model has 24. Full-batch softmax fitting uses
fixed initialization, order, iterations, learning rate, clamps, and L2; it has
no ML dependency and does not tune PPR/Standard allocations on these labels.

Evaluation is leave-one-entire-draft-out across the five fixtures. Every fold
fits only the other four fixture IDs, then reports holdout multiclass Brier,
top-position accuracy, and log loss for frozen `combined` v1, learned base,
and learned format. Aggregate and format results are pick-count weighted.
The learned full-data coefficients are descriptive only, not holdout results.
Run/window promotion is intentionally unevaluated because these are
teacher-forced per-pick predictions rather than static boundary forecasts.

The report makes two fail-closed shadow decisions. Learned base must have a
material aggregate improvement over frozen v1 (Brier/log loss at least 1e-4,
or accuracy at least 0.005) with no aggregate or per-format material
regression. The format residual must additionally meet that same material
threshold versus learned base, stay within the fixed aggregate/per-format
regression tolerances against both models, and improve Brier or log loss in at
least 3 of 5 whole-draft folds. This keeps a one-pick or numerical edge from
being called format value. Neither result changes `combined` or the live
recorder; even a passing decision is only eligible for a new shadow-validation
slice. Sparse alternate roster shapes remain a coverage limitation, not
evidence of generalization.

### Canonical static-window residual challenger

```sh
npm run eval:static-window-backtest
```

The static-window report keeps frozen v1 and the unconstrained learned-base
LODO result as reference points, then evaluates a separate **offline-only**
position challenger. It begins from each frozen-v1 probability, applies a
class-balanced learned correction in log-probability space, and clamps each
position's correction to ±0.55 logits before renormalizing. A zero correction
is exactly frozen v1; the bound caps any pairwise odds adjustment at `exp(1.1)`.
This is distinct from the deterministic marginal-scarcity adjustment and does
not alter the live forecast, recorder, artifact, or player-selection heuristic.

The primary result is still leave-one-entire-draft-out and reports aggregate,
fixture, format, phase, and actual-position results. The actual-position
top-choice score is recall for that position, making a model that raises its
aggregate score by always preferring WR visible. Fixed offline eligibility
gates reject aggregate Brier/log-loss/accuracy and run regressions, reject a
decline greater than five percentage points in **any** QB/RB/WR/TE recall, and
require a small aggregate probabilistic improvement. Passing means only that a
candidate may be captured beside v1 in future shadow data; it never promotes a
model from this five-mock corpus.

The report also evaluates a nested-tuned challenger separately. For each final
outer holdout draft, every inner validation draft is selected from only the
remaining outer-training drafts; each residual fit therefore excludes both the
outer holdout and its current inner validation draft. The fixed candidate
family is deliberately compact: exact frozen-v1 identity, half-strength
unweighted, half-strength square-root balance, and the original full-strength
inverse-frequency balanced residual. Inner selection rejects accuracy, macro-recall, or any
position-recall regression beyond its published tolerance, requires a small
probabilistic gain, then sorts by Brier, log loss, accuracy, macro recall, and
stable candidate ID. If none qualify, it uses exact v1. The chosen candidate
is refit on all four outer-training drafts and scores only the untouched outer
draft's static windows. Both inner validation and outer scoring replay the
same canonical earliest-boundary static horizons and eligible opponent pick
labels; cached validation contexts are a performance optimization only. This
is development-only nested validation, not a
promotion search; even a passing tuned gate still requires prospective shadow
validation on more varied league formats.

Run probabilities have a separate nested selector and never replace the
per-pick position distribution shown by the advisor. Its fixed candidates are
the exact frozen-v1 run calculation, the learned-base per-slot probabilities
aggregated into the same ≥3-pick event, the bounded-residual aggregation, and
two fixed 50/50 frozen-v1/challenger run-probability blends. Blends reuse the
already-scored run outputs: they add no fit and cannot alter a per-pick
position forecast.
Inner and outer scoring use the same canonical windows. Selection prioritizes
run Brier and binary log loss while guarding the fixed 0.50 precision, recall,
and F1 plus supported per-position run behavior; positions without observed
run positives report null recall and do not silently pass a recall guard. Any
failure returns exact v1. Run aggregation always covers every opponent forecast
slot in the fixed horizon (including eventual K/DST selections), while run
labels count only QB/RB/WR/TE picks. This run-only result remains offline development
evidence and cannot promote the live forecast or recorder.

### Immutable learned-base shadow capture

```sh
npm run eval:opponent-empirical-base-shadow
```

The browser now computes the audited full-data learned-base coefficients beside
the frozen `combined` forecast at the same live, pre-pick boundary. It records
only a position/run-only `empiricalBaseShadowEvidence` envelope: a separately
versioned and fingerprinted artifact tied to the canonical campaign fingerprint
`d43e0754…c652`. It does not fit in the browser, alter recommendations, change
the frozen forecast object, or persist through the API.

The learned feature's draft phase is also stored as either a known raw board
total or a context-horizon fallback. Only known-total evidence is comparable
for promotion reporting; fallback capture remains observable but fails closed.

Historic fixtures deliberately have no such envelope. The shadow evaluator is
therefore unavailable—and promotion remains false—until a newly captured
fixture contains matching frozen-v1 and shadow boundaries. When both are
present, it reports pick-weighted position Brier/accuracy and static-window run
precision/recall only for their identical recorded horizons. Any missing,
malformed, or mismatched evidence fails closed.

The tuning report prepares every canonical evidence boundary once, then reuses
those leakage-safe contexts for four legacy one-source ablations, three
residual ablations, and a fixed nine-item grid. The first six candidates are
the unchanged baseline grid (`v1_equivalent`, `initial_v2`, and four
format-pressure blends). The three new candidates preserve the frozen
v1-equivalent ADP/direct-team-need/recent-run blend and apply only a named
`marginal_scarcity_v1` residual at strengths 0.10, 0.25, and 0.50. Validation
rejects residual configs whose normalized base differs from v1, so it cannot
quietly mix with the old format-pressure source.

The residual uses current context only. For each position it adds league-wide
remaining direct starter slots to its fixed share of remaining flex slots
(Standard RB/WR/TE = 0.50/0.35/0.15; PPR = 0.30/0.50/0.20), divides by smoothed
available and near-horizon board supply, caps the pressure at 3, scales it by
remaining-lineup-demand / total-lineup-capacity, then mean-centers and caps it
to [-0.75, 0.75]. It multiplies the frozen base probability by
`exp(strength * residual)` and renormalizes. QB has no flex allocation. Zero
strength, or no remaining direct/flex demand, returns frozen v1 exactly. These
allocations and caps are fixed design hypotheses, not values tuned on the two
fixtures.

Selection is cross-format only: it selects on Standard and reports PPR
holdout, then selects on PPR and reports Standard holdout. A candidate is
training-eligible only when it is within modest fixed tolerances of
`v1_equivalent` (Brier +0.01, top-position −0.02, run precision/recall −0.05),
then sorts by Brier, top-position, run precision, run recall, and stable id.
Full-data results are explicitly descriptive and are never presented as
holdout results. Promotion requires both folds to choose the same positive
league-aware candidate (legacy format weight or residual strength), every
held-out fold to meet non-regressing Brier and
top-position gates, every fold to stay within two points of v1 run precision
and recall, and the aggregate held-out result to meet those same gates. The
report fails closed with **no promotion** otherwise; it also never promotes
directly even if these limited gates pass, because the next required step is a
shadow validation on newly captured formats.

There are currently only two labeled, 10-team 1QB/2RB/2WR/1TE/1Flex fixtures
(one Standard and one PPR). Cross-format folds therefore provide only weak
evidence and do not empirically validate different starter counts or flex
counts. Deterministic 2QB, extra-RB, flex, and supply tests are invariants, not
alternate-format generalization evidence. `combined` and the live recorder
identity remain frozen; all tuning is offline-only.

This replays `combined` (v1) and `combined_v2` at each saved live observation
boundary. It builds a canonical, leakage-safe lower-bound roster,
available-player, and recent-pick context from only picks at or before that
boundary, then scores the same future opponent window. It cannot recreate
UI-only own-turn state that the evidence never serialized. Stored v1
probabilities are not inputs to either replay; evidence is used only for the
boundary and terminal window.

The report includes overall, per-fixture, and per-league-format metrics, plus
`v2 - v1` deltas. Negative Brier deltas are better; positive accuracy,
precision, and recall deltas are better. This is a challenger report, not a
promotion gate: the live advisor and recorder remain `combined` /
`deterministic_opponent_v1` until a later promotion slice reviews broader
format coverage and explicitly changes that default.

It also prints `v1ReconstructionDeltas` against the stored live-v1 scores.
Those are a fidelity audit, not a v2 comparison: small or non-zero differences
can arise because v1 evidence stored forecasts but not a full historical UI
context at own-turn transitions. The reconstructed path deliberately prefers
the canonical fixture's picks at/before each boundary over unavailable future
or UI-only state. Investigate large deltas before treating challenger results
as promotion evidence.

The completed-draft counterfactual replay then applies actual opponent picks
while substituting the configured user strategy at the user's snake-draft
turns. It compares `combined`, `adp_only`, `need_only`, and `rank_only` final
rosters. The combined advisor must remain legal and starter-complete, preserve
positional rank ordering, beat ADP-only starter value, remain within 90% of the
strongest simple starter-value counterfactual, match or beat their bench
ceiling, and stay below the 150 ms local p95 decision target.

The Phase 4 calibration matrix runs each completed fixture from its recorded
snake-draft slot, plus synthetic all-slot coverage for calculation regressions.
Synthetic scenarios exercise legality, completeness, rank ordering, and
latency, but only recorded fixtures count toward slot coverage and
counterfactual quality ratios. Calibration readiness is reported separately
and requires:

- at least five fixtures marked `provenance: "recorded"`;
- at least four distinct draft slots;
- 100% legal and starter-complete combined rosters;
- zero positional-rank violations;
- combined starter value at least 90% of the strongest simple counterfactual;
- combined bench ceiling above replacement at least 90% of the strongest
  legal, starter-complete simple counterfactual;
- local decision p95 below 150 ms.

Synthetic fixtures may protect calculations but never count toward the
recorded-replay threshold. After a complete live draft, use **Export replay
fixture** in the advisor panel to capture the settings, rankings, projections,
replacement levels, snake ownership, and canonical pick order needed for a
portable recorded fixture.

When the dashboard was open during that live draft, the export can additionally
contain bounded local `forecastEvidence`: pre-pick deterministic opponent
forecasts keyed by the raw provider overall-pick boundary (`currPick - 1` only
when no raw board coordinate is available). A completed board opened after the
fact generates no labels. A cumulative mid-draft catch-up may record forecasts
only for strictly future picks; it never creates retrospective labels for picks
already observed in that snapshot. Replay scoring uses the latest valid pre-pick forecast
once per QB/RB/WR/TE actual pick; run/tier scores use one earliest/widest
representative per identical terminal forecast window. Optional malformed
evidence makes opponent reporting unavailable rather than contributing partial
or synthetic metrics. Existing fixtures without these labels remain valid and
report opponent metrics unavailable.

ESPN's scrolling pick history can omit early picks after a long draft. Open the
ESPN **Board** tab after completion so the extension can emit the authoritative
full board. Kicker and D/ST picks remain in the fixture as draft-clock events
but are explicitly excluded from QB/RB/WR/TE advisor decisions.

For a captured board JSON, the equivalent CLI path is:

```sh
npm run calibrate:espn -- \
  --board /path/to/espn-board.json \
  --rankings /path/to/latest-player-rankings.json \
  --out __tests__/fixtures/recorded-espn.json \
  --ranker ESPN
```

Print the current calibration metrics and readiness audit with:

```sh
PHASE4_REPORT=1 npm test -- \
  --runInBand __evals__/phase4Calibration.eval.test.ts
```

For the fail-closed live-evidence campaign (including fixture provenance,
deduplication, coverage, and exact remaining collection gaps), run:

```sh
npm run calibration:campaign -- \
  --manifest calibration-campaign/phase4-espn.json \
  --out /tmp/drafty-phase4-calibration.json
```

See `docs/phase4-calibration-campaign.md`. Synthetic/generated fixtures are
regression inputs only and never count as live ESPN calibration evidence.

The live advisor visibly reports local capture state and shows a preflight
before export. Preflight separates locally computable labels from authoritative
ESPN campaign provenance; declared-local capture is not cryptographic source
authentication.

# Canonical static-window opponent backtest

`npm run eval:static-window-backtest` scores the five recorded ESPN mocks without
reading either live `forecastEvidence` or `empiricalBaseShadowEvidence`.

The boundary policy is frozen in `staticWindowBacktest.ts`: for every target
manager pick with an intervening opponent slot, the terminal horizon is that
pick; the selected boundary is draft start for the first target pick and
otherwise the preceding target pick. This is the widest available post-target
window for each unique next-target horizon.
Eligible QB/RB/WR/TE opponent pick labels are therefore non-overlapping and
appear once; run windows are independent representatives rather than repeated
rolling windows. The final opponent slots after the target's final pick are not
covered.

The primary learned-base result is leave-one-entire-draft-out. Each held-out
fixture is predicted with a base softmax fit only on the other complete mocks.
The immutable five-fixture artifact is printed only as a clearly marked,
descriptive in-sample parity result. This report is offline-only and never
promotes or changes the live model.

It reports multiclass Brier, top-position accuracy, log loss, the existing
conditional-player top-1/top-3 surface, top-label calibration bins/ECE, and
run Brier plus the predeclared 0.25/0.50/0.75 precision-recall-F1 sweep.
Calibration bins are `[lower, upper)`; only the final bin includes probability
`1`, so an exact interior edge belongs to the following bin.
