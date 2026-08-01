# Phase 9B capture admission runbook

This workflow admits only unchanged, locally recorded ESPN completed-draft
exports. It does not control Chrome, join a draft, collect a mock, change the
Phase 9 policy, tune a model, or promote the observation-only challenger.

## Operator procedure

1. The user manually joins and completes an ESPN mock. Keep the dashboard and
   recorder running locally; no assistant browser control is required.
2. Save the raw recorder export unchanged. Keep the original file as the
   recovery copy and do not format, sort, edit, or rewrite it.
3. Preview it from the dashboard repository:

   ```sh
   npm run phase9:capture -- \
     --fixture /path/to/raw-export.json
   ```

   Preview is the default and performs no filesystem mutation. It prints the
   exact SHA-256, fixture/evidence identity, deterministic destination,
   hash-bound manifest entry, calibrated/informational/invalid classification,
   hypothetical campaign coverage, evaluator gaps, and `promoted: false`.
4. Review the identity, digest, roster classification, canonical-window
   result, and remaining gaps. A structurally valid nonstandard roster is
   informational only and cannot enter the calibrated campaign.
5. Admit only after review with the explicit mutating flag:

   ```sh
   npm run phase9:capture -- \
     --fixture /path/to/raw-export.json \
     --admit
   ```

   Admission repeats validation, writes the raw bytes atomically under
   `prospective-campaign/fixtures/`, updates the manifest deterministically,
   then runs the unchanged prospective evaluator.

## Failure recovery

Invalid, retrospective, incomplete, tampered, duplicate, uncalibrated, or
unsafe evidence is rejected without admission. Do not repair the raw export.
Keep it unchanged, preserve the printed reason codes, and obtain a fresh
recorder export if capture was incomplete. A stale `.phase9-partial` file
means a prior admission stopped during recovery; inspect it and remove only
that narrowly identified temporary artifact before retrying.

If fixture writing succeeds but manifest writing fails, the workflow removes
the newly written fixture on a best-effort basis and never leaves the manifest
pointing to a missing or partial file. Check repository status before retrying.

Raw evidence and its manifest entry should be committed separately from
evaluator or workflow code. Never edit the policy fingerprint, evaluator,
model, thresholds, canonical-window rules, or historical fixtures during
evidence collection.
