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
a future advisor adapter. Existing prediction algorithms and UI components do
not need to know whether predictions came from rules, a fixture, or GPT.

## Current foundation

- `behavior/draft-feed/types.ts` validates both version 1 and legacy extension
  messages.
- `behavior/draft-feed/parsers.ts` converts platform-specific picks to player
  IDs and overall pick numbers.
- `behavior/draft-advisor/types.ts` defines the model-independent adapter.
- `createDraftAdvisorContext.ts` produces a compact snapshot with snake-draft
  ownership, open starter spots, recent picks, and ADP-ranked available players.
- The Flask API has a repository boundary and can start without MongoDB.

## Planned OpenAI Realtime adapter

Use WebRTC from the browser. The dashboard creates an SDP offer and posts it to
a developer-controlled Flask endpoint such as `POST /realtime/session`. That
endpoint combines the SDP and server-owned session configuration, then calls
`POST https://api.openai.com/v1/realtime/calls` using `OPENAI_API_KEY`. The key
must never be included in the dashboard bundle or extension.

Open a WebRTC data channel for Realtime client events. Send a compact
`DraftAdvisorContext` after a new pick or material settings change, with
debouncing so repeated extension snapshots do not trigger repeated inference.
Request text output matching `DraftPickPrediction[]`, validate it, and retain
the last valid prediction if the session reconnects.

OpenAI recommends WebRTC for browser Realtime clients and documents the unified
server-mediated session initialization flow:

- https://developers.openai.com/api/docs/guides/realtime-webrtc
- https://developers.openai.com/api/docs/guides/realtime-conversations

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
3. Add the Flask Realtime session endpoint and browser WebRTC adapter.
4. Add prediction state with cancellation, debounce, reconnect, and stale-data
   handling.
5. Build the upcoming-picks rail and responsive mobile treatment.
6. Run multiple mocks and log predictions versus actual selections for tuning.
