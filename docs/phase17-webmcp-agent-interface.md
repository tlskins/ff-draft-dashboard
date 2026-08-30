# Phase 17: WebMCP agent interface

Status: Phases 17A and 17B are implemented. Phase 17C's deterministic corpus,
evaluator, output budgets, progressive fallback, and production token boundary
are implemented; the production origin is enrolled and configured in Vercel,
while native Chrome and deployed-origin acceptance remain open.

## Objective

Expose a small, semantic Drafty command surface to browser agents so Codex and
other compatible agents can inspect and operate the current workspace without
scraping the full dashboard or reproducing long click sequences. The first
release covers:

- league, scoring, ranking-source, and ADP-source configuration;
- rankings-mode, position, ADP-round, profile, and insight-deck navigation;
- player search across identity, profile outlook, and licensed analyst notes;
- player-profile focus and module selection;
- player targets; and
- bounded custom positional-rank editing and saving.

This phase does not expose drafting a player, deleting profiles, clearing all
targets, importing files, accepting live-advisor proposals, or any Realtime
operation.

## Current WebMCP boundary

The implementation targets the current W3C Web Machine Learning Community
Group draft and Chrome implementation, not older examples based on
`navigator.modelContext` or `provideContext`:

- <https://webmachinelearning.github.io/webmcp/>
- <https://developer.chrome.com/docs/ai/webmcp>
- <https://developer.chrome.com/docs/ai/webmcp/imperative-api>
- <https://developer.chrome.com/docs/ai/webmcp/best-practices>
- <https://developer.chrome.com/docs/ai/webmcp/secure-tools>

Drafty will use the imperative API:

```ts
await document.modelContext.registerTool({
  name: "drafty_search_players",
  title: "Search Drafty players",
  description: "Search the current Drafty player universe and analyst notes.",
  inputSchema: {
    type: "object",
    properties: {query: {type: "string"}},
  },
  annotations: {
    readOnlyHint: true,
    untrustedContentHint: true,
  },
  execute: async (input, {signal}) => {
    // Validate again in Drafty code and return a bounded result.
  },
}, {signal: registrationController.signal})
```

Registration is a progressive enhancement. Unsupported browsers continue to
render and operate Drafty normally. Local Chrome development requires
`chrome://flags/#enable-webmcp-testing`; production use currently requires the
Chrome origin trial that begins with Chrome 149. Drafty does not need a
cross-origin exposure grant: tools stay at the top-level Drafty origin and the
`tools` permissions policy defaults to `self`.

Use the small `webmcp-types` package for draft API typings, but own the React
lifecycle directly. Each registration receives one component-lifetime
`AbortSignal`; invocation cancellation is passed through to bounded async
reads. Do not adopt a second state container or make WebMCP the authority for
application state.

## Tool catalog

The v1 catalog is intentionally small. Tool names are stable and schemas are
closed with `additionalProperties: false`. All player mutations require a
stable player ID returned by search; names are never accepted as write
authority.

| Tool | Class | Purpose |
| --- | --- | --- |
| `drafty_get_workspace` | Read-only | Return compact draft state, settings, sources, board mode, focused/pinned profile, visible insight selections, editability, and sync state. |
| `drafty_search_players` | Read-only, untrusted output | Search name, team, position, ESPN outlook, and analyst-note summaries/evidence; filter by position, team, analyst, note category, target status, and availability. |
| `drafty_configure_workspace` | Reversible UI/profile write | Apply a validated partial league configuration and ranking/ADP sources before the draft starts. |
| `drafty_set_rankings_view` | Reversible UI write | Select position, ADP-round, or targets mode; set visible positions, ADP page, and the ranked-below-ADP filter. |
| `drafty_show_player_profile` | Reversible UI write | Focus or pin a player and select Auto, Draft value, Outlook, or Production; optionally open advanced evidence. |
| `drafty_set_insight_view` | Reversible UI write | Select Auto or a registered insight in Decision/Supporting, pin or restore Auto, and split or expand the slot. |
| `drafty_set_player_target` | Persistent reversible write | Add/update a player's earliest target round, or remove that one target with `target_round: null`. |
| `drafty_start_rank_editing` | Persistent-write preparation | Start/resume a custom board from the current source when ranking edits are legal. |
| `drafty_move_player_rank` | Persistent reversible write | Move one player to a validated positional rank while the custom editor is active. |
| `drafty_save_rank_edits` | Persistent write | Commit the canonical local profile, finish the editor, and report cloud-sync state when authenticated sync is enabled. |

Do not add a generic `drafty_execute` operation or expose one tool per button.
Those designs make tool choice ambiguous and recreate DOM actuation through an
API.

## Search contract

`drafty_search_players` accepts these optional inputs:

```json
{
  "query": "kraft blocking concerns",
  "positions": ["TE"],
  "teams": ["GB"],
  "analysts": ["Christopher Harris"],
  "note_categories": ["bad", "watch"],
  "targeted_only": false,
  "available_only": true,
  "limit": 10
}
```

The deterministic search normalizes case and punctuation and searches player
name, team, position, ESPN outlook, note summary, evidence, counterweight,
practical implication, episode title, and analyst names. It returns at most
eight players and at most two note matches per player, with:

- stable player ID, name, team, and position;
- current positional rank, tier, ADP, availability, target round, and injury
  designation;
- the fields that matched; and
- bounded note snippets with analyst/source, category, publication date, and
  source URL.

External outlook and analyst prose is data, not instructions. The tool is
marked `untrustedContentHint: true`, returns no transcript-sized payloads, and
does not let returned URLs trigger navigation.

## Application integration

WebMCP executors call the same callbacks used by the human interface. They must
never query for a button and click it.

Page-owned commands can be registered once from `pages/index.tsx` through a
`useDraftyWebMcp` hook. The hook receives a memoized command adapter rather than
the entire React tree. Pure validation/search/serialization belongs under
`behavior/webmcp/`; browser registration belongs under `behavior/hooks/`.

Three existing local-state seams must become controlled without changing their
human behavior:

1. Lift `RankingsBoard`'s ADP page and ranked-below-ADP filter to the home page,
   while retaining optional local defaults for fixtures.
2. Lift `DraftDeskProfilePane`'s pinned module and advanced-details state to the
   home page.
3. Give `DraftDeskInsightDeck`/`InsightDeck` a controlled expanded slot and a
   bounded agent command adapter over the existing insight controller. Manual
   selection already pins a registered view; restoring Auto already uses the
   deterministic controller.

Mobile continues to expose only its three rankings workflows to humans. The
page-level tools operate the canonical workspace regardless of viewport, but
profile/insight navigation must return an explicit `not_available_in_layout`
result when its surface is not mounted rather than pretending a hidden view
changed.

## Validation, output, and safety

The current API supplies JSON Schema inputs and hints, but Drafty still owns
runtime validation and authorization:

- validate strictly in executors even if the browser validated the schema;
- reject unknown enum values, unknown player IDs, invalid rounds/ranks, stale
  unavailable players, and changes disallowed after a draft begins;
- support invocation cancellation and avoid network work after cancellation;
- make repeated set operations idempotent;
- return a compact JSON-serializable envelope with `ok`, `code`, `message`,
  and `state` or `result`;
- include before/after evidence for mutations and the actual persistence/sync
  state, never a speculative success message;
- mark all read tools with `readOnlyHint`; mark search/profile text output with
  `untrustedContentHint`;
- do not use `exposedTo` for other origins in v1; and
- never put secrets, tokens, local-storage dumps, full draft history, or full
  analyst corpora in tool results.

The draft does not yet provide a complete portable confirmation or granular
error protocol. Therefore v1 omits destructive and consequential actions
instead of depending on a browser confirmation that may differ by agent.

## Codex compatibility

WebMCP makes compatible browser agents dramatically more efficient, but it is
not the same as a conventional remote/local MCP server. A browser or extension
must discover the tools after loading Drafty. The current Codex browser-control
surface used by this repository does not document WebMCP tool discovery, so
native Codex consumption must be proven rather than assumed.

Acceptance has two layers:

1. Use Chrome's Model Context Tool Inspector extension and the WebMCP testing
   flag to enumerate and manually invoke every tool locally.
2. Run the same natural-language task corpus through Codex when its selected
   browser surface exposes WebMCP discovery. If it does not, retain the same
   pure Drafty command adapter for a later conventional MCP bridge; do not fork
   business logic or fall back to DOM scraping inside the WebMCP tools.

## Implementation slices

### 17A: foundation, read, and navigation

- add draft typings, feature detection, registration lifecycle, and a local
  inspector status diagnostic;
- implement workspace state and bounded player/note search;
- implement settings, rankings view, profile focus/module, and insight-slot
  navigation after lifting the three controlled-state seams;
- add pure contract tests, registration lifecycle tests, unsupported-browser
  tests, and integrated state-transition tests.

Exit: the inspector enumerates the expected stable tools; read/search results
are bounded and accurate; every navigation/configuration call visibly updates
the same human UI; unsupported browsers are unchanged.

Implementation result: Drafty now progressively registers five page-owned
tools plus the insight-deck tool. The page exposes compact registration status
and tool-count diagnostics, strict input validation, cancellation-aware
execution, bounded player/outlook/note search, pre-draft configuration, shared
rankings paging/filter state, controlled profile modules, and controlled
insight selection/expansion. Unsupported browsers register zero tools and keep
the ordinary UI unchanged. Pure/lifecycle and affected-view regressions pass;
the full dashboard gate passes 133 suites and 842 tests, lint, TypeScript, and
the optimized static build. Native Chrome inspector enumeration remains the
17C browser acceptance boundary because the available in-app browser does not
currently expose `document.modelContext`.

### 17B: rankings and target writes

- implement single-player target add/update/remove;
- implement start, move, and save ranking commands over the canonical profile;
- preserve live-draft edit locks and local/cloud profile ownership;
- add reload and cross-device sync regressions.

Exit: an agent can search for a player, target them, move their positional
rank, save, reload, and observe the same canonical result on desktop/mobile;
no bulk clear, destructive, or draft-pick action is exposed.

Implementation result: four additional page-owned tools add/update/remove one
player target, safely start or resume custom rank editing, move one player to a
validated rank within their position, and commit/finish the custom board.
Targets reuse the persisted target store and authenticated profile sync. Rank
saves reuse the canonical profile-v2 browser commit, which then participates
in the same authenticated cloud reconciliation. Rank edits remain locked after
any drafted or purged player; unavailable players cannot be newly targeted;
active edits cannot silently switch their copied source; and an empty Custom
source cannot initialize a board. Workspace reads now report hydration, local
profile, authentication, and cloud-sync state without exposing credentials.
The full dashboard gate passes 133 suites and 844 tests, lint, TypeScript, and
the optimized static build.

### 17C: agent eval and production trial

- enable the local flag and inspector; enroll the Vercel origin in the Chrome
  trial before production WebMCP acceptance;
- test concise natural-language journeys for configuration, view control,
  analyst-note lookup, target edits, and rank edits;
- measure task success, wrong-tool calls, retries, tool-call count, result
  bytes, and human-visible state agreement;
- run ordinary browser regressions to prove progressive enhancement.

Exit: the tool corpus is reliable and materially cheaper than DOM actuation,
and any Codex browser-support limitation is recorded explicitly.

Implementation result: six natural-language journeys and a trace evaluator now
measure task completion, wrong tools, ordering, retries, result bytes, and
human-visible state agreement. Search payloads were tightened to eight players,
two notes per player, and 180-character note fields; automated catalog and byte
budgets pass. The page can inject a bounded first-party origin-trial token from
`NEXT_PUBLIC_WEBMCP_ORIGIN_TRIAL_TOKEN` without committing the token. Controlled
Initial Chrome probing passed the unsupported-browser fallback while the
testing flag was disabled. See `docs/phase17c-webmcp-acceptance.md` for the
evidence, run format, and remaining origin registration, deployment, and
live-agent gates.
The expanded implementation gate passes 135 suites and 850 tests, TypeScript,
lint, the evaluator contract, and the optimized production build.

After the testing flag was enabled and Chrome 150 relaunched, the current Codex
Chrome-control surface could reconnect and identify the Drafty tab but exposed
no WebMCP discovery/invocation capability; bounded page inspection also timed
out with the flag active. The native corpus therefore remains pending through
Chrome's Model Context Tool Inspector or a compatible agent surface.
