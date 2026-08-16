# Phase 13B deterministic extension packaging

Phase 13B supplies the reproducible packaging boundary that Phase 13A checks.
It is dashboard-only: it builds the checked-in Chrome-extension archive from
the existing `public/manifest.json` and local assets. It does not change the
manifest version, permissions, match patterns, runtime assets, data, API,
deployment, tags, or browser acceptance status.

## Commands

```sh
npm run extension:package
npm run extension:package -- --verify
npm run extension:package -- --out /tmp/ext_release_0_0_0_8-second.zip
```

The default output is derived only from the manifest version:
`ext_release_<version-with-underscores>.zip`. The command creates it only when
it is absent. It never overwrites an existing archive; `--verify` rebuilds in
memory and succeeds only when the existing archive is byte-identical. `--out`
supports an explicit throwaway destination for reproducibility checks.
The version must satisfy Chrome extension syntax: one to four integer components
from 0 through 65535, no non-zero leading zeros, and not all components zero.

The repository-local Node implementation writes an uncompressed ZIP with the
valid fixed DOS timestamp `1980-01-01 00:00:00`, stable entry order, and no
absolute paths. Entries are
`manifest.json` followed by each unique local manifest-referenced asset in
manifest order. This preserves `espnDraftExtractor.js` before
`contentScript.js` because that is their content-script order. Two builds from
unchanged source bytes are byte-identical, independent of source file mtimes.
Missing, absolute, traversal, backslash, empty-segment, symlinked, or non-file
assets fail closed. No third-party packaging dependency or shell command is
used.

The generated `ext_release_0_0_0_8.zip` is tracked intentionally. Phase 13A
then verifies it is a readable tracked ZIP whose manifest is semantically equal
to `public/manifest.json` and whose referenced bytes equal the source assets.
Older `ext_release_*` archives remain historical artifacts and are untouched.

## Limits and rollback

This is packaging evidence only. Human-directed Chrome loading/ESPN selector
acceptance, local live mock acceptance, VoiceOver/device checks, release
approval, deployment, tag, and push remain unrun. Frozen prediction v1 remains
release-acceptable; Phase 9 is evidence-blocked and Realtime GPT/voice remains
deferred.

Rollback is a normal Git revert of the Phase 13B packaging commit, including
the generated archive. Do not remove historical archives or mutate active
browser data as part of rollback.
