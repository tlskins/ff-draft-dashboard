# Phase 14A integrated draft desk candidate

Status: candidate implemented and desktop-hardened; pending visual and human
acceptance.

## Scope and ownership

`NEXT_PUBLIC_DRAFT_DESK_ENABLED=true` enables the desktop-only integrated
draft desk candidate. It changes composition and presentation only. The page
continues to create `useDraftListener`, `usePredictions`, advisor persistence,
ranking profiles, Realtime advice, and analysis-view arbitration exactly once.
The enabled and rollback layouts receive the same state, callbacks, roster
data, available-player set, deterministic recommendations, opponent forecast,
and status cache.

The candidate has three bounded panes in the default order: profile, rankings,
and insight. Rankings is always rendered and can only swap places with insight;
there is no close, resize, or free-form drag interaction. Validated placement
is stored under `drafty-draft-desk-pane-placement`; an invalid, duplicated, or
incomplete stored value restores the default order.

Board focus updates `DraftDeskProfilePane`. The embedded analysis workspace is
given `followActivePlayer={false}` and no active player, so its manual Player
Lab comparison selection stays independent of profile focus. No Phase 14B
player-outlook contract or advisor-owned comparison selection is introduced.

## Desktop composition

- `DraftDeskAppBar` preserves Drafty identity, capture status, source-health
  warnings, persistence/retry status, and an accessible Settings trigger.
  League/source configuration, extension/mock links, and portable
  import/export are in its focus-trapped drawer. The pre-existing first-pick
  locks remain native disabled controls.
- `RankingsBoard` remains the single authoritative board instance. Its visible
  Rankings mode select switches position versus round presentation without
  rendering duplicate boards; custom-rank editing, target controls, sync, and
  keyboard behavior are unchanged. Tier visualization remains in the accepted
  analysis presentation instead of being copied into a second board model.
- The profile pane composes existing rank summary, rank table, structured
  status, historical stats, and optional historical comparison components.
- The insight pane hosts the existing optimal-roster display, deterministic
  advisor, and accepted decision workspace. No recommendation, opponent,
  tier, projection, survival, run, or analysis-navigation algorithm changes.

## Draft dock

`DraftDock` is a fixed, two-level desktop dock. Its tape is present before and
after draft start and always reports overall pick, round, round pick, and the
next user-pick/picks-away state. The secondary view switches among Current
round, My roster, and League needs.

The dock owns its rendered height. It reports that height through a local
`ResizeObserver` callback; the candidate shell reserves the exact value with a
CSS custom property before its bounded three-pane region. The center region is
a flex child, not a second viewport-height calculation, so it shrinks whenever
Current round, My roster (collapsed or expanded), or League needs changes the
dock. The dock remains fixed and the tape remains reachable throughout.

Roster/needs summaries live in `behavior/draftDesk.ts` and are presentation
helpers only. They use existing roster arrays and explicit starter settings:
QB, each RB/WR direct slot, TE, and each FLEX slot. FLEX is an unallocated
eligible RB/WR/TE surplus after direct slots; it is never relabeled as an RB
or WR need. League needs excludes the user roster and uses observed counts,
not probabilities. These helpers do not call or feed the opponent model.

## Responsive and visual boundary

The three-pane grid is desktop-only (`md` and wider), with constrained
responsive column floors at 960px and 1200px. Candidate desktop composition
uses a small shell inset instead of the legacy `md:px-20` page padding. Its
compact presentation mode stacks rankings controls and advisor candidates
inside their panes, rather than treating viewport-wide `md` utilities as pane
width. The established mobile task-oriented layout remains mounted and
unmodified by the feature flag; the candidate app bar, three-pane shell, and
desktop dock are hidden below the desktop breakpoint.

`DraftDesk.module.css` establishes graphite/navy surface, border, text,
muted-text, selection, focus, urgency, danger, position-identity, spacing,
row-density, tabular-number, and reduced-motion tokens. It is scoped to the
new candidate so legacy and mobile styles retain their accepted presentation.

## Tests and rollback

Focused Phase 14A tests cover placement validation/swap and malformed fallback,
feature-flag parsing, settings drawer focus/Escape/locks, permanent dock tape,
observed own-roster slots, other-team-only league needs with distinct FLEX,
single-board rankings mode switching, focus/comparison isolation, native
expanded roster detail, and measured dock-height reservation.

Enable with:

```sh
NEXT_PUBLIC_DRAFT_DESK_ENABLED=true npm run dev
```

Roll back by removing the variable or setting it to any value except `true`.
That restores the accepted Phase 13 Header, advisor placement, desktop board,
analysis replacement-page interaction, and original footer without migrating
or clearing any draft, ranking, advisor, or analysis storage.

## Desktop hardening evidence

Production-export browser checks ran on 2026-08-16. The browser runtime maps
the requested sizes to 1.25x CSS pixels; both values are recorded below.
At every requested viewport and dock mode, all three panes were visible, the
pick tape was visible, document `clientWidth === scrollWidth`, and rankings and
insight `clientWidth === scrollWidth`.

| Requested viewport | CSS viewport | Pane widths (profile / rankings / insight) | Current / roster / expanded / needs pane bottom <= dock top |
| --- | --- | --- | --- |
| 1024 x 768 | 1280 x 960 | 253.5 / 526.5 / 468.0 px | 818.9 <= 826.9; 786.2 <= 794.2; 744.9 <= 752.9; 810.2 <= 818.2 px |
| 1280 x 720 | 1600 x 900 | 318.5 / 661.5 / 588.0 px | 758.9 <= 766.9; 726.2 <= 734.2; 684.9 <= 692.9; 750.2 <= 758.2 px |
| 1440 x 900 | 1800 x 1125 | 359.1 / 745.9 / 663.0 px | 983.9 <= 991.9; 951.2 <= 959.2; 909.9 <= 917.9; 975.2 <= 983.2 px |

The corresponding rankings/insight widths were 524/467px, 659/587px, and
743/662px at the three sizes respectively; each matched its scroll width.
Screenshots were captured at all three sizes, including League needs at 1024,
1280, and 1440. The 1280 capture visibly shows the fixed tape and non-default
League needs dock below the three panes.

## Known limitations and Phase 14B handoff

Phase 14A does not make insight selection automatic, add ESPN `playerOutlook`,
change comparison candidates, expose round-aware run probabilities, or add
arbitrary pane resizing. The embedded insight workspace can be long; it is
contained in its pane but should receive a bounded deep-analysis expansion
review in a later slice if human desktop review finds it too dense. This pass
uses a pre-draft production-export fixture, not a live extension draft; human
review should still assess active-draft density and real roster-name wrapping.

Phase 14B should own only automatic comparison-set seeding/provenance and the
new bounded player-profile outlook contract, while preserving the Phase 14A
profile-focus versus manual-comparison boundary.
