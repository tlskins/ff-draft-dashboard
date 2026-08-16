# Phase 14A integrated draft desk candidate

Status: candidate implemented; pending visual and human acceptance.

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

Roster/needs summaries live in `behavior/draftDesk.ts` and are presentation
helpers only. They use existing roster arrays and explicit starter settings:
QB, each RB/WR direct slot, TE, and each FLEX slot. FLEX is an unallocated
eligible RB/WR/TE surplus after direct slots; it is never relabeled as an RB
or WR need. League needs excludes the user roster and uses observed counts,
not probabilities. These helpers do not call or feed the opponent model.

## Responsive and visual boundary

The three-pane grid is desktop-only (`md` and wider), with a constrained
narrow-laptop column template. The established mobile task-oriented layout
remains mounted and unmodified by the feature flag; the candidate app bar,
three-pane shell, and desktop dock are hidden below the desktop breakpoint.

`DraftDesk.module.css` establishes graphite/navy surface, border, text,
muted-text, selection, focus, urgency, danger, position-identity, spacing,
row-density, tabular-number, and reduced-motion tokens. It is scoped to the
new candidate so legacy and mobile styles retain their accepted presentation.

## Tests and rollback

Focused Phase 14A tests cover placement validation/swap and malformed fallback,
feature-flag parsing, settings drawer focus/Escape/locks, permanent dock tape,
observed own-roster slots, other-team-only league needs with distinct FLEX,
single-board rankings mode switching, and focus/comparison isolation.

Enable with:

```sh
NEXT_PUBLIC_DRAFT_DESK_ENABLED=true npm run dev
```

Roll back by removing the variable or setting it to any value except `true`.
That restores the accepted Phase 13 Header, advisor placement, desktop board,
analysis replacement-page interaction, and original footer without migrating
or clearing any draft, ranking, advisor, or analysis storage.

## Known limitations and Phase 14B handoff

Phase 14A does not make insight selection automatic, add ESPN `playerOutlook`,
change comparison candidates, expose round-aware run probabilities, or add
arbitrary pane resizing. The embedded insight workspace can be long; it is
contained in its pane but should receive a bounded deep-analysis expansion
review in a later slice if human desktop review finds it too dense.

Phase 14B should own only automatic comparison-set seeding/provenance and the
new bounded player-profile outlook contract, while preserving the Phase 14A
profile-focus versus manual-comparison boundary.
