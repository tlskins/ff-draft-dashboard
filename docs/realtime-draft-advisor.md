# Realtime draft advisor architecture

## Goal

Predict the most likely players selected in the next several picks using team
needs, roster construction, ADP, and recent draft behavior, while keeping the
draft board usable if the model or API is unavailable.

## Data flow

```text
ESPN / NFL page
  -> Chrome content script (full draft snapshot)
  -> extension service worker (fan-out transport)
  -> dashboard draft-feed normalizer
  -> local draft state
  -> createDraftAdvisorContext
  -> DraftAdvisor adapter
  -> prediction state
  -> upcoming-picks UX
```

The feed and advisor use separate versioned contracts. Platform DOM changes
stay inside the extension/parser layer. Model prompts and transport stay inside
the Realtime adapter. Existing prediction algorithms and UI components do not
need to know whether predictions came from rules, a fixture, or GPT.

## Current foundation

- `behavior/draft-feed/types.ts` validates both version 1 and legacy extension
  messages.
- `behavior/draft-feed/parsers.ts` converts platform-specific picks to player
  IDs and overall pick numbers.
- `behavior/draft-advisor/types.ts` defines the model-independent adapter.
- `createDraftAdvisorContext.ts` produces a compact snapshot with snake-draft
  ownership, open starter spots, recent picks, and ADP-ranked available players.
- `opponentModel.ts` deterministically combines ADP, open starter needs, and
  recent positional momentum into normalized opponent-pick probabilities.
- The model exposes exact positional-run probabilities and configured
  user-tier crossing risk and is replayed against ADP-only and need-only
  baselines before its evidence reaches live recommendations.
- `completedDraftReplay.ts` replays recorded opponent selections, substitutes
  counterfactual user strategies at snake-draft turns, and scores final roster
  legality, completeness, starter value, replacement value, bench ceiling
  above replacement,
  rank-order faithfulness, and decision latency.
- Accepted live draft sessions serialize versioned recommendation and opponent
  forecast snapshots to the Flask API. OpenAPI-generated types preserve the
  calculation evidence across the boundary; the API stores and synchronizes
  outputs but does not duplicate the TypeScript calculation engine.
- Completed live drafts expose an export action that creates a validated,
  portable replay fixture. Fixture provenance is explicit; synthetic regression
  scenarios cannot satisfy the recorded calibration threshold.
- The Flask API has a repository boundary and can start without MongoDB.
- `behavior/realtime/contracts.ts` defines the versioned tools, proposals, and
  draft-plan document using OpenAPI-generated boundary types.
- `behavior/realtime/proposals.ts` requires an exact confirmation, rejects
  ambiguous speech, and marks proposals stale when a new draft event arrives.
- `behavior/realtime/storage.ts` keeps the confirmed plan local to the current
  draft session.
- `behavior/realtime/transport.ts` provides a deterministic in-memory transport
  for UI and regression tests before a live model connection is required.
- `behavior/realtime/webrtcTransport.ts` establishes browser WebRTC data and
  audio paths using the short-lived client secret. Voice mode attaches one
  local microphone track, plays the remote stream, and maps audio transcripts
  into the same visible conversation used by text mode.
- `behavior/realtime/toolDispatcher.ts` validates every model tool call,
  returns bounded deterministic evidence, and converts write-like calls into
  unconfirmed proposals.
- `useRealtimeConversation.ts` owns the explicit connection, transcript, and
  tool-result loop. It retries a previously healthy connection at 0.5, 1.5,
  and 4 seconds, then fails back to the deterministic advisor. Initial
  configuration or authentication failures are not retried. It also preserves
  the selected mode and mute preference across automatic reconnects.
- `eventAdvice.ts` deterministically gates automatic prompts. It reacts only
  when the user crosses the three-pick or on-clock boundary, tier risk crosses
  60%, positional-run risk crosses 55%, or the preferred player changes within
  five picks. Normal prompts have a two-event cooldown; on-clock alerts bypass
  it.

## OpenAI Realtime session boundary

Use WebRTC from the browser. The dashboard first sends only its draft session
ID and requested interaction mode to
`POST /v1/realtime/client-secrets`. Flask verifies that the draft session
exists and creates a short-lived client secret by calling
`POST https://api.openai.com/v1/realtime/client_secrets` with the server-held
`OPENAI_API_KEY`. Model, voice, instructions, and tool definitions remain
server-owned. The standard API key must never be included in the dashboard
bundle or extension.

The browser adapter uses the returned ephemeral secret to post its SDP offer
directly to `POST https://api.openai.com/v1/realtime/calls`, applies the SDP
answer, and opens the `oai-events` data channel. Text prompts are added with
`conversation.item.create`, followed by `response.create`. Streamed text is
rendered from output-text events. In voice mode the browser requests microphone
permission, adds the audio track to the peer connection, plays the remote media
stream, and renders output-audio transcript events. Disconnect stops every
local media track and clears the playback element.

The server configures `server_vad` with automatic response creation and
interruption. Speech-start and speech-stop events drive the visible
Listening/Drafty-speaking state. When the user speaks over an answer, OpenAI's
WebRTC session cancels and truncates unplayed audio; the dashboard marks the
partial transcript stopped instead of sending a redundant cancellation event.
The user can mute or unmute the local track at any time.

Sending a new prompt or pressing **Stop response** sends `response.cancel`
when a response is active. Partial text remains visible and is labeled
stopped. An unexpected disconnect creates a fresh client secret and WebRTC
session using bounded backoff. Draft state and the visible transcript stay
local, while the UI explicitly notes that the model conversation restarted.

The app retains the latest compact `DraftAdvisorContext` outside the Realtime
session. Tools read that current snapshot at execution time, so a pick that
arrives during a conversation cannot make the model's older conversational
description authoritative.

Tool execution remains application-owned. Read tools may retrieve deterministic
draft state, recommendations, and player comparisons. Write-like tools can only
create an analysis-view or draft-plan proposal. After validating a tool call,
the dashboard returns a `function_call_output` item and asks the model to
continue. A proposal cannot change the visible analysis view or persisted plan
until the user explicitly accepts it; an intervening pick makes it stale.

OpenAI recommends WebRTC for browser Realtime clients and documents ephemeral
client secrets and application-owned function calling:

- https://developers.openai.com/api/docs/guides/realtime-webrtc
- https://developers.openai.com/api/docs/guides/realtime-conversations
- https://developers.openai.com/api/docs/guides/realtime-mcp
- https://developers.openai.com/api/reference/resources/realtime/subresources/client_secrets

## UX direction

Add an “Upcoming picks” rail adjacent to the existing board:

- One card per upcoming roster/pick, showing the roster's two strongest needs.
- Two or three candidate players with probability, ADP, and a short reason.
- Clear states for connecting, live, stale, and deterministic fallback.
- Visually distinguish GPT estimates from the existing mathematical
  availability forecast.
- Never auto-draft or mutate draft history from a prediction.

## Implementation sequence

1. Add deterministic and recorded-fixture `DraftAdvisor` implementations.
2. Add contract tests and evaluate prediction quality against completed mocks.
3. Add the Flask client-secret broker, typed tools, confirmation protocol,
   local plan, and mock transport.
4. Add the browser WebRTC adapter and application-owned tool dispatcher.
5. Add explicit-connect text interaction, streaming output, and safe
   unavailable/error states.
6. Add bounded automatic reconnect, response cancellation, and deterministic
   low-interruption draft-event prompting.
7. Add selectable voice mode, media lifecycle, and interruption policy.
8. Build the upcoming-picks rail and responsive mobile treatment.
9. Run multiple mocks and log predictions versus actual selections for tuning.
