# Phase 14C deterministic insight deck

Status: integrated and deployed on 2026-08-20. The implementation commit is
`06b5b7c`; Vercel reported the production deployment successful at
`https://ff-draft-dashboard.vercel.app`. This does not close Phase 14D's
live-extension and human acceptance boundary.

Phase 14C composes prepared, read-only live inputs into one bounded desktop
insight pane. It does not alter recommendation ranking, opponent-model
training or promotion, ranking/tier authority, draft-plan persistence, or
Realtime GPT/voice behavior. Realtime GPT and voice remain deferred.

The registered-view catalog below records the accepted Phase 14C baseline.
Phase 16 expands that same deck without changing its authority or rollback
boundary; use `docs/phase16-read-api-insight-convergence.md` for the current
read-API and ten-view catalog after Phase 16 integration.

## Registered views and authority

The deck has exactly three independently selectable slots. A view may appear in
only one slot at a time; duplicate candidates are suppressed rather than
rendered twice.

| Slot | Registered views | Read-only inputs and authority |
| --- | --- | --- |
| Primary decision | Candidate comparison | The committed Phase 14B comparison set and the existing deterministic recommendations/cross-position presentation model. Recommendations remain the only preferred-now authority. |
| Market watch | Current tier market; two-round run matrix | Existing active-board tiers and frozen opponent forecast evidence. The matrix is display-only and cannot replace the forecast or rank players. |
| Plan & constraints | Plan constraints | Existing roster/settings-derived starter and league-need counts plus the Realtime plan document as read-only text. It cannot accept, reject, edit, or persist a plan. |

The deck controller owns presentation selection only. Its candidates are scored
and ordered deterministically on a material event with a stable tie-break. Auto
requires evidence readiness, a significance margin, material-event dwell, and
deduplication. Each slot can be pinned for the current draft session only; a pin
survives subsequent Auto candidates until that slot is returned to Auto. No pin
is stored in the backend or browser.

The deck is the one announcement owner for its slots. Child comparison,
cross-position, and tier surfaces run silently when embedded, preventing
duplicate live-region updates. The Phase 14B comparison controller supplies a
committed automatic set: non-material visual/input churn does not replace it,
while a new material draft key refreshes the committed set even when the player
identity signature is unchanged. Its existing Auto/Pinned player-set semantics
remain separate from per-slot deck pins.

## Two-turn market contract

The run matrix has a fixed, bounded two-turn envelope:

1. Bucket 1 is the next user turn and exposes only frozen-v1 positional
   forecast evidence.
2. Bucket 2 is the following user turn and is explicitly provisional. It is a
   static-board-derived estimate, not a second frozen forecast window.

Tier simulation likewise uses the static board, draws from the full bounded
available-player pool, and considers at most two active tiers per positional
lane. It cannot double-count a player across tier depletion. The UI labels the
provenance and unavailable state instead of inferring a value.

Roster demand is observed separately from modeled run evidence. Direct QB/RB/
WR/TE starter needs use actual roster counts; FLEX remains an unallocated
eligible slot, never guessed as RB or WR demand. The plan/constraints view
reuses those semantics for the user roster and other-team needs.

Frozen v1 remains the live opponent model. The additional bucket, static-board
tier simulation, candidate scores, and presentation estimates are not model
training, recommendation authority, prospective validation, or a promotion
signal. They cannot promote, replace, or tune frozen v1.

## Desktop integration and rollback

On desktop, the Phase 14C deck occupies the existing bounded insight pane. It
receives a memoized stream ID of `activeDraftSessionId || "unscoped-draft"` and
a `draftKey` of `materialDraftEventKey`, plus the available board, settings,
ranking summaries,
recommendations, forecast, advisor context, status cache, rosters, user roster
index, committed comparison controller, and read-only `realtimeAdvisor.plan`.
Inspecting a player updates only the existing profile focus.

**Open analysis workspace** replaces the deck in the same pane with the
accepted compact `AnalysisWorkspace`; returning closes that workspace and
restores the deck. The workspace retains its normal manual/stored view
selection, with Player Lab available as one manual analysis view rather than
opened directly. This retains the existing manual and historical deep-analysis
route without navigation or duplicate desktop workspace mounts. Mobile/non-desk
behavior and analysis-view arbitration are unchanged.

`NEXT_PUBLIC_PHASE14C_INSIGHT_DECK_ENABLED=false` is the immediate rollback.
The flag is default-on and, when explicitly false, renders the accepted Phase
13/14A compact `AnalysisWorkspace` header and path with no deck toggle. The
rollback changes no backend records, plan data, recommendation logic, or
comparison/pin storage.

Integration and rollback acceptance checklist:

- [x] Deck receives the session-scoped material identity and read-only live
  inputs in the desktop insight pane.
- [x] The outer deck pane is height-bounded; deck slots own their own scrolling.
- [x] The inline analysis workspace and deck are mutually exclusive desktop
  mounts; its Player Lab view remains manually reachable and closing returns to
  the deck.
- [x] Explicit flag rollback restores the compact legacy pane and removes the
  deck toggle.
- [x] Advisor disclosure remains reachable in both branches.
- [x] The development fixture passes browser checks at 1440px and 1280px:
  bounded 500x720 pane, independent slot scrolling, both run-market turns,
  pin/Auto transitions, long-content containment, and real loading/stale/
  unavailable evidence states.
- [ ] Live-extension replay, keyboard/screen-reader assistive-technology
  verification, and a human mock-draft remain Phase 14D work.

## Verification and remaining boundaries

`npm run test:phase14c` is the reproducible focused closeout gate. At acceptance
it passes 17 suites and 147 tests covering registered deck/controller
selection, score/margin/dwell/dedup and pin transitions, single-announcement
ownership, committed Phase 14B comparison behavior, round-market provenance/
unavailability, static-board tier limits, starter-versus-FLEX semantics, plan
read-only behavior, visual-fixture states, and desktop flag/rollback behavior.
TypeScript, lint, the production build, and `git diff --check` also pass.

The clean-commit full release preflight also passed at `06b5b7c`: repository
metadata, extension package parity, byte-identical dashboard/API rankings,
118 focused release tests, generated API types, TypeScript, lint, and the
production build. Post-deploy smoke verified the public dashboard (HTTP 200),
the development-fixture guard (HTTP 404), Cloud Run health (HTTP 200), and the
2026 rankings payload (455 players). A production browser check found the
three-slot deck, its single owned live region, no page-level horizontal
overflow, and no runtime console errors. Phase 14C changed no API code, so the
existing read-only Cloud Run revision was not redeployed.

Recorded ESPN fixtures do not yet contain the new two-turn envelope. The
deterministic two-turn replay coverage is therefore synthetic; it validates the
contract and fail-closed behavior but is not live-ESPN acceptance evidence.

Phase 14D remains responsible for browser and visual acceptance: live extension
replay, responsive/mobile task flow, automatic churn and pin/unpin in a human
mock, keyboard and screen-reader verification, and any migration/removal
decision after parity is observed. It must not treat this document, synthetic
replay, or the focused baseline as a substitute for those checks.
