# Phase 10F cross-view acceptance candidate

Phase 10F is the bounded acceptance candidate for the four Phase 10 decision
views and their shared navigation, historical-analysis, drawer, live-update,
responsive, and accessibility contracts. It does not change calculation or
model ownership. Automated and agent-browser checks are complete, but the
human-owned visual and assistive-technology checks below remain unrecorded.
Accordingly, Phase 10 is implementation-complete and
human-acceptance-pending, not complete.

## Baseline

- Dashboard branch: `refactor/realtime-foundation`
- Dashboard commit: `af379f334f70fb958e388f6c5b77f7c56fa3ac33`
- Annotated milestone tag: `phase10e-intra-position-comparison-2026-08-10`,
  peeled directly to the dashboard commit above
- Python API commit: `2a07eb3fb2d9650cfc7b7216f745a3756b59eb36`
- Phase 10F branch: `codex/phase-10f-cross-view-acceptance`
- Phase 10F worktree: `/Users/timothylee/Projects/ff-draft-worktrees/phase-10f`

Both authoritative checkouts were clean before the worktree was created. The
Phase 10F branch was created directly from the annotated milestone tag.

## Four-view ownership matrix

| View | Live input and order owner | Recommendation semantics | Historical boundary |
| --- | --- | --- | --- |
| Positional tier landscape | Explicit `availablePlayers`; fixed QB/RB/WR/TE lanes; custom/user tiers primary; supplied opponent and tier-boundary evidence | No recommendation labels or inferred candidates | Positional analysis remains separate and manual |
| Realtime positional bests | Supplied ordered maximum-three deterministic advisor candidates | Candidate zero is preferred; later supplied candidates are fallbacks; no fill, reorder, or recalculation | Positional analysis remains separate and manual |
| Cross-position comparison | Supplied ordered maximum-three deterministic advisor candidates and supplied scores/evidence | Candidate zero is preferred; later supplied candidates are fallbacks; each metric is local to itself and projection ranges alone share a safe PPG scale | Cross-position analysis remains separate and manual |
| Intra-position comparison | Explicit same-position `availablePlayers`, ordered only by active position rank, maximum three | A live shortlist, never an advisor recommendation; range and spread are descriptive context | Player A / Player B selection remains separate and manual |

Across all four views, status is advisory; desktop and mobile receive the same
inputs; custom/user rank and tier authority remains honest; projection tiers
are secondary overlays; and no unsupported status, role, synergy, diagnosis,
risk, or confidence evidence is fabricated.

## Automated cross-view gate

`__tests__/phase10CrossViewAcceptance.test.tsx` adds 10 integration-focused
tests without reproducing every Phase 10B–10E component edge case. Together
with the focused suites, it covers the requested acceptance boundaries as
follows:

- Navigation and arbitration (scenarios 1–16): all four selected states and
  sources, incompatible-state reset, compatible same-view preservation,
  stale-response rejection, automatic explanations, pinning, newest-only
  pending advice, review/apply/unpin behavior, confirmed-manual arbitration,
  exact-once acknowledgement, revision suppression, idempotency, and
  desktop/mobile parity.
- Ownership and evidence (scenarios 17–23 and 34): explicit availability,
  supplied advisor order, active-rank shortlist order, honest custom/user tier
  labels, secondary projection overlays, bounded endpoints, safe invalid
  projection/probability handling, and absence of unsupported evidence.
- Live/history/drawer behavior (scenarios 24–31 and 36): independent live
  rendering, manual view-specific history, intact season/scoring controls,
  view-appropriate live drawer invalidation, compatible historical drawer
  survival, keyboard inspection, Escape/focus behavior, and one material
  announcement per evidence change.
- State quality and regression boundaries (scenarios 32–33, 35, and 37):
  equivalent rerender silence, useful loading/unavailable/empty/bounded states,
  narrow-container readability, existing chart inspection, and exact Phase 9
  evidence/promotion invariants.

Final focused gate: 17 suites and 199 tests passed. This comprises the new
Phase 10F suite plus every required Phase 10 analysis, navigation,
accessibility, historical, status, drawer, recommendation, and Phase 9
regression suite. The pre-Phase-10F required list contained 16 suites and 189
passing tests in this checkout; the 10 new tests account for the difference.
The complete dashboard run passed 72 suites and 434 tests, with the existing
1 skipped suite and 2 skipped tests reported rather than concealed. TypeScript
(`tsc --noEmit`), ESLint, the production build, and `git diff --check` also
passed. The build retained the repository's existing outdated-Browserslist and
Tailwind purge-configuration warnings; it introduced no failure or manifest
change.

## Agent-run browser smoke

The smoke used one in-app Browser tab against the local dashboard at
`http://127.0.0.1:4310/`. It did not use Chrome or access ESPN. The unchanged
Python API was run from its authoritative checkout at
`http://127.0.0.1:5000/`; only the process environment was given the explicit
local dashboard CORS origin. The inspected viewports were 1440 x 1000 and
390 x 844, and the viewport was reset before the tab was closed.

At 1440 x 1000, every manual navigation control and source explanation was
visible, the selected control had text and pressed-state semantics, live and
historical headings were distinct, exact metric values remained readable, and
the document width stayed at the 1440-pixel viewport width. The four live
surfaces rendered 3 positional-bests cards, 26 bounded tier-landscape cards,
3 cross-position cards, and 3 intra-position cards. Preferred/fallback labels
appeared only in the positional-bests and cross-position recommendation views.

At 390 x 844, each selected live surface fit inside a 348-pixel region and the
workspace fit inside its 372-pixel container; document scroll width equaled
the 390-pixel viewport. Navigation, scope, season/scoring controls, live source
text, manual historical controls, exact values, and inspection actions
remained present. No obvious horizontal card overflow was observed. The
intra-position surface used shortlist language and did not acquire preferred
or fallback labels. Empty/unavailable status messaging remained understandable.

The loaded Harris fixture did not contain a saved custom/user-tier example, so
the browser smoke could not visually compare custom-tier emphasis against a
projection overlay. That boundary is covered by the automated model and render
assertions and remains explicitly human-owned below.

### Historical, keyboard, drawer, and live-region observations

- No historical analysis ran on workspace open or while changing live views.
  A deliberate cross-position `Run analysis` request returned the 2023–2025
  Standard chart with four grouped rows from three validated nflverse weekly
  sources. Its selections remained visibly distinct from live advisor
  candidates.
- A historical chart point opened the existing drawer with Enter. The close
  control was initially focused, and Escape closed the drawer. A live-player
  drawer also closed with Escape and returned focus to its inspection control.
- The browser controller did not conclusively reproduce keyboard activation of
  the view and pin buttons even though they were exposed as native reachable
  buttons and their accessible state changed correctly with pointer activation.
  The automated accessibility/navigation suites cover native keyboard
  operation; human keyboard confirmation remains unrecorded.
- Polite status regions were present without visible layout disruption.
  Representative live drafting was intentionally not started, so the browser
  did not generate a material advisor update. The acceptance suite proves one
  announcement for a material evidence change and silence for equivalent
  rerenders.
- No screen reader, VoiceOver, NVDA, formal color-contrast tool, or human
  usability review was performed or claimed.

## Defect found and corrected

The desktop cross-position screenshot exposed a localized P2 readability
defect: the three candidate names were truncated when the inspection button
competed for card-header width. The card header now wraps and player names use
word wrapping rather than ellipsis. A regression assertion verifies full-name
wrapping, and the post-fix 1440 x 1000 inspection showed Lamar Jackson, Saquon
Barkley, and Brock Bowers in full with no horizontal overflow. No calculation,
data, schema, or ownership behavior changed.

## Phase 9 invariants

- Checked-in evidence count: 0
- Fixture count: 0
- Eligible fixture count: 0
- Status: `evidence_blocked`
- Aggregate: absent
- Promotion: false
- Policy fingerprint:
  `c4d950474e7dd6aae37cc18ba18b356dba2668cd6d626aaa4b5048e5fd29aad7`
- Serialized empty-report SHA-256:
  `702a3397aefe3f4f47b150af7ac7926404dbcfb1856d27753f4f32e4dca4e6e6`

## Human acceptance checklist

Each item is human-owned and initially unrecorded.

- [ ] Unrecorded — Desktop visual coherence across all four views.
- [ ] Unrecorded — Narrow/mobile readability across all four views.
- [ ] Unrecorded — Custom/user tier versus projection-tier clarity.
- [ ] Unrecorded — Automatic-navigation explanation usefulness.
- [ ] Unrecorded — Pinned-view behavior.
- [ ] Unrecorded — Newest pending-recommendation banner behavior.
- [ ] Unrecorded — Confirmed-manual Realtime view change behavior.
- [ ] Unrecorded — Drawer initial focus, close control, Escape, and focus return.
- [ ] Unrecorded — Live-update interruption and announcement level.
- [ ] Unrecorded — One manual historical request in each relevant view.
- [ ] Unrecorded — Screen-reader/assistive-technology spot check.

Until these observations are recorded, Phase 10 remains
implementation-complete and human-acceptance-pending.
