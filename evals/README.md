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
