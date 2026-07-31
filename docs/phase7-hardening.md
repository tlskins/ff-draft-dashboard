# Phase 7 hardening

Phase 7 begins with one fixture-driven acceptance path for the complete
recorded ESPN mock. It does not require ESPN, Chrome, or a durable local
database, so the regression can run before every release.

## ESPN acceptance harness

Run from the dashboard repository:

```bash
npm run e2e:espn
```

The command expects the API repository at
`../ff-draft-dashboard-python-api` with its checked-in `.venv`. It starts a
disposable Flask process on an available loopback port and uses a temporary
SQLite database and rankings file. The process and directory are removed after
the test.

The recorded extension-format board contains 160 platform picks. The normal
dashboard parser intentionally excludes 21 kicker and defense picks, leaving
139 canonical advisor events. The harness verifies:

| Boundary | Acceptance check |
| --- | --- |
| Extension message | Version 1 completed ESPN snapshot normalizes |
| Platform parser | Player IDs, overall-pick order, and snake-roster ownership match the recording |
| Draft reducer | Cumulative replay and same-snapshot duplicates are idempotent |
| Malformed input | Missing coordinates are ignored and conflicting duplicate coordinates fail closed on the first valid row |
| Flask/SQLite | All 139 canonical events round-trip in accepted order |
| API replay | Reposting the complete event set creates no duplicate rows |
| API validation | A raw platform snapshot is rejected without changing stored events |
| Advisor persistence | Recommendation and opponent-forecast snapshots reload with the exact event count and fingerprint |
| Offline fallback | Canonical replay remains deterministic after the API process disconnects |
| Completed advisor | Repeated runs make the same decisions and produce a legal, complete roster |

Measured replay latency is reported separately from deterministic decision
outputs. It is evaluated against thresholds, not compared for byte equality.

## Fast regression

`__tests__/espnMockAcceptance.test.ts` runs as part of the normal Jest suite
without starting Flask. It covers the same recorded extension message, the pure
draft reducer, malformed/duplicate rows, and completed advisor replay. The
opt-in `__e2e__` test owns only the real HTTP and persistence boundary.

## ESPN selector monitoring

Extension version `0.0.0.8` loads `espnDraftExtractor.js` before the content
script. The extractor owns every ESPN selector and returns both draft data and
a version 1 health report. Because it has no Chrome dependencies, Jest can run
it against a recorded DOM fixture.

Health distinguishes four modes:

- `live-history`: the scrolling pick history is readable, including a valid
  empty history before the first pick.
- `completed-board`: every scheduled board cell is populated and readable.
- `waiting`: the draft root exists but no supported pick source is present.
- `unavailable`: the draft root selector no longer matches.

Reports are `healthy`, `degraded`, or `unavailable`. Checks include selector
name, selector text, match count, whether the selector is required in the
current state, and its result. The content script relays a report when its
fingerprint changes and at most every 30 seconds while unchanged. Reconnecting
the extension resets that throttle so a newly connected dashboard receives the
current state immediately.

The dashboard validates the health event rather than trusting arbitrary window
messages. A degraded or unavailable report produces a polite visible status
with the issue codes in its title; a healthy report stays out of the way.
Snapshots continue through a degraded title or row state when a supported pick
source remains readable, while `waiting` and `unavailable` states do not emit
empty draft snapshots.

Selector regression coverage verifies:

- scheduled-board completion (including partial round-boundary safety) and
  history-based headshot recovery;
- live-history extraction before board completion;
- empty-history versus missing-history behavior;
- incomplete row and missing-root drift diagnostics;
- extractor-before-content-script manifest order and extension version.

The read-only Chrome smoke on July 30, 2026 matched one draft root, one history
container, all 160 history rows, ten board headers, and all 160 completed cells
in the existing recorded ESPN room. Every populated row and cell passed its
required field checks.

## Realtime advisor eval baseline

Run the cross-repository hard gate from the dashboard repository:

```bash
npm run eval:phase7
```

The gate is credential-free. It checks generated OpenAPI types, all existing
deterministic dashboard replays, and the Flask-owned Realtime session prompt
and tool configuration. It does not send a prompt or draft data to OpenAI.

The executable baseline covers the parts a model must not be able to bypass:

| Area | Gate |
| --- | --- |
| Prompt grounding | Automatic advice names its source event, requires `get_draft_state` and `get_recommendations`, limits the response to two sentences, and only permits unconfirmed proposals. |
| Server ownership | Browser input cannot select a model, prompt, voice, or tool definition; the broker emits only the five OpenAPI-backed tools. |
| Preference/calculation regression | Existing completed-draft and opponent-model replays remain hard requirements: legal complete rosters, zero positional-rank violations, and the documented quality floors. |
| Proposal safety | The model has no accept/reject/draft tool; ambiguous or stale confirmation has no effect. |
| Interruption/timeliness | At most one normal alert per two-pick cooldown, one-pick-away remains urgent, and deterministic advice p95 stays below 150 ms. |
| Outage fallback | The server prompt requires preserving the deterministic advisor; a missing API key continues to fail closed. |

This is a structural/behavioral baseline rather than a claim that a mocked
response measures model quality. Once live sessions produce consented,
redacted transcripts, add model-version-scoped tool-selection, evidence, and
decision-agreement scores on top of this gate.

## Accessibility and keyboard baseline

Run the focused, credential-free accessibility gate from the dashboard
repository:

```bash
npm run a11y:phase7
```

The draft workflow now keeps global board shortcuts out of inputs, textareas,
selects, contenteditable fields, and modified browser shortcuts. The deliberate
Meta-key draft highlight remains available. Keyboard users can focus draft
history cells and ranking cards, then reach labeled Purge, Draft, and game-log
actions without hover. The shared rankings menu supports Arrow keys, Home, End,
Escape, and focus return after a selection.

Player search uses a labeled modal dialog, an input-backed result list, native
button selection, Escape close, focus containment, and return to its opener.
The historical player-comparison drawer follows the same dialog behavior.
Realtime connection state, conversation additions, source-capture degradation,
and recommendation changes are polite status updates; a new unconfirmed plan
proposal is assertive so confirmation is not missed. Broker failures remain
alerts.

The focused tests cover editable-control shortcut suppression, Meta-key hold
behavior, player-search focus and keyboard results, comparison-drawer Escape
and focus return, and keyboard menu operation. They intentionally do not claim
full WCAG conformance: drag-and-drop custom ranking remains pointer-first, and
the legacy desktop/mobile layouts still need a manual screen-reader and
small-viewport audit before public release.

## Local data export and import

Run the focused local-recovery gate from the dashboard repository:

```bash
npm run portability:phase7
```

**Data and recovery** is available on both desktop and mobile. It exports a
human-readable `drafty.local-data` JSON package at explicit version 1. The
package contains only user-authored local state: normalized positional custom
ranking order and user tiers, supported league/board preferences, draft slot,
player targets, and the current confirmed textual plan. It never includes
draft picks, rosters, extension status, API hosts or queues, Realtime audio or
conversation data, provider responses, secrets, or historical datasets.

Imports are fail-closed: the entire file is parsed, byte-bounded, key-bounded,
version-checked, identity-checked against the current trusted player library,
and semantically checked before a confirmation is shown. Only canonical v1 is
accepted; newer versions do not attempt a speculative migration. The preview
states exactly what will be replaced, including an empty plan clearing the
current session plan. Cancel makes no change.

Applying is intentionally limited to before the first draft pick. Changing
league rules or rankings in a live draft would combine two deterministic
boards, so the import button and confirmation callback both refuse it. The
browser writes custom rankings, targets, and the current plan through a small
rollback transaction before React state is refreshed. A quota/write failure
leaves in-memory state untouched and restores prior keys where storage permits.

The focused tests cover round trips, malformed/schema/version/prototype-shaped
inputs, UTF-8 size bounds, unknown player IDs, scoring and league-size
semantics, confirmation/cancel, accessible messages, and late-key storage
rollback.

## Phase 7 exit status

Phase 7 is complete when the recorded ESPN acceptance, deterministic Realtime
eval, accessibility, resilience, and portability gates all pass. The remaining
operational limitation is a manual screen-reader/small-viewport audit of the
legacy layout; it is not a claim of full WCAG conformance.

## Reconnect and offline UX

Run the focused resilience gate from the dashboard repository:

```bash
npm run resilience:phase7
```

The dashboard now treats capture, selector monitoring, API persistence, and
GPT Realtime as independent boundaries. A missing extension heartbeat is
shown as disconnected or stale; stale ESPN selector-health reports are shown
separately from selector degradation so a healthy page check cannot mask a
stalled bridge (or the reverse). The selected draft remains visible during a
bridge interruption and explicitly says that the local board is preserved.

Canonical picks are reduced into the local board before any API request. When
the API fails, the bounded per-session queue retains those canonical events,
does not retry in a loop, and provides a manual retry on each user action. The warning states
that the local draft and deterministic recommendations remain safe in the
browser. Successful manual recovery drains picks that arrived while an earlier
request was in flight, announces recovery once, then returns to a quiet local
state. A 500-event cap prevents an unbounded queue; reaching it asks the user
to export a replay rather than silently discarding local draft state.

Realtime keeps its existing three-attempt bounded reconnect schedule. During
connection, reconnection, or retry exhaustion, the UI names the deterministic
fallback and keeps the manual Realtime retry available. Realtime loss never
changes draft picks, deterministic recommendations, or unconfirmed proposals.

The focused coverage includes bridge/source-health freshness separation, API
failure with local picks retained, manual recovery, in-flight pick draining,
and accessible stale/offline/fallback status semantics. Browser restart
recovery for user-authored rankings, preferences, targets, and confirmed plan
text is covered by the portable local-data package above; transient draft picks
intentionally remain outside that package.
