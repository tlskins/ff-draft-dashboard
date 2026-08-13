# Phase 10F cross-view acceptance candidate

Phase 10F is the bounded acceptance record for the four internal Phase 10 view
IDs and their shared navigation, historical-analysis, drawer, live-update,
responsive, and accessibility contracts. The human-directed run below records
the initial desktop usability failures and the subsequent three-workspace
redesign. Phase 10G then hardens the redesigned presentation model, selection
contracts, aliases, and visible Player Lab drawer route. The redesign added
bounded display-derived calculations; it did not change the authoritative
advisor, ranking, projection, opponent-model, or API contracts. The targeted
post-rewrite human run recorded a pass for every non-VoiceOver item and an
explicitly accepted deferral for VoiceOver-specific validation. The Phase 10
exit gate is therefore satisfied. Phase 10 closes at the annotated milestone
`phase10g-decision-workspace-acceptance-2026-08-12`. Confirmed-manual Realtime
remains an explicit environment limitation.

## Acceptance-run authority

- Dashboard branch: `refactor/realtime-foundation`
- Dashboard commit: `d67abbcc405a1ef90b00a1c12760bfd08756bb4f`
- Annotated acceptance tag: `phase10f-cross-view-acceptance-2026-08-10`,
  peeled directly to the dashboard commit above
- Python API commit: `2a07eb3fb2d9650cfc7b7216f745a3756b59eb36`

Both authoritative worktrees were clean before the run and before this
approved acceptance-record edit. The tag was verified but not changed. The
dashboard and API ran locally on explicit ports 4310 and 5100 and were stopped
at closeout. The API used an isolated copy of the existing populated local
historical database. No ESPN page or live mock was opened, and no browser
automation or automated test result was counted as human acceptance.

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

## Post-redesign ownership matrix

| Surface / internal IDs | Live input and order owner | Advisor and display semantics | Historical boundary |
| --- | --- | --- | --- |
| Position Tiers (`tier_landscape`, aliased `positional_bests`) | Explicit `availablePlayers`; fixed QB/RB/WR/TE lanes; rank-driven players; custom/user tiers primary; supplied opponent and tier-boundary evidence | Neither the lane leaders nor the runway matrix are four advisor recommendations. The internal four-ID event/state boundary is preserved, while both IDs use the Position Tiers user-facing alias. | Positional analysis remains separate and manual. |
| Decision Cockpit (`cross_position`) | Four rank-driven positional leaders from explicit availability, plus the separate ordered maximum-three deterministic advisor list | Advisor candidate zero alone owns **Preferred now**; later supplied candidates remain advisor fallbacks and own their detailed supplied evidence. The preferred candidate's position selects the initial displayed leader scenario when possible; fixed QB/RB/WR/TE lane order is the deterministic fallback. | Cross-position analysis remains separate and manual. |
| Player Lab (`intra_position`) | Three to five manually selected same-position eligible players; the optional live shortlist remains rank-driven explicit availability | Player Lab selections are not advisor recommendations. A historical run is disabled unless at least three eligible players can be selected; pools below three are disclosed rather than padded. | The 3–5 historical comparison remains manual and independent of live updates. |

Across all four internal IDs, status is advisory; desktop and mobile receive
the same inputs; custom/user rank and tier authority remains honest; projection
tiers are secondary overlays; and no unsupported status, role, synergy,
diagnosis, risk, or confidence evidence is fabricated.

## Approved visual remediation implementation

The four internal navigation event IDs and their ownership rules remain intact,
but the human-facing workspace is consolidated into three destinations:

- **Decision Cockpit** is the default. It shows the top explicitly available
  QB, RB, WR, and TE; lets the operator toggle all four “if you draft”
  scenarios. Those four leaders are rank-driven analyses of explicit
  availability, not four advisor recommendations. The ordered maximum-three
  advisor list remains authoritative for **Preferred now**, its fallback order,
  and its supplied detailed evidence. If the preferred candidate is not its
  position's board leader, the leader at the same position is still the
  selected scenario; if that position is absent, fixed lane order supplies the
  fallback.
- **Decision Cockpit display estimates** are presentation-derived and bounded.
  The next-option estimate excludes the drafted scenario player, walks the
  remaining lane in rank order only while per-player survival evidence is
  supplied, names the highest-probability covered outcome, and computes a
  probability-weighted median only across those covered outcomes. It becomes
  unavailable at the first uncovered rank rather than extrapolating. The
  waiting-cost bar compares the current top tiered player with the first later
  player whose primary board/user tier differs, using their projection medians;
  current-tier exhaustion comes from supplied candidate boundary evidence or
  the lane's supplied current-tier forecast. A missing later tier is
  unavailable, and equal projection-tier medians are labeled `No modeled tier
  drop`. These estimates do not reorder or replace the advisor candidates and
  may remain coarse when multiple board/user tiers share one projection tier.
- **Position Tiers** presents the explicitly available, tiered pool for one
  selected position at a time; untiered players are omitted. Every row shows a
  tier color, a five-value PPG axis, and exact
  floor/median/ceiling values on that position's PPG scale. The chart scrolls
  through the full pool. The runway accepts optional one-, two-, and
  three-turn forecast props; unavailable horizons are labeled rather than
  inferred. The internal `positional_bests` event is retained as a focused
  Position Tiers alias for Realtime compatibility.
- **Player Lab** supports three to five manually selected same-position
  eligible players. Removal is disabled at the three-player floor and the run
  action is disabled for a pool with fewer than three eligible players. Its manual
  historical request uses the existing one-to-five-player comparison endpoint
  to render exact P10/P25/P50/P75/P90 box-and-whisker rows and all selected
  players on one full-previous-season weekly line chart. Recorded scoring weeks
  and unclassified gaps are visualized separately. Injury, partial-game,
  legal/administrative, and bye attribution remains an explicit limitation
  because the historical API does not supply that structured evidence.

User-facing navigation and source explanations now use decision language
instead of introducing `deterministic advisor` and `candidates` as prerequisite
concepts. Detailed supplied evidence remains available in collapsed disclosure
sections.

The remediation and Phase 10G verification added coverage for the three-workspace
interaction model, all-player position ranges, the five-player cap, exact
historical percentile values, combined season lines, honest participation
gaps, the three-player floor, negative weekly endpoints, visible historical
drawer access, the cockpit selection invariant, user-facing aliases, native
table semantics, and the preserved four-ID navigation/event boundary. The focused Phase
10 suites, TypeScript, ESLint, production build, and `git diff --check` pass.
No ESPN page, live mock, browser automation, API schema, ranking calculation,
advisor calculation, or Phase 11 work is part of this remediation. The bounded
next-option and waiting-cost helpers are presentation-model calculations and
are documented above rather than described as unchanged calculation behavior.

The final rewrite's offline dashboard run passed all 63 `__tests__` suites
and all 424 tests. The ESPN e2e path was deliberately excluded. TypeScript,
ESLint, the production build, and `git diff --check` also passed.

The subsequent Phase 10G hardening gate passed 5 focused suites and 55 tests.
The requested `npm test -- --runInBand --testPathPattern=**tests**` invocation
reported the repository's existing `Invalid testPattern **tests** supplied`
warning and fell back to the broader all-suite run: 73 suites passed, 1 was
skipped, 445 tests passed, and 2 were skipped. `tsc --noEmit`, ESLint, the
production build, and `git diff --check` passed. The build retained the known
outdated-Browserslist and Tailwind purge-configuration warnings.

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

This smoke predates the three-workspace rewrite. It is retained as historical
evidence for the original four-view candidate and does not satisfy the
post-rewrite narrow/mobile, keyboard, VoiceOver, or visible Player Lab drawer
checks required after Phase 10G.

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

## Human-directed acceptance run

The human operator made every pass/fail judgment. The run proceeded in the
requested desktop/navigation, live behavior, historical/drawer, narrow/mobile,
and keyboard/VoiceOver groups. Initial historical 404 responses were traced to
an empty temporary metadata database created for the run. After the API was
corrected to use an isolated copy of the populated local historical database,
all four manual requests succeeded. The setup-only 404 responses are not
product failures.

The checklist below records the original four-view acceptance surfaces. The
later rewrite materially changed their layout, interaction model, visible
Player Lab inspection route, and bounded presentation estimates. Consequently,
the original narrow/mobile, keyboard/VoiceOver, and drawer passes are historical
observations rather than acceptance of the final Phase 10G candidate.

### Approved checklist record

- [x] **Fail — Desktop visual coherence across all four views.** The operator
  concluded that a redesign is required before the workspace will be usable
  enough to close Phase 10. Detailed P2 observations appear below.
- [x] **Pass — Narrow/mobile readability across all four views.** At an
  approximately 390 x 844 viewport, all four views passed readability,
  overflow, control usability, and live-versus-historical separation checks.
- [x] **Pass — Custom/user tier versus projection-tier clarity.** The operator
  found the tier authorities clear.
- [x] **Fail — Automatic-navigation explanation usefulness.** The explanation
  was too technical and built on unfamiliar terms such as `deterministic
  advisor` and `candidates` instead of explaining the decision in plain
  user-facing language.
- [x] **Pass — Pinned-view behavior.** A pinned intra-position view survived
  local deterministic draft updates.
- [x] **Pass — Newest pending-recommendation banner behavior.** Successive
  local deterministic updates retained only the newest pending recommendation.
- [x] **Limitation — Confirmed-manual Realtime view change behavior.** The
  production UI requires an active captured draft session and live Realtime
  credentials. The deterministic in-memory transport is test-only, so this
  item could not receive human acceptance under the run constraints.
- [x] **Pass — Drawer initial focus, close control, Escape, and focus return.**
  Keyboard checks passed for the visible Close control, initial focus, Escape,
  focus restoration, and live and historical drawer opening.
- [x] **Pass — Live-update interruption and announcement level.** The
  VoiceOver spot check found the material update announcement polite and
  non-interrupting.
- [x] **Pass with P2 usability concerns — One manual historical request in each
  relevant view.** Landscape, positional bests, cross-position, and
  intra-position all returned data and rendered graphs after the acceptance
  environment was corrected. The graph concerns below remain open.
- [x] **Pass — Screen-reader/assistive-technology spot check.** Keyboard and
  VoiceOver checks passed for view and pin controls, workspace semantics,
  material live updates, and comparison-dialog identification.

### P2 acceptance findings

1. **Positional-bests projection semantics are unclear.** Each visible card
   repeats a shared PPG scale (8.9–25.3 in the observed state), but the operator
   could not tell whether the bars represented a PPG score or a comparison
   across positions. The implementation uses one scale across only the visible
   advisor candidates and draws floor-to-ceiling with a median marker; the UI
   needs to communicate that meaning directly.
2. **The tier-landscape presentation is not usable enough.** Horizontal tier
   lists did not provide an effective landscape. The requested design direction
   is a position-oriented interactive chart with focused-player detail and the
   two surrounding players visible for context.
3. **Cross-position evidence needs a stronger interactive visualization.** The
   underlying data was useful, but isolated cards did not make the key metrics
   easy to compare or explore beyond the leading options. Any expansion beyond
   the supplied advisor-candidate boundary must preserve or explicitly revise
   the documented ownership contract.
4. **Intra-position variance needs clearer decision context.** The operator
   wants to distinguish health-related scoring variance from ordinary
   week-to-week variance and compare three to five players. Health attribution
   requires reliable structured evidence rather than inference from the
   current projection spread.
5. **Navigation language is too implementation-oriented.** Terms including
   `deterministic advisor` and `candidates` should be replaced or introduced
   with plain-language explanations tied to the user's current decision.
6. **Historical chart semantics and value are unclear.** In landscape and
   cross-position, the operator could not identify what the axes meant. The
   renderer exposes raw field-derived labels such as fantasy-points P10/P90,
   but those labels did not communicate their meaning. Positional-bests and
   intra-position charts rendered successfully, yet their decision value was
   unclear.

## Human acceptance closeout

### Post-remediation focused re-check

The operator did not accept the redesigned Decision Cockpit in its first
focused re-check. The reported observations were:

- **Fail — Cost of waiting one turn.** “Cost of waiting one turn - seems to be
  empty of data.” Reproduction: reload the local dashboard, open Analysis, and
  select Decision Cockpit. Expected: the chart communicates the modeled
  scoring cost between the best option now and the expected best available at
  the next user pick. Actual: the rendered rows have no useful bar values when
  no later player has a supplied survival probability of at least 50%. This is
  a Phase 10 acceptance blocker.
- **Fail — Interactive affordances.** “I think the styling needs some changing,
  its hard to tell whats clickable and whats just text.” Expected: scenario
  selectors, inspect actions, view controls, and selected/focused states are
  visually distinct. Actual: interactive and static table/card content use
  similar treatments, and the top-option row itself does not provide the
  prototype's scenario-selection behavior. This is a P2 usability defect.
- **Fail — Approved wireframe parity.** “Double check nothing was missed as
  this doesnt look like everything landed.” The ensuing code-to-prototype audit
  confirmed that the data-bearing cores of all three concepts are present,
  but several approved visual and interaction treatments were not integrated
  into the application. The identified gaps are summarized in the closeout
  below and require another focused human re-check after correction.

The second focused Decision Cockpit re-check also failed. The operator
reported that the Top option at every position graphics were hard to see and
read, their alignments were wrong, and their container borders were not
visible enough. The selected position-group control changed its text to white,
which did not read as a useful selected treatment. The operator described the
Cost of waiting one turn graphics as “wrong and or inscrutable.” They observed
the same class of visual problems in the other workspaces and concluded that
the integrated UI remained materially different from the approved wireframe.
These findings keep desktop visual coherence and the redesigned analysis
workspace blocked pending a cohesive cross-view visual-system correction.

The third focused re-check supplied three desktop screenshots and authorized a
complete rewrite of the three presentation surfaces. Exact observations:

- **Position Tiers:** player range charts were not aligned, the graph had no
  numeric axis values, vertical space between players was excessive, and
  players without a tier were still rendered.
- **Decision Cockpit:** player charts did not align by metric column. The
  selected scenario styling and surrounding presentation remained materially
  different from the approved wireframe.
- **Cost of waiting:** every observed row compared the current leader with the
  same named player and displayed `−0.0 PPG`, so the result was either wired to
  the wrong value or too poorly explained to support a decision.
- **Player Lab:** the primary UI did not resemble the approved wireframe; the
  older live shortlist displaced the requested scoring-distribution,
  shared-season, and playing-time visuals.

Reproduction: at desktop width, open Analysis at the locally replayed board
state and select Position Tiers, Decision Cockpit, then Player Lab. Expected:
compact wireframe-aligned rows, labeled numeric axes, explicit breakpoint
values, visibly interactive controls, an interpretable non-fabricated waiting
cost, and Player Lab's three requested visuals as the primary content. Actual:
the screenshots showed collapsed grid layouts, missing axes, excessive row
height, untiered-player output, a same-player `−0.0` wait comparison, and the
legacy Player Lab hierarchy. Severity: **P2 Phase 10 acceptance blocker**
because all three replacement views failed the approved desktop presentation
contract. The operator explicitly approved a cohesive rewrite limited to
these Phase 10 surfaces; Phase 11 remains out of scope.

The fourth focused re-check found that the cohesive rewrite was “much better”
but still left two visualization failures:

- **Cost of waiting one turn:** “the first screenshot of the cost of waiting
  one turn graph shows nothing on the position graphs.” Reproduction: at the
  replayed desktop state, select the Saquon Barkley scenario in Decision
  Cockpit and inspect the QB, WR, and TE rows. Expected: each position has a
  visible, decision-relevant comparison with a clearly named PPG consequence.
  Actual: all rows displayed `0.00` and no visible bar because the current
  implementation compared the top player with a same-tier player whose tier-
  based projection median was identical. Severity: **P2 Phase 10 acceptance
  blocker**. The approved localized correction compares the current top with
  the first player in the next visible tier, plots that tier-cliff PPG gap, and
  presents the supplied chance of current-tier exhaustion as a separate value.
- **Tier runway:** “the second screenshot tier runway also looks wrong, its not
  a 3x3 table view, which it doesnt have to be but it is still not a great
  visual for which turn will run which position.” Reproduction: select Position
  Tiers and inspect the runway below the selected position. Expected: the view
  makes it easy to compare which position may run before each of the next one
  to three turns. Actual: three cards showed only the selected position, and
  the two unavailable later horizons dominated the visual. Severity: **P2
  Phase 10 acceptance blocker**. The approved localized correction uses a
  four-position by three-turn comparison matrix, shows the exact supplied run
  and tier-exhaustion values, and labels unavailable later-turn evidence as
  `Not forecast` without extrapolating it.

The fifth focused re-check recorded two additional observations:

- **Cost-of-waiting coverage / limitation:** “cost of waiting one turn only
  shows a graph for the wr but no modeled tier drop for the other positions
  regardless of which position i choose to draft. is that right?” Reproduction:
  switch among the four draft-choice scenarios in Decision Cockpit and compare
  the remaining position rows. Expected: the view provides a useful waiting
  consequence wherever the replay supplies enough differentiated projection
  evidence. Actual: WR is the only position whose next board/user tier also
  crosses a projection-tier median; QB, RB, and TE retain the same modeled
  median and therefore show `No modeled tier drop`. Code and replay-data
  inspection found this to be mathematically consistent with the supplied
  tier-based projections, not a missing-bar wiring error. It remains a **Phase
  10 data-resolution and usefulness limitation**: this replay cannot support a
  differentiated PPG cost for most positions. The operator accepted this
  disclosed limitation in the final focused approval.
- **Player Lab historical fetch:** “player lab im getting failed to fetch for
  the analysis and player lab history.” Reproduction: in Player Lab, run the
  manual historical request for the selected players; both result areas report
  `Failed to fetch`. Expected: the bounded analysis query and Player Lab
  comparison return historical rows from the local API. Actual: neither failed
  browser request reached the API access log. Direct checks of both endpoints
  returned HTTP 200 with historical rows and the correct
  `http://127.0.0.1:4310` CORS origin. After restarting the dashboard with the
  explicit API host `http://127.0.0.1:5100`, the browser retry reached both
  endpoints and each returned HTTP 200. This was an acceptance-environment
  failure, not a remaining product defect.

### Final focused acceptance

After the dashboard restart and successful manual-history retry, the operator
reported: “ok i think these views are good to go now.” This records a **pass**
for the remediated Decision Cockpit, Position Tiers, and Player Lab desktop
surfaces, including their interaction styling, aligned/labeled comparisons,
waiting-cost presentation, cross-position runway, primary Player Lab visuals,
and manual historical results. It also records acceptance of the disclosed
same-median waiting-cost limitation for the captured replay state.

That focused statement accepted the desktop redesign and its disclosed replay
data limitation. It did not exercise the Phase 10G changes that subsequently
restored visible Player Lab inspection, hardened the three-player floor and
table semantics, corrected the Decision Cockpit selection invariant, and
standardized the Position Tiers alias.

### Phase 10G targeted human acceptance result

The resumed run used the authoritative uncommitted redesign and final Decision
Cockpit semantic-row amendment, the local dashboard at
`http://127.0.0.1:4310`, and the unchanged API at
`http://127.0.0.1:5100`. The human operator owned every result; no automated
test, screenshot, DOM inspection, or browser automation was treated as human
acceptance.

- **Pass — Narrow/mobile Decision Cockpit.**
- **Pass — Narrow/mobile Position Tiers.**
- **Pass — Narrow/mobile Player Lab.** The operator's concise observation for
  all three was: “mobile looks good on all 3 views.” This accepts readable
  labels, controls and selected states, absence of important clipping or
  overlap, intentional horizontal table scrolling, understandable Player Lab
  presentations, and distinguishable interactive controls.
- **Pass — Keyboard workspace navigation.** The operator passed keyboard
  selection of Decision Cockpit, Position Tiers, and Player Lab with visible
  focus, selected state, and matching heading.
- **Pass — Decision Cockpit scenario controls.** Keyboard selection passed and
  the dependent “If you draft” and waiting-cost sections updated coherently.
- **Pass — Position Tiers controls.** QB/RB/WR/TE controls passed keyboard
  activation with clear focus, selection, and updated content.
- **Pass — Player Lab selection controls.** Keyboard position/player controls,
  selected states, the three-player removal floor, and adding/removing a fourth
  player passed.
- **Pass — Visible Player Lab scoring-distribution drawer.** Enter opened the
  drawer, initial focus landed on Close, Escape closed it, and focus returned to
  the exact activating player control.
- **Pass — Remaining non-VoiceOver targeted checks.** When presented with the
  remaining step-by-step checks, the operator concluded: “im over this. this ui
  looks good. we can pass everything except defer voiceover validation features
  for later.” This explicit final judgment records a pass for the season-chart
  Space/visible-Close/focus-return route and for automatic, pinned, newest-only
  pending, apply-on-return, and equivalent-event Position Tiers alias behavior.
  The visible destination, pending banner, and announcement copy use **Position
  Tiers**, never “Realtime positional bests.”
- **Accepted deferred limitation — VoiceOver-specific validation.** The
  operator first skipped Decision Cockpit table navigation, then directed that
  all VoiceOver verification be deferred. VoiceOver table row/column
  relationships and announcement interruption/politeness therefore do not have
  a human pass or failure and must not be represented as WCAG certification.

Confirmed-manual Realtime remains an **environment limitation**, not a pass:
the constrained run did not start a credentialed live draft or mock. The
previously disclosed same-median waiting-cost data-resolution limitation also
remains accepted. No Phase 10 acceptance blocker remains. With the explicit
VoiceOver deferral accepted as non-blocking, the Phase 10 exit gate is
**satisfied**. The accepted redesign and hardening close at annotated milestone
`phase10g-decision-workspace-acceptance-2026-08-12`; Phase 10 is complete.
Phase 11 has not begun.
