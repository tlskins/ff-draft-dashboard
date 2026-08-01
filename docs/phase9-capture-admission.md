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

## Admission safety

Admission takes an exclusive cooperative lock at
`<manifest-path>.phase9-lock` before reloading the authoritative manifest,
declared fixtures, content hashes, and destination state. A pre-existing lock
fails closed without changing anything. The lock is removed only when this
process can prove it created that lock. If a lock remains after an interrupted
run, inspect the process, lock owner/context, and repository state first; remove
only a genuinely stale lock, never an unexplained or active lock.

The locked manifest bytes are the admission snapshot. A manifest changed after
the snapshot causes `manifest_changed_during_admission`; the newer manifest is
preserved and the transaction removes only artifacts it can prove it created.
The final fixture is created with exclusive no-clobber semantics. A destination
that appears after preview is refused and preserved byte-for-byte. Manifest
updates use a separately exclusive partial file and an atomic replacement only
after the locked snapshot is rechecked.

Before a candidate is classified, every current fixture input must load and
pass the unchanged evaluator. Missing, unreadable, unsafe, invalid-UTF-8,
tampered, mismatched, invalid, excluded, or unlisted current evidence blocks
new admission. A valid informational nonstandard roster does not block by
itself; ordinary campaign coverage gaps also remain admissible.

## Failure recovery

Invalid, retrospective, incomplete, tampered, duplicate, uncalibrated, or
unsafe evidence is rejected without admission. Do not repair the raw export.
Keep it unchanged, preserve the printed reason codes, and obtain a fresh
recorder export if capture was incomplete. A stale `.phase9-partial` file
means a prior admission stopped during recovery; inspect it and remove only
that narrowly identified temporary artifact before retrying.

If fixture writing succeeds but manifest writing fails, the workflow removes
the newly written fixture only after verifying its transaction identity. If
that identity cannot be proven, a recoverable orphan is left in place rather
than risking deletion of another file. The manifest is never intentionally
left pointing to a missing or partial fixture. Check repository status before
retrying and remove only the narrowly identified partial/orphan artifact after
inspection.

Never delete or recreate raw evidence, edit it to satisfy validation, or repair
the campaign manifest around corrupted existing evidence. Resolve the existing
campaign corruption first, preserving the original raw files and failure
report.

Raw evidence and its manifest entry should be committed separately from
evaluator or workflow code. Never edit the policy fingerprint, evaluator,
model, thresholds, canonical-window rules, or historical fixtures during
evidence collection.
